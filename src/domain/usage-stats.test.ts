import { describe, expect, it } from "vitest";

import { estimateCostUsd, MODEL_PRICES } from "@/server/ai/pricing";

import { percentile, startOfMonth } from "./usage-stats";

describe("percentile", () => {
  it("is null for no values and the value itself for one", () => {
    expect(percentile([], 50)).toBeNull();
    expect(percentile([42], 95)).toBe(42);
  });

  it("uses the nearest rank", () => {
    const twenty = Array.from({ length: 20 }, (_, i) => 20 - i);
    expect(percentile(twenty, 50)).toBe(10);
    expect(percentile(twenty, 95)).toBe(19);
    expect(percentile(twenty, 100)).toBe(20);
    expect(percentile(twenty, 0)).toBe(1);
  });
});

describe("startOfMonth", () => {
  it("returns local midnight on the first", () => {
    expect(startOfMonth(new Date(2026, 1, 28, 23, 59))).toEqual(new Date(2026, 1, 1));
  });
});

describe("estimateCostUsd", () => {
  it("prices every token type for a known model", () => {
    const price = MODEL_PRICES["claude-opus-5-5"]!;
    expect(
      estimateCostUsd("claude-opus-5-5", {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        cacheReadTokens: 1_000_000,
        cacheWriteTokens: 1_000_000,
      }),
    ).toBeCloseTo(price.input + price.output + price.cacheRead + price.cacheWrite);
  });

  it("is null for an unknown model", () => {
    expect(
      estimateCostUsd("mystery-model", {
        inputTokens: 1,
        outputTokens: 1,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      }),
    ).toBeNull();
  });
});
