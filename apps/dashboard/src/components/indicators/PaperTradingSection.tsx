/**
 * Paper Trading Section
 *
 * Displays indicators currently in paper trading with progress.
 */

import Link from "next/link";
import type { PaperTradingIndicator } from "@/hooks/queries";

interface PaperTradingSectionProps {
  indicators: PaperTradingIndicator[] | undefined;
  isLoading: boolean;
}

/**
 * Progress bar component.
 */
function ProgressBar({
  progress,
  status,
}: {
  progress: number;
  status: "on_track" | "at_risk" | "ahead";
}) {
  const statusColors = {
    on_track: "bg-blue-500",
    at_risk: "bg-amber-500",
    ahead: "bg-green-500",
  };

  return (
    <div className="w-full bg-cream-200 dark:bg-night-700 rounded-full h-2">
      <div
        className={`h-2 rounded-full transition-all ${statusColors[status]}`}
        style={{ width: `${Math.min(progress, 100)}%` }}
      />
    </div>
  );
}

/**
 * Determine paper trading status based on metrics.
 */
function getPaperTradingStatus(indicator: PaperTradingIndicator): "on_track" | "at_risk" | "ahead" {
  if (indicator.currentIC === null) {
    return "on_track";
  }
  if (indicator.currentIC >= 0.03) {
    return "ahead";
  }
  if (indicator.currentIC < 0.01) {
    return "at_risk";
  }
  return "on_track";
}

/**
 * Get status label and message.
 */
function getStatusMessage(status: "on_track" | "at_risk" | "ahead"): {
  label: string;
  className: string;
} {
  switch (status) {
    case "ahead":
      return { label: "Exceeding expectations", className: "text-green-600 dark:text-green-400" };
    case "at_risk":
      return {
        label: "Performance below threshold",
        className: "text-amber-600 dark:text-amber-400",
      };
    default:
      return { label: "On track for promotion", className: "text-blue-600 dark:text-blue-400" };
  }
}

export function PaperTradingSection({ indicators, isLoading }: PaperTradingSectionProps) {
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
        <div className="p-4 border-b border-cream-200 dark:border-night-700">
          <div className="h-6 w-32 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
        </div>
        <div className="p-4">
          <div className="h-24 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (!indicators || indicators.length === 0) {
    return (
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
        <div className="p-4 border-b border-cream-200 dark:border-night-700">
          <h3 className="text-lg font-medium text-stone-900 dark:text-night-50">Paper Trading</h3>
        </div>
        <div className="p-8 text-center text-stone-400 dark:text-night-400">
          No indicators in paper trading
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
      <div className="p-4 border-b border-cream-200 dark:border-night-700">
        <h3 className="text-lg font-medium text-stone-900 dark:text-night-50">Paper Trading</h3>
      </div>

      <div className="divide-y divide-cream-100 dark:divide-night-700">
        {indicators.map((indicator) => {
          const status = getPaperTradingStatus(indicator);
          const statusMessage = getStatusMessage(status);

          return (
            <div key={indicator.id} className="p-4">
              <div className="flex items-center justify-between mb-2">
                <Link
                  href={`/indicators/${indicator.id}`}
                  className="text-stone-900 dark:text-night-50 font-medium hover:text-blue-600 dark:hover:text-blue-400"
                >
                  {indicator.name}
                </Link>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-stone-500 dark:text-night-300">
                    Day {indicator.daysTrading}/30
                  </span>
                  <span className="text-stone-500 dark:text-night-300">
                    IC: {indicator.currentIC !== null ? indicator.currentIC.toFixed(3) : "—"}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <ProgressBar progress={indicator.progress} status={status} />
                <div className="flex items-center justify-between text-sm">
                  <span className={statusMessage.className}>{statusMessage.label}</span>
                  <span className="text-stone-400 dark:text-night-400">
                    {indicator.signalsRecorded} signals recorded
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
