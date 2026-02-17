"use client";

/**
 * Base Indicator Chart Component
 *
 * Reusable TradingView Lightweight Charts component for technical indicators.
 * Supports line charts, area charts, and histograms with optional reference lines.
 */

import {
	AreaSeries,
	createChart,
	HistogramSeries,
	type IChartApi,
	type ISeriesApi,
	LineSeries,
	type Time,
} from "lightweight-charts";
import { memo, type RefObject, useCallback, useEffect, useRef } from "react";

import { CHART_COLORS, DEFAULT_CHART_OPTIONS } from "@/lib/chart-config";

export interface IndicatorDataPoint {
	time: number | string;
	value: number;
}

export interface ReferenceLine {
	value: number;
	color: string;
	lineWidth?: number;
	title?: string;
}

export interface ReferenceZone {
	from: number;
	to: number;
	color: string;
	title?: string;
}

export type ChartType = "line" | "area" | "histogram";

export interface IndicatorChartProps {
	data: IndicatorDataPoint[];
	type?: ChartType;
	color?: string;
	secondaryData?: IndicatorDataPoint[];
	secondaryColor?: string;
	histogramData?: IndicatorDataPoint[];
	referenceLines?: ReferenceLine[];
	referenceZones?: ReferenceZone[];
	title?: string;
	height?: number;
	minValue?: number;
	maxValue?: number;
	autoResize?: boolean;
	className?: string;
}

type DataPoint = {
	time: Time;
	value: number;
};

type HistogramPoint = {
	time: Time;
	value: number;
	color: string;
};

type MainSeries = ISeriesApi<"Line"> | ISeriesApi<"Area">;

const INDICATOR_CHART_OPTIONS = {
	...DEFAULT_CHART_OPTIONS,
	handleScroll: false,
	handleScale: false,
	rightPriceScale: {
		...DEFAULT_CHART_OPTIONS.rightPriceScale,
		scaleMargins: {
			top: 0.1,
			bottom: 0.1,
		},
	},
};

function formatData(data: IndicatorDataPoint[]): DataPoint[] {
	return data.map((datum) => ({
		time: datum.time as Time,
		value: datum.value,
	}));
}

function formatHistogramData(
	data: IndicatorDataPoint[],
	positiveColor: string,
	negativeColor: string,
): HistogramPoint[] {
	return data.map((datum) => ({
		time: datum.time as Time,
		value: datum.value,
		color: datum.value >= 0 ? positiveColor : negativeColor,
	}));
}

function toLineWidth(lineWidth: number | undefined): 1 | 2 | 3 | 4 {
	switch (lineWidth) {
		case 2:
			return 2;
		case 3:
			return 3;
		case 4:
			return 4;
		default:
			return 1;
	}
}

function createChartInstance(container: HTMLDivElement, height: number): IChartApi {
	return createChart(container, {
		...INDICATOR_CHART_OPTIONS,
		width: container.clientWidth,
		height,
	});
}

function setScaleBounds(chart: IChartApi, minValue?: number, maxValue?: number): void {
	if (minValue === undefined && maxValue === undefined) {
		return;
	}
	chart.priceScale("right").applyOptions({ autoScale: false });
}

function createPrimarySeries(chart: IChartApi, type: ChartType, color: string): MainSeries {
	if (type === "area") {
		return chart.addSeries(AreaSeries, {
			lineColor: color,
			topColor: `${color}50`,
			bottomColor: `${color}05`,
			lineWidth: 2,
			priceLineVisible: false,
		}) as ISeriesApi<"Area">;
	}

	return chart.addSeries(LineSeries, {
		color,
		lineWidth: 2,
		priceLineVisible: false,
		crosshairMarkerVisible: true,
		crosshairMarkerRadius: 4,
	}) as ISeriesApi<"Line">;
}

function createSecondarySeries(chart: IChartApi, color: string): ISeriesApi<"Line"> {
	return chart.addSeries(LineSeries, {
		color,
		lineWidth: 1,
		priceLineVisible: false,
		crosshairMarkerVisible: false,
	}) as ISeriesApi<"Line">;
}

