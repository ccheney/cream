/**
 * OptionsPositionsWidget Component
 *
 * Real-time options positions widget for the Portfolio page.
 * Shows streaming greeks and P/L for all options holdings.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 2.2
 */

"use client";

import { memo, useCallback, useEffect, useMemo } from "react";
import { useOptionsPositions } from "@/hooks/queries/useOptionsPositions";
import { type StreamingOptionsPosition, usePositionGreeks } from "@/hooks/usePositionGreeks";
import { useWebSocket } from "@/hooks/useWebSocket";
import { AggregateGreeks } from "./AggregateGreeks";
import { OptionsPositionRow } from "./OptionsPositionRow";

// ============================================
// Types
// ============================================

export interface OptionsPositionsWidgetProps {
  /** Show aggregate greeks footer */
  showAggregateGreeks?: boolean;
  /** Click handler for position detail */
  onPositionClick?: (position: StreamingOptionsPosition) => void;
  /** Additional class names */
  className?: string;
}

// ============================================
// Loading Skeleton
// ============================================

const LoadingSkeleton = () => (
  <div className="animate-pulse">
    <div className="h-10 bg-cream-100 dark:bg-night-700 rounded mb-2" />
    <div className="h-12 bg-cream-100 dark:bg-night-700 rounded mb-2" />
    <div className="h-12 bg-cream-100 dark:bg-night-700 rounded mb-2" />
    <div className="h-12 bg-cream-100 dark:bg-night-700 rounded mb-2" />
  </div>
);

// ============================================
// Empty State
// ============================================

const EmptyState = () => (
  <div className="text-center py-8 text-cream-500 dark:text-cream-400">
    <p>No options positions</p>
    <p className="text-sm mt-1">Options positions will appear here when opened</p>
  </div>
);

// ============================================
// Component
// ============================================

/**
 * OptionsPositionsWidget displays all options positions with real-time updates.
 *
 * Features:
 * - Real-time price streaming via WebSocket
 * - Live greeks calculation (delta, gamma, theta, vega)
 * - Aggregate portfolio greeks
 * - P/L with flash animations
 * - Click-through to position detail
 */
export const OptionsPositionsWidget = memo(function OptionsPositionsWidget({
  showAggregateGreeks = true,
  onPositionClick,
  className = "",
}: OptionsPositionsWidgetProps) {
  // Fetch options positions
  const { data, isLoading, error } = useOptionsPositions();

  const positions = data?.positions ?? [];
  const underlyingPrices = data?.underlyingPrices ?? {};

  // Get contract symbols for subscription
  const contractSymbols = useMemo(() => positions.map((p) => p.contractSymbol), [positions]);

  // Calculate greeks with streaming prices
  const {
    streamingPositions,
    aggregateGreeks,
    isStreaming,
    updateContractPrice,
    updateUnderlyingPrice,
  } = usePositionGreeks({
    positions,
    underlyingPrices,
  });

  // WebSocket message handler
  const handleMessage = useCallback(
    (msg: unknown) => {
      const data = msg as { type?: string; symbol?: string; price?: number; last?: number };
      if (!data.type || !data.symbol) {
        return;
      }

      const price = data.price ?? data.last;
      if (typeof price !== "number") {
        return;
      }

      if (data.type === "quote" || data.type === "options_quote") {
        // Check if it's a contract or underlying
        if (contractSymbols.includes(data.symbol)) {
          updateContractPrice(data.symbol, price);
        } else {
          // It's an underlying quote
          updateUnderlyingPrice(data.symbol, price);
        }
      }
    },
    [contractSymbols, updateContractPrice, updateUnderlyingPrice]
  );

  // WebSocket connection
  const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001/ws";
  const { connected, subscribeOptions, unsubscribeOptions, subscribeSymbols, unsubscribeSymbols } =
    useWebSocket({
      url: wsUrl,
      onMessage: handleMessage,
      autoConnect: true,
    });

  // Subscribe to contracts when connected
  useEffect(() => {
    if (!connected || contractSymbols.length === 0) {
      return;
    }

    // Subscribe to option contracts (high priority)
    subscribeOptions(contractSymbols);

    // Subscribe to underlyings for greeks calculation
    const underlyings = [...new Set(positions.map((p) => p.underlying))];
    if (underlyings.length > 0) {
      subscribeSymbols(underlyings);
    }

    return () => {
      unsubscribeOptions(contractSymbols);
      unsubscribeSymbols(underlyings);
    };
  }, [
    connected,
    contractSymbols,
    positions,
    subscribeOptions,
    unsubscribeOptions,
    subscribeSymbols,
    unsubscribeSymbols,
  ]);

  // Handle loading state
  if (isLoading) {
    return (
      <div
        className={`bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4 ${className}`}
      >
        <h3 className="text-lg font-semibold text-cream-900 dark:text-cream-100 mb-4">
          Options Positions
        </h3>
        <LoadingSkeleton />
      </div>
    );
  }

  // Handle error state
  if (error) {
    return (
      <div
        className={`bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4 ${className}`}
      >
        <h3 className="text-lg font-semibold text-cream-900 dark:text-cream-100 mb-4">
          Options Positions
        </h3>
        <div className="text-center py-4 text-red-500">Failed to load options positions</div>
      </div>
    );
  }

  // Handle empty state
  if (positions.length === 0) {
    return (
      <div
        className={`bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4 ${className}`}
      >
        <h3 className="text-lg font-semibold text-cream-900 dark:text-cream-100 mb-4">
          Options Positions
        </h3>
        <EmptyState />
      </div>
    );
  }

  return (
    <div
      className={`bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 overflow-hidden ${className}`}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-cream-200 dark:border-night-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-cream-900 dark:text-cream-100">
              Options Positions
            </h3>
            {isStreaming && (
              // biome-ignore lint/a11y/useSemanticElements: role="status" for live region accessibility
              <span
                className="w-2 h-2 rounded-full bg-green-500 animate-pulse"
                title="Live streaming"
                role="status"
                aria-label="Live streaming"
              />
            )}
          </div>
          <span className="text-sm text-cream-500 dark:text-cream-400">
            {positions.length} position{positions.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-cream-200 dark:border-night-700 text-sm text-cream-500 dark:text-cream-400">
              <th className="px-4 py-2 text-left font-medium">Contract</th>
              <th className="px-4 py-2 text-right font-medium">Qty</th>
              <th className="px-4 py-2 text-right font-medium">Cost</th>
              <th className="px-4 py-2 text-right font-medium">Mkt</th>
              <th className="px-4 py-2 text-right font-medium">P/L</th>
              <th className="px-4 py-2 text-right font-medium">Delta</th>
              <th className="px-4 py-2 text-right font-medium">Theta</th>
              <th className="px-4 py-2 text-right font-medium">DTE</th>
            </tr>
          </thead>
          <tbody>
            {streamingPositions.map((position) => (
              <OptionsPositionRow
                key={position.id}
                position={position}
                onPositionClick={onPositionClick}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Aggregate Greeks Footer */}
      {showAggregateGreeks && (
        <div className="border-t border-cream-200 dark:border-night-700">
          <AggregateGreeks greeks={aggregateGreeks} isStreaming={isStreaming} />
        </div>
      )}
    </div>
  );
});

export default OptionsPositionsWidget;
