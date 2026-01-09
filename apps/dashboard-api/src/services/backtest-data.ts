/**
 * Backtest Data Preparation Service
 *
 * Fetches historical OHLCV data from market data providers and prepares
 * Parquet files for VectorBT backtesting.
 *
 * @see docs/plans/28-backtest-execution-pipeline.md Phase 3.1
 */

import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import {
  type AggregateBar,
  createPolygonClientFromEnv,
  type PolygonClient,
  type Timespan,
} from "@cream/marketdata";
import type { Backtest } from "@cream/storage";

// ============================================
// Types
// ============================================

/**
 * OHLCV data row for Parquet output.
 */
export interface OhlcvRow {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Signal row for Parquet output.
 */
export interface SignalRow {
  timestamp: string;
  entries: boolean;
  exits: boolean;
}

/**
 * Result from data preparation.
 */
export interface PreparedBacktestData {
  dataPath: string;
  signalsPath: string;
}

/**
 * Timeframe configuration for backtest.
 */
export type BacktestTimeframe = "1Min" | "5Min" | "15Min" | "1Hour" | "1Day";

// ============================================
// Configuration
// ============================================

/**
 * Map backtest timeframes to Polygon API timespans and multipliers.
 */
const TIMEFRAME_MAP: Record<BacktestTimeframe, { multiplier: number; timespan: Timespan }> = {
  "1Min": { multiplier: 1, timespan: "minute" },
  "5Min": { multiplier: 5, timespan: "minute" },
  "15Min": { multiplier: 15, timespan: "minute" },
  "1Hour": { multiplier: 1, timespan: "hour" },
  "1Day": { multiplier: 1, timespan: "day" },
};

/**
 * Get the path to the research package (for uv run).
 */
function getResearchPath(): string {
  return `${import.meta.dir}/../../../../packages/research`;
}

// ============================================
// Parquet Writing
// ============================================

/**
 * Write data to a Parquet file using Python subprocess.
 *
 * Since Bun lacks native Parquet support, we use Python's pyarrow.
 */
async function writeParquet(path: string, data: unknown[]): Promise<void> {
  const pythonCode = `
import sys
import json
import pandas as pd

data = json.loads(sys.stdin.read())
df = pd.DataFrame(data)

# Convert timestamp column to datetime if present
if 'timestamp' in df.columns:
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    df.set_index('timestamp', inplace=True)

df.to_parquet("${path}")
`;

  const proc = Bun.spawn(["uv", "run", "python", "-c", pythonCode], {
    cwd: getResearchPath(),
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });

  // Write JSON data to stdin
  proc.stdin.write(JSON.stringify(data));
  proc.stdin.end();

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`Failed to write Parquet file: ${stderr}`);
  }
}

// ============================================
// Data Fetching
// ============================================

/**
 * Convert Polygon aggregate bars to OHLCV rows.
 */
function convertBarsToOhlcv(bars: AggregateBar[]): OhlcvRow[] {
  return bars.map((bar) => ({
    timestamp: new Date(bar.t).toISOString(),
    open: bar.o,
    high: bar.h,
    low: bar.l,
    close: bar.c,
    volume: bar.v,
  }));
}

/**
 * Fetch historical OHLCV data from Polygon.
 */
async function fetchHistoricalData(
  client: PolygonClient,
  symbol: string,
  startDate: string,
  endDate: string,
  timeframe: BacktestTimeframe
): Promise<OhlcvRow[]> {
  const { multiplier, timespan } = TIMEFRAME_MAP[timeframe];

  const response = await client.getAggregates(symbol, multiplier, timespan, startDate, endDate, {
    adjusted: true,
    sort: "asc",
    limit: 50000,
  });

  if (!response.results || response.results.length === 0) {
    throw new Error(`No market data found for ${symbol} from ${startDate} to ${endDate}`);
  }

  return convertBarsToOhlcv(response.results);
}

// ============================================
// Signal Generation
// ============================================

/**
 * Generate placeholder signals for MVP.
 *
 * This uses a simple SMA crossover strategy as a placeholder.
 * Future versions will interpret strategy definitions from backtest.config.
 */
