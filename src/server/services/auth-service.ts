import "server-only";

import { randomUUID } from "node:crypto";
import path from "node:path";

import type { LoginInput, RegisterInput, SetInitialPasswordInput } from "@/domain/input-schemas";
import { AppError, ConflictError } from "@/lib/errors";
import { DUMMY_HASH, hashPassword, verifyPassword } from "@/server/auth/password";
import { createSessionToken, hashSessionToken, SESSION_IDLE_MS } from "@/server/auth/session-token";
import {
  deriveKek,
  deriveSessionKey,
  generateDataKey,
  generateSalt,
  unwrapKey,
  wrapKey,
} from "@/server/crypto/secret-box";
import type { RegistryDatabase } from "@/server/db/app-client";
import type { ProfileRow } from "@/server/db/app-schema";
import { ProfileRepository } from "@/server/repositories/profile-repository";
import { SessionRepository } from "@/server/repositories/session-repository";

/** The same message for an unknown username and a wrong password. */
export const INVALID_CREDENTIALS_MESSAGE = "That username and password don't match.";
export const LOCKED_OUT_MESSAGE = "Too many failed attempts. Wait a minute and try again.";

const MAX_FAILURES = 5;
const LOCKOUT_MS = 60_000;

export interface AuthServiceOptions {
  /** New profiles get `<profilesDir>/<id>/learning-assistant.db`. */
  profilesDir: string;
  /** Creates and migrates a new profile's database. */
  initDatabase: (filePath: string) => void;
  now?: () => Date;
}

/** A signed-in request: the profile and its unwrapped data key. */
export interface ResolvedSession {
  profile: ProfileRow;
  tokenHash: string;
  /** Decrypts this profile's secrets. Keep it in memory only. */
  dek: Buffer;
}

export interface SignedIn {
  profile: ProfileRow;
  /** The raw token for the cookie. Never store or log it. */
  token: string;
}

export type LoginOutcome = { kind: "signed-in"; signedIn: SignedIn } | { kind: "set-password" };

/** Registration, sign-in, sessions and passwords. Works on the registry only. */
export class AuthService {
  private readonly profiles: ProfileRepository;
  private readonly sessions: SessionRepository;
  private readonly now: () => Date;
  private readonly failures = new Map<string, { count: number; lockedUntil: number }>();

  constructor(
    registry: RegistryDatabase,
    private readonly options: AuthServiceOptions,
  ) {
    this.profiles = new ProfileRepository(registry);
    this.sessions = new SessionRepository(registry);
    this.now = options.now ?? (() => new Date());
  }

  async register(input: RegisterInput): Promise<SignedIn> {
    if (this.profiles.findByUsername(input.username)) {
      throw new ConflictError("That username is taken. Choose another.");
    }

    const id = randomUUID();
    const dek = generateDataKey();
    const credentials = await this.credentialsFor(input.password, dek);
    const dbPath = path.join(this.options.profilesDir, id, "learning-assistant.db");
    this.options.initDatabase(dbPath);

    try {
      this.profiles.insert({
        id,
        username: input.username,
        usernameKey: input.username.toLowerCase(),
        firstName: input.firstName,
        lastName: input.lastName,
        targetRole: input.targetRole,
        experienceLevel: input.experienceLevel,
        interests: input.interests,
        dbPath,
        createdAt: this.now(),
        ...credentials,
      });
    } catch (error) {
      // Lost a race with another registration for the same name.
      if (this.profiles.findByUsername(input.username)) {
        throw new ConflictError("That username is taken. Choose another.", { cause: error });
      }
      throw error;
    }

    return { profile: this.requireProfile(id), token: this.createSession(id, dek) };
  }

  /**
   * Checks a username and password. A profile with no password yet (the
   * upgraded `sdhiren`) asks for one to be set instead. Wrong credentials get
   * one generic error, and 5 failures lock the username for a minute.
   */
  async login(input: LoginInput): Promise<LoginOutcome> {
    const key = input.username.toLowerCase();
    this.assertNotLockedOut(key);

    const profile = this.profiles.findByUsername(key);
    if (profile && profile.passwordHash === null) return { kind: "set-password" };

    const valid = await verifyPassword(input.password, profile?.passwordHash ?? (await DUMMY_HASH));
    if (!profile || !valid) {
      this.recordFailure(key);
      throw new AppError(INVALID_CREDENTIALS_MESSAGE);
    }

    this.failures.delete(key);
    const dek = await this.unwrapWithPassword(profile, input.password);
    return { kind: "signed-in", signedIn: this.signIn(profile, dek) };
  }

  /** Sets the first password of a profile that has none, then signs in. Only works once. */
  async setInitialPassword(input: SetInitialPasswordInput): Promise<SignedIn> {
    const profile = this.profiles.findByUsername(input.username);
    if (!profile || profile.passwordHash !== null) {
      throw new AppError("This profile already has a password. Sign in instead.");
    }

    const dek = generateDataKey();
    this.profiles.setPassword(profile.id, await this.credentialsFor(input.password, dek));
    return this.signIn(this.requireProfile(profile.id), dek);
  }

