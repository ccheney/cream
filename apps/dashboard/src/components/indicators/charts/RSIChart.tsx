"use client";

/**
 * RSI Chart Component
 *
 * Displays RSI with overbought/oversold bands.
 * Default bands at 70 (overbought) and 30 (oversold).
 *
 * @see docs/plans/ui/26-data-viz.md
 */

import { memo } from "react";

import { IndicatorChart, type IndicatorDataPoint, type ReferenceLine } from "./IndicatorChart";

// ============================================
// Types
// ============================================

export interface RSIChartProps {
  /** RSI data points */
  data: IndicatorDataPoint[];

  /** Overbought level (default: 70) */
  overboughtLevel?: number;

  /** Oversold level (default: 30) */
  oversoldLevel?: number;

  /** Chart height in pixels */
  height?: number;

  /** Additional CSS class */
  className?: string;
}

// ============================================
// Constants
// ============================================

const RSI_COLOR = "#8B5CF6"; // Purple
const OVERBOUGHT_COLOR = "rgba(239, 68, 68, 0.3)"; // Red
const OVERSOLD_COLOR = "rgba(34, 197, 94, 0.3)"; // Green
const NEUTRAL_COLOR = "rgba(120, 113, 108, 0.2)"; // Neutral

// ============================================
// Component
// ============================================

function RSIChartComponent({
  data,
  overboughtLevel = 70,
  oversoldLevel = 30,
  height = 150,
  className = "",
}: RSIChartProps) {
  const referenceLines: ReferenceLine[] = [
    {
      value: overboughtLevel,
      color: OVERBOUGHT_COLOR,
      lineWidth: 1,
      title: `${overboughtLevel}`,
    },
    {
      value: 50,
      color: NEUTRAL_COLOR,
      lineWidth: 1,
    },
    {
      value: oversoldLevel,
      color: OVERSOLD_COLOR,
      lineWidth: 1,
      title: `${oversoldLevel}`,
    },
  ];

  return (
    <IndicatorChart
      data={data}
      type="line"
      color={RSI_COLOR}
      title="RSI (14)"
      referenceLines={referenceLines}
      height={height}
      minValue={0}
      maxValue={100}
      className={className}
    />
  );
}

export const RSIChart = memo(RSIChartComponent);

export default RSIChart;
