/**
 * PriceTicker Component
 *
 * Displays live prices with flash backgrounds, delta display, and stale fadeout.
 *
 * @see docs/plans/ui/31-realtime-patterns.md lines 22-27
 */

"use client";

import { memo, useEffect } from "react";
import { usePriceFlash } from "./use-price-flash";
import { useStaleData } from "./use-stale-data";

// ============================================
// Types
// ============================================

export interface PriceTickerProps {
  /** Trading symbol */
  symbol: string;
  /** Current price */
  price: number;
  /** Previous price for delta calculation */
  previousPrice?: number;
  /** Price change (absolute) */
  delta?: number;
  /** Price change (percentage) */
  deltaPercent?: number;
  /** Last update timestamp */
  lastUpdatedAt?: Date;
  /** Show symbol label */
  showSymbol?: boolean;
  /** Custom CSS class */
  className?: string;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Test ID for testing */
  "data-testid"?: string;
}

// ============================================
// Utility Functions
// ============================================

/**
 * Format price with appropriate decimal places.
 */
function formatPrice(price: number): string {
  if (price >= 1000) {
    return price.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  if (price >= 1) {
    return price.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  // Small prices (< $1) show more decimals
  return price.toLocaleString("en-US", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

/**
 * Format delta value with sign and arrow.
 */
function formatDelta(delta: number, percent?: number): string {
  const sign = delta >= 0 ? "+" : "";
  const arrow = delta >= 0 ? "↑" : "↓";
  const formattedDelta = `${sign}${delta.toFixed(2)}`;

  if (percent !== undefined) {
    const signPercent = percent >= 0 ? "+" : "";
    return `${arrow} ${formattedDelta} (${signPercent}${percent.toFixed(2)}%)`;
  }

  return `${arrow} ${formattedDelta}`;
}

// ============================================
// Styles
// ============================================

const sizeStyles = {
  sm: {
    container: "text-sm",
    price: "text-sm font-medium",
    delta: "text-xs",
    symbol: "text-xs",
  },
  md: {
    container: "text-base",
    price: "text-lg font-semibold",
    delta: "text-sm",
    symbol: "text-sm",
  },
  lg: {
    container: "text-lg",
    price: "text-2xl font-bold",
    delta: "text-base",
    symbol: "text-base",
  },
};

// ============================================
// Component
// ============================================

/**
 * PriceTicker displays live prices with visual feedback.
 *
 * Features:
 * - Flash background on price changes (green up, red down)
 * - Delta display with arrows and color coding
 * - Stale data fadeout when updates stop
 * - Accessibility with ARIA live region
 *
 * @example
 * ```tsx
 * <PriceTicker
 *   symbol="AAPL"
 *   price={187.52}
 *   previousPrice={187.20}
 *   delta={0.32}
 *   deltaPercent={0.17}
 *   lastUpdatedAt={new Date()}
 * />
 * ```
 */
export const PriceTicker = memo(function PriceTicker({
  symbol,
  price,
  previousPrice,
  delta,
  deltaPercent,
  lastUpdatedAt,
  showSymbol = true,
  className = "",
  size = "md",
  "data-testid": testId,
}: PriceTickerProps) {
  const { flash } = usePriceFlash(price, previousPrice);
  const { stale, markUpdated } = useStaleData(lastUpdatedAt);

  // Mark updated when price changes
  useEffect(() => {
    if (price !== previousPrice) {
      markUpdated();
    }
  }, [price, previousPrice, markUpdated]);

  const styles = sizeStyles[size];

  // Calculate delta if not provided
  const displayDelta = delta ?? (previousPrice !== undefined ? price - previousPrice : undefined);
  const displayDeltaPercent =
    deltaPercent ??
    (previousPrice !== undefined && previousPrice !== 0
      ? ((price - previousPrice) / previousPrice) * 100
      : undefined);

  // Determine if positive or negative
  const isPositive = displayDelta !== undefined ? displayDelta >= 0 : true;

  // Flash background classes
  const flashClasses = flash.isFlashing
    ? flash.direction === "up"
      ? "animate-flash-profit"
      : "animate-flash-loss"
    : "";

  // Stale indicator
  const StaleIndicator = () => (
    <span
      className="ml-1 text-gray-400"
      title={`Last updated ${stale.secondsSinceUpdate}s ago`}
      aria-label={`Data is ${stale.secondsSinceUpdate} seconds old`}
    >
      <svg
        className="inline-block w-3 h-3"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    </span>
  );

  return (
    <div
      className={`inline-flex flex-col ${styles.container} ${className}`}
      style={{
        opacity: stale.opacity,
        transition: "opacity 300ms ease-in-out",
      }}
      data-testid={testId}
    >
      {/* Symbol */}
      {showSymbol && (
        <span className={`${styles.symbol} text-gray-500 dark:text-gray-400`}>{symbol}</span>
      )}

      {/* Price with flash */}
      <div
        className={`${styles.price} ${flashClasses} rounded px-1 -mx-1`}
        style={{
          // CSS custom properties for flash animation
          ["--flash-color" as string]: isPositive
            ? "rgba(34, 197, 94, 0.3)"
            : "rgba(239, 68, 68, 0.3)",
        }}
        aria-live="polite"
        aria-atomic="true"
      >
        <span className="font-mono">${formatPrice(price)}</span>
        {stale.showIndicator && <StaleIndicator />}
      </div>

      {/* Delta */}
      {displayDelta !== undefined && (
        <span
          className={`${styles.delta} ${
            isPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
          }`}
          aria-label={`Change: ${isPositive ? "up" : "down"} ${Math.abs(displayDelta).toFixed(2)}`}
        >
          {formatDelta(displayDelta, displayDeltaPercent)}
        </span>
      )}
    </div>
  );
});

// ============================================
// CSS Keyframes (add to global CSS or Tailwind config)
// ============================================

/**
 * Add these keyframes to your global CSS or tailwind.config.js:
 *
 * ```css
 * @keyframes flash-profit {
 *   0% { background-color: transparent; }
 *   27% { background-color: rgba(34, 197, 94, 0.3); }
 *   73% { background-color: rgba(34, 197, 94, 0.3); }
 *   100% { background-color: transparent; }
 * }
 *
 * @keyframes flash-loss {
 *   0% { background-color: transparent; }
 *   27% { background-color: rgba(239, 68, 68, 0.3); }
 *   73% { background-color: rgba(239, 68, 68, 0.3); }
 *   100% { background-color: transparent; }
 * }
 *
 * .animate-flash-profit {
 *   animation: flash-profit 1.1s ease-out;
 * }
 *
 * .animate-flash-loss {
 *   animation: flash-loss 1.1s ease-out;
 * }
 * ```
 */

// ============================================
// Exports
// ============================================

export default PriceTicker;
