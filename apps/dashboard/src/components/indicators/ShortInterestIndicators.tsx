"use client";

/**
 * ShortInterest Widget
 *
 * Displays short interest metrics with trend arrows and visual indicators.
 * Uses "Calm Confidence" principle - high SI shown clearly but not panic-inducing.
 *
 * @see docs/plans/ui/20-design-philosophy.md
 * @see docs/plans/ui/26-data-viz.md
 */

import { memo } from "react";

import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Card } from "@/components/ui/surface";

import type { ShortInterestIndicators as ShortInterestData } from "./IndicatorSnapshot";

// ============================================
// Types
// ============================================

export interface ShortInterestIndicatorsProps {
  data: ShortInterestData | null;
  isLoading?: boolean;
  lastUpdate?: number | null;
  className?: string;
}

// ============================================
// Utility Functions
// ============================================

function formatPercent(value: number | null, decimals = 1): string {
  if (value === null) {
    return "—";
  }
  return `${(value * 100).toFixed(decimals)}%`;
}

function formatRatio(value: number | null, decimals = 2): string {
  if (value === null) {
    return "—";
  }
  return value.toFixed(decimals);
}

function formatDays(value: number | null): string {
  if (value === null) {
    return "—";
  }
  const rounded = Math.round(value * 10) / 10;
  return `${rounded}d`;
}

function formatChange(value: number | null): string {
  if (value === null) {
    return "—";
  }
  const pct = (value * 100).toFixed(1);
  if (value > 0) {
    return `+${pct}%`;
  }
  return `${pct}%`;
}

// ============================================
// Variant Functions
// ============================================

function getSIVariant(value: number | null): BadgeVariant {
  if (value === null) {
    return "neutral";
  }
  if (value < 0.05) {
    return "success";
  }
  if (value < 0.1) {
    return "info";
  }
  if (value < 0.2) {
    return "warning";
  }
  return "error";
}

function getDTCVariant(value: number | null): BadgeVariant {
  if (value === null) {
    return "neutral";
  }
  if (value < 2) {
    return "success";
  }
  if (value < 5) {
    return "info";
  }
  if (value < 10) {
    return "warning";
  }
  return "error";
}

function getChangeVariant(value: number | null): BadgeVariant {
  if (value === null) {
    return "neutral";
  }
  if (value < -0.1) {
    return "success";
  }
  if (value < -0.03) {
    return "info";
  }
  if (value < 0.03) {
    return "neutral";
  }
  if (value < 0.1) {
    return "warning";
  }
  return "error";
}

function getSILevel(value: number | null): string {
  if (value === null) {
    return "Unknown";
  }
  if (value < 0.05) {
    return "Low";
  }
  if (value < 0.1) {
    return "Moderate";
  }
  if (value < 0.2) {
    return "Elevated";
  }
  if (value < 0.3) {
    return "High";
  }
  return "Extreme";
}

function getDTCLevel(value: number | null): string {
  if (value === null) {
    return "Unknown";
  }
  if (value < 2) {
    return "Low";
  }
  if (value < 5) {
    return "Moderate";
  }
  if (value < 10) {
    return "High";
  }
  return "Extended";
}

// ============================================
// Trend Arrow Component
// ============================================

interface TrendArrowProps {
  value: number | null;
  size?: "sm" | "md";
}

