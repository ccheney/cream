"use client";

/**
 * Base Indicator Chart Component
 *
 * Reusable TradingView Lightweight Charts component for technical indicators.
 * Supports line charts, area charts, and histograms with optional reference bands.
 *
 * @see docs/plans/ui/26-data-viz.md
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
import { memo, useCallback, useEffect, useRef } from "react";

import { CHART_COLORS, DEFAULT_CHART_OPTIONS } from "@/lib/chart-config";

// ============================================
// Types
// ============================================

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
  /** Data points for the indicator */
  data: IndicatorDataPoint[];

  /** Chart type */
  type?: ChartType;

  /** Line/area color */
  color?: string;

  /** Secondary data (e.g., MACD signal line) */
  secondaryData?: IndicatorDataPoint[];

  /** Secondary line color */
  secondaryColor?: string;

  /** Histogram data (e.g., MACD histogram) */
  histogramData?: IndicatorDataPoint[];

  /** Reference lines (e.g., overbought/oversold levels) */
  referenceLines?: ReferenceLine[];

  /** Reference zones (e.g., RSI bands) */
  referenceZones?: ReferenceZone[];

  /** Chart title displayed in top left */
  title?: string;

  /** Chart height in pixels */
  height?: number;

  /** Y-axis minimum value (auto if not set) */
  minValue?: number;

  /** Y-axis maximum value (auto if not set) */
  maxValue?: number;

  /** Auto-resize to container */
  autoResize?: boolean;

  /** Additional CSS class */
  className?: string;
}

// ============================================
// Chart Options
// ============================================

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

// ============================================
// Helper Functions
// ============================================

function formatData(data: IndicatorDataPoint[]): Array<{ time: Time; value: number }> {
  return data.map((d) => ({
    time: d.time as Time,
    value: d.value,
  }));
}

function formatHistogramData(
  data: IndicatorDataPoint[],
  positiveColor: string,
  negativeColor: string
): Array<{ time: Time; value: number; color: string }> {
  return data.map((d) => ({
    time: d.time as Time,
    value: d.value,
    color: d.value >= 0 ? positiveColor : negativeColor,
  }));
}

// ============================================
// Component
// ============================================

function IndicatorChartComponent({
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
  const mainSeriesRef = useRef<ISeriesApi<"Line"> | ISeriesApi<"Area"> | null>(null);
  const secondarySeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const histogramSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  // Initialize chart
  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const chart = createChart(containerRef.current, {
      ...INDICATOR_CHART_OPTIONS,
      width: containerRef.current.clientWidth,
      height,
    });

    chartRef.current = chart;

    // Configure price scale if min/max set
    if (minValue !== undefined || maxValue !== undefined) {
      chart.priceScale("right").applyOptions({
        autoScale: false,
      });
    }

    // Add histogram series first (behind main line)
    if (histogramData && histogramData.length > 0) {
      const histogramSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: "price", precision: 4 },
        priceScaleId: "right",
      }) as ISeriesApi<"Histogram">;
      histogramSeriesRef.current = histogramSeries;

      const formatted = formatHistogramData(histogramData, CHART_COLORS.profit, CHART_COLORS.loss);
      histogramSeries.setData(formatted);
    }

    // Add main series
    if (type === "area") {
      const areaSeries = chart.addSeries(AreaSeries, {
        lineColor: color,
        topColor: `${color}50`,
        bottomColor: `${color}05`,
        lineWidth: 2,
        priceLineVisible: false,
      }) as ISeriesApi<"Area">;
      mainSeriesRef.current = areaSeries;
    } else {
      const lineSeries = chart.addSeries(LineSeries, {
        color,
        lineWidth: 2,
        priceLineVisible: false,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
      }) as ISeriesApi<"Line">;
      mainSeriesRef.current = lineSeries;
    }

    // Add secondary line series
    if (secondaryData && secondaryData.length > 0) {
      const secondarySeries = chart.addSeries(LineSeries, {
        color: secondaryColor,
        lineWidth: 1,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
      }) as ISeriesApi<"Line">;
      secondarySeriesRef.current = secondarySeries;
    }

    // Add reference lines as price lines
    if (mainSeriesRef.current) {
      for (const line of referenceLines) {
        mainSeriesRef.current.createPriceLine({
          price: line.value,
          color: line.color,
          lineWidth: (line.lineWidth ?? 1) as 1 | 2 | 3 | 4,
          lineStyle: 2, // Dashed
          title: line.title ?? "",
          axisLabelVisible: false,
        });
      }
    }

    // Set data
    if (data.length > 0 && mainSeriesRef.current) {
      const formatted = formatData(data);
      mainSeriesRef.current.setData(formatted);
    }

    if (secondaryData && secondaryData.length > 0 && secondarySeriesRef.current) {
      const formatted = formatData(secondaryData);
      secondarySeriesRef.current.setData(formatted);
    }

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
    height,
    minValue,
    maxValue,
    referenceLines,
    histogramData,
    secondaryData,
    data,
  ]);

  // Update data when changed
  useEffect(() => {
    if (data.length > 0 && mainSeriesRef.current) {
      const formatted = formatData(data);
      mainSeriesRef.current.setData(formatted);
      chartRef.current?.timeScale().fitContent();
    }
  }, [data]);

  useEffect(() => {
    if (secondaryData && secondaryData.length > 0 && secondarySeriesRef.current) {
      const formatted = formatData(secondaryData);
      secondarySeriesRef.current.setData(formatted);
    }
  }, [secondaryData]);

  useEffect(() => {
    if (histogramData && histogramData.length > 0 && histogramSeriesRef.current) {
      const formatted = formatHistogramData(histogramData, CHART_COLORS.profit, CHART_COLORS.loss);
      histogramSeriesRef.current.setData(formatted);
    }
  }, [histogramData]);

  // Handle resize
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
    <div className={`relative ${className}`}>
      {title && (
        <div className="absolute top-2 left-2 z-10 text-xs font-medium text-stone-500 dark:text-stone-400">
          {title}
        </div>
      )}
      <div ref={containerRef} style={{ width: "100%", height: `${height}px` }} />
    </div>
  );
}

export const IndicatorChart = memo(IndicatorChartComponent);

export default IndicatorChart;
