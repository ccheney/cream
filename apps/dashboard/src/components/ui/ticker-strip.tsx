/**
 * TickerStrip Component
 *
 * Persistent quote strip showing watchlist symbols with real-time updates.
 * Positioned below the header, supports horizontal scrolling on small screens.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 1.1
 */

"use client";

import { Plus, RefreshCw } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMultiTickHistory } from "@/hooks/useTickHistory";
import { useWebSocketContext } from "@/providers/WebSocketProvider";
import type { Quote } from "./ticker-item";
import { TickerItem } from "./ticker-item";

// ============================================
// Types
// ============================================

export interface TickerStripProps {
  /** Symbols to display */
  symbols: string[];
  /** Click handler for symbol navigation */
  onSymbolClick?: (symbol: string) => void;
  /** Remove symbol from watchlist */
  onSymbolRemove?: (symbol: string) => void;
  /** Add symbol callback */
  onSymbolAdd?: () => void;
  /** Show sparkline in each item */
  showSparkline?: boolean;
  /** Show tick history dots */
  showTickHistory?: boolean;
  /** Allow removing symbols */
  allowRemove?: boolean;
  /** Allow adding symbols */
  allowAdd?: boolean;
  /** Custom CSS class */
  className?: string;
  /** Test ID */
  "data-testid"?: string;
}

// ============================================
// Component
// ============================================

/**
 * TickerStrip displays a horizontal strip of watchlist symbols with live quotes.
 *
 * Features:
 * - Real-time price updates via WebSocket
 * - Flash animation on price changes
 * - Tick direction history dots
 * - Optional sparkline for each symbol
 * - Horizontal scroll on overflow
 * - Add/remove symbols
 * - Click to navigate to charts
 *
 * @example
 * ```tsx
 * <TickerStrip
 *   symbols={['AAPL', 'NVDA', 'SPY', 'MSFT']}
 *   onSymbolClick={(sym) => router.push(`/charts?symbol=${sym}`)}
 *   onSymbolRemove={(sym) => removeFromWatchlist(sym)}
 *   onSymbolAdd={() => setShowAddModal(true)}
 *   showSparkline
 *   showTickHistory
 * />
 * ```
 */
