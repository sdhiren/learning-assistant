import "server-only";

import { ApiError, FinishReason, GoogleGenAI, type GenerateContentResponse } from "@google/genai";

import { AiGenerationError } from "@/lib/errors";
import { logger } from "@/server/logger";

import type { LlmClient, ReasoningEffort, StructuredRequest } from "./llm-client";
import {
  mapProviderError,
  redactSecrets,
  safeErrorContext,
  type ProviderErrorKind,
} from "./provider-errors";
import { PROVIDERS } from "./providers";
import { toProviderJsonSchema } from "./schema-adapter";

interface GeminiClientOptions {
  apiKey: string;
  model: string;
  /** Overall deadline per request, including the SDK's retries. */
  timeoutMs: number;
  maxRetries?: number;
  /** Injected in tests to fake the HTTP layer. */
  fetch?: typeof fetch;
}

/**
 * Upper bound on output tokens: the gemini-2.5-pro maximum. Thinking tokens
 * count against it, so a high thinking budget plus a long lesson must fit.
 */
export const GEMINI_MAX_OUTPUT_TOKENS = 65_536;

const THINKING_BUDGETS: Record<ReasoningEffort, number> = {
  low: 2048,
  medium: 8192,
  high: 24_576,
};

/**
 * Fixed thinking budgets per effort, rather than -1 (dynamic), so the output
 * ceiling stays predictable. gemini-2.5-pro can't turn thinking off (minimum
 * 128); Gemini 3 models still accept `thinkingBudget`.
 */
export function geminiThinkingBudget(effort: ReasoningEffort): number {
  return THINKING_BUDGETS[effort];
}

/** Finish or block reasons that mean the model (or its safety filters) declined. */
const REFUSAL_REASONS = new Set<string>([
  FinishReason.SAFETY,
  FinishReason.RECITATION,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.BLOCKLIST,
  FinishReason.SPII,
]);

const PROVIDER = PROVIDERS.gemini;
const ERROR_CONTEXT = {
  providerLabel: PROVIDER.label,
  vendorName: "Google AI Studio",
  keyEnvVar: PROVIDER.keyEnvVar ?? "GEMINI_API_KEY",
};

/**
 * Calls Gemini through the Gemini API (`@google/genai`) with an API key, JSON
 * output constrained by `responseJsonSchema`, and a thinking budget from the
 * request's effort.
 */
export class GeminiClient implements LlmClient {
  readonly providerLabel = PROVIDER.label;
  private readonly client: GoogleGenAI;

  constructor(private readonly options: GeminiClientOptions) {
    this.client = new GoogleGenAI({
      apiKey: options.apiKey,
      httpOptions: {
        timeout: options.timeoutMs,
        // `attempts` counts the first call. Retries 408, 429 and 5xx.
        retryOptions: { attempts: (options.maxRetries ?? 2) + 1 },
        fetch: options.fetch,
      },
    });
  }

  async generateStructured<T>(request: StructuredRequest<T>): Promise<T> {
    const abortController = new AbortController();
    const deadline = setTimeout(() => abortController.abort(), this.options.timeoutMs);
    const startedAt = Date.now();

    try {
      const response = await this.send(request, abortController.signal);
      const usage = response.usageMetadata;
      logger.info("AI request ended", {
        provider: "gemini",
        task: request.task,
        model: this.options.model,
        durationMs: Date.now() - startedAt,
        finishReason: response.candidates?.[0]?.finishReason,
        usage: {
          input: usage?.promptTokenCount ?? 0,
          output: usage?.candidatesTokenCount ?? 0,
          cacheRead: usage?.cachedContentTokenCount ?? 0,
          thinking: usage?.thoughtsTokenCount ?? 0,
        },
      });
      return this.parseResponse(request, response);
    } catch (error) {
      if (error instanceof AiGenerationError) throw error;
      const kind = classifyError(error, abortController.signal.aborted);
      logger.warn("AI request failed", {
        provider: "gemini",
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

  private send<T>(
    request: StructuredRequest<T>,
    abortSignal: AbortSignal,
  ): Promise<GenerateContentResponse> {
    return this.client.models.generateContent({
      model: this.options.model,
      contents: request.prompt,
      config: {
        systemInstruction: request.systemPrompt,
        responseMimeType: "application/json",
        responseJsonSchema: toProviderJsonSchema(request.schema, "gemini"),
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
        thinkingConfig: { thinkingBudget: geminiThinkingBudget(request.effort) },
        abortSignal,
      },
    });
  }

  private parseResponse<T>(request: StructuredRequest<T>, response: GenerateContentResponse): T {
    if (response.promptFeedback?.blockReason) throw this.fail(request, "refused");
    const candidate = response.candidates?.[0];
    const finishReason = candidate?.finishReason ?? "";
    if (REFUSAL_REASONS.has(finishReason)) throw this.fail(request, "refused");
    if (finishReason === FinishReason.MAX_TOKENS) throw this.fail(request, "truncated");

    const text = (candidate?.content?.parts ?? [])
      .map((part) => (part.thought ? "" : (part.text ?? "")))
      .join("");
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw this.fail(request, "bad_output");
    }

    const parsed = request.schema.safeParse(json);
    if (!parsed.success) {
      logger.warn("AI output failed validation", {
        provider: "gemini",
        task: request.task,
        issues: parsed.error.issues.slice(0, 5).map((issue) => issue.path.join(".")),
      });
      throw mapProviderError("bad_output", ERROR_CONTEXT);
    }
    return parsed.data;
  }

  private fail(request: StructuredRequest<unknown>, kind: ProviderErrorKind): AiGenerationError {
    logger.warn("AI response unusable", { provider: "gemini", task: request.task, kind });
    return mapProviderError(kind, ERROR_CONTEXT);
  }
}

function classifyError(error: unknown, deadlinePassed: boolean): ProviderErrorKind {
  if (deadlinePassed) return "timeout";
  if (error instanceof Error && error.name === "AbortError") return "timeout";
  if (error instanceof ApiError) {
    // The Gemini API answers a bad key with 400 INVALID_ARGUMENT "API key not valid".
    if (error.status === 401 || error.status === 403) return "invalid_key";
    if (error.status === 400 && /API key not valid|API_KEY_INVALID/i.test(error.message)) {
      return "invalid_key";
    }
    // 429 covers both rate limits and quota; only a clear billing message means no credit.
    if (error.status === 429) {
      return /billing|prepay|credits? (are |is )?(depleted|exhausted)/i.test(error.message)
        ? "no_credit"
        : "rate_limited";
    }
    if (error.status === 503) return "overloaded";
  }
  return "unavailable";
}
