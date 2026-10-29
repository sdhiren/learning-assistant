import "server-only";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import type { LlmCallOutcome } from "@/domain/usage-stats";
import { logger } from "@/server/logger";
import { getRequestContext } from "@/server/request-context";

import type { GenerationHooks, LlmClient, LlmUsage, StructuredRequest } from "./llm-client";
import { ProviderError, type ProviderErrorKind } from "./provider-errors";

/** One `llm_calls` row. Built from an allow-list: never prompts, answers or keys. */
export interface LlmCallRecord {
  id: string;
  task: string;
  provider: string;
  model: string;
  startedAt: Date;
  durationMs: number;
  apiDurationMs: number | null;
  outcome: LlmCallOutcome;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  costUsd: number | null;
  quizId: string | null;
  conceptId: string | null;
  requestId: string | null;
}

/** Where call records go. Defined here so `server/ai` doesn't import repositories. */
export interface LlmCallSink {
  insert(record: LlmCallRecord): void;
}

interface InstrumentedLlmClientOptions {
  provider: string;
  model: string;
  sink: LlmCallSink;
  now?: () => Date;
  /** Monotonic milliseconds, for durations. */
  monotonic?: () => number;
}

const OUTCOME_BY_KIND: Record<ProviderErrorKind, LlmCallOutcome> = {
  timeout: "timeout",
  refused: "refused",
  bad_output: "invalid_output",
  truncated: "invalid_output",
  invalid_key: "auth",
  no_credit: "auth",
  rate_limited: "rate_limited",
  overloaded: "rate_limited",
  unavailable: "error",
};

/** The stored outcome for a failed call, from the typed error (never its message). */
export function classifyOutcome(error: unknown): LlmCallOutcome {
  if (error instanceof ProviderError) return OUTCOME_BY_KIND[error.kind];
  if (error instanceof z.ZodError) return "invalid_output";
  return "error";
}

/**
 * Wraps any LlmClient to time each call, classify how it ended, and record
 * exactly one row and one `llm.call` log line. Recording never changes the
 * call's result or error.
 */
export class InstrumentedLlmClient implements LlmClient {
  private readonly now: () => Date;
  private readonly monotonic: () => number;

  constructor(
    private readonly inner: LlmClient,
    private readonly options: InstrumentedLlmClientOptions,
  ) {
    this.now = options.now ?? (() => new Date());
    this.monotonic = options.monotonic ?? (() => performance.now());
  }

  get providerLabel(): string {
    return this.inner.providerLabel;
  }

  async generateStructured<T>(request: StructuredRequest<T>, hooks?: GenerationHooks): Promise<T> {
    const startedAt = this.now();
    const start = this.monotonic();
    let usage: LlmUsage | undefined;
    let outcome: LlmCallOutcome = "error";
    let kind: ProviderErrorKind | undefined;

    try {
      const result = await this.inner.generateStructured(request, {
        onUsage: (reported) => {
          usage = reported;
          hooks?.onUsage?.(reported);
        },
      });
      outcome = "ok";
      return result;
    } catch (error) {
      outcome = classifyOutcome(error);
      if (error instanceof ProviderError) kind = error.kind;
      throw error;
    } finally {
      this.record(request, {
        startedAt,
        durationMs: Math.max(0, Math.round(this.monotonic() - start)),
        outcome,
        kind,
        usage,
      });
    }
  }

  private record(
    request: StructuredRequest<unknown>,
    call: {
      startedAt: Date;
      durationMs: number;
      outcome: LlmCallOutcome;
      kind: ProviderErrorKind | undefined;
      usage: LlmUsage | undefined;
    },
  ) {
    const { usage } = call;
    const record: LlmCallRecord = {
      id: randomUUID(),
      task: request.task,
      provider: this.options.provider,
      model: this.options.model,
      startedAt: call.startedAt,
      durationMs: call.durationMs,
      apiDurationMs: usage?.apiDurationMs ?? null,
      outcome: call.outcome,
      inputTokens: usage?.inputTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
      cacheReadTokens: usage?.cacheReadTokens ?? null,
      cacheWriteTokens: usage?.cacheWriteTokens ?? null,
      costUsd: usage?.costUsd ?? null,
      quizId: request.quizId ?? null,
      conceptId: request.conceptId ?? null,
      requestId: getRequestContext()?.requestId ?? null,
    };

    try {
      this.options.sink.insert(record);
    } catch (error) {
      logger.warn("Failed to record AI call", {
        task: record.task,
        error: { name: error instanceof Error ? error.name : typeof error },
      });
    }

    // The logger adds requestId and action itself.
    const fields = {
      task: record.task,
      provider: record.provider,
      model: record.model,
      outcome: record.outcome,
      durationMs: record.durationMs,
      apiDurationMs: record.apiDurationMs,
      inputTokens: record.inputTokens,
      outputTokens: record.outputTokens,
      cacheReadTokens: record.cacheReadTokens,
      cacheWriteTokens: record.cacheWriteTokens,
      costUsd: record.costUsd,
      quizId: record.quizId,
      conceptId: record.conceptId,
    };
    if (call.outcome === "ok") logger.info("llm.call", fields);
    else logger.warn("llm.call", { ...fields, kind: call.kind });
  }
}
