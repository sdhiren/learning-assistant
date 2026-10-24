import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseEnv, resolveAiConfig } from "./env";

const config = (source: Record<string, string | undefined>) => resolveAiConfig(parseEnv(source));

describe("AI configuration", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("defaults to the Claude Code subscription with Opus 5.5", () => {
    expect(config({})).toEqual({
      provider: "claude-code",
      model: "claude-opus-5-5",
      apiKey: undefined,
      timeoutMs: 180_000,
    });
  });

  it("accepts the deprecated CLAUDE_MODEL for the Claude providers", () => {
    expect(config({ CLAUDE_MODEL: "claude-sonnet-5-5" }).model).toBe("claude-sonnet-5-5");
    expect(
      config({
        AI_PROVIDER: "anthropic",
        ANTHROPIC_API_KEY: "sk-ant-x",
        CLAUDE_MODEL: "claude-haiku-5-5",
      }).model,
    ).toBe("claude-haiku-5-5");
  });

  it("prefers AI_MODEL over CLAUDE_MODEL", () => {
    expect(config({ AI_MODEL: "claude-fable-5-1", CLAUDE_MODEL: "claude-sonnet-5-5" }).model).toBe(
      "claude-fable-5-1",
    );
  });

  it("passes the Anthropic key through for the anthropic provider", () => {
    expect(config({ AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "sk-ant-x" })).toMatchObject({
      provider: "anthropic",
      model: "claude-opus-5-5",
      apiKey: "sk-ant-x",
    });
  });

  it("ignores a stray ANTHROPIC_API_KEY in claude-code mode", () => {
    expect(config({ ANTHROPIC_API_KEY: "sk-ant-x" }).apiKey).toBeUndefined();
  });

  it("names the missing key variable when the anthropic provider has no key", () => {
    expect(() => parseEnv({ AI_PROVIDER: "anthropic" })).toThrow(
      "AI_PROVIDER=anthropic needs ANTHROPIC_API_KEY (set it in .env.local)",
    );
  });

  it.each(["openai", "gemini"])("rejects %s as not available yet", (provider) => {
    expect(() =>
      parseEnv({ AI_PROVIDER: provider, OPENAI_API_KEY: "k", GEMINI_API_KEY: "k" }),
    ).toThrow(`AI_PROVIDER=${provider} is not available yet`);
  });

  it("never echoes key values in validation errors", () => {
    const key = "sk-ant-test-LEAKCHECK-123";
    let message = "";
    try {
      parseEnv({ AI_PROVIDER: "nope", ANTHROPIC_API_KEY: key, AI_MODEL: "Bad Model!" });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("Invalid environment configuration");
    expect(message).not.toContain(key);
  });
});
