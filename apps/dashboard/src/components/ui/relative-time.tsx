/**
 * RelativeTime Component
 *
 * Displays relative time (e.g., '2m ago') with auto-updates and absolute time tooltip.
 *
 * @see docs/plans/ui/31-realtime-patterns.md Feed & Timeline section
 * @see docs/plans/ui/22-typography.md Number Formatting
 */

"use client";

import { format, formatDistanceToNow, isValid } from "date-fns";
import { forwardRef, useEffect, useMemo, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

// Simple className merger utility
function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}

// ============================================
// Types
// ============================================

export interface RelativeTimeProps {
  /** The timestamp to display (Date, ISO string, or Unix ms) */
  timestamp: Date | string | number;
  /** Format for the absolute time tooltip (default: 'PPpp') */
  absoluteFormat?: string;
  /** Auto-update interval in ms (default: auto-calculated based on age) */
  updateInterval?: number;
  /** Prefix text (e.g., 'Updated ') */
  prefix?: string;
  /** Suffix text (e.g., ' ago') - note: date-fns already adds 'ago' */
  suffix?: string;
  /** Whether to capitalize first letter */
  capitalize?: boolean;
  /** Additional class name */
  className?: string;
  /** Whether to show tooltip (default: true) */
  showTooltip?: boolean;
}

// ============================================
// Utility Functions
// ============================================

/**
 * Calculate appropriate update interval based on timestamp age.
 * More recent timestamps update more frequently.
 */
function calculateUpdateInterval(timestamp: Date): number {
  const now = Date.now();
  const diff = now - timestamp.getTime();

  // Less than 1 minute: update every second
  if (diff < 60 * 1000) {
    return 1000;
  }

  // Less than 1 hour: update every minute
  if (diff < 60 * 60 * 1000) {
    return 60 * 1000;
  }

  // Less than 1 day: update every hour
  if (diff < 24 * 60 * 60 * 1000) {
    return 60 * 60 * 1000;
  }

  // Older: update every day
  return 24 * 60 * 60 * 1000;
}

/**
 * Normalize timestamp input to Date object.
 */
function normalizeTimestamp(timestamp: Date | string | number): Date {
  if (timestamp instanceof Date) {
    return timestamp;
  }
  if (typeof timestamp === "number") {
    return new Date(timestamp);
  }
  return new Date(timestamp);
}

/**
 * Format relative time with custom short format.
 * Produces: 'just now', '30s ago', '5m ago', '2h ago', '3d ago'
 */
function formatShortRelative(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();

  // Future dates
  if (diff < 0) {
    return "in the future";
  }

  // Just now (< 10 seconds)
  if (diff < 10 * 1000) {
    return "just now";
  }

  // Seconds (< 1 minute)
  if (diff < 60 * 1000) {
    const seconds = Math.floor(diff / 1000);
    return `${seconds}s ago`;
  }

  // Minutes (< 1 hour)
  if (diff < 60 * 60 * 1000) {
    const minutes = Math.floor(diff / (60 * 1000));
    return `${minutes}m ago`;
  }

  // Hours (< 1 day)
  if (diff < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(diff / (60 * 60 * 1000));
    return `${hours}h ago`;
  }

  // Days (< 1 week)
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    return `${days}d ago`;
  }

  // Fall back to date-fns for older dates
  return formatDistanceToNow(date, { addSuffix: true });
}

// ============================================
// Component
// ============================================

/**
 * RelativeTime - Displays relative time with auto-updates.
 *
 * @example
 * ```tsx
 * <RelativeTime timestamp={new Date()} />
 * // "just now" → updates to "30s ago" → "5m ago" etc.
 *
 * <RelativeTime
 *   timestamp="2025-01-06T10:00:00Z"
 *   prefix="Updated "
 * />
 * // "Updated 2h ago"
 * ```
 */
export const RelativeTime = forwardRef<HTMLTimeElement, RelativeTimeProps>(
  (
    {
      timestamp,
      absoluteFormat = "PPpp",
      updateInterval: customInterval,
      prefix = "",
      suffix = "",
      capitalize = false,
      className,
      showTooltip = true,
    },
    ref
  ) => {
    // Normalize and validate timestamp
    const date = useMemo(() => normalizeTimestamp(timestamp), [timestamp]);
    const isValidDate = useMemo(() => isValid(date), [date]);

    // State for relative time string
    const [relativeTime, setRelativeTime] = useState(() =>
      isValidDate ? formatShortRelative(date) : "Invalid date"
    );

    // Auto-update effect
    useEffect(() => {
      if (!isValidDate) {
        return;
      }

      const update = () => {
        setRelativeTime(formatShortRelative(date));
      };

      // Initial update
      update();

      // Calculate interval
      const interval = customInterval ?? calculateUpdateInterval(date);

      const timer = setInterval(() => {
        update();
      }, interval);

      return () => clearInterval(timer);
    }, [date, isValidDate, customInterval]);

    // Format the display text
    const displayText = useMemo(() => {
      let text = `${prefix}${relativeTime}${suffix}`;
      if (capitalize && text.length > 0) {
        text = text.charAt(0).toUpperCase() + text.slice(1);
      }
      return text;
    }, [relativeTime, prefix, suffix, capitalize]);

    // Format absolute time for tooltip
    const absoluteTime = useMemo(() => {
      if (!isValidDate) {
        return "Invalid date";
      }
      return format(date, absoluteFormat);
    }, [date, isValidDate, absoluteFormat]);

    // ISO string for datetime attribute
    const isoString = useMemo(() => {
      if (!isValidDate) {
        return "";
      }
      return date.toISOString();
    }, [date, isValidDate]);

    const timeElement = (
      <time
        ref={ref}
        dateTime={isoString}
        title={showTooltip ? undefined : absoluteTime}
        className={cn("tabular-nums", className)}
      >
        {displayText}
      </time>
    );

    if (showTooltip) {
      return (
        <Tooltip>
          <TooltipTrigger className="inline">{timeElement}</TooltipTrigger>
          <TooltipContent>{absoluteTime}</TooltipContent>
        </Tooltip>
      );
    }

    return timeElement;
  }
);

RelativeTime.displayName = "RelativeTime";

// ============================================
// Utilities Export
// ============================================

export { formatShortRelative, calculateUpdateInterval };

// ============================================
// Exports
// ============================================

export default RelativeTime;
