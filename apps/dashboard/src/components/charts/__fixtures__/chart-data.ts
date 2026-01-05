/**
 * Chart Test Fixtures
 *
 * Sample data for testing chart components.
 */

import type { OHLCVData, PriceLineConfig, TradeMarker } from "@/lib/chart-config";
import type { AllocationDataPoint } from "../AllocationChart";
import type { EquityDataPoint } from "../EquityCurve";
import type { ReturnsDataPoint } from "../ReturnsChart";

// ============================================
// OHLCV Candlestick Data
// ============================================

/**
 * Generate OHLCV data for testing.
 */
export function generateOHLCVData(days: number, startPrice = 100): OHLCVData[] {
  const data: OHLCVData[] = [];
  let price = startPrice;
  const now = new Date();

  for (let i = days; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);

    const open = price;
    const change = (Math.random() - 0.5) * 4;
    const close = open + change;
    const high = Math.max(open, close) + Math.random() * 2;
    const low = Math.min(open, close) - Math.random() * 2;
    const volume = Math.floor(Math.random() * 1000000) + 100000;

    data.push({
      time: date.toISOString().split("T")[0]!,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume,
    });

    price = close;
  }

  return data;
}

/** Sample 30-day OHLCV data */
export const sampleOHLCVData: OHLCVData[] = generateOHLCVData(30);

/** Empty OHLCV data */
export const emptyOHLCVData: OHLCVData[] = [];

/** Single candle */
export const singleCandleData: OHLCVData[] = [
  { time: "2026-01-04", open: 100, high: 105, low: 98, close: 103, volume: 500000 },
];

/** Large dataset (1000 candles) */
export const largeOHLCVData: OHLCVData[] = generateOHLCVData(1000);

// ============================================
// Trade Markers
// ============================================

/** Sample trade markers */
export const sampleMarkers: TradeMarker[] = [
  {
    time: "2026-01-02",
    position: "belowBar",
    color: "#22c55e",
    shape: "arrowUp",
    text: "BUY @ 100.50",
  },
  {
    time: "2026-01-03",
    position: "aboveBar",
    color: "#ef4444",
    shape: "arrowDown",
    text: "SELL @ 105.20",
  },
];

/** Empty markers */
export const emptyMarkers: TradeMarker[] = [];

// ============================================
// Price Lines
// ============================================

/** Sample price lines */
export const samplePriceLines: PriceLineConfig[] = [
  {
    price: 95,
    color: "#ef4444",
    lineWidth: 2,
    lineStyle: 2,
    title: "Stop Loss",
    axisLabelVisible: true,
  },
  {
    price: 110,
    color: "#22c55e",
    lineWidth: 2,
    lineStyle: 2,
    title: "Take Profit",
    axisLabelVisible: true,
  },
];

/** Empty price lines */
export const emptyPriceLines: PriceLineConfig[] = [];

// ============================================
// Equity Curve Data
// ============================================

/**
 * Generate equity data for testing.
 */
export function generateEquityData(days: number, startEquity = 100000): EquityDataPoint[] {
  const data: EquityDataPoint[] = [];
  let equity = startEquity;
  let peak = equity;
  const now = new Date();

  for (let i = days; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);

    const dailyReturn = (Math.random() - 0.45) * 0.02;
    equity = equity * (1 + dailyReturn);

    peak = Math.max(peak, equity);
    const drawdown = ((peak - equity) / peak) * 100;

    data.push({
      time: date.toISOString().split("T")[0]!,
      value: Math.round(equity * 100) / 100,
      drawdown: Math.round(drawdown * 100) / 100,
    });
  }

  return data;
}

/** Sample equity data */
export const sampleEquityData: EquityDataPoint[] = generateEquityData(90);

/** Empty equity data */
export const emptyEquityData: EquityDataPoint[] = [];

/** Single point equity data */
export const singlePointEquityData: EquityDataPoint[] = [{ time: "2026-01-04", value: 100000 }];

/** All positive equity (upward trend) */
export const upwardEquityData: EquityDataPoint[] = [
  { time: "2026-01-01", value: 100000 },
  { time: "2026-01-02", value: 101000 },
  { time: "2026-01-03", value: 102500 },
  { time: "2026-01-04", value: 104000 },
];

