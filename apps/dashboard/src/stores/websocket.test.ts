/**
 * WebSocket Store Tests
 *
 * Tests for WSStore state management, subscriptions, and persistence.
 *
 * @see docs/plans/ui/07-state-management.md
 */

import { beforeEach, describe, expect, it } from "bun:test";
import {
  selectHasSubscriptions,
  selectIsReconnecting,
  selectIsSubscribedToChannel,
  selectIsSubscribedToSymbol,
  selectSubscriptionCount,
  useWSStore,
} from "./websocket.js";

// ============================================
// Test Setup
// ============================================

// Reset store before each test
beforeEach(() => {
  useWSStore.getState().reset();
});

// ============================================
// Initial State Tests
// ============================================

describe("Initial State", () => {
  it("starts disconnected", () => {
    const state = useWSStore.getState();
    expect(state.connected).toBe(false);
    expect(state.connectionStatus).toBe("disconnected");
  });

  it("starts with empty subscriptions", () => {
    const state = useWSStore.getState();
    expect(state.subscribedChannels).toEqual([]);
    expect(state.subscribedSymbols).toEqual([]);
  });

  it("starts with zero reconnect attempts", () => {
    const state = useWSStore.getState();
    expect(state.reconnectAttempts).toBe(0);
  });

  it("starts with null timestamps and errors", () => {
    const state = useWSStore.getState();
    expect(state.lastConnectedAt).toBeNull();
    expect(state.lastError).toBeNull();
  });
});

// ============================================
// Connection State Tests
// ============================================

describe("setConnected", () => {
  it("sets connected to true", () => {
    useWSStore.getState().setConnected(true);
    const state = useWSStore.getState();
    expect(state.connected).toBe(true);
    expect(state.connectionStatus).toBe("connected");
  });

  it("sets connected to false", () => {
    useWSStore.getState().setConnected(true);
    useWSStore.getState().setConnected(false);
    const state = useWSStore.getState();
    expect(state.connected).toBe(false);
    expect(state.connectionStatus).toBe("disconnected");
  });
});

describe("setConnectionStatus", () => {
  it("sets status to connecting", () => {
    useWSStore.getState().setConnectionStatus("connecting");
    expect(useWSStore.getState().connectionStatus).toBe("connecting");
    expect(useWSStore.getState().connected).toBe(false);
  });

  it("sets status to connected", () => {
    useWSStore.getState().setConnectionStatus("connected");
    expect(useWSStore.getState().connectionStatus).toBe("connected");
    expect(useWSStore.getState().connected).toBe(true);
  });

  it("sets status to reconnecting", () => {
    useWSStore.getState().setConnectionStatus("reconnecting");
    expect(useWSStore.getState().connectionStatus).toBe("reconnecting");
    expect(useWSStore.getState().connected).toBe(false);
  });

  it("sets status to disconnected", () => {
    useWSStore.getState().setConnectionStatus("connected");
    useWSStore.getState().setConnectionStatus("disconnected");
    expect(useWSStore.getState().connectionStatus).toBe("disconnected");
    expect(useWSStore.getState().connected).toBe(false);
  });
});

describe("onConnected", () => {
  it("sets connected state", () => {
    useWSStore.getState().onConnected();
    const state = useWSStore.getState();
    expect(state.connected).toBe(true);
    expect(state.connectionStatus).toBe("connected");
  });

  it("resets reconnect attempts", () => {
    useWSStore.getState().setReconnectAttempts(5);
    useWSStore.getState().onConnected();
    expect(useWSStore.getState().reconnectAttempts).toBe(0);
  });

  it("sets lastConnectedAt timestamp", () => {
    useWSStore.getState().onConnected();
    const timestamp = useWSStore.getState().lastConnectedAt;
    expect(timestamp).not.toBeNull();
    // Should be a valid ISO string
    expect(() => new Date(timestamp!)).not.toThrow();
  });

  it("clears last error", () => {
    useWSStore.getState().setLastError(new Error("test"));
    useWSStore.getState().onConnected();
    expect(useWSStore.getState().lastError).toBeNull();
  });
});

describe("onDisconnected", () => {
  it("sets disconnected state", () => {
    useWSStore.getState().setConnected(true);
    useWSStore.getState().onDisconnected();
    const state = useWSStore.getState();
    expect(state.connected).toBe(false);
    expect(state.connectionStatus).toBe("disconnected");
  });
});

