import { percentile, startOfMonth } from "@/domain/usage-stats";
import { estimateCostUsd, PRICES_AS_OF } from "@/server/ai/pricing";
import { PROVIDER_IDS, PROVIDERS, type ProviderId } from "@/server/ai/providers";
import type { LlmCallRepository } from "@/server/repositories/llm-call-repository";

import type { ProviderUsageView, TaskUsageView, UsageView } from "./view-models";

/** Days of history in the per-task table. */
export const USAGE_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Aggregates `llm_calls` for the Usage page. */
export class UsageService {
  constructor(
    private readonly llmCallRepository: LlmCallRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  getUsage(): UsageView {
    const now = this.now();
    const windowStart = new Date(now.getTime() - USAGE_WINDOW_DAYS * DAY_MS);
    const monthStart = startOfMonth(now);
    return {
      tasks: this.taskUsage(windowStart),
      windowDays: USAGE_WINDOW_DAYS,
      providers: this.providerUsage(monthStart),
      monthStart,
      pricesAsOf: PRICES_AS_OF,
    };
  }

  private taskUsage(since: Date): TaskUsageView[] {
    const byTask = new Map<string, TaskUsageView>();
    for (const { task, outcome, calls } of this.llmCallRepository.countsByTaskAndOutcome(since)) {
      const view = byTask.get(task) ?? {
        task,
        calls: 0,
        failures: {},
        failureCount: 0,
        p50Ms: null,
        p95Ms: null,
      };
      view.calls += calls;
      if (outcome !== "ok") {
        view.failures[outcome] = (view.failures[outcome] ?? 0) + calls;
        view.failureCount += calls;
      }
      byTask.set(task, view);
    }

    const durations = new Map<string, number[]>();
    for (const { task, durationMs } of this.llmCallRepository.okDurationsByTask(since)) {
      durations.set(task, [...(durations.get(task) ?? []), durationMs]);
    }
    for (const view of byTask.values()) {
      const values = durations.get(view.task) ?? [];
      view.p50Ms = percentile(values, 50);
      view.p95Ms = percentile(values, 95);
    }

    return [...byTask.values()].sort((a, b) => b.calls - a.calls || a.task.localeCompare(b.task));
  }

  private providerUsage(since: Date): ProviderUsageView[] {
    return this.llmCallRepository.tokenTotalsByProviderModel(since).map((row) => {
      const info = isProviderId(row.provider) ? PROVIDERS[row.provider] : undefined;
      const reportedCostUsd = row.reportedCostCalls > 0 ? row.reportedCostUsd : null;
      return {
        provider: row.provider,
        providerName: info?.displayName ?? row.provider,
        model: row.model,
        isSubscription: info?.isSubscription ?? false,
        calls: row.calls,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        cacheReadTokens: row.cacheReadTokens,
        cacheWriteTokens: row.cacheWriteTokens,
        reportedCostUsd,
        estimatedCostUsd: reportedCostUsd === null ? estimateCostUsd(row.model, row) : null,
      };
    });
  }
}

function isProviderId(value: string): value is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(value);
}
