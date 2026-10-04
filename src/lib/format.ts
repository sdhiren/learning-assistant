const percentFormatter = new Intl.NumberFormat("en", {
  style: "percent",
  maximumFractionDigits: 0,
});
const relativeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const dateFormatter = new Intl.DateTimeFormat("en", { day: "numeric", month: "short" });

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** 0.734 -> "73%". */
export function formatPercent(ratio: number): string {
  return percentFormatter.format(ratio);
}

/** "5 minutes ago", "yesterday", or a short date for anything older than a week. */
export function formatRelativeDate(date: Date, now: Date = new Date()): string {
  const elapsedMs = now.getTime() - date.getTime();
  if (elapsedMs < MINUTE_MS) return "just now";
  if (elapsedMs < HOUR_MS)
    return relativeFormatter.format(-Math.floor(elapsedMs / MINUTE_MS), "minute");
  if (elapsedMs < DAY_MS) return relativeFormatter.format(-Math.floor(elapsedMs / HOUR_MS), "hour");
  if (elapsedMs < 7 * DAY_MS)
    return relativeFormatter.format(-Math.floor(elapsedMs / DAY_MS), "day");
  return dateFormatter.format(date);
}
