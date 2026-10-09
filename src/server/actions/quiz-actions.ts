"use server";

import { redirect } from "next/navigation";

import type { ActionResult } from "@/lib/action-result";
import { finishQuizInput, startQuizInput, submitAnswerInput } from "@/domain/input-schemas";
import { getServices } from "@/server/container";
import type { QuizSessionView, SubmitAnswerResultView } from "@/server/services/view-models";

import { runAction } from "./run-action";

export async function startQuizAction(
  _previous: ActionResult<string> | null,
  formData: FormData,
): Promise<ActionResult<string>> {
  const result = await runAction("startQuiz", () => {
    const input = startQuizInput.parse({
      topicId: formData.get("topicId"),
      difficulty: formData.get("difficulty"),
      questionCount: formData.get("questionCount"),
      focus: formData.get("focus") ?? undefined,
    });
    return getServices().quizzes.startQuiz(input);
  });

  if (!result.ok) return result;
  redirect(`/quizzes/${result.data}`);
}

export async function submitAnswerAction(input: {
  questionId: string;
  answer: string;
  timeTakenMs: number;
}): Promise<ActionResult<SubmitAnswerResultView>> {
  return runAction("submitAnswer", () =>
    getServices().quizzes.submitAnswer(submitAnswerInput.parse(input)),
  );
}

/** Finishes the quiz, recording any unanswered questions as skipped. */
export async function finishQuizAction(quizId: string): Promise<ActionResult<QuizSessionView>> {
  return runAction("finishQuiz", () =>
    getServices().quizzes.finishQuiz(finishQuizInput.parse({ quizId }).quizId),
  );
}
