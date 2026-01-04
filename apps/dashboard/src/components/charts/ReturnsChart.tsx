/**
 * Returns Chart Component
 *
 * Bar chart for monthly returns visualization with positive/negative coloring.
 *
 * @see docs/plans/ui/26-data-viz.md lines 120-125
 */

"use client";

import { memo, useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  type TooltipProps,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_COLORS } from "@/lib/chart-config";

// ============================================
// Types
// ============================================

export interface ReturnsDataPoint {
  /** Period label (e.g., "Jan 2026", "2026-01") */
  period: string;
  /** Return percentage */
  value: number;
}

export interface ReturnsChartProps {
  /** Returns data */
  data: ReturnsDataPoint[];

  /** Chart width (default: 100%) */
  width?: number | string;

  /** Chart height in pixels (default: 300) */
  height?: number;

  /** Show grid lines (default: true) */
  showGrid?: boolean;

  /** Show tooltip (default: true) */
  showTooltip?: boolean;

  /** Show X axis (default: true) */
  showXAxis?: boolean;

  /** Show Y axis (default: true) */
  showYAxis?: boolean;

  /** Show zero reference line (default: true) */
  showZeroLine?: boolean;

  /** Bar radius (default: 4) */
  barRadius?: number;

  /** Format value for display */
  valueFormatter?: (value: number) => string;

  /** Additional CSS class */
  className?: string;
}

// ============================================
// Color Helpers
// ============================================

/**
 * Get bar color based on value.
 */
export function getReturnColor(value: number): string {
  if (value > 0) {
    return CHART_COLORS.profit;
  }
  if (value < 0) {
    return CHART_COLORS.loss;
  }
  return CHART_COLORS.text;
}

// ============================================
// Formatters
// ============================================

/**
 * Default value formatter (percentage).
 */
function defaultValueFormatter(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

// ============================================
// Custom Tooltip
// ============================================

interface CustomTooltipPayload {
  period: string;
  value: number;
}

function CustomTooltip({
  active,
  payload,
  valueFormatter,
}: TooltipProps<number, string> & {
  valueFormatter: (value: number) => string;
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const data = payload[0].payload as CustomTooltipPayload;
  const color = getReturnColor(data.value);

  return (
    <div
      style={{
        backgroundColor: "#1C1917",
        border: `1px solid ${CHART_COLORS.grid}`,
        borderRadius: 4,
        padding: "8px 12px",
        fontFamily: "Geist Mono, monospace",
        fontSize: 11,
      }}
    >
      <p style={{ color: CHART_COLORS.text, margin: 0, marginBottom: 4 }}>{data.period}</p>
      <p style={{ color, margin: 0, fontWeight: 600 }}>{valueFormatter(data.value)}</p>
    </div>
  );
}

// ============================================
// Custom Bar Shape
// ============================================

interface CustomBarProps {
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  radius: number;
}

function CustomBar({ x, y, width, height, fill, radius }: CustomBarProps) {
  // Calculate rounded corners (only top for positive, only bottom for negative)
  const _isPositive = y < 0 || height > 0;
  const r = Math.min(radius, Math.abs(height) / 2, width / 2);

  if (height === 0) {
    return null;
  }

  // For positive values: round top corners
  // For negative values: round bottom corners
  const path =
    height >= 0
      ? `M ${x},${y + height}
         L ${x},${y + r}
         Q ${x},${y} ${x + r},${y}
         L ${x + width - r},${y}
         Q ${x + width},${y} ${x + width},${y + r}
         L ${x + width},${y + height}
         Z`
      : `M ${x},${y}
         L ${x},${y + height - r}
         Q ${x},${y + height} ${x + r},${y + height}
         L ${x + width - r},${y + height}
         Q ${x + width},${y + height} ${x + width},${y + height - r}
         L ${x + width},${y}
         Z`;

  return <path d={path} fill={fill} />;
}

// ============================================
// Component
// ============================================

/**
 * Returns bar chart component with positive/negative coloring.
 */
function ReturnsChartComponent({
  data,
  width = "100%",
  height = 300,
  showGrid = true,
  showTooltip = true,
  showXAxis = true,
  showYAxis = true,
  showZeroLine = true,
  barRadius = 4,
  valueFormatter = defaultValueFormatter,
  className,
}: ReturnsChartProps) {
  // Calculate Y axis domain with padding
  const yDomain = useMemo(() => {
    if (data.length === 0) {
      return [-10, 10];
    }
    const values = data.map((d) => d.value);
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 0);
    const padding = Math.max(Math.abs(max - min) * 0.1, 1);
    return [min - padding, max + padding];
  }, [data]);

  if (data.length === 0) {
    return (
      <div
        className={className}
        style={{
          width: typeof width === "number" ? `${width}px` : width,
          height: `${height}px`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: CHART_COLORS.text,
          fontFamily: "Geist Mono, monospace",
          fontSize: 12,
        }}
      >
        No data
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{
        width: typeof width === "number" ? `${width}px` : width,
        height: `${height}px`,
      }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
          {showGrid && (
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
          )}

          {showXAxis && (
            <XAxis
              dataKey="period"
              stroke={CHART_COLORS.text}
              tick={{ fill: CHART_COLORS.text, fontSize: 10 }}
              axisLine={{ stroke: CHART_COLORS.grid }}
              tickLine={{ stroke: CHART_COLORS.grid }}
            />
          )}

          {showYAxis && (
            <YAxis
              domain={yDomain}
              stroke={CHART_COLORS.text}
              tick={{ fill: CHART_COLORS.text, fontSize: 10 }}
              tickFormatter={(value) => `${value}%`}
              axisLine={{ stroke: CHART_COLORS.grid }}
              tickLine={{ stroke: CHART_COLORS.grid }}
              width={50}
            />
          )}

          {showZeroLine && <ReferenceLine y={0} stroke={CHART_COLORS.text} strokeWidth={1} />}

          {showTooltip && (
            <Tooltip
              content={<CustomTooltip valueFormatter={valueFormatter} />}
              cursor={{ fill: "rgba(120, 113, 108, 0.1)" }}
            />
          )}

          <Bar
            dataKey="value"
            animationDuration={300}
            shape={(props: CustomBarProps) => <CustomBar {...props} radius={barRadius} />}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={getReturnColor(entry.value)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Memoized ReturnsChart component.
 */
export const ReturnsChart = memo(ReturnsChartComponent);

export default ReturnsChart;

// ============================================
// Sample Data Export
// ============================================

/**
 * Sample returns data for testing.
 */
export const SAMPLE_RETURNS_DATA: ReturnsDataPoint[] = [
  { period: "Jan", value: 3.2 },
  { period: "Feb", value: -1.5 },
  { period: "Mar", value: 2.8 },
  { period: "Apr", value: 4.1 },
  { period: "May", value: -0.5 },
  { period: "Jun", value: 1.9 },
  { period: "Jul", value: -2.3 },
  { period: "Aug", value: 5.2 },
  { period: "Sep", value: -1.1 },
  { period: "Oct", value: 3.8 },
  { period: "Nov", value: 2.5 },
  { period: "Dec", value: 1.4 },
];
