"use client";

/**
 * ChartControls Component
 *
 * MA overlay toggle buttons for the chart.
 */

import { DEFAULT_MA_CONFIGS } from "@/lib/chart-indicators";
import type { ChartControlsProps } from "./types";
import { MA_OPTIONS } from "./types";

export function ChartControls({ enabledMAs, onToggleMA }: ChartControlsProps) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-xs text-cream-500 dark:text-cream-400 mr-1">Overlays:</span>
      {MA_OPTIONS.map((maId) => {
        const config = DEFAULT_MA_CONFIGS[maId];
        const isEnabled = enabledMAs.includes(maId);
        return (
          <button
            key={maId}
            type="button"
            onClick={() => onToggleMA(maId)}
            className={`
              px-2 py-0.5 text-xs font-mono rounded transition-all
              ${
                isEnabled
                  ? "text-white shadow-sm"
                  : "bg-cream-100 dark:bg-night-700 text-cream-500 dark:text-cream-400 hover:text-cream-700 dark:hover:text-cream-200"
              }
            `}
            style={isEnabled ? { backgroundColor: config?.color } : undefined}
          >
            {config?.label}
          </button>
        );
      })}
    </div>
  );
}
