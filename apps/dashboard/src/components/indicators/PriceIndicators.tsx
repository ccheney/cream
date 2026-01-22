/**
 * PriceIndicators Widget
 *
 * Display RSI, ATR, MACD, Bollinger, Stochastic, Momentum with visual gauges/meters.
 * Implements "Precision Warmth" design system with living indicators.
 *
 * @see docs/plans/ui/20-design-philosophy.md
 * @see docs/plans/ui/26-data-viz.md
 * @see docs/plans/ui/31-realtime-patterns.md
 */

"use client";

import { memo, useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { PercentBGauge, RSIGauge, StochasticGauge } from "@/components/ui/gauge";
import { Card } from "@/components/ui/surface";
import type { PriceIndicators as PriceIndicatorsData } from "./IndicatorSnapshot";

// ============================================
// Types
// ============================================

export interface PriceIndicatorsProps {
	/** Price indicator data */
	data: PriceIndicatorsData | null;
	/** Current stock price for relative calculations */
	currentPrice?: number | null;
	/** Whether data is loading */
	isLoading?: boolean;
	/** Last update timestamp */
	lastUpdate?: number | null;
	/** Additional CSS classes */
	className?: string;
}

// ============================================
// Utility Functions
// ============================================

/**
 * Format number with specified decimals, return em dash for null
 */
function formatValue(value: number | null, decimals = 2): string {
	if (value === null) {
		return "—";
	}
	return value.toFixed(decimals);
}

/**
 * Format percentage (input as decimal 0-1)
 */
function formatPercent(value: number | null): string {
	if (value === null) {
		return "—";
	}
	return `${(value * 100).toFixed(1)}%`;
}

/**
 * Get MACD histogram color based on value and trend
 */
function _getMACDColor(histogram: number | null, prevHistogram?: number | null): string {
	if (histogram === null) {
		return "bg-stone-300 dark:bg-stone-600";
	}

	// Bullish divergence (positive and increasing)
	if (histogram > 0) {
		if (prevHistogram !== null && prevHistogram !== undefined && histogram > prevHistogram) {
			return "bg-green-500"; // Strong bullish
		}
		return "bg-green-400"; // Weakening bullish
	}

	// Bearish divergence (negative and decreasing)
	if (prevHistogram !== null && prevHistogram !== undefined && histogram < prevHistogram) {
		return "bg-red-500"; // Strong bearish
	}
	return "bg-red-400"; // Weakening bearish
}

/**
 * Get momentum badge variant based on value
 */
function getMomentumVariant(
	value: number | null,
): "success" | "info" | "warning" | "error" | "neutral" {
	if (value === null) {
		return "neutral";
	}
	if (value > 0.1) {
		return "success";
	}
	if (value > 0) {
		return "info";
	}
	if (value > -0.1) {
		return "warning";
	}
	return "error";
}

// ============================================
// Sub-Components
// ============================================

/**
 * Indicator row with label and value
 */
const IndicatorRow = memo(function IndicatorRow({
	label,
	value,
	unit = "",
	highlight = false,
}: {
	label: string;
	value: string;
	unit?: string;
	highlight?: boolean;
}) {
	return (
		<div
			className={`flex items-center justify-between py-1.5 ${
				highlight ? "bg-amber-50/50 dark:bg-amber-900/10 -mx-2 px-2 rounded" : ""
			}`}
		>
			<span className="text-sm text-stone-600 dark:text-stone-400">{label}</span>
			<span className="font-mono text-sm font-medium text-stone-900 dark:text-stone-100">
				{value}
				{unit && <span className="text-stone-500 dark:text-stone-400 text-xs ml-0.5">{unit}</span>}
			</span>
		</div>
	);
});

/**
 * MACD Histogram visual bar
 */
const MACDHistogram = memo(function MACDHistogram({
	value,
	maxValue = 5,
}: {
	value: number | null;
	maxValue?: number;
}) {
	if (value === null) {
		return (
			<div className="h-6 flex items-center justify-center">
				<span className="text-stone-400 text-xs">—</span>
			</div>
		);
	}

	const normalizedValue = Math.min(Math.abs(value) / maxValue, 1) * 100;
	const isPositive = value >= 0;

	return (
		<div className="h-6 flex items-center">
			{/* Negative side */}
			<div className="flex-1 flex justify-end">
				{!isPositive && (
					<div
						className="h-4 bg-red-500 rounded-l transition-all duration-300"
						style={{ width: `${normalizedValue}%` }}
					/>
				)}
			</div>

			{/* Center line */}
			<div className="w-px h-6 bg-stone-300 dark:bg-stone-600 mx-1" />

			{/* Positive side */}
			<div className="flex-1">
				{isPositive && (
					<div
						className="h-4 bg-green-500 rounded-r transition-all duration-300"
						style={{ width: `${normalizedValue}%` }}
					/>
				)}
			</div>
		</div>
	);
});

/**
 * Moving Average section
 */
const MovingAveragesSection = memo(function MovingAveragesSection({
	data,
	currentPrice,
}: {
	data: PriceIndicatorsData;
	currentPrice?: number | null;
}) {
	const smaAbove = useMemo(() => {
		if (!currentPrice) {
			return null;
		}
		return {
			sma20: data.sma_20 !== null && currentPrice > data.sma_20,
			sma50: data.sma_50 !== null && currentPrice > data.sma_50,
			sma200: data.sma_200 !== null && currentPrice > data.sma_200,
		};
	}, [data, currentPrice]);

	return (
		<div className="space-y-1">
			<h4 className="text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wide mb-2">
				Moving Averages
			</h4>
			<div className="grid grid-cols-2 gap-x-4">
				<div className="space-y-0.5">
					<IndicatorRow
						label="SMA(20)"
						value={formatValue(data.sma_20)}
						highlight={smaAbove?.sma20}
					/>
					<IndicatorRow
						label="SMA(50)"
						value={formatValue(data.sma_50)}
						highlight={smaAbove?.sma50}
					/>
					<IndicatorRow
						label="SMA(200)"
						value={formatValue(data.sma_200)}
						highlight={smaAbove?.sma200}
					/>
				</div>
				<div className="space-y-0.5">
					<IndicatorRow label="EMA(9)" value={formatValue(data.ema_9)} />
					<IndicatorRow label="EMA(12)" value={formatValue(data.ema_12)} />
					<IndicatorRow label="EMA(21)" value={formatValue(data.ema_21)} />
				</div>
			</div>
		</div>
	);
});

/**
 * MACD section with histogram visualization
 */
const MACDSection = memo(function MACDSection({ data }: { data: PriceIndicatorsData }) {
	// Determine MACD signal
	const signal = useMemo(() => {
		if (data.macd_line === null || data.macd_signal === null) {
			return null;
		}
		if (data.macd_line > data.macd_signal) {
			return "bullish";
		}
		if (data.macd_line < data.macd_signal) {
			return "bearish";
		}
		return "neutral";
	}, [data.macd_line, data.macd_signal]);

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<h4 className="text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wide">
					MACD
				</h4>
				{signal && (
					<Badge
						variant={signal === "bullish" ? "success" : signal === "bearish" ? "error" : "neutral"}
						size="sm"
					>
						{signal === "bullish" ? "Bullish" : signal === "bearish" ? "Bearish" : "Neutral"}
					</Badge>
				)}
			</div>

			<div className="grid grid-cols-3 gap-2 text-center">
				<div>
					<div className="text-xs text-stone-500 dark:text-stone-400">Line</div>
					<div className="font-mono text-sm font-medium text-stone-900 dark:text-stone-100">
						{formatValue(data.macd_line)}
					</div>
				</div>
				<div>
					<div className="text-xs text-stone-500 dark:text-stone-400">Signal</div>
					<div className="font-mono text-sm font-medium text-stone-900 dark:text-stone-100">
						{formatValue(data.macd_signal)}
					</div>
				</div>
				<div>
					<div className="text-xs text-stone-500 dark:text-stone-400">Histogram</div>
					<div className="font-mono text-sm font-medium text-stone-900 dark:text-stone-100">
						{formatValue(data.macd_histogram)}
					</div>
				</div>
			</div>

			<MACDHistogram value={data.macd_histogram} />
		</div>
	);
});

