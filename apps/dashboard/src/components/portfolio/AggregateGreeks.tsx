/**
 * AggregateGreeks Component
 *
 * Portfolio-level options greeks summary display.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 2.2
 */

"use client";

import { memo } from "react";
import { AnimatedNumber } from "@/components/ui/animated-number";
import type { AggregateGreeks as AggregateGreeksType } from "@/hooks/usePositionGreeks";

// ============================================
// Types
// ============================================

export interface AggregateGreeksProps {
  /** Aggregated greeks data */
  greeks: AggregateGreeksType;
  /** Whether streaming is active */
  isStreaming?: boolean;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Additional class names */
  className?: string;
}

// ============================================
// Component
// ============================================

/**
 * AggregateGreeks displays portfolio-level options exposure.
 *
 * Shows:
 * - Delta notional: Dollar exposure per $1 underlying move
 * - Total Gamma: Shares equivalent per $1 move
 * - Total Theta: Daily time decay
 * - Total Vega: Exposure per 1% IV change
 */
export const AggregateGreeks = memo(function AggregateGreeks({
  greeks,
  isStreaming = false,
  size = "md",
  className = "",
}: AggregateGreeksProps) {
  const textSizes = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
  };

  const labelSizes = {
    sm: "text-[10px]",
    md: "text-xs",
    lg: "text-sm",
  };

  const textSize = textSizes[size];
  const labelSize = labelSizes[size];

  // Format helpers
  const _formatDelta = (value: number) => {
    const sign = value >= 0 ? "+" : "";
    return `${sign}$${Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  };

  const formatGamma = (value: number) => {
    const sign = value >= 0 ? "+" : "";
    return `${sign}${value.toFixed(0)}`;
  };

  const formatTheta = (value: number) => {
    return `$${value.toFixed(0)}/day`;
  };

  const formatVega = (value: number) => {
    const sign = value >= 0 ? "+" : "";
    return `${sign}$${Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  };

  // Determine colors
  const deltaColor = greeks.deltaNotional >= 0 ? "text-green-600" : "text-red-600";
  const thetaColor = greeks.totalTheta <= 0 ? "text-red-500" : "text-green-500";

  return (
    <div
      className={`flex items-center gap-6 px-4 py-2 bg-cream-50 dark:bg-night-750 rounded-lg ${className}`}
      role="group"
      aria-label="Portfolio Greeks"
    >
      {/* Streaming indicator */}
      {isStreaming && (
        <div className="flex items-center gap-1">
          <span
            className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"
            role="status"
            aria-label="Live streaming"
          />
          <span className={`${labelSize} text-cream-500 dark:text-cream-400`}>Live</span>
        </div>
      )}

      {/* Delta */}
      <div className="flex items-center gap-1.5">
        <span className={`${labelSize} text-cream-500 dark:text-cream-400 font-medium`}>Δ</span>
        <span className={`${textSize} font-mono ${deltaColor}`}>
          <AnimatedNumber
            value={greeks.deltaNotional}
            format="currency"
            decimals={0}
            className="inline"
            animationThreshold={100}
          />
        </span>
      </div>

      {/* Gamma */}
      <div className="flex items-center gap-1.5">
        <span className={`${labelSize} text-cream-500 dark:text-cream-400 font-medium`}>Γ</span>
        <span className={`${textSize} font-mono text-cream-700 dark:text-cream-300`}>
          {formatGamma(greeks.totalGamma)}
        </span>
      </div>

      {/* Theta */}
      <div className="flex items-center gap-1.5">
        <span className={`${labelSize} text-cream-500 dark:text-cream-400 font-medium`}>Θ</span>
        <span className={`${textSize} font-mono ${thetaColor}`}>
          {formatTheta(greeks.totalTheta)}
        </span>
      </div>

      {/* Vega */}
      <div className="flex items-center gap-1.5">
        <span className={`${labelSize} text-cream-500 dark:text-cream-400 font-medium`}>V</span>
        <span className={`${textSize} font-mono text-cream-700 dark:text-cream-300`}>
          {formatVega(greeks.totalVega)}
        </span>
      </div>
    </div>
  );
});

export default AggregateGreeks;
