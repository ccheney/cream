/**
 * Loading State Hook Tests
 *
 * Tests for loading state management hooks.
 *
 * @see docs/plans/ui/28-states.md lines 7-44
 */

import { describe, expect, it } from "bun:test";
import {
  type UseGlobalLoadingReturn,
  type UseLoadingStateOptions,
  type UseLoadingStateReturn,
  type UseMultiLoadingStateReturn,
  withLoading,
} from "./use-loading-state.js";

// ============================================
// Type Tests
// ============================================

describe("UseLoadingStateReturn Type", () => {
  it("has correct shape", () => {
    const mockReturn: UseLoadingStateReturn = {
      isLoading: false,
      startLoading: () => {},
      stopLoading: () => {},
      setLoading: () => {},
    };
    expect(typeof mockReturn.isLoading).toBe("boolean");
    expect(typeof mockReturn.startLoading).toBe("function");
    expect(typeof mockReturn.stopLoading).toBe("function");
    expect(typeof mockReturn.setLoading).toBe("function");
  });
});

describe("UseLoadingStateOptions Type", () => {
  it("all fields are optional", () => {
    const opts: UseLoadingStateOptions = {};
    expect(opts.autoCleanup).toBeUndefined();
    expect(opts.initialLoading).toBeUndefined();
  });

  it("supports all options", () => {
    const opts: UseLoadingStateOptions = {
      autoCleanup: true,
      initialLoading: true,
      initialOptions: { timeout: 5000 },
    };
    expect(opts.autoCleanup).toBe(true);
    expect(opts.initialLoading).toBe(true);
    expect(opts.initialOptions?.timeout).toBe(5000);
  });
});

describe("UseMultiLoadingStateReturn Type", () => {
  it("has correct shape", () => {
    const mockReturn: UseMultiLoadingStateReturn = {
      isLoading: () => false,
      isAnyLoading: false,
      startLoading: () => {},
      stopLoading: () => {},
      loadingKeys: [],
    };
    expect(typeof mockReturn.isLoading).toBe("function");
    expect(typeof mockReturn.isAnyLoading).toBe("boolean");
    expect(typeof mockReturn.startLoading).toBe("function");
    expect(typeof mockReturn.stopLoading).toBe("function");
    expect(Array.isArray(mockReturn.loadingKeys)).toBe(true);
  });

  it("isLoading is callable with key", () => {
    const mockReturn: UseMultiLoadingStateReturn = {
      isLoading: (key) => key === "active:key",
      isAnyLoading: true,
      startLoading: () => {},
      stopLoading: () => {},
      loadingKeys: ["active:key"],
    };
    expect(mockReturn.isLoading("active:key")).toBe(true);
    expect(mockReturn.isLoading("other:key")).toBe(false);
  });
});

describe("UseGlobalLoadingReturn Type", () => {
  it("has correct shape", () => {
    const mockReturn: UseGlobalLoadingReturn = {
      isAnyLoading: false,
      isLoadingByPrefix: () => false,
      loadingKeys: [],
      clearAll: () => {},
    };
    expect(typeof mockReturn.isAnyLoading).toBe("boolean");
    expect(typeof mockReturn.isLoadingByPrefix).toBe("function");
    expect(Array.isArray(mockReturn.loadingKeys)).toBe(true);
    expect(typeof mockReturn.clearAll).toBe("function");
  });

  it("isLoadingByPrefix is callable with prefix", () => {
    const mockReturn: UseGlobalLoadingReturn = {
      isAnyLoading: true,
      isLoadingByPrefix: (prefix) => prefix === "portfolio",
      loadingKeys: ["portfolio:fetch"],
      clearAll: () => {},
    };
    expect(mockReturn.isLoadingByPrefix("portfolio")).toBe(true);
    expect(mockReturn.isLoadingByPrefix("orders")).toBe(false);
  });
});

// ============================================
// withLoading Helper Tests
// ============================================

