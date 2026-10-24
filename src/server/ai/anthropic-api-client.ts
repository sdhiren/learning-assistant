import "server-only";

import Anthropic, {
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  PermissionDeniedError,
  RateLimitError,
} from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { Message } from "@anthropic-ai/sdk/resources/messages";

import { AiGenerationError } from "@/lib/errors";
import { logger } from "@/server/logger";

import type { LlmClient, StructuredRequest } from "./llm-client";
import {
  mapProviderError,
  redactSecrets,
  safeErrorContext,
  type ProviderErrorKind,
} from "./provider-errors";
import { PROVIDERS } from "./providers";

interface AnthropicApiClientOptions {
  apiKey: string;
  model: string;
  /** Overall deadline per request, including the SDK's retries. */
  timeoutMs: number;
  maxRetries?: number;
  /** Injected in tests to fake the HTTP layer. */
  fetch?: typeof fetch;
}

/**
 * Upper bound on output tokens (thinking plus the JSON answer). Lessons and
 * quizzes are the longest outputs and stay well under this; requests stream,
 * so a high limit doesn't risk HTTP timeouts.
 */
const MAX_OUTPUT_TOKENS = 32_000;

const PROVIDER = PROVIDERS.anthropic;
const ERROR_CONTEXT = {
  providerLabel: PROVIDER.label,
  vendorName: "Anthropic",
  keyEnvVar: PROVIDER.keyEnvVar ?? "ANTHROPIC_API_KEY",
};

/**
 * Calls Claude through the Anthropic Messages API with an API key. Every
 * request streams (one code path for short and long outputs), uses adaptive
 * thinking with the request's effort, structured JSON output, and caches the
 * system prompt.
 */
export class AnthropicApiClient implements LlmClient {
  readonly providerLabel = PROVIDER.label;
  private readonly client: Anthropic;

  constructor(private readonly options: AnthropicApiClientOptions) {
    this.client = new Anthropic({
      apiKey: options.apiKey,
      timeout: options.timeoutMs,
      maxRetries: options.maxRetries ?? 2,
      fetch: options.fetch,
    });
  }

  async generateStructured<T>(request: StructuredRequest<T>): Promise<T> {
    const abortController = new AbortController();
    const deadline = setTimeout(() => abortController.abort(), this.options.timeoutMs);
    const startedAt = Date.now();

    try {
      const message = await this.send(request, abortController.signal);
      logger.info("AI request ended", {
        provider: "anthropic",
        task: request.task,
        model: this.options.model,
        durationMs: Date.now() - startedAt,
        stopReason: message.stop_reason,
        usage: {
          input: message.usage.input_tokens,
          output: message.usage.output_tokens,
          cacheRead: message.usage.cache_read_input_tokens ?? 0,
          cacheWrite: message.usage.cache_creation_input_tokens ?? 0,
        },
      });
      return this.parseMessage(request, message);
    } catch (error) {
      if (error instanceof AiGenerationError) throw error;
      const kind = classifyError(error, abortController.signal.aborted);
      logger.warn("AI request failed", {
        provider: "anthropic",
        task: request.task,
        durationMs: Date.now() - startedAt,
        kind,
        error: JSON.parse(
          redactSecrets(JSON.stringify(safeErrorContext(error)), [this.options.apiKey]),
        ),
      });
      throw mapProviderError(kind, ERROR_CONTEXT);
    } finally {
      clearTimeout(deadline);
    }
  }

  private send<T>(request: StructuredRequest<T>, signal: AbortSignal): Promise<Message> {
    // Use zodOutputFormat only for its API-compatible JSON schema. Without its
    // `parse` hook the SDK won't parse before we've checked the stop reason
    // (a truncated answer would otherwise surface as a JSON error).
    const { schema } = zodOutputFormat(request.schema);
    const stream = this.client.messages.stream(
      {
        model: this.options.model,
        max_tokens: MAX_OUTPUT_TOKENS,
        thinking: { type: "adaptive" },
        output_config: { effort: request.effort, format: { type: "json_schema", schema } },
        system: [
          { type: "text", text: request.systemPrompt, cache_control: { type: "ephemeral" } },
        ],
        messages: [{ role: "user", content: request.prompt }],
      },
      { signal },
    );
    return stream.finalMessage();
  }

  private parseMessage<T>(request: StructuredRequest<T>, message: Message): T {
    if (message.stop_reason === "refusal") throw this.fail(request, "refused");
    if (
      message.stop_reason === "max_tokens" ||
      message.stop_reason === "model_context_window_exceeded"
    ) {
      throw this.fail(request, "truncated");
    }

    const text = message.content.map((block) => (block.type === "text" ? block.text : "")).join("");
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw this.fail(request, "bad_output");
    }

    const parsed = request.schema.safeParse(json);
    if (!parsed.success) {
      logger.warn("AI output failed validation", {
        provider: "anthropic",
        task: request.task,
        issues: parsed.error.issues.slice(0, 5).map((issue) => issue.path.join(".")),
      });
      throw mapProviderError("bad_output", ERROR_CONTEXT);
    }
    return parsed.data;
  }

  private fail(request: StructuredRequest<unknown>, kind: ProviderErrorKind): AiGenerationError {
    logger.warn("AI response unusable", { provider: "anthropic", task: request.task, kind });
    return mapProviderError(kind, ERROR_CONTEXT);
  }
}

function classifyError(error: unknown, deadlinePassed: boolean): ProviderErrorKind {
  if (deadlinePassed || error instanceof APIConnectionTimeoutError) return "timeout";
  if (error instanceof APIUserAbortError) return "timeout";
  if (error instanceof AuthenticationError || error instanceof PermissionDeniedError) {
    return "invalid_key";
  }
  if (error instanceof RateLimitError) return "rate_limited";
  if (error instanceof APIError) {
    const type = String(error.type ?? "");
    if (
      type === "billing_error" ||
      (error.status === 400 && /credit balance/i.test(error.message))
    ) {
      return "no_credit";
    }
    if (error.status === 529 || type === "overloaded_error") return "overloaded";
    return "unavailable";
  }
  if (error instanceof SyntaxError) return "bad_output";
  return "unavailable";
}
