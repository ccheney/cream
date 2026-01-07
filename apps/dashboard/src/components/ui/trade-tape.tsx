/**
 * TradeTape Component
 *
 * Real-time Time & Sales display with virtualized scrolling.
 * Inspired by Bloomberg Terminal trade tape.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 1.2
 */

"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { useAutoScroll } from "./use-auto-scroll";

// ============================================
// Types
// ============================================

export type TradeSide = "BUY" | "SELL" | "UNKNOWN";

export interface Trade {
  /** Unique trade identifier */
  id: string;
  /** Trading symbol */
  symbol: string;
  /** Trade price */
  price: number;
  /** Trade size (shares) */
  size: number;
  /** Trade side (buy/sell/unknown) */
  side: TradeSide;
  /** Exchange ID */
  exchange?: number;
  /** Trade conditions */
  conditions?: number[];
  /** Timestamp */
  timestamp: Date;
}

export interface TradeTapeProps {
  /** Trading symbol */
  symbol: string;
  /** Array of trades to display */
  trades: Trade[];
  /** Maximum trades to keep in memory */
  maxTrades?: number;
  /** Size threshold for highlighting large trades */
  highlightThreshold?: number;
  /** Show statistics footer */
  showStatistics?: boolean;
  /** Container height */
  height?: number | string;
  /** Callback when trade is clicked */
  onTradeClick?: (trade: Trade) => void;
  /** Custom CSS class */
  className?: string;
  /** Test ID for testing */
  "data-testid"?: string;
}

export interface TradeStatistics {
  /** Total volume */
  volume: number;
  /** Volume-Weighted Average Price */
  vwap: number;
  /** Trades per minute (rolling 1-minute window) */
  tradesPerMinute: number;
  /** Number of trades */
  tradeCount: number;
}

// ============================================
// Constants
// ============================================

const TRADE_ITEM_HEIGHT = 32;
const DEFAULT_MAX_TRADES = 500;
const DEFAULT_HIGHLIGHT_THRESHOLD = 1000;

/**
 * Exchange ID to name mapping (Polygon/Massive exchange codes)
 */
const EXCHANGE_NAMES: Record<number, string> = {
  1: "NYSE",
  2: "NYSE ARCA",
  3: "NYSE American",
  4: "NYSE National",
  5: "NASDAQ",
  6: "NASDAQ OMX BX",
  7: "NASDAQ OMX PSX",
  8: "FINRA",
  9: "ISE",
  10: "CBOE EDGA",
  11: "CBOE EDGX",
  12: "NYSE Chicago",
  13: "MEMX",
  14: "IEX",
  15: "CBOE BZX",
  16: "CBOE BYX",
  17: "MIAX",
};

/**
 * Trade conditions that indicate a sell (offers lifted)
 * These are Polygon/CTA condition codes
 */
const SELL_CONDITIONS = new Set([4, 5, 6, 41, 43]);

/**
 * Trade conditions that indicate a buy (bids hit)
 */
const BUY_CONDITIONS = new Set([1, 2, 3, 37, 38]);

// ============================================
// Utility Functions
// ============================================

/**
 * Classify trade side from conditions.
 * This is a heuristic - real side determination requires order book context.
 */
export function classifyTradeSide(conditions?: number[]): TradeSide {
  if (!conditions || conditions.length === 0) {
    return "UNKNOWN";
  }

  // Check for explicit buy/sell conditions
  for (const cond of conditions) {
    if (BUY_CONDITIONS.has(cond)) {
      return "BUY";
    }
    if (SELL_CONDITIONS.has(cond)) {
      return "SELL";
    }
  }

  return "UNKNOWN";
}

/**
 * Get exchange name from ID.
 */
function getExchangeName(exchangeId?: number): string {
  if (exchangeId === undefined) {
    return "--";
  }
  return EXCHANGE_NAMES[exchangeId] ?? `EX${exchangeId}`;
}

/**
 * Format price with proper decimals.
 */
