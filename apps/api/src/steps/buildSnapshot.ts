/**
 * Build Snapshot Step
 *
 * Step 2: Build feature snapshots for universe symbols using market data providers.
 */

import {
  type CreamEnvironment,
  createContext,
  type ExecutionContext,
  isBacktest,
} from "@cream/domain";
import { createStep } from "@mastra/core/workflows";
import { z } from "zod";

import {
  FIXTURE_TIMESTAMP,
  getCandleFixtures,
  getSnapshotFixture,
} from "../../fixtures/market/index.js";
import { LoadStateOutputSchema } from "./loadState.js";

/**
 * Create ExecutionContext for step invocation.
 * Steps are invoked by the Mastra workflow during scheduled runs.
 */
function createStepContext(): ExecutionContext {
  const envValue = process.env.CREAM_ENV || "BACKTEST";
  return createContext(envValue as CreamEnvironment, "scheduled");
}

export const SnapshotOutputSchema = z.object({
  snapshots: z.record(z.string(), z.any()),
  timestamp: z.string(),
  symbolCount: z.number(),
});

export type SnapshotOutput = z.infer<typeof SnapshotOutputSchema>;

/**
 * Default universe symbols for trading
 */
const DEFAULT_UNIVERSE = [
  "AAPL",
  "MSFT",
  "GOOGL",
  "AMZN",
  "NVDA",
  "META",
  "TSLA",
  "JPM",
  "V",
  "UNH",
];

/**
 * Create a deterministic snapshot for a symbol using test fixtures.
 * Uses pre-generated fixture data to ensure reproducible test behavior.
 */
function createFixtureSnapshot(symbol: string, timestamp: number) {
  const snapshot = getSnapshotFixture(symbol);
  const candles = getCandleFixtures(symbol, 50);

  // Calculate deterministic indicators from candles
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);

  // Calculate simple RSI (14-period)
  const rsiPeriod = 14;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - rsiPeriod; i < closes.length; i++) {
    const current = closes[i];
    const previous = closes[i - 1];
    if (current !== undefined && previous !== undefined) {
      const change = current - previous;
      if (change > 0) {
        gains += change;
      } else {
        losses += Math.abs(change);
      }
    }
  }
  const avgGain = gains / rsiPeriod;
  const avgLoss = losses / rsiPeriod;
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);

  // Calculate ATR (14-period)
  const atrPeriod = 14;
  let atrSum = 0;
  for (let i = closes.length - atrPeriod; i < closes.length; i++) {
    const high = highs[i];
    const low = lows[i];
    const prevClose = closes[i - 1];
    if (high !== undefined && low !== undefined && prevClose !== undefined) {
      const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
      atrSum += tr;
    }
  }
  const atr = atrSum / atrPeriod;

  // Calculate SMAs
  const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const sma50 = closes.slice(-50).reduce((a, b) => a + b, 0) / Math.min(closes.length, 50);

  // Get price and volume from snapshot
  const latestPrice = snapshot.lastTrade?.price ?? snapshot.open;
  const latestVolume = snapshot.volume;

  // Calculate price change from previous close
  const priceChangePercent = ((latestPrice - snapshot.prevClose) / snapshot.prevClose) * 100;

  // Calculate volume ratio (current vs average from candles)
  const avgVolume = candles.reduce((sum, c) => sum + c.volume, 0) / candles.length;
  const volumeRatio = latestVolume / avgVolume;

  return {
    symbol,
    timestamp,
    createdAt: new Date(FIXTURE_TIMESTAMP).toISOString(),
    latestPrice,
    latestVolume,
    indicators: {
      rsi: Number(rsi.toFixed(2)),
      atr: Number(atr.toFixed(2)),
      sma20: Number(sma20.toFixed(2)),
      sma50: Number(sma50.toFixed(2)),
    },
    normalized: {
      priceChangePercent: Number(priceChangePercent.toFixed(2)),
      volumeRatio: Number(volumeRatio.toFixed(2)),
    },
    regime: {
      label: "RANGE" as const,
      confidence: 0.75, // Fixed deterministic value
    },
    metadata: {
      symbol,
      sector: "Technology",
      marketCapBucket: "MEGA" as const,
    },
  };
}

export const buildSnapshotStep = createStep({
  id: "build-snapshot",
  description: "Build feature snapshots for universe symbols",
  inputSchema: LoadStateOutputSchema,
  outputSchema: SnapshotOutputSchema,
  retries: 3,
  execute: async ({ inputData }) => {
    const { positions } = inputData;
    const timestamp = Date.now();

    // Get symbols from positions + default universe
    const positionSymbols = positions.map((p) => p.symbol);
    const allSymbols = [...new Set([...positionSymbols, ...DEFAULT_UNIVERSE])];

    // Create context at step boundary
    const ctx = createStepContext();

    // In backtest mode or when data sources are not configured,
    // return deterministic fixture snapshots for faster execution
    if (isBacktest(ctx)) {
      const snapshotMap: Record<string, unknown> = {};
      for (const symbol of allSymbols) {
        snapshotMap[symbol] = createFixtureSnapshot(symbol, timestamp);
      }

      return {
        snapshots: snapshotMap,
        timestamp: new Date(FIXTURE_TIMESTAMP).toISOString(),
        symbolCount: allSymbols.length,
      };
    }

    // In PAPER/LIVE mode, create snapshots
    // TODO: Wire up real Polygon/FMP data sources when available
    // For now, use fixture snapshots as placeholder
    const snapshotMap: Record<string, unknown> = {};
    for (const symbol of allSymbols) {
      snapshotMap[symbol] = createFixtureSnapshot(symbol, timestamp);
    }

    return {
      snapshots: snapshotMap,
      timestamp: new Date().toISOString(),
      symbolCount: allSymbols.length,
    };
  },
});
