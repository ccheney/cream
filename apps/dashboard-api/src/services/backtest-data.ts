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
  type Candle,
  calculateBollingerBands,
  calculateMACD,
  calculateRSI,
  calculateSMA,
  isDeathCross,
  isGoldenCross,
} from "@cream/indicators";
import {
  type AlpacaBar,
  type AlpacaMarketDataClient,
  type AlpacaTimeframe,
  createAlpacaClientFromEnv,
} from "@cream/marketdata";
import type { Backtest } from "@cream/storage";
import { z } from "zod/v4";

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
// Strategy Configuration Schemas
// ============================================

/**
 * SMA Crossover Strategy: entry on golden cross, exit on death cross.
 */
const SMACrossoverConfigSchema = z.object({
  type: z.literal("sma_crossover"),
  fastPeriod: z.number().int().min(1).default(10),
  slowPeriod: z.number().int().min(1).default(30),
});

/**
 * RSI Oversold/Overbought Strategy: entry on oversold bounce, exit on overbought.
 */
const RSIConfigSchema = z.object({
  type: z.literal("rsi_oversold_overbought"),
  period: z.number().int().min(1).default(14),
  oversold: z.number().min(0).max(100).default(30),
  overbought: z.number().min(0).max(100).default(70),
});

/**
 * Bollinger Breakout Strategy: entry on upper breakout, exit on lower touch.
 */
const BollingerBreakoutConfigSchema = z.object({
  type: z.literal("bollinger_breakout"),
  period: z.number().int().min(1).default(20),
  stdDev: z.number().min(0.5).max(4).default(2),
});

/**
 * MACD Crossover Strategy: entry on MACD/signal cross up, exit on cross down.
 */
const MACDCrossoverConfigSchema = z.object({
  type: z.literal("macd_crossover"),
  fastPeriod: z.number().int().default(12),
  slowPeriod: z.number().int().default(26),
  signalPeriod: z.number().int().default(9),
});

/**
 * Union of all supported strategy configurations.
 */
export const StrategyConfigSchema = z.discriminatedUnion("type", [
  SMACrossoverConfigSchema,
  RSIConfigSchema,
  BollingerBreakoutConfigSchema,
  MACDCrossoverConfigSchema,
]);

export type StrategyConfig = z.infer<typeof StrategyConfigSchema>;

// ============================================
// Configuration
// ============================================

/**
 * Map backtest timeframes to Alpaca API timeframes.
 */
