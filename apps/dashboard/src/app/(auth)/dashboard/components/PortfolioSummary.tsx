import type React from "react";
import { formatCurrency, formatPercent } from "../hooks.js";
import type { PortfolioData } from "../types.js";
import { MetricCard } from "./MetricCard.js";

interface PortfolioSummaryProps {
  portfolio: PortfolioData | undefined;
  isLoading: boolean;
}

export function PortfolioSummary({
  portfolio,
  isLoading,
}: PortfolioSummaryProps): React.JSX.Element {
  const todayPnl = portfolio?.todayPnl ?? 0;
  const pnlColor = todayPnl >= 0 ? "text-green-600" : "text-red-600";

  return (
    <div className="grid grid-cols-3 gap-4">
      <MetricCard label="NAV" value={formatCurrency(portfolio?.nav ?? 0)} isLoading={isLoading} />
      <MetricCard
        label="Day P&L"
        value={formatCurrency(todayPnl)}
        subValue={formatPercent(portfolio?.todayPnlPct ?? 0)}
        valueColor={pnlColor}
        isLoading={isLoading}
      />
      <MetricCard
        label="Open Positions"
        value={String(portfolio?.positionCount ?? 0)}
        isLoading={isLoading}
      />
    </div>
  );
}
