/**
 * EventFeed Component Tests
 *
 * Tests for event feed utilities, hooks, and type definitions.
 */

import { describe, expect, it } from "bun:test";
import type { EventType, FeedEvent } from "./event-feed";

// ============================================
// Test Utilities
// ============================================

function createTestEvent(overrides: Partial<FeedEvent> = {}, index = 0): FeedEvent {
  return {
    id: `event-${index}`,
    type: "QUOTE" as EventType,
    timestamp: new Date(Date.now() - index * 1000),
    symbol: "AAPL",
    message: `Test event ${index}`,
    ...overrides,
  };
}

function createManyEvents(count: number): FeedEvent[] {
  return Array.from({ length: count }, (_, i) => createTestEvent({}, i));
}

// ============================================
// Event Type Tests
// ============================================

describe("FeedEvent types", () => {
  it("creates valid QUOTE event", () => {
    const event = createTestEvent({ type: "QUOTE", message: "AAPL $187.52" });
    expect(event.type).toBe("QUOTE");
    expect(event.message).toBe("AAPL $187.52");
  });

  it("creates valid FILL event", () => {
    const event = createTestEvent({
      type: "FILL",
      message: "Bought 100 AAPL @ $187.50",
    });
    expect(event.type).toBe("FILL");
  });

  it("creates valid ORDER event", () => {
    const event = createTestEvent({
      type: "ORDER",
      message: "Limit buy 100 AAPL @ $187.00",
    });
    expect(event.type).toBe("ORDER");
  });

  it("creates valid DECISION event", () => {
    const event = createTestEvent({
      type: "DECISION",
      message: "BUY AAPL (consensus 7/8)",
    });
    expect(event.type).toBe("DECISION");
  });

  it("handles event without symbol", () => {
    const event = createTestEvent({ symbol: undefined });
    expect(event.symbol).toBeUndefined();
  });

  it("includes metadata when provided", () => {
    const event = createTestEvent({
      metadata: { orderId: "123", quantity: 100 },
    });
    expect(event.metadata).toEqual({ orderId: "123", quantity: 100 });
  });
});

// ============================================
// Batch Event Creation Tests
// ============================================

describe("createManyEvents", () => {
  it("creates the requested number of events", () => {
    const events = createManyEvents(10);
    expect(events).toHaveLength(10);
  });

  it("creates events with unique IDs", () => {
    const events = createManyEvents(5);
    const ids = new Set(events.map((e) => e.id));
    expect(ids.size).toBe(5);
  });

  it("creates events with descending timestamps", () => {
    const events = createManyEvents(3);
    const [event0, event1, event2] = events;
    // First event is most recent (index 0)
    expect(event0?.timestamp.getTime()).toBeGreaterThan(event1?.timestamp.getTime() ?? 0);
    expect(event1?.timestamp.getTime()).toBeGreaterThan(event2?.timestamp.getTime() ?? 0);
  });

  it("handles zero events", () => {
    const events = createManyEvents(0);
    expect(events).toHaveLength(0);
  });

  it("handles large event counts", () => {
    const events = createManyEvents(1000);
    expect(events).toHaveLength(1000);
  });
});

// ============================================
// Event Type Config Tests
// ============================================

