import { beforeEach, describe, expect, it } from "vitest";

import type { RegisterInput } from "@/domain/input-schemas";
import { ConflictError } from "@/lib/errors";
import { hashSessionToken, SESSION_IDLE_MS } from "@/server/auth/session-token";
import { createRegistryDatabase, type RegistryDatabase } from "@/server/db/app-client";
import { profiles } from "@/server/db/app-schema";
import { ProfileRepository } from "@/server/repositories/profile-repository";
import { SessionRepository } from "@/server/repositories/session-repository";

import {
  AuthService,
  INVALID_CREDENTIALS_MESSAGE,
  LOCKED_OUT_MESSAGE,
  type SignedIn,
} from "./auth-service";

const PASSWORD = "a long enough password";

const newUser = (overrides: Partial<RegisterInput> = {}): RegisterInput => ({
  username: "Ada",
  password: PASSWORD,
  confirmPassword: PASSWORD,
  firstName: "Ada",
  lastName: "Lovelace",
  targetRole: "Backend engineer",
  experienceLevel: "senior",
  interests: ["Databases", "Go"],
  ...overrides,
});

function signedIn(outcome: Awaited<ReturnType<AuthService["login"]>>): SignedIn {
  if (outcome.kind !== "signed-in") throw new Error(`expected sign-in, got ${outcome.kind}`);
  return outcome.signedIn;
}

