"use client";

/**
 * EquityCurveChart Component
 *
 * Displays portfolio equity curve using TradingView Lightweight Charts with area series.
 * Includes period selector and responsive sizing.
 *
 * @see docs/plans/ui/03-views.md Section 5: Portfolio Dashboard
 */

import {
	AreaSeries,
	CrosshairMode,
	createChart,
	type IChartApi,
	type ISeriesApi,
	LineStyle,
	type SingleValueData,
	type Time,
} from "lightweight-charts";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { PortfolioHistory, PortfolioHistoryPeriod } from "@/lib/api/types";

// ============================================
// Types
// ============================================

export interface EquityCurveChartProps {
	data?: PortfolioHistory;
	period?: PortfolioHistoryPeriod;
	onPeriodChange?: (period: PortfolioHistoryPeriod) => void;
	isLoading?: boolean;
	/** Current live equity to append as the latest point (real-time) */
	liveEquity?: number;
	/** Whether live data is streaming */
	isStreaming?: boolean;
}

interface PeriodConfig {
	key: PortfolioHistoryPeriod;
	label: string;
}

// ============================================
// Constants
// ============================================

const PERIODS: PeriodConfig[] = [
	{ key: "1D", label: "1D" },
	{ key: "1W", label: "1W" },
	{ key: "1M", label: "1M" },
	{ key: "3M", label: "3M" },
	{ key: "1A", label: "1Y" },
	{ key: "all", label: "ALL" },
];

// ============================================
// Chart Configuration
// ============================================

const getChartOptions = (isDark: boolean) => ({
	layout: {
		background: { color: "transparent" },
		textColor: isDark ? "#A8A29E" : "#78716C",
		fontSize: 11,
		fontFamily: "Geist Mono, ui-monospace, monospace",
		attributionLogo: false,
	},
	grid: {
		vertLines: { color: isDark ? "rgba(168, 162, 158, 0.1)" : "rgba(120, 113, 108, 0.1)" },
		horzLines: { color: isDark ? "rgba(168, 162, 158, 0.1)" : "rgba(120, 113, 108, 0.1)" },
	},
	crosshair: {
		mode: CrosshairMode.Normal,
		vertLine: { color: "#D97706", style: LineStyle.Dashed, width: 1 as const },
		horzLine: { color: "#D97706", style: LineStyle.Dashed, width: 1 as const },
	},
	rightPriceScale: {
		borderVisible: false,
	},
	timeScale: {
		borderVisible: false,
		timeVisible: true,
		secondsVisible: false,
	},
	handleScroll: false,
	handleScale: false,
});

const getSeriesOptions = (isDark: boolean) => ({
	lineColor: "#D97706",
	topColor: isDark ? "rgba(217, 119, 6, 0.4)" : "rgba(217, 119, 6, 0.3)",
	bottomColor: isDark ? "rgba(217, 119, 6, 0.05)" : "rgba(217, 119, 6, 0.02)",
	lineWidth: 2 as const,
	crosshairMarkerVisible: true,
	crosshairMarkerRadius: 4,
	crosshairMarkerBorderColor: "#D97706",
	crosshairMarkerBackgroundColor: isDark ? "#1C1917" : "#FFFFFF",
	lastValueVisible: true,
	priceLineVisible: true,
	priceLineColor: "#D97706",
	priceLineStyle: LineStyle.Dashed,
});

// ============================================
// Data Transformation
// ============================================

function transformData(data: PortfolioHistory, liveEquity?: number): SingleValueData[] {
	const chartData = data.timestamp.map((ts, i) => ({
		time: ts as Time, // Alpaca returns Unix epoch in seconds, which lightweight-charts expects
		value: data.equity[i] ?? 0,
	}));

	// Append live equity as the current point if available
	if (liveEquity !== undefined && liveEquity > 0) {
		const now = Math.floor(Date.now() / 1000) as Time; // Current time in Unix seconds
		// Only append if it's after the last data point
		const lastTime = chartData[chartData.length - 1]?.time;
		if (!lastTime || now > lastTime) {
			chartData.push({ time: now, value: liveEquity });
		}
	}

	return chartData;
}

