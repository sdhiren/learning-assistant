import { and, asc, count, eq } from "drizzle-orm";

import type { AppDatabase } from "@/server/db/client";
import { clarifications, questions, type ClarificationRow } from "@/server/db/schema";

export class ClarificationRepository {
  constructor(private readonly db: AppDatabase) {}

  /** A question's thread, oldest first. */
  listForQuestion(questionId: string): ClarificationRow[] {
    return this.db
      .select()
      .from(clarifications)
      .where(eq(clarifications.questionId, questionId))
      .orderBy(asc(clarifications.createdAt))
      .all();
  }

  /** Every thread in a quiz, oldest first, in one query. */
  listForQuiz(quizId: string): ClarificationRow[] {
    return this.db
      .select({ clarification: clarifications })
      .from(clarifications)
      .innerJoin(questions, eq(clarifications.questionId, questions.id))
      .where(eq(questions.quizId, quizId))
      .orderBy(asc(clarifications.createdAt))
      .all()
      .map((row) => row.clarification);
  }

  countLearnerMessages(questionId: string): number {
    const row = this.db
      .select({ value: count() })
      .from(clarifications)
      .where(and(eq(clarifications.questionId, questionId), eq(clarifications.role, "learner")))
      .get();
    return row?.value ?? 0;
  }

  /** Stores a learner message and its reply together, or neither. */
  appendExchange(learner: ClarificationRow, assistant: ClarificationRow): void {
    this.db.transaction((tx) => {
      tx.insert(clarifications).values([learner, assistant]).run();
    });
  }
}
