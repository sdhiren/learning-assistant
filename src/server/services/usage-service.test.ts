import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { LlmCallRecord } from "@/server/ai/instrumented-llm-client";
import { estimateCostUsd } from "@/server/ai/pricing";
import { createDatabase } from "@/server/db/client";
import { LlmCallRepository } from "@/server/repositories/llm-call-repository";

import { UsageService } from "./usage-service";

const NOW = new Date(2026, 9, 15, 12); // 15 Oct 2026, local time

function setup(records: Partial<LlmCallRecord>[]) {
  const repository = new LlmCallRepository(createDatabase(":memory:"));
  for (const record of records) {
    repository.insert({
      id: randomUUID(),
      task: "generate-quiz",
      provider: "openai",
      model: "gpt-5",
      startedAt: NOW,
      durationMs: 1000,
      apiDurationMs: null,
      outcome: "ok",
      inputTokens: 100,
      outputTokens: 10,
      cacheReadTokens: 0,
      cacheWriteTokens: null,
      costUsd: null,
      quizId: null,
      conceptId: null,
      requestId: null,
      ...record,
    });
  }
  return new UsageService(repository, () => NOW).getUsage();
}

describe("UsageService", () => {
  it("has empty tables when nothing was recorded", () => {
    expect(setup([])).toMatchObject({ tasks: [], providers: [], windowDays: 30 });
  });

  it("counts calls and failures per task within the last 30 days only", () => {
    const usage = setup([
      { outcome: "ok" },
      { outcome: "timeout" },
      { outcome: "timeout" },
      { outcome: "auth", startedAt: new Date(NOW.getTime() - 29 * 86_400_000) },
      { outcome: "ok", startedAt: new Date(NOW.getTime() - 31 * 86_400_000) },
    ]);

    expect(usage.tasks).toEqual([
      expect.objectContaining({
        task: "generate-quiz",
        calls: 4,
        failureCount: 3,
        failures: { timeout: 2, auth: 1 },
      }),
    ]);
  });

  it("computes p50/p95 latency from successful calls only", () => {
    const usage = setup([
      ...Array.from({ length: 20 }, (_, i) => ({ durationMs: (i + 1) * 100 })),
      { durationMs: 999_999, outcome: "timeout" as const },
    ]);

    expect(usage.tasks[0]).toMatchObject({ p50Ms: 1000, p95Ms: 1900 });
  });

  it("totals tokens for the current calendar month per provider and model", () => {
    const usage = setup([
      { inputTokens: 1_000_000, outputTokens: 100_000, cacheReadTokens: 0 },
      { inputTokens: null, outputTokens: null },
      { inputTokens: 5, startedAt: new Date(2026, 8, 30, 23, 59) },
    ]);

    expect(usage.monthStart).toEqual(new Date(2026, 9, 1));
    expect(usage.providers).toEqual([
      expect.objectContaining({
        provider: "openai",
        providerName: "OpenAI API",
        isSubscription: false,
        calls: 2,
        inputTokens: 1_000_000,
        outputTokens: 100_000,
        reportedCostUsd: null,
        estimatedCostUsd: estimateCostUsd("gpt-5", {
          inputTokens: 1_000_000,
          outputTokens: 100_000,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        }),
      }),
    ]);
  });

  it("shows the subscription's reported cost, never an estimate, and keeps providers apart", () => {
    const usage = setup([
      { provider: "claude-code", model: "claude-opus-5-5", costUsd: 0.25 },
      { provider: "claude-code", model: "claude-opus-5-5", costUsd: 0.5 },
      { provider: "openai", model: "gpt-5" },
      { provider: "gemini", model: "gemini-unknown" },
    ]);

    const byProvider = Object.fromEntries(usage.providers.map((row) => [row.provider, row]));
    expect(byProvider["claude-code"]).toMatchObject({
      providerName: "Claude subscription",
      isSubscription: true,
      reportedCostUsd: 0.75,
      estimatedCostUsd: null,
    });
    expect(byProvider.openai!.estimatedCostUsd).toBeGreaterThan(0);
    expect(byProvider.gemini!.estimatedCostUsd).toBeNull();
    expect(usage).not.toHaveProperty("totalCostUsd");
  });
});
