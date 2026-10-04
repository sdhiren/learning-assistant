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
}

/**
 * The application's only dependency on a language model. Services depend on
 * this interface, so the provider can be swapped (e.g. Agent SDK vs. API key)
 * and tests can use a fake.
 */
export interface LlmClient {
  generateStructured<T>(request: StructuredRequest<T>): Promise<T>;
}
