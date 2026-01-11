/**
 * Integration and Performance Tests
 *
 * Tests for overall indicator system performance and cross-module integration.
 */

import { describe, expect, it } from "bun:test";
import { calculateRSI } from "../src/momentum/rsi.js";
import { calculateIndicators } from "../src/pipeline.js";
import { generateCandles } from "./test-utils.js";

describe("Performance", () => {
  it("should calculate RSI for 10k candles in reasonable time", () => {
    const largeDataset = generateCandles(10000);
    const start = performance.now();
    calculateRSI(largeDataset);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });

  it("should calculate all indicators for 10k candles in reasonable time", () => {
    const largeDataset = generateCandles(10000);
    const start = performance.now();
    calculateIndicators(largeDataset, "1h");
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(500);
  });
});
