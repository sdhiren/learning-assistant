import "server-only";

import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, rmSync } from "node:fs";

import { AppError } from "@/lib/errors";

export const SIGN_IN_FAILED_MESSAGE = "Sign-in didn't complete. Please try again.";
export const SIGN_IN_EXPIRED_MESSAGE = "That sign-in expired. Start again.";

const DEFAULT_FLOW_TIMEOUT_MS = 10 * 60_000;
const URL_WAIT_MS = 30_000;
const EXIT_WAIT_MS = 60_000;
const STATUS_TIMEOUT_MS = 15_000;
const STATUS_CACHE_MS = 30_000;
const SIGN_IN_URL = /https:\/\/(?:claude\.ai|console\.anthropic\.com)\/[^\s"'<>\u001b]+/;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

/** What `claude auth status` reports for a profile. Email and plan are for display only. */
export interface ClaudeLoginStatus {
  loggedIn: boolean;
  /** True when logged in with a claude.ai subscription, not an API key. */
  subscription: boolean;
  email?: string;
  plan?: string;
}

export interface ClaudeLoginOptions {
  cliPath: string;
  configDirFor: (profileId: string) => string;
  /** Inherited env; only PATH-like basics are passed on, never keys or tokens. */
  baseEnv?: Record<string, string | undefined>;
  flowTimeoutMs?: number;
  spawnProcess?: SpawnProcess;
  now?: () => number;
}

/** `spawn` narrowed to what this file uses, so tests can pass a fake. */
export type SpawnProcess = (
  command: string,
  args: string[],
  options: { env: Record<string, string>; stdio: ("pipe" | "ignore")[] },
) => ChildProcess;

interface PendingFlow {
  id: string;
  profileId: string;
  child: ChildProcess;
  exited: Promise<number | null>;
  timer: NodeJS.Timeout;
}

const PASSED_ENV = ["PATH", "HOME", "USER", "LOGNAME", "SHELL", "LANG", "LC_ALL", "TMPDIR", "TERM"];

/**
 * Drives Claude Code's own `claude auth login` / `status` / `logout` for one
 * profile at a time, each with its own CLAUDE_CONFIG_DIR, so a profile's
 * login never touches this machine's login or another profile's. Claude Code
 * stores and refreshes the credential itself; none of it passes through here.
 *
 * Nothing the CLI prints (sign-in URL, code, email) is ever logged.
 */
export class ClaudeLoginFlow {
  private readonly flows = new Map<string, PendingFlow>();
  private readonly statusCache = new Map<string, { at: number; status: ClaudeLoginStatus }>();
  private readonly spawnProcess: SpawnProcess;
  private readonly now: () => number;

  constructor(private readonly options: ClaudeLoginOptions) {
    this.spawnProcess =
      options.spawnProcess ??
      ((command, args, spawnOptions) =>
        spawn(command, args, {
          env: spawnOptions.env as NodeJS.ProcessEnv,
          stdio: spawnOptions.stdio,
        }));
    this.now = options.now ?? Date.now;
  }

  /** Starts a sign-in and returns the claude.ai URL to open. Replaces a pending one. */
  async start(profileId: string): Promise<{ flowId: string; url: string }> {
    this.cancelProfile(profileId);
    const configDir = this.resetConfigDir(profileId);

    const child = this.spawnProcess(this.options.cliPath, ["auth", "login"], {
      env: this.cliEnv(configDir),
      stdio: ["pipe", "pipe", "pipe"],
    });
    const exited = new Promise<number | null>((resolve) => {
      child.once("exit", (code) => resolve(code));
      child.once("error", () => resolve(null));
    });

    let url: string;
    try {
      url = await this.readSignInUrl(child, exited);
    } catch (error) {
      child.kill();
      this.wipe(profileId);
      throw error;
    }

    const id = randomUUID();
    const timer = setTimeout(
      () => this.fail(id),
      this.options.flowTimeoutMs ?? DEFAULT_FLOW_TIMEOUT_MS,
    );
    timer.unref?.();
    this.flows.set(profileId, { id, profileId, child, exited, timer });
    return { flowId: id, url };
  }

  /**
   * Hands the pasted code to the waiting CLI, then trusts only `auth status`:
   * the sign-in counts if it reports a subscription login. On any failure the
   * process is killed and the config dir emptied, so no partial login remains.
   */
  async complete(profileId: string, flowId: string, code: string): Promise<ClaudeLoginStatus> {
    const flow = this.flows.get(profileId);
    if (!flow || flow.id !== flowId) throw new AppError(SIGN_IN_EXPIRED_MESSAGE);
    clearTimeout(flow.timer);
    this.flows.delete(profileId);

    try {
      flow.child.stdin?.write(`${code}\n`);
      const exitCode = await withTimeout(flow.exited, EXIT_WAIT_MS);
      if (exitCode !== 0) throw new AppError(SIGN_IN_FAILED_MESSAGE);
      this.statusCache.delete(profileId);
      const status = await this.status(profileId);
      if (!status.loggedIn || !status.subscription) throw new AppError(SIGN_IN_FAILED_MESSAGE);
      return status;
    } catch (error) {
      flow.child.kill();
      this.wipe(profileId);
      throw error instanceof AppError ? error : new AppError(SIGN_IN_FAILED_MESSAGE);
    }
  }

  cancel(profileId: string, flowId: string): void {
    const flow = this.flows.get(profileId);
    if (flow?.id === flowId) this.fail(flowId);
  }

  /** `claude auth status` for the profile's config dir, cached briefly. */
  async status(profileId: string): Promise<ClaudeLoginStatus> {
    const cached = this.statusCache.get(profileId);
    if (cached && this.now() - cached.at < STATUS_CACHE_MS) return cached.status;

    const configDir = this.options.configDirFor(profileId);
    let status: ClaudeLoginStatus = { loggedIn: false, subscription: false };
    if (existsSync(configDir)) {
      const { code, stdout } = await this.run(configDir, ["auth", "status"]);
      status = parseAuthStatus(stdout, code);
    }
    this.statusCache.set(profileId, { at: this.now(), status });
    return status;
  }

  /** `claude auth logout` for the profile's config dir, then removes the dir. */
  async logout(profileId: string): Promise<void> {
    this.cancelProfile(profileId);
    const configDir = this.options.configDirFor(profileId);
    if (existsSync(configDir)) await this.run(configDir, ["auth", "logout"]).catch(() => null);
    this.wipe(profileId);
  }

  hasPendingFlow(profileId: string): boolean {
    return this.flows.has(profileId);
  }

  private cancelProfile(profileId: string): void {
    const flow = this.flows.get(profileId);
    if (flow) this.fail(flow.id);
  }

  private fail(flowId: string): void {
    for (const flow of this.flows.values()) {
      if (flow.id !== flowId) continue;
      clearTimeout(flow.timer);
      this.flows.delete(flow.profileId);
      flow.child.kill();
      this.wipe(flow.profileId);
    }
  }

  private resetConfigDir(profileId: string): string {
    const configDir = this.options.configDirFor(profileId);
    rmSync(configDir, { recursive: true, force: true });
    mkdirSync(configDir, { recursive: true, mode: 0o700 });
    chmodSync(configDir, 0o700);
    return configDir;
  }

  private wipe(profileId: string): void {
    this.statusCache.delete(profileId);
    rmSync(this.options.configDirFor(profileId), { recursive: true, force: true });
  }

  /** A minimal env: the profile's config dir and basics, no API keys or inherited tokens. */
  private cliEnv(configDir: string): Record<string, string> {
    const source = this.options.baseEnv ?? process.env;
    const env: Record<string, string> = {};
    for (const name of PASSED_ENV) {
      const value = source[name];
      if (value) env[name] = value;
    }
    env.CLAUDE_CONFIG_DIR = configDir;
    // Don't open a browser on the server; the page opens the URL for the user.
    env.BROWSER = "true";
    return env;
  }

  private readSignInUrl(child: ChildProcess, exited: Promise<number | null>): Promise<string> {
    return new Promise((resolve, reject) => {
      let output = "";
      const timer = setTimeout(() => done(new AppError(SIGN_IN_FAILED_MESSAGE)), URL_WAIT_MS);
      const onData = (chunk: Buffer | string) => {
        output += chunk.toString();
        const match = SIGN_IN_URL.exec(output);
        if (match) done(null, match[0]);
      };
      const done = (error: Error | null, url?: string) => {
        clearTimeout(timer);
        child.stdout?.off("data", onData);
        child.stderr?.off("data", onData);
        output = "";
        if (url) resolve(url);
        else reject(error ?? new AppError(SIGN_IN_FAILED_MESSAGE));
      };
      child.stdout?.on("data", onData);
      child.stderr?.on("data", onData);
      void exited.then(() => done(new AppError(SIGN_IN_FAILED_MESSAGE)));
    });
  }

  private run(configDir: string, args: string[]): Promise<{ code: number | null; stdout: string }> {
    return new Promise((resolve) => {
      const child = this.spawnProcess(this.options.cliPath, args, {
        env: this.cliEnv(configDir),
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      const timer = setTimeout(() => child.kill(), STATUS_TIMEOUT_MS);
      child.stdout?.on("data", (chunk: Buffer | string) => (stdout += chunk.toString()));
      child.once("error", () => {
        clearTimeout(timer);
        resolve({ code: null, stdout: "" });
      });
      child.once("exit", (code) => {
        clearTimeout(timer);
        resolve({ code, stdout });
      });
    });
  }
}

/**
 * Reads `claude auth status`. Prefers its JSON (`loggedIn`, `authMethod`,
 * `email`, `subscriptionType`); falls back to the text form.
 */
export function parseAuthStatus(stdout: string, exitCode: number | null): ClaudeLoginStatus {
  const notLoggedIn = { loggedIn: false, subscription: false };
  try {
    const json = JSON.parse(stdout) as Record<string, unknown>;
    const loggedIn = json.loggedIn === true;
    const method = String(json.authMethod ?? "").toLowerCase();
    return {
      loggedIn,
      subscription: loggedIn && (method.includes("claude") || method.includes("oauth")),
      email: typeof json.email === "string" ? json.email : undefined,
      plan: typeof json.subscriptionType === "string" ? json.subscriptionType : undefined,
    };
  } catch {
    if (exitCode !== 0 || /not logged in/i.test(stdout)) return notLoggedIn;
    const loggedIn = /logged in/i.test(stdout);
    return {
      loggedIn,
      subscription: loggedIn && /claude\.ai|subscription|oauth/i.test(stdout),
      email: EMAIL.exec(stdout)?.[0],
      plan: /\b(pro|max|team|enterprise)\b/i.exec(stdout)?.[1]?.toLowerCase(),
    };
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new AppError(SIGN_IN_FAILED_MESSAGE)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new AppError(SIGN_IN_FAILED_MESSAGE));
      },
    );
  });
}

/** Per-profile sign-in relies on CLAUDE_CONFIG_DIR isolation, checked on macOS and Linux only. */
export function claudeSignInSupported(platform: NodeJS.Platform = process.platform): boolean {
  return platform === "darwin" || platform === "linux";
}
