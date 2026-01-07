/**
 * ExpirationTabs Component
 *
 * Horizontal scrollable tabs for selecting option expiration dates.
 * Shows DTE (days to expiration) and highlights weekly/monthly/quarterly.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 2.1
 */

"use client";

import { memo, useCallback, useEffect, useRef } from "react";
import type { ExpirationInfo } from "@/lib/api/types";

// ============================================
// Types
// ============================================

export interface ExpirationTabsProps {
  /** Available expiration dates */
  expirations: ExpirationInfo[];
  /** Currently selected expiration date (YYYY-MM-DD) */
  selected: string | null;
  /** Callback when expiration is selected */
  onSelect: (date: string) => void;
  /** Custom CSS class */
  className?: string;
  /** Test ID */
  "data-testid"?: string;
}

// ============================================
// Helper Functions
// ============================================

function formatExpirationLabel(exp: ExpirationInfo): string {
  const date = new Date(exp.date);
  const month = date.toLocaleDateString("en-US", { month: "short" });
  const day = date.getDate();
  return `${month} ${day}`;
}

function getTypeIndicator(type: ExpirationInfo["type"]): string {
  switch (type) {
    case "monthly":
      return "M";
    case "quarterly":
      return "Q";
    default:
      return "";
  }
}

function getDteColor(dte: number): string {
  if (dte <= 7) {
    return "text-red-500 dark:text-red-400";
  }
  if (dte <= 30) {
    return "text-yellow-600 dark:text-yellow-400";
  }
  return "text-cream-500 dark:text-cream-400";
}

// ============================================
// Component
// ============================================

/**
 * ExpirationTabs displays horizontal scrollable expiration date tabs.
 *
 * Features:
 * - Shows formatted date (Jan 17, Feb 7, etc.)
 * - DTE indicator with color coding
 * - Monthly/Quarterly badges
 * - Horizontal scroll with fade edges
 * - Auto-scroll to selected tab
 *
 * @example
 * ```tsx
 * <ExpirationTabs
 *   expirations={data.expirations}
 *   selected={selectedExpiration}
 *   onSelect={setSelectedExpiration}
 * />
 * ```
 */
export const ExpirationTabs = memo(function ExpirationTabs({
  expirations,
  selected,
  onSelect,
  className = "",
  "data-testid": testId,
}: ExpirationTabsProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  // Auto-scroll to selected tab when selection changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: selected triggers scroll to center the newly selected tab
  useEffect(() => {
    if (selectedRef.current && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const selectedEl = selectedRef.current;
      const containerWidth = container.clientWidth;
      const selectedLeft = selectedEl.offsetLeft;
      const selectedWidth = selectedEl.clientWidth;

      // Center the selected tab
      const scrollTarget = selectedLeft - containerWidth / 2 + selectedWidth / 2;
      container.scrollTo({ left: scrollTarget, behavior: "smooth" });
    }
  }, [selected]);

  const handleSelect = useCallback(
    (date: string) => {
      onSelect(date);
    },
    [onSelect]
  );

  if (expirations.length === 0) {
    return (
      <div
        className={`flex items-center px-4 py-2 text-cream-500 dark:text-cream-400 ${className}`}
        data-testid={testId}
      >
        No expirations available
      </div>
    );
  }

  return (
    <div className={`relative ${className}`} data-testid={testId}>
      {/* Left fade */}
      <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-white dark:from-night-800 to-transparent z-10 pointer-events-none" />

      {/* Scrollable container */}
      <div
        ref={scrollContainerRef}
        className="flex overflow-x-auto scrollbar-hide gap-1 px-4 py-2"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {expirations.map((exp) => {
          const isSelected = exp.date === selected;
          const typeIndicator = getTypeIndicator(exp.type);

          return (
            <button
              key={exp.date}
              ref={isSelected ? selectedRef : null}
              type="button"
              onClick={() => handleSelect(exp.date)}
              className={`
                relative flex flex-col items-center px-3 py-1.5 min-w-[70px]
                rounded-md transition-colors duration-150
                ${
                  isSelected
                    ? "bg-accent-warm text-white"
                    : "bg-cream-100 dark:bg-night-700 text-cream-700 dark:text-cream-200 hover:bg-cream-200 dark:hover:bg-night-600"
                }
              `}
              aria-pressed={isSelected}
              aria-label={`Expiration ${formatExpirationLabel(exp)}, ${exp.dte} days to expiration`}
            >
              {/* Type badge */}
              {typeIndicator && (
                <span
                  className={`
                    absolute -top-1 -right-1 w-4 h-4 text-[10px] font-bold
                    rounded-full flex items-center justify-center
                    ${isSelected ? "bg-white text-accent-warm" : "bg-accent-warm text-white"}
                  `}
                >
                  {typeIndicator}
                </span>
              )}

              {/* Date label */}
              <span className="text-sm font-medium whitespace-nowrap">
                {formatExpirationLabel(exp)}
              </span>

              {/* DTE */}
              <span className={`text-xs ${isSelected ? "text-white/80" : getDteColor(exp.dte)}`}>
                {exp.dte}d
              </span>
            </button>
          );
        })}
      </div>

      {/* Right fade */}
      <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white dark:from-night-800 to-transparent z-10 pointer-events-none" />
    </div>
  );
});

export default ExpirationTabs;
