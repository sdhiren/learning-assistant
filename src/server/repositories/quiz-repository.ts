import { and, asc, count, desc, eq, inArray } from "drizzle-orm";

import type { Difficulty } from "@/domain/difficulty";
import type { AppDatabase } from "@/server/db/client";
import {
  attempts,
  questions,
  quizzes,
  type AttemptRow,
  type QuestionRow,
  type QuizRow,
} from "@/server/db/schema";

export type NewQuiz = typeof quizzes.$inferInsert;
export type NewQuestion = typeof questions.$inferInsert;
export type NewAttempt = typeof attempts.$inferInsert;

/** An answered question with what's needed to compute mastery. */
export interface AttemptEvidenceRow {
  conceptId: string;
  score: number;
  isCorrect: boolean;
  difficulty: Difficulty;
  answeredAt: Date;
}

export class QuizRepository {
  constructor(private readonly db: AppDatabase) {}

  findById(quizId: string): QuizRow | undefined {
    return this.db.select().from(quizzes).where(eq(quizzes.id, quizId)).get();
  }

  listByTopic(topicId: string, limit: number): QuizRow[] {
    return this.db
      .select()
      .from(quizzes)
      .where(eq(quizzes.topicId, topicId))
      .orderBy(desc(quizzes.createdAt))
      .limit(limit)
      .all();
  }

  countCompleted(topicId: string): number {
    const row = this.db
      .select({ value: count() })
      .from(quizzes)
      .where(and(eq(quizzes.topicId, topicId), eq(quizzes.status, "completed")))
      .get();
    return row?.value ?? 0;
  }

  findLatestInProgress(topicId: string): QuizRow | undefined {
    return this.db
      .select()
      .from(quizzes)
      .where(and(eq(quizzes.topicId, topicId), eq(quizzes.status, "in_progress")))
      .orderBy(desc(quizzes.createdAt))
      .limit(1)
      .get();
  }

  /** Inserts a quiz and its questions, atomically. */
  createWithQuestions(quiz: NewQuiz, quizQuestions: readonly NewQuestion[]): void {
    this.db.transaction((tx) => {
      tx.insert(quizzes).values(quiz).run();
      tx.insert(questions)
        .values([...quizQuestions])
        .run();
    });
  }

  findQuestionById(questionId: string): QuestionRow | undefined {
    return this.db.select().from(questions).where(eq(questions.id, questionId)).get();
  }

  listQuestions(quizId: string): QuestionRow[] {
    return this.db
      .select()
      .from(questions)
      .where(eq(questions.quizId, quizId))
      .orderBy(asc(questions.position))
      .all();
  }

  hasAttempt(questionId: string): boolean {
    const row = this.db
      .select({ id: attempts.id })
      .from(attempts)
      .where(eq(attempts.questionId, questionId))
      .get();
    return row !== undefined;
  }

  listAttemptsForQuiz(quizId: string): AttemptRow[] {
    return this.db
      .select({ attempt: attempts })
      .from(attempts)
      .innerJoin(questions, eq(attempts.questionId, questions.id))
      .where(eq(questions.quizId, quizId))
      .all()
      .map((row) => row.attempt);
  }

  /** Prompts of the most recent questions in a topic, newest first. */
  listRecentQuestionPrompts(topicId: string, limit: number): string[] {
    return this.db
      .select({ prompt: questions.prompt })
      .from(questions)
      .innerJoin(quizzes, eq(questions.quizId, quizzes.id))
      .where(eq(quizzes.topicId, topicId))
      .orderBy(desc(quizzes.createdAt), asc(questions.position))
      .limit(limit)
      .all()
      .map((row) => row.prompt);
  }

  /**
   * Records an attempt and, if it was the quiz's last unanswered question,
   * completes the quiz. Returns true when the quiz was completed.
   * Runs in one transaction so concurrent submissions can't double-complete.
   */
  recordAttempt(attempt: NewAttempt, quizId: string, answeredAt: Date): boolean {
    return this.db.transaction((tx) => {
      tx.insert(attempts).values(attempt).run();

      const quizQuestionIds = tx
        .select({ id: questions.id })
        .from(questions)
        .where(eq(questions.quizId, quizId))
        .all()
        .map((row) => row.id);
      const quizAttempts = tx
        .select({ score: attempts.score })
        .from(attempts)
        .where(inArray(attempts.questionId, quizQuestionIds))
        .all();

      if (quizAttempts.length < quizQuestionIds.length) return false;

      const meanScore = quizAttempts.reduce((sum, row) => sum + row.score, 0) / quizAttempts.length;
      tx.update(quizzes)
        .set({ status: "completed", score: meanScore, completedAt: answeredAt })
        .where(and(eq(quizzes.id, quizId), eq(quizzes.status, "in_progress")))
        .run();
      return true;
    });
  }

  /** Every attempt in a topic, for mastery estimation. */
  listAttemptEvidence(topicId: string): AttemptEvidenceRow[] {
    return this.db
      .select({
        conceptId: questions.conceptId,
        score: attempts.score,
        isCorrect: attempts.isCorrect,
        difficulty: quizzes.difficulty,
        answeredAt: attempts.answeredAt,
      })
      .from(attempts)
      .innerJoin(questions, eq(attempts.questionId, questions.id))
      .innerJoin(quizzes, eq(questions.quizId, quizzes.id))
      .where(eq(quizzes.topicId, topicId))
      .all();
  }

  /** Every attempt across all topics, keyed by concept (for the library view). */
  listAllAttemptEvidence(): AttemptEvidenceRow[] {
    return this.db
      .select({
        conceptId: questions.conceptId,
        score: attempts.score,
        isCorrect: attempts.isCorrect,
        difficulty: quizzes.difficulty,
        answeredAt: attempts.answeredAt,
      })
      .from(attempts)
      .innerJoin(questions, eq(attempts.questionId, questions.id))
      .innerJoin(quizzes, eq(questions.quizId, quizzes.id))
      .all();
  }
}
