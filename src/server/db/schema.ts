import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { DIFFICULTIES } from "@/domain/difficulty";
import { QUESTION_TYPES } from "@/domain/question";

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
  createdAt: timestamp("created_at").notNull(),
});

export type TopicRow = typeof topics.$inferSelect;
export type SubtopicRow = typeof subtopics.$inferSelect;
export type ConceptRow = typeof concepts.$inferSelect;
export type QuizRow = typeof quizzes.$inferSelect;
export type QuestionRow = typeof questions.$inferSelect;
export type AttemptRow = typeof attempts.$inferSelect;
export type ReadingRow = typeof readings.$inferSelect;
