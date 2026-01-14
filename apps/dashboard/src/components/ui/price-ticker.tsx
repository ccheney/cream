/**
 * PriceTicker Component
 *
 * Displays live prices with animated transitions, flash backgrounds,
 * delta display, sparkline, tick dots, and stale fadeout.
 *
 * @see docs/plans/ui/31-realtime-patterns.md lines 22-27
 * @see docs/plans/ui/40-streaming-data-integration.md Part 5.1
 */

"use client";

import { memo, useEffect, useMemo } from "react";
import { AnimatedNumber } from "./animated-number";
import { Sparkline } from "./sparkline";
import type { TickDirection } from "./tick-dots";
import { TickDots } from "./tick-dots";
import { usePriceFlash } from "./use-price-flash";
import { useStaleData } from "./use-stale-data";

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
	/** Show bid × ask spread */
	showBidAsk?: boolean;
	/** Bid price (for bid/ask display) */
	bid?: number;
	/** Ask price (for bid/ask display) */
	ask?: number;
	/** Show price change info */
	showChange?: boolean;
	/** Show mini sparkline chart */
	showSparkline?: boolean;
	/** Price history for sparkline (most recent last) */
	priceHistory?: number[];
	/** Show tick direction dots */
	showTickDots?: boolean;
	/** Tick direction history (most recent last) */
	tickHistory?: TickDirection[];
	/** Custom CSS class */
	className?: string;
	/** Size variant */
	size?: "sm" | "md" | "lg";
	/** Display variant */
	variant?: "default" | "compact" | "expanded";
	/** Test ID for testing */
	"data-testid"?: string;
}

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

function formatBidAsk(bid: number, ask: number): string {
	return `${bid.toFixed(2)} × ${ask.toFixed(2)}`;
}

const sizeStyles = {
	sm: {
		container: "text-sm",
		price: "text-sm font-medium",
		delta: "text-xs",
		symbol: "text-xs",
		bidAsk: "text-xs",
	},
	md: {
		container: "text-base",
		price: "text-lg font-semibold",
		delta: "text-sm",
		symbol: "text-sm",
		bidAsk: "text-sm",
	},
	lg: {
		container: "text-lg",
		price: "text-2xl font-bold",
		delta: "text-base",
		symbol: "text-base",
		bidAsk: "text-sm",
	},
};

const variantStyles = {
	default: {
		layout: "flex-col",
		gap: "gap-0.5",
	},
	compact: {
		layout: "flex-row items-center",
		gap: "gap-2",
	},
	expanded: {
		layout: "flex-col",
		gap: "gap-1",
	},
};