const TIMEFRAME_MAP: Record<BacktestTimeframe, AlpacaTimeframe> = {
  "1Min": "1Min",
  "5Min": "5Min",
  "15Min": "15Min",
  "1Hour": "1Hour",
  "1Day": "1Day",
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
 * Convert Alpaca bars to OHLCV rows.
 */
function convertBarsToOhlcv(bars: AlpacaBar[]): OhlcvRow[] {
  return bars.map((bar) => ({
    timestamp: new Date(bar.timestamp).toISOString(),
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
  }));
}

/**
 * Fetch historical OHLCV data from Alpaca.
 */
async function fetchHistoricalData(
  client: AlpacaMarketDataClient,
  symbol: string,
  startDate: string,
  endDate: string,
  timeframe: BacktestTimeframe
): Promise<OhlcvRow[]> {
  const alpacaTimeframe = TIMEFRAME_MAP[timeframe];

  const bars = await client.getBars(symbol, alpacaTimeframe, startDate, endDate, 50000);

  if (bars.length === 0) {
    throw new Error(`No market data found for ${symbol} from ${startDate} to ${endDate}`);
  }

  return convertBarsToOhlcv(bars);
}

// ============================================
// Signal Generation
// ============================================

/**
 * Convert OHLCV rows to Candle format for @cream/indicators.
 */
function ohlcvToCandles(ohlcv: OhlcvRow[]): Candle[] {
  return ohlcv.map((row) => ({
    timestamp: new Date(row.timestamp).getTime(),
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume,
  }));
}

/**
 * Generate signals using SMA crossover strategy.
 */
function generateSMACrossoverSignals(
  ohlcv: OhlcvRow[],
  config: z.infer<typeof SMACrossoverConfigSchema>
): SignalRow[] {
  const candles = ohlcvToCandles(ohlcv);
  const fastSMA = calculateSMA(candles, { period: config.fastPeriod });
  const slowSMA = calculateSMA(candles, { period: config.slowPeriod });
  const warmup = Math.max(config.fastPeriod, config.slowPeriod);

  // Offset between fast and slow SMA arrays
  const fastOffset = config.fastPeriod - 1;
  const slowOffset = config.slowPeriod - 1;

  return ohlcv.map((row, i) => {
    if (i < warmup || i === 0) {
      return { timestamp: row.timestamp, entries: false, exits: false };
    }

    // Get aligned indices
    const fastIdx = i - fastOffset;
    const slowIdx = i - slowOffset;

    const currFast = fastSMA[fastIdx]?.ma;
    const prevFast = fastSMA[fastIdx - 1]?.ma;
    const currSlow = slowSMA[slowIdx]?.ma;
    const prevSlow = slowSMA[slowIdx - 1]?.ma;

    if (
      currFast === undefined ||
      prevFast === undefined ||
      currSlow === undefined ||
      prevSlow === undefined
    ) {
      return { timestamp: row.timestamp, entries: false, exits: false };
    }

    const entry = isGoldenCross(prevFast, prevSlow, currFast, currSlow);
    const exit = isDeathCross(prevFast, prevSlow, currFast, currSlow);

    return { timestamp: row.timestamp, entries: entry, exits: exit };
  });
}

/**
 * Generate signals using RSI oversold/overbought strategy.
 */
function generateRSISignals(
  ohlcv: OhlcvRow[],
  config: z.infer<typeof RSIConfigSchema>
): SignalRow[] {
  const candles = ohlcvToCandles(ohlcv);
  const rsiValues = calculateRSI(candles, { period: config.period });
  const warmup = config.period + 1;

  let inPosition = false;

  return ohlcv.map((row, i) => {
    if (i < warmup) {
      return { timestamp: row.timestamp, entries: false, exits: false };
    }

    const rsi = rsiValues[i];
    const prevRsi = rsiValues[i - 1];
    let entry = false;
    let exit = false;

    if (rsi && prevRsi) {
      // Entry: RSI crosses up from oversold
      if (!inPosition && prevRsi.rsi <= config.oversold && rsi.rsi > config.oversold) {
        entry = true;
        inPosition = true;
      }
      // Exit: RSI reaches overbought
      if (inPosition && rsi.rsi >= config.overbought) {
        exit = true;
        inPosition = false;
      }
    }

    return { timestamp: row.timestamp, entries: entry, exits: exit };
  });
}

/**
 * Generate signals using Bollinger Bands breakout strategy.
 */
function generateBollingerSignals(
  ohlcv: OhlcvRow[],
  config: z.infer<typeof BollingerBreakoutConfigSchema>
): SignalRow[] {
  const candles = ohlcvToCandles(ohlcv);
  const bbValues = calculateBollingerBands(candles, {
    period: config.period,
    stdDev: config.stdDev,
  });
  const warmup = config.period;

  let inPosition = false;

  return ohlcv.map((row, i) => {
    if (i < warmup) {
      return { timestamp: row.timestamp, entries: false, exits: false };
    }

    const bb = bbValues[i];
    let entry = false;
    let exit = false;

    if (bb) {
      // Entry: Price breaks above upper band (momentum breakout)
      if (!inPosition && row.close > bb.upper) {
        entry = true;
        inPosition = true;
      }
      // Exit: Price touches lower band (take profit or stop)
      if (inPosition && row.close <= bb.lower) {
        exit = true;
        inPosition = false;
      }
    }

    return { timestamp: row.timestamp, entries: entry, exits: exit };
  });
}

/**
 * Calculate signal line for MACD (EMA of MACD line).
 */
function calculateMACDSignalLine(
  macdValues: Array<{ timestamp: number; macd: number }>,
  signalPeriod: number
): Array<{ timestamp: number; signal: number }> {
  if (macdValues.length < signalPeriod) {
    return [];
  }

  const multiplier = 2 / (signalPeriod + 1);

  // Seed with SMA of first signalPeriod values
  let sum = 0;
  for (let i = 0; i < signalPeriod; i++) {
    sum += macdValues[i]?.macd ?? 0;
  }
  let signal = sum / signalPeriod;

  const results: Array<{ timestamp: number; signal: number }> = [
    { timestamp: macdValues[signalPeriod - 1]?.timestamp ?? 0, signal },
  ];

  // Calculate remaining EMA values
  for (let i = signalPeriod; i < macdValues.length; i++) {
    const macd = macdValues[i]?.macd ?? 0;
    signal = (macd - signal) * multiplier + signal;
    results.push({ timestamp: macdValues[i]?.timestamp ?? 0, signal });
  }

  return results;
}

/**
 * Generate signals using MACD crossover strategy.
 */
function generateMACDSignals(
  ohlcv: OhlcvRow[],
  config: z.infer<typeof MACDCrossoverConfigSchema>
): SignalRow[] {
  const candles = ohlcvToCandles(ohlcv);
  const macdValues = calculateMACD(candles, config.fastPeriod, config.slowPeriod);
  const signalLine = calculateMACDSignalLine(macdValues, config.signalPeriod);

  const warmup = config.slowPeriod + config.signalPeriod;

  return ohlcv.map((row, i) => {
    if (i < warmup || i === 0) {
      return { timestamp: row.timestamp, entries: false, exits: false };
    }

    // Offset to align with MACD array
    const macdOffset = config.slowPeriod - 1;
    const signalOffset = config.signalPeriod - 1;
    const macdIdx = i - macdOffset;
    const signalIdx = macdIdx - signalOffset;

    if (macdIdx < 1 || signalIdx < 1) {
      return { timestamp: row.timestamp, entries: false, exits: false };
    }

    const currMacd = macdValues[macdIdx]?.macd;
    const prevMacd = macdValues[macdIdx - 1]?.macd;
    const currSignal = signalLine[signalIdx]?.signal;
    const prevSignal = signalLine[signalIdx - 1]?.signal;

    if (
      currMacd === undefined ||
      prevMacd === undefined ||
      currSignal === undefined ||
      prevSignal === undefined
    ) {
      return { timestamp: row.timestamp, entries: false, exits: false };
    }

    let entry = false;
    let exit = false;

    // Entry: MACD crosses above signal line
    if (prevMacd <= prevSignal && currMacd > currSignal) {
      entry = true;
    }
    // Exit: MACD crosses below signal line
    if (prevMacd >= prevSignal && currMacd < currSignal) {
      exit = true;
    }

    return { timestamp: row.timestamp, entries: entry, exits: exit };
  });
}

/**
 * Parse strategy config from backtest config.
 * Falls back to SMA crossover with defaults if not specified.
 */
function parseStrategyConfig(config: Record<string, unknown> | undefined): StrategyConfig {
  if (!config?.strategy) {
    // Default strategy
    return { type: "sma_crossover", fastPeriod: 10, slowPeriod: 30 };
  }

  const result = StrategyConfigSchema.safeParse(config.strategy);
  if (result.success) {
    return result.data;
  }

  // Fall back to default if invalid
  return { type: "sma_crossover", fastPeriod: 10, slowPeriod: 30 };
}

/**
 * Generate trading signals based on strategy configuration.
 */
function generateSignals(ohlcv: OhlcvRow[], strategy: StrategyConfig): SignalRow[] {
  switch (strategy.type) {
    case "sma_crossover":
      return generateSMACrossoverSignals(ohlcv, strategy);
    case "rsi_oversold_overbought":
      return generateRSISignals(ohlcv, strategy);
    case "bollinger_breakout":
      return generateBollingerSignals(ohlcv, strategy);
    case "macd_crossover":
      return generateMACDSignals(ohlcv, strategy);
  }
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
  const client = createAlpacaClientFromEnv();

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
 * @returns Path to the generated signals Parquet file
 */
export async function prepareSignals(backtest: Backtest): Promise<string> {
  const client = createAlpacaClientFromEnv();

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

  // Parse strategy from config
  const strategy = parseStrategyConfig(backtest.config);

  // Generate signals using configured strategy
  const signals = generateSignals(ohlcv, strategy);

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
