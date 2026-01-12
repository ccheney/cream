/**
 * IC Chart Component
 *
 * Displays IC history as a time series with threshold lines.
 */

import { useState } from "react";
import type { ICHistoryEntry } from "@/hooks/queries";

interface ICChartProps {
  history: ICHistoryEntry[] | undefined;
  isLoading: boolean;
}

type TimeRange = 30 | 90 | 180;

/**
 * Simple sparkline chart for IC values.
 * Uses SVG for lightweight rendering.
 */
function Sparkline({
  values,
  thresholds,
  height = 120,
  width = "100%",
}: {
  values: number[];
  thresholds: { healthy: number; warning: number };
  height?: number;
  width?: number | string;
}) {
  if (values.length === 0) {
    return null;
  }

  const min = Math.min(...values, 0);
  const max = Math.max(...values, thresholds.healthy + 0.01);
  const range = max - min || 0.01;

  // Scale y value to SVG coordinates (inverted for SVG)
  const scaleY = (v: number) => height - ((v - min) / range) * height * 0.8 - height * 0.1;
  const scaleX = (i: number) => (i / (values.length - 1 || 1)) * 100;

  // Generate path
  const pathPoints = values
    .map((v, i) => `${i === 0 ? "M" : "L"} ${scaleX(i)}% ${scaleY(v)}`)
    .join(" ");

  // Threshold lines
  const healthyY = scaleY(thresholds.healthy);
  const warningY = scaleY(thresholds.warning);

  return (
    <svg
      width={width}
      height={height}
      className="overflow-visible"
      preserveAspectRatio="none"
      role="img"
      aria-label="IC sparkline chart"
    >
      {/* Grid lines */}
      <line
        x1="0"
        y1={healthyY}
        x2="100%"
        y2={healthyY}
        stroke="currentColor"
        strokeWidth="1"
        strokeDasharray="4 4"
        className="text-green-300 dark:text-green-700"
      />
      <line
        x1="0"
        y1={warningY}
        x2="100%"
        y2={warningY}
        stroke="currentColor"
        strokeWidth="1"
        strokeDasharray="4 4"
        className="text-amber-300 dark:text-amber-700"
      />

      {/* Area fill */}
      <path
        d={`${pathPoints} L 100% ${height} L 0% ${height} Z`}
        fill="url(#gradient)"
        opacity="0.2"
      />

      {/* Line */}
      <path
        d={pathPoints}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-blue-500 dark:text-blue-400"
      />

      {/* Gradient definition */}
      <defs>
        <linearGradient id="gradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="rgb(59, 130, 246)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="rgb(59, 130, 246)" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function ICChart({ history, isLoading }: ICChartProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>(30);

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
        <div className="h-6 w-32 bg-cream-100 dark:bg-night-700 rounded animate-pulse mb-4" />
        <div className="h-32 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
      </div>
    );
  }

  // Filter history by time range (assuming history is sorted newest first)
  const filteredHistory = history?.slice(0, timeRange) ?? [];
  const reversedHistory = filteredHistory.toReversed(); // Oldest first for chart
  const icValues = reversedHistory.map((h) => h.icValue);

  // Calculate metrics
  const avgIC = icValues.length > 0 ? icValues.reduce((a, b) => a + b, 0) / icValues.length : null;
  const latestIC = filteredHistory[0]?.icValue ?? null;
  const icStd =
    icValues.length > 1
      ? Math.sqrt(icValues.reduce((sum, v) => sum + (v - (avgIC ?? 0)) ** 2, 0) / icValues.length)
      : null;
  const icir = avgIC !== null && icStd !== null && icStd > 0 ? avgIC / icStd : null;

  // Count decisions
  const totalDecisions = filteredHistory.reduce((sum, h) => sum + h.decisionsUsedIn, 0);

  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
      <div className="p-4 border-b border-cream-200 dark:border-night-700 flex items-center justify-between">
        <h3 className="text-lg font-medium text-stone-900 dark:text-night-50">Performance</h3>
        <div className="flex gap-1">
          {([30, 90, 180] as const).map((range) => (
            <button
              key={range}
              type="button"
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1 text-sm rounded transition-colors ${
                timeRange === range
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                  : "text-stone-600 dark:text-night-200 hover:bg-cream-100 dark:text-night-400 dark:hover:bg-night-700"
              }`}
            >
              {range}d
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        {/* Chart */}
        <div className="mb-4">
          <div className="text-sm text-stone-500 dark:text-night-300 mb-2">IC Over Time</div>
          {icValues.length > 0 ? (
            <Sparkline
              values={icValues}
              thresholds={{ healthy: 0.02, warning: 0.01 }}
              height={120}
            />
          ) : (
            <div className="h-32 flex items-center justify-center text-stone-400 dark:text-night-400">
              No IC data available
            </div>
          )}
        </div>

        {/* Threshold legend */}
        <div className="flex gap-4 text-xs text-stone-500 dark:text-night-300 mb-4">
          <div className="flex items-center gap-1">
            <span className="w-4 h-0.5 bg-green-400" />
            <span>Healthy (0.02)</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-4 h-0.5 bg-amber-400" />
            <span>Warning (0.01)</span>
          </div>
        </div>

        {/* Metric cards */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-cream-50 dark:bg-night-750 rounded-lg p-3">
            <div className="text-xs text-stone-500 dark:text-night-300 mb-1">IC ({timeRange}d)</div>
            <div className="text-lg font-mono font-semibold text-stone-900 dark:text-night-50">
              {latestIC !== null ? latestIC.toFixed(4) : "—"}
            </div>
          </div>
          <div className="bg-cream-50 dark:bg-night-750 rounded-lg p-3">
            <div className="text-xs text-stone-500 dark:text-night-300 mb-1">Avg IC</div>
            <div className="text-lg font-mono font-semibold text-stone-900 dark:text-night-50">
              {avgIC !== null ? avgIC.toFixed(4) : "—"}
            </div>
          </div>
          <div className="bg-cream-50 dark:bg-night-750 rounded-lg p-3">
            <div className="text-xs text-stone-500 dark:text-night-300 mb-1">ICIR</div>
            <div className="text-lg font-mono font-semibold text-stone-900 dark:text-night-50">
              {icir !== null ? icir.toFixed(2) : "—"}
            </div>
          </div>
          <div className="bg-cream-50 dark:bg-night-750 rounded-lg p-3">
            <div className="text-xs text-stone-500 dark:text-night-300 mb-1">Decisions</div>
            <div className="text-lg font-mono font-semibold text-stone-900 dark:text-night-50">
              {totalDecisions}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
