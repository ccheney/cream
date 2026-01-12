"use client";

/**
 * PerformanceGrid Component
 *
 * Displays multi-timeframe returns with tab navigation.
 * 6 periods: Today, Week, Month, 3M, YTD, All-Time
 *
 * @see docs/plans/ui/03-views.md Section 5: Portfolio Dashboard
 */

import { memo, useState } from "react";
import type { PerformanceMetrics } from "@/lib/api/types";

// ============================================
// Types
// ============================================

export type PerformancePeriod = "today" | "week" | "month" | "threeMonth" | "ytd" | "total";

export interface PerformanceGridProps {
  metrics?: PerformanceMetrics;
  isLoading?: boolean;
  onPeriodSelect?: (period: PerformancePeriod) => void;
}

interface PeriodConfig {
  key: PerformancePeriod;
  label: string;
}

// ============================================
// Constants
// ============================================

const PERIODS: PeriodConfig[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "threeMonth", label: "3M" },
  { key: "ytd", label: "YTD" },
  { key: "total", label: "All-Time" },
];

// ============================================
// Formatters
// ============================================

function formatCurrency(value: number): string {
  const prefix = value >= 0 ? "+" : "";
  return (
    prefix +
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  );
}

function formatPercent(value: number): string {
  const prefix = value >= 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}%`;
}

// ============================================
// Period Tab Component
// ============================================

interface PeriodTabProps {
  period: PeriodConfig;
  returnValue: number;
  returnPct: number;
  isSelected: boolean;
  isLoading: boolean;
  onClick: () => void;
}

const PeriodTab = memo(function PeriodTab({
  period,
  returnValue,
  returnPct,
  isSelected,
  isLoading,
  onClick,
}: PeriodTabProps) {
  const isPositive = returnValue >= 0;
  const valueColor = isPositive
    ? "text-green-600 dark:text-green-400"
    : "text-red-600 dark:text-red-400";

  if (isLoading) {
    return (
      <button
        type="button"
        className="flex-shrink-0 flex flex-col items-center px-4 py-3 rounded-lg border border-cream-200 dark:border-night-700 bg-white dark:bg-night-800"
        disabled
      >
        <div className="h-3 w-10 bg-cream-100 dark:bg-night-700 rounded animate-pulse mb-2" />
        <div className="h-5 w-14 bg-cream-100 dark:bg-night-700 rounded animate-pulse mb-1" />
        <div className="h-4 w-12 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-shrink-0 flex flex-col items-center px-4 py-3 rounded-lg border transition-colors ${
        isSelected
          ? "border-amber-400 dark:border-amber-500 bg-amber-50 dark:bg-amber-900/20"
          : "border-cream-200 dark:border-night-700 bg-white dark:bg-night-800 hover:border-cream-300 dark:hover:border-night-600"
      }`}
    >
      <span
        className={`text-xs font-medium mb-1 ${
          isSelected ? "text-amber-700 dark:text-amber-400" : "text-stone-500 dark:text-night-400"
        }`}
      >
        {period.label}
      </span>
      <span className={`text-lg font-semibold font-mono ${valueColor}`}>
        {formatCurrency(returnValue)}
      </span>
      <span className={`text-sm font-mono ${valueColor}`}>{formatPercent(returnPct)}</span>
    </button>
  );
});

// ============================================
// Main Component
// ============================================

export const PerformanceGrid = memo(function PerformanceGrid({
  metrics,
  isLoading = false,
  onPeriodSelect,
}: PerformanceGridProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<PerformancePeriod>("today");

  const handlePeriodClick = (period: PerformancePeriod) => {
    setSelectedPeriod(period);
    onPeriodSelect?.(period);
  };

  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-5">
      <h2 className="text-sm font-medium text-stone-500 dark:text-night-400 uppercase tracking-wide mb-4">
        Performance
      </h2>

      {/* Horizontal scrollable container for mobile */}
      <div className="flex gap-3 overflow-x-auto pb-2 -mb-2 scrollbar-thin scrollbar-thumb-cream-200 dark:scrollbar-thumb-night-700">
        {PERIODS.map((period) => {
          const periodData = metrics?.periods?.[period.key];
          return (
            <PeriodTab
              key={period.key}
              period={period}
              returnValue={periodData?.return ?? 0}
              returnPct={periodData?.returnPct ?? 0}
              isSelected={selectedPeriod === period.key}
              isLoading={isLoading}
              onClick={() => handlePeriodClick(period.key)}
            />
          );
        })}
      </div>
    </div>
  );
});

export default PerformanceGrid;