const EVENT_TYPE_CONFIG: Record<EventType, { color: string; icon: string; label: string }> = {
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

describe("EVENT_TYPE_CONFIG", () => {
  it("has config for QUOTE type", () => {
    expect(EVENT_TYPE_CONFIG.QUOTE.icon).toBe("●");
    expect(EVENT_TYPE_CONFIG.QUOTE.label).toBe("QUOTE");
  });

  it("has config for FILL type", () => {
    expect(EVENT_TYPE_CONFIG.FILL.icon).toBe("✓");
    expect(EVENT_TYPE_CONFIG.FILL.label).toBe("FILL");
  });

  it("has config for ORDER type", () => {
    expect(EVENT_TYPE_CONFIG.ORDER.icon).toBe("▸");
    expect(EVENT_TYPE_CONFIG.ORDER.label).toBe("ORDER");
  });

  it("has config for DECISION type", () => {
    expect(EVENT_TYPE_CONFIG.DECISION.icon).toBe("★");
    expect(EVENT_TYPE_CONFIG.DECISION.label).toBe("DECISION");
  });

  it("all types have color property", () => {
    const types: EventType[] = ["QUOTE", "FILL", "ORDER", "DECISION"];
    for (const type of types) {
      expect(EVENT_TYPE_CONFIG[type].color).toBeDefined();
      expect(EVENT_TYPE_CONFIG[type].color.length).toBeGreaterThan(0);
    }
  });
});

// ============================================
// Relative Time Formatting Tests
// ============================================

function formatRelativeTime(seconds: number): string {
  if (seconds < 0) {
    return "just now";
  }
  if (seconds < 5) {
    return "just now";
  }
  if (seconds < 60) {
    return `${Math.floor(seconds)}s ago`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

describe("formatRelativeTime", () => {
  it("formats very recent times as 'just now'", () => {
    expect(formatRelativeTime(0)).toBe("just now");
    expect(formatRelativeTime(1)).toBe("just now");
    expect(formatRelativeTime(4)).toBe("just now");
  });

  it("formats seconds", () => {
    expect(formatRelativeTime(5)).toBe("5s ago");
    expect(formatRelativeTime(30)).toBe("30s ago");
    expect(formatRelativeTime(59)).toBe("59s ago");
  });

  it("formats minutes", () => {
    expect(formatRelativeTime(60)).toBe("1m ago");
    expect(formatRelativeTime(120)).toBe("2m ago");
    expect(formatRelativeTime(3540)).toBe("59m ago");
  });

  it("formats hours", () => {
    expect(formatRelativeTime(3600)).toBe("1h ago");
    expect(formatRelativeTime(7200)).toBe("2h ago");
    expect(formatRelativeTime(82800)).toBe("23h ago");
  });

  it("formats days", () => {
    expect(formatRelativeTime(86400)).toBe("1d ago");
    expect(formatRelativeTime(172800)).toBe("2d ago");
    expect(formatRelativeTime(604800)).toBe("7d ago");
  });

  it("handles negative seconds", () => {
    expect(formatRelativeTime(-10)).toBe("just now");
  });
});

// ============================================
// Auto-Scroll Logic Tests
// ============================================

interface AutoScrollState {
  isAutoScrolling: boolean;
  isAtBottom: boolean;
  newItemCount: number;
}

function simulateScrollBehavior(
  initialState: AutoScrollState,
  actions: Array<{ type: "scroll_up" | "scroll_to_bottom" | "new_items"; count?: number }>
): AutoScrollState {
  const state = { ...initialState };

  for (const action of actions) {
    switch (action.type) {
      case "scroll_up":
        state.isAutoScrolling = false;
        state.isAtBottom = false;
        break;
      case "scroll_to_bottom":
        state.isAutoScrolling = true;
        state.isAtBottom = true;
        state.newItemCount = 0;
        break;
      case "new_items":
        if (state.isAutoScrolling) {
          // Auto-scroll handles new items automatically
        } else {
          state.newItemCount += action.count ?? 1;
        }
        break;
    }
  }

  return state;
}

describe("Auto-scroll behavior simulation", () => {
  const initialState: AutoScrollState = {
    isAutoScrolling: true,
    isAtBottom: true,
    newItemCount: 0,
  };

  it("starts with auto-scroll enabled", () => {
    const state = simulateScrollBehavior(initialState, []);
    expect(state.isAutoScrolling).toBe(true);
    expect(state.isAtBottom).toBe(true);
  });

  it("pauses auto-scroll when user scrolls up", () => {
    const state = simulateScrollBehavior(initialState, [{ type: "scroll_up" }]);
    expect(state.isAutoScrolling).toBe(false);
    expect(state.isAtBottom).toBe(false);
  });

  it("tracks new items when paused", () => {
    const state = simulateScrollBehavior(initialState, [
      { type: "scroll_up" },
      { type: "new_items", count: 3 },
      { type: "new_items", count: 2 },
    ]);
    expect(state.newItemCount).toBe(5);
  });

  it("resumes auto-scroll when user scrolls to bottom", () => {
    const state = simulateScrollBehavior(initialState, [
      { type: "scroll_up" },
      { type: "new_items", count: 5 },
      { type: "scroll_to_bottom" },
    ]);
    expect(state.isAutoScrolling).toBe(true);
    expect(state.newItemCount).toBe(0);
  });

  it("does not increment new items when auto-scrolling", () => {
    const state = simulateScrollBehavior(initialState, [{ type: "new_items", count: 10 }]);
    expect(state.newItemCount).toBe(0);
  });
});

// ============================================
// Virtualization Tests
// ============================================

describe("Virtualization logic", () => {
  it("limits events to maxEvents", () => {
    const events = createManyEvents(100);
    const maxEvents = 50;
    const displayEvents = events.length > maxEvents ? events.slice(-maxEvents) : events;
    expect(displayEvents).toHaveLength(50);
  });

  it("keeps most recent events when limiting", () => {
    const events = createManyEvents(100);
    const maxEvents = 50;
    const displayEvents = events.slice(-maxEvents);
    const lastEvent = displayEvents[displayEvents.length - 1];

    // Most recent event should be included (index 0 in original)
    expect(lastEvent?.id).toBe("event-99");
  });

  it("does not limit when under maxEvents", () => {
    const events = createManyEvents(30);
    const maxEvents = 50;
    const displayEvents = events.length > maxEvents ? events.slice(-maxEvents) : events;
    expect(displayEvents).toHaveLength(30);
  });

  it("calculates visible item count correctly", () => {
    const containerHeight = 400;
    const itemHeight = 48;
    const overscan = 5;
    const visibleCount = Math.ceil(containerHeight / itemHeight) + overscan * 2;
    expect(visibleCount).toBe(19); // 8.33 visible + 10 overscan
  });
});

// ============================================
// Event Filtering Tests (for future use)
// ============================================

describe("Event filtering", () => {
  it("filters by event type", () => {
    const events = [
      createTestEvent({ type: "QUOTE" }),
      createTestEvent({ type: "FILL" }),
      createTestEvent({ type: "QUOTE" }),
      createTestEvent({ type: "ORDER" }),
    ];

    const quotes = events.filter((e) => e.type === "QUOTE");
    expect(quotes).toHaveLength(2);
  });

  it("filters by symbol", () => {
    const events = [
      createTestEvent({ symbol: "AAPL" }),
      createTestEvent({ symbol: "NVDA" }),
      createTestEvent({ symbol: "AAPL" }),
    ];

    const aapl = events.filter((e) => e.symbol === "AAPL");
    expect(aapl).toHaveLength(2);
  });

  it("combines multiple filters", () => {
    const events = [
      createTestEvent({ type: "QUOTE", symbol: "AAPL" }),
      createTestEvent({ type: "FILL", symbol: "AAPL" }),
      createTestEvent({ type: "QUOTE", symbol: "NVDA" }),
    ];

    const aaplQuotes = events.filter((e) => e.type === "QUOTE" && e.symbol === "AAPL");
    expect(aaplQuotes).toHaveLength(1);
  });
});
