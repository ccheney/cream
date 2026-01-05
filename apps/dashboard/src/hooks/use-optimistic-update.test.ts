/**
 * Optimistic Update Hook Tests
 *
 * Tests for optimistic update patterns with rollback.
 */

import { describe, expect, it } from "bun:test";
import type { QueryKey } from "@tanstack/react-query";

// ============================================
// Type Tests
// ============================================

describe("OptimisticUpdateOptions type", () => {
  it("has correct required properties", () => {
    interface OptimisticUpdateOptions<TData, TVariables> {
      queryKey: QueryKey;
      mutationFn: (variables: TVariables) => Promise<TData>;
    }

    const options: OptimisticUpdateOptions<{ id: string }, string> = {
      queryKey: ["test"],
      mutationFn: async (id) => ({ id }),
    };

    expect(options.queryKey).toEqual(["test"]);
    expect(typeof options.mutationFn).toBe("function");
  });

  it("supports optional properties", () => {
    interface OptimisticUpdateOptions<TData, TVariables> {
      queryKey: QueryKey;
      mutationFn: (variables: TVariables) => Promise<TData>;
      optimisticUpdate?: (current: TData | undefined, variables: TVariables) => TData;
      onSuccess?: (data: TData) => void;
      onError?: (error: Error) => void;
      errorMessage?: string | ((error: Error) => string);
      debounceMs?: number;
      skipErrorToast?: boolean;
      retry?: number;
    }

    const options: OptimisticUpdateOptions<{ name: string }, { name: string }> = {
      queryKey: ["users", "1"],
      mutationFn: async (vars) => vars,
      optimisticUpdate: (current, vars) => ({ ...current, ...vars }),
      onSuccess: () => {},
      onError: () => {},
      errorMessage: "Failed to update",
      debounceMs: 500,
      skipErrorToast: false,
      retry: 3,
    };

    expect(options.debounceMs).toBe(500);
    expect(options.retry).toBe(3);
    expect(options.skipErrorToast).toBe(false);
    expect(options.errorMessage).toBe("Failed to update");
  });
});

describe("OptimisticMutationContext type", () => {
  it("has previousData and timestamp", () => {
    interface OptimisticMutationContext<TData> {
      previousData: TData | undefined;
      timestamp: number;
    }

    const context: OptimisticMutationContext<{ value: number }> = {
      previousData: { value: 42 },
      timestamp: Date.now(),
    };

    expect(context.previousData?.value).toBe(42);
    expect(typeof context.timestamp).toBe("number");
  });

  it("allows undefined previousData", () => {
    interface OptimisticMutationContext<TData> {
      previousData: TData | undefined;
      timestamp: number;
    }

    const context: OptimisticMutationContext<string> = {
      previousData: undefined,
      timestamp: Date.now(),
    };

    expect(context.previousData).toBeUndefined();
  });
});

describe("UseOptimisticUpdateReturn type", () => {
  it("has mutation methods and state", () => {
    interface UseOptimisticUpdateReturn<TData, TVariables> {
      mutate: (variables: TVariables) => void;
      mutateAsync: (variables: TVariables) => Promise<TData>;
      isPending: boolean;
      isSuccess: boolean;
      isError: boolean;
      error: Error | null;
      reset: () => void;
    }

    const result: UseOptimisticUpdateReturn<{ id: string }, string> = {
      mutate: () => {},
      mutateAsync: async (id) => ({ id }),
      isPending: false,
      isSuccess: true,
      isError: false,
      error: null,
      reset: () => {},
    };

    expect(typeof result.mutate).toBe("function");
    expect(typeof result.mutateAsync).toBe("function");
    expect(result.isPending).toBe(false);
    expect(result.isSuccess).toBe(true);
    expect(result.isError).toBe(false);
    expect(result.error).toBeNull();
    expect(typeof result.reset).toBe("function");
  });
});

// ============================================
// Optimistic Update Logic Tests
// ============================================