function formatPrice(price: number): string {
  return `$${price.toFixed(2)}`;
}

/**
 * Format size with commas.
 */
function formatSize(size: number): string {
  return size.toLocaleString();
}

/**
 * Format timestamp as HH:MM:SS.mmm
 */
function formatTimestamp(date: Date): string {
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const seconds = date.getSeconds().toString().padStart(2, "0");
  const millis = date.getMilliseconds().toString().padStart(3, "0");
  return `${hours}:${minutes}:${seconds}.${millis}`;
}

/**
 * Calculate VWAP from trades.
 */
function calculateVWAP(trades: Trade[]): number {
  if (trades.length === 0) {
    return 0;
  }

  let sumPriceVolume = 0;
  let sumVolume = 0;

  for (const trade of trades) {
    sumPriceVolume += trade.price * trade.size;
    sumVolume += trade.size;
  }

  return sumVolume > 0 ? sumPriceVolume / sumVolume : 0;
}

/**
 * Calculate trades per minute (1-minute rolling window).
 */
function calculateTradesPerMinute(trades: Trade[]): number {
  if (trades.length === 0) {
    return 0;
  }

  const now = Date.now();
  const oneMinuteAgo = now - 60_000;
  const recentTrades = trades.filter((t) => t.timestamp.getTime() >= oneMinuteAgo);

  return recentTrades.length;
}

/**
 * Format volume with K/M/B suffix.
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

// ============================================
// Trade Item Component
// ============================================

interface TradeItemProps {
  trade: Trade;
  isHighlighted: boolean;
  onClick?: (trade: Trade) => void;
}

const TradeItem = memo(function TradeItem({ trade, isHighlighted, onClick }: TradeItemProps) {
  const handleClick = useCallback(() => {
    onClick?.(trade);
  }, [trade, onClick]);

  const sideConfig = {
    BUY: {
      color: "text-green-600 dark:text-green-400",
      icon: "●",
      bgHighlight: "bg-green-50 dark:bg-green-900/20",
    },
    SELL: {
      color: "text-red-600 dark:text-red-400",
      icon: "○",
      bgHighlight: "bg-red-50 dark:bg-red-900/20",
    },
    UNKNOWN: {
      color: "text-cream-500 dark:text-cream-400",
      icon: "◐",
      bgHighlight: "bg-cream-50 dark:bg-cream-900/20",
    },
  }[trade.side];

  return (
    <button
      type="button"
      className={`flex items-center gap-3 px-3 py-1.5 text-sm font-mono cursor-pointer transition-colors hover:bg-cream-100 dark:hover:bg-night-700 w-full text-left ${isHighlighted ? sideConfig.bgHighlight : ""}`}
      onClick={handleClick}
      aria-label={`${trade.side} trade: ${trade.size} shares at ${formatPrice(trade.price)}`}
      data-trade-id={trade.id}
    >
      {/* Timestamp */}
      <span className="w-24 text-cream-500 dark:text-cream-400 tabular-nums">
        {formatTimestamp(trade.timestamp)}
      </span>

      {/* Price */}
      <span className="w-20 text-cream-900 dark:text-cream-100 tabular-nums">
        {formatPrice(trade.price)}
      </span>

      {/* Size */}
      <span
        className={`w-16 text-right tabular-nums ${isHighlighted ? "font-bold text-cream-900 dark:text-cream-100" : "text-cream-700 dark:text-cream-300"}`}
      >
        {formatSize(trade.size)}
      </span>

      {/* Side Indicator */}
      <span className={`w-12 flex items-center gap-1 ${sideConfig.color}`}>
        <span aria-hidden="true">{sideConfig.icon}</span>
        <span className="text-xs">{trade.side}</span>
      </span>

      {/* Exchange */}
      <span className="flex-1 text-cream-500 dark:text-cream-400 text-xs truncate">
        {getExchangeName(trade.exchange)}
      </span>

      {/* Large Trade Indicator */}
      {isHighlighted && (
        <span className="text-xs text-amber-600 dark:text-amber-400" title="Large trade">
          ← Large
        </span>
      )}
    </button>
  );
});

