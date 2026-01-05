/**
 * Equity Curve Component
 *
 * Area chart with gradient fill for portfolio equity visualization.
 *
 * @see docs/plans/ui/26-data-viz.md lines 93-112
 */

"use client";

import { memo, useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
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

export interface EquityDataPoint {
  /** Timestamp or date string */
  time: string | number;
  /** Equity value */
  value: number;
  /** Optional: drawdown percentage */
  drawdown?: number;
}

export interface EquityCurveProps {
  /** Equity time series data */
  data: EquityDataPoint[];

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

  /** Format value for display */
  valueFormatter?: (value: number) => string;

  /** Format time for display */
  timeFormatter?: (time: string | number) => string;

  /** Additional CSS class */
  className?: string;
}

// ============================================
// Formatters
// ============================================

/**
 * Default value formatter (currency).
 */
function defaultValueFormatter(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Default time formatter.
 */
function defaultTimeFormatter(time: string | number): string {
  if (typeof time === "number") {
    return new Date(time).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }
  return time;
}

// ============================================
// Custom Tooltip
// ============================================

interface CustomTooltipPayload {
  value: number;
  time: string | number;
  drawdown?: number;
}

function CustomTooltip({
  active,
  payload,
  valueFormatter,
  timeFormatter,
}: TooltipProps<number, string> & {
  valueFormatter: (value: number) => string;
  timeFormatter: (time: string | number) => string;
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const data = payload[0]?.payload as CustomTooltipPayload;

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
      <p style={{ color: CHART_COLORS.text, margin: 0, marginBottom: 4 }}>
        {timeFormatter(data.time)}
      </p>
      <p style={{ color: CHART_COLORS.primary, margin: 0, fontWeight: 600 }}>
        {valueFormatter(data.value)}
      </p>
      {data.drawdown !== undefined && (
        <p style={{ color: CHART_COLORS.loss, margin: 0, marginTop: 4 }}>
          Drawdown: {(data.drawdown * 100).toFixed(2)}%
        </p>
      )}
    </div>
  );
}

// ============================================
// Component
// ============================================

/**
 * Equity curve area chart with gradient fill.
 */
function EquityCurveComponent({
  data,
  width = "100%",
  height = 300,
  showGrid = true,
  showTooltip = true,
  showXAxis = true,
  showYAxis = true,
  valueFormatter = defaultValueFormatter,
  timeFormatter = defaultTimeFormatter,
  className,
}: EquityCurveProps) {
  // Generate unique gradient ID
  const gradientId = useMemo(() => `equityGradient-${Math.random().toString(36).slice(2, 9)}`, []);

  // Calculate Y axis domain with padding
  const yDomain = useMemo(() => {
    if (data.length === 0) {
      return [0, 100];
    }
    const values = data.map((d) => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = (max - min) * 0.1 || max * 0.1;
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
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.primary} stopOpacity={0.3} />
              <stop offset="100%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
            </linearGradient>
          </defs>

          {showGrid && (
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
          )}

          {showXAxis && (
            <XAxis
              dataKey="time"
              stroke={CHART_COLORS.text}
              tick={{ fill: CHART_COLORS.text, fontSize: 10 }}
              tickFormatter={timeFormatter}
              axisLine={{ stroke: CHART_COLORS.grid }}
              tickLine={{ stroke: CHART_COLORS.grid }}
            />
          )}

          {showYAxis && (
            <YAxis
              domain={yDomain}
              stroke={CHART_COLORS.text}
              tick={{ fill: CHART_COLORS.text, fontSize: 10 }}
              tickFormatter={valueFormatter}
              axisLine={{ stroke: CHART_COLORS.grid }}
              tickLine={{ stroke: CHART_COLORS.grid }}
              width={80}
            />
          )}

          {showTooltip && (
            <Tooltip
              content={
                <CustomTooltip valueFormatter={valueFormatter} timeFormatter={timeFormatter} />
              }
            />
          )}

          <Area
            type="monotone"
            dataKey="value"
            stroke={CHART_COLORS.primary}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            animationDuration={300}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Memoized EquityCurve component.
 */
export const EquityCurve = memo(EquityCurveComponent);

export default EquityCurve;

// ============================================
// Sample Data Export
// ============================================

/**
 * Sample equity curve data for testing.
 */
export const SAMPLE_EQUITY_DATA: EquityDataPoint[] = [
  { time: "2026-01-01", value: 100000 },
  { time: "2026-01-02", value: 101500 },
  { time: "2026-01-03", value: 103200, drawdown: -0.02 },
  { time: "2026-01-04", value: 102800, drawdown: -0.024 },
  { time: "2026-01-05", value: 105100 },
  { time: "2026-01-06", value: 106800 },
  { time: "2026-01-07", value: 108500 },
];
