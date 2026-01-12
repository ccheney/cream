/**
 * BacktestListItem Component
 *
 * Individual backtest item in the list with progress indicator for running backtests.
 */

"use client";

import { formatDistanceToNow } from "date-fns";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { type BacktestStatus, useBacktestProgress } from "@/hooks/useBacktestProgress";
import { BacktestProgressBar } from "./BacktestProgressBar";

// ============================================
// Types
// ============================================

export interface BacktestSummary {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  initialCapital: number;
  status: string;
  createdAt: string;
}

export interface BacktestListItemProps {
  backtest: BacktestSummary;
  isSelected?: boolean;
  onSelect?: (id: string) => void;
  formatCurrency: (value: number) => string;
}

// Simple className merger utility
function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}

// ============================================
// Component
// ============================================

export function BacktestListItem({
  backtest,
  isSelected,
  onSelect,
  formatCurrency,
}: BacktestListItemProps) {
  const bt = backtest;
  const isRunning = bt.status === "running" || bt.status === "pending";

  // Subscribe to progress updates for running backtests
  const { status: wsStatus, progress } = useBacktestProgress(isRunning ? bt.id : null);

  // Determine display status - prefer WebSocket status if running
  const displayStatus = isRunning && wsStatus !== "idle" ? wsStatus : (bt.status as BacktestStatus);

  return (
    <div
      className={cn(
        "flex flex-col p-4 hover:bg-cream-50 dark:hover:bg-night-750 transition-colors",
        isSelected && "bg-cream-50 dark:bg-night-750"
      )}
    >
      <div className="flex items-center">
        <button type="button" onClick={() => onSelect?.(bt.id)} className="flex-1 text-left">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-medium text-stone-900 dark:text-night-50">{bt.name}</span>
              <StatusBadge status={displayStatus} />
            </div>
            <span className="text-sm text-stone-500 dark:text-night-300">
              {formatDistanceToNow(
                new Date(bt.createdAt.endsWith("Z") ? bt.createdAt : `${bt.createdAt}Z`),
                { addSuffix: true }
              )}
            </span>
          </div>
          <div className="mt-1 text-sm text-stone-500 dark:text-night-300">
            {bt.startDate} to {bt.endDate} | {formatCurrency(bt.initialCapital)}
          </div>
        </button>
        <Link
          href={`/backtest/${bt.id}`}
          className="ml-4 p-2 rounded-md text-stone-400 dark:text-night-400 hover:text-stone-600 dark:text-night-200 hover:bg-cream-100 dark:hover:bg-night-700 transition-colors"
          title="View details"
        >
          <ChevronRight className="w-5 h-5" />
        </Link>
      </div>

      {/* Progress bar for running backtests */}
      {isRunning && wsStatus === "running" && progress && (
        <div className="mt-3 pt-3 border-t border-cream-100 dark:border-night-700">
          <BacktestProgressBar
            progressPct={progress.progress}
            status="running"
            showPhase
            showValue
            size="sm"
          />
        </div>
      )}
    </div>
  );
}

// ============================================
// Status Badge
// ============================================

function StatusBadge({ status }: { status: string }) {
  const colorClasses =
    status === "completed"
      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
      : status === "running"
        ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
        : status === "failed" || status === "error"
          ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
          : "bg-cream-100 text-stone-700 dark:bg-night-700 dark:text-night-400";

  return (
    <span className={`ml-2 px-2 py-0.5 text-xs font-medium rounded ${colorClasses}`}>{status}</span>
  );
}

export default BacktestListItem;