// ============================================
// New Trades Button Component
// ============================================

interface NewTradesButtonProps {
  count: number;
  onClick: () => void;
}

const NewTradesButton = memo(function NewTradesButton({ count, onClick }: NewTradesButtonProps) {
  if (count === 0) {
    return null;
  }

  return (
    <button
      type="button"
      className="absolute top-2 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-full shadow-lg transition-all animate-slide-down"
      onClick={onClick}
      aria-label={`Show ${count} new ${count === 1 ? "trade" : "trades"}`}
    >
      <span className="inline-flex items-center gap-1">
        <span aria-hidden="true">↓</span>
        <span>
          {count} new {count === 1 ? "trade" : "trades"}
        </span>
      </span>
    </button>
  );
});

// ============================================
// Statistics Footer Component
// ============================================

interface StatisticsFooterProps {
  stats: TradeStatistics;
}

const StatisticsFooter = memo(function StatisticsFooter({ stats }: StatisticsFooterProps) {
  return (
    <div className="flex items-center gap-4 px-3 py-2 bg-cream-50 dark:bg-night-700 border-t border-cream-200 dark:border-night-600 text-xs font-mono">
      <div className="flex items-center gap-1">
        <span className="text-cream-500 dark:text-cream-400">Volume:</span>
        <span className="text-cream-900 dark:text-cream-100 font-medium">
          {formatVolume(stats.volume)}
        </span>
      </div>
      <div className="h-3 w-px bg-cream-300 dark:bg-night-600" />
      <div className="flex items-center gap-1">
        <span className="text-cream-500 dark:text-cream-400">VWAP:</span>
        <span className="text-cream-900 dark:text-cream-100 font-medium">
          ${stats.vwap.toFixed(2)}
        </span>
      </div>
      <div className="h-3 w-px bg-cream-300 dark:bg-night-600" />
      <div className="flex items-center gap-1">
        <span className="text-cream-500 dark:text-cream-400">Trades/min:</span>
        <span className="text-cream-900 dark:text-cream-100 font-medium">
          {stats.tradesPerMinute}
        </span>
      </div>
    </div>
  );
});

// ============================================
// Empty State Component
// ============================================

const EmptyState = memo(function EmptyState({ symbol }: { symbol: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-cream-500 dark:text-cream-400">
      <span className="text-2xl mb-2" aria-hidden="true">
        📊
      </span>
      <span className="text-sm">Waiting for {symbol} trades...</span>
    </div>
  );
});

// ============================================
// Main Component
// ============================================

/**
 * TradeTape displays real-time Time & Sales data.
 *
 * Features:
 * - Virtualized scrolling for 1000+ trades/minute
 * - Auto-scroll when at bottom, pause when user scrolls up
 * - Large trade highlighting
 * - VWAP and trades-per-minute statistics
 * - Buy/Sell side classification from trade conditions
 *
 * @example
 * ```tsx
 * <TradeTape
 *   symbol="AAPL"
 *   trades={trades}
 *   highlightThreshold={1000}
 *   showStatistics
 *   height={400}
 *   onTradeClick={(trade) => console.log('Clicked:', trade)}
 * />
 * ```
 */
