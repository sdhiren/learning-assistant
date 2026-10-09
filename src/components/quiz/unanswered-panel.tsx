"use client";

import { useState, useTransition } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { finishQuizAction } from "@/server/actions/quiz-actions";
import type { QuizQuestionView, QuizSessionView } from "@/server/services/view-models";

interface UnansweredPanelProps {
  quizId: string;
  questions: readonly QuizQuestionView[];
  onGoTo: (index: number) => void;
  onFinished: (session: QuizSessionView) => void;
}

/**
 * Shown at the end of a quiz that still has unanswered (skipped) questions:
 * the learner can go back to them, or finish and have them marked as skipped.
 */
export function UnansweredPanel({ quizId, questions, onGoTo, onFinished }: UnansweredPanelProps) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const unanswered = questions
    .map((question, index) => ({ question, index }))
    .filter(({ question }) => !question.result);
  const count = unanswered.length;

  function finish() {
    setError(null);
    startTransition(async () => {
      const result = await finishQuizAction(quizId);
      if (result.ok) onFinished(result.data);
      else setError(result.error);
    });
  }

  return (
    <section
      aria-labelledby="unanswered-heading"
      className="space-y-5 rounded-2xl border border-border bg-surface p-5 sm:p-7"
    >
      <div className="space-y-1">
        <h1 id="unanswered-heading" className="text-xl font-semibold">
          {count === 1 ? "1 question left" : `${count} questions left`}
        </h1>
        <p className="text-muted">
          Go back and answer them, or finish now. Skipped questions score 0 and show you the answer,
          so they help pinpoint what to study.
        </p>
      </div>

      <ul className="divide-y divide-border rounded-xl border border-border">
        {unanswered.map(({ question, index }) => (
          <li key={question.id}>
            <button
              type="button"
              onClick={() => onGoTo(index)}
              className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-muted"
            >
              <span className="font-mono text-sm text-muted tabular-nums">{index + 1}.</span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-sm">{question.prompt}</span>
                <span className="text-xs text-muted">{question.conceptName}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {error && <Alert>{error}</Alert>}

      <div className="flex flex-wrap items-center gap-3">
        {unanswered[0] && (
          <Button size="lg" onClick={() => onGoTo(unanswered[0]!.index)} disabled={pending}>
            Answer question {unanswered[0].index + 1}
          </Button>
        )}
        {confirming ? (
          <span
            className="flex flex-wrap items-center gap-2"
            role="group"
            aria-label="Confirm finish"
          >
            <Button variant="secondary" size="lg" onClick={finish} disabled={pending} autoFocus>
              {pending && <Spinner />}
              {pending ? "Finishing…" : `Yes, mark ${count} as skipped`}
            </Button>
            <Button
              variant="ghost"
              size="lg"
              onClick={() => setConfirming(false)}
              disabled={pending}
            >
              Cancel
            </Button>
          </span>
        ) : (
          <Button variant="secondary" size="lg" onClick={() => setConfirming(true)}>
            Finish quiz
          </Button>
        )}
      </div>
    </section>
  );
}
