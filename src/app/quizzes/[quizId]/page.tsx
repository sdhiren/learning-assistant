import type { Metadata } from "next";
import { connection } from "next/server";

import { QuizPlayer } from "@/components/quiz/quiz-player";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { DIFFICULTY_LABELS } from "@/domain/difficulty";
import { getServices } from "@/server/container";
import { orNotFound } from "@/server/or-not-found";

export const metadata: Metadata = { title: "Quiz" };

export default async function QuizPage(props: PageProps<"/quizzes/[quizId]">) {
  const { quizId } = await props.params;
  await connection();
  const quiz = orNotFound(() => getServices().quizzes.getQuizSession(quizId));

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
      <QuizPlayer quiz={quiz} />
    </div>
  );
}
