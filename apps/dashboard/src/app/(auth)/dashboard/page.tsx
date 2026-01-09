"use client";

/**
 * Dashboard Page - Control panel with OODA cycle status
 */

import { formatDistanceToNow } from "date-fns";
import { Rss } from "lucide-react";
import { useState } from "react";
import { CycleProgress } from "@/components/dashboard/CycleProgress";
import { QueryErrorBoundary } from "@/components/QueryErrorBoundary";
import { LiveDataIndicator, StreamingBadge } from "@/components/ui/RefreshIndicator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  usePauseSystem,
  usePortfolioSummary,
  useRecentDecisions,
  useStartSystem,
  useStopSystem,
  useSystemStatus,
  useTriggerCycle,
} from "@/hooks/queries";
import { useWebSocketContext } from "@/providers/WebSocketProvider";
import { useRealTimeFeed } from "@/stores/ui-store";

export default function DashboardPage() {
  const { connected } = useWebSocketContext();
  const { visible: feedVisible, toggle: toggleFeed } = useRealTimeFeed();
  const { data: status, isLoading: statusLoading, isFetching: statusFetching } = useSystemStatus();
  const { data: portfolio, isLoading: portfolioLoading } = usePortfolioSummary();
  const {
    data: decisions,
    isLoading: decisionsLoading,
    isFetching: decisionsFetching,
  } = useRecentDecisions(5);

  const startSystem = useStartSystem();
  const stopSystem = useStopSystem();
  const pauseSystem = usePauseSystem();
  const triggerCycle = useTriggerCycle();

  // Active cycle state
  const [activeCycleId, setActiveCycleId] = useState<string | null>(null);
  const [useDraftConfig, setUseDraftConfig] = useState(false);

  const handleTriggerCycle = () => {
    if (!status?.environment) {
      return;
    }

    triggerCycle.mutate(
      {
        environment: status.environment,
        useDraftConfig,
      },
      {
        onSuccess: (data) => {
          setActiveCycleId(data.cycleId);
        },
      }
    );
  };

  const handleCycleComplete = () => {
    setActiveCycleId(null);
  };

  const handleCycleError = () => {
    // Keep showing the error in the CycleProgress component
    // User can dismiss by triggering another cycle
  };

  const cycleInProgress = triggerCycle.isPending || activeCycleId !== null;

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
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-cream-900 dark:text-cream-100">Dashboard</h1>
          <Tooltip>
            <TooltipTrigger>
              <StreamingBadge isConnected={connected} isRefreshing={statusFetching} />
            </TooltipTrigger>
            <TooltipContent>
              {connected
                ? "WebSocket connected - receiving real-time updates"
                : "WebSocket disconnected - data may be stale"}
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="flex items-center gap-4">
          <Tooltip>
            <TooltipTrigger>
              <span className="text-sm text-cream-600 dark:text-cream-400 cursor-help">
                Next cycle in: {getNextCycleDisplay()}
              </span>
            </TooltipTrigger>
            <TooltipContent>Time until next OODA trading cycle starts</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger>
              <button
                type="button"
                onClick={toggleFeed}
                className={`p-2 rounded-md transition-colors ${
                  feedVisible
                    ? "bg-cream-100 text-cream-700 dark:bg-night-700 dark:text-cream-300"
                    : "text-cream-500 hover:text-cream-700 dark:text-cream-400 dark:hover:text-cream-200"
                }`}
              >
                <Rss className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{feedVisible ? "Hide event feed" : "Show event feed"}</TooltipContent>
          </Tooltip>
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

        {/* Trigger Cycle Section */}
        <div className="mt-6 bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100">
                Trading Cycle
              </h2>
              <p className="text-sm text-cream-500 dark:text-cream-400">
                Manually trigger an OODA trading cycle
              </p>
            </div>
            <div className="flex items-center gap-4">
              {status?.environment === "PAPER" && (
                <label className="flex items-center gap-2 text-sm text-cream-600 dark:text-cream-400">
                  <input
                    type="checkbox"
                    checked={useDraftConfig}
                    onChange={(e) => setUseDraftConfig(e.target.checked)}
                    disabled={cycleInProgress}
                    className="rounded border-cream-300 text-blue-600 focus:ring-blue-500"
                  />
                  Use draft config
                </label>
              )}
              <Tooltip>
                <TooltipTrigger>
                  <button
                    type="button"
                    onClick={handleTriggerCycle}
                    disabled={cycleInProgress || status?.environment === "LIVE"}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {triggerCycle.isPending
                      ? "Triggering..."
                      : activeCycleId
                        ? "Cycle Running..."
                        : "Trigger Cycle"}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {status?.environment === "LIVE"
                    ? "Manual triggers disabled in LIVE mode"
                    : "Start an on-demand OODA trading cycle"}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Cycle Progress */}
          {activeCycleId && (
            <div className="mt-4 pt-4 border-t border-cream-100 dark:border-night-700">
              <CycleProgress
                cycleId={activeCycleId}
                onComplete={handleCycleComplete}
                onError={handleCycleError}
              />
            </div>
          )}
        </div>

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
            value={formatCurrency(portfolio?.nav ?? 0)}
            isLoading={portfolioLoading}
          />
          <MetricCard
            label="Day P&L"
            value={formatCurrency(portfolio?.todayPnl ?? 0)}
            subValue={formatPct(portfolio?.todayPnlPct ?? 0)}
            valueColor={(portfolio?.todayPnl ?? 0) >= 0 ? "text-green-600" : "text-red-600"}
            isLoading={portfolioLoading}
          />
          <MetricCard
            label="Open Positions"
            value={String(portfolio?.positionCount ?? 0)}
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
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100">
              Recent Decisions
            </h2>
            <LiveDataIndicator
              isRefreshing={decisionsFetching}
              lastUpdated={decisions?.items?.[0]?.createdAt}
              className="text-cream-500 dark:text-cream-400"
            />
          </div>
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

