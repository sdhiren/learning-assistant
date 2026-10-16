import Link from "next/link";

import { buttonClasses } from "@/components/ui/button";
import { ArrowRightIcon, BookIcon, PlayIcon } from "@/components/ui/icons";
import { MasteryBadge } from "@/components/ui/mastery-badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { DIFFICULTY_LABELS } from "@/domain/difficulty";
import { cn } from "@/lib/cn";
import type { DashboardView } from "@/server/services/view-models";

/** Unfinished quizzes first, then the concepts most worth practising next. */
export function NextUp({ dashboard }: { dashboard: DashboardView }) {
  const { inProgressQuizzes, recommendations } = dashboard;
  if (inProgressQuizzes.length === 0 && recommendations.length === 0) return null;

  return (
    <section aria-labelledby="next-up-heading" className="space-y-4">
      <div>
        <h2 id="next-up-heading" className="text-lg font-semibold">
          Pick up where you left off
        </h2>
        <p className="text-sm text-muted">
          Unfinished quizzes, then what to practise next in each topic.
        </p>
      </div>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {inProgressQuizzes.map((quiz) => (
          <li key={quiz.id}>
            <Link
              href={`/quizzes/${quiz.id}`}
              className="group flex h-full flex-col gap-3 rounded-2xl border border-accent/40 bg-accent-soft p-4 transition-all hover:-translate-y-0.5 hover:shadow-lift"
            >
              <span className="flex items-center gap-2 text-xs font-semibold tracking-wide text-accent uppercase">
                <PlayIcon className="size-3" />
                Quiz in progress
              </span>
              <span className="space-y-0.5">
                <span className="block font-medium">{quiz.topicName}</span>
                <span className="block text-sm text-muted">
                  {DIFFICULTY_LABELS[quiz.difficulty]}
                  {quiz.focusLabel && ` · ${quiz.focusLabel}`}
                </span>
              </span>
              <span className="mt-auto flex items-center gap-3">
                <ProgressBar
                  value={quiz.answeredCount / Math.max(1, quiz.questionCount)}
                  label={`${quiz.topicName} quiz progress`}
                />
                <span className="text-xs whitespace-nowrap text-muted tabular-nums">
                  {quiz.answeredCount}/{quiz.questionCount}
                </span>
              </span>
              <span className="flex items-center gap-1 text-sm font-medium text-accent">
                Resume
                <ArrowRightIcon className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          </li>
        ))}
        {recommendations.map(({ topicId, topicName, concept }) => {
          const href = `/topics/${topicId}/concepts/${concept.id}`;
          return (
            <li
              key={concept.id}
              className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-xs font-medium text-muted">{topicName}</span>
                <MasteryBadge level={concept.mastery.level} />
              </span>
              <span className="space-y-0.5">
                <Link href={href} className="block font-medium hover:text-accent">
                  {concept.name}
                </Link>
                <span className="line-clamp-2 block text-sm text-muted">{concept.summary}</span>
              </span>
              <Link
                href={href}
                className={cn(buttonClasses("secondary", "sm"), "mt-auto self-start")}
                aria-label={`Study ${concept.name}`}
              >
                <BookIcon className="size-3.5" />
                Study this
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
