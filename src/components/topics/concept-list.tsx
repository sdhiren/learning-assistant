import Link from "next/link";

import {
  MASTERY_BAR_CLASSES,
  MASTERY_TEXT_CLASSES,
  MasteryBadge,
} from "@/components/ui/mastery-badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { cn } from "@/lib/cn";
import { formatPercent } from "@/lib/format";
import type { ConceptView } from "@/server/services/view-models";

interface ConceptListProps {
  topicId: string;
  concepts: readonly ConceptView[];
}

/** Concepts with their mastery; each row opens the concept's lesson page. */
export function ConceptList({ topicId, concepts }: ConceptListProps) {
  return (
    <ul className="divide-y divide-border">
      {concepts.map((concept) => (
        <li key={concept.id}>
          <Link
            href={`/topics/${topicId}/concepts/${concept.id}`}
            className="grid gap-2 px-5 py-3.5 transition-colors hover:bg-surface-muted sm:grid-cols-[1fr_auto] sm:items-center sm:gap-6"
          >
            <span className="space-y-0.5">
              <span className="block text-sm font-medium">{concept.name}</span>
              <span className="block text-sm text-muted">{concept.summary}</span>
            </span>
            <span className="flex items-center gap-3 sm:w-56">
              <ProgressBar
                value={concept.mastery.score ?? 0}
                label={`${concept.name} mastery`}
                barClassName={MASTERY_BAR_CLASSES[concept.mastery.level]}
              />
              {concept.mastery.score === null ? (
                <MasteryBadge level="not_started" />
              ) : (
                <span
                  className={cn(
                    "w-10 text-right text-xs font-medium",
                    MASTERY_TEXT_CLASSES[concept.mastery.level],
                  )}
                >
                  {formatPercent(concept.mastery.score)}
                </span>
              )}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
