"use client";

import { useState } from "react";

import { ProgressBar } from "@/components/ui/progress-bar";
import { DIFFICULTY_LABELS } from "@/domain/difficulty";
import type {
  AnswerResultView,
  QuizQuestionView,
  QuizSessionView,
} from "@/server/services/view-models";

import { QuestionCard } from "./question-card";
import { QuizSummary } from "./quiz-summary";

/**
 * Runs a quiz one question at a time. Answers are graded on the server; the
 * player only ever sees an answer key after the question has been answered.
 * Showing the index `questions.length` means "show the results".
 */
export function QuizPlayer({ quiz }: { quiz: QuizSessionView }) {
  const [questions, setQuestions] = useState(quiz.questions);
  const [currentIndex, setCurrentIndex] = useState(() => firstUnansweredIndex(quiz.questions));

  const answeredCount = questions.filter((question) => question.result).length;
  const current = questions[currentIndex];

  function handleAnswered(questionId: string, result: AnswerResultView) {
    setQuestions((previous) =>
      previous.map((question) => (question.id === questionId ? { ...question, result } : question)),
    );
  }

  function goToNext() {
    setCurrentIndex((index) => {
      const nextUnanswered = questions.findIndex((question, i) => i > index && !question.result);
      return nextUnanswered === -1 ? firstUnansweredIndex(questions) : nextUnanswered;
    });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">
            {current
              ? `Question ${currentIndex + 1} of ${questions.length}`
              : `${DIFFICULTY_LABELS[quiz.difficulty]} quiz complete`}
          </span>
          <span className="text-muted">
            {answeredCount}/{questions.length} answered
          </span>
        </div>
        <ProgressBar value={answeredCount / questions.length} label="Quiz progress" />
      </div>

      {current ? (
        <QuestionCard
          key={current.id}
          question={current}
          isLast={answeredCount === questions.length}
          onAnswered={(result) => handleAnswered(current.id, result)}
          onNext={goToNext}
        />
      ) : (
        <QuizSummary
          topicId={quiz.topicId}
          questions={questions}
          onReview={(index) => setCurrentIndex(index)}
        />
      )}
    </div>
  );
}

function firstUnansweredIndex(questions: readonly QuizQuestionView[]): number {
  const index = questions.findIndex((question) => !question.result);
  return index === -1 ? questions.length : index;
}
