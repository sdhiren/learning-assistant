import Link from "next/link";

import { ProgressBar } from "@/components/ui/progress-bar";
import { formatPercent, formatRelativeDate } from "@/lib/format";
import type { TopicSummaryView } from "@/server/services/view-models";

export function TopicCard({ topic }: { topic: TopicSummaryView }) {
  return (
    <Link
      href={`/topics/${topic.id}`}
      className="group flex h-full flex-col gap-4 rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-accent/60"
    >
      <div className="space-y-1.5">
        <h3 className="font-semibold group-hover:text-accent">{topic.name}</h3>
        <p className="line-clamp-2 text-sm text-muted">{topic.summary}</p>
      </div>
      <div className="mt-auto space-y-2">
        <ProgressBar value={topic.progress} label={`${topic.name} progress`} />
        <div className="flex justify-between text-xs text-muted">
          <span>
            {formatPercent(topic.progress)} mastered · {topic.conceptCount} concepts
          </span>
          <span>
            {topic.lastStudiedAt
              ? `Studied ${formatRelativeDate(topic.lastStudiedAt)}`
              : "Not started"}
          </span>
        </div>
      </div>
    </Link>
  );
}
