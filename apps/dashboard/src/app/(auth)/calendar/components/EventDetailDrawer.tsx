/**
 * Event Detail Drawer - Slide-out panel for economic event details
 *
 * Right-side drawer that displays detailed information about an economic event.
 * Follows the IndicatorDrawer pattern for consistent UX.
 *
 * @see docs/plans/ui/25-motion.md Panel transitions (250ms)
 * @see docs/plans/ui/23-layout.md Full drawer specs
 * @see docs/plans/41-economic-calendar-page.md Event drawer design
 */

"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Calendar, Clock, ExternalLink, TrendingDown, TrendingUp, X } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Sparkline } from "@/components/ui/sparkline";
import { useEventHistory } from "@/hooks/queries";
import type { EconomicEvent, ImpactLevel } from "@/lib/api/types";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";

// ============================================
// Types
// ============================================

interface EventDetailDrawerProps {
  event: EconomicEvent | null;
  isOpen: boolean;
  onClose: () => void;
}

// ============================================
// Constants
// ============================================

const DRAWER_WIDTH_MOBILE = "100%";
const DRAWER_WIDTH_DESKTOP = 400;

const IMPACT_CONFIG: Record<
  ImpactLevel,
  {
    label: string;
    bg: string;
    text: string;
    border: string;
  }
> = {
  high: {
    label: "High Impact",
    bg: "bg-red-100 dark:bg-red-900/30",
    text: "text-red-700 dark:text-red-400",
    border: "border-red-200 dark:border-red-800",
  },
  medium: {
    label: "Medium Impact",
    bg: "bg-amber-100 dark:bg-amber-900/30",
    text: "text-amber-700 dark:text-amber-400",
    border: "border-amber-200 dark:border-amber-800",
  },
  low: {
    label: "Low Impact",
    bg: "bg-gray-100 dark:bg-gray-900/30",
    text: "text-gray-600 dark:text-gray-400",
    border: "border-gray-200 dark:border-gray-700",
  },
};

const FRED_RELEASE_URLS: Record<string, string> = {
  "Consumer Price Index": "https://fred.stlouisfed.org/releases/10",
  "Employment Situation": "https://fred.stlouisfed.org/releases/50",
  "Gross Domestic Product": "https://fred.stlouisfed.org/releases/53",
  "FOMC Press Release": "https://fred.stlouisfed.org/releases/101",
  "Advance Retail Sales": "https://fred.stlouisfed.org/releases/9",
  "Industrial Production and Capacity Utilization": "https://fred.stlouisfed.org/releases/13",
  "Personal Income and Outlays": "https://fred.stlouisfed.org/releases/46",
};

// ============================================
// Utilities
// ============================================

function formatDate(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatTime(timeStr: string): string {
  const [hours, minutes] = timeStr.split(":");
  const hour = Number.parseInt(hours ?? "0", 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm} ET`;
}

function getSourceUrl(eventName: string): string | null {
  for (const [name, url] of Object.entries(FRED_RELEASE_URLS)) {
    if (eventName.toLowerCase().includes(name.toLowerCase())) {
      return url;
    }
  }
  return "https://fred.stlouisfed.org/releases/calendar";
}

// ============================================
// Sub-components
// ============================================

function ImpactBadge({ impact }: { impact: ImpactLevel }) {
  const config = IMPACT_CONFIG[impact];
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${config.bg} ${config.text}`}
    >
      {config.label}
    </span>
  );
}

function ValueCard({
  label,
  value,
  unit,
  variant,
}: {
  label: string;
  value: string | null;
  unit: string | null;
  variant?: "actual" | "forecast" | "previous";
}) {
  const isEmpty = !value || value === "-";
  const displayValue = isEmpty ? "—" : `${value}${unit ?? ""}`;

  const variantStyles = {
    actual: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800",
    forecast: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800",
    previous: "bg-stone-50 dark:bg-night-800 border-cream-200 dark:border-night-700",
  };

  return (
    <div
      className={`flex flex-col items-center p-3 rounded-lg border ${variantStyles[variant ?? "previous"]}`}
    >
      <span className="text-xs font-medium text-stone-500 dark:text-night-400 uppercase tracking-wider">
        {label}
      </span>
      <span
        className={`text-lg font-semibold mt-1 ${isEmpty ? "text-stone-400 dark:text-night-500" : "text-stone-900 dark:text-night-50"}`}
      >
        {displayValue}
      </span>
    </div>
  );
}

