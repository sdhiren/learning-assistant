import "server-only";

import { z } from "zod";

const envSchema = z.object({
  DATABASE_PATH: z.string().min(1).default("./data/learning-assistant.db"),
  CLAUDE_MODEL: z
    .string()
    .regex(/^[a-z0-9.-]+$/, "CLAUDE_MODEL must be a model id such as claude-opus-5-5")
    .default("claude-opus-5-5"),
  AI_TIMEOUT_MS: z.coerce.number().int().min(10_000).max(600_000).default(180_000),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | undefined;

/** Validated server configuration. Fails fast with a readable message. */
export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
  }
  cachedEnv = parsed.data;
  return cachedEnv;
}
