import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { buildAgentEnv, ClaudeAgentClient } from "./claude-agent-client";
import { ProviderError } from "./provider-errors";

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({ query: queryMock }));

describe("buildAgentEnv", () => {
  it("drops API credentials and tags the client app, keeping everything else", () => {
    const env = buildAgentEnv({
      PATH: "/usr/bin",
      HOME: "/Users/me",
      ANTHROPIC_API_KEY: "sk-ant-stray",
      ANTHROPIC_AUTH_TOKEN: "token",
    });

    expect(env).toEqual({
      PATH: "/usr/bin",
      HOME: "/Users/me",
      CLAUDE_AGENT_SDK_CLIENT_APP: "learning-assistant/0.1.0",
    });
  });
});

describe("ClaudeAgentClient", () => {
  it("never passes ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN to the Claude Code subprocess", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-stray-key");
    vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "stray-token");
    vi.spyOn(console, "info").mockImplementation(() => {});
    queryMock.mockImplementation(async function* () {
      yield {
        type: "result",
        subtype: "success",
        is_error: false,
        structured_output: { ok: true },
      };
    });

    const client = new ClaudeAgentClient({ model: "claude-opus-5-5", timeoutMs: 10_000 });
    const result = await client.generateStructured({
      task: "test-task",
      systemPrompt: "system",
      prompt: "prompt",
      schema: z.object({ ok: z.boolean() }),
      effort: "low",
    });

    expect(result).toEqual({ ok: true });
    const { env } = queryMock.mock.calls[0]![0].options;
    expect(env).not.toHaveProperty("ANTHROPIC_API_KEY");
    expect(env).not.toHaveProperty("ANTHROPIC_AUTH_TOKEN");
    expect(env.PATH).toBe(process.env.PATH);
    expect(env.CLAUDE_AGENT_SDK_CLIENT_APP).toBe("learning-assistant/0.1.0");
    vi.unstubAllEnvs();
  });

  const request = {
    task: "test-task",
    systemPrompt: "system",
    prompt: "prompt",
    schema: z.object({ ok: z.boolean() }),
    effort: "low" as const,
  };
  const usage = {
    input_tokens: 10,
    output_tokens: 20,
    cache_read_input_tokens: 30,
    cache_creation_input_tokens: 40,
  };

  it("reports usage, API duration and the SDK's cost through onUsage", async () => {
    queryMock.mockImplementation(async function* () {
      yield {
        type: "result",
        subtype: "success",
        is_error: false,
        structured_output: { ok: true },
        usage,
        total_cost_usd: 0.12,
        duration_api_ms: 900,
      };
    });
    const onUsage = vi.fn();

    await new ClaudeAgentClient({ model: "claude-opus-5-5", timeoutMs: 10_000 }).generateStructured(
      request,
      { onUsage },
    );

    expect(onUsage).toHaveBeenCalledExactlyOnceWith({
      inputTokens: 10,
      outputTokens: 20,
      cacheReadTokens: 30,
      cacheWriteTokens: 40,
      apiDurationMs: 900,
      costUsd: 0.12,
    });
  });

  it.each([
    ["rate_limit", "rate_limited"],
    ["overloaded", "overloaded"],
    ["authentication_failed", "invalid_key"],
    ["billing_error", "invalid_key"],
    ["max_output_tokens", "truncated"],
    ["server_error", "unavailable"],
  ])("maps the assistant error %s to %s and still reports usage", async (assistantError, kind) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    queryMock.mockImplementation(async function* () {
      yield { type: "assistant", error: assistantError, message: {} };
      yield {
        type: "result",
        subtype: "error_during_execution",
        is_error: true,
        errors: [],
        usage,
        total_cost_usd: 0,
        duration_api_ms: 5,
      };
    });
    const onUsage = vi.fn();

    const error = await new ClaudeAgentClient({ model: "claude-opus-5-5", timeoutMs: 10_000 })
      .generateStructured(request, { onUsage })
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).kind).toBe(kind);
    expect(onUsage).toHaveBeenCalledOnce();
  });

  it("maps structured-output retries and schema failures to bad_output", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const client = new ClaudeAgentClient({ model: "claude-opus-5-5", timeoutMs: 10_000 });
    queryMock.mockImplementation(async function* () {
      yield {
        type: "result",
        subtype: "error_max_structured_output_retries",
        is_error: true,
        usage,
      };
    });
    const retries = await client.generateStructured(request).catch((thrown: unknown) => thrown);
    queryMock.mockImplementation(async function* () {
      yield { type: "result", subtype: "success", is_error: false, structured_output: {}, usage };
    });
    const invalid = await client.generateStructured(request).catch((thrown: unknown) => thrown);

    expect((retries as ProviderError).kind).toBe("bad_output");
    expect((invalid as ProviderError).kind).toBe("bad_output");
  });
});
