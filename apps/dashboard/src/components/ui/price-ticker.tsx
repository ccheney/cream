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

import { memo, useEffect } from "react";
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

interface ResolvedDelta {
	displayDelta: number | undefined;
	displayDeltaPercent: number | undefined;
	isPositive: boolean;
}

function resolveDelta(
	price: number,
	previousPrice: number | undefined,
	delta: number | undefined,
	deltaPercent: number | undefined,
): ResolvedDelta {
	const displayDelta = delta ?? (previousPrice !== undefined ? price - previousPrice : undefined);
	const displayDeltaPercent =
		deltaPercent ??
		(previousPrice !== undefined && previousPrice !== 0
			? ((price - previousPrice) / previousPrice) * 100
			: undefined);
	return {
		displayDelta,
		displayDeltaPercent,
		isPositive: displayDelta !== undefined ? displayDelta >= 0 : true,
	};
}

function getFlashClasses(flash: ReturnType<typeof usePriceFlash>["flash"]): string {
	if (!flash.isFlashing) {
		return "";
	}
	return flash.direction === "up" ? "animate-flash-profit" : "animate-flash-loss";
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

function StaleIndicator({ secondsSinceUpdate }: { secondsSinceUpdate: number }) {
	return (
		<output
			className="ml-1 text-gray-400"
			title={`Last updated ${secondsSinceUpdate}s ago`}
			aria-label={`Data is ${secondsSinceUpdate} seconds old`}
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
		</output>
	);
}

function BidAskValue({
	showBidAsk,
	bid,
	ask,
	className,
}: {
	showBidAsk: boolean;
	bid: number | undefined;
	ask: number | undefined;
	className: string;
}) {
	if (!showBidAsk || bid === undefined || ask === undefined) {
		return null;
	}
	return <span className={className}>{formatBidAsk(bid, ask)}</span>;
}

function ChangeValue({
	showChange,
	displayDelta,
	displayDeltaPercent,
	isPositive,
	className,
}: {
	showChange: boolean;
	displayDelta: number | undefined;
	displayDeltaPercent: number | undefined;
	isPositive: boolean;
	className: string;
}) {
	if (!showChange || displayDelta === undefined) {
		return null;
	}
	return (
		<output
			className={className}
			aria-label={`Change: ${isPositive ? "up" : "down"} ${Math.abs(displayDelta).toFixed(2)}`}
		>
			{formatDelta(displayDelta, displayDeltaPercent)}
		</output>
	);
}

function SparklineValue({
	variant,
	showSparkline,
	sparklineData,
}: {
	variant: PriceTickerProps["variant"];
	showSparkline: boolean;
	sparklineData: number[];
}) {
	if (!showSparkline || sparklineData.length < 2) {
		return null;
	}
	if (variant === "compact") {
		return <Sparkline data={sparklineData} width={50} height={16} strokeWidth={1} />;
	}
	return <Sparkline data={sparklineData} width={60} height={20} className="mt-1" />;
}

function TickDotsValue({
	showTickDots,
	tickData,
	size,
}: {
	showTickDots: boolean;
	tickData: TickDirection[];
	size: PriceTickerProps["size"];
}) {
	if (!showTickDots || tickData.length === 0) {
		return null;
	}
	return (
		<TickDots ticks={tickData} maxDots={8} dotSize={size === "sm" ? 5 : 6} className="mt-0.5" />
	);
}

function PriceValue({
	price,
	flashClasses,
	isPositive,
	stale,
	variant,
	showSparkline,
	sparklineData,
	styleClass,
}: {
	price: number;
	flashClasses: string;
	isPositive: boolean;
	stale: ReturnType<typeof useStaleData>["stale"];
	variant: PriceTickerProps["variant"];
	showSparkline: boolean;
	sparklineData: number[];
	styleClass: string;
}) {
	return (
		<div
			className={`${styleClass} ${flashClasses} rounded px-1 -mx-1 flex items-center gap-2`}
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
			{stale.showIndicator && <StaleIndicator secondsSinceUpdate={stale.secondsSinceUpdate} />}
			{variant === "compact" && (
				<SparklineValue
					variant={variant}
					showSparkline={showSparkline}
					sparklineData={sparklineData}
				/>
			)}
		</div>
	);
}

function PriceTickerContent({
	symbol,
	showSymbol,
	stale,
	styles,
	variantStyle,
	className,
	testId,
	price,
	flashClasses,
	isPositive,
	variant,
	showSparkline,
	sparklineData,
	showBidAsk,
	bid,
	ask,
	showChange,
	displayDelta,
	displayDeltaPercent,
	showTickDots,
	tickData,
	size,
}: {
	symbol: string;
	showSymbol: boolean;
	stale: ReturnType<typeof useStaleData>["stale"];
	styles: (typeof sizeStyles)[keyof typeof sizeStyles];
	variantStyle: (typeof variantStyles)[keyof typeof variantStyles];
	className: string;
	testId: string | undefined;
	price: number;
	flashClasses: string;
	isPositive: boolean;
	variant: PriceTickerProps["variant"];
	showSparkline: boolean;
	sparklineData: number[];
	showBidAsk: boolean;
	bid: number | undefined;
	ask: number | undefined;
	showChange: boolean;
	displayDelta: number | undefined;
	displayDeltaPercent: number | undefined;
	showTickDots: boolean;
	tickData: TickDirection[];
	size: PriceTickerProps["size"];
}) {
	return (
		<div
			className={`inline-flex ${variantStyle.layout} ${variantStyle.gap} ${styles.container} ${className}`}
			style={{ opacity: stale.opacity, transition: "opacity 300ms ease-in-out" }}
			data-testid={testId}
		>
			{showSymbol && (
				<span className={`${styles.symbol} text-gray-500 dark:text-gray-400`}>{symbol}</span>
			)}
			<PriceValue
				price={price}
				flashClasses={flashClasses}
				isPositive={isPositive}
				stale={stale}
				variant={variant}
				showSparkline={showSparkline}
				sparklineData={sparklineData}
				styleClass={styles.price}
			/>
			<BidAskValue
				showBidAsk={showBidAsk}
				bid={bid}
				ask={ask}
				className={`${styles.bidAsk} text-gray-500 dark:text-gray-400 font-mono`}
			/>
			<ChangeValue
				showChange={showChange}
				displayDelta={displayDelta}
				displayDeltaPercent={displayDeltaPercent}
				isPositive={isPositive}
				className={`${styles.delta} ${
					isPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
				}`}
			/>
			{variant !== "compact" && (
				<SparklineValue
					variant={variant}
					showSparkline={showSparkline}
					sparklineData={sparklineData}
				/>
			)}
			<TickDotsValue showTickDots={showTickDots} tickData={tickData} size={size} />
		</div>
	);
}

function resolveTickerInputs(props: PriceTickerProps) {
	const showSparkline = props.showSparkline ?? false;
	const showTickDots = props.showTickDots ?? false;
	return {
		symbol: props.symbol,
		price: props.price,
		previousPrice: props.previousPrice,
		delta: props.delta,
		deltaPercent: props.deltaPercent,
		showSymbol: props.showSymbol ?? true,
		showBidAsk: props.showBidAsk ?? false,
		bid: props.bid,
		ask: props.ask,
		showChange: props.showChange ?? true,
		showSparkline,
		showTickDots,
		className: props.className ?? "",
		size: props.size ?? "md",
		variant: props.variant ?? "default",
		testId: props["data-testid"],
		sparklineData: showSparkline ? (props.priceHistory?.slice(-20) ?? []) : [],
		tickData: showTickDots ? (props.tickHistory ?? []) : [],
		lastUpdatedAt: props.lastUpdatedAt,
	};
}

function usePriceTickerModel(props: PriceTickerProps) {
	const resolved = resolveTickerInputs(props);
	const { flash } = usePriceFlash(resolved.price, resolved.previousPrice);
	const { stale, markUpdated } = useStaleData(props.lastUpdatedAt);

	useEffect(() => {
		if (resolved.price !== resolved.previousPrice) {
			markUpdated();
		}
	}, [resolved.price, resolved.previousPrice, markUpdated]);

	const { displayDelta, displayDeltaPercent, isPositive } = resolveDelta(
		resolved.price,
		resolved.previousPrice,
		resolved.delta,
		resolved.deltaPercent,
	);

	return {
		...resolved,
		stale,
		styles: sizeStyles[resolved.size],
		variantStyle: variantStyles[resolved.variant],
		flashClasses: getFlashClasses(flash),
		isPositive,
		displayDelta,
		displayDeltaPercent,
	};
}

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
export const PriceTicker = memo(function PriceTicker(props: PriceTickerProps) {
	const model = usePriceTickerModel(props);
	return <PriceTickerContent {...model} />;
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
