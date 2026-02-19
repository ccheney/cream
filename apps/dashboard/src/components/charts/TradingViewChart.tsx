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
import { memo, useEffect, useRef } from "react";
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

type CandlestickSeriesApi = ISeriesApi<"Candlestick">;
type HistogramSeriesApi = ISeriesApi<"Histogram">;
type LineSeriesApi = ISeriesApi<"Line">;
type CandlestickPriceLine = ReturnType<CandlestickSeriesApi["createPriceLine"]>;

interface ChartRefs {
	chartRef: React.RefObject<IChartApi | null>;
	seriesRef: React.RefObject<CandlestickSeriesApi | null>;
	volumeSeriesRef: React.RefObject<HistogramSeriesApi | null>;
	maSeriesRefs: React.RefObject<Map<string, LineSeriesApi>>;
	sessionSeriesRef: React.RefObject<HistogramSeriesApi | null>;
	markersRef: React.RefObject<ReturnType<typeof createSeriesMarkers<Time>> | null>;
	priceLineRefs: React.RefObject<Map<string, CandlestickPriceLine>>;
}

function formatCandles(data: OHLCVData[]) {
	return data.map((d) => ({
		time: d.time as Time,
		open: d.open,
		high: d.high,
		low: d.low,
		close: d.close,
	}));
}

function formatVolumes(data: OHLCVData[]) {
	return data.map((d) => ({
		time: d.time as Time,
		value: d.volume || 0,
		color: d.close >= d.open ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)",
	}));
}

function createBaseChart(
	container: HTMLDivElement,
	width: number | string,
	height: number,
): IChartApi {
	return createChart(container, {
		...DEFAULT_CHART_OPTIONS,
		width: typeof width === "number" ? width : container.clientWidth,
		height,
	});
}

function createBaseSeries(chart: IChartApi) {
	const series = chart.addSeries(
		CandlestickSeries,
		DEFAULT_CANDLESTICK_OPTIONS,
	) as CandlestickSeriesApi;
	const markers = createSeriesMarkers(series, []);
	const volumeSeries = chart.addSeries(HistogramSeries, {
		color: "#26a69a",
		priceFormat: { type: "volume" },
		priceScaleId: "volume",
	}) as HistogramSeriesApi;
	chart.priceScale("volume").applyOptions({
		scaleMargins: { top: 0.8, bottom: 0 },
		visible: false,
	});
	return { series, markers, volumeSeries };
}

function setPrimaryData(
	data: OHLCVData[],
	series: CandlestickSeriesApi | null,
	volumeSeries: HistogramSeriesApi | null,
) {
	if (!series || !volumeSeries || data.length === 0) {
		return;
	}
	series.setData(formatCandles(data));
	volumeSeries.setData(formatVolumes(data));
}

function subscribeCrosshair(
	chart: IChartApi,
	series: CandlestickSeriesApi,
	onCrosshairMove?: (price: number | null, time: Time | null) => void,
) {
	if (!onCrosshairMove) {
		return () => {};
	}
	const handler = (
		param: Parameters<IChartApi["subscribeCrosshairMove"]>[0] extends (p: infer P) => void
			? P
			: never,
	) => {
		if (!param.time) {
			onCrosshairMove(null, null);
			return;
		}
		const price = param.seriesData.get(series);
		if (price && "close" in price) {
			onCrosshairMove((price as CandlestickData).close, param.time);
		}
	};
	chart.subscribeCrosshairMove(handler);
	return () => chart.unsubscribeCrosshairMove(handler);
}

function useChartInitialization({
	containerRef,
	width,
	height,
	data,
	onReady,
	onCrosshairMove,
	refs,
}: {
	containerRef: React.RefObject<HTMLDivElement | null>;
	width: number | string;
	height: number;
	data: OHLCVData[];
	onReady?: (chart: IChartApi) => void;
	onCrosshairMove?: (price: number | null, time: Time | null) => void;
	refs: ChartRefs;
}) {
	useEffect(() => {
		if (!containerRef.current) {
			return;
		}
		const chart = createBaseChart(containerRef.current, width, height);
		const { series, markers, volumeSeries } = createBaseSeries(chart);
		refs.chartRef.current = chart;
		refs.seriesRef.current = series;
		refs.markersRef.current = markers;
		refs.volumeSeriesRef.current = volumeSeries;
		setPrimaryData(data, series, volumeSeries);
		const unsubscribeCrosshair = subscribeCrosshair(chart, series, onCrosshairMove);
		chart.timeScale().fitContent();
		onReady?.(chart);

		return () => {
			unsubscribeCrosshair();
			chart.remove();
			refs.chartRef.current = null;
			refs.seriesRef.current = null;
			refs.volumeSeriesRef.current = null;
			refs.sessionSeriesRef.current = null;
			refs.maSeriesRefs.current.clear();
			refs.markersRef.current = null;
			refs.priceLineRefs.current.clear();
		};
	}, [containerRef, width, height, data, onReady, onCrosshairMove, refs]);
}

