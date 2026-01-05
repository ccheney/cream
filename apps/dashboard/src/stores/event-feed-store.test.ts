/**
 * Event Feed Store Tests
 */

import { describe, it, expect, beforeEach } from "bun:test";
import {
  useEventFeedStore,
  selectEventCount,
  selectNewEventCount,
  selectHasNewEvents,
  selectLatestEvent,
  selectEventsByType,
  selectEventsBySymbol,
  type FeedEvent,
  type EventType,
  type EventSeverity,
} from "./event-feed-store";

// ============================================
// Helper Functions
// ============================================

function resetStore() {
  useEventFeedStore.setState({
    events: [],
    maxEvents: 1000,
    isAtBottom: true,
    newEventCount: 0,
    isPaused: false,
    typeFilter: [],
    severityFilter: [],
  });
}

function createMockEvent(overrides?: Partial<FeedEvent>): Omit<FeedEvent, "id" | "timestamp"> {
  return {
    type: "trade_executed" as EventType,
    severity: "info" as EventSeverity,
    title: "Trade Executed",
    message: "Bought 100 shares of AAPL",
    symbol: "AAPL",
    ...overrides,
  };
}

// ============================================
// Type Tests
// ============================================

describe("EventType type", () => {
  it("has all expected event types", () => {
    const types: EventType[] = [
      "trade_executed",
      "order_placed",
      "order_cancelled",
      "order_filled",
      "order_rejected",
      "position_opened",
      "position_closed",
      "stop_triggered",
      "take_profit_triggered",
      "margin_warning",
      "system_alert",
      "agent_decision",
      "market_event",
    ];
    expect(types).toHaveLength(13);
  });
});

describe("EventSeverity type", () => {
  it("has all expected severities", () => {
    const severities: EventSeverity[] = ["info", "warning", "error", "success"];
    expect(severities).toHaveLength(4);
  });
});

// ============================================
// Add Event Tests
// ============================================

describe("addEvent", () => {
  beforeEach(resetStore);

  it("adds an event to the store", () => {
    const store = useEventFeedStore.getState();
    store.addEvent(createMockEvent());

    expect(useEventFeedStore.getState().events).toHaveLength(1);
  });

  it("generates unique ID for each event", () => {
    const store = useEventFeedStore.getState();
    store.addEvent(createMockEvent());
    store.addEvent(createMockEvent());

    const events = useEventFeedStore.getState().events;
    expect(events[0]!.id).not.toBe(events[1]!.id);
  });

  it("adds timestamp to each event", () => {
    const store = useEventFeedStore.getState();
    store.addEvent(createMockEvent());

    const event = useEventFeedStore.getState().events[0]!;
    expect(event.timestamp).toBeInstanceOf(Date);
  });

  it("does not add events when paused", () => {
    useEventFeedStore.setState({ isPaused: true });
    const store = useEventFeedStore.getState();
    store.addEvent(createMockEvent());

    expect(useEventFeedStore.getState().events).toHaveLength(0);
  });

  it("increments newEventCount when not at bottom", () => {
    useEventFeedStore.setState({ isAtBottom: false });
    const store = useEventFeedStore.getState();
    store.addEvent(createMockEvent());

    expect(useEventFeedStore.getState().newEventCount).toBe(1);
  });

  it("does not increment newEventCount when at bottom", () => {
    useEventFeedStore.setState({ isAtBottom: true });
    const store = useEventFeedStore.getState();
    store.addEvent(createMockEvent());

    expect(useEventFeedStore.getState().newEventCount).toBe(0);
  });
});

// ============================================
// Add Multiple Events Tests
// ============================================

