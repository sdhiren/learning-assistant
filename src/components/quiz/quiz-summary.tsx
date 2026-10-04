"use client";

import Link from "next/link";

import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatPercent } from "@/lib/format";
import type { QuizQuestionView } from "@/server/services/view-models";

interface QuizSummaryProps {
  topicId: string;
  questions: readonly QuizQuestionView[];
  onReview: (index: number) => void;
}

export function QuizSummary({ topicId, questions, onReview }: QuizSummaryProps) {
  const results = questions.map((question) => question.result);
  const answered = results.filter((result) => result !== null);
  const score =
    answered.reduce((sum, result) => sum + result.score, 0) / Math.max(1, answered.length);
  const correctCount = answered.filter((result) => result.isCorrect).length;
  const missedConcepts = [
    ...new Set(
      questions
        .filter((question) => question.result && !question.result.isCorrect)
        .map((q) => q.conceptName),
    ),
  ];

  return (
    <section aria-labelledby="results-heading" className="space-y-6">
      <div className="rounded-2xl border border-border bg-surface p-6 text-center sm:p-8">
        <h1 id="results-heading" className="text-sm font-medium text-muted">
          Your score
        </h1>
        <p className="mt-1 text-5xl font-semibold tabular-nums">{formatPercent(score)}</p>
        <p className="mt-2 text-muted">
          {correctCount} of {questions.length} correct
        </p>
        {missedConcepts.length > 0 && (
          <p className="mx-auto mt-4 max-w-md text-sm">
            <span className="font-medium">Worth revisiting:</span> {missedConcepts.join(", ")}
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href={`/topics/${topicId}`} className={buttonClasses("primary", "lg")}>
            Back to topic
          </Link>
        </div>
      </div>

      <div>
        <h2 className="mb-3 font-semibold">Review answers</h2>
        <ol className="divide-y divide-border rounded-2xl border border-border bg-surface">
          {questions.map((question, index) => (
            <li key={question.id}>
              <button
                type="button"
                onClick={() => onReview(index)}
                className="flex w-full items-start gap-3 px-5 py-3.5 text-left transition-colors hover:bg-surface-muted"
              >
                <span
                  className={cn(
                    "mt-0.5 font-semibold",
                    question.result?.isCorrect ? "text-success" : "text-danger",
                  )}
                >
                  <span aria-hidden="true">{question.result?.isCorrect ? "✓" : "✗"}</span>
                  <span className="sr-only">
                    {question.result?.isCorrect ? "Correct" : "Incorrect"}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-sm">{question.prompt}</span>
                  <span className="text-xs text-muted">{question.conceptName}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