function SurpriseIndicator({
  actual,
  forecast,
}: {
  actual: string | null;
  forecast: string | null;
}) {
  if (!actual || !forecast) {
    return null;
  }

  const actualNum = Number.parseFloat(actual.replace(/[^0-9.-]/g, ""));
  const forecastNum = Number.parseFloat(forecast.replace(/[^0-9.-]/g, ""));

  if (Number.isNaN(actualNum) || Number.isNaN(forecastNum)) {
    return null;
  }

  const diff = actualNum - forecastNum;
  const isPositive = diff > 0;
  const isNeutral = Math.abs(diff) < 0.01;

  if (isNeutral) {
    return (
      <div className="flex items-center gap-2 text-sm text-stone-500 dark:text-night-400">
        <span>In line with expectations</span>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-2 text-sm ${isPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
    >
      {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
      <span>
        {isPositive ? "Beat" : "Missed"} forecast by {Math.abs(diff).toFixed(2)}
      </span>
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export function EventDetailDrawer({ event, isOpen, onClose }: EventDetailDrawerProps) {
  const { isMobile } = useMediaQuery();

  // Fetch historical data for sparkline
  const { data: history, isLoading: isHistoryLoading } = useEventHistory(event?.id ?? null);

  const drawerWidth = useMemo(
    () => (isMobile ? DRAWER_WIDTH_MOBILE : DRAWER_WIDTH_DESKTOP),
    [isMobile]
  );

  // Close on ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const sourceUrl = event ? getSourceUrl(event.name) : null;

  // Extract sparkline data from history
  const sparklineData = history?.observations.map((obs) => obs.value) ?? [];

  return (
    <AnimatePresence>
      {isOpen && event && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.3 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black z-40"
            onClick={onClose}
          />

          {/* Drawer Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            style={{ width: drawerWidth }}
            className="fixed right-0 top-0 h-full bg-white dark:bg-night-800 border-l border-cream-200 dark:border-night-700 z-50 flex flex-col shadow-xl"
          >
            {/* Header */}
            <div className="flex items-start justify-between px-4 py-4 border-b border-cream-200 dark:border-night-700 shrink-0">
              <div className="flex-1 min-w-0 pr-4">
                <h2 className="text-lg font-semibold text-stone-900 dark:text-night-50 leading-tight">
                  {event.name}
                </h2>
                <div className="flex items-center gap-3 mt-2">
                  <ImpactBadge impact={event.impact} />
                  <span className="text-xs text-stone-500 dark:text-night-400 uppercase">
                    {event.country}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-stone-500 hover:text-stone-700 dark:text-night-400 dark:hover:text-night-200 hover:bg-cream-100 dark:hover:bg-night-700 rounded-md transition-colors shrink-0"
                title="Close (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content - scrollable */}
            <div className="flex-1 overflow-auto">
              {/* Date & Time */}
              <div className="px-4 py-4 border-b border-cream-200 dark:border-night-700">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 text-sm text-stone-600 dark:text-night-300">
                    <Calendar className="w-4 h-4 text-stone-400 dark:text-night-500" />
                    {formatDate(event.date)}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-stone-600 dark:text-night-300">
                    <Clock className="w-4 h-4 text-stone-400 dark:text-night-500" />
                    {formatTime(event.time)}
                  </div>
                </div>
              </div>

              {/* Values */}
              <div className="px-4 py-4 border-b border-cream-200 dark:border-night-700">
                <h3 className="text-sm font-medium text-stone-700 dark:text-night-200 mb-3">
                  Release Data
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <ValueCard
                    label="Previous"
                    value={event.previous}
                    unit={event.unit}
                    variant="previous"
                  />
                  <ValueCard
                    label="Forecast"
                    value={event.forecast}
                    unit={event.unit}
                    variant="forecast"
                  />
                  <ValueCard
                    label="Actual"
                    value={event.actual}
                    unit={event.unit}
                    variant="actual"
                  />
                </div>

                {/* Surprise Indicator */}
                <div className="mt-3">
                  <SurpriseIndicator actual={event.actual} forecast={event.forecast} />
                </div>
              </div>

              {/* Historical Releases */}
              <div className="px-4 py-4 border-b border-cream-200 dark:border-night-700">
                <h3 className="text-sm font-medium text-stone-700 dark:text-night-200 mb-3">
                  Historical Releases
                </h3>
                <div className="bg-cream-50 dark:bg-night-900 rounded-lg p-4">
                  {isHistoryLoading ? (
                    <div className="h-12 flex items-center justify-center">
                      <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : sparklineData.length > 1 ? (
                    <div className="flex flex-col gap-2">
                      <Sparkline
                        data={sparklineData}
                        width={isMobile ? 280 : DRAWER_WIDTH_DESKTOP - 64}
                        height={48}
                        showFill
                      />
                      <div className="flex justify-between text-[10px] text-stone-500 dark:text-night-400">
                        <span>{history?.observations[0]?.date ?? ""}</span>
                        <span className="font-medium">
                          {history?.seriesId} ({history?.unit})
                        </span>
                        <span>
                          {history?.observations[history.observations.length - 1]?.date ?? ""}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="h-12 flex items-center justify-center">
                      <span className="text-xs text-stone-400 dark:text-night-500">
                        No historical data available
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Source Link */}
              {sourceUrl && (
                <div className="px-4 py-4">
                  <a
                    href={sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    View on FRED
                  </a>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-cream-200 dark:border-night-700 bg-cream-50 dark:bg-night-900 shrink-0">
              <p className="text-xs text-stone-500 dark:text-night-400">
                Data sourced from Federal Reserve Economic Data (FRED)
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default EventDetailDrawer;
