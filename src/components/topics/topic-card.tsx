import Link from "next/link";

import { ArrowRightIcon } from "@/components/ui/icons";
import { MasteryBreakdown } from "@/components/ui/mastery-breakdown";
import { ProgressRing } from "@/components/ui/progress-ring";
import { formatRelativeDate } from "@/lib/format";
import type { TopicSummaryView } from "@/server/services/view-models";

export function TopicCard({ topic }: { topic: TopicSummaryView }) {
  return (
    <Link
      href={`/topics/${topic.id}`}
      className="group relative flex h-full flex-col gap-4 overflow-hidden rounded-2xl border border-border bg-surface p-5 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-accent/50 hover:shadow-lift"
    >
      {/* A gradient edge that slides in on hover. */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-1 origin-left scale-x-0 bg-brand transition-transform duration-300 group-hover:scale-x-100"
      />
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1 space-y-1.5">
          <h3 className="font-semibold transition-colors group-hover:text-accent">{topic.name}</h3>
          <p className="line-clamp-2 text-sm text-muted">{topic.summary}</p>
        </div>
        <ProgressRing value={topic.progress} label={`${topic.name} mastery`} />
      </div>
      <div className="mt-auto space-y-2.5">
        <MasteryBreakdown counts={topic.masteryCounts} />
        <div className="flex items-center justify-between text-xs text-muted">
          <span>
            {topic.conceptCount} concepts ·{" "}
            {topic.lastStudiedAt
              ? `studied ${formatRelativeDate(topic.lastStudiedAt)}`
              : "not started"}
          </span>
          <span className="flex items-center gap-1 font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            Open
            <ArrowRightIcon className="size-3" />
          </span>
        </div>
      </div>
    </Link>
  );
}
