"use client";

import { cn } from "@/lib/cn";
import type { QuizQuestionView } from "@/server/services/view-models";

interface QuestionNavigatorProps {
  questions: readonly QuizQuestionView[];
  currentIndex: number;
  onSelect: (index: number) => void;
}

type QuestionStatus = "unanswered" | "correct" | "incorrect" | "skipped";

const STATUS_CLASSES: Record<QuestionStatus, string> = {
  unanswered: "border-border-strong bg-surface text-ink",
  correct: "border-success/50 bg-success-soft text-success",
  incorrect: "border-danger/50 bg-danger-soft text-danger",
  skipped: "border-border bg-surface-muted text-muted line-through",
};

const STATUS_LABELS: Record<QuestionStatus, string> = {
  unanswered: "not answered yet",
  correct: "answered correctly",
  incorrect: "answered incorrectly",
  skipped: "skipped",
};

export function statusOf(question: QuizQuestionView): QuestionStatus {
  if (!question.result) return "unanswered";
  if (question.result.skipped) return "skipped";
  return question.result.isCorrect ? "correct" : "incorrect";
}

/** Numbered buttons for jumping to any question, coloured by status. */
export function QuestionNavigator({ questions, currentIndex, onSelect }: QuestionNavigatorProps) {
  return (
    <nav aria-label="Questions">
      <ol className="flex flex-wrap gap-2">
        {questions.map((question, index) => {
          const status = statusOf(question);
          const isCurrent = index === currentIndex;
          return (
            <li key={question.id}>
              <button
                type="button"
                onClick={() => onSelect(index)}
                aria-current={isCurrent ? "step" : undefined}
                aria-label={`Question ${index + 1}, ${STATUS_LABELS[status]}`}
                className={cn(
                  "grid size-9 place-items-center rounded-lg border text-sm font-medium tabular-nums transition-colors",
                  "hover:border-accent",
                  STATUS_CLASSES[status],
                  isCurrent && "ring-2 ring-accent ring-offset-2 ring-offset-canvas",
                )}
              >
                {index + 1}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