// ============================================
// Reconnection Tests
// ============================================

describe("Reconnection Attempts", () => {
  it("setReconnectAttempts sets count", () => {
    useWSStore.getState().setReconnectAttempts(3);
    expect(useWSStore.getState().reconnectAttempts).toBe(3);
  });

  it("incrementReconnectAttempts increases count", () => {
    useWSStore.getState().incrementReconnectAttempts();
    expect(useWSStore.getState().reconnectAttempts).toBe(1);
    useWSStore.getState().incrementReconnectAttempts();
    expect(useWSStore.getState().reconnectAttempts).toBe(2);
  });

  it("onConnected resets attempts to zero", () => {
    useWSStore.getState().setReconnectAttempts(5);
    useWSStore.getState().onConnected();
    expect(useWSStore.getState().reconnectAttempts).toBe(0);
  });
});

// ============================================
// Error Handling Tests
// ============================================

describe("Error Handling", () => {
  it("setLastError stores error", () => {
    const error = new Error("Connection failed");
    useWSStore.getState().setLastError(error);
    expect(useWSStore.getState().lastError).toBe(error);
  });

  it("setLastError with null clears error", () => {
    useWSStore.getState().setLastError(new Error("test"));
    useWSStore.getState().setLastError(null);
    expect(useWSStore.getState().lastError).toBeNull();
  });

  it("onConnected clears error", () => {
    useWSStore.getState().setLastError(new Error("test"));
    useWSStore.getState().onConnected();
    expect(useWSStore.getState().lastError).toBeNull();
  });
});

// ============================================
// Channel Subscription Tests
// ============================================

describe("subscribe", () => {
  it("adds new channels", () => {
    useWSStore.getState().subscribe(["orders", "decisions"]);
    expect(useWSStore.getState().subscribedChannels).toEqual(["orders", "decisions"]);
  });

  it("does not duplicate channels", () => {
    useWSStore.getState().subscribe(["orders"]);
    useWSStore.getState().subscribe(["orders", "decisions"]);
    expect(useWSStore.getState().subscribedChannels).toEqual(["orders", "decisions"]);
  });

  it("handles empty array", () => {
    useWSStore.getState().subscribe([]);
    expect(useWSStore.getState().subscribedChannels).toEqual([]);
  });

  it("preserves order", () => {
    useWSStore.getState().subscribe(["a"]);
    useWSStore.getState().subscribe(["b"]);
    useWSStore.getState().subscribe(["c"]);
    expect(useWSStore.getState().subscribedChannels).toEqual(["a", "b", "c"]);
  });
});

describe("unsubscribe", () => {
  it("removes channels", () => {
    useWSStore.getState().subscribe(["orders", "decisions", "alerts"]);
    useWSStore.getState().unsubscribe(["decisions"]);
    expect(useWSStore.getState().subscribedChannels).toEqual(["orders", "alerts"]);
  });

  it("removes multiple channels", () => {
    useWSStore.getState().subscribe(["orders", "decisions", "alerts"]);
    useWSStore.getState().unsubscribe(["decisions", "alerts"]);
    expect(useWSStore.getState().subscribedChannels).toEqual(["orders"]);
  });

  it("handles non-existent channels", () => {
    useWSStore.getState().subscribe(["orders"]);
    useWSStore.getState().unsubscribe(["nonexistent"]);
    expect(useWSStore.getState().subscribedChannels).toEqual(["orders"]);
  });

  it("handles empty array", () => {
    useWSStore.getState().subscribe(["orders"]);
    useWSStore.getState().unsubscribe([]);
    expect(useWSStore.getState().subscribedChannels).toEqual(["orders"]);
  });
});

// ============================================
// Symbol Subscription Tests
// ============================================

describe("subscribeSymbols", () => {
  it("adds new symbols", () => {
    useWSStore.getState().subscribeSymbols(["AAPL", "GOOGL"]);
    expect(useWSStore.getState().subscribedSymbols).toEqual(["AAPL", "GOOGL"]);
  });

  it("does not duplicate symbols", () => {
    useWSStore.getState().subscribeSymbols(["AAPL"]);
    useWSStore.getState().subscribeSymbols(["AAPL", "GOOGL"]);
    expect(useWSStore.getState().subscribedSymbols).toEqual(["AAPL", "GOOGL"]);
  });

  it("handles empty array", () => {
    useWSStore.getState().subscribeSymbols([]);
    expect(useWSStore.getState().subscribedSymbols).toEqual([]);
  });
});

