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
  createChart,
  type IChartApi,
  type ISeriesApi,
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

// ============================================
// Types
// ============================================

export interface TradingViewChartProps {
  /** OHLCV data for the chart */
  data: OHLCVData[];

  /** Trade markers to display */
  markers?: TradeMarker[];

  /** Price lines (stop-loss, take-profit) */
  priceLines?: PriceLineConfig[];

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

// ============================================
// Component
// ============================================

/**
 * TradingView Lightweight Charts candlestick component.
 */
function TradingViewChartComponent({
  data,
  markers = [],
  priceLines = [],
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
  const priceLineRefs = useRef<Map<string, any>>(new Map());

  // Initialize chart
  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    // Create chart
    const chart = createChart(containerRef.current, {
      ...DEFAULT_CHART_OPTIONS,
      width: typeof width === "number" ? width : containerRef.current.clientWidth,
      height,
    });

    chartRef.current = chart;

    // Add candlestick series
    const series = chart.addSeries(
      "candlestick" as any,
      DEFAULT_CANDLESTICK_OPTIONS
    ) as ISeriesApi<"Candlestick">;
    seriesRef.current = series;

    // Set data
    if (data.length > 0) {
      const formattedData = data.map((d) => ({
        time: d.time as Time,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      }));
      series.setData(formattedData);
    }

    // Subscribe to crosshair move
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

    // Fit content
    chart.timeScale().fitContent();

    // Notify ready
    onReady?.(chart);

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      priceLineRefs.current.clear();
    };
  }, [height, onCrosshairMove, onReady, width, data.length, data.map]);

  // Update data
  useEffect(() => {
    if (!seriesRef.current || data.length === 0) {
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
    chartRef.current?.timeScale().fitContent();
  }, [data]);

  // Update markers
  useEffect(() => {
    if (!seriesRef.current) {
      return;
    }

    const formattedMarkers = markers.map((m) => ({
      time: m.time as Time,
      position: m.position,
      color: m.color,
      shape: m.shape,
      text: m.text,
    }));

    // Type assertion for setMarkers which exists on candlestick series
    (seriesRef.current as any).setMarkers(formattedMarkers);
  }, [markers]);

  // Update price lines
  useEffect(() => {
    if (!seriesRef.current) {
      return;
    }

    // Remove old price lines
    for (const [_key, priceLine] of priceLineRefs.current) {
      seriesRef.current.removePriceLine(priceLine);
    }
    priceLineRefs.current.clear();

    // Add new price lines
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
