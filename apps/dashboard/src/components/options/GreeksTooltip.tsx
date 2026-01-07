/**
 * GreeksTooltip Component
 *
 * Tooltip displaying option greeks (delta, gamma, theta, vega).
 * Shows on hover over option contract cells.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 2.1
 */

"use client";

import { memo } from "react";
import type { OptionsGreeks } from "@/lib/api/types";

// ============================================
// Types
// ============================================

export interface GreeksTooltipProps {
  /** Greeks values */
  greeks: OptionsGreeks;
  /** Whether tooltip is visible */
  visible: boolean;
  /** Position for tooltip */
  position?: { x: number; y: number };
  /** Custom CSS class */
  className?: string;
}

// ============================================
// Helper Functions
// ============================================

function formatGreek(value: number | null, decimals = 4): string {
  if (value === null) {
    return "—";
  }
  return value.toFixed(decimals);
}

function getGreekColor(greek: string, value: number | null): string {
  if (value === null) {
    return "text-cream-400";
  }

  switch (greek) {
    case "delta":
      return value >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400";
    case "theta":
      // Theta is typically negative (time decay)
      return value < 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400";
    case "gamma":
    case "vega":
      return "text-blue-600 dark:text-blue-400";
    default:
      return "text-cream-700 dark:text-cream-300";
  }
}

// ============================================
// Component
// ============================================

/**
 * GreeksTooltip displays option greeks in a hover tooltip.
 *
 * Features:
 * - Shows δ (delta), γ (gamma), θ (theta), ν (vega)
 * - Color-coded values based on sign and type
 * - Greek symbols with full names
 * - Positioned near the hovered element
 *
 * @example
 * ```tsx
 * <GreeksTooltip
 *   greeks={{ delta: 0.65, gamma: 0.02, theta: -0.05, vega: 0.15 }}
 *   visible={isHovered}
 *   position={{ x: mouseX, y: mouseY }}
 * />
 * ```
 */
export const GreeksTooltip = memo(function GreeksTooltip({
  greeks,
  visible,
  position,
  className = "",
}: GreeksTooltipProps) {
  if (!visible) {
    return null;
  }

  const style = position
    ? {
        position: "fixed" as const,
        left: position.x + 10,
        top: position.y + 10,
        zIndex: 50,
      }
    : {};

  return (
    <div
      className={`
        bg-white dark:bg-night-800 border border-cream-200 dark:border-night-600
        rounded-lg shadow-lg p-3 min-w-[160px]
        ${className}
      `}
      style={style}
      role="tooltip"
    >
      <div className="text-xs font-semibold text-cream-500 dark:text-cream-400 mb-2">Greeks</div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {/* Delta */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-cream-500 dark:text-cream-400">δ Delta</span>
          <span className={`text-xs font-mono ${getGreekColor("delta", greeks.delta)}`}>
            {formatGreek(greeks.delta, 3)}
          </span>
        </div>

        {/* Gamma */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-cream-500 dark:text-cream-400">γ Gamma</span>
          <span className={`text-xs font-mono ${getGreekColor("gamma", greeks.gamma)}`}>
            {formatGreek(greeks.gamma, 4)}
          </span>
        </div>

        {/* Theta */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-cream-500 dark:text-cream-400">θ Theta</span>
          <span className={`text-xs font-mono ${getGreekColor("theta", greeks.theta)}`}>
            {formatGreek(greeks.theta, 4)}
          </span>
        </div>

        {/* Vega */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-cream-500 dark:text-cream-400">ν Vega</span>
          <span className={`text-xs font-mono ${getGreekColor("vega", greeks.vega)}`}>
            {formatGreek(greeks.vega, 4)}
          </span>
        </div>
      </div>
    </div>
  );
});

// ============================================
// Inline Greeks Display
// ============================================

export interface InlineGreeksProps {
  greeks: OptionsGreeks;
  className?: string;
}

/**
 * Compact inline display of greeks for table cells.
 */
export const InlineGreeks = memo(function InlineGreeks({
  greeks,
  className = "",
}: InlineGreeksProps) {
  return (
    <div className={`flex items-center gap-2 text-[10px] font-mono ${className}`}>
      <span className={getGreekColor("delta", greeks.delta)}>δ{formatGreek(greeks.delta, 2)}</span>
      <span className={getGreekColor("theta", greeks.theta)}>θ{formatGreek(greeks.theta, 2)}</span>
    </div>
  );
});

export default GreeksTooltip;
