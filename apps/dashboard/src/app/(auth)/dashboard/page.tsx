"use client";

/**
 * Dashboard Page - Control panel with OODA cycle status
 */

import { formatDistanceToNow } from "date-fns";
import { QueryErrorBoundary } from "@/components/QueryErrorBoundary";
import {
  usePauseSystem,
  usePortfolioSummary,
  useRecentDecisions,
  useStartSystem,
  useStopSystem,
  useSystemStatus,
} from "@/hooks/queries";

export default function DashboardPage() {
  const { data: status, isLoading: statusLoading } = useSystemStatus();
  const { data: portfolio, isLoading: portfolioLoading } = usePortfolioSummary();
  const { data: decisions, isLoading: decisionsLoading } = useRecentDecisions(5);

  const startSystem = useStartSystem();
  const stopSystem = useStopSystem();
  const pauseSystem = usePauseSystem();

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);

  const formatPct = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

  const getNextCycleDisplay = () => {
    if (!status?.nextCycleTime) {
      return "--:--";
    }
    const nextCycle = new Date(status.nextCycleTime);
    const now = new Date();
    const diffMs = nextCycle.getTime() - now.getTime();
    if (diffMs <= 0) {
      return "Now";
    }
    const mins = Math.floor(diffMs / 60000);
    const secs = Math.floor((diffMs % 60000) / 1000);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-cream-900 dark:text-cream-100">Dashboard</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-cream-600 dark:text-cream-400">
            Next cycle in: {getNextCycleDisplay()}
          </span>
          <div className="flex items-center gap-2">
            {status?.status === "STOPPED" && (
              <button
                type="button"
                onClick={() => startSystem.mutate({})}
                disabled={startSystem.isPending}
                className="px-3 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md disabled:opacity-50"
              >
                {startSystem.isPending ? "Starting..." : "Start"}
              </button>
            )}
            {status?.status === "ACTIVE" && (
              <>
                <button
                  type="button"
                  onClick={() => pauseSystem.mutate()}
                  disabled={pauseSystem.isPending}
                  className="px-3 py-1.5 text-sm font-medium text-cream-700 bg-cream-100 hover:bg-cream-200 dark:text-cream-200 dark:bg-night-700 dark:hover:bg-night-600 rounded-md disabled:opacity-50"
                >
                  Pause
                </button>
                <button
                  type="button"
                  onClick={() => stopSystem.mutate({})}
                  disabled={stopSystem.isPending}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md disabled:opacity-50"
                >
                  Stop
                </button>
              </>
            )}
            {status?.status === "PAUSED" && (
              <>
                <button
                  type="button"
                  onClick={() => startSystem.mutate({})}
                  disabled={startSystem.isPending}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md disabled:opacity-50"
                >
                  Resume
                </button>
                <button
                  type="button"
                  onClick={() => stopSystem.mutate({})}
                  disabled={stopSystem.isPending}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md disabled:opacity-50"
                >
                  Stop
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* System Status Banner */}
      <QueryErrorBoundary title="Failed to load system status">
        <SystemStatusBanner status={status} isLoading={statusLoading} />

        {/* OODA Cycle Status */}
        <div className="grid grid-cols-4 gap-4 mt-6">
          <OODAPhaseCard
            phase="Observe"
            status={getOODAPhaseStatus("observe", status?.lastCycleId)}
            isLoading={statusLoading}
          />
          <OODAPhaseCard
            phase="Orient"
            status={getOODAPhaseStatus("orient", status?.lastCycleId)}
            isLoading={statusLoading}
          />
          <OODAPhaseCard
            phase="Decide"
            status={getOODAPhaseStatus("decide", status?.lastCycleId)}
            isLoading={statusLoading}
          />
          <OODAPhaseCard
            phase="Act"
            status={getOODAPhaseStatus("act", status?.lastCycleId)}
            isLoading={statusLoading}
          />
        </div>
      </QueryErrorBoundary>

      {/* Portfolio Summary */}
      <QueryErrorBoundary title="Failed to load portfolio">
        <div className="grid grid-cols-3 gap-4">
          <MetricCard
            label="NAV"
            value={portfolioLoading ? "--" : formatCurrency(portfolio?.nav ?? 0)}
            isLoading={portfolioLoading}
          />
          <MetricCard
            label="Day P&L"
            value={portfolioLoading ? "--" : formatCurrency(portfolio?.todayPnl ?? 0)}
            subValue={portfolioLoading ? "" : formatPct(portfolio?.todayPnlPct ?? 0)}
            valueColor={(portfolio?.todayPnl ?? 0) >= 0 ? "text-green-600" : "text-red-600"}
            isLoading={portfolioLoading}
          />
          <MetricCard
            label="Open Positions"
            value={portfolioLoading ? "--" : String(portfolio?.positionCount ?? 0)}
            isLoading={portfolioLoading}
          />
        </div>
      </QueryErrorBoundary>

      {/* Active Alerts */}
      {status?.alerts && status.alerts.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800 p-4">
          <h2 className="text-lg font-medium text-amber-800 dark:text-amber-200 mb-2">
            Active Alerts ({status.alerts.length})
          </h2>
          <ul className="space-y-2">
            {status.alerts.slice(0, 3).map((alert) => (
              <li
                key={alert.id}
                className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300"
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    alert.severity === "critical"
                      ? "bg-red-500"
                      : alert.severity === "warning"
                        ? "bg-amber-500"
                        : "bg-blue-500"
                  }`}
                />
                {alert.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recent Decisions */}
      <QueryErrorBoundary title="Failed to load decisions">
        <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
          <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-4">
            Recent Decisions
          </h2>
          {decisionsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-12 bg-cream-100 dark:bg-night-700 rounded animate-pulse"
                />
              ))}
            </div>
          ) : decisions?.items && decisions.items.length > 0 ? (
            <div className="space-y-2">
              {decisions.items.map((decision) => (
                <div
                  key={decision.id}
                  className="flex items-center justify-between py-2 border-b border-cream-100 dark:border-night-700 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2 py-0.5 text-xs font-medium rounded ${
                        decision.action === "BUY"
                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                          : decision.action === "SELL"
                            ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                            : "bg-cream-100 text-cream-800 dark:bg-night-700 dark:text-cream-400"
                      }`}
                    >
                      {decision.action}
                    </span>
                    <span className="font-medium text-cream-900 dark:text-cream-100">
                      {decision.symbol}
                    </span>
                    <span className="text-sm text-cream-500 dark:text-cream-400">
                      {decision.size} {decision.sizeUnit.toLowerCase()}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2 py-0.5 text-xs font-medium rounded ${
                        decision.status === "EXECUTED"
                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                          : decision.status === "PENDING"
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                            : decision.status === "REJECTED"
                              ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                              : "bg-cream-100 text-cream-800 dark:bg-night-700 dark:text-cream-400"
                      }`}
                    >
                      {decision.status}
                    </span>
                    <span className="text-sm text-cream-500 dark:text-cream-400">
                      {formatDistanceToNow(new Date(decision.createdAt), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-cream-500 dark:text-cream-400">No decisions yet</p>
          )}
        </div>
      </QueryErrorBoundary>
    </div>
  );
}

function getOODAPhaseStatus(
  _phase: string,
  lastCycleId: string | null | undefined
): "idle" | "active" | "complete" {
  // In a real implementation, this would check the actual cycle state
  // For now, return idle if no cycle, complete otherwise
  if (!lastCycleId) {
    return "idle";
  }
  return "complete";
}

function SystemStatusBanner({
  status,
  isLoading,
}: {
  status?: {
    environment: string;
    status: string;
    lastCycleTime: string | null;
  };
  isLoading: boolean;
}) {
  if (isLoading) {
    return <div className="h-12 bg-cream-100 dark:bg-night-700 rounded-lg animate-pulse" />;
  }

  const envColors = {
    BACKTEST: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    PAPER: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    LIVE: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };

  const statusColors = {
    ACTIVE: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    PAUSED: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    STOPPED: "bg-cream-100 text-cream-800 dark:bg-night-700 dark:text-cream-400",
  };

  return (
    <div className="flex items-center justify-between bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 px-4 py-3">
      <div className="flex items-center gap-4">
        <span
          className={`px-3 py-1 text-sm font-medium rounded-full ${
            envColors[status?.environment as keyof typeof envColors] ?? envColors.PAPER
          }`}
        >
          {status?.environment ?? "PAPER"}
        </span>
        <span
          className={`px-3 py-1 text-sm font-medium rounded-full ${
            statusColors[status?.status as keyof typeof statusColors] ?? statusColors.STOPPED
          }`}
        >
          {status?.status ?? "STOPPED"}
        </span>
      </div>
      {status?.lastCycleTime && (
        <span className="text-sm text-cream-500 dark:text-cream-400">
          Last cycle: {formatDistanceToNow(new Date(status.lastCycleTime), { addSuffix: true })}
        </span>
      )}
    </div>
  );
}

function OODAPhaseCard({
  phase,
  status,
  isLoading,
}: {
  phase: string;
  status: "idle" | "active" | "complete";
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
        <div className="h-4 w-16 bg-cream-100 dark:bg-night-700 rounded animate-pulse mb-2" />
        <div className="h-6 w-20 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
      </div>
    );
  }

  const statusColors = {
    idle: "text-cream-500 dark:text-cream-400",
    active: "text-blue-600 dark:text-blue-400",
    complete: "text-green-600 dark:text-green-400",
  };

  const statusIcons = {
    idle: "○",
    active: "◉",
    complete: "✓",
  };

  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
      <div className="text-sm text-cream-500 dark:text-cream-400">{phase}</div>
      <div className={`mt-1 text-lg font-medium flex items-center gap-2 ${statusColors[status]}`}>
        <span>{statusIcons[status]}</span>
        <span className="capitalize">{status}</span>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  subValue,
  valueColor,
  isLoading,
}: {
  label: string;
  value: string;
  subValue?: string;
  valueColor?: string;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
        <div className="h-4 w-16 bg-cream-100 dark:bg-night-700 rounded animate-pulse mb-2" />
        <div className="h-8 w-24 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
      <div className="text-sm text-cream-500 dark:text-cream-400">{label}</div>
      <div className="flex items-baseline gap-2">
        <div
          className={`mt-1 text-2xl font-semibold ${
            valueColor ?? "text-cream-900 dark:text-cream-100"
          }`}
        >
          {value}
        </div>
        {subValue && (
          <span className={`text-sm ${valueColor ?? "text-cream-500"}`}>{subValue}</span>
        )}
      </div>
    </div>
  );
}
