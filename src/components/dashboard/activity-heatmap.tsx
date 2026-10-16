import type { DailyActivity } from "@/domain/activity";
import { cn } from "@/lib/cn";

const dateFormatter = new Intl.DateTimeFormat("en", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

/** Answer counts at or above each threshold get a stronger shade. */
const LEVEL_THRESHOLDS = [1, 4, 8, 15] as const;
const LEVEL_CLASSES = [
  "bg-surface-muted",
  "bg-accent/25",
  "bg-accent/50",
  "bg-accent/75",
  "bg-accent",
] as const;

function levelFor(count: number): number {
  return LEVEL_THRESHOLDS.filter((threshold) => count >= threshold).length;
}

function parseDateKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year!, month! - 1, day!);
}

/** A GitHub-style grid of daily practice: one column per week, Monday at the top. */
export function ActivityHeatmap({ days }: { days: readonly DailyActivity[] }) {
  if (days.length === 0) return null;

  // Pad the first week so every column starts on a Monday.
  const firstWeekday = (parseDateKey(days[0]!.date).getDay() + 6) % 7;
  const cells: (DailyActivity | null)[] = [...Array<null>(firstWeekday).fill(null), ...days];
  const weeks = Array.from({ length: Math.ceil(cells.length / 7) }, (_, week) =>
    cells.slice(week * 7, week * 7 + 7),
  );

  const activeDays = days.filter((day) => day.count > 0).length;
  const total = days.reduce((sum, day) => sum + day.count, 0);

  return (
    <figure className="space-y-2">
      <div
        role="img"
        aria-label={`${total} questions answered on ${activeDays} of the last ${days.length} days`}
        className="flex gap-1 overflow-x-auto"
      >
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="grid shrink-0 grid-rows-7 gap-1">
            {week.map((day, dayIndex) =>
              day ? (
                <span
                  key={day.date}
                  title={`${day.count} ${day.count === 1 ? "question" : "questions"} · ${dateFormatter.format(parseDateKey(day.date))}`}
                  className={cn(
                    "size-3 rounded-[3px] transition-transform hover:scale-125",
                    LEVEL_CLASSES[levelFor(day.count)],
                  )}
                />
              ) : (
                <span key={`pad-${dayIndex}`} className="size-3" />
              ),
            )}
          </div>
        ))}
      </div>
      <figcaption className="flex items-center justify-between gap-3 text-xs text-muted">
        <span>
          {activeDays} active {activeDays === 1 ? "day" : "days"} in the last 12 weeks
        </span>
        <span aria-hidden="true" className="flex items-center gap-1">
          Less
          {LEVEL_CLASSES.map((className) => (
            <span key={className} className={cn("size-2.5 rounded-[3px]", className)} />
          ))}
          More
        </span>
      </figcaption>
    </figure>
  );
}
