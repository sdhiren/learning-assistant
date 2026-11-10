import "server-only";

import { createHash } from "node:crypto";

import { AnthropicApiClient } from "@/server/ai/anthropic-api-client";
import { ClaudeAgentClient } from "@/server/ai/claude-agent-client";
import { ClaudeLoginFlow } from "@/server/ai/claude-login";
import { GeminiClient } from "@/server/ai/gemini-client";
import { InstrumentedLlmClient } from "@/server/ai/instrumented-llm-client";
import type { LlmClient } from "@/server/ai/llm-client";
import { MissingKeyLlmClient } from "@/server/ai/missing-key-llm-client";
import { OpenAiClient } from "@/server/ai/openai-client";
import {
  claudeConfigDirFor,
  profileProvider,
  resolveProfileAiConfig,
  type ProfileAiFields,
} from "@/server/ai/profile-ai-config";
import { PROVIDERS, type ProviderId } from "@/server/ai/providers";
import { getAiConfig, getEnv, type AiConfig } from "@/server/config/env";
import { createRegistryDatabase, type RegistryDatabase } from "@/server/db/app-client";
import { createDatabase, type AppDatabase } from "@/server/db/client";
import { ensureLegacyProfile } from "@/server/registry-bootstrap";
import { ClarificationRepository } from "@/server/repositories/clarification-repository";
import { LlmCallRepository } from "@/server/repositories/llm-call-repository";
import { QuizRepository } from "@/server/repositories/quiz-repository";
import { ReadingRepository } from "@/server/repositories/reading-repository";
import { TopicRepository } from "@/server/repositories/topic-repository";
import { TopicSuggestionRepository } from "@/server/repositories/topic-suggestion-repository";
import { ClarificationService } from "@/server/services/clarification-service";
import { DashboardService } from "@/server/services/dashboard-service";
import { ProgressService } from "@/server/services/progress-service";
import { QuizService } from "@/server/services/quiz-service";
import { ReadingService } from "@/server/services/reading-service";
import { SubtopicService } from "@/server/services/subtopic-service";
import { TopicService } from "@/server/services/topic-service";
import { TopicSuggestionService } from "@/server/services/topic-suggestion-service";
import { AuthService } from "@/server/services/auth-service";
import { ProfileService } from "@/server/services/profile-service";
import { SecretService } from "@/server/services/secret-service";
import { UsageService } from "@/server/services/usage-service";

/** The composition root: the only place concrete implementations are wired together. */
export interface Services {
  dashboard: DashboardService;
  topics: TopicService;
  subtopics: SubtopicService;
  quizzes: QuizService;
  clarifications: ClarificationService;
  readings: ReadingService;
  usage: UsageService;
  suggestions: TopicSuggestionService;
}