describe("AuthService", () => {
  let registry: RegistryDatabase;
  let now: Date;
  let created: string[];
  let auth: AuthService;

  beforeEach(() => {
    registry = createRegistryDatabase(":memory:");
    now = new Date("2026-11-03T10:00:00Z");
    created = [];
    auth = new AuthService(registry, {
      profilesDir: "./data/profiles",
      initDatabase: (filePath) => created.push(filePath),
      now: () => now,
    });
  });

  const sessionCount = (profileId: string) =>
    new SessionRepository(registry).countForProfile(profileId);

  it("registers a profile with its own database and signs it in", async () => {
    const { profile, token } = await auth.register(newUser());

    expect(profile).toMatchObject({
      username: "Ada",
      usernameKey: "ada",
      firstName: "Ada",
      interests: ["Databases", "Go"],
      experienceLevel: "senior",
    });
    expect(profile.dbPath).toBe(`data/profiles/${profile.id}/learning-assistant.db`);
    expect(created).toEqual([profile.dbPath]);
    expect(profile.passwordHash).toMatch(/^scrypt\$/);
    expect(profile.dekWrapped).toBeTruthy();
    expect(auth.resolveSession(token)?.profile.id).toBe(profile.id);
  });

  it("stores only the hash of the session token", async () => {
    const { token } = await auth.register(newUser());
    const raw = JSON.stringify(registry.$client.prepare("SELECT * FROM sessions").all());
    expect(raw).not.toContain(token);
    expect(raw).toContain(hashSessionToken(token));
  });

  it("rejects a username that is taken, ignoring case", async () => {
    await auth.register(newUser());
    await expect(auth.register(newUser({ username: "ADA" }))).rejects.toBeInstanceOf(ConflictError);
  });

  it("signs in with the right password, and returns the same data key", async () => {
    const first = await auth.register(newUser());
    const second = signedIn(await auth.login({ username: "ada", password: PASSWORD }));

    expect(second.token).not.toBe(first.token);
    const dekA = auth.resolveSession(first.token)?.dek;
    const dekB = auth.resolveSession(second.token)?.dek;
    expect(dekA && dekB && dekA.equals(dekB)).toBe(true);
  });

  it("gives the same generic error for a wrong password and an unknown user", async () => {
    await auth.register(newUser());
    await expect(auth.login({ username: "ada", password: "wrong password!" })).rejects.toThrow(
      INVALID_CREDENTIALS_MESSAGE,
    );
    await expect(auth.login({ username: "nobody", password: PASSWORD })).rejects.toThrow(
      INVALID_CREDENTIALS_MESSAGE,
    );
  });

  it("locks a username for 60 s after 5 failures", async () => {
    await auth.register(newUser());
    for (let attempt = 0; attempt < 5; attempt++) {
      await expect(auth.login({ username: "ada", password: "wrong" })).rejects.toThrow(
        INVALID_CREDENTIALS_MESSAGE,
      );
    }
    await expect(auth.login({ username: "Ada", password: PASSWORD })).rejects.toThrow(
      LOCKED_OUT_MESSAGE,
    );

    now = new Date(now.getTime() + 61_000);
    expect(
      signedIn(await auth.login({ username: "ada", password: PASSWORD })).profile.username,
    ).toBe("Ada");
  });

  it("asks a profile without a password to set one, once", async () => {
    new ProfileRepository(registry).insert({
      id: "legacy",
      username: "sdhiren",
      usernameKey: "sdhiren",
      firstName: "Dhirendra",
      lastName: "Singh",
      dbPath: "./data/learning-assistant.db",
      createdAt: now,
    });

    await expect(auth.login({ username: "sdhiren", password: "" })).resolves.toEqual({
      kind: "set-password",
    });
    const { token } = await auth.setInitialPassword({
      username: "sdhiren",
      password: PASSWORD,
      confirmPassword: PASSWORD,
    });
    expect(auth.resolveSession(token)?.profile.username).toBe("sdhiren");

    await expect(
      auth.setInitialPassword({
        username: "sdhiren",
        password: "someone else's pass",
        confirmPassword: "someone else's pass",
      }),
    ).rejects.toThrow(/already has a password/);
    expect(
      signedIn(await auth.login({ username: "sdhiren", password: PASSWORD })).token,
    ).toBeTruthy();
  });

  it("slides sessions over 30 idle days and expires them after", async () => {
    const { token } = await auth.register(newUser());

    now = new Date(now.getTime() + SESSION_IDLE_MS - 1000);
    expect(auth.resolveSession(token)).not.toBeNull();

    now = new Date(now.getTime() + SESSION_IDLE_MS - 1000);
    expect(auth.resolveSession(token)).not.toBeNull();

    now = new Date(now.getTime() + SESSION_IDLE_MS + 1);
    expect(auth.resolveSession(token)).toBeNull();
    expect(auth.resolveSession(token)).toBeNull();
  });

  it("purges expired sessions", async () => {
    await auth.register(newUser());
    now = new Date(now.getTime() + SESSION_IDLE_MS + 1);
    expect(auth.purgeExpiredSessions()).toBe(1);
  });

  it("deletes the session on logout", async () => {
    const { token } = await auth.register(newUser());
    auth.logout(token);
    expect(auth.resolveSession(token)).toBeNull();
  });

  it("rejects unknown and tampered tokens", async () => {
    const { token } = await auth.register(newUser());
    expect(auth.resolveSession("not-a-token")).toBeNull();
    expect(auth.resolveSession(`${token}x`)).toBeNull();
  });

  it("changes the password, keeps the data key and revokes other sessions", async () => {
    const { profile, token: current } = await auth.register(newUser());
    const other = signedIn(await auth.login({ username: "ada", password: PASSWORD })).token;
    const session = auth.resolveSession(current)!;

    const newPassword = "a different long password";
    await expect(
      auth.changePassword(session, { currentPassword: "wrong one!", password: newPassword }),
    ).rejects.toThrow(/current password is wrong/);
    await auth.changePassword(session, { currentPassword: PASSWORD, password: newPassword });

    expect(auth.resolveSession(other)).toBeNull();
    expect(auth.resolveSession(current)?.dek.equals(session.dek)).toBe(true);
    await expect(auth.login({ username: "ada", password: PASSWORD })).rejects.toThrow(
      INVALID_CREDENTIALS_MESSAGE,
    );
    const again = signedIn(await auth.login({ username: "ada", password: newPassword }));
    expect(auth.resolveSession(again.token)?.dek.equals(session.dek)).toBe(true);
    expect(sessionCount(profile.id)).toBe(2);
  });

  it("resets a password from the CLI with a new data key and no sessions", async () => {
    const { profile, token } = await auth.register(newUser());
    const oldDek = auth.resolveSession(token)!.dek;

    await auth.resetPassword("ADA", "a reset long password");

    expect(auth.resolveSession(token)).toBeNull();
    expect(sessionCount(profile.id)).toBe(0);
    const fresh = signedIn(
      await auth.login({ username: "ada", password: "a reset long password" }),
    );
    expect(auth.resolveSession(fresh.token)?.dek.equals(oldDek)).toBe(false);
  });

  it("never stores the password or data key in plaintext", async () => {
    const { token } = await auth.register(newUser());
    const dek = auth.resolveSession(token)!.dek;
    const dump = JSON.stringify([
      registry.select().from(profiles).all(),
      registry.$client.prepare("SELECT * FROM sessions").all(),
    ]);
    expect(dump).not.toContain(PASSWORD);
    expect(dump).not.toContain(dek.toString("base64"));
    expect(dump).not.toContain(dek.toString("hex"));
  });
});