export const TickerStrip = memo(function TickerStrip({
  symbols,
  onSymbolClick,
  onSymbolRemove,
  onSymbolAdd,
  showSparkline = false,
  showTickHistory = true,
  allowRemove = true,
  allowAdd = true,
  className = "",
  "data-testid": testId,
}: TickerStripProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [quotes, setQuotes] = useState<Map<string, Quote>>(new Map());
  const [previousPrices, setPreviousPrices] = useState<Map<string, number>>(new Map());
  const { subscribe, subscribeSymbols, connected } = useWebSocketContext();
  const { getTicks, getPriceHistory, recordTick } = useMultiTickHistory();

  // Subscribe to symbols when they change
  useEffect(() => {
    if (!connected || symbols.length === 0) {
      return;
    }

    // Subscribe to quotes channel and specific symbols
    subscribe(["quotes"]);
    subscribeSymbols(symbols);

    return () => {
      // Cleanup: unsubscribe handled by provider on disconnect
    };
  }, [connected, symbols, subscribe, subscribeSymbols]);

  // Handle quote updates from WebSocket
  useEffect(() => {
    if (!connected) {
      return;
    }

    // TODO: Wire up WebSocket message handler for quote updates
    // The WebSocketProvider should expose onQuoteUpdate callback
  }, [connected]);

  // Handle incoming quote update
  const handleQuoteUpdate = useCallback(
    (newQuote: Quote) => {
      setQuotes((prev) => {
        const updated = new Map(prev);
        const existing = updated.get(newQuote.symbol);

        // Store previous price for flash animation
        if (existing?.last !== undefined && existing.last !== newQuote.last) {
          setPreviousPrices((prevPrices) => {
            const newPrices = new Map(prevPrices);
            newPrices.set(newQuote.symbol, existing.last);
            return newPrices;
          });
        }

        updated.set(newQuote.symbol, newQuote);
        return updated;
      });

      // Record tick for history
      if (newQuote.last !== undefined) {
        recordTick(newQuote.symbol, newQuote.last);
      }
    },
    [recordTick]
  );

  // Expose handleQuoteUpdate for external use
  useEffect(() => {
    // Make handler available to WebSocket provider
    // This would typically be done through context or props
    (
      window as unknown as { __tickerQuoteHandler?: typeof handleQuoteUpdate }
    ).__tickerQuoteHandler = handleQuoteUpdate;
    return () => {
      delete (window as unknown as { __tickerQuoteHandler?: typeof handleQuoteUpdate })
        .__tickerQuoteHandler;
    };
  }, [handleQuoteUpdate]);

  // Scroll handlers
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    setCanScrollLeft(container.scrollLeft > 0);
    setCanScrollRight(container.scrollLeft < container.scrollWidth - container.clientWidth - 1);
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    updateScrollState();
    container.addEventListener("scroll", updateScrollState);
    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(container);

    return () => {
      container.removeEventListener("scroll", updateScrollState);
      resizeObserver.disconnect();
    };
  }, [updateScrollState]);

  const scrollLeft = () => {
    scrollContainerRef.current?.scrollBy({ left: -200, behavior: "smooth" });
  };

  const scrollRight = () => {
    scrollContainerRef.current?.scrollBy({ left: 200, behavior: "smooth" });
  };

  // Calculate if strip should show based on symbols
  const hasSymbols = symbols.length > 0;

  // Memoize symbol list to avoid unnecessary re-renders
  const symbolItems = useMemo(() => {
    return symbols.map((symbol) => ({
      symbol,
      quote: quotes.get(symbol),
      previousPrice: previousPrices.get(symbol),
      tickHistory: getTicks(symbol),
      priceHistory: getPriceHistory(symbol),
    }));
  }, [symbols, quotes, previousPrices, getTicks, getPriceHistory]);

  if (!hasSymbols && !allowAdd) {
    return null;
  }

  return (
    <div
      className={`
        relative flex items-stretch
        bg-white dark:bg-night-800
        border-b border-cream-200 dark:border-night-700
        ${className}
      `}
      data-testid={testId}
    >
      {/* Left scroll button */}
      {canScrollLeft && (
        <button
          type="button"
          onClick={scrollLeft}
          className="
            absolute left-0 top-0 bottom-0 w-8 z-10
            bg-gradient-to-r from-white dark:from-night-800 to-transparent
            flex items-center justify-start pl-1
            hover:from-cream-100 dark:hover:from-night-700
          "
          aria-label="Scroll left"
        >
          <span className="text-cream-400">‹</span>
        </button>
      )}

      {/* Scrollable container */}
      <div
        ref={scrollContainerRef}
        className="flex overflow-x-auto scrollbar-hide"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {/* Ticker items */}
        {symbolItems.map(({ symbol, quote, previousPrice, tickHistory, priceHistory }) => (
          <TickerItem
            key={symbol}
            symbol={symbol}
            quote={quote}
            previousPrice={previousPrice}
            tickHistory={tickHistory}
            priceHistory={priceHistory}
            showSparkline={showSparkline}
            showTickHistory={showTickHistory}
            onClick={onSymbolClick}
            onRemove={allowRemove ? onSymbolRemove : undefined}
            showRemove={allowRemove}
            data-testid={`ticker-item-${symbol}`}
          />
        ))}

        {/* Add button */}
        {allowAdd && (
          <button
            type="button"
            onClick={onSymbolAdd}
            className="
              flex items-center justify-center px-4 py-2 min-w-[60px]
              text-cream-400 hover:text-cream-600 dark:hover:text-cream-300
              hover:bg-cream-50 dark:hover:bg-night-700
              transition-colors duration-150
            "
            aria-label="Add symbol to watchlist"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}

        {/* Connection indicator when disconnected */}
        {!connected && (
          <div className="flex items-center gap-2 px-4 py-2 text-yellow-600 dark:text-yellow-400">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span className="text-xs">Connecting...</span>
          </div>
        )}
      </div>

      {/* Right scroll button */}
      {canScrollRight && (
        <button
          type="button"
          onClick={scrollRight}
          className="
            absolute right-0 top-0 bottom-0 w-8 z-10
            bg-gradient-to-l from-white dark:from-night-800 to-transparent
            flex items-center justify-end pr-1
            hover:from-cream-100 dark:hover:from-night-700
          "
          aria-label="Scroll right"
        >
          <span className="text-cream-400">›</span>
        </button>
      )}
    </div>
  );
});

// ============================================
// Exports
// ============================================

export default TickerStrip;
export type { Quote };
