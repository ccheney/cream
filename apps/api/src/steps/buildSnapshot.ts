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

/**
 * Create ExecutionContext for step invocation.
 * Steps are invoked by the Mastra workflow during scheduled runs.
 */
function createStepContext(): ExecutionContext {
  const envValue = process.env.CREAM_ENV || "BACKTEST";
  return createContext(envValue as CreamEnvironment, "scheduled");
}

import { LoadStateOutputSchema } from "./loadState.js";

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
 * Create a minimal mock snapshot for a symbol
 */
function createMockSnapshot(symbol: string, timestamp: number) {
  return {
    symbol,
    timestamp,
    createdAt: new Date().toISOString(),
    latestPrice: 100 + Math.random() * 50,
    latestVolume: 1000000 + Math.random() * 500000,
    indicators: {
      rsi: 50 + Math.random() * 20 - 10,
      atr: 2 + Math.random(),
      sma20: 100 + Math.random() * 10,
      sma50: 98 + Math.random() * 10,
    },
    normalized: {
      priceChangePercent: Math.random() * 4 - 2,
      volumeRatio: 0.8 + Math.random() * 0.4,
    },
    regime: {
      label: "RANGE" as const,
      confidence: 0.6 + Math.random() * 0.3,
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
    // return mock snapshots for faster execution
    if (isBacktest(ctx)) {
      const snapshotMap: Record<string, unknown> = {};
      for (const symbol of allSymbols) {
        snapshotMap[symbol] = createMockSnapshot(symbol, timestamp);
      }

      return {
        snapshots: snapshotMap,
        timestamp: new Date().toISOString(),
        symbolCount: allSymbols.length,
      };
    }

    // In PAPER/LIVE mode, create snapshots
    // TODO: Wire up real Polygon/FMP data sources when available
    // For now, use mock snapshots as placeholder
    const snapshotMap: Record<string, unknown> = {};
    for (const symbol of allSymbols) {
      snapshotMap[symbol] = createMockSnapshot(symbol, timestamp);
    }

    return {
      snapshots: snapshotMap,
      timestamp: new Date().toISOString(),
      symbolCount: allSymbols.length,
    };
  },
});