describe("unsubscribeSymbols", () => {
  it("removes symbols", () => {
    useWSStore.getState().subscribeSymbols(["AAPL", "GOOGL", "MSFT"]);
    useWSStore.getState().unsubscribeSymbols(["GOOGL"]);
    expect(useWSStore.getState().subscribedSymbols).toEqual(["AAPL", "MSFT"]);
  });

  it("removes multiple symbols", () => {
    useWSStore.getState().subscribeSymbols(["AAPL", "GOOGL", "MSFT"]);
    useWSStore.getState().unsubscribeSymbols(["AAPL", "MSFT"]);
    expect(useWSStore.getState().subscribedSymbols).toEqual(["GOOGL"]);
  });

  it("handles non-existent symbols", () => {
    useWSStore.getState().subscribeSymbols(["AAPL"]);
    useWSStore.getState().unsubscribeSymbols(["INVALID"]);
    expect(useWSStore.getState().subscribedSymbols).toEqual(["AAPL"]);
  });
});

// ============================================
// Clear and Reset Tests
// ============================================

describe("clearSubscriptions", () => {
  it("clears all channels and symbols", () => {
    useWSStore.getState().subscribe(["orders", "decisions"]);
    useWSStore.getState().subscribeSymbols(["AAPL", "GOOGL"]);
    useWSStore.getState().clearSubscriptions();
    expect(useWSStore.getState().subscribedChannels).toEqual([]);
    expect(useWSStore.getState().subscribedSymbols).toEqual([]);
  });

  it("does not affect connection state", () => {
    useWSStore.getState().setConnected(true);
    useWSStore.getState().subscribe(["orders"]);
    useWSStore.getState().clearSubscriptions();
    expect(useWSStore.getState().connected).toBe(true);
  });
});

describe("reset", () => {
  it("resets all state to initial", () => {
    useWSStore.getState().setConnected(true);
    useWSStore.getState().subscribe(["orders"]);
    useWSStore.getState().subscribeSymbols(["AAPL"]);
    useWSStore.getState().setReconnectAttempts(5);
    useWSStore.getState().setLastError(new Error("test"));
    useWSStore.getState().reset();

    const state = useWSStore.getState();
    expect(state.connected).toBe(false);
    expect(state.connectionStatus).toBe("disconnected");
    expect(state.subscribedChannels).toEqual([]);
    expect(state.subscribedSymbols).toEqual([]);
    expect(state.reconnectAttempts).toBe(0);
    expect(state.lastConnectedAt).toBeNull();
    expect(state.lastError).toBeNull();
  });
});

// ============================================
// Selector Tests
// ============================================

describe("selectIsReconnecting", () => {
  it("returns false when disconnected with no attempts", () => {
    const state = useWSStore.getState();
    expect(selectIsReconnecting(state)).toBe(false);
  });

  it("returns true when status is reconnecting", () => {
    useWSStore.getState().setConnectionStatus("reconnecting");
    expect(selectIsReconnecting(useWSStore.getState())).toBe(true);
  });

  it("returns true when reconnect attempts > 0", () => {
    useWSStore.getState().setReconnectAttempts(1);
    expect(selectIsReconnecting(useWSStore.getState())).toBe(true);
  });

  it("returns false when connected", () => {
    useWSStore.getState().onConnected();
    expect(selectIsReconnecting(useWSStore.getState())).toBe(false);
  });
});

describe("selectHasSubscriptions", () => {
  it("returns false when no subscriptions", () => {
    expect(selectHasSubscriptions(useWSStore.getState())).toBe(false);
  });

  it("returns true when has channels", () => {
    useWSStore.getState().subscribe(["orders"]);
    expect(selectHasSubscriptions(useWSStore.getState())).toBe(true);
  });

  it("returns true when has symbols", () => {
    useWSStore.getState().subscribeSymbols(["AAPL"]);
    expect(selectHasSubscriptions(useWSStore.getState())).toBe(true);
  });

  it("returns true when has both", () => {
    useWSStore.getState().subscribe(["orders"]);
    useWSStore.getState().subscribeSymbols(["AAPL"]);
    expect(selectHasSubscriptions(useWSStore.getState())).toBe(true);
  });
});

