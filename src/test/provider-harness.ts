/**
 * One entry per API-key provider for the shared LlmClient contract suite
 * (`llm-client.contract.test.ts`): how to build the client on a fake `fetch`,
 * and the provider's own wire format for each scenario.
 */
import { AnthropicApiClient } from "@/server/ai/anthropic-api-client";
import { GeminiClient } from "@/server/ai/gemini-client";
import type { LlmClient } from "@/server/ai/llm-client";
import { OpenAiClient } from "@/server/ai/openai-client";
import type { ProviderErrorContext } from "@/server/ai/provider-errors";

import { apiError, sseMessage } from "./anthropic-fetch";
import { geminiError, geminiResponse } from "./gemini-fetch";
import { openAiError, openAiResponse } from "./openai-fetch";

export type ContractProviderId = "anthropic" | "openai" | "gemini";

/** HTTP failures every provider must map the same way. */
export type HttpErrorKind =
  "invalid_key" | "no_credit" | "rate_limited" | "overloaded" | "unavailable";

export interface ProviderHarness {
  apiKey: string;
  errorContext: ProviderErrorContext;
  makeClient(fetchImpl: typeof fetch, timeoutMs?: number): LlmClient;
  /** A successful response whose text is `text`. */
  text(text: string): Response;
  refusal(): Response;
  truncated(): Response;
  /** An error response that echoes the key in its body and headers. */
  httpError(kind: HttpErrorKind): Response;
  /** The JSON schema the client sent, from the parsed request body. */
  sentSchema(body: Record<string, unknown>): unknown;
}

const echo = (key: string) => ({ "x-echo-key": key });

const anthropicKey = "sk-ant-test-LEAKCHECK-123";
const openAiKey = "sk-proj-test-LEAKCHECK-1234567890";
const geminiKey = "AIzaTest-LEAKCHECK-1234567890abcdef";

export const PROVIDER_HARNESSES: Record<ContractProviderId, ProviderHarness> = {
  anthropic: {
    apiKey: anthropicKey,
    errorContext: {
      providerLabel: "Claude",
      vendorName: "Anthropic",
      keyEnvVar: "ANTHROPIC_API_KEY",
    },
    makeClient: (fetchImpl, timeoutMs = 10_000) =>
      new AnthropicApiClient({
        apiKey: anthropicKey,
        model: "claude-opus-5-5",
        timeoutMs,
        maxRetries: 0,
        fetch: fetchImpl,
      }),
    text: (text) => sseMessage({ text }),
    refusal: () => sseMessage({ text: "", stopReason: "refusal" }),
    truncated: () => sseMessage({ text: '{"answer": "trunc', stopReason: "max_tokens" }),
    httpError: (kind) => {
      const key = anthropicKey;
      const responses: Record<HttpErrorKind, () => Response> = {
        invalid_key: () =>
          apiError(401, "authentication_error", `invalid x-api-key ${key}`, echo(key)),
        no_credit: () =>
          apiError(400, "billing_error", `Your credit balance is too low (key ${key})`, echo(key)),
        rate_limited: () => apiError(429, "rate_limit_error", `Rate limited ${key}`, echo(key)),
        overloaded: () => apiError(529, "overloaded_error", `Overloaded ${key}`, echo(key)),
        unavailable: () => apiError(500, "api_error", `Internal error ${key}`, echo(key)),
      };
      return responses[kind]();
    },
    sentSchema: (body) => (body.output_config as { format: { schema: unknown } }).format.schema,
  },

  openai: {
    apiKey: openAiKey,
    errorContext: { providerLabel: "GPT", vendorName: "OpenAI", keyEnvVar: "OPENAI_API_KEY" },
    makeClient: (fetchImpl, timeoutMs = 10_000) =>
      new OpenAiClient({
        apiKey: openAiKey,
        model: "gpt-5",
        timeoutMs,
        maxRetries: 0,
        fetch: fetchImpl,
      }),
    text: (text) => openAiResponse({ text }),
    refusal: () => openAiResponse({ refusal: "I can't help with that." }),
    truncated: () =>
      openAiResponse({
        text: '{"answer": "trunc',
        status: "incomplete",
        incompleteReason: "max_output_tokens",
      }),
    httpError: (kind) => {
      const key = openAiKey;
      const responses: Record<HttpErrorKind, () => Response> = {
        invalid_key: () =>
          openAiError(
            401,
            {
              type: "invalid_request_error",
              code: "invalid_api_key",
              message: `Incorrect API key provided: ${key}`,
            },
            echo(key),
          ),
        no_credit: () =>
          openAiError(
            429,
            {
              type: "insufficient_quota",
              code: "insufficient_quota",
              message: `You exceeded your current quota (${key})`,
            },
            echo(key),
          ),
        rate_limited: () =>
          openAiError(
            429,
            { type: "requests", code: "rate_limit_exceeded", message: `Rate limit ${key}` },
            echo(key),
          ),
        overloaded: () =>
          openAiError(
            503,
            { type: "server_error", message: `The engine is overloaded ${key}` },
            echo(key),
          ),
        unavailable: () =>
          openAiError(500, { type: "server_error", message: `Internal error ${key}` }, echo(key)),
      };
      return responses[kind]();
    },
    sentSchema: (body) => (body.text as { format: { schema: unknown } }).format.schema,
  },

  gemini: {
    apiKey: geminiKey,
    errorContext: {
      providerLabel: "Gemini",
      vendorName: "Google AI Studio",
      keyEnvVar: "GEMINI_API_KEY",
    },
    makeClient: (fetchImpl, timeoutMs = 10_000) =>
      new GeminiClient({
        apiKey: geminiKey,
        model: "gemini-2.5-pro",
        timeoutMs,
        maxRetries: 0,
        fetch: fetchImpl,
      }),
    text: (text) => geminiResponse({ text }),
    refusal: () => geminiResponse({ text: "", finishReason: "SAFETY" }),
    truncated: () => geminiResponse({ text: '{"answer": "trunc', finishReason: "MAX_TOKENS" }),
    httpError: (kind) => {
      const key = geminiKey;
      const responses: Record<HttpErrorKind, () => Response> = {
        invalid_key: () =>
          geminiError(
            400,
            "INVALID_ARGUMENT",
            `API key not valid. Please pass a valid API key. ${key}`,
            echo(key),
          ),
        no_credit: () =>
          geminiError(
            429,
            "RESOURCE_EXHAUSTED",
            `Your prepayment credits are depleted. Check your billing details (${key}).`,
            echo(key),
          ),
        rate_limited: () =>
          geminiError(
            429,
            "RESOURCE_EXHAUSTED",
            `You exceeded your current quota ${key}`,
            echo(key),
          ),
        overloaded: () =>
          geminiError(503, "UNAVAILABLE", `The model is overloaded ${key}`, echo(key)),
        unavailable: () => geminiError(500, "INTERNAL", `Internal error ${key}`, echo(key)),
      };
      return responses[kind]();
    },
    sentSchema: (body) =>
      (body.generationConfig as { responseJsonSchema: unknown }).responseJsonSchema,
  },
};
