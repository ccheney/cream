/**
 * EventFeed Component
 *
 * Real-time event feed with virtualized scrolling, auto-scroll behavior,
 * color-coded borders, and relative timestamps.
 *
 * @see docs/plans/ui/31-realtime-patterns.md lines 46-67
 */

"use client";

import { memo, useCallback, useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useAutoScroll } from "./use-auto-scroll.js";
import { useRelativeTime } from "./use-relative-time.js";

// ============================================
// Types
// ============================================

export type EventType = "QUOTE" | "FILL" | "ORDER" | "DECISION";

export interface FeedEvent {
  /** Unique event identifier */
  id: string;
  /** Event type */
  type: EventType;
  /** Event timestamp */
  timestamp: Date;
  /** Related trading symbol */
  symbol?: string;
  /** Event message/description */
  message: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface EventFeedProps {
  /** Array of events to display */
  events: FeedEvent[];
  /** Callback when an event is clicked */
  onEventClick?: (event: FeedEvent) => void;
  /** Height of the feed container */
  height?: number | string;
  /** Maximum number of events to keep (for memory management) */
  maxEvents?: number;
  /** Custom CSS class */
  className?: string;
  /** Test ID for testing */
  "data-testid"?: string;
}

// ============================================
// Constants
// ============================================

const EVENT_ITEM_HEIGHT = 48; // Fixed height for virtualization

const EVENT_TYPE_CONFIG: Record<
  EventType,
  { color: string; icon: string; label: string }
> = {
  QUOTE: {
    color: "var(--chart-blue, #3b82f6)",
    icon: "●",
    label: "QUOTE",
  },
  FILL: {
    color: "var(--profit, #22c55e)",
    icon: "✓",
    label: "FILL",
  },
  ORDER: {
    color: "var(--neutral, #eab308)",
    icon: "▸",
    label: "ORDER",
  },
  DECISION: {
    color: "var(--chart-purple, #a855f7)",
    icon: "★",
    label: "DECISION",
  },
};

// ============================================
// Event Item Component
// ============================================

interface EventItemProps {
  event: FeedEvent;
  onClick?: (event: FeedEvent) => void;
}

const EventItem = memo(function EventItem({ event, onClick }: EventItemProps) {
  const { formatted } = useRelativeTime(event.timestamp);
  const config = EVENT_TYPE_CONFIG[event.type];

  const handleClick = useCallback(() => {
    onClick?.(event);
  }, [event, onClick]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick?.(event);
      }
    },
    [event, onClick]
  );

  return (
    <div
      className="flex items-center gap-3 px-3 py-2 border-l-4 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer transition-colors"
      style={{ borderLeftColor: config.color }}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`${event.type} event: ${event.message}`}
      data-event-id={event.id}
    >
      {/* Icon */}
      <span
        className="flex-shrink-0 w-5 text-center font-medium"
        style={{ color: config.color }}
        aria-hidden="true"
      >
        {config.icon}
      </span>

      {/* Timestamp */}
      <span className="flex-shrink-0 w-12 text-xs font-mono text-stone-500 dark:text-stone-400 tabular-nums">
        {formatted}
      </span>

      {/* Type Badge */}
      <span
        className="flex-shrink-0 px-1.5 py-0.5 text-xs font-medium rounded"
        style={{
          backgroundColor: `${config.color}20`,
          color: config.color,
        }}
      >
        {config.label}
      </span>

      {/* Symbol (if present) */}
      {event.symbol && (
        <span className="flex-shrink-0 font-mono font-medium text-sm text-stone-700 dark:text-stone-300">
          {event.symbol}
        </span>
      )}

      {/* Message */}
      <span className="flex-1 text-sm text-stone-600 dark:text-stone-300 truncate">
        {event.message}
      </span>
    </div>
  );
});

// ============================================
// New Events Button Component
// ============================================

interface NewEventsButtonProps {
  count: number;
  onClick: () => void;
}

