/** How an AI call ended, as stored in `llm_calls.outcome`. */
export const LLM_CALL_OUTCOMES = [
  "ok",
  "timeout",
  "invalid_output",
  "refused",
  "auth",
  "rate_limited",
  "error",
] as const;
export type LlmCallOutcome = (typeof LLM_CALL_OUTCOMES)[number];

/** Nearest-rank percentile (`p` from 0 to 100) of `values`, or null when there are none. */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(Math.max(rank, 1), sorted.length) - 1]!;
}

/** Midnight on the first day of `date`'s month, in local time. */
export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
