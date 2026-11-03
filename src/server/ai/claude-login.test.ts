import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/errors";
import { logger } from "@/server/logger";

import { ClaudeLoginFlow, parseAuthStatus, SIGN_IN_FAILED_MESSAGE } from "./claude-login";

const SIGN_IN_URL = "https://claude.ai/oauth/authorize?code=true&state=SENTINEL_STATE";
const EMAIL = "sentinel-user@example.com";

/**
 * A stand-in for the `claude` CLI: `auth login` prints a sign-in URL and
 * waits for a code ("good-code" logs in); `auth status` prints JSON;
 * `auth logout` removes the credential. Each run records its env.
 */
const FAKE_CLI = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const dir = process.env.CLAUDE_CONFIG_DIR;
const creds = path.join(dir, ".credentials.json");
const [, , group, command] = process.argv;
fs.writeFileSync(path.join(dir, "..", "env-" + command + ".json"), JSON.stringify(process.env));
if (group !== "auth") process.exit(2);
if (command === "login") {
  if (process.env.FAKE_HANG === "1") { setInterval(() => {}, 1000); return; }
  process.stdout.write("Opening browser... If it didn't open, visit:\\n${SIGN_IN_URL}\\nPaste code here: ");
  let input = "";
  process.stdin.on("data", (chunk) => {
    input += chunk;
    if (!input.includes("\\n")) return;
    if (input.trim() === "good-code") { fs.writeFileSync(creds, "{}"); process.exit(0); }
    process.exit(1);
  });
} else if (command === "status") {
  if (fs.existsSync(creds)) {
    console.log(JSON.stringify({ loggedIn: true, authMethod: "claude.ai", email: "${EMAIL}", subscriptionType: "max" }));
  } else {
    console.log(JSON.stringify({ loggedIn: false }));
    process.exit(1);
  }
} else if (command === "logout") {
  fs.rmSync(creds, { force: true });
}
`;

describe("ClaudeLoginFlow", () => {
  let root: string;
  let cliPath: string;
  let flow: ClaudeLoginFlow;
  const configDirFor = (profileId: string) => path.join(root, profileId, "claude");
  const envOf = (profileId: string, command: string) =>
    JSON.parse(readFileSync(path.join(root, profileId, `env-${command}.json`), "utf8")) as Record<
      string,
      string
    >;

  const makeFlow = (baseEnv: Record<string, string | undefined> = {}, flowTimeoutMs?: number) =>
    new ClaudeLoginFlow({
      cliPath,
      configDirFor,
      baseEnv: { PATH: process.env.PATH, ...baseEnv },
      flowTimeoutMs,
    });

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "la-claude-login-"));
    cliPath = path.join(root, "fake-claude");
    writeFileSync(cliPath, FAKE_CLI);
    chmodSync(cliPath, 0o755);
    flow = makeFlow();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  it("returns the sign-in URL, then verifies the code with auth status", async () => {
    const { flowId, url } = await flow.start("alice");
    expect(url).toBe(SIGN_IN_URL);
    expect(statSync(configDirFor("alice")).mode & 0o777).toBe(0o700);

    const status = await flow.complete("alice", flowId, "good-code");
    expect(status).toEqual({ loggedIn: true, subscription: true, email: EMAIL, plan: "max" });
    expect(existsSync(path.join(configDirFor("alice"), ".credentials.json"))).toBe(true);
  });

  it("gives each profile its own config dir and passes no keys or inherited token", async () => {
    flow = makeFlow({
      ANTHROPIC_API_KEY: "sk-ant-SENTINEL",
      CLAUDE_CODE_OAUTH_TOKEN: "sk-ant-oat-SENTINEL",
      OPENAI_API_KEY: "sk-SENTINEL",
    });
    const alice = await flow.start("alice");
    await flow.complete("alice", alice.flowId, "good-code");
    const bob = await flow.start("bob");
    await flow.complete("bob", bob.flowId, "good-code");

    const env = envOf("alice", "login");
    expect(env.CLAUDE_CONFIG_DIR).toBe(configDirFor("alice"));
    expect(envOf("bob", "login").CLAUDE_CONFIG_DIR).toBe(configDirFor("bob"));
    expect(env).not.toHaveProperty("ANTHROPIC_API_KEY");
    expect(env).not.toHaveProperty("CLAUDE_CODE_OAUTH_TOKEN");
    expect(env).not.toHaveProperty("OPENAI_API_KEY");
    expect(envOf("alice", "status").CLAUDE_CONFIG_DIR).toBe(configDirFor("alice"));
  });

  it("fails on a bad code and leaves no login behind", async () => {
    const { flowId } = await flow.start("alice");
    await expect(flow.complete("alice", flowId, "bad-code")).rejects.toThrow(
      SIGN_IN_FAILED_MESSAGE,
    );
    expect(existsSync(configDirFor("alice"))).toBe(false);
  });

  it("rejects a flow id from another profile or a replaced flow", async () => {
    const first = await flow.start("alice");
    const second = await flow.start("alice");
    await expect(flow.complete("alice", first.flowId, "good-code")).rejects.toBeInstanceOf(
      AppError,
    );
    await expect(flow.complete("bob", second.flowId, "good-code")).rejects.toBeInstanceOf(AppError);
    expect(flow.hasPendingFlow("alice")).toBe(true);
  });

  it("times out a pending flow and wipes the config dir", async () => {
    flow = makeFlow({}, 50);
    const { flowId } = await flow.start("alice");
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(flow.hasPendingFlow("alice")).toBe(false);
    expect(existsSync(configDirFor("alice"))).toBe(false);
    await expect(flow.complete("alice", flowId, "good-code")).rejects.toBeInstanceOf(AppError);
  });

  it("logout runs auth logout and removes the dir", async () => {
    const { flowId } = await flow.start("alice");
    await flow.complete("alice", flowId, "good-code");
    await flow.logout("alice");
    expect(existsSync(configDirFor("alice"))).toBe(false);
    expect((await flow.status("alice")).loggedIn).toBe(false);
  });

  it("never logs what the CLI prints", async () => {
    const spies = (["info", "warn", "error"] as const).map((level) =>
      vi.spyOn(logger, level).mockImplementation(() => undefined),
    );
    const { flowId } = await flow.start("alice");
    await flow.complete("alice", flowId, "good-code");
    const logged = JSON.stringify(spies.map((spy) => spy.mock.calls));
    expect(logged).not.toContain("SENTINEL_STATE");
    expect(logged).not.toContain(EMAIL);
    expect(logged).not.toContain("good-code");
  });
});

describe("parseAuthStatus", () => {
  it("reads the JSON form", () => {
    expect(
      parseAuthStatus('{"loggedIn":true,"authMethod":"api_key","email":"a@b.co"}', 0),
    ).toMatchObject({ loggedIn: true, subscription: false, email: "a@b.co" });
  });

  it("falls back to the text form", () => {
    expect(parseAuthStatus("Logged in with Claude.ai (Pro) as a@b.co", 0)).toEqual({
      loggedIn: true,
      subscription: true,
      email: "a@b.co",
      plan: "pro",
    });
    expect(parseAuthStatus("Not logged in", 1).loggedIn).toBe(false);
  });
});
