import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { buildAgentEnv, ClaudeAgentClient } from "./claude-agent-client";

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
});
