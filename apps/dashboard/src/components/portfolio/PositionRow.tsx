/** @see docs/plans/ui/40-streaming-data-integration.md Part 4.2 */

"use client";

import Link from "next/link";
import { memo } from "react";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { usePriceFlash } from "@/components/ui/use-price-flash";
import type { StreamingPosition } from "@/hooks/usePortfolioStreaming";

export interface PositionRowProps {
  position: StreamingPosition;
  formatCurrency?: (value: number) => string;
  formatPct?: (value: number) => string;
}

const defaultFormatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);

const defaultFormatPct = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

export const PositionRow = memo(function PositionRow({
  position,
  formatCurrency: _formatCurrency = defaultFormatCurrency,
  formatPct = defaultFormatPct,
}: PositionRowProps) {
  const { flash } = usePriceFlash(position.livePrice, position.previousPrice);

  const pnlColor = position.liveUnrealizedPnl >= 0 ? "text-green-600" : "text-red-600";

  const pnlFlashClasses = flash.isFlashing
    ? flash.direction === "up"
      ? "animate-flash-profit"
      : "animate-flash-loss"
    : "";

  return (
    <tr className="hover:bg-cream-50 dark:hover:bg-night-750 transition-colors">
      <td className="px-4 py-3 font-medium text-cream-900 dark:text-cream-100">
        <div className="flex items-center gap-2">
          <Link href={`/portfolio/positions/${position.id}`} className="hover:text-blue-600">
            {position.symbol}
          </Link>
          {position.isStreaming && (
            // biome-ignore lint/a11y/useSemanticElements: role="status" for live region accessibility
            <span
              className="w-2 h-2 rounded-full bg-green-500 animate-pulse"
              title="Live streaming"
              role="status"
              aria-label="Live streaming"
            />
          )}
        </div>
      </td>

      <td className="px-4 py-3">
        <span
          className={`px-2 py-0.5 text-xs font-medium rounded ${
            position.side === "LONG"
              ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
              : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
          }`}
        >
          {position.side}
        </span>
      </td>

      <td className="px-4 py-3 text-right font-mono text-cream-900 dark:text-cream-100">
        {position.qty}
      </td>

      <td className="px-4 py-3 text-right font-mono text-cream-900 dark:text-cream-100">
        ${position.avgEntry.toFixed(2)}
      </td>

      <td className="px-4 py-3 text-right">
        <AnimatedNumber
          value={position.livePrice}
          format="currency"
          decimals={2}
          className="font-mono text-cream-900 dark:text-cream-100"
          animationThreshold={0.001}
        />
      </td>

      <td className="px-4 py-3 text-right font-mono text-cream-900 dark:text-cream-100">
        <AnimatedNumber
          value={position.liveMarketValue}
          format="currency"
          decimals={0}
          className="font-mono"
          animationThreshold={1}
        />
      </td>

      <td className={`px-4 py-3 text-right font-mono ${pnlColor} ${pnlFlashClasses} rounded`}>
        <span className="font-mono">
          {position.liveUnrealizedPnl >= 0 ? "+" : ""}
          <AnimatedNumber
            value={position.liveUnrealizedPnl}
            format="currency"
            decimals={0}
            className="inline"
            animationThreshold={1}
          />
        </span>
      </td>

      <td className={`px-4 py-3 text-right font-mono ${pnlColor}`}>
        {formatPct(position.liveUnrealizedPnlPct)}
      </td>

      <td className="px-4 py-3 text-right text-cream-500 dark:text-cream-400">
        {position.daysHeld}d
      </td>
    </tr>
  );
});

export default PositionRow;
