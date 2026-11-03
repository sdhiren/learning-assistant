import "server-only";

import { AnthropicApiClient } from "@/server/ai/anthropic-api-client";
import { ClaudeAgentClient } from "@/server/ai/claude-agent-client";
import { GeminiClient } from "@/server/ai/gemini-client";
import { InstrumentedLlmClient } from "@/server/ai/instrumented-llm-client";
import type { LlmClient } from "@/server/ai/llm-client";
import { OpenAiClient } from "@/server/ai/openai-client";
import { PROVIDERS, type ProviderId } from "@/server/ai/providers";
import { getAiConfig, getEnv, type AiConfig } from "@/server/config/env";
import { createRegistryDatabase, type RegistryDatabase } from "@/server/db/app-client";
import { createDatabase, type AppDatabase } from "@/server/db/client";
import { ensureLegacyProfile } from "@/server/registry-bootstrap";
import { LlmCallRepository } from "@/server/repositories/llm-call-repository";
import { QuizRepository } from "@/server/repositories/quiz-repository";
import { ReadingRepository } from "@/server/repositories/reading-repository";
import { TopicRepository } from "@/server/repositories/topic-repository";
import { DashboardService } from "@/server/services/dashboard-service";
import { ProgressService } from "@/server/services/progress-service";
import { QuizService } from "@/server/services/quiz-service";
import { ReadingService } from "@/server/services/reading-service";
import { SubtopicService } from "@/server/services/subtopic-service";
import { TopicService } from "@/server/services/topic-service";
import { AuthService } from "@/server/services/auth-service";
import { UsageService } from "@/server/services/usage-service";

/** The composition root: the only place concrete implementations are wired together. */
export interface Services {
  dashboard: DashboardService;
  topics: TopicService;
  subtopics: SubtopicService;
  quizzes: QuizService;
  readings: ReadingService;
  usage: UsageService;
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

/** What the container needs to know about a profile. */
export interface ProfileRef {
  id: string;
  dbPath: string;
}

export interface ProfileContainerOptions {
  /** Open connections by profile id. Pass a long-lived map so connections survive hot reloads. */
  databases?: Map<string, AppDatabase>;
  openDatabase?: (filePath: string) => AppDatabase;
  createLlm?: (config: AiConfig) => LlmClient;
  aiConfig?: (profile: ProfileRef) => AiConfig;
}

/**
 * One database connection and one services graph per profile. A profile's
 * services hold a connection only to that profile's file, so no query can
 * reach another profile's data. Services are rebuilt when the profile's AI
 * settings change or after `invalidate()`.
 */
export class ProfileContainer {
  private readonly databases: Map<string, AppDatabase>;
  private readonly services = new Map<string, { fingerprint: string; services: Services }>();
  private readonly openDatabase: (filePath: string) => AppDatabase;
  private readonly createLlm: (config: AiConfig) => LlmClient;
  private readonly aiConfig: (profile: ProfileRef) => AiConfig;

  constructor(options: ProfileContainerOptions = {}) {
    this.databases = options.databases ?? new Map();
    this.openDatabase = options.openDatabase ?? createDatabase;
    this.createLlm = options.createLlm ?? createLlmClient;
    this.aiConfig = options.aiConfig ?? (() => getAiConfig());
  }

  servicesFor(profile: ProfileRef): Services {
    const aiConfig = this.aiConfig(profile);
    const fingerprint = `${aiConfig.provider}:${aiConfig.model}`;
    const cached = this.services.get(profile.id);
    if (cached?.fingerprint === fingerprint) return cached.services;

    const services = this.createServices(this.databaseFor(profile), aiConfig);
    this.services.set(profile.id, { fingerprint, services });
    return services;
  }

  /** Drops a profile's services (and any secrets they hold); the next request rebuilds them. */
  invalidate(profileId: string): void {
    this.services.delete(profileId);
  }

  private databaseFor(profile: ProfileRef): AppDatabase {
    let db = this.databases.get(profile.id);
    if (!db) {
      db = this.openDatabase(profile.dbPath);
      this.databases.set(profile.id, db);
    }
    return db;
  }

  private createServices(db: AppDatabase, aiConfig: AiConfig): Services {
    const llmCallRepository = new LlmCallRepository(db);
    const llm = new InstrumentedLlmClient(this.createLlm(aiConfig), {
      provider: aiConfig.provider,
      model: aiConfig.model,
      sink: llmCallRepository,
    });

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
      usage: new UsageService(llmCallRepository),
    };
  }
}

// Only database connections survive dev hot reloads; services are rebuilt
// from the current module code so edits take effect without a restart.
const globalForDb = globalThis as typeof globalThis & {
  __learningAssistantRegistry?: RegistryDatabase;
  __learningAssistantDbs?: Map<string, AppDatabase>;
  __learningAssistantAuth?: AuthService;
};

/** The profile registry, opened and migrated once. Registers the legacy database on first start. */
export function getRegistry(): RegistryDatabase {
  if (!globalForDb.__learningAssistantRegistry) {
    const env = getEnv();
    const registry = createRegistryDatabase(env.REGISTRY_PATH);
    ensureLegacyProfile(registry, env.DATABASE_PATH);
    globalForDb.__learningAssistantRegistry = registry;
  }
  return globalForDb.__learningAssistantRegistry;
}

/**
 * Sign-in and sessions. Kept across hot reloads so the in-memory lockout
 * counters survive them too.
 */
export function getAuth(): AuthService {
  globalForDb.__learningAssistantAuth ??= new AuthService(getRegistry(), {
    profilesDir: getEnv().PROFILES_DIR,
    initDatabase: (filePath) => createDatabase(filePath).$client.close(),
  });
  return globalForDb.__learningAssistantAuth;
}

let container: ProfileContainer | undefined;

export function getContainer(): ProfileContainer {
  container ??= new ProfileContainer({
    databases: (globalForDb.__learningAssistantDbs ??= new Map()),
  });
  return container;
}

export function invalidateProfile(profileId: string): void {
  getContainer().invalidate(profileId);
}
