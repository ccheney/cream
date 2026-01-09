/**
 * Allocation Chart Component
 *
 * Donut chart for portfolio allocation visualization.
 *
 * @see docs/plans/ui/26-data-viz.md lines 114-118
 */

"use client";

import { memo, useMemo } from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { CHART_COLORS } from "@/lib/chart-config";

// ============================================
// Types
// ============================================

export interface AllocationDataPoint {
  /** Asset or category name */
  name: string;
  /** Value or weight */
  value: number;
  /** Optional custom color */
  color?: string;
  /** Index signature for recharts compatibility */
  [key: string]: string | number | undefined;
}

export interface AllocationChartProps {
  /** Allocation data */
  data: AllocationDataPoint[];

  /** Chart size in pixels (default: 300) */
  size?: number;

  /** Inner radius percentage (default: 60 for donut) */
  innerRadius?: number;

  /** Show legend (default: true) */
  showLegend?: boolean;

  /** Show tooltip (default: true) */
  showTooltip?: boolean;

  /** Show labels on slices (default: false) */
  showLabels?: boolean;

  /** Format value for display */
  valueFormatter?: (value: number) => string;

  /** Additional CSS class */
  className?: string;
}

// ============================================
// Color Palette
// ============================================

/**
 * Chart color palette (8 colors).
 */
export const ALLOCATION_COLORS = [
  "#D97706", // primary (amber)
  "#22C55E", // green
  "#3B82F6", // blue
  "#8B5CF6", // purple
  "#EC4899", // pink
  "#14B8A6", // teal
  "#F97316", // orange
  "#78716C", // stone-500
] as const;

/**
 * Get color for allocation slice.
 */
export function getAllocationColor(index: number, customColor?: string): string {
  if (customColor) {
    return customColor;
  }
  return ALLOCATION_COLORS[index % ALLOCATION_COLORS.length] || ALLOCATION_COLORS[0];
}

// ============================================
// Formatters
// ============================================

/**
 * Default value formatter (percentage).
 */
function defaultValueFormatter(value: number): string {
  return `${value.toFixed(1)}%`;
}

/**
 * Calculate percentage of total.
 */
function calculatePercentage(value: number, total: number): number {
  if (total === 0) {
    return 0;
  }
  return (value / total) * 100;
}

// ============================================
// Custom Tooltip
// ============================================

interface CustomTooltipPayload {
  name: string;
  value: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: CustomTooltipPayload }>;
  total: number;
  valueFormatter: (value: number) => string;
}

function CustomTooltip({ active, payload, total, valueFormatter }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const data = payload[0]?.payload;
  if (!data) {
    return null;
  }
  const percentage = calculatePercentage(data.value, total);

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
      <p style={{ color: CHART_COLORS.text, margin: 0, marginBottom: 4 }}>{data.name}</p>
      <p style={{ color: CHART_COLORS.primary, margin: 0, fontWeight: 600 }}>
        {valueFormatter(percentage)}
      </p>
    </div>
  );
}

// ============================================
// Custom Label
// ============================================

interface LabelProps {
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  percent?: number;
  name?: string;
}

function renderCustomLabel({ cx, cy, midAngle, outerRadius, percent, name }: LabelProps) {
  if (
    cx === undefined ||
    cy === undefined ||
    midAngle === undefined ||
    outerRadius === undefined ||
    percent === undefined ||
    percent < 0.05
  ) {
    return null;
  }

  const RADIAN = Math.PI / 180;
  const radius = outerRadius + 20;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill={CHART_COLORS.text}
      textAnchor={x > cx ? "start" : "end"}
      dominantBaseline="central"
      fontSize={10}
      fontFamily="Geist Mono, monospace"
    >
      {name ?? ""} ({(percent * 100).toFixed(0)}%)
    </text>
  );
}

// ============================================
// Custom Legend
// ============================================

interface LegendPayloadEntry {
  value?: string;
  color?: string;
  payload?: {
    value?: number;
    strokeDasharray?: string | number;
  };
}

interface CustomLegendProps {
  payload?: readonly LegendPayloadEntry[];
  total: number;
  valueFormatter: (value: number) => string;
}

function renderCustomLegend(props: CustomLegendProps) {
  const { payload, total, valueFormatter } = props;

  if (!payload) {
    return null;
  }

  return (
    <ul
      style={{
        listStyle: "none",
        padding: 0,
        margin: 0,
        fontFamily: "Geist Mono, monospace",
        fontSize: 11,
      }}
    >
      {payload.map((entry, index) => {
        const percentage = calculatePercentage(entry.payload?.value ?? 0, total);
        return (
          <li
            key={`legend-${entry.value ?? index}`}
            style={{
              display: "flex",
              alignItems: "center",
              marginBottom: 4,
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                borderRadius: 2,
                backgroundColor: entry.color || CHART_COLORS.primary,
                marginRight: 8,
              }}
            />
            <span style={{ color: CHART_COLORS.text, flex: 1 }}>{entry.value}</span>
            <span style={{ color: CHART_COLORS.primary, fontWeight: 500 }}>
              {valueFormatter(percentage)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// ============================================
// Component
// ============================================

/**
 * Allocation donut chart component.
 */
function AllocationChartComponent({
  data,
  size = 300,
  innerRadius = 60,
  showLegend = true,
  showTooltip = true,
  showLabels = false,
  valueFormatter = defaultValueFormatter,
  className,
}: AllocationChartProps) {
  // Calculate total
  const total = useMemo(() => data.reduce((sum, d) => sum + d.value, 0), [data]);

  // Calculate radii
  const outerRadius = size / 2 - 40;
  const innerRadiusPx = outerRadius * (innerRadius / 100);

  if (data.length === 0) {
    return (
      <div
        className={className}
        style={{
          width: `${size}px`,
          height: `${size}px`,
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
        width: showLegend ? `${size + 150}px` : `${size}px`,
        height: `${size}px`,
        display: "flex",
        alignItems: "center",
      }}
    >
      <ResponsiveContainer width={size} height={size}>
        <PieChart>
          {showTooltip && (
            <Tooltip content={<CustomTooltip total={total} valueFormatter={valueFormatter} />} />
          )}

          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={innerRadiusPx}
            outerRadius={outerRadius}
            dataKey="value"
            nameKey="name"
            label={showLabels ? renderCustomLabel : undefined}
            labelLine={showLabels}
            animationDuration={300}
          >
            {data.map((entry, index) => (
              <Cell
                key={`cell-${entry.name}`}
                fill={getAllocationColor(index, entry.color)}
                stroke="transparent"
              />
            ))}
          </Pie>

          {showLegend && (
            <Legend
              layout="vertical"
              align="right"
              verticalAlign="middle"
              content={(props) =>
                renderCustomLegend({
                  payload: props.payload as readonly LegendPayloadEntry[] | undefined,
                  total,
                  valueFormatter,
                })
              }
            />
          )}
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Memoized AllocationChart component.
 */
export const AllocationChart = memo(AllocationChartComponent);

export default AllocationChart;

// ============================================
// Sample Data Export
// ============================================

/**
 * Sample allocation data for testing.
 */
export const SAMPLE_ALLOCATION_DATA: AllocationDataPoint[] = [
  { name: "AAPL", value: 25 },
  { name: "MSFT", value: 20 },
  { name: "GOOGL", value: 15 },
  { name: "AMZN", value: 15 },
  { name: "NVDA", value: 10 },
  { name: "Cash", value: 15 },
];
