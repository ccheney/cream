/**
 * TradingView Lightweight Charts Component
 *
 * Candlestick chart with trade markers and price lines.
 *
 * @see docs/plans/ui/26-data-viz.md lines 7-86
 */

"use client";

import {
	type CandlestickData,
	CandlestickSeries,
	createChart,
	createSeriesMarkers,
	HistogramSeries,
	type IChartApi,
	type ISeriesApi,
	LineSeries,
	type LineWidth,
	type Time,
} from "lightweight-charts";
import { memo, useCallback, useEffect, useRef } from "react";
import {
	DEFAULT_CANDLESTICK_OPTIONS,
	DEFAULT_CHART_OPTIONS,
	type OHLCVData,
	type PriceLineConfig,
	type TradeMarker,
} from "@/lib/chart-config";
import type { MAOverlay } from "@/lib/chart-indicators";

export interface SessionBoundaries {
	/** Market open timestamps (9:30 AM ET) */
	openTimes: number[];
	/** Market close timestamps (4:00 PM ET) */
	closeTimes: number[];
}

export interface TradingViewChartProps {
	/** OHLCV data for the chart */
	data: OHLCVData[];

	/** Moving average overlay lines */
	maOverlays?: MAOverlay[];

	/** Trade markers to display */
	markers?: TradeMarker[];

	/** Price lines (stop-loss, take-profit) */
	priceLines?: PriceLineConfig[];

	/** Session boundary markers (market open/close vertical lines) */
	sessionBoundaries?: SessionBoundaries;

	/** Chart width (defaults to 100%) */
	width?: number | string;

	/** Chart height in pixels */
	height?: number;

	/** Auto-resize to container */
	autoResize?: boolean;

	/** Callback when chart is ready */
	onReady?: (chart: IChartApi) => void;

	/** Callback when crosshair moves */
	onCrosshairMove?: (price: number | null, time: Time | null) => void;

	/** Additional CSS class */
	className?: string;
}

/**
 * TradingView Lightweight Charts candlestick component.
 */