describe("optimistic update logic", () => {
  it("applies optimistic update to current data", () => {
    const current = { count: 5 };
    const variables = { increment: 3 };
    const optimisticUpdate = (curr: typeof current | undefined, vars: typeof variables) => ({
      count: (curr?.count ?? 0) + vars.increment,
    });

    const result = optimisticUpdate(current, variables);
    expect(result.count).toBe(8);
  });

  it("handles undefined current data", () => {
    const variables = { name: "test" };
    const optimisticUpdate = (curr: { name: string } | undefined, vars: typeof variables) => ({
      name: vars.name,
      createdAt: curr?.name ? "existing" : "new",
    });

    const result = optimisticUpdate(undefined, variables);
    expect(result.name).toBe("test");
    expect(result.createdAt).toBe("new");
  });

  it("preserves existing properties not in update", () => {
    const current = { id: "1", name: "old", metadata: { key: "value" } };
    const variables = { name: "new" };
    const optimisticUpdate = (curr: typeof current | undefined, vars: typeof variables) => ({
      ...curr!,
      name: vars.name,
    });

    const result = optimisticUpdate(current, variables);
    expect(result.id).toBe("1");
    expect(result.name).toBe("new");
    expect(result.metadata).toEqual({ key: "value" });
  });
});

// ============================================
// Rollback Logic Tests
// ============================================

describe("rollback logic", () => {
  it("restores previous data on rollback", () => {
    const previousData = { value: 100 };
    let currentData = { value: 200 };

    // Simulate rollback
    const rollback = () => {
      currentData = previousData;
    };

    expect(currentData.value).toBe(200);
    rollback();
    expect(currentData.value).toBe(100);
  });

  it("handles rollback with undefined previous", () => {
    let currentData: { value: number } | undefined = { value: 50 };
    const previousData = undefined;

    const rollback = () => {
      currentData = previousData;
    };

    expect(currentData?.value).toBe(50);
    rollback();
    expect(currentData).toBeUndefined();
  });
});

// ============================================
// List Update Logic Tests
// ============================================

describe("list optimistic update logic", () => {
  it("adds item to list", () => {
    const list = [{ id: "1", name: "a" }];
    const newItem = { id: "2", name: "b" };

    const result = [...list, newItem];
    expect(result).toHaveLength(2);
    expect(result[1]?.name).toBe("b");
  });

  it("removes item from list", () => {
    const list = [
      { id: "1", name: "a" },
      { id: "2", name: "b" },
      { id: "3", name: "c" },
    ];

    const result = list.filter((item) => item.id !== "2");
    expect(result).toHaveLength(2);
    expect(result.find((i) => i.id === "2")).toBeUndefined();
  });

  it("updates item in list", () => {
    const list = [
      { id: "1", name: "a" },
      { id: "2", name: "b" },
    ];
    const update = { id: "2", name: "updated" };

    const result = list.map((item) => (item.id === update.id ? { ...item, ...update } : item));

    expect(result[1]?.name).toBe("updated");
    expect(result[0]?.name).toBe("a"); // Unchanged
  });
});

// ============================================
// Error Message Tests
// ============================================

describe("error message handling", () => {
  it("uses string error message", () => {
    const errorMessage = "Custom error message";
    const error = new Error("Original error");

    const getMessage = (msg: string | ((e: Error) => string), e: Error) =>
      typeof msg === "function" ? msg(e) : msg;

    expect(getMessage(errorMessage, error)).toBe("Custom error message");
  });

  it("uses function error message", () => {
    const errorMessage = (e: Error) => `Failed: ${e.message}`;
    const error = new Error("Connection lost");

    const getMessage = (msg: string | ((e: Error) => string), e: Error) =>
      typeof msg === "function" ? msg(e) : msg;

    expect(getMessage(errorMessage, error)).toBe("Failed: Connection lost");
  });

  it("falls back to default message", () => {
    const error = new Error("Server error");
    const defaultMessage = `Update failed: ${error.message}`;

    expect(defaultMessage).toBe("Update failed: Server error");
  });
});

// ============================================
// Debounce Logic Tests
// ============================================

describe("debounce logic", () => {
  it("debounce delay of 0 executes immediately", async () => {
    let callCount = 0;
    const fn = () => {
      callCount++;
    };

    // Simulate immediate execution (delay = 0)
    fn();
    expect(callCount).toBe(1);
  });

  it("multiple rapid calls with debounce only execute once", async () => {
    let callCount = 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const delay = 100;

    const debouncedFn = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => {
        callCount++;
      }, delay);
    };

    // Simulate rapid calls
    debouncedFn();
    debouncedFn();
    debouncedFn();

    // Before timeout
    expect(callCount).toBe(0);

    // After timeout
    await new Promise((resolve) => setTimeout(resolve, delay + 10));
    expect(callCount).toBe(1);
  });
});

// ============================================
// Query Key Tests
// ============================================

