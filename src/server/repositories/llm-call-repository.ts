import { and, count, eq, gte, sql, sum } from "drizzle-orm";

import type { LlmCallOutcome } from "@/domain/usage-stats";
import type { LlmCallRecord, LlmCallSink } from "@/server/ai/instrumented-llm-client";
import type { AppDatabase } from "@/server/db/client";
import { llmCalls } from "@/server/db/schema";

export interface TaskOutcomeCount {
  task: string;
  outcome: LlmCallOutcome;
  calls: number;
}

export interface TaskDuration {
  task: string;
  durationMs: number;
}

export interface ProviderModelTotals {
  provider: string;
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** Sum of provider-reported costs; only meaningful when `reportedCostCalls` > 0. */
  reportedCostUsd: number;
  reportedCostCalls: number;
}

const total = (column: Parameters<typeof sum>[0]) => sql<number>`coalesce(${sum(column)}, 0)`;

export class LlmCallRepository implements LlmCallSink {
  constructor(private readonly db: AppDatabase) {}

  insert(record: LlmCallRecord): void {
    this.db.insert(llmCalls).values(record).run();
  }

  countsByTaskAndOutcome(since: Date): TaskOutcomeCount[] {
    return this.db
      .select({ task: llmCalls.task, outcome: llmCalls.outcome, calls: count() })
      .from(llmCalls)
      .where(gte(llmCalls.startedAt, since))
      .groupBy(llmCalls.task, llmCalls.outcome)
      .all();
  }

  okDurationsByTask(since: Date): TaskDuration[] {
    return this.db
      .select({ task: llmCalls.task, durationMs: llmCalls.durationMs })
      .from(llmCalls)
      .where(and(gte(llmCalls.startedAt, since), eq(llmCalls.outcome, "ok")))
      .all();
  }

  tokenTotalsByProviderModel(since: Date): ProviderModelTotals[] {
    return this.db
      .select({
        provider: llmCalls.provider,
        model: llmCalls.model,
        calls: count(),
        inputTokens: total(llmCalls.inputTokens),
        outputTokens: total(llmCalls.outputTokens),
        cacheReadTokens: total(llmCalls.cacheReadTokens),
        cacheWriteTokens: total(llmCalls.cacheWriteTokens),
        reportedCostUsd: sql<number>`coalesce(sum(${llmCalls.costUsd}), 0)`,
        reportedCostCalls: count(llmCalls.costUsd),
      })
      .from(llmCalls)
      .where(gte(llmCalls.startedAt, since))
      .groupBy(llmCalls.provider, llmCalls.model)
      .all()
      .map((row) => ({
        ...row,
        inputTokens: Number(row.inputTokens),
        outputTokens: Number(row.outputTokens),
        cacheReadTokens: Number(row.cacheReadTokens),
        cacheWriteTokens: Number(row.cacheWriteTokens),
        reportedCostUsd: Number(row.reportedCostUsd),
      }));
  }
}
