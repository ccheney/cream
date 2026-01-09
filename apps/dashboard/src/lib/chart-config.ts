/**
 * TradingView Lightweight Charts Configuration
 *
 * Default styling and configuration for candlestick charts.
 *
 * @see docs/plans/ui/26-data-viz.md lines 7-86
 */

import type {
  CandlestickSeriesOptions,
  ChartOptions,
  DeepPartial,
  LineSeriesOptions,
} from "lightweight-charts";

export const CHART_COLORS = {
  profit: "#22C55E",
  loss: "#EF4444",
  primary: "#D97706",
  text: "#78716C",
  grid: "rgba(120, 113, 108, 0.1)",
  background: "transparent",
} as const;

export const DEFAULT_CHART_OPTIONS: DeepPartial<ChartOptions> = {
  layout: {
    background: { color: CHART_COLORS.background },
    textColor: CHART_COLORS.text,
    fontSize: 11,
    fontFamily: "Geist Mono, monospace",
    attributionLogo: false,
  },
  grid: {
    vertLines: { color: CHART_COLORS.grid },
    horzLines: { color: CHART_COLORS.grid },
  },
  crosshair: {
    mode: 0, // CrosshairMode.Normal
    vertLine: {
      color: CHART_COLORS.primary,
      width: 1,
      style: 2, // LineStyle.Dashed
      labelBackgroundColor: CHART_COLORS.primary,
    },
    horzLine: {
      color: CHART_COLORS.primary,
      width: 1,
      style: 2, // LineStyle.Dashed
      labelBackgroundColor: CHART_COLORS.primary,
    },
  },
  timeScale: {
    borderColor: CHART_COLORS.grid,
    timeVisible: true,
    secondsVisible: false,
  },
  rightPriceScale: {
    borderColor: CHART_COLORS.grid,
  },
};

export const DEFAULT_CANDLESTICK_OPTIONS: DeepPartial<CandlestickSeriesOptions> = {
  upColor: CHART_COLORS.profit,
  downColor: CHART_COLORS.loss,
  wickUpColor: CHART_COLORS.profit,
  wickDownColor: CHART_COLORS.loss,
  borderVisible: false,
  borderUpColor: CHART_COLORS.profit,
  borderDownColor: CHART_COLORS.loss,
};

export const DEFAULT_LINE_OPTIONS: DeepPartial<LineSeriesOptions> = {
  color: CHART_COLORS.primary,
  lineWidth: 2,
  crosshairMarkerVisible: true,
  crosshairMarkerRadius: 4,
  priceLineVisible: false,
};

export interface TradeMarker {
  time: number | string;
  position: "belowBar" | "aboveBar" | "inBar";
  color: string;
  shape: "arrowUp" | "arrowDown" | "circle" | "square";
  text: string;
  size?: number;
}

export function createEntryMarker(time: number | string, text = "BUY"): TradeMarker {
  return {
    time,
    position: "belowBar",
    color: CHART_COLORS.profit,
    shape: "arrowUp",
    text,
    size: 1,
  };
}

export function createExitMarker(time: number | string, text = "SELL"): TradeMarker {
  return {
    time,
    position: "aboveBar",
    color: CHART_COLORS.loss,
    shape: "arrowDown",
    text,
    size: 1,
  };
}

export interface PriceLineConfig {
  price: number;
  color: string;
  lineWidth: number;
  lineStyle: number;
  title: string;
  axisLabelVisible: boolean;
}

export function createStopLossLine(price: number): PriceLineConfig {
  return {
    price,
    color: "rgba(239, 68, 68, 0.5)",
    lineWidth: 1,
    lineStyle: 2, // LineStyle.Dashed
    title: "Stop",
    axisLabelVisible: true,
  };
}

export function createTakeProfitLine(price: number): PriceLineConfig {
  return {
    price,
    color: "rgba(34, 197, 94, 0.5)",
    lineWidth: 1,
    lineStyle: 2, // LineStyle.Dashed
    title: "Target",
    axisLabelVisible: true,
  };
}

export interface OHLCVData {
  time: number | string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export const SAMPLE_OHLCV_DATA: OHLCVData[] = [
  { time: "2026-01-01", open: 145.0, high: 147.5, low: 144.0, close: 146.5 },
  { time: "2026-01-02", open: 146.5, high: 148.0, low: 145.5, close: 147.0 },
  { time: "2026-01-03", open: 147.0, high: 149.0, low: 146.0, close: 148.5 },
  { time: "2026-01-04", open: 148.5, high: 150.0, low: 147.0, close: 149.0 },
  { time: "2026-01-05", open: 149.0, high: 151.0, low: 148.0, close: 150.5 },
];

export default {
  CHART_COLORS,
  DEFAULT_CHART_OPTIONS,
  DEFAULT_CANDLESTICK_OPTIONS,
  DEFAULT_LINE_OPTIONS,
  createEntryMarker,
  createExitMarker,
  createStopLossLine,
  createTakeProfitLine,
  SAMPLE_OHLCV_DATA,
};