describe("selectSubscriptionCount", () => {
  it("returns 0 when no subscriptions", () => {
    expect(selectSubscriptionCount(useWSStore.getState())).toBe(0);
  });

  it("counts channels", () => {
    useWSStore.getState().subscribe(["orders", "decisions"]);
    expect(selectSubscriptionCount(useWSStore.getState())).toBe(2);
  });

  it("counts symbols", () => {
    useWSStore.getState().subscribeSymbols(["AAPL", "GOOGL", "MSFT"]);
    expect(selectSubscriptionCount(useWSStore.getState())).toBe(3);
  });

  it("counts both channels and symbols", () => {
    useWSStore.getState().subscribe(["orders", "decisions"]);
    useWSStore.getState().subscribeSymbols(["AAPL", "GOOGL"]);
    expect(selectSubscriptionCount(useWSStore.getState())).toBe(4);
  });
});

describe("selectIsSubscribedToChannel", () => {
  it("returns false when not subscribed", () => {
    expect(selectIsSubscribedToChannel("orders")(useWSStore.getState())).toBe(false);
  });

  it("returns true when subscribed", () => {
    useWSStore.getState().subscribe(["orders"]);
    expect(selectIsSubscribedToChannel("orders")(useWSStore.getState())).toBe(true);
  });

  it("returns false for different channel", () => {
    useWSStore.getState().subscribe(["orders"]);
    expect(selectIsSubscribedToChannel("decisions")(useWSStore.getState())).toBe(false);
  });
});

describe("selectIsSubscribedToSymbol", () => {
  it("returns false when not subscribed", () => {
    expect(selectIsSubscribedToSymbol("AAPL")(useWSStore.getState())).toBe(false);
  });

  it("returns true when subscribed", () => {
    useWSStore.getState().subscribeSymbols(["AAPL"]);
    expect(selectIsSubscribedToSymbol("AAPL")(useWSStore.getState())).toBe(true);
  });

  it("returns false for different symbol", () => {
    useWSStore.getState().subscribeSymbols(["AAPL"]);
    expect(selectIsSubscribedToSymbol("GOOGL")(useWSStore.getState())).toBe(false);
  });
});

// ============================================
// Edge Cases
// ============================================

describe("Edge Cases", () => {
  it("handles rapid subscribe/unsubscribe", () => {
    for (let i = 0; i < 100; i++) {
      useWSStore.getState().subscribe([`channel-${i}`]);
    }
    expect(useWSStore.getState().subscribedChannels.length).toBe(100);

    for (let i = 0; i < 50; i++) {
      useWSStore.getState().unsubscribe([`channel-${i}`]);
    }
    expect(useWSStore.getState().subscribedChannels.length).toBe(50);
  });

  it("handles special characters in channel names", () => {
    useWSStore.getState().subscribe(["orders:live", "decisions/pending"]);
    expect(useWSStore.getState().subscribedChannels).toEqual(["orders:live", "decisions/pending"]);
  });

  it("handles case sensitivity in symbols", () => {
    useWSStore.getState().subscribeSymbols(["AAPL", "aapl"]);
    // Both should be added (case-sensitive)
    expect(useWSStore.getState().subscribedSymbols).toEqual(["AAPL", "aapl"]);
  });

  it("handles empty string channel", () => {
    useWSStore.getState().subscribe([""]);
    expect(useWSStore.getState().subscribedChannels).toEqual([""]);
  });

  it("maintains state across multiple operations", () => {
    // Simulate a typical session
    useWSStore.getState().setConnectionStatus("connecting");
    useWSStore.getState().subscribe(["orders", "decisions"]);
    useWSStore.getState().subscribeSymbols(["AAPL", "GOOGL"]);
    useWSStore.getState().onConnected();

    let state = useWSStore.getState();
    expect(state.connected).toBe(true);
    expect(state.subscribedChannels).toEqual(["orders", "decisions"]);
    expect(state.subscribedSymbols).toEqual(["AAPL", "GOOGL"]);
    expect(state.lastConnectedAt).not.toBeNull();

    // Simulate disconnect and reconnect
    useWSStore.getState().onDisconnected();
    useWSStore.getState().setConnectionStatus("reconnecting");
    useWSStore.getState().incrementReconnectAttempts();

    state = useWSStore.getState();
    expect(state.connected).toBe(false);
    expect(state.reconnectAttempts).toBe(1);
    // Subscriptions should persist
    expect(state.subscribedChannels).toEqual(["orders", "decisions"]);
    expect(state.subscribedSymbols).toEqual(["AAPL", "GOOGL"]);
  });
});