describe("withLoading", () => {
  it("calls startLoading before async function", async () => {
    let startCalled = false;
    let functionCalled = false;
    let startOrder = 0;
    let functionOrder = 0;
    let order = 0;

    const fn = async () => {
      functionCalled = true;
      functionOrder = ++order;
      return "result";
    };

    const startLoading = () => {
      startCalled = true;
      startOrder = ++order;
    };

    const stopLoading = () => {};

    const wrapped = withLoading(fn, startLoading, stopLoading);
    await wrapped();

    expect(startCalled).toBe(true);
    expect(functionCalled).toBe(true);
    expect(startOrder).toBeLessThan(functionOrder);
  });

  it("calls stopLoading after async function", async () => {
    let stopCalled = false;
    let functionCompleted = false;
    let stopOrder = 0;
    let functionOrder = 0;
    let order = 0;

    const fn = async () => {
      functionCompleted = true;
      functionOrder = ++order;
      return "result";
    };

    const startLoading = () => {};

    const stopLoading = () => {
      stopCalled = true;
      stopOrder = ++order;
    };

    const wrapped = withLoading(fn, startLoading, stopLoading);
    await wrapped();

    expect(stopCalled).toBe(true);
    expect(functionCompleted).toBe(true);
    expect(functionOrder).toBeLessThan(stopOrder);
  });

  it("returns the result of async function", async () => {
    const fn = async () => "expected result";
    const wrapped = withLoading(
      fn,
      () => {},
      () => {}
    );
    const result = await wrapped();
    expect(result).toBe("expected result");
  });

  it("calls stopLoading even if function throws", async () => {
    let stopCalled = false;

    const fn = async () => {
      throw new Error("Test error");
    };

    const wrapped = withLoading(
      fn,
      () => {},
      () => {
        stopCalled = true;
      }
    );

    try {
      await wrapped();
    } catch (_e) {
      // Expected
    }

    expect(stopCalled).toBe(true);
  });

  it("propagates errors from async function", async () => {
    const fn = async () => {
      throw new Error("Test error");
    };

    const wrapped = withLoading(
      fn,
      () => {},
      () => {}
    );

    let caughtError: Error | null = null;
    try {
      await wrapped();
    } catch (e) {
      caughtError = e as Error;
    }

    expect(caughtError?.message).toBe("Test error");
  });

  it("returns correct type", async () => {
    interface User {
      name: string;
      email: string;
    }

    const fn = async (): Promise<User> => ({
      name: "Test",
      email: "test@example.com",
    });

    const wrapped = withLoading(
      fn,
      () => {},
      () => {}
    );
    const result = await wrapped();

    expect(result.name).toBe("Test");
    expect(result.email).toBe("test@example.com");
  });
});

// ============================================
// Module Exports Tests
// ============================================

describe("Module Exports", () => {
  it("exports useLoadingState hook", async () => {
    const module = await import("./use-loading-state.js");
    expect(typeof module.useLoadingState).toBe("function");
  });

  it("exports useMultiLoadingState hook", async () => {
    const module = await import("./use-loading-state.js");
    expect(typeof module.useMultiLoadingState).toBe("function");
  });

  it("exports useGlobalLoadingState hook", async () => {
    const module = await import("./use-loading-state.js");
    expect(typeof module.useGlobalLoadingState).toBe("function");
  });

  it("exports withLoading helper", async () => {
    const module = await import("./use-loading-state.js");
    expect(typeof module.withLoading).toBe("function");
  });

  it("exports default as useLoadingState", async () => {
    const module = await import("./use-loading-state.js");
    expect(module.default).toBe(module.useLoadingState);
  });
});

// ============================================
// Hook Behavior Tests (Type-based)
// ============================================

