"use server";

import { redirect } from "next/navigation";

import type { ActionResult } from "@/lib/action-result";
import {
  askClarificationInput,
  finishQuizInput,
  startQuizInput,
  submitAnswerInput,
} from "@/domain/input-schemas";
import type {
  ClarificationView,
  QuizSessionView,
  SubmitAnswerResultView,
} from "@/server/services/view-models";
import { getProfileServices } from "@/server/session";

import { runAction } from "./run-action";

export async function startQuizAction(
  _previous: ActionResult<string> | null,
  formData: FormData,
): Promise<ActionResult<string>> {
  const services = await getProfileServices();
  const result = await runAction("startQuiz", () => {
    const input = startQuizInput.parse({
      topicId: formData.get("topicId"),
      difficulty: formData.get("difficulty"),
      questionCount: formData.get("questionCount"),
      focus: formData.get("focus") ?? undefined,
      instructions: formData.get("instructions") ?? undefined,
    });
    return services.quizzes.startQuiz(input);
  });

  if (!result.ok) return result;
  redirect(`/quizzes/${result.data}`);
}

export async function submitAnswerAction(input: {
  questionId: string;
  answer: string;
  timeTakenMs: number;
}): Promise<ActionResult<SubmitAnswerResultView>> {
  const services = await getProfileServices();
  return runAction("submitAnswer", () =>
    services.quizzes.submitAnswer(submitAnswerInput.parse(input)),
  );
}

/** Asks a follow-up about a question; returns the stored message and reply. */
export async function askClarificationAction(input: {
  questionId: string;
  message: string;
}): Promise<ActionResult<ClarificationView[]>> {
  const services = await getProfileServices();
  return runAction("askClarification", () =>
    services.clarifications.ask(askClarificationInput.parse(input)),
  );
}

/** Finishes the quiz, recording any unanswered questions as skipped. */
export async function finishQuizAction(quizId: string): Promise<ActionResult<QuizSessionView>> {
  const services = await getProfileServices();
  return runAction("finishQuiz", () =>
    services.quizzes.finishQuiz(finishQuizInput.parse({ quizId }).quizId),
  );
}