/**
 * Bollinger Bands section
 */
const BollingerSection = memo(function BollingerSection({
	data,
	currentPrice,
}: {
	data: PriceIndicatorsData;
	currentPrice?: number | null;
}) {
	// Calculate price position within bands
	const pricePosition = useMemo(() => {
		if (!currentPrice || data.bollinger_upper === null || data.bollinger_lower === null) {
			return null;
		}

		const range = data.bollinger_upper - data.bollinger_lower;
		if (range === 0) {
			return 0.5;
		}
		return (currentPrice - data.bollinger_lower) / range;
	}, [currentPrice, data.bollinger_upper, data.bollinger_lower]);

	return (
		<div className="space-y-2">
			<h4 className="text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wide">
				Bollinger Bands
			</h4>

			<div className="flex items-start gap-4">
				{/* %B Gauge */}
				<PercentBGauge value={data.bollinger_percentb} label="%B" size={64} />

				{/* Band values */}
				<div className="flex-1 space-y-0.5">
					<IndicatorRow label="Upper" value={formatValue(data.bollinger_upper)} />
					<IndicatorRow label="Middle" value={formatValue(data.bollinger_middle)} />
					<IndicatorRow label="Lower" value={formatValue(data.bollinger_lower)} />
					<IndicatorRow label="Bandwidth" value={formatPercent(data.bollinger_bandwidth)} />
				</div>
			</div>

			{/* Price position bar */}
			{pricePosition !== null && (
				<div className="relative h-2 bg-stone-200 dark:bg-stone-700 rounded-full overflow-hidden">
					<div
						className="absolute top-0 bottom-0 w-1 bg-amber-500 rounded-full transition-all duration-300"
						style={{ left: `${pricePosition * 100}%`, transform: "translateX(-50%)" }}
					/>
				</div>
			)}
		</div>
	);
});