function createHistogramSeries(
	chart: IChartApi,
	histogramData: IndicatorDataPoint[] | undefined,
): ISeriesApi<"Histogram"> | null {
	if (!histogramData || histogramData.length === 0) {
		return null;
	}
	return chart.addSeries(HistogramSeries, {
		priceFormat: { type: "price", precision: 4 },
		priceScaleId: "right",
	}) as ISeriesApi<"Histogram">;
}

function addReferenceLines(mainSeries: MainSeries, referenceLines: ReferenceLine[]): void {
	for (const line of referenceLines) {
		mainSeries.createPriceLine({
			price: line.value,
			color: line.color,
			lineWidth: toLineWidth(line.lineWidth),
			lineStyle: 2,
			title: line.title ?? "",
			axisLabelVisible: false,
		});
	}
}

function setMainSeriesData(series: MainSeries | null, data: IndicatorDataPoint[]): void {
	if (!series || data.length === 0) {
		return;
	}
	series.setData(formatData(data));
}

function setSecondarySeriesData(
	series: ISeriesApi<"Line"> | null,
	data: IndicatorDataPoint[] | undefined,
): void {
	if (!series || !data || data.length === 0) {
		return;
	}
	series.setData(formatData(data));
}

function setHistogramSeriesData(
	series: ISeriesApi<"Histogram"> | null,
	data: IndicatorDataPoint[] | undefined,
): void {
	if (!series || !data || data.length === 0) {
		return;
	}
	series.setData(formatHistogramData(data, CHART_COLORS.profit, CHART_COLORS.loss));
}

function syncSeriesPayload({
	mainSeriesRef,
	secondarySeriesRef,
	histogramSeriesRef,
	data,
	secondaryData,
	histogramData,
}: {
	mainSeriesRef: RefObject<MainSeries | null>;
	secondarySeriesRef: RefObject<ISeriesApi<"Line"> | null>;
	histogramSeriesRef: RefObject<ISeriesApi<"Histogram"> | null>;
	data: IndicatorDataPoint[];
	secondaryData?: IndicatorDataPoint[];
	histogramData?: IndicatorDataPoint[];
}) {
	setMainSeriesData(mainSeriesRef.current, data);
	setSecondarySeriesData(secondarySeriesRef.current, secondaryData);
	setHistogramSeriesData(histogramSeriesRef.current, histogramData);
}

function useChartInitialization({
	containerRef,
	chartRef,
	mainSeriesRef,
	secondarySeriesRef,
	histogramSeriesRef,
	type,
	color,
	secondaryColor,
	data,
	secondaryData,
	histogramData,
	referenceLines,
	minValue,
	maxValue,
	height,
}: {
	containerRef: RefObject<HTMLDivElement | null>;
	chartRef: RefObject<IChartApi | null>;
	mainSeriesRef: RefObject<MainSeries | null>;
	secondarySeriesRef: RefObject<ISeriesApi<"Line"> | null>;
	histogramSeriesRef: RefObject<ISeriesApi<"Histogram"> | null>;
	type: ChartType;
	color: string;
	secondaryColor: string;
	data: IndicatorDataPoint[];
	secondaryData?: IndicatorDataPoint[];
	histogramData?: IndicatorDataPoint[];
	referenceLines: ReferenceLine[];
	minValue?: number;
	maxValue?: number;
	height: number;
}) {
	useEffect(() => {
		if (!containerRef.current) {
			return;
		}

		const chart = createChartInstance(containerRef.current, height);
		chartRef.current = chart;
		setScaleBounds(chart, minValue, maxValue);

		const mainSeries = createPrimarySeries(chart, type, color);
		const secondarySeries =
			secondaryData && secondaryData.length > 0
				? createSecondarySeries(chart, secondaryColor)
				: null;
		const histogramSeries = createHistogramSeries(chart, histogramData);
		mainSeriesRef.current = mainSeries;
		secondarySeriesRef.current = secondarySeries;
		histogramSeriesRef.current = histogramSeries;

		addReferenceLines(mainSeries, referenceLines);
		syncSeriesPayload({
			mainSeriesRef,
			secondarySeriesRef,
			histogramSeriesRef,
			data,
			secondaryData,
			histogramData,
		});
		chart.timeScale().fitContent();

		return () => {
			chart.remove();
			chartRef.current = null;
			mainSeriesRef.current = null;
			secondarySeriesRef.current = null;
			histogramSeriesRef.current = null;
		};
	}, [
		type,
		color,
		secondaryColor,
		data,
		secondaryData,
		histogramData,
		referenceLines,
		minValue,
		maxValue,
		height,
		chartRef,
		mainSeriesRef,
		secondarySeriesRef,
		histogramSeriesRef,
		containerRef,
	]);
}

