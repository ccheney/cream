"use client";

/**
 * MACD Chart Component
 *
 * Displays MACD line, signal line, and histogram.
 * Histogram shows positive (green) and negative (red) values.
 *
 * @see docs/plans/ui/26-data-viz.md
 */

import { memo } from "react";

import { IndicatorChart, type IndicatorDataPoint, type ReferenceLine } from "./IndicatorChart";

// ============================================
// Types
// ============================================

export interface MACDChartProps {
  /** MACD line data points */
  macdLine: IndicatorDataPoint[];

  /** Signal line data points */
  signalLine: IndicatorDataPoint[];

  /** Histogram data points */
  histogram: IndicatorDataPoint[];

  /** Chart height in pixels */
  height?: number;

  /** Additional CSS class */
  className?: string;
}

// ============================================
// Constants
// ============================================

const MACD_COLOR = "#3B82F6"; // Blue
const SIGNAL_COLOR = "#EF4444"; // Red
const ZERO_LINE_COLOR = "rgba(120, 113, 108, 0.3)";

// ============================================
// Component
// ============================================

function MACDChartComponent({
  macdLine,
  signalLine,
  histogram,
  height = 150,
  className = "",
}: MACDChartProps) {
  const referenceLines: ReferenceLine[] = [
    {
      value: 0,
      color: ZERO_LINE_COLOR,
      lineWidth: 1,
    },
  ];

  return (
    <IndicatorChart
      data={macdLine}
      type="line"
      color={MACD_COLOR}
      secondaryData={signalLine}
      secondaryColor={SIGNAL_COLOR}
      histogramData={histogram}
      title="MACD (12, 26, 9)"
      referenceLines={referenceLines}
      height={height}
      className={className}
    />
  );
}

export const MACDChart = memo(MACDChartComponent);

export default MACDChart;
