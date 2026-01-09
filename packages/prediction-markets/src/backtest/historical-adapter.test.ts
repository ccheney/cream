/**
 * Tests for Historical Prediction Market Adapter
 */

import { describe, expect, test } from "bun:test";
import { ConfigurationError } from "../types";
import {
  createHistoricalAdapterFromEnv,
  HistoricalPredictionMarketAdapter,
} from "./historical-adapter";

describe("HistoricalPredictionMarketAdapter", () => {
  test("creates adapter", () => {
    const adapter = new HistoricalPredictionMarketAdapter();
    expect(adapter).toBeDefined();
  });

  test("getHistoricalMarkets throws ConfigurationError when no repository", async () => {
    const adapter = new HistoricalPredictionMarketAdapter();
    await expect(
      adapter.getHistoricalMarkets(new Date("2025-01-01"), new Date("2025-06-01"), [
        "FED_RATE",
        "RECESSION",
      ])
    ).rejects.toThrow(ConfigurationError);
  });

  test("getMarketAtTime throws ConfigurationError when no repository", async () => {
    const adapter = new HistoricalPredictionMarketAdapter();
    await expect(adapter.getMarketAtTime("KXFED-25FEB", new Date())).rejects.toThrow(
      ConfigurationError
    );
  });

  test("computeSignalAccuracy throws ConfigurationError when no repository", async () => {
    const adapter = new HistoricalPredictionMarketAdapter();
    await expect(
      adapter.computeSignalAccuracy("fed_rate", 0.7, {
        start: new Date("2025-01-01"),
        end: new Date("2025-06-01"),
      })
    ).rejects.toThrow(ConfigurationError);
  });

  test("computeSignalCorrelation throws ConfigurationError when no repository", async () => {
    const adapter = new HistoricalPredictionMarketAdapter();
    await expect(
      adapter.computeSignalCorrelation("fed_rate", "SPY", {
        start: new Date("2025-01-01"),
        end: new Date("2025-06-01"),
      })
    ).rejects.toThrow(ConfigurationError);
  });

  test("computeOptimalWeights throws ConfigurationError when no repository", async () => {
    const adapter = new HistoricalPredictionMarketAdapter();
    await expect(
      adapter.computeOptimalWeights(["fed_rate", "recession"], {
        start: new Date("2025-01-01"),
        end: new Date("2025-06-01"),
      })
    ).rejects.toThrow(ConfigurationError);
  });

  test("analyzeByRegime throws ConfigurationError when no repository", async () => {
    const adapter = new HistoricalPredictionMarketAdapter();
    await expect(
      adapter.analyzeByRegime("fed_rate", {
        start: new Date("2025-01-01"),
        end: new Date("2025-06-01"),
      })
    ).rejects.toThrow(ConfigurationError);
  });
});

describe("createHistoricalAdapterFromEnv", () => {
  test("creates adapter from environment", () => {
    const adapter = createHistoricalAdapterFromEnv();
    expect(adapter).toBeInstanceOf(HistoricalPredictionMarketAdapter);
  });
});
