/**
 * Economic Calendar Component
 *
 * Schedule-X calendar displaying economic events from FRED.
 * Supports week and month views with dark mode.
 *
 * @see docs/plans/41-economic-calendar-page.md
 */

"use client";

import "temporal-polyfill/global";

import { createViewMonthAgenda, createViewMonthGrid, createViewWeek } from "@schedule-x/calendar";
import { createEventsServicePlugin } from "@schedule-x/events-service";
import { ScheduleXCalendar, useNextCalendarApp } from "@schedule-x/react";
import "@schedule-x/theme-default/dist/index.css";
import { CalendarDays } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, ErrorEmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useEconomicCalendar } from "@/hooks/queries";
import type { EconomicEvent } from "@/lib/api/types";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import {
  type CalendarFilterState,
  CalendarFilters,
  DEFAULT_FILTERS,
  getDateRangeFromFilter,
} from "./CalendarFilters";
import { MonthGridEventCard, TimeGridEventCard } from "./EventCard";

// ============================================
// Types
// ============================================

interface CalendarEvent {
  id: string;
  title: string;
  start: Temporal.ZonedDateTime;
  end: Temporal.ZonedDateTime;
  calendarId: string;
  description?: string;
  location?: string;
}

// ============================================
// Constants
// ============================================

const IMPACT_CALENDARS = {
  high: {
    colorName: "high-impact",
    lightColors: {
      main: "#DC2626",
      container: "#FEE2E2",
      onContainer: "#7F1D1D",
    },
    darkColors: {
      main: "#FCA5A5",
      container: "#7F1D1D",
      onContainer: "#FEE2E2",
    },
  },
  medium: {
    colorName: "medium-impact",
    lightColors: {
      main: "#D97706",
      container: "#FEF3C7",
      onContainer: "#78350F",
    },
    darkColors: {
      main: "#FCD34D",
      container: "#78350F",
      onContainer: "#FEF3C7",
    },
  },
  low: {
    colorName: "low-impact",
    lightColors: {
      main: "#6B7280",
      container: "#F3F4F6",
      onContainer: "#374151",
    },
    darkColors: {
      main: "#9CA3AF",
      container: "#374151",
      onContainer: "#F3F4F6",
    },
  },
} as const;

// ============================================
// Custom Components for Schedule-X
// ============================================

const customComponents = {
  timeGridEvent: TimeGridEventCard,
  monthGridEvent: MonthGridEventCard,
};

// ============================================
// Utilities
// ============================================

const DEFAULT_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

function convertToCalendarEvents(events: EconomicEvent[]): CalendarEvent[] {
  return events.map((event) => {
    const timeStr = event.time.slice(0, 5);
    // biome-ignore lint/correctness/noUndeclaredVariables: Temporal is available via temporal-polyfill/global import
    const start = Temporal.ZonedDateTime.from(`${event.date}T${timeStr}:00[${DEFAULT_TIMEZONE}]`);
    const end = start.add({ minutes: 30 });

    const parts: string[] = [];
    if (event.actual) {
      parts.push(`Actual: ${event.actual}${event.unit ?? ""}`);
    }
    if (event.forecast) {
      parts.push(`Forecast: ${event.forecast}${event.unit ?? ""}`);
    }
    if (event.previous) {
      parts.push(`Previous: ${event.previous}${event.unit ?? ""}`);
    }

    return {
      id: event.id,
      title: event.name,
      start,
      end,
      calendarId: event.impact,
      description: parts.length > 0 ? parts.join(" | ") : undefined,
      location: `${event.country} | ${event.impact.toUpperCase()} impact`,
    };
  });
}

// ============================================
// Sub-components
// ============================================

function CalendarLoadingState() {
  return (
    <div className="flex flex-col h-full gap-3">
      {/* Filters skeleton */}
      <div className="shrink-0 flex items-center gap-3">
        <Skeleton width={140} height={32} radius={6} />
        <Skeleton width={140} height={32} radius={6} />
        <div className="w-px h-5 bg-cream-300 dark:bg-night-600" />
        <div className="flex items-center gap-1.5">
          <Skeleton width={60} height={26} radius={13} />
          <Skeleton width={70} height={26} radius={13} />
          <Skeleton width={50} height={26} radius={13} />
        </div>
      </div>
      {/* Legend skeleton */}
      <div className="shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Skeleton width={80} height={12} />
          <Skeleton width={100} height={12} />
          <Skeleton width={70} height={12} />
        </div>
        <Skeleton width={120} height={12} />
      </div>
      {/* Calendar skeleton */}
      <div className="flex-1 min-h-0 bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 overflow-hidden">
        <div className="flex items-center justify-center h-full">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-stone-500 dark:text-night-400">Loading events...</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CalendarErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center justify-center h-full bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
      <ErrorEmptyState
        title="Failed to Load Calendar"
        description={message ?? "We couldn't load the economic calendar. Please try again."}
        action={onRetry ? { label: "Retry", onClick: onRetry } : undefined}
      />
    </div>
  );
}

function CalendarEmptyState({
  onClearFilters,
  hasActiveFilters,
}: {
  onClearFilters?: () => void;
  hasActiveFilters?: boolean;
}) {
  return (
    <div className="flex items-center justify-center h-full bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
      <EmptyState
        icon={<CalendarDays className="h-10 w-10" />}
        title="No Economic Events"
        description={
          hasActiveFilters
            ? "No events found for the selected filters. Try adjusting your filters."
            : "No upcoming economic events scheduled for this period."
        }
        action={
          hasActiveFilters && onClearFilters
            ? { label: "Clear Filters", onClick: onClearFilters }
            : undefined
        }
      />
    </div>
  );
}