// ============================================
// Main Component
// ============================================

export const EquityCurveChart = memo(function EquityCurveChart({
	data,
	period = "1M",
	onPeriodChange,
	isLoading = false,
	liveEquity,
	isStreaming = false,
}: EquityCurveChartProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const chartRef = useRef<IChartApi | null>(null);
	const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
	const [selectedPeriod, setSelectedPeriod] = useState<PortfolioHistoryPeriod>(period);

	// Detect dark mode
	const [isDark, setIsDark] = useState(false);

	useEffect(() => {
		const checkDarkMode = () => {
			setIsDark(document.documentElement.classList.contains("dark"));
		};
		checkDarkMode();

		const observer = new MutationObserver(checkDarkMode);
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class"],
		});

		return () => observer.disconnect();
	}, []);

	// Initialize chart
	useEffect(() => {
		if (!containerRef.current) {
			return;
		}

		const chart = createChart(containerRef.current, {
			...getChartOptions(isDark),
			width: containerRef.current.clientWidth,
			height: 256,
		});

		const series = chart.addSeries(AreaSeries, getSeriesOptions(isDark));

		chartRef.current = chart;
		seriesRef.current = series;

		// Cleanup on unmount
		return () => {
			chart.remove();
			chartRef.current = null;
			seriesRef.current = null;
		};
	}, [isDark]);

	// Update chart options when theme changes
	useEffect(() => {
		if (!chartRef.current || !seriesRef.current) {
			return;
		}

		chartRef.current.applyOptions(getChartOptions(isDark));
		seriesRef.current.applyOptions(getSeriesOptions(isDark));
	}, [isDark]);

	// Update data when it changes (including live equity updates)
	useEffect(() => {
		if (!seriesRef.current || !data) {
			return;
		}

		const chartData = transformData(data, liveEquity);
		seriesRef.current.setData(chartData);
		chartRef.current?.timeScale().fitContent();
	}, [data, liveEquity]);

	// Handle resize
	useEffect(() => {
		if (!containerRef.current || !chartRef.current) {
			return;
		}

		const resizeObserver = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (entry) {
				chartRef.current?.resize(entry.contentRect.width, 256);
			}
		});

		resizeObserver.observe(containerRef.current);

		return () => resizeObserver.disconnect();
	}, []);

	const handlePeriodClick = useCallback(
		(newPeriod: PortfolioHistoryPeriod) => {
			setSelectedPeriod(newPeriod);
			onPeriodChange?.(newPeriod);
		},
		[onPeriodChange],
	);

	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-5">
			<div className="flex items-center justify-between mb-4">
				<div className="flex items-center gap-2">
					<h2 className="text-sm font-medium text-stone-500 dark:text-night-400 uppercase tracking-wide">
						Equity Curve
					</h2>
					{isStreaming && (
						<div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
							<span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
							Live
						</div>
					)}
				</div>
				<div className="flex gap-1">
					{PERIODS.map((p) => (
						<button
							key={p.key}
							type="button"
							onClick={() => handlePeriodClick(p.key)}
							className={`px-2 py-1 text-xs rounded transition-colors ${
								selectedPeriod === p.key
									? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
									: "text-stone-400 dark:text-night-500 hover:text-stone-600 dark:hover:text-night-300"
							}`}
						>
							{p.label}
						</button>
					))}
				</div>
			</div>

			{/* Chart Container */}
			<div className="relative h-64">
				{!isLoading && !data && (
					<div className="absolute inset-0 bg-cream-50 dark:bg-night-750 rounded flex items-center justify-center">
						<span className="text-sm text-stone-400 dark:text-night-500">No data available</span>
					</div>
				)}
				<div
					ref={containerRef}
					className={`w-full h-full ${!isLoading && !data ? "invisible" : ""}`}
				/>
			</div>
		</div>
	);
});

export default EquityCurveChart;
