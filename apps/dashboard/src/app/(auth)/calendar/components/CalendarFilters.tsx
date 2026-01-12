/**
 * Calendar Filters Component
 *
 * Filter controls for the economic calendar page.
 * Supports country, impact, and date range filtering.
 *
 * @see docs/plans/ui/24-components.md - Form inputs
 * @see docs/plans/41-economic-calendar-page.md - Filter design
 */

"use client";

import { Calendar, Filter, Globe, X } from "lucide-react";
import { useCallback, useMemo } from "react";
import type { ImpactLevel } from "@/lib/api/types";

// ============================================
// Types
// ============================================

export interface CalendarFilterState {
  country: string;
  impact: ImpactLevel[];
  dateRange: "week" | "month" | "30days" | "60days";
}

interface CalendarFiltersProps {
  filters: CalendarFilterState;
  onFilterChange: (filters: CalendarFilterState) => void;
  className?: string;
}

// ============================================
// Constants
// ============================================

const COUNTRY_OPTIONS = [
  { value: "US", label: "United States" },
  { value: "ALL", label: "All Countries" },
] as const;

const IMPACT_OPTIONS: { value: ImpactLevel; label: string; color: string }[] = [
  { value: "high", label: "High", color: "bg-red-500" },
  { value: "medium", label: "Medium", color: "bg-amber-500" },
  { value: "low", label: "Low", color: "bg-gray-400" },
];

const DATE_RANGE_OPTIONS = [
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "30days", label: "Next 30 Days" },
  { value: "60days", label: "Next 60 Days" },
] as const;

// ============================================
// Sub-components
// ============================================

interface FilterChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
  color?: string;
}

function FilterChip({ label, active, onClick, color }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
        active
          ? "bg-stone-700 dark:bg-night-200 text-cream-50 dark:text-night-900"
          : "bg-cream-200 dark:bg-night-700 text-stone-600 dark:text-night-300 hover:bg-cream-300 dark:hover:bg-night-600"
      }`}
    >
      {color && <span className={`w-2 h-2 rounded-full ${color}`} />}
      {label}
    </button>
  );
}

interface SelectDropdownProps {
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  icon?: React.ReactNode;
}

function SelectDropdown({ value, options, onChange, icon }: SelectDropdownProps) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none pl-8 pr-8 py-1.5 text-xs font-medium rounded-md border border-cream-300 dark:border-night-600 bg-white dark:bg-night-800 text-stone-700 dark:text-night-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 cursor-pointer"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400 dark:text-night-400 pointer-events-none">
        {icon}
      </div>
      <div className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 dark:text-night-400 pointer-events-none">
        <svg
          className="w-3 h-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export function CalendarFilters({ filters, onFilterChange, className }: CalendarFiltersProps) {
  const toggleImpact = useCallback(
    (impact: ImpactLevel) => {
      const newImpact = filters.impact.includes(impact)
        ? filters.impact.filter((i) => i !== impact)
        : [...filters.impact, impact];
      onFilterChange({ ...filters, impact: newImpact });
    },
    [filters, onFilterChange]
  );

  const setCountry = useCallback(
    (country: string) => {
      onFilterChange({ ...filters, country });
    },
    [filters, onFilterChange]
  );

  const setDateRange = useCallback(
    (dateRange: CalendarFilterState["dateRange"]) => {
      onFilterChange({ ...filters, dateRange });
    },
    [filters, onFilterChange]
  );

  const clearFilters = useCallback(() => {
    onFilterChange({
      country: "US",
      impact: ["high", "medium", "low"],
      dateRange: "30days",
    });
  }, [onFilterChange]);

  const hasActiveFilters = useMemo(() => {
    return (
      filters.country !== "US" || filters.impact.length !== 3 || filters.dateRange !== "30days"
    );
  }, [filters]);

  return (
    <div className={`flex flex-wrap items-center gap-3 ${className ?? ""}`}>
      {/* Country Filter */}
      <SelectDropdown
        value={filters.country}
        options={COUNTRY_OPTIONS}
        onChange={setCountry}
        icon={<Globe className="w-3.5 h-3.5" />}
      />

      {/* Date Range Filter */}
      <SelectDropdown
        value={filters.dateRange}
        options={DATE_RANGE_OPTIONS}
        onChange={(v) => setDateRange(v as CalendarFilterState["dateRange"])}
        icon={<Calendar className="w-3.5 h-3.5" />}
      />

      {/* Separator */}
      <div className="w-px h-5 bg-cream-300 dark:bg-night-600" />

      {/* Impact Filters */}
      <div className="flex items-center gap-1.5">
        <Filter className="w-3.5 h-3.5 text-stone-400 dark:text-night-400" />
        {IMPACT_OPTIONS.map((opt) => (
          <FilterChip
            key={opt.value}
            label={opt.label}
            color={opt.color}
            active={filters.impact.includes(opt.value)}
            onClick={() => toggleImpact(opt.value)}
          />
        ))}
      </div>

      {/* Clear Filters */}
      {hasActiveFilters && (
        <>
          <div className="w-px h-5 bg-cream-300 dark:bg-night-600" />
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-stone-500 dark:text-night-400 hover:text-stone-700 dark:hover:text-night-200 transition-colors"
          >
            <X className="w-3 h-3" />
            Clear
          </button>
        </>
      )}
    </div>
  );
}

export default CalendarFilters;

// ============================================
// Utility Functions
// ============================================

/**
 * Get date range from filter preset
 */
export function getDateRangeFromFilter(dateRange: CalendarFilterState["dateRange"]): {
  start: string;
  end: string;
} {
  const today = new Date();
  const start = new Date();
  const end = new Date();

  switch (dateRange) {
    case "week":
      start.setDate(today.getDate() - today.getDay());
      end.setDate(start.getDate() + 6);
      break;
    case "month":
      start.setDate(1);
      end.setMonth(today.getMonth() + 1, 0);
      break;
    case "30days":
      start.setDate(today.getDate() - 7);
      end.setDate(today.getDate() + 30);
      break;
    case "60days":
      start.setDate(today.getDate() - 7);
      end.setDate(today.getDate() + 60);
      break;
  }

  return {
    start: start.toISOString().split("T")[0] ?? "",
    end: end.toISOString().split("T")[0] ?? "",
  };
}

/**
 * Default filter state
 */
export const DEFAULT_FILTERS: CalendarFilterState = {
  country: "US",
  impact: ["high", "medium", "low"],
  dateRange: "30days",
};
