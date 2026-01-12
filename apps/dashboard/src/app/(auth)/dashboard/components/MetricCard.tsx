import type React from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { MetricCardProps } from "../types";

const METRIC_DESCRIPTIONS: Record<string, string> = {
  NAV: "Net Asset Value - Total portfolio value including cash and positions",
  "Day P&L": "Today's profit and loss, both absolute and percentage",
  "Open Positions": "Number of currently active trades in the portfolio",
};

export function MetricCard({
  label,
  value,
  subValue,
  valueColor,
  isLoading,
  tooltip,
}: MetricCardProps): React.JSX.Element {
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
      <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
      <div className="text-sm text-stone-500 dark:text-night-300">{label}</div>
      <div className="flex items-baseline gap-2">
        <div
          className={`mt-1 text-2xl font-semibold ${
            valueColor ?? "text-stone-900 dark:text-night-50"
          }`}
        >
          {value}
        </div>
        {subValue && (
          <span className={`text-sm ${valueColor ?? "text-stone-500 dark:text-night-300"}`}>
            {subValue}
          </span>
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
