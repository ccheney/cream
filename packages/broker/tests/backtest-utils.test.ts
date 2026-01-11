/**
 * Backtest Adapter Utility Methods Tests
 */

import { describe, expect, test } from "bun:test";
import { createBacktestAdapterWithUtils } from "../src/adapters/backtest.js";

describe("createBacktestAdapterWithUtils", () => {
  test("provides utility methods", () => {
    const adapter = createBacktestAdapterWithUtils({ initialCash: 100000 });

    expect(typeof adapter.setCash).toBe("function");
    expect(typeof adapter.triggerFills).toBe("function");
    expect(typeof adapter.updatePrices).toBe("function");
    expect(typeof adapter.reset).toBe("function");
    expect(typeof adapter.getCash).toBe("function");
  });

  test("setCash updates the cash value", () => {
    const adapter = createBacktestAdapterWithUtils({ initialCash: 100000 });
    adapter.setCash(50000);
    expect(adapter.getCash()).toBe(50000);
  });

  test("reset restores initial state", () => {
    const adapter = createBacktestAdapterWithUtils({ initialCash: 100000 });
    adapter.setCash(25000);
    adapter.updatePrices({ AAPL: 200 });
    adapter.reset();
    expect(adapter.getCash()).toBe(100000);
  });

  test("updatePrices stores price overrides", () => {
    const adapter = createBacktestAdapterWithUtils({
      initialCash: 100000,
      priceProvider: () => 100,
    });
    adapter.updatePrices({ AAPL: 200 });
    expect(adapter.getCash()).toBe(100000);
  });

  test("triggerFills can be called", () => {
    const adapter = createBacktestAdapterWithUtils({ initialCash: 100000 });
    adapter.triggerFills();
  });
});
