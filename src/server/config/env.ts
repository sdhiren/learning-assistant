import "server-only";

import { z } from "zod";

import {
  CLAUDE_MODEL_PROVIDERS,
  PROVIDER_IDS,
  PROVIDERS,
  type ProviderId,
} from "@/server/ai/providers";
import { logger } from "@/server/logger";

const modelId = (name: string) =>
  z.string().regex(/^[a-z0-9._-]+$/, `${name} must be a model id such as claude-opus-5-5`);

const optionalKey = z.string().trim().min(1).optional();

const envSchema = z
  .object({
    DATABASE_PATH: z.string().min(1).default("./data/learning-assistant.db"),
    AI_PROVIDER: z.enum(PROVIDER_IDS).default("claude-code"),
    AI_MODEL: modelId("AI_MODEL").optional(),
    /** Deprecated alias for AI_MODEL, honoured for the Claude providers only. */
    CLAUDE_MODEL: modelId("CLAUDE_MODEL").optional(),
    ANTHROPIC_API_KEY: optionalKey,
    OPENAI_API_KEY: optionalKey,
    GEMINI_API_KEY: optionalKey,
    AI_TIMEOUT_MS: z.coerce.number().int().min(10_000).max(600_000).default(180_000),
  })
  .superRefine((env, ctx) => {
    const provider = PROVIDERS[env.AI_PROVIDER];
    if (!provider.implemented) {
      ctx.addIssue({
        code: "custom",
        path: ["AI_PROVIDER"],
        message: `AI_PROVIDER=${env.AI_PROVIDER} is not available yet. Use claude-code or anthropic.`,
      });
      return;
    }
    if (provider.needsKey && provider.keyEnvVar && !env[provider.keyEnvVar as KeyEnvVar]) {
      ctx.addIssue({
        code: "custom",
        path: [provider.keyEnvVar],
        message: `AI_PROVIDER=${env.AI_PROVIDER} needs ${provider.keyEnvVar} (set it in .env.local)`,
      });
    }
  });

type KeyEnvVar = "ANTHROPIC_API_KEY" | "OPENAI_API_KEY" | "GEMINI_API_KEY";

export type Env = z.infer<typeof envSchema>;

export interface AiConfig {
  provider: ProviderId;
  model: string;
  /** Only set for providers that need a key. Never log or return this to the browser. */
  apiKey?: string;
  timeoutMs: number;
}

let cachedEnv: Env | undefined;
let warnedAboutClaudeModel = false;

/** Parses a raw environment. Exported for tests; the app uses `getEnv()`. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    // prettifyError prints messages and paths, never the submitted values (keys stay secret).
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

/** Validated server configuration. Fails fast with a readable message. */
export function getEnv(): Env {
  cachedEnv ??= parseEnv(process.env);
  return cachedEnv;
}

/**
 * The active AI provider and model. Model precedence: AI_MODEL, then the
 * deprecated CLAUDE_MODEL (Claude providers only), then the provider default.
 */
export function resolveAiConfig(env: Env): AiConfig {
  const provider = PROVIDERS[env.AI_PROVIDER];
  const claudeModel = CLAUDE_MODEL_PROVIDERS.includes(env.AI_PROVIDER)
    ? env.CLAUDE_MODEL
    : undefined;

  if (env.CLAUDE_MODEL && !warnedAboutClaudeModel) {
    warnedAboutClaudeModel = true;
    logger.warn("CLAUDE_MODEL is deprecated; use AI_MODEL instead", {
      ignored: Boolean(env.AI_MODEL) || !claudeModel,
    });
  }

  return {
    provider: env.AI_PROVIDER,
    model: env.AI_MODEL ?? claudeModel ?? provider.defaultModel,
    apiKey: provider.keyEnvVar ? env[provider.keyEnvVar as KeyEnvVar] : undefined,
    timeoutMs: env.AI_TIMEOUT_MS,
  };
}

export function getAiConfig(): AiConfig {
  return resolveAiConfig(getEnv());
}
