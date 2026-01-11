/**
 * OptionsIndicators Widget
 *
 * Display IV, skew, put/call ratio, VRP, Greeks with visualizations.
 * Implements "Precision Warmth" design system with trust through transparency.
 *
 * @see docs/plans/ui/20-design-philosophy.md
 * @see docs/plans/ui/26-data-viz.md
 * @see docs/plans/ui/22-typography.md
 */

"use client";

import { memo, useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/surface";
import type { OptionsIndicators as OptionsIndicatorsData } from "./IndicatorSnapshot";

// ============================================
// Types
// ============================================

export interface OptionsIndicatorsProps {
  /** Options indicator data */
  data: OptionsIndicatorsData | null;
  /** Whether data is loading */
  isLoading?: boolean;
  /** Last update timestamp */
  lastUpdate?: number | null;
  /** Additional CSS classes */
  className?: string;
}

// ============================================
// Utility Functions
// ============================================

/**
 * Format number with specified decimals, return em dash for null
 */
function formatValue(value: number | null, decimals = 2): string {
  if (value === null) {
    return "—";
  }
  return value.toFixed(decimals);
}

/**
 * Format as percentage (input is decimal, e.g., 0.25 -> 25.0%)
 */
function formatPercent(value: number | null, decimals = 1): string {
  if (value === null) {
    return "—";
  }
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Format IV with % suffix
 */
function formatIV(value: number | null): string {
  if (value === null) {
    return "—";
  }
  // IV is typically stored as decimal (e.g., 0.35 for 35%)
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Get IV level badge variant based on value
 */
function getIVVariant(value: number | null): "success" | "info" | "warning" | "error" | "neutral" {
  if (value === null) {
    return "neutral";
  }
  // IV thresholds for equity options
  if (value < 0.2) {
    return "success"; // Low IV
  }
  if (value < 0.35) {
    return "info"; // Normal IV
  }
  if (value < 0.5) {
    return "warning"; // Elevated IV
  }
  return "error"; // High IV
}

/**
 * Get skew variant based on value
 * Negative skew = puts more expensive (bearish hedging)
 * Positive skew = calls more expensive (bullish speculation)
 */
function getSkewVariant(
  value: number | null
): "success" | "info" | "warning" | "error" | "neutral" {
  if (value === null) {
    return "neutral";
  }
  // Typical skew is negative (puts > calls)
  if (value < -0.1) {
    return "error"; // Strong negative skew (fear)
  }
  if (value < -0.03) {
    return "warning"; // Moderate negative skew
  }
  if (value < 0.03) {
    return "neutral"; // Normal skew
  }
  if (value < 0.1) {
    return "info"; // Positive skew (unusual)
  }
  return "success"; // Strong positive skew (bullish)
}

/**
 * Get put/call ratio variant
 * < 0.7 = bullish
 * 0.7-1.0 = neutral
 * > 1.0 = bearish/hedging
 */
function getPCRVariant(value: number | null): "success" | "info" | "warning" | "error" | "neutral" {
  if (value === null) {
    return "neutral";
  }
  if (value < 0.7) {
    return "success"; // Bullish
  }
  if (value < 1.0) {
    return "neutral"; // Neutral
  }
  if (value < 1.3) {
    return "warning"; // Elevated hedging
  }
  return "error"; // High fear/hedging
}

/**
 * Get VRP variant (Volatility Risk Premium)
 * VRP = IV - Realized Vol
 * Positive VRP = options expensive vs realized
 * Negative VRP = options cheap vs realized
 */
function getVRPVariant(value: number | null): "success" | "info" | "warning" | "error" | "neutral" {
  if (value === null) {
    return "neutral";
  }
  // VRP is typically stored as decimal
  if (value < -0.05) {
    return "success"; // Options cheap (good for buyers)
  }
  if (value < 0.02) {
    return "neutral"; // Normal premium
  }
  if (value < 0.08) {
    return "warning"; // Elevated premium
  }
  return "error"; // High premium (options expensive)
}

/**
 * Format Greek value with appropriate precision
 */
function formatGreek(value: number | null, decimals = 2): string {
  if (value === null) {
    return "—";
  }
  const formatted = value.toFixed(decimals);
  return value > 0 ? `+${formatted}` : formatted;
}

// ============================================
// Sub-Components
// ============================================

/**
 * Indicator row with label and value
 */
const IndicatorRow = memo(function IndicatorRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between py-1.5 ${
        highlight ? "bg-amber-50/50 dark:bg-amber-900/10 -mx-2 px-2 rounded" : ""
      }`}
    >
      <span className="text-sm text-stone-600 dark:text-stone-400">{label}</span>
      <span className="font-mono text-sm font-medium text-stone-900 dark:text-stone-100">
        {value}
      </span>
    </div>
  );
});

/**
 * IV Section with ATM IV and skew
 */
const IVSection = memo(function IVSection({ data }: { data: OptionsIndicatorsData }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wide">
          Implied Volatility
        </h4>
        {data.atm_iv !== null && (
          <Badge variant={getIVVariant(data.atm_iv)} size="sm">
            {data.atm_iv < 0.2
              ? "Low"
              : data.atm_iv < 0.35
                ? "Normal"
                : data.atm_iv < 0.5
                  ? "Elevated"
                  : "High"}
          </Badge>
        )}
      </div>

      {/* ATM IV prominent display */}
      <div className="text-center py-2 bg-stone-50 dark:bg-stone-800/50 rounded-lg">
        <div className="text-2xl font-mono font-bold text-stone-900 dark:text-stone-100">
          {formatIV(data.atm_iv)}
        </div>
        <div className="text-xs text-stone-500 dark:text-stone-400">ATM IV</div>
      </div>

      {/* IV Details */}
      <div className="grid grid-cols-2 gap-x-4">
        <IndicatorRow label="Put 25δ IV" value={formatIV(data.iv_put_25d)} />
        <IndicatorRow label="Call 25δ IV" value={formatIV(data.iv_call_25d)} />
      </div>

      {/* Skew with badge */}
      <div className="flex items-center justify-between py-1.5">
        <span className="text-sm text-stone-600 dark:text-stone-400">IV Skew (25δ)</span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-medium text-stone-900 dark:text-stone-100">
            {formatPercent(data.iv_skew_25d)}
          </span>
          {data.iv_skew_25d !== null && (
            <Badge variant={getSkewVariant(data.iv_skew_25d)} size="sm">
              {data.iv_skew_25d < -0.03
                ? "Puts bid"
                : data.iv_skew_25d > 0.03
                  ? "Calls bid"
                  : "Flat"}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
});

/**
 * Put/Call Ratio Section
 */
const PutCallSection = memo(function PutCallSection({ data }: { data: OptionsIndicatorsData }) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wide">
        Put/Call Ratios
      </h4>

      <div className="grid grid-cols-2 gap-4">
        {/* Volume Ratio */}
        <div className="text-center py-2 bg-stone-50 dark:bg-stone-800/50 rounded-lg">
          <div className="text-lg font-mono font-semibold text-stone-900 dark:text-stone-100">
            {formatValue(data.put_call_ratio_volume)}
          </div>
          <div className="text-xs text-stone-500 dark:text-stone-400">Volume</div>
          {data.put_call_ratio_volume !== null && (
            <Badge variant={getPCRVariant(data.put_call_ratio_volume)} size="sm" className="mt-1">
              {data.put_call_ratio_volume < 0.7
                ? "Bullish"
                : data.put_call_ratio_volume < 1.0
                  ? "Neutral"
                  : "Bearish"}
            </Badge>
          )}
        </div>

        {/* OI Ratio */}
        <div className="text-center py-2 bg-stone-50 dark:bg-stone-800/50 rounded-lg">
          <div className="text-lg font-mono font-semibold text-stone-900 dark:text-stone-100">
            {formatValue(data.put_call_ratio_oi)}
          </div>
          <div className="text-xs text-stone-500 dark:text-stone-400">Open Interest</div>
          {data.put_call_ratio_oi !== null && (
            <Badge variant={getPCRVariant(data.put_call_ratio_oi)} size="sm" className="mt-1">
              {data.put_call_ratio_oi < 0.7
                ? "Bullish"
                : data.put_call_ratio_oi < 1.0
                  ? "Neutral"
                  : "Bearish"}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
});

/**
 * Term Structure Section
 */
const TermStructureSection = memo(function TermStructureSection({
  data,
}: {
  data: OptionsIndicatorsData;
}) {
  // Determine contango/backwardation
  const structureType = useMemo(() => {
    if (data.term_structure_slope === null) {
      return null;
    }
    if (data.term_structure_slope > 0.01) {
      return "contango"; // Normal upward slope
    }
    if (data.term_structure_slope < -0.01) {
      return "backwardation"; // Inverted (fear)
    }
    return "flat";
  }, [data.term_structure_slope]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wide">
          Term Structure
        </h4>
        {structureType && (
          <Badge
            variant={
              structureType === "contango"
                ? "success"
                : structureType === "backwardation"
                  ? "error"
                  : "neutral"
            }
            size="sm"
          >
            {structureType === "contango"
              ? "Contango"
              : structureType === "backwardation"
                ? "Backwardation"
                : "Flat"}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-4">
        <IndicatorRow label="Front Month IV" value={formatIV(data.front_month_iv)} />
        <IndicatorRow label="Back Month IV" value={formatIV(data.back_month_iv)} />
      </div>

      <IndicatorRow label="Slope" value={formatPercent(data.term_structure_slope)} />
    </div>
  );
});

/**
 * VRP Section (Volatility Risk Premium)
 */
const VRPSection = memo(function VRPSection({ data }: { data: OptionsIndicatorsData }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wide">
          Volatility Risk Premium
        </h4>
        {data.vrp !== null && (
          <Badge variant={getVRPVariant(data.vrp)} size="sm">
            {data.vrp < -0.02 ? "Cheap" : data.vrp < 0.05 ? "Fair" : "Expensive"}
          </Badge>
        )}
      </div>

      {/* VRP prominent display */}
      <div className="flex items-center justify-around py-2 bg-stone-50 dark:bg-stone-800/50 rounded-lg">
        <div className="text-center">
          <div className="text-lg font-mono font-semibold text-stone-900 dark:text-stone-100">
            {formatPercent(data.atm_iv)}
          </div>
          <div className="text-xs text-stone-500 dark:text-stone-400">Implied</div>
        </div>

        <div className="text-stone-400">→</div>

        <div className="text-center">
          <div className="text-lg font-mono font-semibold text-stone-900 dark:text-stone-100">
            {formatPercent(data.realized_vol_20d)}
          </div>
          <div className="text-xs text-stone-500 dark:text-stone-400">Realized</div>
        </div>

        <div className="text-stone-400">=</div>

        <div className="text-center">
          <div
            className={`text-lg font-mono font-semibold ${
              (data.vrp ?? 0) > 0
                ? "text-red-600 dark:text-red-400"
                : (data.vrp ?? 0) < 0
                  ? "text-green-600 dark:text-green-400"
                  : "text-stone-900 dark:text-stone-100"
            }`}
          >
            {data.vrp !== null ? `${data.vrp > 0 ? "+" : ""}${(data.vrp * 100).toFixed(1)}%` : "—"}
          </div>
          <div className="text-xs text-stone-500 dark:text-stone-400">VRP</div>
        </div>
      </div>
    </div>
  );
});

/**
 * Greeks Section
 */
const GreeksSection = memo(function GreeksSection({ data }: { data: OptionsIndicatorsData }) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wide">
        Net Greeks (Market Position)
      </h4>

      <div className="grid grid-cols-2 gap-2">
        {/* Delta */}
        <div className="p-2 bg-stone-50 dark:bg-stone-800/50 rounded-lg">
          <div className="text-xs text-stone-500 dark:text-stone-400 mb-0.5">Delta (Δ)</div>
          <div
            className={`font-mono text-sm font-semibold ${
              (data.net_delta ?? 0) > 0
                ? "text-green-600 dark:text-green-400"
                : (data.net_delta ?? 0) < 0
                  ? "text-red-600 dark:text-red-400"
                  : "text-stone-900 dark:text-stone-100"
            }`}
          >
            {formatGreek(data.net_delta)}
          </div>
          <div className="text-xs text-stone-400">
            {data.net_delta !== null
              ? data.net_delta > 0
                ? "Net Long"
                : data.net_delta < 0
                  ? "Net Short"
                  : "Neutral"
              : "—"}
          </div>
        </div>

        {/* Gamma */}
        <div className="p-2 bg-stone-50 dark:bg-stone-800/50 rounded-lg">
          <div className="text-xs text-stone-500 dark:text-stone-400 mb-0.5">Gamma (Γ)</div>
          <div
            className={`font-mono text-sm font-semibold ${
              (data.net_gamma ?? 0) > 0
                ? "text-green-600 dark:text-green-400"
                : (data.net_gamma ?? 0) < 0
                  ? "text-red-600 dark:text-red-400"
                  : "text-stone-900 dark:text-stone-100"
            }`}
          >
            {formatGreek(data.net_gamma, 3)}
          </div>
          <div className="text-xs text-stone-400">
            {data.net_gamma !== null
              ? data.net_gamma > 0
                ? "Long Gamma"
                : data.net_gamma < 0
                  ? "Short Gamma"
                  : "Neutral"
              : "—"}
          </div>
        </div>

        {/* Theta */}
        <div className="p-2 bg-stone-50 dark:bg-stone-800/50 rounded-lg">
          <div className="text-xs text-stone-500 dark:text-stone-400 mb-0.5">Theta (Θ)</div>
          <div
            className={`font-mono text-sm font-semibold ${
              (data.net_theta ?? 0) > 0
                ? "text-green-600 dark:text-green-400"
                : (data.net_theta ?? 0) < 0
                  ? "text-red-600 dark:text-red-400"
                  : "text-stone-900 dark:text-stone-100"
            }`}
          >
            {formatGreek(data.net_theta)}
          </div>
          <div className="text-xs text-stone-400">
            {data.net_theta !== null
              ? data.net_theta > 0
                ? "Collecting"
                : data.net_theta < 0
                  ? "Paying"
                  : "Neutral"
              : "—"}
          </div>
        </div>

        {/* Vega */}
        <div className="p-2 bg-stone-50 dark:bg-stone-800/50 rounded-lg">
          <div className="text-xs text-stone-500 dark:text-stone-400 mb-0.5">Vega (ν)</div>
          <div
            className={`font-mono text-sm font-semibold ${
              (data.net_vega ?? 0) > 0
                ? "text-green-600 dark:text-green-400"
                : (data.net_vega ?? 0) < 0
                  ? "text-red-600 dark:text-red-400"
                  : "text-stone-900 dark:text-stone-100"
            }`}
          >
            {formatGreek(data.net_vega)}
          </div>
          <div className="text-xs text-stone-400">
            {data.net_vega !== null
              ? data.net_vega > 0
                ? "Long Vol"
                : data.net_vega < 0
                  ? "Short Vol"
                  : "Neutral"
              : "—"}
          </div>
        </div>
      </div>
    </div>
  );
});

// ============================================
// Loading Skeleton
// ============================================

function OptionsIndicatorsSkeleton() {
  return (
    <Card className="p-4 space-y-4 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="h-5 w-36 bg-stone-200 dark:bg-stone-700 rounded" />
        <div className="h-4 w-24 bg-stone-200 dark:bg-stone-700 rounded" />
      </div>

      {/* IV Section */}
      <div className="space-y-2">
        <div className="h-3 w-28 bg-stone-200 dark:bg-stone-700 rounded" />
        <div className="h-16 bg-stone-200 dark:bg-stone-700 rounded" />
      </div>

      {/* Grid sections */}
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-2">
          <div className="h-3 w-24 bg-stone-200 dark:bg-stone-700 rounded" />
          <div className="grid grid-cols-2 gap-2">
            <div className="h-12 bg-stone-200 dark:bg-stone-700 rounded" />
            <div className="h-12 bg-stone-200 dark:bg-stone-700 rounded" />
          </div>
        </div>
      ))}
    </Card>
  );
}

// ============================================
// Main Component
// ============================================

/**
 * OptionsIndicators widget displays options market indicators with visualizations.
 *
 * Features:
 * - ATM IV with level badge
 * - IV skew with put/call comparison
 * - Put/Call ratios (volume and OI)
 * - Term structure (contango/backwardation)
 * - VRP (Volatility Risk Premium)
 * - Net Greeks (Delta, Gamma, Theta, Vega)
 *
 * @example
 * ```tsx
 * <OptionsIndicators
 *   data={snapshot.options}
 * />
 * ```
 */
export const OptionsIndicators = memo(function OptionsIndicators({
  data,
  isLoading = false,
  lastUpdate,
  className = "",
}: OptionsIndicatorsProps) {
  if (isLoading) {
    return <OptionsIndicatorsSkeleton />;
  }

  if (!data) {
    return (
      <Card className={`p-4 ${className}`}>
        <div className="text-center text-stone-500 dark:text-stone-400 py-8">
          No options indicator data available
        </div>
      </Card>
    );
  }

  return (
    <Card className={`p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100">
          Options Indicators
        </h3>
        {lastUpdate && (
          <span className="text-xs text-stone-500 dark:text-stone-400">
            {new Date(lastUpdate).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Indicator Sections */}
      <div className="space-y-4">
        <IVSection data={data} />

        <div className="border-t border-stone-200 dark:border-stone-700 pt-4">
          <PutCallSection data={data} />
        </div>

        <div className="border-t border-stone-200 dark:border-stone-700 pt-4">
          <TermStructureSection data={data} />
        </div>

        <div className="border-t border-stone-200 dark:border-stone-700 pt-4">
          <VRPSection data={data} />
        </div>

        <div className="border-t border-stone-200 dark:border-stone-700 pt-4">
          <GreeksSection data={data} />
        </div>
      </div>
    </Card>
  );
});

// ============================================
// Exports
// ============================================

export default OptionsIndicators;