/**
 * PriceTicker displays live prices with visual feedback.
 *
 * Features:
 * - Animated price transitions using AnimatedNumber
 * - Flash background on price changes (green up, red down)
 * - Delta display with arrows and color coding
 * - Optional sparkline showing recent price history
 * - Optional tick dots showing direction history
 * - Bid/ask spread display
 * - Stale data fadeout when updates stop
 * - Accessibility with ARIA live region
 *
 * @example
 * ```tsx
 * // Basic usage
 * <PriceTicker
 *   symbol="AAPL"
 *   price={187.52}
 *   previousPrice={187.20}
 *   delta={0.32}
 *   deltaPercent={0.17}
 *   lastUpdatedAt={new Date()}
 * />
 *
 * // With sparkline and tick dots
 * <PriceTicker
 *   symbol="AAPL"
 *   price={187.52}
 *   showSparkline
 *   priceHistory={[185, 186, 185.5, 187, 186.5, 187.52]}
 *   showTickDots
 *   tickHistory={['up', 'down', 'up', 'down', 'up']}
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
	showBidAsk = false,
	bid,
	ask,
	showChange = true,
	showSparkline = false,
	priceHistory,
	showTickDots = false,
	tickHistory,
	className = "",
	size = "md",
	variant = "default",
	"data-testid": testId,
}: PriceTickerProps) {
	const { flash } = usePriceFlash(price, previousPrice);
	const { stale, markUpdated } = useStaleData(lastUpdatedAt);

	useEffect(() => {
		if (price !== previousPrice) {
			markUpdated();
		}
	}, [price, previousPrice, markUpdated]);

	const styles = sizeStyles[size];
	const variantStyle = variantStyles[variant];

	const displayDelta = delta ?? (previousPrice !== undefined ? price - previousPrice : undefined);
	const displayDeltaPercent =
		deltaPercent ??
		(previousPrice !== undefined && previousPrice !== 0
			? ((price - previousPrice) / previousPrice) * 100
			: undefined);

	const isPositive = displayDelta !== undefined ? displayDelta >= 0 : true;

	const flashClasses = flash.isFlashing
		? flash.direction === "up"
			? "animate-flash-profit"
			: "animate-flash-loss"
		: "";

	const sparklineData = useMemo(() => {
		if (!showSparkline || !priceHistory) {
			return [];
		}
		return priceHistory.slice(-20);
	}, [showSparkline, priceHistory]);

	const tickData = useMemo(() => {
		if (!showTickDots || !tickHistory) {
			return [];
		}
		return tickHistory;
	}, [showTickDots, tickHistory]);

	const StaleIndicator = () => (
		// biome-ignore lint/a11y/useSemanticElements: role="status" is appropriate for stale indicator
		<span
			className="ml-1 text-gray-400"
			title={`Last updated ${stale.secondsSinceUpdate}s ago`}
			role="status"
			aria-label={`Data is ${stale.secondsSinceUpdate} seconds old`}
		>
			<svg
				className="inline-block w-3 h-3"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
				aria-hidden="true"
			>
				<title>Stale data indicator</title>
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
			className={`inline-flex ${variantStyle.layout} ${variantStyle.gap} ${styles.container} ${className}`}
			style={{
				opacity: stale.opacity,
				transition: "opacity 300ms ease-in-out",
			}}
			data-testid={testId}
		>
			{showSymbol && (
				<span className={`${styles.symbol} text-gray-500 dark:text-gray-400`}>{symbol}</span>
			)}

			<div
				className={`${styles.price} ${flashClasses} rounded px-1 -mx-1 flex items-center gap-2`}
				style={{
					["--flash-color" as string]: isPositive
						? "rgba(34, 197, 94, 0.3)"
						: "rgba(239, 68, 68, 0.3)",
				}}
				aria-live="polite"
				aria-atomic="true"
			>
				<AnimatedNumber
					value={price}
					format="currency"
					decimals={price >= 1 ? 2 : 4}
					className="font-mono"
					animationThreshold={0.001}
				/>
				{stale.showIndicator && <StaleIndicator />}

				{variant === "compact" && showSparkline && sparklineData.length >= 2 && (
					<Sparkline data={sparklineData} width={50} height={16} strokeWidth={1} />
				)}
			</div>

			{showBidAsk && bid !== undefined && ask !== undefined && (
				<span className={`${styles.bidAsk} text-gray-500 dark:text-gray-400 font-mono`}>
					{formatBidAsk(bid, ask)}
				</span>
			)}

			{showChange && displayDelta !== undefined && (
				// biome-ignore lint/a11y/useSemanticElements: role="status" is appropriate for price delta
				<span
					className={`${styles.delta} ${
						isPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
					}`}
					role="status"
					aria-label={`Change: ${isPositive ? "up" : "down"} ${Math.abs(displayDelta).toFixed(2)}`}
				>
					{formatDelta(displayDelta, displayDeltaPercent)}
				</span>
			)}

			{variant !== "compact" && showSparkline && sparklineData.length >= 2 && (
				<Sparkline data={sparklineData} width={60} height={20} className="mt-1" />
			)}

			{showTickDots && tickData.length > 0 && (
				<TickDots ticks={tickData} maxDots={8} dotSize={size === "sm" ? 5 : 6} className="mt-0.5" />
			)}
		</div>
	);
});

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

export default PriceTicker;
