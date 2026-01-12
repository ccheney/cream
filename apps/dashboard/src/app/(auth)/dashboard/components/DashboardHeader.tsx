import type React from "react";
import { StreamingBadge } from "@/components/ui/RefreshIndicator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { DashboardHeaderProps } from "../types";

function SystemControls({
  status,
  onStart,
  onStop,
  onPause,
  isStarting,
  isStopping,
  isPausing,
}: DashboardHeaderProps["systemControls"]): React.JSX.Element | null {
  if (status?.status === "STOPPED") {
    return (
      <button
        type="button"
        onClick={onStart}
        disabled={isStarting}
        className="px-3 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md disabled:opacity-50"
      >
        {isStarting ? "Starting..." : "Start"}
      </button>
    );
  }

  if (status?.status === "ACTIVE") {
    return (
      <>
        <button
          type="button"
          onClick={onPause}
          disabled={isPausing}
          className="px-3 py-1.5 text-sm font-medium text-stone-700 dark:text-night-100 bg-cream-100 hover:bg-cream-200 dark:text-night-200 dark:bg-night-700 dark:hover:bg-night-600 rounded-md disabled:opacity-50"
        >
          Pause
        </button>
        <button
          type="button"
          onClick={onStop}
          disabled={isStopping}
          className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md disabled:opacity-50"
        >
          Stop
        </button>
      </>
    );
  }

  if (status?.status === "PAUSED") {
    return (
      <>
        <button
          type="button"
          onClick={onStart}
          disabled={isStarting}
          className="px-3 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md disabled:opacity-50"
        >
          Resume
        </button>
        <button
          type="button"
          onClick={onStop}
          disabled={isStopping}
          className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md disabled:opacity-50"
        >
          Stop
        </button>
      </>
    );
  }

  return null;
}

export function DashboardHeader({
  connected,
  statusFetching,
  nextCycleDisplay,
  systemControls,
}: DashboardHeaderProps): React.JSX.Element {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold text-stone-900 dark:text-night-50">Dashboard</h1>
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
            <span className="text-sm text-stone-600 dark:text-night-200 dark:text-night-400 cursor-help">
              Next cycle in: {nextCycleDisplay}
            </span>
          </TooltipTrigger>
          <TooltipContent>Time until next OODA trading cycle starts</TooltipContent>
        </Tooltip>
        <div className="flex items-center gap-2">
          <SystemControls {...systemControls} />
        </div>
      </div>
    </div>
  );
}
