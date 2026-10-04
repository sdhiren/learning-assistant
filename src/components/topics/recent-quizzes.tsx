import Link from "next/link";

import { DIFFICULTY_LABELS } from "@/domain/difficulty";
import { formatPercent, formatRelativeDate } from "@/lib/format";
import type { QuizHistoryItemView } from "@/server/services/view-models";

export function RecentQuizzes({ quizzes }: { quizzes: readonly QuizHistoryItemView[] }) {
  if (quizzes.length === 0) return null;

  return (
    <section aria-labelledby="history-heading" className="space-y-4">
      <h2 id="history-heading" className="text-lg font-semibold">
        Quiz history
      </h2>
      <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
        {quizzes.map((quiz) => (
          <li key={quiz.id}>
            <Link
              href={`/quizzes/${quiz.id}`}
              className="flex items-center justify-between gap-4 px-5 py-3 text-sm transition-colors hover:bg-surface-muted"
            >
              <span>
                <span className="font-medium">{DIFFICULTY_LABELS[quiz.difficulty]}</span>
                {quiz.focusLabel && <span> · {quiz.focusLabel}</span>}
                <span className="text-muted"> · {formatRelativeDate(quiz.createdAt)}</span>
              </span>
              <span className="font-medium tabular-nums">
                {quiz.status === "completed" && quiz.score !== null ? (
                  formatPercent(quiz.score)
                ) : (
                  <span className="text-accent">In progress</span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
