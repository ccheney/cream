/**
 * IndicatorPane Chart Component
 *
 * Displays technical indicators (RSI, MACD, Stochastic, Volume)
 * in a stacked pane layout below the main price chart.
 *
 * @see docs/plans/ui/03-views.md lines 572-581
 * @see docs/plans/ui/10-appendix.md (indicator-pane.tsx in charts/)
 */

"use client";

import {
  createChart,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type Time,
} from "lightweight-charts";
import { memo, useEffect, useRef } from "react";
import { CHART_COLORS, DEFAULT_CHART_OPTIONS } from "@/lib/chart-config";

// ============================================
// Types
// ============================================

export type IndicatorType = "rsi" | "macd" | "stochastic" | "volume";

export interface RSIData {
  time: number | string;
  value: number;
}

export interface MACDData {
  time: number | string;
  macd: number;
  signal: number;
  histogram: number;
}

export interface StochasticData {
  time: number | string;
  k: number;
  d: number;
}

export interface VolumeData {
  time: number | string;
  value: number;
  color?: string;
}

export interface IndicatorPaneProps {
  /** Indicator type to display */
  type: IndicatorType;

  /** RSI data (required when type is 'rsi') */
  rsiData?: RSIData[];

  /** MACD data (required when type is 'macd') */
  macdData?: MACDData[];

  /** Stochastic data (required when type is 'stochastic') */
  stochasticData?: StochasticData[];

  /** Volume data (required when type is 'volume') */
  volumeData?: VolumeData[];

  /** Chart height in pixels (default: 100 for oscillators, 80 for volume) */
  height?: number;

  /** Timeframe label (e.g., "1H", "4H", "1D") */
  timeframe?: string;

  /** Parent chart for synced crosshair (optional) */
  parentChart?: IChartApi;

  /** Callback when chart is ready */
  onReady?: (chart: IChartApi) => void;

  /** Additional CSS class */
  className?: string;
}

// ============================================
// Color Config
// ============================================

const INDICATOR_COLORS = {
  rsi: {
    line: "#3B82F6", // blue-500
    overbought: "rgba(239, 68, 68, 0.2)", // red with alpha
    oversold: "rgba(34, 197, 94, 0.2)", // green with alpha
  },
  macd: {
    macdLine: "#3B82F6", // blue-500
    signalLine: "#F97316", // orange-500
    histogramUp: "rgba(34, 197, 94, 0.7)", // green-500
    histogramDown: "rgba(239, 68, 68, 0.7)", // red-500
  },
  stochastic: {
    k: "#3B82F6", // blue-500
    d: "#F97316", // orange-500
    overbought: "rgba(239, 68, 68, 0.2)",
    oversold: "rgba(34, 197, 94, 0.2)",
  },
  volume: {
    up: "rgba(34, 197, 94, 0.6)",
    down: "rgba(239, 68, 68, 0.6)",
  },
} as const;

// ============================================
// Indicator Pane Component
// ============================================

function IndicatorPaneComponent({
  type,
  rsiData,
  macdData,
  stochasticData,
  volumeData,
  height,
  timeframe,
  parentChart,
  onReady,
  className,
}: IndicatorPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  // Set default height based on indicator type
  const chartHeight = height ?? (type === "volume" ? 80 : 100);

  // Initialize chart
  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const chart = createChart(containerRef.current, {
      ...DEFAULT_CHART_OPTIONS,
      width: containerRef.current.clientWidth,
      height: chartHeight,
      rightPriceScale: {
        ...DEFAULT_CHART_OPTIONS.rightPriceScale,
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
      },
      timeScale: {
        ...DEFAULT_CHART_OPTIONS.timeScale,
        visible: false, // Hide time scale since parent chart shows it
      },
    });

    chartRef.current = chart;

    // Add indicator-specific series
    switch (type) {
      case "rsi":
        initRSI(chart, rsiData ?? []);
        break;
      case "macd":
        initMACD(chart, macdData ?? []);
        break;
      case "stochastic":
        initStochastic(chart, stochasticData ?? []);
        break;
      case "volume":
        initVolume(chart, volumeData ?? []);
        break;
    }

    // Sync with parent chart if provided
    if (parentChart) {
      parentChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (range) {
          chart.timeScale().setVisibleLogicalRange(range);
        }
      });
    }

    chart.timeScale().fitContent();
    onReady?.(chart);

    // Resize handler
    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [type, chartHeight, onReady, parentChart, rsiData, macdData, stochasticData, volumeData]);

  return (
    <div className={className}>
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 text-xs text-cream-500 dark:text-cream-400 border-b border-cream-100 dark:border-night-700">
        <span className="font-medium uppercase">{type}</span>
        {timeframe && <span className="text-cream-400">{timeframe}</span>}
      </div>
      {/* Chart container */}
      <div ref={containerRef} style={{ height: chartHeight }} />
    </div>
  );
}

