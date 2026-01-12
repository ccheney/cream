/**
 * Economic Calendar Widget
 *
 * Compact card-style widget showing upcoming economic events.
 * Designed for embedding in dashboards (Control Panel, etc).
 *
 * For the full-page Schedule-X calendar, see `/calendar` page.
 *
 * @see docs/plans/ui/24-components.md - Component patterns
 * @see docs/plans/ui/28-states.md - Loading/empty/error states
 */

"use client";

import { AlertCircle, CalendarDays, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEconomicCalendar } from "@/hooks/queries";
import type { EconomicEvent, ImpactLevel } from "@/lib/api/types";
import { Card } from "../ui/surface";

// ============================================
// Types
// ============================================

export interface EconomicCalendarWidgetProps {
  /** Number of days to show (default: 7) */
  days?: number;
  /** Maximum number of events to display (default: 5) */
  maxEvents?: number;
  /** Filter by impact level (default: high only) */
  impact?: ImpactLevel | ImpactLevel[];
  /** Show compact version */
  compact?: boolean;
  /** Additional class names */
  className?: string;
}

// ============================================
// Helpers
// ============================================

function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.getTime() === today.getTime()) {
    return "Today";
  }
  if (date.getTime() === tomorrow.getTime()) {
    return "Tomorrow";
  }

  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTime(timeStr: string): string {
  const [hours, minutes] = timeStr.split(":");
  const hour = Number.parseInt(hours ?? "0", 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
}

function getImpactConfig(impact: ImpactLevel) {
  switch (impact) {
    case "high":
      return {
        bg: "bg-orange-100 dark:bg-orange-900/30",
        text: "text-orange-700 dark:text-orange-400",
        border: "border-orange-200 dark:border-orange-800",
        label: "High",
        dotColor: "bg-orange-500",
      };
    case "medium":
      return {
        bg: "bg-teal-100 dark:bg-teal-900/30",
        text: "text-teal-700 dark:text-teal-400",
        border: "border-teal-200 dark:border-teal-800",
        label: "Med",
        dotColor: "bg-teal-500",
      };
    case "low":
      return {
        bg: "bg-stone-100 dark:bg-stone-900/30",
        text: "text-stone-600 dark:text-stone-400",
        border: "border-stone-200 dark:border-stone-700",
        label: "Low",
        dotColor: "bg-stone-400",
      };
  }
}

function getDateRange(days: number): { start: string; end: string } {
  const start = new Date();
  const end = new Date();
  end.setDate(end.getDate() + days);

  return {
    start: start.toISOString().split("T")[0]!,
    end: end.toISOString().split("T")[0]!,
  };
}

// ============================================
// Sub-components
// ============================================

function ImpactBadge({ impact }: { impact: ImpactLevel }) {
  const config = getImpactConfig(impact);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase",
        config.bg,
        config.text
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", config.dotColor)} />
      {config.label}
    </span>
  );
}

function EventRow({ event, compact }: { event: EconomicEvent; compact?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 py-2",
        "border-b border-cream-200 dark:border-night-700 last:border-b-0"
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-stone-800 dark:text-night-100 truncate">
            {event.name}
          </span>
          <ImpactBadge impact={event.impact} />
        </div>
        {!compact && (
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-stone-500 dark:text-night-400">
              {formatDate(event.date)}
            </span>
            <span className="text-xs text-stone-400 dark:text-night-500">•</span>
            <span className="text-xs text-stone-500 dark:text-night-400 font-mono">
              {formatTime(event.time)} ET
            </span>
          </div>
        )}
      </div>
      {compact && (
        <span className="text-xs text-stone-500 dark:text-night-400 whitespace-nowrap">
          {formatDate(event.date)}
        </span>
      )}
    </div>
  );
}

function SkeletonRow({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-cream-200 dark:border-night-700 last:border-b-0">
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <div className="h-4 w-32 rounded bg-stone-200 dark:bg-night-700 animate-pulse" />
          <div className="h-4 w-10 rounded bg-stone-200 dark:bg-night-700 animate-pulse" />
        </div>
        {!compact && (
          <div className="h-3 w-24 rounded bg-stone-200 dark:bg-night-700 animate-pulse" />
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-6 text-center">
      <CalendarDays className="h-8 w-8 text-stone-300 dark:text-night-600 mb-2" />
      <p className="text-sm text-stone-500 dark:text-night-400">No upcoming events</p>
      <p className="text-xs text-stone-400 dark:text-night-500 mt-1">
        Check back for scheduled releases
      </p>
    </div>
  );
}

function ErrorState({ message }: { message?: string }) {
  return (
    <div className="flex items-center gap-2 py-4 text-red-600 dark:text-red-400">
      <AlertCircle className="h-4 w-4 flex-shrink-0" />
      <span className="text-sm">{message ?? "Failed to load calendar"}</span>
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export function EconomicCalendarWidget({
  days = 7,
  maxEvents = 5,
  impact = "high",
  compact = false,
  className,
}: EconomicCalendarWidgetProps) {
  const { start, end } = getDateRange(days);

  const { data, isLoading, error } = useEconomicCalendar({
    startDate: start,
    endDate: end,
    impact,
  });

  const events = data?.events.slice(0, maxEvents) ?? [];

  return (
    <Card elevation={1} padding="none" className={className}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-cream-200 dark:border-night-700">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-stone-500 dark:text-night-400" />
          <h3 className="text-sm font-semibold text-stone-700 dark:text-night-200 uppercase tracking-wider">
            Economic Calendar
          </h3>
        </div>
        <Link
          href="/calendar"
          className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
        >
          View All
          <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Content */}
      <div className="px-4 py-2">
        {error ? (
          <ErrorState message={error instanceof Error ? error.message : undefined} />
        ) : isLoading ? (
          <div className="space-y-0">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonRow key={i} compact={compact} />
            ))}
          </div>
        ) : events.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-0">
            {events.map((event) => (
              <EventRow key={event.id} event={event} compact={compact} />
            ))}
          </div>
        )}
      </div>

      {/* Footer - Show count if more events exist */}
      {!isLoading && !error && data && data.events.length > maxEvents && (
        <div className="px-4 py-2 border-t border-cream-200 dark:border-night-700 bg-cream-50 dark:bg-night-800/50">
          <span className="text-xs text-stone-500 dark:text-night-400">
            +{data.events.length - maxEvents} more events this week
          </span>
        </div>
      )}
    </Card>
  );
}

export default EconomicCalendarWidget;
