import "server-only";

import { AnthropicApiClient } from "@/server/ai/anthropic-api-client";
import { ClaudeAgentClient } from "@/server/ai/claude-agent-client";
import { GeminiClient } from "@/server/ai/gemini-client";
import type { LlmClient } from "@/server/ai/llm-client";
import { OpenAiClient } from "@/server/ai/openai-client";
import { PROVIDERS, type ProviderId } from "@/server/ai/providers";
import { getAiConfig, getEnv, type AiConfig } from "@/server/config/env";
import { createDatabase, type AppDatabase } from "@/server/db/client";
import { QuizRepository } from "@/server/repositories/quiz-repository";
import { ReadingRepository } from "@/server/repositories/reading-repository";
import { TopicRepository } from "@/server/repositories/topic-repository";
import { DashboardService } from "@/server/services/dashboard-service";
import { ProgressService } from "@/server/services/progress-service";
import { QuizService } from "@/server/services/quiz-service";
import { ReadingService } from "@/server/services/reading-service";
import { SubtopicService } from "@/server/services/subtopic-service";
import { TopicService } from "@/server/services/topic-service";

/** The composition root: the only place concrete implementations are wired together. */
export interface Services {
  dashboard: DashboardService;
  topics: TopicService;
  subtopics: SubtopicService;
  quizzes: QuizService;
  readings: ReadingService;
}

// Only the database connection survives dev hot reloads; services are rebuilt
// from the current module code so edits take effect without a restart.
const globalForDb = globalThis as typeof globalThis & { __learningAssistantDb?: AppDatabase };

function getDatabase(): AppDatabase {
  globalForDb.__learningAssistantDb ??= createDatabase(getEnv().DATABASE_PATH);
  return globalForDb.__learningAssistantDb;
}

/** Builds the client for the configured provider. Env validation rejects unimplemented ones. */
export function createLlmClient(config: AiConfig): LlmClient {
  switch (config.provider) {
    case "claude-code":
      return new ClaudeAgentClient({ model: config.model, timeoutMs: config.timeoutMs });
    case "anthropic":
      if (!config.apiKey) throw new Error("AI_PROVIDER=anthropic needs ANTHROPIC_API_KEY");
      return new AnthropicApiClient({
        apiKey: config.apiKey,
        model: config.model,
        timeoutMs: config.timeoutMs,
      });
    case "openai":
      if (!config.apiKey) throw new Error("AI_PROVIDER=openai needs OPENAI_API_KEY");
      return new OpenAiClient({
        apiKey: config.apiKey,
        model: config.model,
        timeoutMs: config.timeoutMs,
      });
    case "gemini":
      if (!config.apiKey) throw new Error("AI_PROVIDER=gemini needs GEMINI_API_KEY");
      return new GeminiClient({
        apiKey: config.apiKey,
        model: config.model,
        timeoutMs: config.timeoutMs,
      });
    default: {
      const unknown: never = config.provider;
      throw new Error(`Unknown AI_PROVIDER: ${String(unknown)}`);
    }
  }
}

export interface AiProviderInfo {
  id: ProviderId;
  label: string;
  usageNote: string;
}

/** The active provider's display data for the UI. Plain, serializable, and never the key. */
export function getAiProviderInfo(): AiProviderInfo {
  const { provider } = getAiConfig();
  const { label, usageNote } = PROVIDERS[provider];
  return { id: provider, label, usageNote };
}

function createServices(): Services {
  const db = getDatabase();
  const llm = createLlmClient(getAiConfig());

  const topicRepository = new TopicRepository(db);
  const quizRepository = new QuizRepository(db);
  const readingRepository = new ReadingRepository(db);
  const progressService = new ProgressService(quizRepository);

  return {
    dashboard: new DashboardService(topicRepository, quizRepository, progressService),
    topics: new TopicService(topicRepository, quizRepository, progressService, llm),
    subtopics: new SubtopicService(topicRepository, progressService, llm),
    quizzes: new QuizService(topicRepository, quizRepository, progressService, llm),
    readings: new ReadingService(topicRepository, readingRepository, progressService, llm),
  };
}

let services: Services | undefined;

export function getServices(): Services {
  services ??= createServices();
  return services;
}
