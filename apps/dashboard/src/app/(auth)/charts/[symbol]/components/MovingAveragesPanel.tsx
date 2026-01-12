"use client";

/**
 * MovingAveragesPanel Component
 *
 * Displays moving average values with color indicators and tooltips.
 */

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DEFAULT_MA_CONFIGS } from "@/lib/chart-indicators";
import { formatPrice } from "./hooks";
import type { MovingAveragesPanelProps } from "./types";

interface MADisplayItemProps {
  label: string;
  tooltipText: string;
  value: number | null | undefined;
  color?: string;
}

function MADisplayItem({ label, tooltipText, value, color }: MADisplayItemProps) {
  return (
    <div className="flex items-start gap-2">
      {color && (
        <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: color }} />
      )}
      <div>
        <Tooltip>
          <TooltipTrigger className="cursor-help text-stone-500 dark:text-night-300">
            {label}
          </TooltipTrigger>
          <TooltipContent>{tooltipText}</TooltipContent>
        </Tooltip>
        <div className="font-mono text-stone-900 dark:text-night-50">{formatPrice(value)}</div>
      </div>
    </div>
  );
}

export function MovingAveragesPanel({ indicators }: MovingAveragesPanelProps) {
  return (
    <div className="border-t border-cream-200 dark:border-night-700 pt-4">
      <h2 className="text-lg font-medium text-stone-900 dark:text-night-50 mb-4">
        Moving Averages
      </h2>
      <div className="grid grid-cols-6 gap-4 text-sm">
        <MADisplayItem
          label="SMA 20"
          tooltipText="Simple Moving Average: 20-period average, short-term trend"
          value={indicators.sma20}
          color={DEFAULT_MA_CONFIGS.sma20?.color}
        />
        <MADisplayItem
          label="SMA 50"
          tooltipText="Simple Moving Average: 50-period average, medium-term trend"
          value={indicators.sma50}
          color={DEFAULT_MA_CONFIGS.sma50?.color}
        />
        <MADisplayItem
          label="SMA 200"
          tooltipText="Simple Moving Average: 200-period average, long-term trend"
          value={indicators.sma200}
          color={DEFAULT_MA_CONFIGS.sma200?.color}
        />
        <MADisplayItem
          label="EMA 12"
          tooltipText="Exponential Moving Average: 12-period, fast signal line"
          value={indicators.ema12}
          color={DEFAULT_MA_CONFIGS.ema12?.color}
        />
        <MADisplayItem
          label="EMA 26"
          tooltipText="Exponential Moving Average: 26-period, slow signal line"
          value={indicators.ema26}
          color={DEFAULT_MA_CONFIGS.ema26?.color}
        />
        <div>
          <Tooltip>
            <TooltipTrigger className="cursor-help text-stone-500 dark:text-night-300">
              MACD
            </TooltipTrigger>
            <TooltipContent>MACD Line: difference between EMA 12 and EMA 26</TooltipContent>
          </Tooltip>
          <div className="font-mono text-stone-900 dark:text-night-50">
            {indicators.macdLine?.toFixed(2) ?? "--"}
          </div>
        </div>
      </div>
    </div>
  );
}
