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
import type { MouseEvent } from "react";
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

interface TickerRowState {
	direction: "up" | "down";
	price: number;
	absChange: string;
	isUp: boolean;
	flashClasses: string;
}

// ============================================
// Helpers
// ============================================

function calculateFlashClasses(isFlashing: boolean, direction: "up" | "down" | null) {
	if (!isFlashing || direction === null) {
		return "";
	}
	return direction === "up" ? "animate-flash-profit" : "animate-flash-loss";
}

function buildTickerState({
	quote,
	flash,
}: {
	quote: Quote | undefined;
	flash: {
		isFlashing: boolean;
		direction: "up" | "down" | null;
	};
}): TickerRowState {
	const price = quote?.last ?? 0;
	const changePercent = quote?.changePercent ?? 0;
	const isUp = changePercent >= 0;

	return {
		direction: isUp ? "up" : "down",
		price,
		absChange: Math.abs(changePercent).toFixed(2),
		isUp,
		flashClasses: calculateFlashClasses(flash.isFlashing, flash.direction),
	};
}

function TickerItemHeader({
	symbol,
	price,
	direction,
	absChange,
	isUp,
}: {
	symbol: string;
	price: number;
	direction: string;
	absChange: string;
	isUp: boolean;
}) {
	return (
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
				className={`text-xs font-medium ${isUp ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
			>
				{direction}
				{isUp ? "+" : ""}
				{absChange}%
			</span>
		</div>
	);
}

function TickerItemSpread({ quote }: { quote: Quote | undefined }) {
	if (!quote || quote.bid === undefined || quote.ask === undefined) {
		return null;
	}

	return (
		<div className="text-xs text-stone-500 dark:text-night-300 font-mono whitespace-nowrap">
			{quote.bid.toFixed(2)} × {quote.ask.toFixed(2)}
		</div>
	);
}

function TickerItemVisualizations({
	tickHistory,
	priceHistory,
	showTickHistory,
	showSparkline,
}: {
	tickHistory: TickDirection[];
	priceHistory: number[];
	showTickHistory: boolean;
	showSparkline: boolean;
}) {
	if (!showTickHistory && !showSparkline) {
		return null;
	}

	return (
		<div className="flex items-center gap-2 h-4">
			{showTickHistory && tickHistory.length > 0 && (
				<TickDots ticks={tickHistory} maxDots={8} dotSize={5} />
			)}
			{showSparkline && priceHistory.length >= 2 && (
				<Sparkline data={priceHistory} width={40} height={14} strokeWidth={1} />
			)}
		</div>
	);
}

function TickerItemRemoveButton({
	symbol,
	onRemove,
}: {
	symbol: string;
	onRemove?: (symbol: string) => void;
}) {
	if (!onRemove) {
		return null;
	}

	const handleRemove = (event: MouseEvent<HTMLButtonElement>) => {
		event.stopPropagation();
		onRemove(symbol);
	};

	return (
		<button
			type="button"
			onClick={handleRemove}
			className="absolute -top-1 -right-1 p-0.5 bg-stone-500 dark:bg-night-400 rounded-full opacity-0 group-hover:opacity-100 hover:bg-stone-600 dark:hover:bg-night-300 transition-opacity duration-150"
			aria-label={`Remove ${symbol}`}
		>
			<X className="w-3 h-3 text-white dark:text-night-900" />
		</button>
	);
}

function TickerItemInner({
	symbol,
	quote,
	previousPrice,
	tickHistory,
	priceHistory,
	showSparkline,
	showTickHistory,
	isStaleOverride,
	onClick,
	onRemove,
	showRemove,
	testId,
}: {
	symbol: string;
	quote: Quote | undefined;
	previousPrice: number | undefined;
	tickHistory: TickDirection[];
	priceHistory: number[];
	showSparkline: boolean;
	showTickHistory: boolean;
	isStaleOverride: boolean | undefined;
	onClick?: (symbol: string) => void;
	onRemove?: (symbol: string) => void;
	showRemove: boolean;
	testId?: string;
}) {
	const { flash } = usePriceFlash(quote?.last ?? 0, previousPrice);
	const { stale, markUpdated } = useStaleData(quote?.timestamp);

	useEffect(() => {
		if (quote?.timestamp) {
			markUpdated();
		}
	}, [quote?.timestamp, markUpdated]);

	const state = buildTickerState({
		quote,
		flash,
	});
	const isStale = isStaleOverride ?? stale.showIndicator;
	const directionLabel = state.direction === "up" ? "↑" : "↓";
	const flashClass = isStale ? "" : state.flashClasses;

	const handleClick = () => {
		onClick?.(symbol);
	};

	return (
		<div
			className={`group relative flex flex-col gap-0.5 px-3 py-2 border-r border-cream-200 dark:border-night-700 cursor-pointer hover:bg-cream-50 dark:hover:bg-night-800 transition-colors duration-150 ${flashClass}`}
			style={{ opacity: isStale ? 0.6 : 1, transition: "opacity 300ms ease-in-out" }}
		>
			{showRemove && <TickerItemRemoveButton symbol={symbol} onRemove={onRemove} />}

			<button
				type="button"
				onClick={handleClick}
				className="text-left"
				aria-label={`${symbol} at $${state.price.toFixed(2)}, ${directionLabel} ${state.absChange}%`}
				data-testid={testId}
			>
				<TickerItemHeader
					symbol={symbol}
					price={state.price}
					direction={directionLabel}
					absChange={state.absChange}
					isUp={state.isUp}
				/>
				<TickerItemSpread quote={quote} />
				<TickerItemVisualizations
					tickHistory={tickHistory}
					priceHistory={priceHistory}
					showTickHistory={showTickHistory}
					showSparkline={showSparkline}
				/>
			</button>
		</div>
	);
}

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
	return (
		<TickerItemInner
			symbol={symbol}
			quote={quote}
			previousPrice={previousPrice}
			tickHistory={tickHistory}
			priceHistory={priceHistory}
			showSparkline={showSparkline}
			showTickHistory={showTickHistory}
			isStaleOverride={isStaleOverride}
			onClick={onClick}
			onRemove={onRemove}
			showRemove={showRemove}
			testId={testId}
		/>
	);
});

export default TickerItem;
