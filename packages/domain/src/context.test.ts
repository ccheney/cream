/**
 * ExecutionContext Tests
 *
 * Tests for the ExecutionContext type, factory function, and validation.
 */

import { describe, expect, test } from "bun:test";
import {
  createContext,
  EXECUTION_SOURCES,
  type ExecutionSource,
  isValidExecutionSource,
} from "./context";

// UUID v4 regex pattern
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("createContext", () => {
  test("generates valid UUID v4 traceId", () => {
    const ctx = createContext("BACKTEST", "test");
    expect(ctx.traceId).toMatch(UUID_V4_REGEX);
  });

  test("generates unique traceId for each call", () => {
    const ctx1 = createContext("BACKTEST", "test");
    const ctx2 = createContext("BACKTEST", "test");
    expect(ctx1.traceId).not.toBe(ctx2.traceId);
  });

  test("sets environment correctly", () => {
    const backtestCtx = createContext("BACKTEST", "test");
    const paperCtx = createContext("PAPER", "scheduled");
    const liveCtx = createContext("LIVE", "scheduled");

    expect(backtestCtx.environment).toBe("BACKTEST");
    expect(paperCtx.environment).toBe("PAPER");
    expect(liveCtx.environment).toBe("LIVE");
  });

  test("sets source correctly for all valid sources", () => {
    const sources: ExecutionSource[] = [
      "test",
      "backtest",
      "dashboard-test",
      "scheduled",
      "manual",
    ];

    for (const source of sources) {
      const ctx = createContext("BACKTEST", source);
      expect(ctx.source).toBe(source);
    }
  });

  test("sets optional configId when provided", () => {
    const ctx = createContext("PAPER", "dashboard-test", "config-v1.2.3");
    expect(ctx.configId).toBe("config-v1.2.3");
  });

  test("configId is undefined when not provided", () => {
    const ctx = createContext("BACKTEST", "test");
    expect(ctx.configId).toBeUndefined();
  });

  test("returns frozen (immutable) object", () => {
    const ctx = createContext("BACKTEST", "test");

    expect(Object.isFrozen(ctx)).toBe(true);

    // Attempting to modify should throw in strict mode or be silently ignored
    expect(() => {
      // @ts-expect-error - Testing runtime immutability
      ctx.environment = "LIVE";
    }).toThrow();
  });

  test("frozen object properties cannot be deleted", () => {
    const ctx = createContext("BACKTEST", "test");

    expect(() => {
      // @ts-expect-error - Testing runtime immutability
      delete ctx.traceId;
    }).toThrow();
  });

  test("frozen object cannot have properties added", () => {
    const ctx = createContext("BACKTEST", "test");

    expect(() => {
      // @ts-expect-error - Testing runtime immutability
      ctx.newProperty = "value";
    }).toThrow();
  });
});

describe("ExecutionSource validation", () => {
  test("EXECUTION_SOURCES contains all valid sources", () => {
    expect(EXECUTION_SOURCES).toContain("test");
    expect(EXECUTION_SOURCES).toContain("backtest");
    expect(EXECUTION_SOURCES).toContain("dashboard-test");
    expect(EXECUTION_SOURCES).toContain("scheduled");
    expect(EXECUTION_SOURCES).toContain("manual");
    expect(EXECUTION_SOURCES).toHaveLength(5);
  });

  test("EXECUTION_SOURCES is readonly at compile time", () => {
    // The `as const` assertion makes EXECUTION_SOURCES readonly at the type level
    // TypeScript prevents mutation at compile time, not runtime
    // This test verifies the array exists and has the expected structure
    expect(Array.isArray(EXECUTION_SOURCES)).toBe(true);
    expect(EXECUTION_SOURCES.length).toBe(5);
  });
});

describe("isValidExecutionSource", () => {
  test("returns true for valid sources", () => {
    expect(isValidExecutionSource("test")).toBe(true);
    expect(isValidExecutionSource("backtest")).toBe(true);
    expect(isValidExecutionSource("dashboard-test")).toBe(true);
    expect(isValidExecutionSource("scheduled")).toBe(true);
    expect(isValidExecutionSource("manual")).toBe(true);
  });

  test("returns false for invalid strings", () => {
    expect(isValidExecutionSource("invalid")).toBe(false);
    expect(isValidExecutionSource("TEST")).toBe(false);
    expect(isValidExecutionSource("")).toBe(false);
    expect(isValidExecutionSource("dashboard_test")).toBe(false);
  });

  test("returns false for non-string values", () => {
    expect(isValidExecutionSource(null)).toBe(false);
    expect(isValidExecutionSource(undefined)).toBe(false);
    expect(isValidExecutionSource(123)).toBe(false);
    expect(isValidExecutionSource({})).toBe(false);
    expect(isValidExecutionSource([])).toBe(false);
  });
});

describe("ExecutionContext type safety", () => {
  test("context environment is typed as CreamEnvironment", () => {
    const ctx = createContext("BACKTEST", "test");
    // This is a compile-time check - if types are wrong, this won't compile
    const env: "BACKTEST" | "PAPER" | "LIVE" = ctx.environment;
    expect(env).toBe("BACKTEST");
  });

  test("context source is typed as ExecutionSource", () => {
    const ctx = createContext("BACKTEST", "test");
    // Compile-time type check
    const source: ExecutionSource = ctx.source;
    expect(source).toBe("test");
  });

  test("context traceId is typed as string", () => {
    const ctx = createContext("BACKTEST", "test");
    const traceId: string = ctx.traceId;
    expect(typeof traceId).toBe("string");
  });
});

describe("Real-world usage patterns", () => {
  test("test context creation pattern", () => {
    // Pattern used in test files
    const ctx = createContext("BACKTEST", "test");
    expect(ctx.environment).toBe("BACKTEST");
    expect(ctx.source).toBe("test");
  });

  test("dashboard test context pattern", () => {
    // Pattern used when testing from dashboard UI
    const configVersion = "draft-2026-01-08";
    const ctx = createContext("PAPER", "dashboard-test", configVersion);

    expect(ctx.environment).toBe("PAPER");
    expect(ctx.source).toBe("dashboard-test");
    expect(ctx.configId).toBe(configVersion);
  });

  test("scheduled worker context pattern", () => {
    // Pattern used by hourly OODA worker
    const activeConfigId = "config-abc123";
    const ctx = createContext("LIVE", "scheduled", activeConfigId);

    expect(ctx.environment).toBe("LIVE");
    expect(ctx.source).toBe("scheduled");
    expect(ctx.configId).toBe(activeConfigId);
  });

  test("backtest context pattern", () => {
    // Pattern used for historical backtesting
    const backtestId = "backtest-xyz789";
    const ctx = createContext("BACKTEST", "backtest", backtestId);

    expect(ctx.environment).toBe("BACKTEST");
    expect(ctx.source).toBe("backtest");
    expect(ctx.configId).toBe(backtestId);
  });

  test("manual CLI context pattern", () => {
    // Pattern used for manual CLI invocations
    const ctx = createContext("PAPER", "manual");

    expect(ctx.environment).toBe("PAPER");
    expect(ctx.source).toBe("manual");
    expect(ctx.configId).toBeUndefined();
  });
});