function useSeriesSync({
	chartRef,
	mainSeriesRef,
	secondarySeriesRef,
	histogramSeriesRef,
	data,
	secondaryData,
	histogramData,
}: {
	chartRef: RefObject<IChartApi | null>;
	mainSeriesRef: RefObject<MainSeries | null>;
	secondarySeriesRef: RefObject<ISeriesApi<"Line"> | null>;
	histogramSeriesRef: RefObject<ISeriesApi<"Histogram"> | null>;
	data: IndicatorDataPoint[];
	secondaryData?: IndicatorDataPoint[];
	histogramData?: IndicatorDataPoint[];
}) {
	useEffect(() => {
		syncSeriesPayload({
			mainSeriesRef,
			secondarySeriesRef,
			histogramSeriesRef,
			data,
			secondaryData,
			histogramData,
		});
		chartRef.current?.timeScale().fitContent();
	}, [
		chartRef,
		mainSeriesRef,
		secondarySeriesRef,
		histogramSeriesRef,
		data,
		secondaryData,
		histogramData,
	]);

	useEffect(() => {
		setSecondarySeriesData(secondarySeriesRef.current, secondaryData);
	}, [secondarySeriesRef, secondaryData]);

	useEffect(() => {
		setHistogramSeriesData(histogramSeriesRef.current, histogramData);
	}, [histogramSeriesRef, histogramData]);
}

function useChartResize({
	autoResize,
	chartRef,
	containerRef,
}: {
	autoResize: boolean;
	chartRef: RefObject<IChartApi | null>;
	containerRef: RefObject<HTMLDivElement | null>;
}) {
	const handleResize = useCallback(() => {
		if (!autoResize || !chartRef.current || !containerRef.current) {
			return;
		}
		chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
	}, [autoResize, chartRef, containerRef]);

	useEffect(() => {
		if (!autoResize) {
			return;
		}
		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, [autoResize, handleResize]);
}

export const IndicatorChart = memo(function IndicatorChart({
	data,
	type = "line",
	color = CHART_COLORS.primary,
	secondaryData,
	secondaryColor = "#6B7280",
	histogramData,
	referenceLines = [],
	referenceZones: _referenceZones = [],
	title,
	height = 150,
	minValue,
	maxValue,
	autoResize = true,
	className = "",
}: IndicatorChartProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const chartRef = useRef<IChartApi | null>(null);
	const mainSeriesRef = useRef<MainSeries | null>(null);
	const secondarySeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
	const histogramSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

	useChartInitialization({
		containerRef,
		chartRef,
		mainSeriesRef,
		secondarySeriesRef,
		histogramSeriesRef,
		type,
		color,
		secondaryColor,
		data,
		secondaryData,
		histogramData,
		referenceLines,
		minValue,
		maxValue,
		height,
	});

	useSeriesSync({
		chartRef,
		mainSeriesRef,
		secondarySeriesRef,
		histogramSeriesRef,
		data,
		secondaryData,
		histogramData,
	});

	useChartResize({ autoResize, chartRef, containerRef });

	return (
		<div className={`relative ${className}`}>
			{title && (
				<div className="absolute top-2 left-2 z-10 text-xs font-medium text-stone-500 dark:text-stone-400">
					{title}
				</div>
			)}
			<div ref={containerRef} style={{ width: "100%", height: `${height}px` }} />
		</div>
	);
});

export default IndicatorChart;