describe("addEvents", () => {
  beforeEach(resetStore);

  it("adds multiple events at once", () => {
    const store = useEventFeedStore.getState();
    store.addEvents([
      createMockEvent({ title: "Event 1" }),
      createMockEvent({ title: "Event 2" }),
      createMockEvent({ title: "Event 3" }),
    ]);

    expect(useEventFeedStore.getState().events).toHaveLength(3);
  });

  it("generates unique IDs for all events", () => {
    const store = useEventFeedStore.getState();
    store.addEvents([
      createMockEvent({ title: "Event 1" }),
      createMockEvent({ title: "Event 2" }),
    ]);

    const events = useEventFeedStore.getState().events;
    const ids = events.map((e) => e.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

// ============================================
// Buffer Limit Tests
// ============================================

describe("buffer limit", () => {
  beforeEach(resetStore);

  it("trims events to maxEvents", () => {
    useEventFeedStore.setState({ maxEvents: 5 });
    const store = useEventFeedStore.getState();

    for (let i = 0; i < 10; i++) {
      store.addEvent(createMockEvent({ title: `Event ${i}` }));
    }

    expect(useEventFeedStore.getState().events).toHaveLength(5);
  });

  it("keeps newest events when trimming", () => {
    useEventFeedStore.setState({ maxEvents: 3 });
    const store = useEventFeedStore.getState();

    for (let i = 0; i < 5; i++) {
      store.addEvent(createMockEvent({ title: `Event ${i}` }));
    }

    const events = useEventFeedStore.getState().events;
    expect(events[0]!.title).toBe("Event 2");
    expect(events[2]!.title).toBe("Event 4");
  });

  it("default maxEvents is 1000", () => {
    expect(useEventFeedStore.getState().maxEvents).toBe(1000);
  });
});

// ============================================
// Clear Events Tests
// ============================================

describe("clearEvents", () => {
  beforeEach(resetStore);

  it("removes all events", () => {
    const store = useEventFeedStore.getState();
    store.addEvent(createMockEvent());
    store.addEvent(createMockEvent());
    store.clearEvents();

    expect(useEventFeedStore.getState().events).toHaveLength(0);
  });

  it("resets newEventCount", () => {
    useEventFeedStore.setState({ newEventCount: 5 });
    useEventFeedStore.getState().clearEvents();

    expect(useEventFeedStore.getState().newEventCount).toBe(0);
  });
});

// ============================================
// Scroll State Tests
// ============================================

describe("setIsAtBottom", () => {
  beforeEach(resetStore);

  it("updates isAtBottom state", () => {
    useEventFeedStore.getState().setIsAtBottom(false);
    expect(useEventFeedStore.getState().isAtBottom).toBe(false);

    useEventFeedStore.getState().setIsAtBottom(true);
    expect(useEventFeedStore.getState().isAtBottom).toBe(true);
  });

  it("resets newEventCount when scrolled to bottom", () => {
    useEventFeedStore.setState({ isAtBottom: false, newEventCount: 5 });
    useEventFeedStore.getState().setIsAtBottom(true);

    expect(useEventFeedStore.getState().newEventCount).toBe(0);
  });

  it("preserves newEventCount when scrolled away", () => {
    useEventFeedStore.setState({ isAtBottom: true, newEventCount: 3 });
    useEventFeedStore.getState().setIsAtBottom(false);

    expect(useEventFeedStore.getState().newEventCount).toBe(3);
  });
});

// ============================================
// Pause Tests
// ============================================

describe("pause functionality", () => {
  beforeEach(resetStore);

  it("setPaused updates state", () => {
    useEventFeedStore.getState().setPaused(true);
    expect(useEventFeedStore.getState().isPaused).toBe(true);
  });

  it("togglePaused toggles state", () => {
    expect(useEventFeedStore.getState().isPaused).toBe(false);

    useEventFeedStore.getState().togglePaused();
    expect(useEventFeedStore.getState().isPaused).toBe(true);

    useEventFeedStore.getState().togglePaused();
    expect(useEventFeedStore.getState().isPaused).toBe(false);
  });
});

// ============================================
// Filter Tests
// ============================================

describe("type filter", () => {
  beforeEach(resetStore);

  it("setTypeFilter updates filter", () => {
    useEventFeedStore.getState().setTypeFilter(["trade_executed", "order_filled"]);
    expect(useEventFeedStore.getState().typeFilter).toEqual([
      "trade_executed",
      "order_filled",
    ]);
  });

  it("getFilteredEvents filters by type", () => {
    const store = useEventFeedStore.getState();
    store.addEvent(createMockEvent({ type: "trade_executed" }));
    store.addEvent(createMockEvent({ type: "order_placed" }));
    store.addEvent(createMockEvent({ type: "trade_executed" }));

    store.setTypeFilter(["trade_executed"]);
    const filtered = useEventFeedStore.getState().getFilteredEvents();

    expect(filtered).toHaveLength(2);
    expect(filtered.every((e) => e.type === "trade_executed")).toBe(true);
  });

  it("empty filter returns all events", () => {
    const store = useEventFeedStore.getState();
    store.addEvent(createMockEvent({ type: "trade_executed" }));
    store.addEvent(createMockEvent({ type: "order_placed" }));

    store.setTypeFilter([]);
    const filtered = useEventFeedStore.getState().getFilteredEvents();

    expect(filtered).toHaveLength(2);
  });
});

describe("severity filter", () => {
  beforeEach(resetStore);

  it("setSeverityFilter updates filter", () => {
    useEventFeedStore.getState().setSeverityFilter(["error", "warning"]);
    expect(useEventFeedStore.getState().severityFilter).toEqual([
      "error",
      "warning",
    ]);
  });

  it("getFilteredEvents filters by severity", () => {
    const store = useEventFeedStore.getState();
    store.addEvent(createMockEvent({ severity: "info" }));
    store.addEvent(createMockEvent({ severity: "error" }));
    store.addEvent(createMockEvent({ severity: "warning" }));

    store.setSeverityFilter(["error"]);
    const filtered = useEventFeedStore.getState().getFilteredEvents();

    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.severity).toBe("error");
  });
});

describe("combined filters", () => {
  beforeEach(resetStore);

  it("applies both type and severity filters", () => {
    const store = useEventFeedStore.getState();
    store.addEvent(createMockEvent({ type: "trade_executed", severity: "info" }));
    store.addEvent(createMockEvent({ type: "trade_executed", severity: "error" }));
    store.addEvent(createMockEvent({ type: "order_placed", severity: "error" }));

    store.setTypeFilter(["trade_executed"]);
    store.setSeverityFilter(["error"]);

    const filtered = useEventFeedStore.getState().getFilteredEvents();
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.type).toBe("trade_executed");
    expect(filtered[0]!.severity).toBe("error");
  });
});

// ============================================
// Selector Tests
// ============================================

describe("selectors", () => {
  beforeEach(resetStore);

  it("selectEventCount returns event count", () => {
    const store = useEventFeedStore.getState();
    store.addEvent(createMockEvent());
    store.addEvent(createMockEvent());

    const count = selectEventCount(useEventFeedStore.getState());
    expect(count).toBe(2);
  });

  it("selectNewEventCount returns new event count", () => {
    useEventFeedStore.setState({ newEventCount: 5 });
    const count = selectNewEventCount(useEventFeedStore.getState());
    expect(count).toBe(5);
  });

  it("selectHasNewEvents returns true when there are new events", () => {
    useEventFeedStore.setState({ newEventCount: 1 });
    expect(selectHasNewEvents(useEventFeedStore.getState())).toBe(true);

    useEventFeedStore.setState({ newEventCount: 0 });
    expect(selectHasNewEvents(useEventFeedStore.getState())).toBe(false);
  });

  it("selectLatestEvent returns most recent event", () => {
    const store = useEventFeedStore.getState();
    store.addEvent(createMockEvent({ title: "First" }));
    store.addEvent(createMockEvent({ title: "Second" }));

    const latest = selectLatestEvent(useEventFeedStore.getState());
    expect(latest?.title).toBe("Second");
  });

  it("selectLatestEvent returns null when no events", () => {
    const latest = selectLatestEvent(useEventFeedStore.getState());
    expect(latest).toBeNull();
  });

  it("selectEventsByType returns events of specific type", () => {
    const store = useEventFeedStore.getState();
    store.addEvent(createMockEvent({ type: "trade_executed" }));
    store.addEvent(createMockEvent({ type: "order_placed" }));
    store.addEvent(createMockEvent({ type: "trade_executed" }));

    const selector = selectEventsByType("trade_executed");
    const events = selector(useEventFeedStore.getState());
    expect(events).toHaveLength(2);
  });

  it("selectEventsBySymbol returns events for specific symbol", () => {
    const store = useEventFeedStore.getState();
    store.addEvent(createMockEvent({ symbol: "AAPL" }));
    store.addEvent(createMockEvent({ symbol: "GOOGL" }));
    store.addEvent(createMockEvent({ symbol: "AAPL" }));

    const selector = selectEventsBySymbol("AAPL");
    const events = selector(useEventFeedStore.getState());
    expect(events).toHaveLength(2);
  });
});

// ============================================
// Module Export Tests
// ============================================

describe("module exports", () => {
  it("exports useEventFeedStore", async () => {
    const module = await import("./event-feed-store");
    expect(typeof module.useEventFeedStore).toBe("function");
  });

  it("exports selectEventCount", async () => {
    const module = await import("./event-feed-store");
    expect(typeof module.selectEventCount).toBe("function");
  });

  it("exports subscribeToNewEvents", async () => {
    const module = await import("./event-feed-store");
    expect(typeof module.subscribeToNewEvents).toBe("function");
  });

  it("exports subscribeToEventType", async () => {
    const module = await import("./event-feed-store");
    expect(typeof module.subscribeToEventType).toBe("function");
  });
});