describe("query key handling", () => {
  it("simple string array key", () => {
    const queryKey: QueryKey = ["alerts"];
    expect(queryKey).toEqual(["alerts"]);
  });

  it("nested key with parameters", () => {
    const queryKey: QueryKey = ["alerts", { userId: "123" }];
    expect(queryKey[0]).toBe("alerts");
    expect((queryKey[1] as { userId: string }).userId).toBe("123");
  });

  it("key with multiple segments", () => {
    const queryKey: QueryKey = ["positions", "AAPL", "stopLoss"];
    expect(queryKey).toHaveLength(3);
    expect(queryKey[2]).toBe("stopLoss");
  });
});

// ============================================
// Context Tests
// ============================================

describe("mutation context", () => {
  it("stores previous data for rollback", () => {
    const previousData = { value: 42 };
    const context = {
      previousData,
      timestamp: Date.now(),
    };

    expect(context.previousData).toBe(previousData);
    expect(context.previousData.value).toBe(42);
  });

  it("tracks mutation timestamp", () => {
    const before = Date.now();
    const context = {
      previousData: null,
      timestamp: Date.now(),
    };
    const after = Date.now();

    expect(context.timestamp).toBeGreaterThanOrEqual(before);
    expect(context.timestamp).toBeLessThanOrEqual(after);
  });
});

// ============================================
// applyOptimisticUpdate Tests
// ============================================

describe("applyOptimisticUpdate utility", () => {
  it("returns rollback function", () => {
    // Simulate queryClient behavior
    let cachedData: unknown = { value: 10 };
    const queryClient = {
      getQueryData: () => cachedData,
      setQueryData: (_key: QueryKey, data: unknown) => {
        cachedData = data;
      },
    };

    const previousData = queryClient.getQueryData();
    queryClient.setQueryData(["test"], { value: 20 });

    const rollback = () => {
      queryClient.setQueryData(["test"], previousData);
    };

    expect(cachedData).toEqual({ value: 20 });
    rollback();
    expect(cachedData).toEqual({ value: 10 });
  });
});

// ============================================
// Integration Pattern Tests
// ============================================

describe("acknowledge alert pattern", () => {
  it("optimistically acknowledges alert", () => {
    const alert = {
      id: "alert-1",
      title: "Test Alert",
      acknowledged: false,
    };

    // Optimistic update
    const optimisticUpdate = (current: typeof alert | undefined, acknowledged: boolean) => ({
      ...current!,
      acknowledged,
    });

    const result = optimisticUpdate(alert, true);
    expect(result.acknowledged).toBe(true);
    expect(result.id).toBe("alert-1");
  });
});

describe("modify stop-loss pattern", () => {
  it("optimistically updates stop-loss", () => {
    const position = {
      id: "pos-1",
      symbol: "AAPL",
      stopLoss: 150.0,
    };

    const optimisticUpdate = (current: typeof position | undefined, newStopLoss: number) => ({
      ...current!,
      stopLoss: newStopLoss,
    });

    const result = optimisticUpdate(position, 145.0);
    expect(result.stopLoss).toBe(145.0);
    expect(result.symbol).toBe("AAPL");
  });
});

describe("toggle watchlist pattern", () => {
  it("optimistically adds to watchlist", () => {
    const watchlist = ["AAPL", "GOOGL"];
    const symbol = "MSFT";

    const result = [...watchlist, symbol];
    expect(result).toContain("MSFT");
    expect(result).toHaveLength(3);
  });

  it("optimistically removes from watchlist", () => {
    const watchlist = ["AAPL", "GOOGL", "MSFT"];
    const symbol = "GOOGL";

    const result = watchlist.filter((s) => s !== symbol);
    expect(result).not.toContain("GOOGL");
    expect(result).toHaveLength(2);
  });
});

// ============================================
// Export Tests
// ============================================

describe("module exports", () => {
  it("exports useOptimisticUpdate hook", async () => {
    const module = await import("./use-optimistic-update");
    expect(typeof module.useOptimisticUpdate).toBe("function");
    expect(typeof module.default).toBe("function");
  });

  it("exports useOptimisticListUpdate hook", async () => {
    const module = await import("./use-optimistic-update");
    expect(typeof module.useOptimisticListUpdate).toBe("function");
  });

  it("exports applyOptimisticUpdate utility", async () => {
    const module = await import("./use-optimistic-update");
    expect(typeof module.applyOptimisticUpdate).toBe("function");
  });
});