const NewEventsButton = memo(function NewEventsButton({
  count,
  onClick,
}: NewEventsButtonProps) {
  if (count === 0) return null;

  return (
    <button
      className="absolute top-2 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-full shadow-lg transition-all animate-slide-down"
      onClick={onClick}
      aria-label={`Show ${count} new ${count === 1 ? "event" : "events"}`}
    >
      <span className="inline-flex items-center gap-1">
        <span aria-hidden="true">↓</span>
        <span>
          {count} new {count === 1 ? "event" : "events"}
        </span>
      </span>
    </button>
  );
});

// ============================================
// Empty State Component
// ============================================

const EmptyState = memo(function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-stone-500 dark:text-stone-400">
      <span className="text-2xl mb-2" aria-hidden="true">
        📭
      </span>
      <span className="text-sm">No events yet</span>
    </div>
  );
});

// ============================================
// Main Component
// ============================================

/**
 * EventFeed displays a virtualized, real-time event feed.
 *
 * Features:
 * - Virtualized scrolling for performance with 1000+ events
 * - Auto-scroll when at bottom, pause when user scrolls up
 * - "New events" button when paused
 * - Color-coded left borders by event type
 * - Live-updating relative timestamps
 * - Keyboard accessible
 *
 * @example
 * ```tsx
 * <EventFeed
 *   events={events}
 *   onEventClick={(event) => console.log('Clicked:', event)}
 *   height={400}
 * />
 * ```
 */
export const EventFeed = memo(function EventFeed({
  events,
  onEventClick,
  height = 400,
  maxEvents = 1000,
  className = "",
  "data-testid": testId,
}: EventFeedProps) {
  // Limit events for memory management
  const displayEvents =
    events.length > maxEvents ? events.slice(-maxEvents) : events;

  // Auto-scroll behavior
  const {
    containerRef,
    isAutoScrolling,
    newItemCount,
    scrollToBottom,
    onNewItems,
    onScroll,
  } = useAutoScroll({ threshold: 50 });

  // Track previous event count for detecting new events
  const prevCountRef = useRef(displayEvents.length);

  // Notify when new events arrive
  useEffect(() => {
    const newCount = displayEvents.length - prevCountRef.current;
    if (newCount > 0) {
      onNewItems(newCount);
    }
    prevCountRef.current = displayEvents.length;
  }, [displayEvents.length, onNewItems]);

  // Virtualizer setup
  const virtualizer = useVirtualizer({
    count: displayEvents.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => EVENT_ITEM_HEIGHT,
    overscan: 5,
  });

  // Handle scroll to bottom when auto-scrolling kicks in
  useEffect(() => {
    if (isAutoScrolling && containerRef.current) {
      virtualizer.scrollToIndex(displayEvents.length - 1, {
        align: "end",
        behavior: "auto",
      });
    }
  }, [isAutoScrolling, displayEvents.length, virtualizer]);

  const containerHeight =
    typeof height === "number" ? `${height}px` : height;

  if (displayEvents.length === 0) {
    return (
      <div
        className={`relative ${className}`}
        style={{ height: containerHeight }}
        data-testid={testId}
      >
        <EmptyState />
      </div>
    );
  }

  return (
    <div
      className={`relative ${className}`}
      style={{ height: containerHeight }}
      data-testid={testId}
    >
      {/* New Events Button */}
      <NewEventsButton count={newItemCount} onClick={scrollToBottom} />

      {/* Virtualized List */}
      <div
        ref={containerRef}
        className="h-full overflow-auto bg-white dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-700"
        onScroll={onScroll}
        role="log"
        aria-live="polite"
        aria-label="Event feed"
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const event = displayEvents[virtualItem.index];
            if (!event) return null;
            return (
              <div
                key={event.id}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualItem.size}px`,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <EventItem event={event} onClick={onEventClick} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Auto-scroll Indicator */}
      {isAutoScrolling && (
        <div
          className="absolute bottom-2 right-2 px-2 py-1 bg-stone-800/80 text-white text-xs rounded"
          aria-hidden="true"
        >
          Live
        </div>
      )}
    </div>
  );
});

// ============================================
// Exports
// ============================================

export type { EventItemProps, NewEventsButtonProps };
export default EventFeed;