function usePrimaryDataUpdate(data: OHLCVData[], refs: ChartRefs) {
	useEffect(() => {
		setPrimaryData(data, refs.seriesRef.current, refs.volumeSeriesRef.current);
		if (data.length > 0) {
			refs.chartRef.current?.timeScale().fitContent();
			refs.seriesRef.current?.priceScale().applyOptions({ autoScale: true });
		}
	}, [data, refs]);
}

function usePriceLines(priceLines: PriceLineConfig[], refs: ChartRefs) {
	useEffect(() => {
		if (!refs.seriesRef.current) {
			return;
		}
		for (const [, line] of refs.priceLineRefs.current) {
			refs.seriesRef.current.removePriceLine(line);
		}
		refs.priceLineRefs.current.clear();
		for (const config of priceLines) {
			const priceLine = refs.seriesRef.current.createPriceLine({
				price: config.price,
				color: config.color,
				lineWidth: config.lineWidth as LineWidth,
				lineStyle: config.lineStyle,
				title: config.title,
				axisLabelVisible: config.axisLabelVisible,
			});
			refs.priceLineRefs.current.set(`${config.title}-${config.price}`, priceLine);
		}
	}, [priceLines, refs]);
}

function useMAOverlays(maOverlays: MAOverlay[], refs: ChartRefs) {
	useEffect(() => {
		if (!refs.chartRef.current) {
			return;
		}
		const chart = refs.chartRef.current;
		const currentIds = new Set(maOverlays.map((overlay) => overlay.id));
		for (const [id, series] of refs.maSeriesRefs.current) {
			if (!currentIds.has(id)) {
				chart.removeSeries(series);
				refs.maSeriesRefs.current.delete(id);
			}
		}
		for (const overlay of maOverlays) {
			let series = refs.maSeriesRefs.current.get(overlay.id);
			if (!series) {
				series = chart.addSeries(LineSeries, {
					color: overlay.color,
					lineWidth: 1,
					priceLineVisible: false,
					lastValueVisible: true,
					crosshairMarkerVisible: false,
				}) as LineSeriesApi;
				refs.maSeriesRefs.current.set(overlay.id, series);
			} else {
				series.applyOptions({ color: overlay.color });
			}
			series.setData(overlay.data.map((d) => ({ time: d.time as Time, value: d.value })));
		}
	}, [maOverlays, refs]);
}

function useMarkers(markers: TradeMarker[], refs: ChartRefs) {
	useEffect(() => {
		if (!refs.markersRef.current) {
			return;
		}
		refs.markersRef.current.setMarkers(
			markers.map((marker) => ({
				time: marker.time as Time,
				position: marker.position,
				color: marker.color,
				shape: marker.shape,
				text: marker.text,
			})),
		);
	}, [markers, refs]);
}

function useSessionBarsCleanup(refs: ChartRefs) {
	useEffect(() => {
		if (refs.sessionSeriesRef.current && refs.chartRef.current) {
			refs.chartRef.current.removeSeries(refs.sessionSeriesRef.current);
			refs.sessionSeriesRef.current = null;
		}
	}, [refs]);
}

function useAutoResize(
	autoResize: boolean,
	containerRef: React.RefObject<HTMLDivElement | null>,
	chartRef: React.RefObject<IChartApi | null>,
) {
	useEffect(() => {
		if (!autoResize) {
			return;
		}
		const handleResize = () => {
			if (!chartRef.current || !containerRef.current) {
				return;
			}
			chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
		};
		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, [autoResize, containerRef, chartRef]);
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
	const seriesRef = useRef<CandlestickSeriesApi | null>(null);
	const volumeSeriesRef = useRef<HistogramSeriesApi | null>(null);
	const maSeriesRefs = useRef<Map<string, LineSeriesApi>>(new Map());
	const sessionSeriesRef = useRef<HistogramSeriesApi | null>(null);
	const markersRef = useRef<ReturnType<typeof createSeriesMarkers<Time>> | null>(null);
	const priceLineRefs = useRef<Map<string, CandlestickPriceLine>>(new Map());

	const refs: ChartRefs = {
		chartRef,
		seriesRef,
		volumeSeriesRef,
		maSeriesRefs,
		sessionSeriesRef,
		markersRef,
		priceLineRefs,
	};

	useChartInitialization({ containerRef, width, height, data, onReady, onCrosshairMove, refs });
	usePrimaryDataUpdate(data, refs);
	usePriceLines(priceLines, refs);
	useMAOverlays(maOverlays, refs);
	useMarkers(markers, refs);
	useSessionBarsCleanup(refs);
	useAutoResize(autoResize, containerRef, chartRef);

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
