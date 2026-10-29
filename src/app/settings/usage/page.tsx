import type { Metadata } from "next";
import { connection } from "next/server";

import { Card } from "@/components/ui/card";
import { ProviderUsageCards } from "@/components/usage/provider-usage-cards";
import { TaskUsageTable } from "@/components/usage/task-usage-table";
import { getAiProviderInfo, getServices } from "@/server/container";

export const metadata: Metadata = { title: "Usage" };

export default async function UsagePage() {
  await connection();
  const usage = getServices().usage.getUsage();
  const ai = getAiProviderInfo();
  const month = usage.monthStart.toLocaleDateString("en", { month: "long", year: "numeric" });

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Usage</h1>
        <p className="text-muted">
          Every request to {ai.label}: how long it took, whether it worked, and the tokens it used.
          Prompts and answers are never recorded.
        </p>
      </header>

      {usage.tasks.length === 0 ? (
        <Card>
          <p className="text-muted">
            No AI calls in the last {usage.windowDays} days. Create a topic or start a quiz and they
            will show up here.
          </p>
        </Card>
      ) : (
        <TaskUsageTable tasks={usage.tasks} windowDays={usage.windowDays} />
      )}

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Tokens and cost · {month}</h2>
        {usage.providers.length === 0 ? (
          <Card>
            <p className="text-muted">No AI calls this month yet.</p>
          </Card>
        ) : (
          <ProviderUsageCards providers={usage.providers} pricesAsOf={usage.pricesAsOf} />
        )}
        <p className="text-xs text-muted">
          Costs are shown per provider and model and are never added together. Estimates use list
          prices and may differ from your bill.
        </p>
      </section>
    </div>
  );
}
