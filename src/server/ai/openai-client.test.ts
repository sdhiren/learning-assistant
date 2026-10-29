import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { openAiError, openAiResponse } from "@/test/openai-fetch";

import type { StructuredRequest } from "./llm-client";
import { OPENAI_MAX_OUTPUT_TOKENS, OpenAiClient } from "./openai-client";

// Generic success and failure cases live in llm-client.contract.test.ts.

const request: StructuredRequest<{ answer: string }> = {
  task: "test task.v2",
  systemPrompt: "You are a test persona.",
  prompt: "Say hi.",
  schema: z.object({ answer: z.string() }),
  effort: "medium",
};

function clientWith(fetchImpl: typeof fetch) {
  return new OpenAiClient({
    apiKey: "sk-proj-test-1234567890abcdef",
    model: "gpt-5",
    timeoutMs: 10_000,
    maxRetries: 0,
    fetch: fetchImpl,
  });
}

const respondWith = (response: () => Response) => vi.fn<typeof fetch>(async () => response());
const sentBody = (fetchMock: ReturnType<typeof respondWith>) =>
  JSON.parse(String(fetchMock.mock.calls[0]![1]?.body));

beforeEach(() => {
  for (const method of ["info", "warn"] as const) {
    vi.spyOn(console, method).mockImplementation(() => {});
  }
});

describe("OpenAiClient", () => {
  it("sends instructions, input, the output cap and a strict json_schema format", async () => {
    const fetchMock = respondWith(() => openAiResponse({ json: { answer: "hi" } }));

    await expect(clientWith(fetchMock).generateStructured(request)).resolves.toEqual({
      answer: "hi",
    });

    expect(String(fetchMock.mock.calls[0]![0])).toMatch(/\/responses$/);
    expect(sentBody(fetchMock)).toMatchObject({
      model: "gpt-5",
      instructions: request.systemPrompt,
      input: request.prompt,
      max_output_tokens: OPENAI_MAX_OUTPUT_TOKENS,
      store: false,
      text: {
        format: {
          type: "json_schema",
          name: "test_task_v2",
          strict: true,
          schema: { type: "object", required: ["answer"], additionalProperties: false },
        },
      },
    });
  });

  it.each(["low", "medium", "high"] as const)(
    "maps effort %s 1:1 to reasoning.effort",
    async (effort) => {
      const fetchMock = respondWith(() => openAiResponse({ json: { answer: "hi" } }));

      await clientWith(fetchMock).generateStructured({ ...request, effort });

      expect(sentBody(fetchMock).reasoning).toEqual({ effort });
    },
  );

  it("reports tokens (output includes reasoning) and logs no prompts or output", async () => {
    const onUsage = vi.fn();
    await clientWith(
      respondWith(() =>
        openAiResponse({
          json: { answer: "secret-output" },
          usage: { cached_tokens: 42, reasoning_tokens: 30 },
        }),
      ),
    ).generateStructured(request, { onUsage });

    expect(onUsage).toHaveBeenCalledExactlyOnceWith({
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 42,
      cacheWriteTokens: null,
    });
    const logged = JSON.stringify(vi.mocked(console.info).mock.calls);
    expect(logged).not.toContain("secret-output");
    expect(logged).not.toContain(request.prompt);
    expect(logged).not.toContain(request.systemPrompt);
  });

  it("maps a 429 with insufficient_quota to no credit, and a plain 429 to rate limiting", async () => {
    const quota = clientWith(
      respondWith(() =>
        openAiError(429, {
          type: "insufficient_quota",
          code: "insufficient_quota",
          message: "quota",
        }),
      ),
    );
    const rate = clientWith(
      respondWith(() =>
        openAiError(429, { type: "requests", code: "rate_limit_exceeded", message: "slow down" }),
      ),
    );

    await expect(quota.generateStructured(request)).rejects.toThrow(
      "Your OpenAI API account is out of credit",
    );
    await expect(rate.generateStructured(request)).rejects.toThrow("GPT is rate-limiting requests");
  });

  it("maps an incomplete response cut by the content filter to refused", async () => {
    const client = clientWith(
      respondWith(() =>
        openAiResponse({ text: "", status: "incomplete", incompleteReason: "content_filter" }),
      ),
    );

    await expect(client.generateStructured(request)).rejects.toThrow("GPT declined this request");
  });
});