function TrendArrow({ value, size = "md" }: TrendArrowProps) {
  if (value === null) {
    return null;
  }

  const sizeClass = size === "sm" ? "w-3 h-3" : "w-4 h-4";

  if (Math.abs(value) < 0.01) {
    return (
      <svg
        className={`${sizeClass} text-stone-400`}
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <path d="M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (value > 0) {
    const intensity = value > 0.1 ? "text-red-500" : "text-amber-500";
    return (
      <svg
        className={`${sizeClass} ${intensity}`}
        viewBox="0 0 16 16"
        fill="none"
        role="img"
        aria-labelledby="trend-up-title"
      >
        <title id="trend-up-title">Increasing</title>
        <path
          d="M8 3v10M4 7l4-4 4 4"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  const intensity = value < -0.1 ? "text-green-500" : "text-emerald-400";
  return (
    <svg
      className={`${sizeClass} ${intensity}`}
      viewBox="0 0 16 16"
      fill="none"
      role="img"
      aria-labelledby="trend-down-title"
    >
      <title id="trend-down-title">Decreasing</title>
      <path
        d="M8 13V3M4 9l4 4 4-4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ============================================
// SI Progress Bar Component
// ============================================

interface SIProgressBarProps {
  value: number | null;
}

function SIProgressBar({ value }: SIProgressBarProps) {
  if (value === null) {
    return (
      <div className="h-2 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden">
        <div className="h-full bg-stone-200 dark:bg-stone-700 w-0" />
      </div>
    );
  }

  const percent = Math.min((value * 100) / 40, 100);

  let barColor = "bg-emerald-500";
  if (value >= 0.2) {
    barColor = "bg-red-500";
  } else if (value >= 0.1) {
    barColor = "bg-amber-500";
  } else if (value >= 0.05) {
    barColor = "bg-sky-500";
  }

  const zones = [
    { threshold: 5, color: "bg-emerald-200 dark:bg-emerald-900/30" },
    { threshold: 10, color: "bg-sky-200 dark:bg-sky-900/30" },
    { threshold: 20, color: "bg-amber-200 dark:bg-amber-900/30" },
    { threshold: 40, color: "bg-red-200 dark:bg-red-900/30" },
  ];

  return (
    <div className="relative h-2 rounded-full overflow-hidden flex">
      {zones.map((zone, i) => {
        const prev = zones[i - 1];
        const prevThreshold = i === 0 || !prev ? 0 : prev.threshold;
        const width = ((zone.threshold - prevThreshold) / 40) * 100;
        return (
          <div
            key={zone.threshold}
            className={`h-full ${zone.color}`}
            style={{ width: `${width}%` }}
          />
        );
      })}
      <div
        className={`absolute top-0 left-0 h-full ${barColor} transition-all duration-300`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

// ============================================
// DTC Bar Component
// ============================================

interface DTCBarProps {
  value: number | null;
}

function DTCBar({ value }: DTCBarProps) {
  if (value === null) {
    return (
      <div className="h-1.5 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden">
        <div className="h-full w-0" />
      </div>
    );
  }

  const maxDays = 20;
  const percent = Math.min((value / maxDays) * 100, 100);

  let barColor = "bg-emerald-500";
  if (value >= 10) {
    barColor = "bg-red-500";
  } else if (value >= 5) {
    barColor = "bg-amber-500";
  } else if (value >= 2) {
    barColor = "bg-sky-500";
  }

  return (
    <div className="h-1.5 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden">
      <div
        className={`h-full ${barColor} transition-all duration-300`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

// ============================================
// Metric Card Component
// ============================================

interface MetricCardProps {
  label: string;
  value: string;
  subtext?: string;
  variant: BadgeVariant;
  trend?: number | null;
  children?: React.ReactNode;
}

function MetricCard({ label, value, subtext, variant, trend, children }: MetricCardProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-stone-500 dark:text-stone-400 uppercase tracking-wide">
          {label}
        </span>
        {trend !== undefined && <TrendArrow value={trend} size="sm" />}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-xl font-medium text-stone-900 dark:text-stone-100">
          {value}
        </span>
        <Badge variant={variant} className="text-xs">
          {subtext}
        </Badge>
      </div>
      {children}
    </div>
  );
}

// ============================================
// Loading State
// ============================================

function LoadingSkeleton() {
  return (
    <Card elevation={1} padding="md" className="animate-pulse">
      <div className="h-4 w-24 bg-stone-100 dark:bg-stone-800 rounded mb-4" />
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="h-3 w-16 bg-stone-100 dark:bg-stone-800 rounded" />
          <div className="h-6 w-20 bg-stone-100 dark:bg-stone-800 rounded" />
          <div className="h-2 w-full bg-stone-100 dark:bg-stone-800 rounded" />
        </div>
        <div className="space-y-2">
          <div className="h-3 w-16 bg-stone-100 dark:bg-stone-800 rounded" />
          <div className="h-6 w-20 bg-stone-100 dark:bg-stone-800 rounded" />
          <div className="h-2 w-full bg-stone-100 dark:bg-stone-800 rounded" />
        </div>
      </div>
    </Card>
  );
}

// ============================================
// Main Component
// ============================================

export const ShortInterestIndicators = memo(function ShortInterestIndicators({
  data,
  isLoading = false,
  lastUpdate,
  className = "",
}: ShortInterestIndicatorsProps) {
  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (!data) {
    return (
      <Card elevation={1} padding="md" className={className}>
        <p className="text-sm text-stone-500 dark:text-stone-400 text-center">
          No short interest data available
        </p>
      </Card>
    );
  }

  const siLevel = getSILevel(data.short_pct_float);
  const dtcLevel = getDTCLevel(data.days_to_cover);
  const hasHighSI = data.short_pct_float !== null && data.short_pct_float >= 0.2;

  return (
    <Card
      elevation={1}
      padding="md"
      className={`${className} ${hasHighSI ? "ring-2 ring-red-500/20" : ""}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-stone-700 dark:text-stone-300">Short Interest</h3>
        <div className="flex items-center gap-2">
          {data.settlement_date && (
            <span className="text-xs text-stone-400 dark:text-stone-500">
              {data.settlement_date}
            </span>
          )}
          {data.short_interest_change !== null && (
            <div className="flex items-center gap-1">
              <TrendArrow value={data.short_interest_change} size="sm" />
              <span className="font-mono text-xs text-stone-500 dark:text-stone-400">
                {formatChange(data.short_interest_change)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Main Metrics Grid */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Short % Float */}
        <MetricCard
          label="Short % Float"
          value={formatPercent(data.short_pct_float)}
          subtext={siLevel}
          variant={getSIVariant(data.short_pct_float)}
          trend={data.short_interest_change}
        >
          <SIProgressBar value={data.short_pct_float} />
        </MetricCard>

        {/* Days to Cover */}
        <MetricCard
          label="Days to Cover"
          value={formatDays(data.days_to_cover)}
          subtext={dtcLevel}
          variant={getDTCVariant(data.days_to_cover)}
        >
          <DTCBar value={data.days_to_cover} />
        </MetricCard>
      </div>

      {/* Secondary Metrics */}
      <div className="border-t border-stone-100 dark:border-stone-800 pt-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-stone-500 dark:text-stone-400">SI Ratio</span>
          <span className="font-mono text-stone-900 dark:text-stone-100">
            {formatRatio(data.short_interest_ratio)}
          </span>
        </div>
      </div>

      {/* Change Badge */}
      {data.short_interest_change !== null && Math.abs(data.short_interest_change) >= 0.05 && (
        <div className="mt-3 pt-3 border-t border-stone-100 dark:border-stone-800">
          <Badge
            variant={getChangeVariant(data.short_interest_change)}
            className="w-full justify-center"
          >
            {data.short_interest_change > 0 ? "SI Increasing" : "SI Decreasing"} (
            {formatChange(data.short_interest_change)})
          </Badge>
        </div>
      )}

      {/* Last Update */}
      {lastUpdate && (
        <div className="mt-2 text-xs text-stone-400 dark:text-stone-500 text-right">
          Updated {new Date(lastUpdate).toLocaleDateString()}
        </div>
      )}
    </Card>
  );
});

export default ShortInterestIndicators;
