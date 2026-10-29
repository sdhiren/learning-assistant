import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { geminiError, geminiResponse } from "@/test/gemini-fetch";

import { GEMINI_MAX_OUTPUT_TOKENS, GeminiClient, geminiThinkingBudget } from "./gemini-client";
import type { StructuredRequest } from "./llm-client";

// Generic success and failure cases live in llm-client.contract.test.ts.

const API_KEY = "AIzaTest-1234567890abcdefghij";

const request: StructuredRequest<{ answer: string }> = {
  task: "test-task",
  systemPrompt: "You are a test persona.",
  prompt: "Say hi.",
  schema: z.object({ answer: z.string().min(1) }),
  effort: "medium",
};

function clientWith(fetchImpl: typeof fetch) {
  return new GeminiClient({
    apiKey: API_KEY,
    model: "gemini-2.5-pro",
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

describe("geminiThinkingBudget", () => {
  it("uses fixed budgets per effort", () => {
    expect(geminiThinkingBudget("low")).toBe(2048);
    expect(geminiThinkingBudget("medium")).toBe(8192);
    expect(geminiThinkingBudget("high")).toBe(24_576);
  });
});

describe("GeminiClient", () => {
  it("sends the system instruction, JSON mime type, adapted schema and output cap", async () => {
    const fetchMock = respondWith(() => geminiResponse({ json: { answer: "hi" } }));

    await expect(clientWith(fetchMock).generateStructured(request)).resolves.toEqual({
      answer: "hi",
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/models/gemini-2.5-pro:generateContent");
    // The key travels in a header, never in the URL.
    expect(String(url)).not.toContain(API_KEY);
    expect(new Headers(init?.headers).get("x-goog-api-key")).toBe(API_KEY);

    const body = sentBody(fetchMock);
    expect(body).toMatchObject({
      contents: [{ role: "user", parts: [{ text: request.prompt }] }],
      systemInstruction: { parts: [{ text: request.systemPrompt }] },
      generationConfig: {
        responseMimeType: "application/json",
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
        responseJsonSchema: { type: "object", properties: { answer: { type: "string" } } },
      },
    });
    expect(JSON.stringify(body.generationConfig.responseJsonSchema)).not.toContain("minLength");
  });

  it.each(["low", "medium", "high"] as const)(
    "sends the thinking budget for effort %s",
    async (effort) => {
      const fetchMock = respondWith(() => geminiResponse({ json: { answer: "hi" } }));

      await clientWith(fetchMock).generateStructured({ ...request, effort });

      expect(sentBody(fetchMock).generationConfig.thinkingConfig).toEqual({
        thinkingBudget: geminiThinkingBudget(effort),
      });
    },
  );

  it("ignores thought parts, counts thinking as output tokens, and logs no prompts or output", async () => {
    const onUsage = vi.fn();
    await expect(
      clientWith(
        respondWith(() =>
          geminiResponse({
            json: { answer: "secret-output" },
            usage: { thoughtsTokenCount: 30, cachedContentTokenCount: 42 },
          }),
        ),
      ).generateStructured(request, { onUsage }),
    ).resolves.toEqual({ answer: "secret-output" });

    expect(onUsage).toHaveBeenCalledExactlyOnceWith({
      inputTokens: 100,
      outputTokens: 80,
      cacheReadTokens: 42,
      cacheWriteTokens: null,
    });
    const logged = JSON.stringify(vi.mocked(console.info).mock.calls);
    expect(logged).not.toContain("secret-output");
    expect(logged).not.toContain(request.prompt);
  });

  it("maps a 400 'API key not valid' to the invalid-key message", async () => {
    const client = clientWith(
      respondWith(() =>
        geminiError(400, "INVALID_ARGUMENT", "API key not valid. Please pass a valid API key."),
      ),
    );

    await expect(client.generateStructured(request)).rejects.toThrow(
      "Your Google AI Studio API key was rejected. Check GEMINI_API_KEY",
    );
  });

  it("maps any other 400 to unavailable", async () => {
    const client = clientWith(
      respondWith(() => geminiError(400, "INVALID_ARGUMENT", "Invalid JSON payload received.")),
    );

    await expect(client.generateStructured(request)).rejects.toThrow(
      "Gemini couldn't complete the request",
    );
  });

  it.each(["SAFETY", "RECITATION", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII"])(
    "maps finish reason %s to refused",
    async (finishReason) => {
      const client = clientWith(respondWith(() => geminiResponse({ text: "", finishReason })));

      await expect(client.generateStructured(request)).rejects.toThrow(
        "Gemini declined this request",
      );
    },
  );

  it("maps a blocked prompt to refused", async () => {
    const client = clientWith(respondWith(() => geminiResponse({ blockReason: "SAFETY" })));

    await expect(client.generateStructured(request)).rejects.toThrow(
      "Gemini declined this request",
    );
  });
});