function TradingViewChartComponent({
	data,
	maOverlays = [],
	markers = [],
	priceLines = [],
	sessionBoundaries: _sessionBoundaries,
	width = "100%",
	height = 400,
	autoResize = true,
	onReady,
	onCrosshairMove,
	className,
}: TradingViewChartProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const chartRef = useRef<IChartApi | null>(null);
	const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
	const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
	const maSeriesRefs = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
	const sessionSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
	const markersRef = useRef<ReturnType<typeof createSeriesMarkers<Time>> | null>(null);
	// biome-ignore lint/suspicious/noExplicitAny: lightweight-charts IPriceLine type
	const priceLineRefs = useRef<Map<string, any>>(new Map());

	useEffect(() => {
		if (!containerRef.current) {
			return;
		}

		const chart = createChart(containerRef.current, {
			...DEFAULT_CHART_OPTIONS,
			width: typeof width === "number" ? width : containerRef.current.clientWidth,
			height,
		});

		chartRef.current = chart;

		const series = chart.addSeries(
			CandlestickSeries,
			DEFAULT_CANDLESTICK_OPTIONS,
		) as ISeriesApi<"Candlestick">;
		seriesRef.current = series;

		const seriesMarkers = createSeriesMarkers(series, []);
		markersRef.current = seriesMarkers;

		const volumeSeries = chart.addSeries(HistogramSeries, {
			color: "#26a69a",
			priceFormat: {
				type: "volume",
			},
			priceScaleId: "volume",
		}) as ISeriesApi<"Histogram">;
		volumeSeriesRef.current = volumeSeries;

		// Configure volume scale to sit at the bottom
		chart.priceScale("volume").applyOptions({
			scaleMargins: {
				top: 0.8, // Highest volume bar will be 80% down
				bottom: 0,
			},
			visible: false,
		});

		if (data.length > 0) {
			const formattedData = data.map((d) => ({
				time: d.time as Time,
				open: d.open,
				high: d.high,
				low: d.low,
				close: d.close,
			}));
			series.setData(formattedData);

			const volumeData = data.map((d) => ({
				time: d.time as Time,
				value: d.volume || 0,
				color:
					d.close >= d.open
						? "rgba(34, 197, 94, 0.3)" // profit/green with opacity
						: "rgba(239, 68, 68, 0.3)", // loss/red with opacity
			}));
			volumeSeries.setData(volumeData);
		}

		if (onCrosshairMove) {
			chart.subscribeCrosshairMove((param) => {
				if (!param.time) {
					onCrosshairMove(null, null);
					return;
				}
				const price = param.seriesData.get(series);
				if (price && "close" in price) {
					onCrosshairMove((price as CandlestickData).close, param.time);
				}
			});
		}

		chart.timeScale().fitContent();
		onReady?.(chart);

		return () => {
			chart.remove();
			chartRef.current = null;
			seriesRef.current = null;
			volumeSeriesRef.current = null;
			sessionSeriesRef.current = null;
			maSeriesRefs.current.clear();
			markersRef.current = null;
			priceLineRefs.current.clear();
		};
	}, [height, onCrosshairMove, onReady, width, data]);

	useEffect(() => {
		if (!seriesRef.current || !volumeSeriesRef.current || data.length === 0) {
			return;
		}

		const formattedData = data.map((d) => ({
			time: d.time as Time,
			open: d.open,
			high: d.high,
			low: d.low,
			close: d.close,
		}));

		seriesRef.current.setData(formattedData);

		const volumeData = data.map((d) => ({
			time: d.time as Time,
			value: d.volume || 0,
			color:
				d.close >= d.open
					? "rgba(34, 197, 94, 0.3)" // profit/green with opacity
					: "rgba(239, 68, 68, 0.3)", // loss/red with opacity
		}));
		volumeSeriesRef.current.setData(volumeData);

		// Fit both time and price scales to new data
		chartRef.current?.timeScale().fitContent();

		// Force price scale to auto-fit by temporarily enabling autoScale
		seriesRef.current.priceScale().applyOptions({ autoScale: true });
	}, [data]);

	useEffect(() => {
		if (!seriesRef.current) {
			return;
		}

		for (const [_key, priceLine] of priceLineRefs.current) {
			seriesRef.current.removePriceLine(priceLine);
		}
		priceLineRefs.current.clear();

		for (const config of priceLines) {
			const priceLine = seriesRef.current.createPriceLine({
				price: config.price,
				color: config.color,
				lineWidth: config.lineWidth as LineWidth,
				lineStyle: config.lineStyle,
				title: config.title,
				axisLabelVisible: config.axisLabelVisible,
			});
			priceLineRefs.current.set(`${config.title}-${config.price}`, priceLine);
		}
	}, [priceLines]);

	// MA overlays effect
	useEffect(() => {
		if (!chartRef.current) {
			return;
		}

		const chart = chartRef.current;
		const currentIds = new Set(maOverlays.map((o) => o.id));

		// Remove series that are no longer in overlays
		for (const [id, series] of maSeriesRefs.current) {
			if (!currentIds.has(id)) {
				chart.removeSeries(series);
				maSeriesRefs.current.delete(id);
			}
		}

		// Add or update series
		for (const overlay of maOverlays) {
			let series = maSeriesRefs.current.get(overlay.id);

			if (!series) {
				// Create new line series
				series = chart.addSeries(LineSeries, {
					color: overlay.color,
					lineWidth: 1,
					priceLineVisible: false,
					lastValueVisible: true,
					crosshairMarkerVisible: false,
				}) as ISeriesApi<"Line">;
				maSeriesRefs.current.set(overlay.id, series);
			} else {
				// Update color if changed
				series.applyOptions({ color: overlay.color });
			}

			// Set data
			const formattedData = overlay.data.map((d) => ({
				time: d.time as Time,
				value: d.value,
			}));
			series.setData(formattedData);
		}
	}, [maOverlays]);

	// Regular markers effect
	useEffect(() => {
		if (!markersRef.current) {
			return;
		}

		const formattedMarkers = markers.map((m) => ({
			time: m.time as Time,
			position: m.position,
			color: m.color,
			shape: m.shape,
			text: m.text,
		}));

		markersRef.current.setMarkers(formattedMarkers);
	}, [markers]);

	// Session boundary vertical bars effect (market open/close)
	useEffect(() => {
		// Session bars disabled
		if (sessionSeriesRef.current && chartRef.current) {
			chartRef.current.removeSeries(sessionSeriesRef.current);
			sessionSeriesRef.current = null;
		}
	}, []);

	const handleResize = useCallback(() => {
		if (!chartRef.current || !containerRef.current || !autoResize) {
			return;
		}

		chartRef.current.applyOptions({
			width: containerRef.current.clientWidth,
		});
	}, [autoResize]);

	useEffect(() => {
		if (!autoResize) {
			return;
		}

		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, [autoResize, handleResize]);

	return (
		<div
			ref={containerRef}
			className={className}
			style={{
				width: typeof width === "number" ? `${width}px` : width,
				height: `${height}px`,
			}}
		/>
	);
}

/**
 * Memoized TradingView chart component.
 */
export const TradingViewChart = memo(TradingViewChartComponent);

export default TradingViewChart;
