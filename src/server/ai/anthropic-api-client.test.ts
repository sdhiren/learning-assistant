import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { z } from "zod";

import { AiGenerationError } from "@/lib/errors";
import { apiError, sseMessage } from "@/test/anthropic-fetch";

import { AnthropicApiClient } from "./anthropic-api-client";
import type { StructuredRequest } from "./llm-client";

const API_KEY = "sk-ant-test-LEAKCHECK-123";

const request: StructuredRequest<{ answer: string }> = {
  task: "test-task",
  systemPrompt: "You are a test persona.",
  prompt: "Say hi.",
  schema: z.object({ answer: z.string() }),
  effort: "medium",
};

function clientWith(fetchImpl: typeof fetch, timeoutMs = 10_000) {
  return new AnthropicApiClient({
    apiKey: API_KEY,
    model: "claude-opus-5-5",
    timeoutMs,
    maxRetries: 0,
    fetch: fetchImpl,
  });
}

function respondWith(response: () => Response) {
  return vi.fn<typeof fetch>(async () => response());
}

async function failureOf(promise: Promise<unknown>): Promise<AiGenerationError> {
  const error = await promise.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(AiGenerationError);
  return error as AiGenerationError;
}

let consoleSpies: MockInstance[];

beforeEach(() => {
  consoleSpies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation(() => {}),
  );
});

afterEach(() => {
  // The key must never reach the console, whatever the scenario.
  for (const spy of consoleSpies) {
    for (const call of spy.mock.calls) {
      for (const arg of call) {
        expect(String(arg)).not.toContain(API_KEY);
        expect(JSON.stringify(arg) ?? "").not.toContain(API_KEY);
      }
    }
  }
});

describe("AnthropicApiClient", () => {
  it("returns validated output and sends model, cached system prompt, effort and format", async () => {
    const fetchMock = respondWith(() =>
      sseMessage({ json: { answer: "hi" }, usage: { cache_read_input_tokens: 42 } }),
    );

    await expect(clientWith(fetchMock).generateStructured(request)).resolves.toEqual({
      answer: "hi",
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body));
    expect(body).toMatchObject({
      model: "claude-opus-5-5",
      stream: true,
      thinking: { type: "adaptive" },
      system: [{ type: "text", text: request.systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: request.prompt }],
      output_config: { effort: "medium", format: { type: "json_schema" } },
    });
    expect(body.output_config.format.schema.properties).toHaveProperty("answer");
  });

  it("reports input, output and both cache token counts, and logs no prompts or output", async () => {
    const onUsage = vi.fn();
    await clientWith(
      respondWith(() =>
        sseMessage({
          json: { answer: "secret-output" },
          usage: { cache_read_input_tokens: 42, cache_creation_input_tokens: 7 },
        }),
      ),
    ).generateStructured(request, { onUsage });

    expect(onUsage).toHaveBeenCalledExactlyOnceWith({
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 42,
      cacheWriteTokens: 7,
    });
    const logged = JSON.stringify(vi.mocked(console.info).mock.calls);
    expect(logged).not.toContain("secret-output");
    expect(logged).not.toContain(request.prompt);
    expect(logged).not.toContain(request.systemPrompt);
  });

  // Generic success and failure cases live in llm-client.contract.test.ts.
  it("maps a 400 about a low credit balance to the no-credit message", async () => {
    const error = await failureOf(
      clientWith(
        respondWith(() =>
          apiError(
            400,
            "invalid_request_error",
            "Your credit balance is too low to access the API",
          ),
        ),
      ).generateStructured(request),
    );

    expect(error.message).toContain("Your Anthropic API account is out of credit");
  });
});
