/**
 * List prices in USD per million tokens, used only to show an *estimated*
 * cost on the Usage page. Nothing is frozen into `llm_calls`, so correcting a
 * price here also corrects past months. Unknown models get no estimate.
 */
export const PRICES_AS_OF = "2026-10-29";

export interface ModelPrice {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export const MODEL_PRICES: Record<string, ModelPrice> = {
  "claude-opus-5-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "gpt-5": { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 0 },
  // Prompts up to 200k tokens (every prompt this app sends).
  "gemini-2.5-pro": { input: 1.25, output: 10, cacheRead: 0.31, cacheWrite: 0 },
};

export interface TokenCounts {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** Estimated cost in USD, or null for a model missing from the price table. */
export function estimateCostUsd(model: string, tokens: TokenCounts): number | null {
  const price = MODEL_PRICES[model];
  if (!price) return null;
  return (
    (tokens.inputTokens * price.input +
      tokens.outputTokens * price.output +
      tokens.cacheReadTokens * price.cacheRead +
      tokens.cacheWriteTokens * price.cacheWrite) /
    1_000_000
  );
}
