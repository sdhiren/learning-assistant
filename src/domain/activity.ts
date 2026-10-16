/**
 * Practice activity over time: daily answer counts and the current streak.
 * Days are calendar days in the machine's local time zone, which for this
 * local-first app is also the learner's.
 */

export interface DailyActivity {
  /** Local calendar date, "YYYY-MM-DD". */
  date: string;
  /** Questions answered that day (skipped questions don't count). */
  count: number;
}

export interface ActivitySummary {
  /** Oldest first, ending today; one entry per day, including empty days. */
  days: DailyActivity[];
  /** Consecutive days with practice, ending today (or yesterday, if today has none yet). */
  currentStreak: number;
  practisedToday: boolean;
  answeredLast7Days: number;
}

export function summarizeActivity(
  answeredAt: readonly Date[],
  now: Date,
  dayCount: number,
): ActivitySummary {
  const countsByDate = new Map<string, number>();
  for (const date of answeredAt) {
    const key = toDateKey(date);
    countsByDate.set(key, (countsByDate.get(key) ?? 0) + 1);
  }

  const days = Array.from({ length: dayCount }, (_, index) => {
    const date = toDateKey(addDays(now, index - dayCount + 1));
    return { date, count: countsByDate.get(date) ?? 0 };
  });

  const practisedToday = countsByDate.has(toDateKey(now));
  let currentStreak = 0;
  for (
    let offset = practisedToday ? 0 : 1;
    countsByDate.has(toDateKey(addDays(now, -offset)));
    offset++
  ) {
    currentStreak++;
  }

  const answeredLast7Days = days.slice(-7).reduce((sum, day) => sum + day.count, 0);
  return { days, currentStreak, practisedToday, answeredLast7Days };
}

/** Local calendar date as "YYYY-MM-DD". */
export function toDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
