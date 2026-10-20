import { and, eq } from "drizzle-orm";

import type { AppDatabase } from "@/server/db/client";
import { attempts, questions, quizzes } from "@/server/db/schema";

export type Transaction = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];

/** Completes the quiz with its mean score once every question has an attempt. */
export function completeIfFullyAnswered(
  tx: Transaction,
  quizId: string,
  completedAt: Date,
): boolean {
  const rows = tx
    .select({ score: attempts.score })
    .from(questions)
    .leftJoin(attempts, eq(attempts.questionId, questions.id))
    .where(eq(questions.quizId, quizId))
    .all();
  if (rows.length === 0 || rows.some((row) => row.score === null)) return false;

  const meanScore = rows.reduce((sum, row) => sum + (row.score ?? 0), 0) / rows.length;
  tx.update(quizzes)
    .set({ status: "completed", score: meanScore, completedAt })
    .where(and(eq(quizzes.id, quizId), eq(quizzes.status, "in_progress")))
    .run();
  return true;
}
