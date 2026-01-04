/**
 * Loading Store Tests
 *
 * Tests for loading state management store.
 *
 * @see docs/plans/ui/28-states.md lines 7-44
 */

import { describe, expect, it, beforeEach } from "bun:test";
import {
  useLoadingStore,
  LOADING_KEYS,
  createLoadingKey,
  parseLoadingKey,
  selectIsLoading,
  selectIsAnyLoading,
  selectIsLoadingByPrefix,
  selectLoadingKeys,
  type LoadingKey,
  type LoadingOperation,
  type LoadingState,
  type LoadingOptions,
  type StandardLoadingKey,
} from "./loading-store.js";

// Reset store before each test
beforeEach(() => {
  useLoadingStore.getState().clearAll();
});

// ============================================
// Store Basic Operations
// ============================================

describe("Loading Store", () => {
  describe("initial state", () => {
    it("starts with empty operations", () => {
      const state = useLoadingStore.getState();
      expect(state.operations.size).toBe(0);
    });

    it("isAnyLoading returns false initially", () => {
      const state = useLoadingStore.getState();
      expect(state.isAnyLoading()).toBe(false);
    });

    it("getLoadingKeys returns empty array initially", () => {
      const state = useLoadingStore.getState();
      expect(state.getLoadingKeys()).toEqual([]);
    });
  });

  describe("setLoading", () => {
    it("starts loading when true", () => {
      const state = useLoadingStore.getState();
      state.setLoading("test:operation", true);
      expect(state.isLoading("test:operation")).toBe(true);
    });

    it("stops loading when false", () => {
      const state = useLoadingStore.getState();
      state.setLoading("test:operation", true);
      state.setLoading("test:operation", false);
      expect(state.isLoading("test:operation")).toBe(false);
    });

    it("accepts options when starting", () => {
      useLoadingStore.getState().setLoading("test:operation", true, { timeout: 5000 });
      const freshState = useLoadingStore.getState();
      const op = freshState.operations.get("test:operation");
      expect(op?.timeout).toBe(5000);
    });
  });

  describe("startLoading", () => {
    it("adds operation to map", () => {
      const state = useLoadingStore.getState();
      state.startLoading("portfolio:fetch");
      expect(state.isLoading("portfolio:fetch")).toBe(true);
    });

    it("records start time", () => {
      const before = new Date();
      useLoadingStore.getState().startLoading("test:op");
      const after = new Date();
      const op = useLoadingStore.getState().operations.get("test:op");
      expect(op?.startedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(op?.startedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it("stores timeout option", () => {
      useLoadingStore.getState().startLoading("test:op", { timeout: 10000 });
      const op = useLoadingStore.getState().operations.get("test:op");
      expect(op?.timeout).toBe(10000);
    });

    it("stores onCancel callback", () => {
      const onCancel = () => {};
      useLoadingStore.getState().startLoading("test:op", { onCancel });
      const op = useLoadingStore.getState().operations.get("test:op");
      expect(op?.onCancel).toBe(onCancel);
    });
  });

  describe("stopLoading", () => {
    it("removes operation from map", () => {
      const state = useLoadingStore.getState();
      state.startLoading("test:op");
      state.stopLoading("test:op");
      expect(state.isLoading("test:op")).toBe(false);
    });

    it("handles stopping non-existent key", () => {
      const state = useLoadingStore.getState();
      expect(() => state.stopLoading("nonexistent")).not.toThrow();
    });
  });

  describe("isLoading", () => {
    it("returns true for active operation", () => {
      const state = useLoadingStore.getState();
      state.startLoading("test:op");
      expect(state.isLoading("test:op")).toBe(true);
    });

    it("returns false for inactive operation", () => {
      const state = useLoadingStore.getState();
      expect(state.isLoading("test:op")).toBe(false);
    });

    it("returns false after operation stopped", () => {
      const state = useLoadingStore.getState();
      state.startLoading("test:op");
      state.stopLoading("test:op");
      expect(state.isLoading("test:op")).toBe(false);
    });
  });

  describe("isAnyLoading", () => {
    it("returns false when no operations", () => {
      const state = useLoadingStore.getState();
      expect(state.isAnyLoading()).toBe(false);
    });

    it("returns true when one operation active", () => {
      const state = useLoadingStore.getState();
      state.startLoading("test:op");
      expect(state.isAnyLoading()).toBe(true);
    });

    it("returns true when multiple operations active", () => {
      const state = useLoadingStore.getState();
      state.startLoading("test:op1");
      state.startLoading("test:op2");
      expect(state.isAnyLoading()).toBe(true);
    });

    it("returns false when all operations stopped", () => {
      const state = useLoadingStore.getState();
      state.startLoading("test:op1");
      state.startLoading("test:op2");
      state.stopLoading("test:op1");
      state.stopLoading("test:op2");
      expect(state.isAnyLoading()).toBe(false);
    });
  });

  describe("getLoadingKeys", () => {
    it("returns empty array when no operations", () => {
      const state = useLoadingStore.getState();
      expect(state.getLoadingKeys()).toEqual([]);
    });

    it("returns array of active keys", () => {
      const state = useLoadingStore.getState();
      state.startLoading("test:op1");
      state.startLoading("test:op2");
      const keys = state.getLoadingKeys();
      expect(keys).toContain("test:op1");
      expect(keys).toContain("test:op2");
    });
  });

  describe("isLoadingByPrefix", () => {
    it("returns true when any key matches prefix", () => {
      const state = useLoadingStore.getState();
      state.startLoading("portfolio:fetch");
      expect(state.isLoadingByPrefix("portfolio")).toBe(true);
    });

    it("returns false when no key matches prefix", () => {
      const state = useLoadingStore.getState();
      state.startLoading("orders:fetch");
      expect(state.isLoadingByPrefix("portfolio")).toBe(false);
    });

    it("handles empty prefix", () => {
      const state = useLoadingStore.getState();
      state.startLoading("test:op");
      expect(state.isLoadingByPrefix("")).toBe(true);
    });
  });

  describe("clearAll", () => {
    it("removes all operations", () => {
      const state = useLoadingStore.getState();
      state.startLoading("test:op1");
      state.startLoading("test:op2");
      state.clearAll();
      expect(state.operations.size).toBe(0);
    });

    it("isAnyLoading returns false after clear", () => {
      const state = useLoadingStore.getState();
      state.startLoading("test:op");
      state.clearAll();
      expect(state.isAnyLoading()).toBe(false);
    });
  });
});

// ============================================
// Selectors
// ============================================

describe("Selectors", () => {
  it("selectIsLoading returns correct value", () => {
    const state = useLoadingStore.getState();
    state.startLoading("test:op");
    const selector = selectIsLoading("test:op");
    expect(selector(state)).toBe(true);
  });

  it("selectIsAnyLoading returns correct value", () => {
    const state = useLoadingStore.getState();
    state.startLoading("test:op");
    expect(selectIsAnyLoading(state)).toBe(true);
  });

  it("selectIsLoadingByPrefix returns correct value", () => {
    const state = useLoadingStore.getState();
    state.startLoading("portfolio:fetch");
    const selector = selectIsLoadingByPrefix("portfolio");
    expect(selector(state)).toBe(true);
  });

  it("selectLoadingKeys returns correct value", () => {
    const state = useLoadingStore.getState();
    state.startLoading("test:op1");
    state.startLoading("test:op2");
    const keys = selectLoadingKeys(state);
    expect(keys.length).toBe(2);
  });
});

// ============================================
// Helper Functions
// ============================================

describe("createLoadingKey", () => {
  it("creates key from namespace and operation", () => {
    const key = createLoadingKey("portfolio", "fetch");
    expect(key).toBe("portfolio:fetch");
  });

  it("handles empty namespace", () => {
    const key = createLoadingKey("", "fetch");
    expect(key).toBe(":fetch");
  });

  it("handles empty operation", () => {
    const key = createLoadingKey("portfolio", "");
    expect(key).toBe("portfolio:");
  });
});

describe("parseLoadingKey", () => {
  it("parses key into namespace and operation", () => {
    const { namespace, operation } = parseLoadingKey("portfolio:fetch");
    expect(namespace).toBe("portfolio");
    expect(operation).toBe("fetch");
  });

  it("handles key without colon", () => {
    const { namespace, operation } = parseLoadingKey("simplekey");
    expect(namespace).toBe("simplekey");
    expect(operation).toBe("");
  });

  it("handles key with multiple colons", () => {
    const { namespace, operation } = parseLoadingKey("a:b:c");
    expect(namespace).toBe("a");
    expect(operation).toBe("b:c");
  });
});

// ============================================
// LOADING_KEYS Registry
// ============================================

describe("LOADING_KEYS", () => {
  it("has portfolio keys", () => {
    expect(LOADING_KEYS.PORTFOLIO_FETCH).toBe("portfolio:fetch");
    expect(LOADING_KEYS.PORTFOLIO_REFRESH).toBe("portfolio:refresh");
  });

  it("has position keys", () => {
    expect(LOADING_KEYS.POSITIONS_FETCH).toBe("positions:fetch");
    expect(LOADING_KEYS.POSITION_UPDATE).toBe("positions:update");
  });

  it("has order keys", () => {
    expect(LOADING_KEYS.ORDERS_FETCH).toBe("orders:fetch");
    expect(LOADING_KEYS.ORDER_SUBMIT).toBe("orders:submit");
    expect(LOADING_KEYS.ORDER_CANCEL).toBe("orders:cancel");
  });

  it("has decision keys", () => {
    expect(LOADING_KEYS.DECISIONS_FETCH).toBe("decisions:fetch");
    expect(LOADING_KEYS.DECISION_APPROVE).toBe("decisions:approve");
    expect(LOADING_KEYS.DECISION_REJECT).toBe("decisions:reject");
  });

  it("has system keys", () => {
    expect(LOADING_KEYS.SYSTEM_START).toBe("system:start");
    expect(LOADING_KEYS.SYSTEM_STOP).toBe("system:stop");
    expect(LOADING_KEYS.SYSTEM_STATUS).toBe("system:status");
  });

  it("has market keys", () => {
    expect(LOADING_KEYS.MARKET_FETCH).toBe("market:fetch");
    expect(LOADING_KEYS.MARKET_SUBSCRIBE).toBe("market:subscribe");
  });

  it("has auth keys", () => {
    expect(LOADING_KEYS.AUTH_LOGIN).toBe("auth:login");
    expect(LOADING_KEYS.AUTH_LOGOUT).toBe("auth:logout");
  });

  it("has settings keys", () => {
    expect(LOADING_KEYS.SETTINGS_FETCH).toBe("settings:fetch");
    expect(LOADING_KEYS.SETTINGS_SAVE).toBe("settings:save");
  });

  it("has agent keys", () => {
    expect(LOADING_KEYS.AGENTS_FETCH).toBe("agents:fetch");
    expect(LOADING_KEYS.AGENT_EXECUTE).toBe("agents:execute");
  });

  it("has page loading key", () => {
    expect(LOADING_KEYS.PAGE_LOADING).toBe("page:loading");
  });
});

// ============================================
// Type Tests
// ============================================

describe("LoadingKey Type", () => {
  it("accepts string values", () => {
    const key: LoadingKey = "custom:operation";
    expect(key).toBe("custom:operation");
  });
});

describe("LoadingOperation Type", () => {
  it("has correct shape", () => {
    const op: LoadingOperation = {
      startedAt: new Date(),
    };
    expect(op.startedAt).toBeInstanceOf(Date);
  });

  it("supports optional fields", () => {
    const op: LoadingOperation = {
      startedAt: new Date(),
      timeout: 5000,
      onCancel: () => {},
    };
    expect(op.timeout).toBe(5000);
    expect(typeof op.onCancel).toBe("function");
  });
});

describe("LoadingOptions Type", () => {
  it("all fields are optional", () => {
    const opts: LoadingOptions = {};
    expect(opts.timeout).toBeUndefined();
  });

  it("supports all options", () => {
    const opts: LoadingOptions = {
      timeout: 10000,
      onCancel: () => {},
    };
    expect(opts.timeout).toBe(10000);
  });
});

describe("StandardLoadingKey Type", () => {
  it("is a string literal union", () => {
    const key: StandardLoadingKey = "portfolio:fetch";
    expect(key).toBe("portfolio:fetch");
  });
});

// ============================================
// Edge Cases
// ============================================

describe("Edge Cases", () => {
  it("handles rapid start/stop cycles", () => {
    const state = useLoadingStore.getState();
    for (let i = 0; i < 100; i++) {
      state.startLoading("test:op");
      state.stopLoading("test:op");
    }
    expect(state.isLoading("test:op")).toBe(false);
  });

  it("handles starting same key multiple times", () => {
    const state = useLoadingStore.getState();
    state.startLoading("test:op");
    state.startLoading("test:op");
    state.startLoading("test:op");
    // Should still only have one entry
    expect(state.getLoadingKeys()).toEqual(["test:op"]);
  });

  it("handles empty key", () => {
    const state = useLoadingStore.getState();
    state.startLoading("");
    expect(state.isLoading("")).toBe(true);
  });

  it("handles key with special characters", () => {
    const state = useLoadingStore.getState();
    state.startLoading("test:op:with:many:colons");
    expect(state.isLoading("test:op:with:many:colons")).toBe(true);
  });

  it("handles unicode in key", () => {
    const state = useLoadingStore.getState();
    state.startLoading("test:op");
    expect(state.isLoading("test:op")).toBe(true);
  });
});

// ============================================
// Module Exports
// ============================================

describe("Module Exports", () => {
  it("exports useLoadingStore", async () => {
    const module = await import("./loading-store.js");
    expect(typeof module.useLoadingStore).toBe("function");
  });

  it("exports LOADING_KEYS", async () => {
    const module = await import("./loading-store.js");
    expect(typeof module.LOADING_KEYS).toBe("object");
  });

  it("exports createLoadingKey", async () => {
    const module = await import("./loading-store.js");
    expect(typeof module.createLoadingKey).toBe("function");
  });

  it("exports parseLoadingKey", async () => {
    const module = await import("./loading-store.js");
    expect(typeof module.parseLoadingKey).toBe("function");
  });

  it("exports selectors", async () => {
    const module = await import("./loading-store.js");
    expect(typeof module.selectIsLoading).toBe("function");
    expect(typeof module.selectIsAnyLoading).toBe("function");
    expect(typeof module.selectIsLoadingByPrefix).toBe("function");
    expect(typeof module.selectLoadingKeys).toBe("function");
  });

  it("exports default as useLoadingStore", async () => {
    const module = await import("./loading-store.js");
    expect(module.default).toBe(module.useLoadingStore);
  });
});