/**
 * Momentum section
 */
const MomentumSection = memo(function MomentumSection({ data }: { data: PriceIndicatorsData }) {
	return (
		<div className="space-y-2">
			<h4 className="text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wide">
				Momentum
			</h4>

			<div className="grid grid-cols-4 gap-2">
				{[
					{ label: "1M", value: data.momentum_1m },
					{ label: "3M", value: data.momentum_3m },
					{ label: "6M", value: data.momentum_6m },
					{ label: "12M", value: data.momentum_12m },
				].map(({ label, value }) => (
					<div key={label} className="text-center">
						<div className="text-xs text-stone-500 dark:text-stone-400 mb-1">{label}</div>
						<Badge variant={getMomentumVariant(value)} size="sm">
							{value !== null ? `${value > 0 ? "+" : ""}${(value * 100).toFixed(0)}%` : "—"}
						</Badge>
					</div>
				))}
			</div>
		</div>
	);
});

/**
 * Volatility section
 */
const VolatilitySection = memo(function VolatilitySection({ data }: { data: PriceIndicatorsData }) {
	return (
		<div className="space-y-1">
			<h4 className="text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wide mb-2">
				Volatility
			</h4>
			<IndicatorRow label="ATR(14)" value={formatValue(data.atr_14)} />
			<IndicatorRow label="Realized Vol (20d)" value={formatPercent(data.realized_vol_20d)} />
			<IndicatorRow label="Parkinson Vol (20d)" value={formatPercent(data.parkinson_vol_20d)} />
		</div>
	);
});

// ============================================
// Loading Skeleton
// ============================================

