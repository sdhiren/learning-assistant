import { Card, CardTitle } from "@/components/ui/card";
import type { ProviderUsageView } from "@/server/services/view-models";

const tokens = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

function formatUsd(value: number): string {
  return `$${value < 0.01 && value > 0 ? value.toFixed(4) : value.toFixed(2)}`;
}

function CostLine({ row, pricesAsOf }: { row: ProviderUsageView; pricesAsOf: string }) {
  if (row.reportedCostUsd !== null) {
    return row.isSubscription ? (
      <p>
        {formatUsd(row.reportedCostUsd)}{" "}
        <span className="text-muted">API-equivalent, not billed</span>
      </p>
    ) : (
      <p>
        {formatUsd(row.reportedCostUsd)} <span className="text-muted">reported</span>
      </p>
    );
  }
  if (row.estimatedCostUsd !== null) {
    return (
      <p>
        {formatUsd(row.estimatedCostUsd)}{" "}
        <span className="text-muted">est. from list prices as of {pricesAsOf}</span>
      </p>
    );
  }
  return (
    <p>
      — <span className="text-muted">no price for this model</span>
    </p>
  );
}

/**
 * One card per provider and model for the current month. Costs are never
 * added up across cards: a subscription's API-equivalent cost isn't billed.
 */
export function ProviderUsageCards({
  providers,
  pricesAsOf,
}: {
  providers: ProviderUsageView[];
  pricesAsOf: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {providers.map((row) => (
        <Card key={`${row.provider}:${row.model}`} className="space-y-3">
          <div>
            <CardTitle>{row.providerName}</CardTitle>
            <p className="font-mono text-xs text-muted">{row.model}</p>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted">Calls</dt>
            <dd className="text-right tabular-nums">{row.calls}</dd>
            <dt className="text-muted">Input tokens</dt>
            <dd className="text-right tabular-nums">{tokens.format(row.inputTokens)}</dd>
            <dt className="text-muted">Output tokens</dt>
            <dd className="text-right tabular-nums">{tokens.format(row.outputTokens)}</dd>
            <dt className="text-muted">Cache read / write</dt>
            <dd className="text-right tabular-nums">
              {tokens.format(row.cacheReadTokens)} / {tokens.format(row.cacheWriteTokens)}
            </dd>
          </dl>
          <div className="border-t border-border/70 pt-2 text-sm">
            <CostLine row={row} pricesAsOf={pricesAsOf} />
          </div>
        </Card>
      ))}
    </div>
  );
}