export const TradeTape = memo(function TradeTape({
  symbol,
  trades,
  maxTrades = DEFAULT_MAX_TRADES,
  highlightThreshold = DEFAULT_HIGHLIGHT_THRESHOLD,
  showStatistics = true,
  height = 400,
  onTradeClick,
  className = "",
  "data-testid": testId,
}: TradeTapeProps) {
  // Limit trades for memory management
  const displayTrades = useMemo(
    () => (trades.length > maxTrades ? trades.slice(-maxTrades) : trades),
    [trades, maxTrades]
  );

  // Auto-scroll behavior
  const { containerRef, isAutoScrolling, newItemCount, scrollToBottom, onNewItems, onScroll } =
    useAutoScroll({ threshold: 50 });

  // Track previous trade count for detecting new trades
  const prevCountRef = useRef(displayTrades.length);

  // Notify when new trades arrive
  useEffect(() => {
    const newCount = displayTrades.length - prevCountRef.current;
    if (newCount > 0) {
      onNewItems(newCount);
    }
    prevCountRef.current = displayTrades.length;
  }, [displayTrades.length, onNewItems]);

  // Calculate statistics
  const statistics = useMemo((): TradeStatistics => {
    const volume = displayTrades.reduce((sum, t) => sum + t.size, 0);
    const vwap = calculateVWAP(displayTrades);
    const tradesPerMinute = calculateTradesPerMinute(displayTrades);

    return {
      volume,
      vwap,
      tradesPerMinute,
      tradeCount: displayTrades.length,
    };
  }, [displayTrades]);

  // Virtualizer setup
  const virtualizer = useVirtualizer({
    count: displayTrades.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => TRADE_ITEM_HEIGHT,
    overscan: 10,
  });

  // Handle scroll to bottom when auto-scrolling
  // biome-ignore lint/correctness/useExhaustiveDependencies: containerRef is a stable ref
  useEffect(() => {
    if (isAutoScrolling && containerRef.current) {
      virtualizer.scrollToIndex(displayTrades.length - 1, {
        align: "end",
        behavior: "auto",
      });
    }
  }, [isAutoScrolling, displayTrades.length, virtualizer]);

  const containerHeight = typeof height === "number" ? `${height}px` : height;

  if (displayTrades.length === 0) {
    return (
      <div
        className={`relative bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 overflow-hidden ${className}`}
        style={{ height: containerHeight }}
        data-testid={testId}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 bg-cream-50 dark:bg-night-700 border-b border-cream-200 dark:border-night-600">
          <span className="text-sm font-medium text-cream-700 dark:text-cream-300">
            TRADE TAPE: {symbol}
          </span>
        </div>
        <EmptyState symbol={symbol} />
      </div>
    );
  }

  return (
    <div
      className={`relative bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 overflow-hidden ${className}`}
      data-testid={testId}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-cream-50 dark:bg-night-700 border-b border-cream-200 dark:border-night-600">
        <span className="text-sm font-medium text-cream-700 dark:text-cream-300">
          TRADE TAPE: {symbol}
        </span>
        <div className="flex items-center gap-3 text-xs text-cream-500 dark:text-cream-400 font-mono">
          <span>Time</span>
          <span>Price</span>
          <span>Size</span>
          <span>Side</span>
          <span>Exchange</span>
        </div>
      </div>

      {/* New Trades Button */}
      <NewTradesButton count={newItemCount} onClick={scrollToBottom} />

      {/* Virtualized List */}
      <div
        ref={containerRef}
        className="overflow-auto"
        style={{ height: `calc(${containerHeight} - ${showStatistics ? "80px" : "44px"})` }}
        onScroll={onScroll}
        role="log"
        aria-live="polite"
        aria-label={`Trade tape for ${symbol}`}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const trade = displayTrades[virtualItem.index];
            if (!trade) {
              return null;
            }
            return (
              <div
                key={trade.id}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualItem.size}px`,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <TradeItem
                  trade={trade}
                  isHighlighted={trade.size >= highlightThreshold}
                  onClick={onTradeClick}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Statistics Footer */}
      {showStatistics && <StatisticsFooter stats={statistics} />}

      {/* Auto-scroll Indicator */}
      {isAutoScrolling && (
        <div
          className="absolute bottom-12 right-2 px-2 py-1 bg-night-800/80 text-white text-xs rounded"
          aria-hidden="true"
        >
          Live
        </div>
      )}
    </div>
  );
});

// ============================================
// Exports
// ============================================

export { calculateVWAP, calculateTradesPerMinute, formatVolume };
export default TradeTape;
