import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { DIFFICULTIES } from "@/domain/difficulty";
import { QUESTION_TYPES } from "@/domain/question";
import { LLM_CALL_OUTCOMES } from "@/domain/usage-stats";

export const QUIZ_STATUSES = ["in_progress", "completed"] as const;
export type QuizStatus = (typeof QUIZ_STATUSES)[number];

/** Who created a subtopic: Claude with the original skill map, or the learner later. */
export const SUBTOPIC_ORIGINS = ["generated", "learner"] as const;
export type SubtopicOrigin = (typeof SUBTOPIC_ORIGINS)[number];

const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" });

export const topics = sqliteTable(
  "topics",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    /** Lower-cased name, used to prevent duplicate topics. */
    nameKey: text("name_key").notNull(),
    /** Optional learner context, e.g. "senior backend role, focus on internals". */
    goal: text("goal").notNull().default(""),
    summary: text("summary").notNull(),
    createdAt: timestamp("created_at").notNull(),
    lastStudiedAt: timestamp("last_studied_at"),
  },
  (table) => [uniqueIndex("topics_name_key_unique").on(table.nameKey)],
);

/** A group of related concepts within a topic's skill map (e.g. "Runtime internals"). */
export const subtopics = sqliteTable(
  "subtopics",
  {
    id: text("id").primaryKey(),
    topicId: text("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Lower-cased name, used to prevent duplicate subtopics within a topic. */
    nameKey: text("name_key").notNull(),
    origin: text("origin", { enum: SUBTOPIC_ORIGINS }).notNull(),
    /** Order within the topic's skill map. */
    position: integer("position").notNull(),
  },
  (table) => [
    uniqueIndex("subtopics_topic_name_key_unique").on(table.topicId, table.nameKey),
    index("subtopics_topic_idx").on(table.topicId, table.position),
  ],
);

export const concepts = sqliteTable(
  "concepts",
  {
    id: text("id").primaryKey(),
    topicId: text("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    subtopicId: text("subtopic_id")
      .notNull()
      .references(() => subtopics.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    summary: text("summary").notNull(),
    /** Curriculum order within the topic. */
    position: integer("position").notNull(),
  },
  (table) => [
    index("concepts_topic_idx").on(table.topicId, table.position),
    index("concepts_subtopic_idx").on(table.subtopicId),
  ],
);

export const quizzes = sqliteTable(
  "quizzes",
  {
    id: text("id").primaryKey(),
    topicId: text("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    difficulty: text("difficulty", { enum: DIFFICULTIES }).notNull(),
    /** Set when the learner chose to drill a single concept. */
    focusConceptId: text("focus_concept_id").references(() => concepts.id, {
      onDelete: "set null",
    }),
    /** Set when the learner chose to drill a whole subtopic. */
    focusSubtopicId: text("focus_subtopic_id").references(() => subtopics.id, {
      onDelete: "set null",
    }),
    status: text("status", { enum: QUIZ_STATUSES }).notNull(),
    /** Optional learner preferences given when the quiz was generated. */
    instructions: text("instructions").notNull().default(""),
    /** Mean question score from 0 to 1, set on completion. */
    score: real("score"),
    createdAt: timestamp("created_at").notNull(),
    completedAt: timestamp("completed_at"),
  },
  (table) => [index("quizzes_topic_idx").on(table.topicId, table.createdAt)],
);

export const questions = sqliteTable(
  "questions",
  {
    id: text("id").primaryKey(),
    quizId: text("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    conceptId: text("concept_id")
      .notNull()
      .references(() => concepts.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    type: text("type", { enum: QUESTION_TYPES }).notNull(),
    prompt: text("prompt").notNull(),
    code: text("code"),
    codeLanguage: text("code_language"),
    options: text("options", { mode: "json" }).$type<string[]>(),
    correctOptionIndex: integer("correct_option_index"),
    expectedAnswer: text("expected_answer"),
    rubric: text("rubric", { mode: "json" }).$type<string[]>(),
    explanation: text("explanation").notNull(),
  },
  (table) => [
    index("questions_quiz_idx").on(table.quizId, table.position),
    index("questions_concept_idx").on(table.conceptId),
  ],
);

export const attempts = sqliteTable("attempts", {
  id: text("id").primaryKey(),
  /** One attempt per question: a question can't be re-answered for a better score. */
  questionId: text("question_id")
    .notNull()
    .unique()
    .references(() => questions.id, { onDelete: "cascade" }),
  answer: text("answer").notNull(),
  score: real("score").notNull(),
  isCorrect: integer("is_correct", { mode: "boolean" }).notNull(),
  /** True when the learner finished the quiz without answering (scored 0). */
  skipped: integer("skipped", { mode: "boolean" }).notNull().default(false),
  feedback: text("feedback").notNull(),
  timeTakenMs: integer("time_taken_ms").notNull(),
  answeredAt: timestamp("answered_at").notNull(),
});

export const readings = sqliteTable("readings", {
  id: text("id").primaryKey(),
  conceptId: text("concept_id")
    .notNull()
    .unique()
    .references(() => concepts.id, { onDelete: "cascade" }),
  markdown: text("markdown").notNull(),
  keyTakeaways: text("key_takeaways", { mode: "json" }).$type<string[]>().notNull(),
  /** Optional learner preferences given when the lesson was written. */
  instructions: text("instructions").notNull().default(""),
  createdAt: timestamp("created_at").notNull(),
});

/**
 * One row per AI call: timings, outcome and token counts. Never prompts,
 * answers or keys. `quiz_id`/`concept_id` are plain ids without foreign keys,
 * so usage history survives deleting a topic.
 */
export const llmCalls = sqliteTable(
  "llm_calls",
  {
    id: text("id").primaryKey(),
    task: text("task").notNull(),
    provider: text("provider").notNull(),
    /** The configured model id (`AiConfig.model`). */
    model: text("model").notNull(),
    startedAt: timestamp("started_at").notNull(),
    durationMs: integer("duration_ms").notNull(),
    apiDurationMs: integer("api_duration_ms"),
    outcome: text("outcome", { enum: LLM_CALL_OUTCOMES }).notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    cacheReadTokens: integer("cache_read_tokens"),
    cacheWriteTokens: integer("cache_write_tokens"),
    /** Only a cost the provider reports itself (the Claude Agent SDK's estimate). */
    costUsd: real("cost_usd"),
    quizId: text("quiz_id"),
    conceptId: text("concept_id"),
    requestId: text("request_id"),
  },
  (table) => [index("llm_calls_started_at_idx").on(table.startedAt)],
);

export type TopicRow = typeof topics.$inferSelect;
export type SubtopicRow = typeof subtopics.$inferSelect;
export type ConceptRow = typeof concepts.$inferSelect;
export type QuizRow = typeof quizzes.$inferSelect;
export type QuestionRow = typeof questions.$inferSelect;
export type AttemptRow = typeof attempts.$inferSelect;
export type ReadingRow = typeof readings.$inferSelect;