/** Environment descriptions for tooltips */
const ENV_DESCRIPTIONS: Record<string, string> = {
  BACKTEST: "Historical simulation mode - no real orders",
  PAPER: "Paper trading mode - simulated orders with live data",
  LIVE: "Live trading mode - real orders with real money",
};

/** System status descriptions for tooltips */
const STATUS_DESCRIPTIONS: Record<string, string> = {
  ACTIVE: "System is running and executing OODA cycles",
  PAUSED: "System is paused - no new cycles will start",
  STOPPED: "System is stopped - must be started to trade",
};

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

  const envKey = status?.environment as keyof typeof envColors;
  const statusKey = status?.status as keyof typeof statusColors;

  return (
    <div className="flex items-center justify-between bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 px-4 py-3">
      <div className="flex items-center gap-4">
        <Tooltip>
          <TooltipTrigger>
            <span
              className={`px-3 py-1 text-sm font-medium rounded-full cursor-help ${
                envColors[envKey] ?? envColors.PAPER
              }`}
            >
              {status?.environment ?? "PAPER"}
            </span>
          </TooltipTrigger>
          <TooltipContent>{ENV_DESCRIPTIONS[envKey] ?? "Trading environment mode"}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger>
            <span
              className={`px-3 py-1 text-sm font-medium rounded-full cursor-help ${
                statusColors[statusKey] ?? statusColors.STOPPED
              }`}
            >
              {status?.status ?? "STOPPED"}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {STATUS_DESCRIPTIONS[statusKey] ?? "Current system status"}
          </TooltipContent>
        </Tooltip>
      </div>
      {status?.lastCycleTime && (
        <span className="text-sm text-cream-500 dark:text-cream-400">
          Last cycle: {formatDistanceToNow(new Date(status.lastCycleTime), { addSuffix: true })}
        </span>
      )}
    </div>
  );
}

/** OODA phase descriptions for tooltips */
const OODA_DESCRIPTIONS: Record<string, string> = {
  Observe: "Gather market data, candles, and news for analysis",
  Orient: "Process data through indicators and regime detection",
  Decide: "Agent network deliberates and forms consensus",
  Act: "Execute approved orders via broker API",
};

function OODAPhaseCard({
  phase,
  status,
  isLoading,
}: {
  phase: string;
  status: "idle" | "active" | "complete";
  isLoading: boolean;
}) {
  // Only show skeleton on initial load
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
    <Tooltip>
      <TooltipTrigger>
        <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4 relative cursor-help">
          {/* Live data indicator - always visible */}
          <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <div className="text-sm text-cream-500 dark:text-cream-400">{phase}</div>
          <div
            className={`mt-1 text-lg font-medium flex items-center gap-2 ${statusColors[status]}`}
          >
            <span>{statusIcons[status]}</span>
            <span className="capitalize">{status}</span>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent>{OODA_DESCRIPTIONS[phase] ?? phase}</TooltipContent>
    </Tooltip>
  );
}

/** Metric descriptions for tooltips */
const METRIC_DESCRIPTIONS: Record<string, string> = {
  NAV: "Net Asset Value - Total portfolio value including cash and positions",
  "Day P&L": "Today's profit and loss, both absolute and percentage",
  "Open Positions": "Number of currently active trades in the portfolio",
};

function MetricCard({
  label,
  value,
  subValue,
  valueColor,
  isLoading,
  tooltip,
}: {
  label: string;
  value: string;
  subValue?: string;
  valueColor?: string;
  isLoading: boolean;
  tooltip?: string;
}) {
  // Only show skeleton on initial load (no data)
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
        <div className="h-4 w-16 bg-cream-100 dark:bg-night-700 rounded animate-pulse mb-2" />
        <div className="h-8 w-24 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
      </div>
    );
  }

  const tooltipText = tooltip ?? METRIC_DESCRIPTIONS[label];

  const cardContent = (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4 relative cursor-help">
      {/* Live data indicator - always visible */}
      <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
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

  if (tooltipText) {
    return (
      <Tooltip>
        <TooltipTrigger>{cardContent}</TooltipTrigger>
        <TooltipContent>{tooltipText}</TooltipContent>
      </Tooltip>
    );
  }

  return cardContent;
}