  /**
   * Changes the password of a signed-in profile. The data key is re-wrapped,
   * so saved secrets are kept. Every other session is signed out.
   */
  async changePassword(
    session: ResolvedSession,
    input: { currentPassword: string; password: string },
  ): Promise<void> {
    const profile = this.requireProfile(session.profile.id);
    if (
      !profile.passwordHash ||
      !(await verifyPassword(input.currentPassword, profile.passwordHash))
    ) {
      throw new AppError("Your current password is wrong.");
    }
    this.profiles.setPassword(profile.id, await this.credentialsFor(input.password, session.dek));
    this.sessions.deleteForProfile(profile.id, session.tokenHash);
  }

  /**
   * Forgotten-password reset from the terminal. The old data key can't be
   * recovered without the old password, so a new one is made and every
   * session is signed out. Callers must also delete the profile's secrets.
   */
  async resetPassword(username: string, password: string): Promise<ProfileRow> {
    const profile = this.profiles.findByUsername(username);
    if (!profile) throw new AppError(`No profile named ${username}.`);
    this.profiles.setPassword(profile.id, await this.credentialsFor(password, generateDataKey()));
    this.sessions.deleteForProfile(profile.id);
    this.failures.delete(profile.usernameKey);
    return this.requireProfile(profile.id);
  }

  /** The profile behind a raw session token, sliding its expiry. Null if unknown or expired. */
  resolveSession(token: string): ResolvedSession | null {
    const tokenHash = hashSessionToken(token);
    const session = this.sessions.find(tokenHash);
    if (!session) return null;

    const now = this.now();
    if (session.expiresAt.getTime() <= now.getTime()) {
      this.sessions.delete(tokenHash);
      return null;
    }

    const profile = this.profiles.findById(session.profileId);
    if (!profile) return null;

    let dek: Buffer;
    try {
      dek = unwrapKey(deriveSessionKey(token), session.dekWrapped);
    } catch {
      this.sessions.delete(tokenHash);
      return null;
    }

    this.sessions.extend(tokenHash, new Date(now.getTime() + SESSION_IDLE_MS));
    return { profile, tokenHash, dek };
  }

  logout(token: string): void {
    this.sessions.delete(hashSessionToken(token));
  }

  purgeExpiredSessions(): number {
    return this.sessions.deleteExpired(this.now());
  }

  private signIn(profile: ProfileRow, dek: Buffer): SignedIn {
    this.profiles.recordLogin(profile.id, this.now());
    return { profile, token: this.createSession(profile.id, dek) };
  }

  private createSession(profileId: string, dek: Buffer): string {
    const token = createSessionToken();
    const now = this.now();
    this.sessions.insert({
      tokenHash: hashSessionToken(token),
      profileId,
      dekWrapped: wrapKey(deriveSessionKey(token), dek),
      createdAt: now,
      expiresAt: new Date(now.getTime() + SESSION_IDLE_MS),
    });
    return token;
  }

  /** A password hash plus the data key wrapped by a key derived from that password. */
  private async credentialsFor(password: string, dek: Buffer) {
    const kekSalt = generateSalt();
    const [passwordHash, kek] = await Promise.all([
      hashPassword(password),
      deriveKek(password, kekSalt),
    ]);
    return { passwordHash, kekSalt: kekSalt.toString("base64"), dekWrapped: wrapKey(kek, dek) };
  }

  private async unwrapWithPassword(profile: ProfileRow, password: string): Promise<Buffer> {
    if (!profile.kekSalt || !profile.dekWrapped) {
      // A password set without a data key (shouldn't happen): give it one now.
      const dek = generateDataKey();
      this.profiles.setPassword(profile.id, await this.credentialsFor(password, dek));
      return dek;
    }
    const kek = await deriveKek(password, Buffer.from(profile.kekSalt, "base64"));
    return unwrapKey(kek, profile.dekWrapped);
  }

  private assertNotLockedOut(key: string): void {
    const entry = this.failures.get(key);
    if (entry && entry.lockedUntil > this.now().getTime()) {
      throw new AppError(LOCKED_OUT_MESSAGE);
    }
  }

  private recordFailure(key: string): void {
    const entry = this.failures.get(key) ?? { count: 0, lockedUntil: 0 };
    entry.count += 1;
    if (entry.count >= MAX_FAILURES) {
      entry.count = 0;
      entry.lockedUntil = this.now().getTime() + LOCKOUT_MS;
    }
    this.failures.set(key, entry);
  }

  private requireProfile(id: string): ProfileRow {
    const profile = this.profiles.findById(id);
    if (!profile) throw new AppError("That profile no longer exists.");
    return profile;
  }
}
