import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { z } from "zod";

import { AiGenerationError } from "@/lib/errors";
import { apiError, hangingFetch, sseMessage } from "@/test/anthropic-fetch";

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

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
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

  it("logs task, model, duration, stop reason and token usage, but not prompts or output", async () => {
    await clientWith(
      respondWith(() =>
        sseMessage({
          json: { answer: "secret-output" },
          usage: { cache_read_input_tokens: 42, cache_creation_input_tokens: 7 },
        }),
      ),
    ).generateStructured(request);

    const [, context] = vi.mocked(console.info).mock.calls.at(-1)!;
    expect(context).toMatchObject({
      task: "test-task",
      model: "claude-opus-5-5",
      stopReason: "end_turn",
      usage: { input: 100, output: 50, cacheRead: 42, cacheWrite: 7 },
    });
    expect(context).toHaveProperty("durationMs");
    const logged = JSON.stringify(vi.mocked(console.info).mock.calls);
    expect(logged).not.toContain("secret-output");
    expect(logged).not.toContain(request.prompt);
    expect(logged).not.toContain(request.systemPrompt);
  });

  it.each([
    [
      "schema-invalid output",
      () => sseMessage({ json: { answer: 42 } }),
      "Claude returned an unexpected response",
    ],
    ["non-JSON output", () => sseMessage({ text: "not json" }), "unexpected response"],
    [
      "max_tokens",
      () => sseMessage({ text: '{"answer": "trunc', stopReason: "max_tokens" }),
      "Claude's response was cut off",
    ],
    [
      "refusal",
      () => sseMessage({ text: "", stopReason: "refusal" }),
      "Claude declined this request",
    ],
    [
      "401",
      () => apiError(401, "authentication_error", `invalid x-api-key ${API_KEY}`),
      "Your Anthropic API key was rejected. Check ANTHROPIC_API_KEY",
    ],
    [
      "a billing error",
      () => apiError(400, "billing_error", `Your credit balance is too low (key ${API_KEY})`),
      "out of credit",
    ],
    [
      "a low credit balance 400",
      () =>
        apiError(400, "invalid_request_error", "Your credit balance is too low to access the API"),
      "out of credit",
    ],
    [
      "429",
      () => apiError(429, "rate_limit_error", `Rate limited for ${API_KEY}`),
      "Claude is rate-limiting requests",
    ],
    [
      "529",
      () => apiError(529, "overloaded_error", "Overloaded"),
      "Claude is overloaded right now",
    ],
    [
      "an unexpected 500",
      () => apiError(500, "api_error", `Internal error ${API_KEY}`),
      "Claude couldn't complete the request",
    ],
  ])("maps %s to a friendly message without leaking the key", async (_name, response, message) => {
    const error = await failureOf(clientWith(respondWith(response)).generateStructured(request));

    expect(error.message).toContain(message);
    expect(error.message).not.toContain(API_KEY);
    expect(error.cause).toBeUndefined();
    expect(JSON.stringify(error)).not.toContain(API_KEY);
  });

  it("maps a request that outlives the timeout to the timeout message", async () => {
    const error = await failureOf(clientWith(hangingFetch, 50).generateStructured(request));

    expect(error.message).toBe("Claude took too long to respond. Please try again.");
  });

  it("never logs the key even when the error carries it in headers and body", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({ type: "error", error: { type: "api_error", message: API_KEY } }),
          {
            status: 500,
            headers: { "content-type": "application/json", "x-echo-key": API_KEY },
          },
        ),
    );

    const error = await failureOf(clientWith(fetchMock).generateStructured(request));

    expect(String(error.cause ?? "")).not.toContain(API_KEY);
    expect(vi.mocked(console.warn)).toHaveBeenCalled();
  });
});
