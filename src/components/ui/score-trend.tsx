import { formatPercent } from "@/lib/format";

interface ScoreTrendProps {
  /** Quiz scores from 0 to 1, oldest first. */
  scores: readonly number[];
}

const WIDTH = 240;
const HEIGHT = 56;
const PADDING = 4;

/** A small line chart of recent quiz scores. */
export function ScoreTrend({ scores }: ScoreTrendProps) {
  if (scores.length < 2) {
    return <p className="text-sm text-muted">Complete two quizzes to see your trend.</p>;
  }

  const stepX = (WIDTH - PADDING * 2) / (scores.length - 1);
  const points = scores.map((score, index) => ({
    x: PADDING + index * stepX,
    y: PADDING + (1 - score) * (HEIGHT - PADDING * 2),
  }));
  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
    .join(" ");
  const last = points.at(-1)!;
  const description = `Last ${scores.length} quiz scores: ${scores.map(formatPercent).join(", ")}`;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="h-14 w-full max-w-60 text-accent"
      role="img"
      aria-label={description}
    >
      <line
        x1={PADDING}
        x2={WIDTH - PADDING}
        y1={HEIGHT / 2}
        y2={HEIGHT / 2}
        className="stroke-border"
        strokeDasharray="3 3"
      />
      <path d={path} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
      <circle cx={last.x} cy={last.y} r={3.5} fill="currentColor" />
    </svg>
  );
}
