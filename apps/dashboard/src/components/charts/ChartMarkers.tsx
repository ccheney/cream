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
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type TradeAnnotation, useChartAnnotations } from "@/hooks/use-chart-annotations";
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

type TradePopoverState = {
	isOpen: boolean;
	trade: Trade | null;
	position: { x: number; y: number };
};

interface TradePopoverProps {
	trade: Trade;
	position: { x: number; y: number };
	onClose: () => void;
}

interface TradeInfoRowProps {
	label: string;
	value: string;
	valueClass?: string;
}

interface TradePopoverBodyProps {
	trade: Trade;
	pnlLabel: string | null;
}

interface TradePopoverHeaderProps {
	trade: Trade;
	onClose: () => void;
}

// ============================================
// Utility Functions
// ============================================

function getTradeTimeKey(time: Time | string | number): string {
	if (typeof time === "object") {
		return `${time.year}-${String(time.month).padStart(2, "0")}-${String(time.day).padStart(2, "0")}`;
	}

	return String(time);
}

function getPnlLabel(trade: Trade): string | null {
	if (trade.pnl == null) {
		return null;
	}
	return `${trade.pnl >= 0 ? "+" : ""}$${trade.pnl.toFixed(2)}`;
}

function parseTradeTradeTime(tradeTimeKey: Time | string | number): string {
	return getTradeTimeKey(tradeTimeKey);
}

// ============================================
// Event Helpers
// ============================================

function getTradeFromClick({
	event,
	container,
	chartRef,
	getAnnotation,
}: {
	event: MouseEvent;
	container: HTMLDivElement | null;
	chartRef: React.RefObject<IChartApi | null>;
	getAnnotation: (time: number | string) => TradeAnnotation | undefined;
}): Trade | null {
	const chart = chartRef.current;
	if (!chart || !container) {
		return null;
	}

	const rect = container.getBoundingClientRect();
	const x = event.clientX - rect.left;
	const time = chart.timeScale().coordinateToTime(x);

	if (!time) {
		return null;
	}

	return getAnnotation(parseTradeTradeTime(time))?.trade ?? null;
}

function useTradeAnnotationClick({
	showTradeDetails,
	containerRef,
	chartRef,
	trades,
	getAnnotation,
	onTradeClick,
}: {
	showTradeDetails: boolean;
	containerRef: React.RefObject<HTMLDivElement | null>;
	chartRef: React.RefObject<IChartApi | null>;
	trades: Trade[];
	getAnnotation: (time: number | string) => TradeAnnotation | undefined;
	onTradeClick?: (trade: Trade) => void;
}) {
	const [popover, setPopover] = useState<TradePopoverState>({
		isOpen: false,
		trade: null,
		position: { x: 0, y: 0 },
	});

	const closePopover = useCallback(() => {
		setPopover((prev) => ({ ...prev, isOpen: false }));
	}, []);

	useEffect(() => {
		const container = containerRef.current;
		if (!container || !showTradeDetails || trades.length === 0) {
			return;
		}

		const handleClick = (event: MouseEvent) => {
			const trade = getTradeFromClick({ event, container, chartRef, getAnnotation });
			if (!trade) {
				return;
			}

			onTradeClick?.(trade);
			setPopover({
				isOpen: true,
				trade,
				position: { x: event.clientX, y: event.clientY },
			});
		};

		container.addEventListener("click", handleClick);
		return () => container.removeEventListener("click", handleClick);
	}, [chartRef, containerRef, getAnnotation, onTradeClick, showTradeDetails, trades.length]);

	return { popover, closePopover };
}

// ============================================
// Trade Popover
// ============================================

function TradeInfoRow({
	label,
	value,
	valueClass = "text-stone-900 dark:text-night-50",
}: TradeInfoRowProps) {
	return (
		<div className="flex justify-between">
			<span className="text-stone-500 dark:text-night-300">{label}</span>
			<span className={valueClass}>{value}</span>
		</div>
	);
}

const TradePopoverBody = memo(function TradePopoverBody({
	trade,
	pnlLabel,
}: TradePopoverBodyProps) {
	return (
		<div className="space-y-1.5 text-sm">
			<TradeInfoRow label="Quantity" value={trade.qty.toString()} />
			<TradeInfoRow label="Price" value={`$${trade.price.toFixed(2)}`} />
			<TradeInfoRow label="Value" value={`$${(trade.price * trade.qty).toFixed(2)}`} />
			{pnlLabel ? (
				<TradeInfoRow
					label="P&L"
					value={pnlLabel}
					valueClass="font-medium text-stone-900 dark:text-night-50"
				/>
			) : null}
		</div>
	);
});

const TradePopoverFooter = memo(function TradePopoverFooter({ trade }: { trade: Trade }) {
	return (
		<div className="mt-2 pt-2 border-t border-cream-100 dark:border-night-700 text-xs text-stone-400 dark:text-night-400">
			{formatDistanceToNow(new Date(trade.timestamp), { addSuffix: true })}
		</div>
	);
});

