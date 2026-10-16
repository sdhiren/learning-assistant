"use client";

import Link from "next/link";

import { buttonClasses } from "@/components/ui/button";
import { Confetti } from "@/components/ui/confetti";
import { ArrowRightIcon, BookIcon } from "@/components/ui/icons";
import { InlineCodeText } from "@/components/ui/inline-code-text";
import { ProgressRing } from "@/components/ui/progress-ring";
import { isPassingScore } from "@/domain/grading";
import { cn } from "@/lib/cn";
import { formatPercent } from "@/lib/format";
import type { QuizQuestionView } from "@/server/services/view-models";

import { statusOf } from "./question-navigator";

interface QuizSummaryProps {
  topicId: string;
  questions: readonly QuizQuestionView[];
  onReview: (index: number) => void;
}

/** Scores at or above this get a celebration. */
const CELEBRATE_AT = 0.8;

function headlineFor(score: number): { title: string; message: string } {
  if (score >= 0.9) return { title: "Outstanding!", message: "Interview-ready on these concepts." };
  if (score >= CELEBRATE_AT)
    return { title: "Great work!", message: "Strong answers across the board." };
  if (score >= 0.5) {
    return { title: "Solid progress", message: "A few concepts need another look. You're close." };
  }
  return {
    title: "Good practice",
    message: "Every miss shows you what to study next. Read the lessons below, then try again.",
  };
}

interface ConceptResult {
  conceptId: string;
  conceptName: string;
  correct: number;
  total: number;
}

function resultsByConcept(questions: readonly QuizQuestionView[]): ConceptResult[] {
  const byConcept = new Map<string, ConceptResult>();
  for (const question of questions) {
    const entry = byConcept.get(question.conceptId) ?? {
      conceptId: question.conceptId,
      conceptName: question.conceptName,
      correct: 0,
      total: 0,
    };
    entry.total++;
    if (question.result?.isCorrect) entry.correct++;
    byConcept.set(question.conceptId, entry);
  }
  // Weakest first: that's where the learner should go next.
  return [...byConcept.values()].sort((a, b) => a.correct / a.total - b.correct / b.total);
}

export function QuizSummary({ topicId, questions, onReview }: QuizSummaryProps) {
  const results = questions.map((question) => question.result);
  const answered = results.filter((result) => result !== null);
  const score =
    answered.reduce((sum, result) => sum + result.score, 0) / Math.max(1, answered.length);
  const correctCount = answered.filter((result) => result.isCorrect).length;
  const skippedCount = answered.filter((result) => result.skipped).length;
  const concepts = resultsByConcept(questions);
  const { title, message } = headlineFor(score);

  return (
    <section aria-labelledby="results-heading" className="space-y-6">
      <div className="relative animate-pop overflow-hidden rounded-2xl border border-border bg-surface p-6 text-center shadow-card sm:p-8">
        {score >= CELEBRATE_AT && <Confetti />}
        <ProgressRing
          value={score}
          label="Quiz score"
          size={148}
          strokeWidth={12}
          className="mx-auto"
        >
          <span className="flex flex-col items-center leading-tight">
            <span className="text-4xl">{formatPercent(score)}</span>
            <span className="text-xs font-medium text-muted">score</span>
          </span>
        </ProgressRing>
        <h1 id="results-heading" className="mt-4 text-2xl font-semibold">
          {title}
        </h1>
        <p className="mx-auto mt-1 max-w-md text-muted">{message}</p>
        <p className="mt-3 text-sm">
          <span className="font-medium text-success">{correctCount} correct</span>
          <span className="text-muted"> of {questions.length}</span>
          {skippedCount > 0 && <span className="text-muted"> · {skippedCount} skipped</span>}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href={`/topics/${topicId}`} className={buttonClasses("primary", "lg")}>
            Back to topic
            <ArrowRightIcon />
          </Link>
        </div>
      </div>

      <section aria-labelledby="concepts-result-heading" className="space-y-3">
        <h2 id="concepts-result-heading" className="font-semibold">
          By concept
        </h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {concepts.map((concept) => {
            const ratio = concept.correct / concept.total;
            const passing = isPassingScore(ratio);
            return (
              <li
                key={concept.conceptId}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3.5 shadow-card"
              >
                <span
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-lg text-sm font-semibold tabular-nums",
                    passing ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
                  )}
                >
                  {concept.correct}/{concept.total}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{concept.conceptName}</span>
                  <span className="text-xs text-muted">
                    {passing ? "Looking good" : "Worth revisiting"}
                  </span>
                </span>
                {!passing && (
                  <Link
                    href={`/topics/${topicId}/concepts/${concept.conceptId}`}
                    className={buttonClasses("secondary", "sm")}
                    aria-label={`Study ${concept.conceptName}`}
                  >
                    <BookIcon className="size-3.5" />
                    Study
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <div>
        <h2 className="mb-3 font-semibold">Review answers</h2>
        <ol className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
          {questions.map((question, index) => (
            <li key={question.id}>
              <button
                type="button"
                onClick={() => onReview(index)}
                className="flex w-full items-start gap-3 px-5 py-3.5 text-left transition-colors hover:bg-surface-muted"
              >
                <ResultMark question={question} />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-sm">
                    <InlineCodeText text={question.prompt} />
                  </span>
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

function ResultMark({ question }: { question: QuizQuestionView }) {
  const status = statusOf(question);
  const { icon, label, className } = RESULT_MARKS[status];
  return (
    <span className={cn("mt-0.5 w-4 text-center font-semibold", className)}>
      <span aria-hidden="true">{icon}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

const RESULT_MARKS = {
  correct: { icon: "✓", label: "Correct", className: "text-success" },
  incorrect: { icon: "✗", label: "Incorrect", className: "text-danger" },
  skipped: { icon: "→", label: "Skipped", className: "text-muted" },
  unanswered: { icon: "·", label: "Not answered", className: "text-muted" },
} as const;
