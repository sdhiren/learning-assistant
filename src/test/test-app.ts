import type { GeneratedQuestion, SkillTreeOutput } from "@/server/ai/schemas";
import { createDatabase } from "@/server/db/client";
import { QuizRepository } from "@/server/repositories/quiz-repository";
import { ReadingRepository } from "@/server/repositories/reading-repository";
import { TopicRepository } from "@/server/repositories/topic-repository";
import { ProgressService } from "@/server/services/progress-service";
import { QuizService } from "@/server/services/quiz-service";
import { ReadingService } from "@/server/services/reading-service";
import { SubtopicService } from "@/server/services/subtopic-service";
import { TopicService } from "@/server/services/topic-service";

import { FakeLlmClient } from "./fake-llm-client";

/** Wires the real services to an in-memory database and a fake LLM. */
export function createTestApp() {
  const db = createDatabase(":memory:");
  const llm = new FakeLlmClient();
  let clock = new Date("2026-01-01T10:00:00Z").getTime();
  const now = () => new Date((clock += 1000));

  const topicRepository = new TopicRepository(db);
  const quizRepository = new QuizRepository(db);
  const progressService = new ProgressService(quizRepository);

  return {
    db,
    llm,
    topics: new TopicService(topicRepository, quizRepository, progressService, llm, now),
    subtopics: new SubtopicService(topicRepository, progressService, llm),
    quizzes: new QuizService(topicRepository, quizRepository, progressService, llm, now),
    readings: new ReadingService(
      topicRepository,
      new ReadingRepository(db),
      progressService,
      llm,
      now,
    ),
  };
}

export const SAMPLE_SKILL_TREE: SkillTreeOutput = {
  summary: "Event-driven JavaScript runtime.",
  subtopics: [
    {
      name: "Runtime",
      concepts: [
        { name: "Event loop", summary: "Phases and ordering." },
        { name: "Microtasks", summary: "Promise jobs." },
      ],
    },
    {
      name: "Modules",
      concepts: [
        { name: "CommonJS", summary: "require and caching." },
        { name: "ES modules", summary: "import semantics." },
      ],
    },
    {
      name: "Performance",
      concepts: [
        { name: "Streams", summary: "Backpressure." },
        { name: "Worker threads", summary: "CPU-bound work." },
      ],
    },
  ],
};

export function multipleChoiceQuestion(conceptId: string, prompt = "Which runs first?") {
  return {
    conceptId,
    type: "multiple_choice",
    prompt,
    code: null,
    codeLanguage: null,
    options: ["setTimeout", "Promise.then", "setImmediate", "process.exit"],
    correctOptionIndex: 1,
    expectedAnswer: null,
    rubric: [],
    explanation: "Microtasks run before timers.",
  } satisfies GeneratedQuestion;
}

export function codeOutputQuestion(conceptId: string) {
  return {
    conceptId,
    type: "code_output",
    prompt: "What does this print?",
    code: "console.log(1 + 1)",
    codeLanguage: "JavaScript",
    options: [],
    correctOptionIndex: null,
    expectedAnswer: "2",
    rubric: [],
    explanation: "Simple addition.",
  } satisfies GeneratedQuestion;
}

export function shortAnswerQuestion(conceptId: string) {
  return {
    conceptId,
    type: "short_answer",
    prompt: "Explain backpressure.",
    code: null,
    codeLanguage: null,
    options: [],
    correctOptionIndex: null,
    expectedAnswer: "Slowing producers when consumers can't keep up.",
    rubric: ["Producer/consumer speed mismatch", "Buffering limits"],
    explanation: "Streams pause when the buffer is full.",
  } satisfies GeneratedQuestion;
}
