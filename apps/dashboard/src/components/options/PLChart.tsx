/**
 * PLChart Component
 *
 * Interactive profit/loss visualization chart for options strategies.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 2.3
 */

"use client";

import { memo, useCallback, useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { usePLData } from "@/hooks/usePLData";
import { CHART_COLORS } from "@/lib/chart-config";
import type { OptionLeg, PLAnalysis, PLDataPoint } from "./PLCalculator";

export interface PLChartProps {
  /** Option legs */
  legs: OptionLeg[];
  /** Current underlying price */
  underlyingPrice: number;
  /** Show P/L at expiration line (default: true) */
  showAtExpiration?: boolean;
  /** Show P/L today line (default: true) */
  showToday?: boolean;
  /** Show break-even markers (default: true) */
  showBreakeven?: boolean;
  /** Show current price marker (default: true) */
  showCurrentPrice?: boolean;
  /** Custom price range */
  priceRange?: { min: number; max: number };
  /** Price range percentage (default: 20) */
  rangePercent?: number;
  /** Chart height (default: 300) */
  height?: number;
  /** Callback when hovering over chart */
  onPriceHover?: (price: number, pnlAtExpiration: number, pnlToday: number) => void;
  /** Additional class names */
  className?: string;
}

interface CustomTooltipPayload extends PLDataPoint {
  name?: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: CustomTooltipPayload }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const data = payload[0]?.payload;
  if (!data) {
    return null;
  }
  const expColor = data.pnlAtExpiration >= 0 ? CHART_COLORS.profit : CHART_COLORS.loss;
  const todayColor = data.pnlToday >= 0 ? CHART_COLORS.profit : CHART_COLORS.loss;

  const formatPnl = (value: number) => {
    const sign = value >= 0 ? "+" : "";
    return `${sign}$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  };

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
        ${data.price.toFixed(2)}
      </p>
      <p style={{ color: expColor, margin: 0, marginBottom: 2 }}>
        At Exp: {formatPnl(data.pnlAtExpiration)}
      </p>
      <p style={{ color: todayColor, margin: 0 }}>Today: {formatPnl(data.pnlToday)}</p>
    </div>
  );
}

interface ChartLegendProps {
  showAtExpiration: boolean;
  showToday: boolean;
  analysis: PLAnalysis;
  dte: number;
}

const ChartLegend = memo(function ChartLegend({
  showAtExpiration,
  showToday,
  analysis,
  dte,
}: ChartLegendProps) {
  const formatPnl = (value: number) => {
    if (!Number.isFinite(value)) {
      return "Unlimited";
    }
    const sign = value >= 0 ? "+" : "";
    return `${sign}$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  };

  return (
    <div className="flex flex-wrap items-center gap-4 text-xs mt-2">
      {showAtExpiration && (
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-0.5" style={{ backgroundColor: CHART_COLORS.profit }} />
          <span className="text-stone-500 dark:text-night-300">At Expiration</span>
        </div>
      )}
      {showToday && (
        <div className="flex items-center gap-1.5">
          <div
            className="w-4 h-0.5"
            style={{ backgroundColor: CHART_COLORS.primary, borderStyle: "dashed" }}
          />
          <span className="text-stone-500 dark:text-night-300">Today (+{dte}d)</span>
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <span className="text-stone-500 dark:text-night-300">Max Profit:</span>
        <span className="text-green-500 font-mono">{formatPnl(analysis.maxProfit)}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-stone-500 dark:text-night-300">Max Loss:</span>
        <span className="text-red-500 font-mono">{formatPnl(analysis.maxLoss)}</span>
      </div>
      {analysis.breakevens.length > 0 && (
        <div className="flex items-center gap-1.5">
          <span className="text-stone-500 dark:text-night-300">Break-even:</span>
          <span className="text-stone-700 dark:text-night-100 font-mono">
            ${analysis.breakevens.map((b) => b.toFixed(2)).join(", $")}
          </span>
        </div>
      )}
    </div>
  );
});

function PLChartComponent({
  legs,
  underlyingPrice,
  showAtExpiration = true,
  showToday = true,
  showBreakeven = true,
  showCurrentPrice = true,
  rangePercent = 20,
  height = 300,
  onPriceHover,
  className = "",
}: PLChartProps) {
  const { data, analysis, dte, priceRange } = usePLData({
    legs,
    underlyingPrice,
    rangePercent,
    points: 100,
  });

  const yDomain = useMemo(() => {
    if (data.length === 0) {
      return [-1000, 1000];
    }

    const allValues = data.flatMap((d) => [d.pnlAtExpiration, d.pnlToday]);
    const min = Math.min(...allValues, 0);
    const max = Math.max(...allValues, 0);
    const padding = Math.max(Math.abs(max - min) * 0.1, 100);

    return [min - padding, max + padding];
  }, [data]);

  const handleMouseMove = useCallback(
    (state: Record<string, unknown>) => {
      const activePayload = state.activePayload as Array<{ payload: PLDataPoint }> | undefined;
      if (onPriceHover && activePayload && activePayload.length > 0) {
        const point = activePayload[0]?.payload;
        if (point) {
          onPriceHover(point.price, point.pnlAtExpiration, point.pnlToday);
        }
      }
    },
    [onPriceHover]
  );

  if (legs.length === 0) {
    return (
      <div
        className={`flex items-center justify-center text-stone-500 dark:text-night-300 ${className}`}
        style={{ height: `${height}px` }}
      >
        Add positions to see P/L chart
      </div>
    );
  }

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart
          data={data}
          margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
          onMouseMove={handleMouseMove}
        >
          <defs>
            <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.profit} stopOpacity={0.3} />
              <stop offset="100%" stopColor={CHART_COLORS.profit} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="lossGradient" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor={CHART_COLORS.loss} stopOpacity={0.3} />
              <stop offset="100%" stopColor={CHART_COLORS.loss} stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
          <XAxis
            dataKey="price"
            stroke={CHART_COLORS.text}
            tick={{ fill: CHART_COLORS.text, fontSize: 10 }}
            tickFormatter={(value) => `$${value.toFixed(0)}`}
            axisLine={{ stroke: CHART_COLORS.grid }}
            tickLine={{ stroke: CHART_COLORS.grid }}
            domain={[priceRange.min, priceRange.max]}
          />
          <YAxis
            domain={yDomain}
            stroke={CHART_COLORS.text}
            tick={{ fill: CHART_COLORS.text, fontSize: 10 }}
            tickFormatter={(value) => `$${value.toLocaleString()}`}
            axisLine={{ stroke: CHART_COLORS.grid }}
            tickLine={{ stroke: CHART_COLORS.grid }}
            width={60}
          />
          <ReferenceLine y={0} stroke={CHART_COLORS.text} strokeWidth={1} />
          {showCurrentPrice && (
            <ReferenceLine
              x={underlyingPrice}
              stroke={CHART_COLORS.primary}
              strokeWidth={2}
              strokeDasharray="5 5"
              label={{
                value: `Current $${underlyingPrice.toFixed(2)}`,
                position: "top",
                fill: CHART_COLORS.primary,
                fontSize: 10,
              }}
            />
          )}
          {showBreakeven &&
            analysis.breakevens.map((be) => (
              <ReferenceLine
                key={be}
                x={be}
                stroke={CHART_COLORS.text}
                strokeDasharray="3 3"
                label={{
                  value: `BE $${be.toFixed(2)}`,
                  position: "bottom",
                  fill: CHART_COLORS.text,
                  fontSize: 9,
                }}
              />
            ))}
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: CHART_COLORS.grid }} />
          {showAtExpiration && (
            <Area
              type="monotone"
              dataKey="pnlAtExpiration"
              stroke="none"
              fill="url(#profitGradient)"
              isAnimationActive={false}
            />
          )}
          {showAtExpiration && (
            <Line
              type="monotone"
              dataKey="pnlAtExpiration"
              stroke={CHART_COLORS.profit}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          )}
          {showToday && (
            <Line
              type="monotone"
              dataKey="pnlToday"
              stroke={CHART_COLORS.primary}
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
      <ChartLegend
        showAtExpiration={showAtExpiration}
        showToday={showToday}
        analysis={analysis}
        dte={dte}
      />
    </div>
  );
}

export const PLChart = memo(PLChartComponent);

export default PLChart;
