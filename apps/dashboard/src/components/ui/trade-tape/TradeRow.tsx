/**
 * TradeRow Component
 *
 * Individual trade row for the TradeTape display.
 */

"use client";

import { memo, useCallback } from "react";

import type { TradeItemProps } from "./types.js";
import { SIDE_CONFIG } from "./types.js";
import { formatPrice, formatSize, formatTimestamp, getExchangeName } from "./utils.js";

export const TradeRow = memo(function TradeRow({
  trade,
  isHighlighted,
  onClick,
}: TradeItemProps): React.ReactElement {
  const handleClick = useCallback(() => {
    onClick?.(trade);
  }, [trade, onClick]);

  const sideConfig = SIDE_CONFIG[trade.side];

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

export default TradeRow;
