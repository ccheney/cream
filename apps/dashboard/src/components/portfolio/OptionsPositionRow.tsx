/** @see docs/plans/ui/40-streaming-data-integration.md Part 2.2 */
"use client";

import { memo } from "react";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { usePriceFlash } from "@/components/ui/use-price-flash";
import { formatContractDisplay } from "@/hooks/queries/useOptionsPositions";
import type { StreamingOptionsPosition } from "@/hooks/usePositionGreeks";

export interface OptionsPositionRowProps {
  position: StreamingOptionsPosition;
  onPositionClick?: (position: StreamingOptionsPosition) => void;
}

export const OptionsPositionRow = memo(function OptionsPositionRow({
  position,
  onPositionClick,
}: OptionsPositionRowProps) {
  const { flash } = usePriceFlash(position.livePrice, position.previousPrice);

  const pnlColor = position.liveUnrealizedPnl >= 0 ? "text-green-600" : "text-red-600";

  const pnlFlashClasses = flash.isFlashing
    ? flash.direction === "up"
      ? "animate-flash-profit"
      : "animate-flash-loss"
    : "";

  const contractDisplay = formatContractDisplay(
    position.underlying,
    position.expiration,
    position.strike,
    position.right
  );

  const handleClick = () => {
    onPositionClick?.(position);
  };

  return (
    <tr className="hover:bg-cream-50 dark:hover:bg-night-750 transition-colors">
      <td className="px-4 py-3 font-medium text-cream-900 dark:text-cream-100">
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleClick} className="hover:text-blue-600 text-left">
            {contractDisplay}
          </button>
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

      <td className="px-4 py-3 text-right font-mono text-cream-900 dark:text-cream-100">
        {position.quantity > 0 ? "+" : ""}
        {position.quantity}
      </td>

      <td className="px-4 py-3 text-right font-mono text-cream-900 dark:text-cream-100">
        ${position.avgCost.toFixed(2)}
      </td>

      <td className="px-4 py-3 text-right">
        <AnimatedNumber
          value={position.livePrice}
          format="currency"
          decimals={2}
          className="font-mono text-cream-900 dark:text-cream-100"
          animationThreshold={0.01}
        />
      </td>

      <td className={`px-4 py-3 text-right font-mono ${pnlColor} ${pnlFlashClasses} rounded`}>
        <div className="flex flex-col items-end">
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
          <span className="text-xs">
            ({position.liveUnrealizedPnlPct >= 0 ? "+" : ""}
            {position.liveUnrealizedPnlPct.toFixed(1)}%)
          </span>
        </div>
      </td>

      <td className="px-4 py-3 text-right font-mono text-cream-900 dark:text-cream-100">
        {position.greeks.delta >= 0 ? "+" : ""}
        {position.greeks.delta.toFixed(2)}
      </td>

      <td className="px-4 py-3 text-right font-mono text-cream-500 dark:text-cream-400">
        ${position.greeks.theta.toFixed(0)}/day
      </td>

      <td className="px-4 py-3 text-right text-cream-500 dark:text-cream-400">{position.dte}d</td>
    </tr>
  );
});

export default OptionsPositionRow;
