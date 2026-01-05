/**
 * Event Feed Store
 *
 * Manages real-time event feed with buffering, scroll state, and new event tracking.
 * Uses Zustand for efficient state management with selective subscriptions.
 *
 * @see docs/plans/ui/31-realtime-patterns.md
 */

import { create } from "zustand";
import { devtools, subscribeWithSelector } from "zustand/middleware";

// ============================================
// Types
// ============================================

export type EventType =
  | "trade_executed"
  | "order_placed"
  | "order_cancelled"
  | "order_filled"
  | "order_rejected"
  | "position_opened"
  | "position_closed"
  | "stop_triggered"
  | "take_profit_triggered"
  | "margin_warning"
  | "system_alert"
  | "agent_decision"
  | "market_event";

export type EventSeverity = "info" | "warning" | "error" | "success";

export interface FeedEvent {
  /** Unique event ID */
  id: string;
  /** Event type */
  type: EventType;
  /** Event severity for styling */
  severity: EventSeverity;
  /** Event title */
  title: string;
  /** Event description */
  message: string;
  /** Event timestamp */
  timestamp: Date;
  /** Related symbol (if applicable) */
  symbol?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface EventFeedState {
  /** Events in the feed (newest last) */
  events: FeedEvent[];
  /** Maximum events to keep in buffer */
  maxEvents: number;
  /** Whether the user is scrolled to bottom */
  isAtBottom: boolean;
  /** Count of new events since user scrolled away from bottom */
  newEventCount: number;
  /** Whether the feed is paused */
  isPaused: boolean;
  /** Filter by event types (empty = all) */
  typeFilter: EventType[];
  /** Filter by severity (empty = all) */
  severityFilter: EventSeverity[];
}

export interface EventFeedActions {
  /** Add an event to the feed */
  addEvent: (event: Omit<FeedEvent, "id" | "timestamp">) => void;
  /** Add multiple events at once */
  addEvents: (events: Array<Omit<FeedEvent, "id" | "timestamp">>) => void;
  /** Clear all events */
  clearEvents: () => void;
  /** Set scroll position state */
  setIsAtBottom: (isAtBottom: boolean) => void;
  /** Reset new event count (when user scrolls to bottom) */
  resetNewEventCount: () => void;
  /** Pause/resume the feed */
  setPaused: (isPaused: boolean) => void;
  /** Toggle pause state */
  togglePaused: () => void;
  /** Set type filter */
  setTypeFilter: (types: EventType[]) => void;
  /** Set severity filter */
  setSeverityFilter: (severities: EventSeverity[]) => void;
  /** Get filtered events */
  getFilteredEvents: () => FeedEvent[];
}

export type EventFeedStore = EventFeedState & EventFeedActions;

// ============================================
// Defaults
// ============================================

const DEFAULT_MAX_EVENTS = 1000;

const initialState: EventFeedState = {
  events: [],
  maxEvents: DEFAULT_MAX_EVENTS,
  isAtBottom: true,
  newEventCount: 0,
  isPaused: false,
  typeFilter: [],
  severityFilter: [],
};

// ============================================
// Store
// ============================================

/**
 * Generate unique event ID.
 */
function generateEventId(): string {
  return `evt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export const useEventFeedStore = create<EventFeedStore>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      ...initialState,

      addEvent: (event) => {
        if (get().isPaused) {
          return;
        }

        const newEvent: FeedEvent = {
          ...event,
          id: generateEventId(),
          timestamp: new Date(),
        };

        set((state) => {
          const events = [...state.events, newEvent];
          // Trim to max events
          const trimmedEvents =
            events.length > state.maxEvents
              ? events.slice(events.length - state.maxEvents)
              : events;

          return {
            events: trimmedEvents,
            newEventCount: state.isAtBottom ? 0 : state.newEventCount + 1,
          };
        });
      },

      addEvents: (events) => {
        if (get().isPaused) {
          return;
        }

        const now = new Date();
        const newEvents: FeedEvent[] = events.map((event, index) => ({
          ...event,
          id: generateEventId(),
          // Stagger timestamps slightly for ordering
          timestamp: new Date(now.getTime() + index),
        }));

        set((state) => {
          const allEvents = [...state.events, ...newEvents];
          const trimmedEvents =
            allEvents.length > state.maxEvents
              ? allEvents.slice(allEvents.length - state.maxEvents)
              : allEvents;

          return {
            events: trimmedEvents,
            newEventCount: state.isAtBottom ? 0 : state.newEventCount + newEvents.length,
          };
        });
      },

      clearEvents: () => {
        set({
          events: [],
          newEventCount: 0,
        });
      },

      setIsAtBottom: (isAtBottom) => {
        set({
          isAtBottom,
          // Reset count when scrolled to bottom
          newEventCount: isAtBottom ? 0 : get().newEventCount,
        });
      },

      resetNewEventCount: () => {
        set({ newEventCount: 0 });
      },

      setPaused: (isPaused) => {
        set({ isPaused });
      },

      togglePaused: () => {
        set((state) => ({ isPaused: !state.isPaused }));
      },

      setTypeFilter: (types) => {
        set({ typeFilter: types });
      },

      setSeverityFilter: (severities) => {
        set({ severityFilter: severities });
      },

      getFilteredEvents: () => {
        const state = get();
        let filtered = state.events;

        // Filter by type
        if (state.typeFilter.length > 0) {
          filtered = filtered.filter((e) => state.typeFilter.includes(e.type));
        }

        // Filter by severity
        if (state.severityFilter.length > 0) {
          filtered = filtered.filter((e) => state.severityFilter.includes(e.severity));
        }

        return filtered;
      },
    })),
    { name: "event-feed-store" }
  )
);

// ============================================
// Selectors
// ============================================

/**
 * Select event count.
 */
export const selectEventCount = (state: EventFeedStore) => state.events.length;

/**
 * Select new event count (unread).
 */
export const selectNewEventCount = (state: EventFeedStore) => state.newEventCount;

/**
 * Select whether there are new events.
 */
export const selectHasNewEvents = (state: EventFeedStore) => state.newEventCount > 0;

/**
 * Select most recent event.
 */
export const selectLatestEvent = (state: EventFeedStore) =>
  state.events.length > 0 ? state.events[state.events.length - 1] : null;

/**
 * Select events by type.
 */
export const selectEventsByType = (type: EventType) => (state: EventFeedStore) =>
  state.events.filter((e) => e.type === type);

/**
 * Select events by symbol.
 */
export const selectEventsBySymbol = (symbol: string) => (state: EventFeedStore) =>
  state.events.filter((e) => e.symbol === symbol);

/**
 * Select events since a timestamp.
 */
export const selectEventsSince = (since: Date) => (state: EventFeedStore) =>
  state.events.filter((e) => e.timestamp > since);

// ============================================
// Subscription Helpers
// ============================================

/**
 * Subscribe to new events only.
 * Returns unsubscribe function.
 */
export function subscribeToNewEvents(callback: (event: FeedEvent) => void): () => void {
  let lastEventId: string | null = null;

  return useEventFeedStore.subscribe(
    (state) => state.events,
    (events) => {
      if (events.length === 0) {
        lastEventId = null;
        return;
      }

      const latestEvent = events[events.length - 1];
      if (!latestEvent) {
        return;
      }

      if (latestEvent.id !== lastEventId) {
        lastEventId = latestEvent.id;
        callback(latestEvent);
      }
    }
  );
}

/**
 * Subscribe to events of a specific type.
 */
export function subscribeToEventType(
  type: EventType,
  callback: (event: FeedEvent) => void
): () => void {
  let lastEventId: string | null = null;

  return useEventFeedStore.subscribe(
    (state) => state.events,
    (events) => {
      const typeEvents = events.filter((e) => e.type === type);
      if (typeEvents.length === 0) {
        lastEventId = null;
        return;
      }

      const latestEvent = typeEvents[typeEvents.length - 1];
      if (!latestEvent) {
        return;
      }

      if (latestEvent.id !== lastEventId) {
        lastEventId = latestEvent.id;
        callback(latestEvent);
      }
    }
  );
}

// ============================================
// Export
// ============================================

export default useEventFeedStore;
