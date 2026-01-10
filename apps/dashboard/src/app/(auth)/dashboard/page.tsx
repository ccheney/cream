"use client";

/**
 * Dashboard Page - Control panel with OODA cycle status
 */

import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CycleProgress } from "@/components/dashboard/CycleProgress";
import { QueryErrorBoundary } from "@/components/QueryErrorBoundary";
import { EventFeed, type FeedEvent as EventFeedEvent } from "@/components/ui/event-feed";
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
import { type CyclePhase, useActiveCycle, useCycleActions } from "@/stores/cycle-store";
import { type FeedEvent as StoreFeedEvent, useEventFeedStore } from "@/stores/event-feed-store";

/**
 * Convert store event type to EventFeed component type.
 */
function mapEventType(storeType: StoreFeedEvent["type"]): EventFeedEvent["type"] {
  switch (storeType) {
    case "order_placed":
    case "order_cancelled":
    case "order_rejected":
      return "ORDER";
    case "order_filled":
    case "trade_executed":
      return "FILL";
    case "agent_decision":
      return "DECISION";
    default:
      return "QUOTE";
  }
}

/**
 * Convert store events to EventFeed component format.
 */
function convertEvents(storeEvents: StoreFeedEvent[]): EventFeedEvent[] {
  return storeEvents.map((event) => ({
    id: event.id,
    type: mapEventType(event.type),
    timestamp: event.timestamp,
    symbol: event.symbol,
    message: event.message,
    metadata: event.metadata,
  }));
}

export default function DashboardPage() {
  const { connected } = useWebSocketContext();
  const storeEvents = useEventFeedStore((s) => s.events);
  const feedEvents = convertEvents(storeEvents);
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

  // Use cycle-store for persistent cycle state across navigation
  const { cycle: activeCycle, isRunning: cycleIsRunning } = useActiveCycle();
  const { setCycle, reset: resetCycle } = useCycleActions();
  const activeCycleId = activeCycle?.id ?? null;

  const [useDraftConfig, setUseDraftConfig] = useState(false);

  // Sync running cycle from server to store on mount/status change
  // This handles the case where we navigate away and back while a cycle is running
  useEffect(() => {
    if (status?.runningCycle && !activeCycle) {
      // Server has a running cycle but store doesn't - sync it
      setCycle({
        id: status.runningCycle.cycleId,
        phase: status.runningCycle.phase ?? "observe",
        progress: 0, // Progress will be updated via WebSocket
        startedAt: status.runningCycle.startedAt,
      });
    } else if (!status?.runningCycle && activeCycle && cycleIsRunning) {
      // Server shows no running cycle but store does - cycle must have finished
      // Reset after a brief delay to allow completion state to show
      const timer = setTimeout(() => {
        resetCycle();
      }, 1000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [status?.runningCycle, activeCycle, cycleIsRunning, setCycle, resetCycle]);

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
          // Initialize cycle in store
          setCycle({
            id: data.cycleId,
            phase: "observe",
            progress: 0,
            startedAt: data.startedAt,
          });
        },
      }
    );
  };

  const handleCycleComplete = () => {
    // Cycle store is updated via WebSocket, but we can trigger a reset after a delay
    // to clear the UI after showing the completion state
    setTimeout(() => {
      resetCycle();
    }, 3000);
  };

  const handleCycleError = () => {
    // Keep showing the error in the CycleProgress component
    // User can dismiss by triggering another cycle
  };

  const cycleInProgress = triggerCycle.isPending || cycleIsRunning;

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
            currentPhase={activeCycle?.phase}
            isRunning={cycleIsRunning}
            isLoading={statusLoading}
          />
          <OODAPhaseCard
            phase="Orient"
            currentPhase={activeCycle?.phase}
            isRunning={cycleIsRunning}
            isLoading={statusLoading}
          />
          <OODAPhaseCard
            phase="Decide"
            currentPhase={activeCycle?.phase}
            isRunning={cycleIsRunning}
            isLoading={statusLoading}
          />
          <OODAPhaseCard
            phase="Act"
            currentPhase={activeCycle?.phase}
            isRunning={cycleIsRunning}
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
                <Link
                  key={decision.id}
                  href={`/decisions?cycle=${decision.cycleId}`}
                  className="flex items-center justify-between py-2 border-b border-cream-100 dark:border-night-700 last:border-0 hover:bg-cream-50 dark:hover:bg-white/[0.02] -mx-2 px-2 rounded transition-colors"
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
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-cream-500 dark:text-cream-400">No decisions yet</p>
          )}
        </div>
      </QueryErrorBoundary>

      {/* Real-time Event Feed */}
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100">Event Feed</h2>
          <span className="text-sm text-cream-500 dark:text-cream-400">
            {feedEvents.length} events
          </span>
        </div>
        <EventFeed events={feedEvents} height={300} data-testid="dashboard-event-feed" />
      </div>
    </div>
  );
}

/**
 * Compute OODA phase status based on current cycle phase.
 *
 * Phase order: observe → orient → decide → act → complete
 * - Phases before current: complete
 * - Current phase: active
 * - Phases after current: idle (waiting)
 */
function getOODAPhaseStatus(
  cardPhase: string,
  currentPhase: CyclePhase | undefined,
  isRunning: boolean
): "idle" | "active" | "complete" {
  if (!isRunning || !currentPhase) {
    return "idle";
  }

  const phaseOrder: CyclePhase[] = ["observe", "orient", "decide", "act", "complete"];
  const cardIndex = phaseOrder.indexOf(cardPhase.toLowerCase() as CyclePhase);
  const currentIndex = phaseOrder.indexOf(currentPhase);

  if (cardIndex === -1 || currentIndex === -1) {
    return "idle";
  }

  if (currentPhase === "complete") {
    // Cycle complete - all phases are complete
    return "complete";
  }

  if (cardIndex < currentIndex) {
    return "complete";
  } else if (cardIndex === currentIndex) {
    return "active";
  }
  return "idle";
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
  currentPhase,
  isRunning,
  isLoading,
}: {
  phase: string;
  currentPhase: CyclePhase | undefined;
  isRunning: boolean;
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

  // Compute status based on current phase from cycle-store
  const status = getOODAPhaseStatus(phase, currentPhase, isRunning);

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

  const statusLabels = {
    idle: "Waiting",
    active: "Active",
    complete: "Complete",
  };

  return (
    <Tooltip>
      <TooltipTrigger>
        <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4 relative cursor-help">
          {/* Pulsing indicator only when this phase is active */}
          {status === "active" && (
            <span className="absolute top-2 right-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
              </span>
            </span>
          )}
          {status === "complete" && (
            <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-green-500" />
          )}
          <div className="text-sm text-cream-500 dark:text-cream-400">{phase}</div>
          <div
            className={`mt-1 text-lg font-medium flex items-center gap-2 ${statusColors[status]}`}
          >
            <span>{statusIcons[status]}</span>
            <span>{statusLabels[status]}</span>
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
