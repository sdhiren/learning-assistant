import "server-only";

import { ClaudeAgentClient } from "@/server/ai/claude-agent-client";
import { getEnv } from "@/server/config/env";
import { createDatabase, type AppDatabase } from "@/server/db/client";
import { QuizRepository } from "@/server/repositories/quiz-repository";
import { ReadingRepository } from "@/server/repositories/reading-repository";
import { TopicRepository } from "@/server/repositories/topic-repository";
import { ProgressService } from "@/server/services/progress-service";
import { QuizService } from "@/server/services/quiz-service";
import { ReadingService } from "@/server/services/reading-service";
import { SubtopicService } from "@/server/services/subtopic-service";
import { TopicService } from "@/server/services/topic-service";

/** The composition root: the only place concrete implementations are wired together. */
export interface Services {
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

function createServices(): Services {
  const env = getEnv();
  const db = getDatabase();
  const llm = new ClaudeAgentClient({ model: env.CLAUDE_MODEL, timeoutMs: env.AI_TIMEOUT_MS });

  const topicRepository = new TopicRepository(db);
  const quizRepository = new QuizRepository(db);
  const readingRepository = new ReadingRepository(db);
  const progressService = new ProgressService(quizRepository);

  return {
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
