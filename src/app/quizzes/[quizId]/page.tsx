import type { Metadata } from "next";
import { connection } from "next/server";

import { QuizPlayer } from "@/components/quiz/quiz-player";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { DIFFICULTY_LABELS } from "@/domain/difficulty";
import { orNotFound } from "@/server/or-not-found";
import { getProfileServices } from "@/server/session";

export const metadata: Metadata = { title: "Quiz" };

export default async function QuizPage(props: PageProps<"/quizzes/[quizId]">) {
  const { quizId } = await props.params;
  await connection();
  const services = await getProfileServices();
  const quiz = orNotFound(() => services.quizzes.getQuizSession(quizId));

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumbs
        items={[
          { label: "Topics", href: "/" },
          { label: quiz.topicName, href: `/topics/${quiz.topicId}` },
          {
            label: quiz.focusLabel
              ? `${DIFFICULTY_LABELS[quiz.difficulty]} quiz: ${quiz.focusLabel}`
              : `${DIFFICULTY_LABELS[quiz.difficulty]} quiz`,
          },
        ]}
      />
      {quiz.instructions && (
        <p className="mb-4 text-sm text-muted">
          <span className="font-medium text-ink">Your instructions:</span> {quiz.instructions}
        </p>
      )}
      <QuizPlayer quiz={quiz} />
    </div>
  );
}
