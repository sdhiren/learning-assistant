import { cn } from "@/lib/cn";
import { formatPercent } from "@/lib/format";

interface ProgressBarProps {
  /** 0 to 1. */
  value: number;
  label: string;
  className?: string;
  barClassName?: string;
}

export function ProgressBar({ value, label, className, barClassName }: ProgressBarProps) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={formatPercent(percent / 100)}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-surface-muted", className)}
    >
      <div
        className={cn("h-full rounded-full bg-accent transition-[width]", barClassName)}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
