"use client";

/**
 * IndicatorCard Component
 *
 * Displays a single technical indicator with loading state and status coloring.
 */

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.js";
import type { IndicatorCardProps, IndicatorStatus } from "./types.js";

const STATUS_COLORS: Record<IndicatorStatus, string> = {
  overbought: "text-red-500",
  oversold: "text-green-500",
  bullish: "text-green-500",
  bearish: "text-red-500",
  neutral: "text-cream-900 dark:text-cream-100",
};

export function IndicatorCard({ name, value, status, tooltip, isLoading }: IndicatorCardProps) {
  if (isLoading) {
    return (
      <div className="p-3 rounded-md bg-cream-50 dark:bg-night-700/50">
        <div className="h-4 w-16 bg-cream-100 dark:bg-night-600 rounded animate-pulse mb-2" />
        <div className="h-6 w-12 bg-cream-100 dark:bg-night-600 rounded animate-pulse" />
      </div>
    );
  }

  const nameElement = <span className="text-sm text-cream-500 dark:text-cream-400">{name}</span>;

  return (
    <div className="p-3 rounded-md bg-cream-50 dark:bg-night-700/50">
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger className="cursor-help">{nameElement}</TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      ) : (
        <div>{nameElement}</div>
      )}
      <div className={`mt-1 text-xl font-mono font-medium ${STATUS_COLORS[status ?? "neutral"]}`}>
        {value}
      </div>
    </div>
  );
}
