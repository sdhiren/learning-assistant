import { describe, expect, it } from "vitest";

import { AnthropicApiClient } from "@/server/ai/anthropic-api-client";
import { ClaudeAgentClient } from "@/server/ai/claude-agent-client";

import { createLlmClient } from "./container";

const base = { model: "claude-opus-5-5", timeoutMs: 60_000 };

describe("createLlmClient", () => {
  it("uses the Claude Code subscription client for claude-code", () => {
    const client = createLlmClient({ ...base, provider: "claude-code" });
    expect(client).toBeInstanceOf(ClaudeAgentClient);
    expect(client.providerLabel).toBe("Claude");
  });

  it("uses the API client for anthropic", () => {
    const client = createLlmClient({ ...base, provider: "anthropic", apiKey: "sk-ant-x" });
    expect(client).toBeInstanceOf(AnthropicApiClient);
    expect(client.providerLabel).toBe("Claude");
  });

  it.each(["openai", "gemini"] as const)("refuses %s until it is implemented", (provider) => {
    expect(() => createLlmClient({ ...base, provider, apiKey: "k" })).toThrow(
      `AI_PROVIDER=${provider} is not available yet`,
    );
  });
});
