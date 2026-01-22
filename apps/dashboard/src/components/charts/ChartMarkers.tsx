/**
 * Chart Markers Component
 *
 * TradingView chart wrapper with trade markers, price lines, and
 * interactive trade detail popover.
 *
 * @see docs/plans/ui/26-data-viz.md (Trade Markers section, lines 59-86)
 * @see docs/plans/ui/03-views.md (Position Detail View, line 435)
 */

"use client";

import { formatDistanceToNow } from "date-fns";
import type { IChartApi, Time } from "lightweight-charts";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useChartAnnotations } from "@/hooks/use-chart-annotations";
import type { Trade } from "@/lib/api/types";
import type { OHLCVData, PriceLineConfig, TradeMarker } from "@/lib/chart-config";
import { TradingViewChart } from "./TradingViewChart";

// ============================================
// Types
// ============================================

export interface ChartMarkersProps {
	/** OHLCV candlestick data */
	data: OHLCVData[];

	/** Trades to display as markers */
	trades?: Trade[];

	/** Additional markers (beyond trades) */
	extraMarkers?: TradeMarker[];

	/** Stop-loss price line */
	stopLoss?: number;

	/** Take-profit price line */
	takeProfit?: number;

	/** Additional price lines */
	extraPriceLines?: PriceLineConfig[];

	/** Chart height in pixels */
	height?: number;

	/** Enable trade detail popover (default: true) */
	showTradeDetails?: boolean;

	/** Callback when a trade marker is clicked */
	onTradeClick?: (trade: Trade) => void;

	/** Callback when crosshair moves */
	onCrosshairMove?: (price: number | null, time: Time | null) => void;

	/** Additional CSS class */
	className?: string;
}

interface PopoverState {
	isOpen: boolean;
	trade: Trade | null;
	position: { x: number; y: number };
}

// ============================================
// Trade Detail Popover
// ============================================

interface TradePopoverProps {
	trade: Trade;
	position: { x: number; y: number };
	onClose: () => void;
}

function TradePopover({ trade, position, onClose }: TradePopoverProps) {
	const popoverRef = useRef<HTMLDivElement>(null);

	// Close on click outside
	useEffect(() => {
		function handleClickOutside(e: MouseEvent) {
			if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
				onClose();
			}
		}

		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [onClose]);

	// Close on escape
	useEffect(() => {
		function handleEscape(e: KeyboardEvent) {
			if (e.key === "Escape") {
				onClose();
			}
		}

		document.addEventListener("keydown", handleEscape);
		return () => document.removeEventListener("keydown", handleEscape);
	}, [onClose]);

	const isBuy = trade.side === "BUY";

	return (
		<div
			ref={popoverRef}
			role="dialog"
			aria-label={`${trade.side} trade details`}
			className="fixed z-50 min-w-[200px] p-3 bg-white dark:bg-night-800 rounded-lg shadow-lg border border-cream-200 dark:border-night-700 animate-in fade-in-0 zoom-in-95 duration-150"
			style={{
				top: position.y,
				left: position.x,
				transform: "translate(-50%, -100%) translateY(-8px)",
			}}
		>
			{/* Header */}
			<div className="flex items-center justify-between mb-2">
				<div className="flex items-center gap-2">
					<span className="font-mono font-semibold text-stone-900 dark:text-night-50">
						{trade.symbol}
					</span>
					<span
						className={`px-1.5 py-0.5 text-xs font-medium rounded ${
							isBuy
								? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
								: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
						}`}
					>
						{trade.side}
					</span>
				</div>
				<button
					type="button"
					onClick={onClose}
					className="p-1 text-stone-400 dark:text-night-400 hover:text-stone-600 dark:text-night-200 dark:hover:text-night-200"
					aria-label="Close trade details"
				>
					<svg
						className="w-4 h-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						aria-hidden="true"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</button>
			</div>

			{/* Trade details */}
			<div className="space-y-1.5 text-sm">
				<div className="flex justify-between">
					<span className="text-stone-500 dark:text-night-300">Quantity</span>
					<span className="font-mono text-stone-900 dark:text-night-50">{trade.qty}</span>
				</div>
				<div className="flex justify-between">
					<span className="text-stone-500 dark:text-night-300">Price</span>
					<span className="font-mono text-stone-900 dark:text-night-50">
						${trade.price.toFixed(2)}
					</span>
				</div>
				<div className="flex justify-between">
					<span className="text-stone-500 dark:text-night-300">Value</span>
					<span className="font-mono text-stone-900 dark:text-night-50">
						${(trade.price * trade.qty).toFixed(2)}
					</span>
				</div>
				{trade.pnl !== null && (
					<div className="flex justify-between">
						<span className="text-stone-500 dark:text-night-300">P&L</span>
						<span
							className={`font-mono font-medium ${
								trade.pnl >= 0 ? "text-green-600" : "text-red-600"
							}`}
						>
							{trade.pnl >= 0 ? "+" : ""}${trade.pnl.toFixed(2)}
						</span>
					</div>
				)}
			</div>

			{/* Timestamp */}
			<div className="mt-2 pt-2 border-t border-cream-100 dark:border-night-700 text-xs text-stone-400 dark:text-night-400">
				{formatDistanceToNow(new Date(trade.timestamp), { addSuffix: true })}
			</div>

			{/* Arrow */}
			<div
				className="absolute w-3 h-3 bg-white dark:bg-night-800 rotate-45 border-b border-r border-cream-200 dark:border-night-700 left-1/2 -translate-x-1/2 bottom-[-6px]"
				aria-hidden="true"
			/>
		</div>
	);
}

