import "server-only";

import OpenAI, {
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  PermissionDeniedError,
  RateLimitError,
} from "openai";
import type { Response as OpenAiResponse } from "openai/resources/responses/responses";

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
import { toProviderJsonSchema } from "./schema-adapter";

interface OpenAiClientOptions {
  apiKey: string;
  model: string;
  /** Overall deadline per request, including the SDK's retries. */
  timeoutMs: number;
  maxRetries?: number;
  /** Injected in tests to fake the HTTP layer. */
  fetch?: typeof fetch;
}

/**
 * Upper bound on output tokens. Reasoning tokens count against it, so it is
 * higher than the Anthropic client's: a long lesson at high effort must fit
 * (gpt-5 allows up to 128k).
 */
export const OPENAI_MAX_OUTPUT_TOKENS = 64_000;

const PROVIDER = PROVIDERS.openai;
const ERROR_CONTEXT = {
  providerLabel: PROVIDER.label,
  vendorName: "OpenAI",
  keyEnvVar: PROVIDER.keyEnvVar ?? "OPENAI_API_KEY",
};

/**
 * Calls an OpenAI reasoning model (gpt-5 by default) through the Responses API
 * with strict structured output. The request's effort maps 1:1 to
 * `reasoning.effort`, so `AI_MODEL` overrides must be reasoning models.
 */
export class OpenAiClient implements LlmClient {
  readonly providerLabel = PROVIDER.label;
  private readonly client: OpenAI;

  constructor(private readonly options: OpenAiClientOptions) {
    this.client = new OpenAI({
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
      const response = await this.send(request, abortController.signal);
      logger.info("AI request ended", {
        provider: "openai",
        task: request.task,
        model: this.options.model,
        durationMs: Date.now() - startedAt,
        status: response.status,
        incompleteReason: response.incomplete_details?.reason,
        usage: {
          input: response.usage?.input_tokens ?? 0,
          output: response.usage?.output_tokens ?? 0,
          cacheRead: response.usage?.input_tokens_details?.cached_tokens ?? 0,
          reasoning: response.usage?.output_tokens_details?.reasoning_tokens ?? 0,
        },
      });
      return this.parseResponse(request, response);
    } catch (error) {
      if (error instanceof AiGenerationError) throw error;
      const kind = classifyError(error, abortController.signal.aborted);
      logger.warn("AI request failed", {
        provider: "openai",
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

  private send<T>(request: StructuredRequest<T>, signal: AbortSignal): Promise<OpenAiResponse> {
    return this.client.responses.create(
      {
        model: this.options.model,
        instructions: request.systemPrompt,
        input: request.prompt,
        reasoning: { effort: request.effort },
        max_output_tokens: OPENAI_MAX_OUTPUT_TOKENS,
        store: false,
        text: {
          format: {
            type: "json_schema",
            name: formatName(request.task),
            schema: toProviderJsonSchema(request.schema, "openai"),
            strict: true,
          },
        },
      },
      { signal },
    );
  }

  private parseResponse<T>(request: StructuredRequest<T>, response: OpenAiResponse): T {
    const content = response.output.flatMap((item) =>
      item.type === "message" ? item.content : [],
    );
    if (content.some((part) => part.type === "refusal")) throw this.fail(request, "refused");
    if (response.status === "incomplete") {
      const reason = response.incomplete_details?.reason;
      throw this.fail(request, reason === "content_filter" ? "refused" : "truncated");
    }

    const text = content.map((part) => (part.type === "output_text" ? part.text : "")).join("");
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw this.fail(request, "bad_output");
    }

    const parsed = request.schema.safeParse(json);
    if (!parsed.success) {
      logger.warn("AI output failed validation", {
        provider: "openai",
        task: request.task,
        issues: parsed.error.issues.slice(0, 5).map((issue) => issue.path.join(".")),
      });
      throw mapProviderError("bad_output", ERROR_CONTEXT);
    }
    return parsed.data;
  }

  private fail(request: StructuredRequest<unknown>, kind: ProviderErrorKind): AiGenerationError {
    logger.warn("AI response unusable", { provider: "openai", task: request.task, kind });
    return mapProviderError(kind, ERROR_CONTEXT);
  }
}

/** The format name must match ^[a-zA-Z0-9_-]{1,64}$. */
function formatName(task: string): string {
  return task.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64) || "output";
}

function classifyError(error: unknown, deadlinePassed: boolean): ProviderErrorKind {
  if (deadlinePassed || error instanceof APIConnectionTimeoutError) return "timeout";
  if (error instanceof APIUserAbortError) return "timeout";
  if (error instanceof AuthenticationError || error instanceof PermissionDeniedError) {
    return "invalid_key";
  }
  if (error instanceof RateLimitError) {
    return error.code === "insufficient_quota" ? "no_credit" : "rate_limited";
  }
  if (error instanceof APIError) {
    return error.status === 503 ? "overloaded" : "unavailable";
  }
  return "unavailable";
}
