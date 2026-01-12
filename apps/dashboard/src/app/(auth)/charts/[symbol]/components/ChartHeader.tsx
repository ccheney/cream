"use client";

/**
 * ChartHeader Component
 *
 * Header section with navigation, symbol title, timeframe selector, and actions.
 */

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { StreamToggleButton } from "@/components/charts/StreamPanel";
import type { ChartHeaderProps } from "./types";
import { TIMEFRAME_OPTIONS } from "./types";

export function ChartHeader({
  symbol,
  companyName,
  timeframe,
  onTimeframeChange,
  isStreamOpen,
  onStreamToggle,
}: ChartHeaderProps) {
  return (
    <div className="shrink-0 px-4 py-3 border-b border-cream-200 dark:border-night-700 bg-white dark:bg-night-800">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/charts"
            className="p-1.5 -ml-1.5 rounded-md text-stone-500 hover:bg-cream-100 dark:hover:bg-night-700"
            aria-label="Back to charts"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-xl font-semibold text-stone-900 dark:text-night-50">
            {companyName || symbol}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-cream-100 dark:bg-night-700 rounded-lg p-1">
            {TIMEFRAME_OPTIONS.map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => onTimeframeChange(tf)}
                className={`px-3 py-1 text-sm font-mono rounded transition-colors ${
                  timeframe === tf
                    ? "bg-night-800 text-white dark:bg-cream-100 dark:text-night-900 shadow-md font-semibold"
                    : "text-stone-600 dark:text-night-200 dark:text-night-400 hover:text-stone-900 dark:hover:text-night-50"
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
          <Link
            href={`/options/${symbol}`}
            className="px-3 py-1.5 text-sm font-medium text-stone-600 dark:text-night-200 border border-cream-200 dark:border-night-700 rounded-md hover:bg-cream-100 dark:hover:bg-night-700 transition-colors"
          >
            Options →
          </Link>
          <StreamToggleButton isOpen={isStreamOpen} onClick={onStreamToggle} />
        </div>
      </div>
    </div>
  );
}
