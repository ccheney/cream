/**
 * Economic Event Card Component
 *
 * Custom event card for Schedule-X calendar with impact-based styling.
 * Used as customComponents.timeGridEvent and customComponents.monthGridEvent.
 *
 * @see docs/plans/ui/21-color-system.md - Color tokens
 * @see docs/plans/41-economic-calendar-page.md - Event card design
 */

"use client";

import "temporal-polyfill/global";

import type { ImpactLevel } from "@/lib/api/types";

// ============================================
// Types
// ============================================

export interface CalendarEventData {
  id: string;
  title: string;
  start: Temporal.ZonedDateTime;
  end: Temporal.ZonedDateTime;
  calendarId: string;
  description?: string;
  location?: string;
}

interface EventCardProps {
  calendarEvent: CalendarEventData;
}

// ============================================
// Constants
// ============================================

const IMPACT_STYLES: Record<
  ImpactLevel,
  {
    container: string;
    border: string;
    text: string;
    badge: string;
    badgeText: string;
  }
> = {
  high: {
    container: "bg-red-50 dark:bg-red-900/20",
    border: "border-l-2 border-red-500",
    text: "text-red-900 dark:text-red-100",
    badge: "bg-red-100 dark:bg-red-800/50",
    badgeText: "text-red-700 dark:text-red-300",
  },
  medium: {
    container: "bg-amber-50 dark:bg-amber-900/20",
    border: "border-l-2 border-amber-500",
    text: "text-amber-900 dark:text-amber-100",
    badge: "bg-amber-100 dark:bg-amber-800/50",
    badgeText: "text-amber-700 dark:text-amber-300",
  },
  low: {
    container: "bg-stone-50 dark:bg-stone-800/50",
    border: "border-l-2 border-stone-400",
    text: "text-stone-700 dark:text-stone-200",
    badge: "bg-stone-100 dark:bg-stone-700/50",
    badgeText: "text-stone-600 dark:text-stone-300",
  },
};

const IMPACT_LABELS: Record<ImpactLevel, string> = {
  high: "HIGH",
  medium: "MED",
  low: "LOW",
};

// ============================================
// Utilities
// ============================================

function getImpactFromCalendarId(calendarId: string): ImpactLevel {
  if (calendarId === "high" || calendarId === "medium" || calendarId === "low") {
    return calendarId;
  }
  return "low";
}

function formatTime(dateTime: Temporal.ZonedDateTime): string {
  const hour = dateTime.hour;
  const minutes = String(dateTime.minute).padStart(2, "0");
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
}

// ============================================
// Components
// ============================================

/**
 * Time Grid Event Card (Week/Day view)
 * Full-height card with title and time
 */
export function TimeGridEventCard({ calendarEvent }: EventCardProps) {
  const impact = getImpactFromCalendarId(calendarEvent.calendarId);
  const styles = IMPACT_STYLES[impact];
  const time = formatTime(calendarEvent.start);

  return (
    <button
      type="button"
      className={`h-full w-full px-2 py-1 rounded-sm overflow-hidden text-left ${styles.container} ${styles.border}`}
      aria-label={`${calendarEvent.title}, ${impact} impact event at ${time}`}
    >
      <div className="flex flex-col h-full">
        <span className={`text-xs font-medium truncate ${styles.text}`}>{calendarEvent.title}</span>
        <span className="text-[10px] text-stone-500 dark:text-night-400 mt-0.5">{time} ET</span>
        {calendarEvent.description && (
          <span className="text-[10px] text-stone-400 dark:text-night-500 truncate mt-auto">
            {calendarEvent.description}
          </span>
        )}
      </div>
    </button>
  );
}

/**
 * Month Grid Event Card (Month view)
 * Compact single-line card with impact badge
 */
export function MonthGridEventCard({ calendarEvent }: EventCardProps) {
  const impact = getImpactFromCalendarId(calendarEvent.calendarId);
  const styles = IMPACT_STYLES[impact];

  return (
    <button
      type="button"
      className={`flex items-center gap-1 px-1.5 py-0.5 rounded-sm overflow-hidden w-full text-left ${styles.container} ${styles.border}`}
      aria-label={`${calendarEvent.title}, ${impact} impact event`}
    >
      <span
        className={`shrink-0 text-[9px] font-bold px-1 py-0.5 rounded ${styles.badge} ${styles.badgeText}`}
      >
        {IMPACT_LABELS[impact]}
      </span>
      <span className={`text-[11px] truncate ${styles.text}`}>{calendarEvent.title}</span>
    </button>
  );
}

/**
 * Default Event Card export
 * Can be used for both time grid and month grid
 */
export function EventCard({ calendarEvent }: EventCardProps) {
  return <TimeGridEventCard calendarEvent={calendarEvent} />;
}

export default EventCard;
