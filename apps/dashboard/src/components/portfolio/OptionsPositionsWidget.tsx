"use client";

import { memo, useCallback, useEffect, useMemo } from "react";
import { useOptionsPositions } from "@/hooks/queries/useOptionsPositions";
import { type StreamingOptionsPosition, usePositionGreeks } from "@/hooks/usePositionGreeks";
import { useWebSocket } from "@/hooks/useWebSocket";
import { AggregateGreeks } from "./AggregateGreeks";
import { OptionsPositionRow } from "./OptionsPositionRow";

export interface OptionsPositionsWidgetProps {
  /** Show aggregate greeks footer */
  showAggregateGreeks?: boolean;
  /** Click handler for position detail */
  onPositionClick?: (position: StreamingOptionsPosition) => void;
  /** Additional class names */
  className?: string;
}

const LoadingSkeleton = () => (
  <div className="animate-pulse">
    <div className="h-10 bg-cream-100 dark:bg-night-700 rounded mb-2" />
    <div className="h-12 bg-cream-100 dark:bg-night-700 rounded mb-2" />
    <div className="h-12 bg-cream-100 dark:bg-night-700 rounded mb-2" />
    <div className="h-12 bg-cream-100 dark:bg-night-700 rounded mb-2" />
  </div>
);

const EmptyState = () => (
  <div className="text-center py-8 text-stone-500 dark:text-night-300">
    <p>No options positions</p>
    <p className="text-sm mt-1">Options positions will appear here when opened</p>
  </div>
);

export const OptionsPositionsWidget = memo(function OptionsPositionsWidget({
  showAggregateGreeks = true,
  onPositionClick,
  className = "",
}: OptionsPositionsWidgetProps) {
  const { data, isLoading, error } = useOptionsPositions();

  const positions = data?.positions ?? [];
  const underlyingPrices = data?.underlyingPrices ?? {};

  const contractSymbols = useMemo(() => positions.map((p) => p.contractSymbol), [positions]);

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
        if (contractSymbols.includes(data.symbol)) {
          updateContractPrice(data.symbol, price);
        } else {
          updateUnderlyingPrice(data.symbol, price);
        }
      }
    },
    [contractSymbols, updateContractPrice, updateUnderlyingPrice]
  );

  const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001/ws";
  const { connected, subscribeOptions, unsubscribeOptions, subscribeSymbols, unsubscribeSymbols } =
    useWebSocket({
      url: wsUrl,
      onMessage: handleMessage,
      autoConnect: true,
    });

  useEffect(() => {
    if (!connected || contractSymbols.length === 0) {
      return;
    }

    subscribeOptions(contractSymbols);

    // Underlyings needed for greeks calculation (delta depends on underlying price)
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

  if (isLoading) {
    return (
      <div
        className={`bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4 ${className}`}
      >
        <h3 className="text-lg font-semibold text-stone-900 dark:text-night-50 mb-4">
          Options Positions
        </h3>
        <LoadingSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4 ${className}`}
      >
        <h3 className="text-lg font-semibold text-stone-900 dark:text-night-50 mb-4">
          Options Positions
        </h3>
        <div className="text-center py-4 text-red-500">Failed to load options positions</div>
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div
        className={`bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4 ${className}`}
      >
        <h3 className="text-lg font-semibold text-stone-900 dark:text-night-50 mb-4">
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
      <div className="px-4 py-3 border-b border-cream-200 dark:border-night-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-stone-900 dark:text-night-50">
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
          <span className="text-sm text-stone-500 dark:text-night-300">
            {positions.length} position{positions.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-cream-200 dark:border-night-700 text-sm text-stone-500 dark:text-night-300">
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

      {showAggregateGreeks && (
        <div className="border-t border-cream-200 dark:border-night-700">
          <AggregateGreeks greeks={aggregateGreeks} isStreaming={isStreaming} />
        </div>
      )}
    </div>
  );
});

export default OptionsPositionsWidget;