function PriceIndicatorsSkeleton() {
	return (
		<Card className="p-4 space-y-4 animate-pulse">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="h-5 w-32 bg-stone-200 dark:bg-stone-700 rounded" />
				<div className="h-4 w-24 bg-stone-200 dark:bg-stone-700 rounded" />
			</div>

			{/* Gauges row */}
			<div className="flex justify-around">
				{[1, 2, 3].map((i) => (
					<div key={i} className="flex flex-col items-center gap-1">
						<div className="w-16 h-10 bg-stone-200 dark:bg-stone-700 rounded" />
						<div className="h-3 w-10 bg-stone-200 dark:bg-stone-700 rounded" />
					</div>
				))}
			</div>

			{/* Sections */}
			{[1, 2, 3].map((i) => (
				<div key={i} className="space-y-2">
					<div className="h-3 w-24 bg-stone-200 dark:bg-stone-700 rounded" />
					<div className="space-y-1">
						{[1, 2, 3].map((j) => (
							<div key={j} className="flex justify-between">
								<div className="h-4 w-16 bg-stone-200 dark:bg-stone-700 rounded" />
								<div className="h-4 w-12 bg-stone-200 dark:bg-stone-700 rounded" />
							</div>
						))}
					</div>
				</div>
			))}
		</Card>
	);
}

// ============================================
// Main Component
// ============================================

/**
 * PriceIndicators widget displays technical price indicators with visual gauges.
 *
 * Features:
 * - RSI, Stochastic, %B gauges with zone coloring
 * - MACD histogram visualization
 * - Moving average comparison
 * - Momentum badges
 * - Volatility metrics
 *
 * @example
 * ```tsx
 * <PriceIndicators
 *   data={snapshot.price}
 *   currentPrice={185.50}
 * />
 * ```
 */
export const PriceIndicators = memo(function PriceIndicators({
	data,
	currentPrice,
	isLoading = false,
	lastUpdate,
	className = "",
}: PriceIndicatorsProps) {
	if (isLoading) {
		return <PriceIndicatorsSkeleton />;
	}

	if (!data) {
		return (
			<Card className={`p-4 ${className}`}>
				<div className="text-center text-stone-500 dark:text-stone-400 py-8">
					No price indicator data available
				</div>
			</Card>
		);
	}

	return (
		<Card className={`p-4 ${className}`}>
			{/* Header */}
			<div className="flex items-center justify-between mb-4">
				<h3 className="text-base font-semibold text-stone-900 dark:text-stone-100">
					Price Indicators
				</h3>
				{lastUpdate && (
					<span className="text-xs text-stone-500 dark:text-stone-400">
						{new Date(lastUpdate).toLocaleTimeString()}
					</span>
				)}
			</div>

			{/* Primary Gauges Row */}
			<div className="flex justify-around items-start pb-4 border-b border-stone-200 dark:border-stone-700">
				<RSIGauge value={data.rsi_14} label="RSI(14)" size={72} />
				<StochasticGauge value={data.stochastic_k} label="%K" size={72} />
				<StochasticGauge value={data.stochastic_d} label="%D" size={72} />
			</div>

			{/* Indicator Sections */}
			<div className="space-y-4 pt-4">
				<MACDSection data={data} />

				<div className="border-t border-stone-200 dark:border-stone-700 pt-4">
					<BollingerSection data={data} currentPrice={currentPrice} />
				</div>

				<div className="border-t border-stone-200 dark:border-stone-700 pt-4">
					<MovingAveragesSection data={data} currentPrice={currentPrice} />
				</div>

				<div className="border-t border-stone-200 dark:border-stone-700 pt-4">
					<MomentumSection data={data} />
				</div>

				<div className="border-t border-stone-200 dark:border-stone-700 pt-4">
					<VolatilitySection data={data} />
				</div>
			</div>
		</Card>
	);
});

// ============================================
// Exports
// ============================================

export default PriceIndicators;
