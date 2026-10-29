import type { z } from "zod";

export type ReasoningEffort = "low" | "medium" | "high";

export interface StructuredRequest<T> {
  /** Short label for logs, e.g. "generate-quiz". Never include user content. */
  task: string;
  systemPrompt: string;
  prompt: string;
  /** The response must match this schema; it is also sent to the model. */
  schema: z.ZodType<T>;
  effort: ReasoningEffort;
  /** Quiz this call belongs to, for usage records. An id only, never content. */
  quizId?: string;
  /** Concept this call is about, for usage records. An id only, never content. */
  conceptId?: string;
}

/**
 * Token counts and costs a provider reported for one call. Each field is null
 * when the provider doesn't report it.
 */
export interface LlmUsage {
  inputTokens: number | null;
  /** Includes reasoning/thinking tokens, which are billed as output. */
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  /** Time the provider spent on the request, when it reports it. */
  apiDurationMs?: number | null;
  /** Cost the provider itself reports (only the Claude Agent SDK does). */
  costUsd?: number | null;
}

/** Optional callbacks for instrumentation. Services never pass them. */
export interface GenerationHooks {
  /**
   * Called once a provider response arrives, before it is parsed, so refused,
   * truncated and invalid responses still report their tokens.
   */
  onUsage?(usage: LlmUsage): void;
}

/**
 * The application's only dependency on a language model. Services depend on
 * this interface, so the provider can be swapped (Claude subscription, an
 * Anthropic API key, later OpenAI or Gemini; see `providers.ts`) and tests can
 * use a fake.
 */
export interface LlmClient {
  /** Name for user-facing copy, e.g. "Claude" or "GPT". */
  readonly providerLabel: string;
  generateStructured<T>(request: StructuredRequest<T>, hooks?: GenerationHooks): Promise<T>;
}