// ============================================
// Chart Markers Component
// ============================================

function ChartMarkersComponent({
	data,
	trades = [],
	extraMarkers = [],
	stopLoss,
	takeProfit,
	extraPriceLines = [],
	height = 400,
	showTradeDetails = true,
	onTradeClick,
	onCrosshairMove,
	className,
}: ChartMarkersProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const chartRef = useRef<IChartApi | null>(null);
	const [popover, setPopover] = useState<PopoverState>({
		isOpen: false,
		trade: null,
		position: { x: 0, y: 0 },
	});

	// Convert trades to annotations
	const {
		markers: tradeMarkers,
		priceLines: tradePriceLines,
		getAnnotation,
	} = useChartAnnotations({
		trades,
		stopLoss,
		takeProfit,
	});

	// Combine markers and price lines
	const allMarkers = [...tradeMarkers, ...extraMarkers];
	const allPriceLines = [...tradePriceLines, ...extraPriceLines];

	// Handle chart ready
	const handleChartReady = useCallback((chart: IChartApi) => {
		chartRef.current = chart;
	}, []);

	// Handle crosshair move to detect marker clicks
	const handleCrosshairMove = useCallback(
		(price: number | null, time: Time | null) => {
			onCrosshairMove?.(price, time);
		},
		[onCrosshairMove],
	);

	// Handle click on chart to detect marker clicks
	useEffect(() => {
		const container = containerRef.current;
		if (!container || !showTradeDetails || trades.length === 0) {
			return;
		}

		function handleClick(e: MouseEvent) {
			const chart = chartRef.current;
			if (!chart) {
				return;
			}

			// Get time from click position
			const rect = container?.getBoundingClientRect();
			if (!rect) {
				return;
			}
			const x = e.clientX - rect.left;

			const timeScale = chart.timeScale();
			const time = timeScale.coordinateToTime(x);

			if (time) {
				// Convert Time to string for lookup
				// Time can be string, number, or BusinessDay object
				const timeStr =
					typeof time === "object"
						? `${time.year}-${String(time.month).padStart(2, "0")}-${String(time.day).padStart(2, "0")}`
						: time;

				// Check if we clicked near a trade marker
				const annotation = getAnnotation(timeStr);
				if (annotation) {
					// Open popover
					setPopover({
						isOpen: true,
						trade: annotation.trade,
						position: { x: e.clientX, y: e.clientY },
					});

					// Trigger callback
					onTradeClick?.(annotation.trade);
				}
			}
		}

		container.addEventListener("click", handleClick);
		return () => container.removeEventListener("click", handleClick);
	}, [showTradeDetails, trades.length, getAnnotation, onTradeClick]);

	// Close popover
	const closePopover = useCallback(() => {
		setPopover((prev) => ({ ...prev, isOpen: false }));
	}, []);

	return (
		<div ref={containerRef} className={`relative ${className ?? ""}`}>
			<TradingViewChart
				data={data}
				markers={allMarkers}
				priceLines={allPriceLines}
				height={height}
				onReady={handleChartReady}
				onCrosshairMove={handleCrosshairMove}
			/>

			{/* Trade detail popover */}
			{popover.isOpen && popover.trade && (
				<TradePopover trade={popover.trade} position={popover.position} onClose={closePopover} />
			)}

			{/* Legend */}
			{(stopLoss !== undefined || takeProfit !== undefined) && (
				<div className="absolute top-2 right-2 flex items-center gap-4 text-xs">
					{stopLoss !== undefined && (
						<div className="flex items-center gap-1">
							<span
								className="w-4 h-0.5"
								style={{
									backgroundColor: "rgba(239, 68, 68, 0.5)",
									borderStyle: "dashed",
								}}
							/>
							<span className="text-stone-500 dark:text-night-300">
								Stop ${stopLoss.toFixed(2)}
							</span>
						</div>
					)}
					{takeProfit !== undefined && (
						<div className="flex items-center gap-1">
							<span
								className="w-4 h-0.5"
								style={{
									backgroundColor: "rgba(34, 197, 94, 0.5)",
									borderStyle: "dashed",
								}}
							/>
							<span className="text-stone-500 dark:text-night-300">
								Target ${takeProfit.toFixed(2)}
							</span>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

// ============================================
// Export
// ============================================

export const ChartMarkers = memo(ChartMarkersComponent);

export default ChartMarkers;

// ============================================
// Sample Data
// ============================================

export const SAMPLE_TRADES: Trade[] = [
	{
		id: "trade-1",
		timestamp: "2026-01-02",
		symbol: "AAPL",
		side: "BUY",
		qty: 100,
		price: 147.0,
		pnl: null,
	},
	{
		id: "trade-2",
		timestamp: "2026-01-05",
		symbol: "AAPL",
		side: "SELL",
		qty: 100,
		price: 150.5,
		pnl: 350,
	},
];