/** Builds the client for the configured provider. Env validation rejects unimplemented ones. */
export function createLlmClient(config: AiConfig): LlmClient {
  switch (config.provider) {
    case "claude-code":
      return new ClaudeAgentClient({
        model: config.model,
        timeoutMs: config.timeoutMs,
        auth: { configDir: config.claudeConfigDir, oauthToken: config.oauthToken },
        cliPath: getEnv().CLAUDE_CLI_PATH,
      });
    case "anthropic":
      if (!config.apiKey) return new MissingKeyLlmClient(config.provider);
      return new AnthropicApiClient({
        apiKey: config.apiKey,
        model: config.model,
        timeoutMs: config.timeoutMs,
      });
    case "openai":
      if (!config.apiKey) return new MissingKeyLlmClient(config.provider);
      return new OpenAiClient({
        apiKey: config.apiKey,
        model: config.model,
        timeoutMs: config.timeoutMs,
      });
    case "gemini":
      if (!config.apiKey) return new MissingKeyLlmClient(config.provider);
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
/** The provider a profile uses (its own choice, else the env default). */
export function getAiProviderInfo(profile?: Pick<ProfileAiFields, "aiProvider">): AiProviderInfo {
  const provider = profile ? profileProvider(profile, getEnv()) : getAiConfig().provider;
  const { label, usageNote } = PROVIDERS[provider];
  return { id: provider, label, usageNote };
}

/** What the container needs to know about a profile. */
export type ProfileRef = { id: string; dbPath: string } & Partial<Omit<ProfileAiFields, "id">>;

export interface ProfileContainerOptions {
  /** Open connections by profile id. Pass a long-lived map so connections survive hot reloads. */
  databases?: Map<string, AppDatabase>;
  openDatabase?: (filePath: string) => AppDatabase;
  createLlm?: (config: AiConfig) => LlmClient;
  aiConfig?: (profile: ProfileRef, dek?: Buffer) => AiConfig;
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
  private readonly aiConfig: (profile: ProfileRef, dek?: Buffer) => AiConfig;

  constructor(options: ProfileContainerOptions = {}) {
    this.databases = options.databases ?? new Map();
    this.openDatabase = options.openDatabase ?? createDatabase;
    this.createLlm = options.createLlm ?? createLlmClient;
    this.aiConfig = options.aiConfig ?? (() => getAiConfig());
  }

  /** `dek` unlocks the profile's saved keys; without it only env keys apply. */
  servicesFor(profile: ProfileRef, dek?: Buffer): Services {
    const aiConfig = this.aiConfig(profile, dek);
    const fingerprint = fingerprintOf(aiConfig);
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
    const clarificationRepository = new ClarificationRepository(db);
    const progressService = new ProgressService(quizRepository);

    return {
      dashboard: new DashboardService(topicRepository, quizRepository, progressService),
      topics: new TopicService(topicRepository, quizRepository, progressService, llm),
      subtopics: new SubtopicService(topicRepository, progressService, llm),
      quizzes: new QuizService(
        topicRepository,
        quizRepository,
        progressService,
        clarificationRepository,
        llm,
      ),
      clarifications: new ClarificationService(
        quizRepository,
        topicRepository,
        clarificationRepository,
        llm,
      ),
      readings: new ReadingService(topicRepository, readingRepository, progressService, llm),
      usage: new UsageService(llmCallRepository),
      suggestions: new TopicSuggestionService(
        topicRepository,
        new TopicSuggestionRepository(db),
        llm,
      ),
    };
  }
}

// Only database connections survive dev hot reloads; services are rebuilt
// from the current module code so edits take effect without a restart.
/** Changes whenever the provider, model or credential changes; holds no secret itself. */
function fingerprintOf(config: AiConfig): string {
  const credential = createHash("sha256")
    .update([config.apiKey, config.oauthToken, config.claudeConfigDir].join("\0"))
    .digest("hex");
  return `${config.provider}:${config.model}:${credential}`;
}

const globalForDb = globalThis as typeof globalThis & {
  __learningAssistantRegistry?: RegistryDatabase;
  __learningAssistantDbs?: Map<string, AppDatabase>;
  __learningAssistantAuth?: AuthService;
  __learningAssistantClaudeLogin?: ClaudeLoginFlow;
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

export function getSecrets(): SecretService {
  return new SecretService(getRegistry());
}

/** Pending Sign in with Claude flows live in memory, so this must be a singleton. */
export function getClaudeLogin(): ClaudeLoginFlow {
  globalForDb.__learningAssistantClaudeLogin ??= new ClaudeLoginFlow({
    cliPath: getEnv().CLAUDE_CLI_PATH,
    configDirFor: (profileId) => claudeConfigDirFor(getEnv().PROFILES_DIR, profileId),
  });
  return globalForDb.__learningAssistantClaudeLogin;
}

export function getProfileSettings(): ProfileService {
  return new ProfileService(getRegistry(), getSecrets(), getClaudeLogin());
}

let container: ProfileContainer | undefined;

export function getContainer(): ProfileContainer {
  container ??= new ProfileContainer({
    databases: (globalForDb.__learningAssistantDbs ??= new Map()),
    aiConfig: (profile, dek) =>
      resolveProfileAiConfig(
        {
          id: profile.id,
          aiProvider: profile.aiProvider ?? null,
          aiModel: profile.aiModel ?? null,
          claudeSignedInAt: profile.claudeSignedInAt ?? null,
        },
        getEnv(),
        dek ? getSecrets().loadDecrypted(profile.id, dek) : {},
      ),
  });
  return container;
}

export function invalidateProfile(profileId: string): void {
  getContainer().invalidate(profileId);
}