function TradePopoverHeader({ trade, onClose }: TradePopoverHeaderProps) {
	const badgeClass =
		trade.side === "BUY"
			? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
			: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";

	return (
		<div className="flex items-center justify-between mb-2">
			<div className="flex items-center gap-2">
				<span className="font-mono font-semibold text-stone-900 dark:text-night-50">
					{trade.symbol}
				</span>
				<span className={`px-1.5 py-0.5 text-xs font-medium rounded ${badgeClass}`}>
					{trade.side}
				</span>
			</div>
			<button
				type="button"
				onClick={onClose}
				className="p-1 text-stone-400 dark:text-night-400 hover:text-stone-600 dark:hover:text-night-200"
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
	);
}

function TradePopoverArrow() {
	return (
		<div
			className="absolute w-3 h-3 bg-white dark:bg-night-800 rotate-45 border-b border-r border-cream-200 dark:border-night-700 left-1/2 -translate-x-1/2 bottom-[-6px]"
			aria-hidden="true"
		/>
	);
}

function TradePopover({ trade, position, onClose }: TradePopoverProps) {
	const popoverRef = useRef<HTMLDivElement>(null);
	const pnlLabel = useMemo(() => getPnlLabel(trade), [trade]);

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
				onClose();
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [onClose]);

	useEffect(() => {
		const handleEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				onClose();
			}
		};

		document.addEventListener("keydown", handleEscape);
		return () => document.removeEventListener("keydown", handleEscape);
	}, [onClose]);

	return (
		<div
			ref={popoverRef}
			tabIndex={-1}
			role="dialog"
			aria-label={`${trade.side} trade details`}
			className="fixed z-50"
			style={{ top: position.y, left: position.x }}
		>
			<div className="min-w-[200px] p-3 bg-white dark:bg-night-800 rounded-lg shadow-lg border border-cream-200 dark:border-night-700 animate-in fade-in-0 zoom-in-95 duration-150">
				<TradePopoverHeader trade={trade} onClose={onClose} />
				<TradePopoverBody trade={trade} pnlLabel={pnlLabel} />
				<TradePopoverFooter trade={trade} />
				<TradePopoverArrow />
			</div>
		</div>
	);
}

function ChartLegend({ stopLoss, takeProfit }: { stopLoss?: number; takeProfit?: number }) {
	if (stopLoss === undefined && takeProfit === undefined) {
		return null;
	}

	return (
		<div className="absolute top-2 right-2 flex items-center gap-4 text-xs">
			{stopLoss === undefined ? null : (
				<div className="flex items-center gap-1">
					<span
						className="w-4 h-0.5"
						style={{ backgroundColor: "rgba(239, 68, 68, 0.5)", borderStyle: "dashed" }}
					/>
					<span className="text-stone-500 dark:text-night-300">Stop ${stopLoss.toFixed(2)}</span>
				</div>
			)}

			{takeProfit === undefined ? null : (
				<div className="flex items-center gap-1">
					<span
						className="w-4 h-0.5"
						style={{ backgroundColor: "rgba(34, 197, 94, 0.5)", borderStyle: "dashed" }}
					/>
					<span className="text-stone-500 dark:text-night-300">
						Target ${takeProfit.toFixed(2)}
					</span>
				</div>
			)}
		</div>
	);
}

function ChartMarkersCanvas({
	data,
	extraMarkers,
	trades,
	extraPriceLines,
	takeProfit,
	stopLoss,
	height,
	onCrosshairMove,
	onTradeClick,
	showTradeDetails,
	className,
}: ChartMarkersProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const chartRef = useRef<IChartApi | null>(null);
	const {
		markers: tradeMarkers,
		priceLines: tradePriceLines,
		getAnnotation,
	} = useChartAnnotations({
		trades: trades ?? [],
		takeProfit,
		stopLoss,
	});

	const allMarkers = useMemo(
		() => [...tradeMarkers, ...(extraMarkers ?? [])],
		[extraMarkers, tradeMarkers],
	);
	const allPriceLines = useMemo(
		() => [...tradePriceLines, ...(extraPriceLines ?? [])],
		[extraPriceLines, tradePriceLines],
	);

	const handleChartReady = useCallback((chart: IChartApi) => {
		chartRef.current = chart;
	}, []);

	const { popover, closePopover } = useTradeAnnotationClick({
		showTradeDetails: showTradeDetails ?? false,
		containerRef,
		chartRef,
		trades: trades ?? [],
		getAnnotation,
		onTradeClick,
	});

	const chartProps = useMemo(
		() => ({
			onCrosshairMove,
			onReady: handleChartReady,
			data,
			markers: allMarkers,
			priceLines: allPriceLines,
			height,
		}),
		[allMarkers, allPriceLines, data, handleChartReady, height, onCrosshairMove],
	);

	return (
		<div ref={containerRef} className={`relative ${className ?? ""}`}>
			<TradingViewChart {...chartProps} />

			{popover.isOpen && popover.trade && (
				<TradePopover trade={popover.trade} position={popover.position} onClose={closePopover} />
			)}

			<ChartLegend stopLoss={stopLoss} takeProfit={takeProfit} />
		</div>
	);
}

export const ChartMarkers = memo(function ChartMarkersComponent(props: ChartMarkersProps) {
	return (
		<ChartMarkersCanvas
			{...props}
			trades={props.trades ?? []}
			extraMarkers={props.extraMarkers ?? []}
			extraPriceLines={props.extraPriceLines ?? []}
		/>
	);
});

export default ChartMarkers;
