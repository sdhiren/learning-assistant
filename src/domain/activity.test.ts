import { describe, expect, it } from "vitest";

import { summarizeActivity, toDateKey } from "./activity";

/** Local-time date, so tests don't depend on the machine's time zone. */
const at = (day: number, hour = 12) => new Date(2026, 2, day, hour);
const now = at(10, 18);

describe("summarizeActivity", () => {
  it("counts answers per local day, oldest first, ending today", () => {
    const summary = summarizeActivity([at(10, 9), at(10, 17), at(8)], now, 3);
    expect(summary.days).toEqual([
      { date: "2026-03-08", count: 1 },
      { date: "2026-03-09", count: 0 },
      { date: "2026-03-10", count: 2 },
    ]);
  });

  it("counts the streak of consecutive days ending today", () => {
    const summary = summarizeActivity([at(10), at(9), at(8), at(6)], now, 7);
    expect(summary).toMatchObject({ currentStreak: 3, practisedToday: true });
  });

  it("keeps yesterday's streak alive until today is over", () => {
    const summary = summarizeActivity([at(9), at(8)], now, 7);
    expect(summary).toMatchObject({ currentStreak: 2, practisedToday: false });
  });

  it("resets the streak after a missed day", () => {
    expect(summarizeActivity([at(8), at(7)], now, 7).currentStreak).toBe(0);
    expect(summarizeActivity([], now, 7).currentStreak).toBe(0);
  });

  it("totals the last seven days only", () => {
    const summary = summarizeActivity([at(10), at(4), at(3)], now, 14);
    expect(summary.answeredLast7Days).toBe(2);
  });
});

describe("toDateKey", () => {
  it("formats the local calendar date", () => {
    expect(toDateKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});