function generatePlaceholderSignals(ohlcv: OhlcvRow[]): SignalRow[] {
  // Simple SMA crossover: fast SMA (10) vs slow SMA (30)
  const fastPeriod = 10;
  const slowPeriod = 30;

  // Calculate SMAs
  const closes = ohlcv.map((row) => row.close);
  const fastSma: number[] = [];
  const slowSma: number[] = [];

  for (let i = 0; i < closes.length; i++) {
    // Fast SMA
    if (i >= fastPeriod - 1) {
      const sum = closes.slice(i - fastPeriod + 1, i + 1).reduce((a, b) => a + b, 0);
      fastSma.push(sum / fastPeriod);
    } else {
      fastSma.push(NaN);
    }

    // Slow SMA
    if (i >= slowPeriod - 1) {
      const sum = closes.slice(i - slowPeriod + 1, i + 1).reduce((a, b) => a + b, 0);
      slowSma.push(sum / slowPeriod);
    } else {
      slowSma.push(NaN);
    }
  }

  // Generate signals: entry when fast crosses above slow, exit when below
  const signals: SignalRow[] = [];

  for (let i = 0; i < ohlcv.length; i++) {
    let entry = false;
    let exit = false;

    const currFast = fastSma[i];
    const currSlow = slowSma[i];
    const prevFast = i > 0 ? fastSma[i - 1] : undefined;
    const prevSlow = i > 0 ? slowSma[i - 1] : undefined;

    // Check all values are defined and not NaN
    if (
      currFast !== undefined &&
      currSlow !== undefined &&
      prevFast !== undefined &&
      prevSlow !== undefined &&
      !Number.isNaN(currFast) &&
      !Number.isNaN(currSlow) &&
      !Number.isNaN(prevFast) &&
      !Number.isNaN(prevSlow)
    ) {
      // Entry: fast SMA crosses above slow SMA
      if (prevFast <= prevSlow && currFast > currSlow) {
        entry = true;
      }
      // Exit: fast SMA crosses below slow SMA
      if (prevFast >= prevSlow && currFast < currSlow) {
        exit = true;
      }
    }

    const row = ohlcv[i];
    if (row) {
      signals.push({
        timestamp: row.timestamp,
        entries: entry,
        exits: exit,
      });
    }
  }

  return signals;
}

// ============================================
// Main Functions
// ============================================

/**
 * Prepare historical data for backtest.
 *
 * @param backtest - The backtest configuration
 * @returns Path to the generated Parquet file
 */
export async function prepareBacktestData(backtest: Backtest): Promise<string> {
  const client = createPolygonClientFromEnv();

  // Get first symbol from universe (single symbol for MVP)
  const symbol = backtest.universe[0];
  if (!symbol) {
    throw new Error("Backtest must have at least one symbol in universe");
  }

  // Get timeframe from config or default to 1Hour
  const timeframe: BacktestTimeframe = (backtest.config?.timeframe as BacktestTimeframe) ?? "1Hour";

  // Fetch data
  const ohlcv = await fetchHistoricalData(
    client,
    symbol,
    backtest.startDate,
    backtest.endDate,
    timeframe
  );

  // Write to temp Parquet file
  const dataPath = `${tmpdir()}/backtest-data-${randomUUID()}.parquet`;
  await writeParquet(dataPath, ohlcv);

  return dataPath;
}

/**
 * Prepare trading signals for backtest.
 *
 * @param backtest - The backtest configuration
 * @param ohlcvPath - Path to the OHLCV Parquet file (to read timestamps/data)
 * @returns Path to the generated signals Parquet file
 */
export async function prepareSignals(backtest: Backtest): Promise<string> {
  const client = createPolygonClientFromEnv();

  // Get first symbol
  const symbol = backtest.universe[0];
  if (!symbol) {
    throw new Error("Backtest must have at least one symbol in universe");
  }

  // Get timeframe
  const timeframe: BacktestTimeframe = (backtest.config?.timeframe as BacktestTimeframe) ?? "1Hour";

  // Fetch data for signal generation
  const ohlcv = await fetchHistoricalData(
    client,
    symbol,
    backtest.startDate,
    backtest.endDate,
    timeframe
  );

  // Generate signals
  const signals = generatePlaceholderSignals(ohlcv);

  // Write to temp Parquet file
  const signalsPath = `${tmpdir()}/backtest-signals-${randomUUID()}.parquet`;
  await writeParquet(signalsPath, signals);

  return signalsPath;
}

/**
 * Prepare all backtest data (OHLCV and signals).
 *
 * This is a convenience function that prepares both files in parallel
 * where possible, but note that signals depend on OHLCV data.
 *
 * @param backtest - The backtest configuration
 * @returns Paths to both generated Parquet files
 */
export async function prepareAllBacktestData(backtest: Backtest): Promise<PreparedBacktestData> {
  // For MVP, we fetch data twice (once for OHLCV, once for signals)
  // This could be optimized to share the data fetch
  const [dataPath, signalsPath] = await Promise.all([
    prepareBacktestData(backtest),
    prepareSignals(backtest),
  ]);

  return { dataPath, signalsPath };
}

/**
 * Clean up temporary backtest data files.
 */
export async function cleanupBacktestData(paths: PreparedBacktestData): Promise<void> {
  const { unlink } = await import("node:fs/promises");

  await Promise.all([
    unlink(paths.dataPath).catch(() => {
      // Ignore errors if file already deleted
    }),
    unlink(paths.signalsPath).catch(() => {
      // Ignore errors if file already deleted
    }),
  ]);
}
