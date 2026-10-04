import { MASTERY_LEVEL_LABELS, type MasteryLevel } from "@/domain/mastery";
import { cn } from "@/lib/cn";

export const MASTERY_TEXT_CLASSES: Record<MasteryLevel, string> = {
  not_started: "text-muted",
  weak: "text-danger",
  developing: "text-warning",
  strong: "text-success",
};

export const MASTERY_BAR_CLASSES: Record<MasteryLevel, string> = {
  not_started: "bg-border",
  weak: "bg-danger",
  developing: "bg-warning",
  strong: "bg-success",
};

const BADGE_CLASSES: Record<MasteryLevel, string> = {
  not_started: "bg-surface-muted text-muted",
  weak: "bg-danger-soft text-danger",
  developing: "bg-warning-soft text-warning",
  strong: "bg-success-soft text-success",
};

export function MasteryBadge({ level, className }: { level: MasteryLevel; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        BADGE_CLASSES[level],
        className,
      )}
    >
      {MASTERY_LEVEL_LABELS[level]}
    </span>
  );
}
