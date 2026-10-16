import { MASTERY_LEVEL_LABELS, MASTERY_LEVELS, type MasteryLevel } from "@/domain/mastery";
import { cn } from "@/lib/cn";

import { MASTERY_BAR_CLASSES } from "./mastery-badge";

/** Strongest first, so the bar reads left to right from "done" to "to do". */
const ORDER = [...MASTERY_LEVELS].reverse();

/** A segmented bar showing how many concepts sit at each mastery level. */
export function MasteryBreakdown({
  counts,
  className,
}: {
  counts: Record<MasteryLevel, number>;
  className?: string;
}) {
  const total = ORDER.reduce((sum, level) => sum + counts[level], 0);
  if (total === 0) return null;
  const description = ORDER.filter((level) => counts[level] > 0)
    .map((level) => `${counts[level]} ${MASTERY_LEVEL_LABELS[level].toLowerCase()}`)
    .join(", ");

  return (
    <div
      role="img"
      aria-label={`Concepts: ${description}`}
      className={cn("flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full", className)}
    >
      {ORDER.map((level) =>
        counts[level] > 0 ? (
          <span
            key={level}
            title={`${counts[level]} ${MASTERY_LEVEL_LABELS[level]}`}
            className={cn(
              "h-full first:rounded-l-full last:rounded-r-full",
              MASTERY_BAR_CLASSES[level],
            )}
            style={{ width: `${(counts[level] / total) * 100}%` }}
          />
        ) : null,
      )}
    </div>
  );
}
