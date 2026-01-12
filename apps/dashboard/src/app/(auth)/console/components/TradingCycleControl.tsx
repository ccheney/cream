import type React from "react";
import { CycleProgress } from "@/components/dashboard/CycleProgress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { TradingCycleControlProps } from "../types";

export function TradingCycleControl({
  status,
  activeCycleId,
  cycleInProgress,
  useDraftConfig,
  onUseDraftConfigChange,
  onTriggerCycle,
  onCycleComplete,
  onCycleError,
}: TradingCycleControlProps): React.JSX.Element {
  return (
    <div className="mt-6 bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-stone-900 dark:text-night-50">Trading Cycle</h2>
          <p className="text-sm text-stone-500 dark:text-night-300">
            Manually trigger an OODA trading cycle
          </p>
        </div>
        <div className="flex items-center gap-4">
          {status?.environment === "PAPER" && (
            <label className="flex items-center gap-2 text-sm text-stone-600 dark:text-night-200 dark:text-night-400">
              <input
                type="checkbox"
                checked={useDraftConfig}
                onChange={(e) => onUseDraftConfigChange(e.target.checked)}
                disabled={cycleInProgress}
                className="rounded border-cream-300 text-amber-600 focus:ring-amber-500"
              />
              Use draft config
            </label>
          )}
          <Tooltip>
            <TooltipTrigger>
              <button
                type="button"
                onClick={onTriggerCycle}
                disabled={cycleInProgress || status?.environment === "LIVE"}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {cycleInProgress
                  ? activeCycleId
                    ? "Cycle Running..."
                    : "Triggering..."
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

      {activeCycleId && (
        <div className="mt-4 pt-4 border-t border-cream-100 dark:border-night-700 overflow-hidden">
          <CycleProgress
            cycleId={activeCycleId}
            onComplete={onCycleComplete}
            onError={onCycleError}
          />
        </div>
      )}
    </div>
  );
}
