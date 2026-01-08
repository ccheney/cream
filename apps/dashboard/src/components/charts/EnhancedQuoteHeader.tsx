/**
 * Enhanced Quote Header Component
 *
 * Displays rich quote information with animated price, depth visualization,
 * day range indicator, and volume comparison.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 1.3
 */

"use client";

import { motion } from "framer-motion";
import { memo, useMemo } from "react";
import { PriceTicker } from "../ui/price-ticker";

// ============================================
// Types
// ============================================

export interface Quote {
  bid: number | null;
  ask: number | null;
  bidSize?: number;
  askSize?: number;
  last: number | null;
  previousClose?: number;
  volume: number;
  high?: number;
  low?: number;
  avgVolume?: number;
}

export interface EnhancedQuoteHeaderProps {
  /** Trading symbol */
  symbol: string;
  /** Quote data */
  quote: Quote;
  /** Current market regime */
  regime?: string;
  /** Show depth visualization */
  showDepth?: boolean;
  /** Custom CSS class */
  className?: string;
  /** Test ID for testing */
  "data-testid"?: string;
}

// ============================================
// Utility Functions
// ============================================

/**
 * Format volume with K/M/B suffix
 */
function formatVolume(volume: number): string {
  if (volume >= 1_000_000_000) {
    return `${(volume / 1_000_000_000).toFixed(1)}B`;
  }
  if (volume >= 1_000_000) {
    return `${(volume / 1_000_000).toFixed(1)}M`;
  }
  if (volume >= 1_000) {
    return `${(volume / 1_000).toFixed(1)}K`;
  }
  return volume.toLocaleString();
}

/**
 * Format price with proper decimals
 */
function formatPrice(price: number | null | undefined): string {
  if (price == null) {
    return "--";
  }
  return `$${price.toFixed(2)}`;
}

/**
 * Calculate price change
 */
function calculateChange(
  current: number | null,
  previous: number | undefined
): { absolute: number; percent: number } | null {
  if (current == null || previous == null || previous === 0) {
    return null;
  }
  const absolute = current - previous;
  const percent = (absolute / previous) * 100;
  return { absolute, percent };
}

// ============================================
// Sub-components
// ============================================

interface DepthBarProps {
  size: number;
  maxSize: number;
  side: "bid" | "ask";
  price: number;
}

const DepthBar = memo(function DepthBar({ size, maxSize, side, price }: DepthBarProps) {
  const percentage = maxSize > 0 ? (size / maxSize) * 100 : 0;
  const isBid = side === "bid";

  return (
    <div className={`flex items-center gap-2 ${isBid ? "flex-row-reverse" : "flex-row"}`}>
      {/* Price and Size */}
      <div className={`text-sm font-mono ${isBid ? "text-right" : "text-left"} min-w-[120px]`}>
        <span className="text-cream-900 dark:text-cream-100">{formatPrice(price)}</span>
        <span className="text-cream-500 dark:text-cream-400 ml-1">× {size.toLocaleString()}</span>
      </div>

      {/* Bar */}
      <div
        className={`flex-1 h-5 bg-cream-100 dark:bg-night-700 rounded overflow-hidden ${isBid ? "flex justify-end" : ""}`}
      >
        <motion.div
          className={`h-full ${isBid ? "bg-green-500/40 dark:bg-green-400/30" : "bg-red-500/40 dark:bg-red-400/30"}`}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        />
      </div>
    </div>
  );
});

interface DayRangeProps {
  current: number;
  low: number;
  high: number;
}

const DayRange = memo(function DayRange({ current, low, high }: DayRangeProps) {
  const range = high - low;
  const position = range > 0 ? ((current - low) / range) * 100 : 50;

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-cream-500 dark:text-cream-400 font-mono">
        {formatPrice(low)}
      </span>

      <div className="flex-1 relative h-2 bg-cream-200 dark:bg-night-600 rounded-full">
        {/* Track */}
        <div className="absolute inset-0 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-red-400 via-cream-300 to-green-400 dark:from-red-500/50 dark:via-night-500 dark:to-green-500/50"
            style={{ width: "100%" }}
          />
        </div>

        {/* Current price marker */}
        <motion.div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-stone-700 dark:bg-night-200 rounded-full border-2 border-white dark:border-night-800 shadow-md"
          initial={{ left: "50%" }}
          animate={{ left: `${Math.min(Math.max(position, 5), 95)}%` }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          style={{ transform: "translate(-50%, -50%)" }}
        />
      </div>

      <span className="text-xs text-cream-500 dark:text-cream-400 font-mono">
        {formatPrice(high)}
      </span>
    </div>
  );
});

// ============================================
// Main Component
// ============================================

/**
 * EnhancedQuoteHeader displays comprehensive quote information
 * with animated transitions and visual depth indicators.
 *
 * @example
 * ```tsx
 * <EnhancedQuoteHeader
 *   symbol="AAPL"
 *   quote={{
 *     bid: 187.50,
 *     ask: 187.52,
 *     bidSize: 500,
 *     askSize: 800,
 *     last: 187.52,
 *     previousClose: 185.20,
 *     volume: 45200000,
 *     high: 188.50,
 *     low: 184.20,
 *     avgVolume: 52100000,
 *   }}
 *   regime="BULL_TREND"
 * />
 * ```
 */
