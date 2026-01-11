/**
 * Backtest Adapter Creation Tests
 */

import { describe, expect, test } from "bun:test";
import { createBacktestAdapter } from "../src/adapters/backtest.js";

describe("createBacktestAdapter", () => {
  test("creates adapter with default configuration", () => {
    const adapter = createBacktestAdapter();
    expect(adapter).toBeDefined();
    expect(adapter.getEnvironment()).toBe("BACKTEST");
  });

  test("creates adapter with custom initial cash", async () => {
    const adapter = createBacktestAdapter({ initialCash: 50000 });
    const account = await adapter.getAccount();
    expect(account.cash).toBe(50000);
  });

  test("generates unique order IDs with prefix", () => {
    const adapter = createBacktestAdapter({ orderIdPrefix: "test" });
    const id1 = adapter.generateOrderId();
    const id2 = adapter.generateOrderId();

    expect(id1).toContain("test");
    expect(id2).toContain("test");
    expect(id1).not.toBe(id2);
  });
});