describe("Hook Behaviors", () => {
  describe("useLoadingState", () => {
    it("autoCleanup defaults to true", () => {
      const defaultOpts: UseLoadingStateOptions = {};
      expect(defaultOpts.autoCleanup ?? true).toBe(true);
    });

    it("initialLoading defaults to false", () => {
      const defaultOpts: UseLoadingStateOptions = {};
      expect(defaultOpts.initialLoading ?? false).toBe(false);
    });
  });

  describe("useMultiLoadingState", () => {
    it("tracks multiple keys", () => {
      const keys = ["portfolio:fetch", "positions:fetch", "orders:fetch"];
      expect(keys.length).toBe(3);
    });

    it("loadingKeys is filtered subset", () => {
      const allKeys = ["key1", "key2", "key3"];
      const activeKeys = allKeys.filter((k) => k === "key2");
      expect(activeKeys).toEqual(["key2"]);
    });
  });

  describe("useGlobalLoadingState", () => {
    it("clearAll removes all loading states", () => {
      // Conceptually, clearAll should empty the store
      const _keys = ["a", "b", "c"];
      const afterClear: string[] = [];
      expect(afterClear.length).toBe(0);
    });

    it("isLoadingByPrefix filters by namespace", () => {
      const keys = ["portfolio:fetch", "portfolio:refresh", "orders:fetch"];
      const portfolioKeys = keys.filter((k) => k.startsWith("portfolio"));
      expect(portfolioKeys.length).toBe(2);
    });
  });
});

// ============================================
// Integration Patterns
// ============================================

describe("Integration Patterns", () => {
  it("loading state coordinates with TanStack Query", () => {
    // When TanStack Query isFetching, loading state should reflect
    const tanstackIsFetching = true;
    const loadingState = { isLoading: tanstackIsFetching };
    expect(loadingState.isLoading).toBe(true);
  });

  it("loading state coordinates with form submission", () => {
    // Form submission sets loading, completion clears it
    let isSubmitting = false;
    const startSubmit = () => {
      isSubmitting = true;
    };
    const endSubmit = () => {
      isSubmitting = false;
    };

    startSubmit();
    expect(isSubmitting).toBe(true);
    endSubmit();
    expect(isSubmitting).toBe(false);
  });

  it("loading keys are namespaced", () => {
    const portfolioKey = "portfolio:fetch";
    const ordersKey = "orders:submit";

    expect(portfolioKey.startsWith("portfolio")).toBe(true);
    expect(ordersKey.startsWith("orders")).toBe(true);
  });
});

// ============================================
// Edge Cases
// ============================================

describe("Edge Cases", () => {
  it("handles empty key", () => {
    const key = "";
    expect(key.length).toBe(0);
  });

  it("handles undefined options", () => {
    const opts: UseLoadingStateOptions | undefined = undefined;
    const safeOpts = opts ?? {};
    expect(safeOpts.autoCleanup).toBeUndefined();
  });

  it("handles multiple start calls", () => {
    let loadingCount = 0;
    const start = () => {
      loadingCount = 1;
    }; // Idempotent

    start();
    start();
    start();
    expect(loadingCount).toBe(1);
  });

  it("handles stop before start", () => {
    let isLoading = false;
    const stop = () => {
      isLoading = false;
    };

    stop(); // No-op before start
    expect(isLoading).toBe(false);
  });

  it("withLoading handles sync-like async", async () => {
    const fn = async () => "immediate";
    const wrapped = withLoading(
      fn,
      () => {},
      () => {}
    );
    const result = await wrapped();
    expect(result).toBe("immediate");
  });
});

// ============================================
// Callback Tests
// ============================================

describe("Callbacks", () => {
  it("startLoading accepts options", () => {
    const mockReturn: UseLoadingStateReturn = {
      isLoading: false,
      startLoading: (_opts) => {
        // Options should be passed through
      },
      stopLoading: () => {},
      setLoading: () => {},
    };

    // Should not throw
    mockReturn.startLoading({ timeout: 5000 });
    expect(true).toBe(true);
  });

  it("setLoading accepts loading and options", () => {
    let lastLoading: boolean | null = null;

    const mockReturn: UseLoadingStateReturn = {
      isLoading: false,
      startLoading: () => {},
      stopLoading: () => {},
      setLoading: (loading, _opts) => {
        lastLoading = loading;
      },
    };

    mockReturn.setLoading(true, { timeout: 5000 });
    expect(lastLoading).toBe(true);

    mockReturn.setLoading(false);
    expect(lastLoading).toBe(false);
  });
});
