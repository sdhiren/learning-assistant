import { describe, expect, it } from "vitest";

import { AnthropicApiClient } from "@/server/ai/anthropic-api-client";
import { ClaudeAgentClient } from "@/server/ai/claude-agent-client";
import { GeminiClient } from "@/server/ai/gemini-client";
import { MissingKeyLlmClient } from "@/server/ai/missing-key-llm-client";
import { OpenAiClient } from "@/server/ai/openai-client";

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

  it("uses the OpenAI client for openai", () => {
    const client = createLlmClient({ ...base, model: "gpt-5", provider: "openai", apiKey: "sk-x" });
    expect(client).toBeInstanceOf(OpenAiClient);
    expect(client.providerLabel).toBe("GPT");
  });

  it("uses the Gemini client for gemini", () => {
    const client = createLlmClient({
      ...base,
      model: "gemini-2.5-pro",
      provider: "gemini",
      apiKey: "AIza-x",
    });
    expect(client).toBeInstanceOf(GeminiClient);
    expect(client.providerLabel).toBe("Gemini");
  });

  it.each(["anthropic", "openai", "gemini"] as const)(
    "asks for a %s key on first use instead of failing at startup",
    (provider) => {
      expect(createLlmClient({ ...base, provider })).toBeInstanceOf(MissingKeyLlmClient);
    },
  );
});