export const EnhancedQuoteHeader = memo(function EnhancedQuoteHeader({
  symbol,
  quote,
  regime,
  showDepth = true,
  className = "",
  "data-testid": testId,
}: EnhancedQuoteHeaderProps) {
  // Calculate price change
  const change = useMemo(
    () => calculateChange(quote.last, quote.previousClose),
    [quote.last, quote.previousClose]
  );

  // Calculate max size for depth bars
  const maxSize = useMemo(() => {
    const bidSize = quote.bidSize ?? 0;
    const askSize = quote.askSize ?? 0;
    return Math.max(bidSize, askSize, 1);
  }, [quote.bidSize, quote.askSize]);

  // Volume percentage of average
  const volumePercent = useMemo(() => {
    if (!quote.avgVolume || quote.avgVolume === 0) {
      return null;
    }
    return (quote.volume / quote.avgVolume) * 100;
  }, [quote.volume, quote.avgVolume]);

  // Regime badge color
  const regimeColor = useMemo(() => {
    if (!regime) {
      return "bg-cream-100 text-cream-800 dark:bg-night-700 dark:text-cream-400";
    }
    if (regime.includes("BULL")) {
      return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    }
    if (regime.includes("BEAR")) {
      return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
    }
    if (regime.includes("HIGH_VOL")) {
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
    }
    return "bg-cream-100 text-cream-800 dark:bg-night-700 dark:text-cream-400";
  }, [regime]);

  return (
    <div
      className={`bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4 ${className}`}
      data-testid={testId}
    >
      {/* Header Row: Symbol, Price, Change, Regime */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-baseline gap-4">
          {/* Symbol */}
          <span className="text-2xl font-bold text-cream-900 dark:text-cream-100">{symbol}</span>

          {/* Price with Animation */}
          {quote.last != null && (
            <PriceTicker
              symbol=""
              price={quote.last}
              previousPrice={quote.previousClose}
              showSymbol={false}
              showChange={false}
              size="lg"
              className="inline-flex"
            />
          )}

          {/* Change */}
          {change && (
            <span
              className={`text-lg font-medium ${
                change.absolute >= 0
                  ? "text-green-600 dark:text-green-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {change.absolute >= 0 ? "↑" : "↓"} {change.absolute >= 0 ? "+" : ""}$
              {Math.abs(change.absolute).toFixed(2)} ({change.absolute >= 0 ? "+" : ""}
              {change.percent.toFixed(2)}%)
            </span>
          )}
        </div>

        {/* Regime Badge */}
        {regime && (
          <span className={`px-2 py-1 text-xs font-medium rounded ${regimeColor}`}>
            {regime.replace(/_/g, " ")}
          </span>
        )}
      </div>

      {/* Depth Visualization */}
      {showDepth && quote.bid != null && quote.ask != null && (
        <div className="mb-4 p-3 bg-cream-50 dark:bg-night-700/50 rounded-lg">
          <div className="text-xs font-medium text-cream-500 dark:text-cream-400 mb-2 text-center">
            QUOTE DEPTH
          </div>
          <div className="grid grid-cols-2 gap-4">
            {/* Bid Side */}
            <div>
              <div className="text-xs text-green-600 dark:text-green-400 font-medium mb-1">Bid</div>
              <DepthBar price={quote.bid} size={quote.bidSize ?? 0} maxSize={maxSize} side="bid" />
            </div>

            {/* Ask Side */}
            <div>
              <div className="text-xs text-red-600 dark:text-red-400 font-medium mb-1">Ask</div>
              <DepthBar price={quote.ask} size={quote.askSize ?? 0} maxSize={maxSize} side="ask" />
            </div>
          </div>
        </div>
      )}

      {/* Day Range and Volume */}
      <div className="flex items-center gap-6">
        {/* Day Range */}
        {quote.high != null && quote.low != null && quote.last != null && (
          <div className="flex-1">
            <div className="text-xs text-cream-500 dark:text-cream-400 mb-1">Day Range</div>
            <DayRange current={quote.last} low={quote.low} high={quote.high} />
          </div>
        )}

        {/* Volume */}
        <div className="text-right">
          <div className="text-xs text-cream-500 dark:text-cream-400">Volume</div>
          <div className="font-mono text-cream-900 dark:text-cream-100">
            {formatVolume(quote.volume)}
            {quote.avgVolume && (
              <span className="text-cream-500 dark:text-cream-400 text-sm ml-1">
                (avg: {formatVolume(quote.avgVolume)})
              </span>
            )}
          </div>
          {volumePercent !== null && (
            <div
              className={`text-xs ${
                volumePercent >= 100
                  ? "text-green-600 dark:text-green-400"
                  : "text-cream-500 dark:text-cream-400"
              }`}
            >
              {volumePercent.toFixed(0)}% of avg
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

// ============================================
// Exports
// ============================================

export default EnhancedQuoteHeader;
