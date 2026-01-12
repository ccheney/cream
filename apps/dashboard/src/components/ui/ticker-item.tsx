/**
 * TickerItem Component
 *
 * Individual ticker item displaying a symbol with real-time price updates.
 * Used within the TickerStrip component.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 1.1
 */

"use client";

import { X } from "lucide-react";
import { memo, useEffect } from "react";
import { AnimatedNumber } from "./animated-number";
import { Sparkline } from "./sparkline";
import type { TickDirection } from "./tick-dots";
import { TickDots } from "./tick-dots";
import { usePriceFlash } from "./use-price-flash";
import { useStaleData } from "./use-stale-data";

// ============================================
// Types
// ============================================

export interface Quote {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  volume?: number;
  prevClose?: number;
  changePercent?: number;
  timestamp?: Date;
}

export interface TickerItemProps {
  /** Trading symbol */
  symbol: string;
  /** Quote data */
  quote?: Quote;
  /** Previous price for delta calculation */
  previousPrice?: number;
  /** Tick direction history */
  tickHistory?: TickDirection[];
  /** Price history for sparkline */
  priceHistory?: number[];
  /** Show sparkline */
  showSparkline?: boolean;
  /** Show tick history dots */
  showTickHistory?: boolean;
  /** Is data stale */
  isStale?: boolean;
  /** Click handler */
  onClick?: (symbol: string) => void;
  /** Remove handler */
  onRemove?: (symbol: string) => void;
  /** Show remove button */
  showRemove?: boolean;
  /** Test ID */
  "data-testid"?: string;
}

// ============================================
// Component
// ============================================

/**
 * TickerItem displays a single symbol in the ticker strip.
 *
 * Features:
 * - Real-time price with flash animation
 * - Change percentage with direction arrow
 * - Bid × Ask spread
 * - Tick direction history dots
 * - Optional sparkline
 * - Click to navigate, X to remove
 */
export const TickerItem = memo(function TickerItem({
  symbol,
  quote,
  previousPrice,
  tickHistory = [],
  priceHistory = [],
  showSparkline = false,
  showTickHistory = true,
  isStale: isStaleOverride,
  onClick,
  onRemove,
  showRemove = true,
  "data-testid": testId,
}: TickerItemProps) {
  const price = quote?.last ?? 0;
  const changePercent = quote?.changePercent ?? 0;
  const { flash } = usePriceFlash(price, previousPrice);
  const { stale, markUpdated } = useStaleData(quote?.timestamp);

  // Mark updated when quote changes
  useEffect(() => {
    if (quote?.timestamp) {
      markUpdated();
    }
  }, [quote?.timestamp, markUpdated]);

  const isUp = changePercent >= 0;
  const effectiveStale = isStaleOverride ?? stale.showIndicator;

  // Flash classes
  const flashClasses = flash.isFlashing
    ? flash.direction === "up"
      ? "animate-flash-profit"
      : "animate-flash-loss"
    : "";

  const handleClick = () => {
    onClick?.(symbol);
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove?.(symbol);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick?.(symbol);
    }
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: Custom ticker item with complex nested content and remove button requires div structure
    <div
      className={`
        group relative flex flex-col gap-0.5 px-3 py-2
        border-r border-cream-200 dark:border-night-700
        cursor-pointer hover:bg-cream-50 dark:hover:bg-night-800
        transition-colors duration-150
        ${flashClasses}
      `}
      style={{
        opacity: effectiveStale ? 0.6 : 1,
        transition: "opacity 300ms ease-in-out",
      }}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`${symbol} at $${price.toFixed(2)}, ${isUp ? "up" : "down"} ${Math.abs(changePercent).toFixed(2)}%`}
      data-testid={testId}
    >
      {/* Remove button */}
      {showRemove && (
        <button
          type="button"
          onClick={handleRemove}
          className="
            absolute -top-1 -right-1 p-0.5
            bg-stone-500 dark:bg-night-400 rounded-full
            opacity-0 group-hover:opacity-100
            hover:bg-stone-600 dark:hover:bg-night-300
            transition-opacity duration-150
          "
          aria-label={`Remove ${symbol}`}
        >
          <X className="w-3 h-3 text-white dark:text-night-900" />
        </button>
      )}

      {/* Row 1: Symbol + Price + Change */}
      <div className="flex items-center gap-2 whitespace-nowrap">
        <span className="text-xs font-semibold text-stone-700 dark:text-night-100 dark:text-night-200">
          {symbol}
        </span>
        <AnimatedNumber
          value={price}
          format="currency"
          decimals={2}
          className="text-sm font-bold font-mono text-stone-900 dark:text-night-50"
          animationThreshold={0.001}
        />
        <span
          className={`text-xs font-medium ${
            isUp ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
          }`}
        >
          {isUp ? "↑" : "↓"}
          {isUp ? "+" : ""}
          {changePercent.toFixed(2)}%
        </span>
      </div>

      {/* Row 2: Bid × Ask */}
      {quote?.bid !== undefined && quote?.ask !== undefined && (
        <div className="text-xs text-stone-500 dark:text-night-300 font-mono whitespace-nowrap">
          {quote.bid.toFixed(2)} × {quote.ask.toFixed(2)}
        </div>
      )}

      {/* Row 3: Tick dots and/or Sparkline */}
      <div className="flex items-center gap-2 h-4">
        {showTickHistory && tickHistory.length > 0 && (
          <TickDots ticks={tickHistory} maxDots={8} dotSize={5} />
        )}
        {showSparkline && priceHistory.length >= 2 && (
          <Sparkline data={priceHistory} width={40} height={14} strokeWidth={1} />
        )}
      </div>
    </div>
  );
});

export default TickerItem;