// ============================================
// Initialization Functions
// ============================================

function initRSI(chart: IChartApi, data: RSIData[]) {
  // Add RSI line
  // biome-ignore lint/suspicious/noExplicitAny: lightweight-charts API requires string literal
  const series = chart.addSeries("line" as any, {
    color: INDICATOR_COLORS.rsi.line,
    lineWidth: 2,
    priceLineVisible: false,
  }) as ISeriesApi<"Line">;

  if (data.length > 0) {
    series.setData(
      data.map((d) => ({
        time: d.time as Time,
        value: d.value,
      }))
    );
  }

  // Add overbought/oversold lines
  series.createPriceLine({
    price: 70,
    color: "rgba(239, 68, 68, 0.5)",
    lineWidth: 1,
    lineStyle: 2,
    title: "",
    axisLabelVisible: false,
  });

  series.createPriceLine({
    price: 30,
    color: "rgba(34, 197, 94, 0.5)",
    lineWidth: 1,
    lineStyle: 2,
    title: "",
    axisLabelVisible: false,
  });

  // Set scale to 0-100
  chart.priceScale("right").applyOptions({
    autoScale: false,
    scaleMargins: { top: 0.05, bottom: 0.05 },
  });
}

function initMACD(chart: IChartApi, data: MACDData[]) {
  // Histogram series
  // biome-ignore lint/suspicious/noExplicitAny: lightweight-charts API requires string literal
  const histogramSeries = chart.addSeries("histogram" as any, {
    priceLineVisible: false,
    priceFormat: {
      type: "price",
      precision: 4,
      minMove: 0.0001,
    },
  }) as ISeriesApi<"Histogram">;

  if (data.length > 0) {
    const histogramData: HistogramData[] = data.map((d) => ({
      time: d.time as Time,
      value: d.histogram,
      color:
        d.histogram >= 0 ? INDICATOR_COLORS.macd.histogramUp : INDICATOR_COLORS.macd.histogramDown,
    }));
    histogramSeries.setData(histogramData);
  }

  // MACD line
  // biome-ignore lint/suspicious/noExplicitAny: lightweight-charts API requires string literal
  const macdSeries = chart.addSeries("line" as any, {
    color: INDICATOR_COLORS.macd.macdLine,
    lineWidth: 2,
    priceLineVisible: false,
  }) as ISeriesApi<"Line">;

  if (data.length > 0) {
    const macdLineData: LineData[] = data.map((d) => ({
      time: d.time as Time,
      value: d.macd,
    }));
    macdSeries.setData(macdLineData);
  }

  // Signal line
  // biome-ignore lint/suspicious/noExplicitAny: lightweight-charts API requires string literal
  const signalSeries = chart.addSeries("line" as any, {
    color: INDICATOR_COLORS.macd.signalLine,
    lineWidth: 2,
    priceLineVisible: false,
  }) as ISeriesApi<"Line">;

  if (data.length > 0) {
    const signalLineData: LineData[] = data.map((d) => ({
      time: d.time as Time,
      value: d.signal,
    }));
    signalSeries.setData(signalLineData);
  }

  // Add zero line
  histogramSeries.createPriceLine({
    price: 0,
    color: CHART_COLORS.grid,
    lineWidth: 1,
    lineStyle: 0,
    title: "",
    axisLabelVisible: false,
  });
}

