import { Card, CardTitle } from "@/components/ui/card";
import type { TaskUsageView } from "@/server/services/view-models";

const OUTCOME_LABELS: Record<string, string> = {
  timeout: "timeout",
  invalid_output: "invalid output",
  refused: "refused",
  auth: "auth",
  rate_limited: "rate limited",
  error: "error",
};

function formatMs(ms: number | null): string {
  if (ms === null) return "—";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/** Calls, failures and latency per AI task over the usage window. */
export function TaskUsageTable({
  tasks,
  windowDays,
}: {
  tasks: TaskUsageView[];
  windowDays: number;
}) {
  return (
    <Card className="space-y-4">
      <CardTitle>Calls by task · last {windowDays} days</CardTitle>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="py-2 pr-4 font-medium">Task</th>
              <th className="py-2 pr-4 text-right font-medium">Calls</th>
              <th className="py-2 pr-4 font-medium">Failures</th>
              <th className="py-2 pr-4 text-right font-medium">p50</th>
              <th className="py-2 text-right font-medium">p95</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {tasks.map((task) => (
              <tr key={task.task}>
                <td className="py-2 pr-4 font-mono text-xs">{task.task}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{task.calls}</td>
                <td className="py-2 pr-4 text-muted">
                  {task.failureCount === 0
                    ? "none"
                    : Object.entries(task.failures)
                        .map(([outcome, count]) => `${count} ${OUTCOME_LABELS[outcome] ?? outcome}`)
                        .join(", ")}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">{formatMs(task.p50Ms)}</td>
                <td className="py-2 text-right tabular-nums">{formatMs(task.p95Ms)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">Latency percentiles count successful calls only.</p>
    </Card>
  );
}
