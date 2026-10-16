import type { ReactNode } from "react";

import { FlameIcon, SparklesIcon, TargetIcon, TrophyIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { formatPercent } from "@/lib/format";
import type { DashboardView } from "@/server/services/view-models";

import { ActivityHeatmap } from "./activity-heatmap";

function streakMessage({ currentStreak, practisedToday }: DashboardView["activity"]): string {
  if (currentStreak === 0) return "Answer a question today to start a streak.";
  if (!practisedToday) return "Practise today to keep it going.";
  return currentStreak === 1 ? "Nice start. Come back tomorrow." : "You're on a roll. Keep it up!";
}

/** Streak, recent volume, accuracy and mastery at a glance, plus the activity grid. */
export function PracticeStats({ dashboard }: { dashboard: DashboardView }) {
  const { activity } = dashboard;

  return (
    <section
      aria-labelledby="practice-heading"
      className="grid gap-4 rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-8"
    >
      <div className="space-y-4">
        <h2 id="practice-heading" className="sr-only">
          Your practice
        </h2>
        <div className="flex items-center gap-4">
          <span
            className={cn(
              "grid size-14 shrink-0 place-items-center rounded-2xl",
              activity.currentStreak > 0
                ? "bg-brand text-white shadow-lift"
                : "bg-surface-muted text-muted",
            )}
          >
            <FlameIcon className={cn("size-7", activity.practisedToday && "animate-pop")} />
          </span>
          <div>
            <p className="text-2xl font-semibold tabular-nums">
              {activity.currentStreak} day{activity.currentStreak === 1 ? "" : "s"}{" "}
              <span className="text-base font-medium text-muted">streak</span>
            </p>
            <p className="text-sm text-muted">{streakMessage(activity)}</p>
          </div>
        </div>
        <dl className="grid grid-cols-3 gap-3">
          <Stat
            icon={<SparklesIcon />}
            label="This week"
            value={String(activity.answeredLast7Days)}
          />
          <Stat
            icon={<TargetIcon />}
            label="Accuracy"
            value={dashboard.accuracy === null ? "–" : formatPercent(dashboard.accuracy)}
          />
          <Stat
            icon={<TrophyIcon />}
            label="Mastered"
            value={`${dashboard.strongConceptCount}/${dashboard.conceptCount}`}
          />
        </dl>
      </div>
      <ActivityHeatmap days={activity.days} />
    </section>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-muted px-3 py-2.5">
      <dt className="flex items-center gap-1.5 text-xs text-muted">
        <span className="text-accent">{icon}</span>
        {label}
      </dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