function initStochastic(chart: IChartApi, data: StochasticData[]) {
  // %K line
  // biome-ignore lint/suspicious/noExplicitAny: lightweight-charts v5 addSeries overload
  const kSeries = chart.addSeries("line" as any, {
    color: INDICATOR_COLORS.stochastic.k,
    lineWidth: 2,
    priceLineVisible: false,
  }) as ISeriesApi<"Line">;

  if (data.length > 0) {
    kSeries.setData(
      data.map((d) => ({
        time: d.time as Time,
        value: d.k,
      }))
    );
  }

  // %D line
  // biome-ignore lint/suspicious/noExplicitAny: lightweight-charts v5 addSeries overload
  const dSeries = chart.addSeries("line" as any, {
    color: INDICATOR_COLORS.stochastic.d,
    lineWidth: 2,
    priceLineVisible: false,
  }) as ISeriesApi<"Line">;

  if (data.length > 0) {
    dSeries.setData(
      data.map((d) => ({
        time: d.time as Time,
        value: d.d,
      }))
    );
  }

  // Add overbought/oversold lines
  kSeries.createPriceLine({
    price: 80,
    color: "rgba(239, 68, 68, 0.5)",
    lineWidth: 1,
    lineStyle: 2,
    title: "",
    axisLabelVisible: false,
  });

  kSeries.createPriceLine({
    price: 20,
    color: "rgba(34, 197, 94, 0.5)",
    lineWidth: 1,
    lineStyle: 2,
    title: "",
    axisLabelVisible: false,
  });
}

function initVolume(chart: IChartApi, data: VolumeData[]) {
  // biome-ignore lint/suspicious/noExplicitAny: lightweight-charts v5 addSeries overload
  const series = chart.addSeries("histogram" as any, {
    priceLineVisible: false,
    priceFormat: {
      type: "volume",
    },
  }) as ISeriesApi<"Histogram">;

  if (data.length > 0) {
    series.setData(
      data.map((d) => ({
        time: d.time as Time,
        value: d.value,
        color: d.color ?? INDICATOR_COLORS.volume.up,
      }))
    );
  }
}

// ============================================
// Export
// ============================================

export const IndicatorPane = memo(IndicatorPaneComponent);

export default IndicatorPane;

// ============================================
// Sample Data
// ============================================

export const SAMPLE_RSI_DATA: RSIData[] = [
  { time: "2026-01-01", value: 45 },
  { time: "2026-01-02", value: 52 },
  { time: "2026-01-03", value: 58 },
  { time: "2026-01-04", value: 65 },
  { time: "2026-01-05", value: 72 },
  { time: "2026-01-06", value: 68 },
];

export const SAMPLE_MACD_DATA: MACDData[] = [
  { time: "2026-01-01", macd: 0.5, signal: 0.3, histogram: 0.2 },
  { time: "2026-01-02", macd: 0.8, signal: 0.4, histogram: 0.4 },
  { time: "2026-01-03", macd: 1.2, signal: 0.6, histogram: 0.6 },
  { time: "2026-01-04", macd: 1.0, signal: 0.8, histogram: 0.2 },
  { time: "2026-01-05", macd: 0.7, signal: 0.9, histogram: -0.2 },
  { time: "2026-01-06", macd: 0.4, signal: 0.8, histogram: -0.4 },
];

export const SAMPLE_STOCHASTIC_DATA: StochasticData[] = [
  { time: "2026-01-01", k: 35, d: 40 },
  { time: "2026-01-02", k: 45, d: 42 },
  { time: "2026-01-03", k: 55, d: 48 },
  { time: "2026-01-04", k: 70, d: 56 },
  { time: "2026-01-05", k: 82, d: 68 },
  { time: "2026-01-06", k: 78, d: 75 },
];

export const SAMPLE_VOLUME_DATA: VolumeData[] = [
  { time: "2026-01-01", value: 1000000, color: "rgba(34, 197, 94, 0.6)" },
  { time: "2026-01-02", value: 1200000, color: "rgba(34, 197, 94, 0.6)" },
  { time: "2026-01-03", value: 800000, color: "rgba(239, 68, 68, 0.6)" },
  { time: "2026-01-04", value: 1500000, color: "rgba(34, 197, 94, 0.6)" },
  { time: "2026-01-05", value: 900000, color: "rgba(239, 68, 68, 0.6)" },
  { time: "2026-01-06", value: 1100000, color: "rgba(34, 197, 94, 0.6)" },
];
