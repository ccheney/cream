/**
 * DeltaGauge Component
 *
 * Horizontal bar visualization for portfolio delta exposure.
 * Centered at zero with positive/negative fills.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 4.3
 */

"use client";

import { memo, useMemo } from "react";
import { AnimatedNumber } from "@/components/ui/animated-number";

// ============================================
// Types
// ============================================

export interface DeltaGaugeProps {
  /** Current delta notional value */
  deltaNotional: number;
  /** SPY share equivalent */
  deltaSPYEquivalent: number;
  /** Maximum absolute value for scale (default: 500000) */
  maxValue?: number;
  /** Warning threshold as percentage of max (default: 0.8) */
  warningThreshold?: number;
  /** Critical threshold as percentage of max (default: 0.95) */
  criticalThreshold?: number;
  /** Show limit markers */
  showLimits?: boolean;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Additional class names */
  className?: string;
}

// ============================================
// Constants
// ============================================

const DEFAULT_MAX_VALUE = 500000;
const DEFAULT_WARNING = 0.8;
const DEFAULT_CRITICAL = 0.95;

// ============================================
// Component
// ============================================

/**
 * DeltaGauge displays a horizontal bar centered at zero.
 *
 * Features:
 * - Positive delta fills to the right (green)
 * - Negative delta fills to the left (red)
 * - Warning/critical color states
 * - SPY share equivalent display
 * - Animated value updates
 *
 * @example
 * ```tsx
 * <DeltaGauge
 *   deltaNotional={245000}
 *   deltaSPYEquivalent={1225}
 *   maxValue={500000}
 *   showLimits
 * />
 * ```
 */
export const DeltaGauge = memo(function DeltaGauge({
  deltaNotional,
  deltaSPYEquivalent,
  maxValue = DEFAULT_MAX_VALUE,
  warningThreshold = DEFAULT_WARNING,
  criticalThreshold = DEFAULT_CRITICAL,
  showLimits = false,
  size = "md",
  className = "",
}: DeltaGaugeProps) {
  // Calculate fill percentage (0-100 from center)
  const { fillPct, direction, status } = useMemo(() => {
    const absValue = Math.abs(deltaNotional);
    const pct = Math.min((absValue / maxValue) * 100, 100);
    const dir = deltaNotional >= 0 ? "positive" : "negative";

    const thresholdPct = absValue / maxValue;
    let state: "normal" | "warning" | "critical" = "normal";
    if (thresholdPct >= criticalThreshold) {
      state = "critical";
    } else if (thresholdPct >= warningThreshold) {
      state = "warning";
    }

    return { fillPct: pct, direction: dir, status: state };
  }, [deltaNotional, maxValue, warningThreshold, criticalThreshold]);

  // Size classes
  const sizeClasses = {
    sm: { height: "h-3", text: "text-xs", label: "text-[10px]" },
    md: { height: "h-4", text: "text-sm", label: "text-xs" },
    lg: { height: "h-6", text: "text-base", label: "text-sm" },
  };

  const sizes = sizeClasses[size];

  // Color based on direction and status
  const fillColor = useMemo(() => {
    if (status === "critical") {
      return direction === "positive" ? "bg-red-500" : "bg-red-500";
    }
    if (status === "warning") {
      return direction === "positive" ? "bg-amber-500" : "bg-amber-500";
    }
    return direction === "positive"
      ? "bg-green-500 dark:bg-green-400"
      : "bg-red-500 dark:bg-red-400";
  }, [direction, status]);

  // Format SPY equivalent
  const formatSPY = (value: number) => {
    const sign = value >= 0 ? "+" : "";
    return `≈ ${sign}${Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: 0 })} SPY shares`;
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <span
          className={`${sizes.label} font-medium text-cream-600 dark:text-cream-400 uppercase tracking-wide`}
        >
          Delta Exposure
        </span>
        <div className="flex items-center gap-3">
          {/* Net delta value */}
          <span
            className={`${sizes.text} font-mono font-semibold ${
              direction === "positive"
                ? "text-green-600 dark:text-green-400"
                : "text-red-600 dark:text-red-400"
            }`}
          >
            <AnimatedNumber
              value={deltaNotional}
              format="currency"
              decimals={0}
              className="inline"
            />
          </span>
        </div>
      </div>

      {/* Gauge bar */}
      <div className="relative">
        {/* Background track */}
        <div
          className={`w-full ${sizes.height} bg-cream-100 dark:bg-night-700 rounded-full overflow-hidden`}
        >
          {/* Fill - positioned from center */}
          <div className="relative w-full h-full">
            {/* Center line */}
            <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-cream-300 dark:bg-night-500 z-10" />

            {/* Positive fill (right side) */}
            {direction === "positive" && (
              <div
                className={`absolute left-1/2 top-0 bottom-0 ${fillColor} transition-all duration-300 ease-out`}
                style={{ width: `${fillPct / 2}%` }}
              />
            )}

            {/* Negative fill (left side) */}
            {direction === "negative" && (
              <div
                className={`absolute right-1/2 top-0 bottom-0 ${fillColor} transition-all duration-300 ease-out`}
                style={{ width: `${fillPct / 2}%` }}
              />
            )}
          </div>
        </div>

        {/* Limit markers */}
        {showLimits && (
          <>
            {/* Warning markers */}
            <div
              className="absolute top-0 bottom-0 w-px bg-amber-400 dark:bg-amber-500"
              style={{ left: `${50 + (warningThreshold * 100) / 2}%` }}
            />
            <div
              className="absolute top-0 bottom-0 w-px bg-amber-400 dark:bg-amber-500"
              style={{ left: `${50 - (warningThreshold * 100) / 2}%` }}
            />

            {/* Critical markers */}
            <div
              className="absolute top-0 bottom-0 w-px bg-red-500"
              style={{ left: `${50 + (criticalThreshold * 100) / 2}%` }}
            />
            <div
              className="absolute top-0 bottom-0 w-px bg-red-500"
              style={{ left: `${50 - (criticalThreshold * 100) / 2}%` }}
            />
          </>
        )}
      </div>

      {/* Scale labels */}
      <div className="flex items-center justify-between">
        <span className={`${sizes.label} text-cream-400 dark:text-cream-500 font-mono`}>
          -${(maxValue / 1000).toFixed(0)}K
        </span>
        <span className={`${sizes.label} text-cream-400 dark:text-cream-500 font-mono`}>0</span>
        <span className={`${sizes.label} text-cream-400 dark:text-cream-500 font-mono`}>
          +${(maxValue / 1000).toFixed(0)}K
        </span>
      </div>

      {/* SPY equivalent */}
      <div className="text-center">
        <span className={`${sizes.label} text-cream-500 dark:text-cream-400`}>
          {formatSPY(deltaSPYEquivalent)}
        </span>
      </div>
    </div>
  );
});

export default DeltaGauge;
