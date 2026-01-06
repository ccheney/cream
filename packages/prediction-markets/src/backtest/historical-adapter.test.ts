/**
 * Tests for Historical Prediction Market Adapter
 */

import { describe, expect, test } from "bun:test";
import { HistoricalPredictionMarketAdapter } from "./historical-adapter";

describe("HistoricalPredictionMarketAdapter", () => {
  test("creates adapter with default config", () => {
    const adapter = new HistoricalPredictionMarketAdapter();
    expect(adapter).toBeDefined();
  });

  test("creates adapter with custom config", () => {
    const adapter = new HistoricalPredictionMarketAdapter({
      apiKey: "test-key",
      timeoutMs: 5000,
    });
    expect(adapter).toBeDefined();
  });

  test("getHistoricalMarkets returns empty array (placeholder)", async () => {
    const adapter = new HistoricalPredictionMarketAdapter();
    const markets = await adapter.getHistoricalMarkets(
      new Date("2025-01-01"),
      new Date("2025-06-01"),
      ["FED_RATE", "RECESSION"]
    );

    expect(Array.isArray(markets)).toBe(true);
    expect(markets.length).toBe(0);
  });

  test("getMarketAtTime returns null (placeholder)", async () => {
    const adapter = new HistoricalPredictionMarketAdapter();
    const snapshot = await adapter.getMarketAtTime("KXFED-25FEB", new Date());

    expect(snapshot).toBeNull();
  });

  test("computeSignalAccuracy returns report structure", async () => {
    const adapter = new HistoricalPredictionMarketAdapter();
    const report = await adapter.computeSignalAccuracy("fed_rate", 0.7, {
      start: new Date("2025-01-01"),
      end: new Date("2025-06-01"),
    });

    expect(report).toBeDefined();
    expect(report.signalType).toBe("fed_rate");
    expect(report.metrics).toBeDefined();
    expect(report.metrics.directionalAccuracy).toBe(0);
    expect(report.metrics.brierScore).toBe(0);
  });

  test("computeSignalCorrelation returns empty array (placeholder)", async () => {
    const adapter = new HistoricalPredictionMarketAdapter();
    const correlations = await adapter.computeSignalCorrelation("fed_rate", "SPY", {
      start: new Date("2025-01-01"),
      end: new Date("2025-06-01"),
    });

    expect(Array.isArray(correlations)).toBe(true);
    expect(correlations.length).toBe(0);
  });

  test("computeOptimalWeights returns equal weights (placeholder)", async () => {
    const adapter = new HistoricalPredictionMarketAdapter();
    const weights = await adapter.computeOptimalWeights(["fed_rate", "recession"], {
      start: new Date("2025-01-01"),
      end: new Date("2025-06-01"),
    });

    expect(weights).toBeDefined();
    expect(weights.fed_rate).toBe(0.5);
    expect(weights.recession).toBe(0.5);
  });

  test("analyzeByRegime returns regime breakdown", async () => {
    const adapter = new HistoricalPredictionMarketAdapter();
    const analysis = await adapter.analyzeByRegime("fed_rate", {
      start: new Date("2025-01-01"),
      end: new Date("2025-06-01"),
    });

    expect(Array.isArray(analysis)).toBe(true);
    expect(analysis.length).toBe(3);
    expect(analysis.some((a) => a.regime === "LOW_VOL")).toBe(true);
    expect(analysis.some((a) => a.regime === "MEDIUM_VOL")).toBe(true);
    expect(analysis.some((a) => a.regime === "HIGH_VOL")).toBe(true);
  });
});