function ImpactLegend({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="flex items-center gap-2 text-[10px]">
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-stone-600 dark:text-night-300">High</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-500" />
          <span className="text-stone-600 dark:text-night-300">Med</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-gray-400" />
          <span className="text-stone-600 dark:text-night-300">Low</span>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-4 text-xs">
      <div className="flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
        <span className="text-stone-600 dark:text-night-300">High Impact</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
        <span className="text-stone-600 dark:text-night-300">Medium Impact</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full bg-gray-400" />
        <span className="text-stone-600 dark:text-night-300">Low Impact</span>
      </div>
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export function EconomicCalendar() {
  const [filters, setFilters] = useState<CalendarFilterState>(DEFAULT_FILTERS);
  const [isDark, setIsDark] = useState(false);
  const { isMobile, isTablet } = useMediaQuery();

  const { start, end } = useMemo(
    () => getDateRangeFromFilter(filters.dateRange),
    [filters.dateRange]
  );

  const { data, isLoading, error, refetch } = useEconomicCalendar({
    startDate: start,
    endDate: end,
    impact: filters.impact,
    country: filters.country === "ALL" ? undefined : filters.country,
  });

  const handleFilterChange = useCallback((newFilters: CalendarFilterState) => {
    setFilters(newFilters);
  }, []);

  const handleClearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  const hasActiveFilters = useMemo(() => {
    return (
      filters.country !== DEFAULT_FILTERS.country ||
      filters.impact.length !== DEFAULT_FILTERS.impact.length ||
      filters.dateRange !== DEFAULT_FILTERS.dateRange
    );
  }, [filters]);

  const eventsService = useMemo(() => createEventsServicePlugin(), []);

  const calendarEvents = useMemo(() => {
    if (!data?.events) {
      return [];
    }
    return convertToCalendarEvents(data.events);
  }, [data?.events]);

  // Responsive calendar views:
  // - Mobile: month-agenda only (vertical list)
  // - Tablet: month-agenda + month-grid
  // - Desktop: week + month-grid + month-agenda
  const views = useMemo(() => {
    if (isMobile) {
      return [createViewMonthAgenda()];
    }
    if (isTablet) {
      return [createViewMonthAgenda(), createViewMonthGrid()];
    }
    return [createViewWeek(), createViewMonthGrid(), createViewMonthAgenda()];
  }, [isMobile, isTablet]) as [
    ReturnType<typeof createViewWeek>,
    ...ReturnType<typeof createViewWeek>[],
  ];

  const defaultView = useMemo(() => {
    if (isMobile || isTablet) {
      return "month-agenda";
    }
    return "week";
  }, [isMobile, isTablet]);

  const calendar = useNextCalendarApp({
    views,
    defaultView,
    locale: "en-US",
    firstDayOfWeek: 1,
    isDark,
    dayBoundaries: {
      start: "06:00",
      end: "20:00",
    },
    weekOptions: {
      gridHeight: isMobile ? 500 : 800,
      nDays: isMobile ? 1 : 5,
      eventWidth: 95,
    },
    calendars: IMPACT_CALENDARS,
    events: calendarEvents,
    plugins: [eventsService],
    callbacks: {
      onEventClick(_event) {
        // Event click handler - can be extended for event details modal
      },
    },
  });

  // Detect dark mode changes
  useEffect(() => {
    const checkDarkMode = () => {
      setIsDark(document.documentElement.classList.contains("dark"));
    };
    checkDarkMode();

    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  // Update calendar theme when dark mode changes
  useEffect(() => {
    if (calendar) {
      calendar.setTheme(isDark ? "dark" : "light");
    }
  }, [calendar, isDark]);

  // Update events when data changes
  // Note: eventsService.set is only available after calendar initialization
  useEffect(() => {
    if (calendar && eventsService && "set" in eventsService && calendarEvents.length > 0) {
      eventsService.set(calendarEvents);
    }
  }, [calendar, eventsService, calendarEvents]);

  if (isLoading) {
    return <CalendarLoadingState />;
  }

  if (error) {
    return (
      <CalendarErrorState
        message={error instanceof Error ? error.message : undefined}
        onRetry={() => refetch()}
      />
    );
  }

  if (!data?.events || data.events.length === 0) {
    return (
      <CalendarEmptyState hasActiveFilters={hasActiveFilters} onClearFilters={handleClearFilters} />
    );
  }

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="shrink-0">
        <CalendarFilters filters={filters} onFilterChange={handleFilterChange} />
      </div>
      <div className="shrink-0 flex items-center justify-between">
        <ImpactLegend compact={isMobile} />
        <span className="text-[10px] sm:text-xs text-stone-500 dark:text-night-400">
          {data.events.length} events
          <span className="hidden sm:inline">
            {" "}
            • Updated {new Date(data.meta.lastUpdated).toLocaleTimeString()}
          </span>
        </span>
      </div>
      <div className="flex-1 min-h-0 bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 overflow-hidden [&_.sx-react-calendar-wrapper]:h-full [&_.sx-react-calendar]:h-full">
        <ScheduleXCalendar calendarApp={calendar} customComponents={customComponents} />
      </div>
    </div>
  );
}

export default EconomicCalendar;
