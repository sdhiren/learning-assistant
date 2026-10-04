import { Card, CardTitle } from "@/components/ui/card";
import { ScoreTrend } from "@/components/ui/score-trend";
import { formatPercent } from "@/lib/format";
import type { TopicStatsView } from "@/server/services/view-models";

export function TopicStats({ stats }: { stats: TopicStatsView }) {
  const items = [
    { label: "Quizzes done", value: String(stats.completedQuizCount) },
    { label: "Questions answered", value: String(stats.answeredQuestionCount) },
    { label: "Accuracy", value: stats.accuracy === null ? "–" : formatPercent(stats.accuracy) },
  ];

  return (
    <Card aria-labelledby="stats-heading">
      <CardTitle id="stats-heading">Progress</CardTitle>
      <dl className="mt-4 grid grid-cols-3 gap-3">
        {items.map((item) => (
          <div key={item.label}>
            <dt className="text-xs text-muted">{item.label}</dt>
            <dd className="text-xl font-semibold tabular-nums">{item.value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-5">
        <p className="mb-1 text-xs text-muted">Recent quiz scores</p>
        <ScoreTrend scores={stats.recentScores} />
      </div>
    </Card>
  );
}
