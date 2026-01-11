"use client";

/**
 * ATR Chart Component
 *
 * Displays Average True Range as an area chart.
 * Shows volatility levels over time.
 *
 * @see docs/plans/ui/26-data-viz.md
 */

import { memo } from "react";

import { IndicatorChart, type IndicatorDataPoint } from "./IndicatorChart";

// ============================================
// Types
// ============================================

export interface ATRChartProps {
  /** ATR data points */
  data: IndicatorDataPoint[];

  /** Chart height in pixels */
  height?: number;

  /** Additional CSS class */
  className?: string;
}

// ============================================
// Constants
// ============================================

const ATR_COLOR = "#F59E0B"; // Amber

// ============================================
// Component
// ============================================

function ATRChartComponent({ data, height = 120, className = "" }: ATRChartProps) {
  return (
    <IndicatorChart
      data={data}
      type="area"
      color={ATR_COLOR}
      title="ATR (14)"
      height={height}
      className={className}
    />
  );
}

export const ATRChart = memo(ATRChartComponent);

export default ATRChart;