/** Drawdown equity data */
export const drawdownEquityData: EquityDataPoint[] = [
  { time: "2026-01-01", value: 100000, drawdown: 0 },
  { time: "2026-01-02", value: 95000, drawdown: 5 },
  { time: "2026-01-03", value: 90000, drawdown: 10 },
  { time: "2026-01-04", value: 85000, drawdown: 15 },
];

// ============================================
// Allocation Data
// ============================================

/** Sample allocation data */
export const sampleAllocationData: AllocationDataPoint[] = [
  { name: "Technology", value: 35, color: "#3b82f6" },
  { name: "Healthcare", value: 25, color: "#22c55e" },
  { name: "Financials", value: 20, color: "#f59e0b" },
  { name: "Energy", value: 15, color: "#ef4444" },
  { name: "Other", value: 5, color: "#78716c" },
];

/** Empty allocation data */
export const emptyAllocationData: AllocationDataPoint[] = [];

/** Single slice allocation */
export const singleSliceData: AllocationDataPoint[] = [{ name: "Cash", value: 100 }];

/** Two slice allocation */
export const twoSliceData: AllocationDataPoint[] = [
  { name: "Long", value: 70, color: "#22c55e" },
  { name: "Short", value: 30, color: "#ef4444" },
];

// ============================================
// Returns Data
// ============================================

/** Sample monthly returns */
export const sampleReturnsData: ReturnsDataPoint[] = [
  { period: "Jan", value: 3.2 },
  { period: "Feb", value: -1.5 },
  { period: "Mar", value: 2.8 },
  { period: "Apr", value: 4.1 },
  { period: "May", value: -0.8 },
  { period: "Jun", value: 1.9 },
];

/** Empty returns data */
export const emptyReturnsData: ReturnsDataPoint[] = [];

/** All positive returns */
export const allPositiveReturns: ReturnsDataPoint[] = [
  { period: "Q1", value: 5.2 },
  { period: "Q2", value: 3.8 },
  { period: "Q3", value: 7.1 },
  { period: "Q4", value: 4.5 },
];

/** All negative returns */
export const allNegativeReturns: ReturnsDataPoint[] = [
  { period: "Q1", value: -2.5 },
  { period: "Q2", value: -4.1 },
  { period: "Q3", value: -1.8 },
  { period: "Q4", value: -3.2 },
];

// ============================================
// Sparkline Data
// ============================================

/** Upward trend */
export const upwardSparklineData: number[] = [10, 12, 11, 15, 18, 16, 20, 22, 25];

/** Downward trend */
export const downwardSparklineData: number[] = [25, 22, 20, 16, 18, 15, 11, 12, 10];

/** Flat trend */
export const flatSparklineData: number[] = [20, 19, 21, 20, 22, 21, 20, 19, 21];

/** Volatile trend */
export const volatileSparklineData: number[] = [15, 25, 12, 28, 10, 30, 8, 26, 14];

/** Empty sparkline data */
export const emptySparklineData: number[] = [];

/** Single point sparkline */
export const singlePointSparklineData: number[] = [50];

/** Large sparkline dataset */
export const largeSparklineData: number[] = Array.from({ length: 100 }, () => Math.random() * 100);

// ============================================
// Gauge Data
// ============================================

/** Comfortable zone value */
export const comfortableGaugeValue = 35;

/** Warning zone value */
export const warningGaugeValue = 72;

/** Critical zone value */
export const criticalGaugeValue = 92;

/** Edge values */
export const minGaugeValue = 0;
export const maxGaugeValue = 100;

// ============================================
// Edge Cases
// ============================================

/** Data with null values */
export const nullValueData: (number | null)[] = [10, null, 15, null, 20];

/** Data with undefined values */
export const undefinedValueData: (number | undefined)[] = [10, undefined, 15, undefined, 20];

/** Very large numbers */
export const largeNumberData: number[] = [1e12, 2e12, 1.5e12, 3e12];

/** Very small numbers */
export const smallNumberData: number[] = [0.0001, 0.0002, 0.00015, 0.0003];

/** Negative numbers */
export const negativeNumberData: number[] = [-10, -5, -15, -8, -12];

/** Mixed positive/negative */
export const mixedNumberData: number[] = [-10, 5, -3, 8, -2, 12];
