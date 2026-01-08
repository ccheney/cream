/**
 * Market Snapshot Builder Workflow Step
 *
 * Gathers and assembles market data, indicators, positions, and regime classification
 * into a complete MarketSnapshot for the trading cycle.
 *
 * Responsibilities:
 * 1. Fetch current market data (quotes, candles) from providers
 * 2. Calculate technical indicators for all timeframes
 * 3. Classify current market regime
 * 4. Retrieve current broker positions
 * 5. Assemble into MarketSnapshot schema
 *
 * @see docs/plans/01-architecture.md (Observe phase)
 * @see docs/plans/02-data-layer.md (Data providers)
 * @see docs/plans/11-configuration.md (Indicators & regime)
 */

import type { Position } from "@cream/broker";
import {
  env,
  type MarketSnapshot,
  type MarketStatus,
  type Regime,
  type SymbolSnapshot,
  type UniverseConfig,
} from "@cream/domain";
import { createExecutionClient, type ExecutionServiceClient } from "@cream/domain/grpc";
import type { Candle } from "@cream/indicators";
import { createPolygonClientFromEnv, type PolygonClient, type Snapshot } from "@cream/marketdata";
import { classifyRegime, DEFAULT_RULE_BASED_CONFIG, getRequiredCandleCount } from "@cream/regime";
import { resolveUniverseSymbols as resolveUniverseSymbolsFromConfig } from "@cream/universe";

// ============================================
// Types
// ============================================

/**
 * Input for the market snapshot builder workflow step.
 */
export interface SnapshotBuilderInput {
  /** Timestamp for the snapshot (defaults to now) */
  asOf?: string;
  /** Universe symbols to include (if not provided, resolves from config) */
  symbols?: string[];
  /** Include option chains */
  includeOptions?: boolean;
}

/**
 * Result of the snapshot builder operation.
 */
export interface SnapshotBuilderResult {
  success: boolean;
  /** Complete market snapshot */
  snapshot?: MarketSnapshot;
  /** Performance metrics */
  metrics: {
    marketDataFetchMs: number;
    indicatorCalculationMs: number;
    regimeClassificationMs: number;
    positionFetchMs: number;
    totalMs: number;
  };
  /** Number of symbols processed */
  symbolCount: number;
  /** Errors encountered */
  errors: string[];
  /** Warnings */
  warnings: string[];
}

/**
 * Intermediate data structure for building snapshot.
 */
interface SnapshotData {
  marketSnapshots: Map<string, Snapshot>;
  positions: Position[];
  regime: Regime;
  /** Historical candles for indicators (keyed by symbol) */
  historicalCandles: Map<string, Candle[]>;
}

// ============================================
// Configuration
// ============================================

/**
 * Default configuration for snapshot builder.
 */
export const DEFAULT_SNAPSHOT_CONFIG = {
  /** Bar timeframes to fetch (in minutes) */
  barTimeframes: [60], // 1-hour candles for hourly cycle
  /** Number of historical bars to fetch per timeframe */
  historicalBars: 100, // Enough for 100-period indicators
  /** Request timeout in milliseconds */
  timeoutMs: 30000,
  /** Concurrent symbol fetch limit */
  concurrency: 10,
};

/**
 * Performance targets (milliseconds).
 */
export const PERFORMANCE_TARGETS = {
  marketDataFetchMs: 5000, // 5 seconds for all symbols
  indicatorCalculationMs: 1000, // 1 second for all indicators
  regimeClassificationMs: 100, // 100ms for regime
  totalMs: 10000, // 10 seconds total
};

/**
 * gRPC execution engine configuration.
 */
const GRPC_CONFIG = {
  /** gRPC server URL (from env or default) */
  baseUrl: process.env.EXECUTION_ENGINE_URL ?? "http://localhost:50051",
  /** Connection timeout */
  timeoutMs: 5000,
  /** Max retries */
  maxRetries: 2,
};

// ============================================
// Main Workflow Step
// ============================================

/**
 * Execute the market snapshot builder workflow step.
 *
 * Orchestrates data gathering from multiple sources:
 * 1. Resolves trading universe (symbols to track)
 * 2. Fetches market data (quotes, candles) from Polygon
 * 3. Calculates technical indicators for all symbols
 * 4. Classifies current market regime
 * 5. Retrieves current positions from broker
 * 6. Assembles into MarketSnapshot schema
 *
 * @param input - Snapshot builder input
 * @returns Snapshot builder result with complete market snapshot
 */
export async function executeMarketSnapshotBuilder(
  input: SnapshotBuilderInput
): Promise<SnapshotBuilderResult> {
  const startTime = performance.now();
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    // Phase 1: Resolve universe
    const symbols = input.symbols ?? (await resolveUniverseSymbols());
    if (symbols.length === 0) {
      return {
        success: false,
        metrics: createEmptyMetrics(startTime),
        symbolCount: 0,
        errors: ["No symbols in trading universe"],
        warnings,
      };
    }

    // Phase 2: Gather data from all sources
    const snapshotData = await gatherSnapshotData(symbols, input, errors, warnings);

    // Phase 3: Build symbol snapshots
    const symbolSnapshots: SymbolSnapshot[] = [];
    for (const symbol of symbols) {
      try {
        const symbolSnapshot = await buildSymbolSnapshot(symbol, snapshotData, input);
        symbolSnapshots.push(symbolSnapshot);
      } catch (error) {
        errors.push(`Failed to build snapshot for ${symbol}: ${formatError(error)}`);
      }
    }

    if (symbolSnapshots.length === 0) {
      return {
        success: false,
        metrics: createEmptyMetrics(startTime),
        symbolCount: symbols.length,
        errors: ["Failed to build snapshots for all symbols"],
        warnings,
      };
    }

    // Phase 4: Assemble final market snapshot
    const asOf = input.asOf ?? new Date().toISOString();
    const environment = env.CREAM_ENV;
    const marketStatus = determineMarketStatus();

    const snapshot: MarketSnapshot = {
      environment,
      asOf,
      marketStatus,
      regime: snapshotData.regime,
      symbols: symbolSnapshots,
    };

    const totalMs = performance.now() - startTime;

    return {
      success: true,
      snapshot,
      metrics: {
        marketDataFetchMs: 0, // Will be populated during implementation
        indicatorCalculationMs: 0,
        regimeClassificationMs: 0,
        positionFetchMs: 0,
        totalMs,
      },
      symbolCount: symbolSnapshots.length,
      errors,
      warnings,
    };
  } catch (error) {
    const _totalMs = performance.now() - startTime;
    return {
      success: false,
      metrics: createEmptyMetrics(startTime),
      symbolCount: 0,
      errors: [`Fatal error: ${formatError(error)}`],
      warnings,
    };
  }
}

// ============================================
// Data Gathering
// ============================================

/**
 * Gather all required data for snapshot building.
 */
async function gatherSnapshotData(
  symbols: string[],
  input: SnapshotBuilderInput,
  errors: string[],
  warnings: string[]
): Promise<SnapshotData> {
  // Create Polygon client for market data
  let polygonClient: PolygonClient | null = null;
  const creamEnv = "CREAM_ENV" in process.env ? process.env.CREAM_ENV : env.CREAM_ENV;
  const polygonKey = "POLYGON_KEY" in process.env ? process.env.POLYGON_KEY : env.POLYGON_KEY;

  if (creamEnv !== "BACKTEST" || polygonKey) {
    try {
      polygonClient = createPolygonClientFromEnv();
    } catch (error) {
      warnings.push(`Could not create Polygon client: ${formatError(error)}`);
    }
  }

  // Fetch market data for all symbols
  const marketSnapshots = await fetchMarketData(symbols, input, errors, warnings);

  // Fetch historical candles for regime classification and indicators
  const historicalCandles = await fetchHistoricalCandles(symbols, polygonClient, errors, warnings);

  // Fetch current positions from broker
  const positions = await fetchPositions(errors, warnings);

  // Classify regime based on market leader (SPY)
  const regime = await classifyMarketRegime(historicalCandles, errors, warnings);

  return {
    marketSnapshots,
    positions,
    regime,
    historicalCandles,
  };
}

/**
 * Fetch market data snapshots from Polygon.
 */
async function fetchMarketData(
  symbols: string[],
  _input: SnapshotBuilderInput,
  errors: string[],
  warnings: string[]
): Promise<Map<string, Snapshot>> {
  const snapshots = new Map<string, Snapshot>();

  try {
    // In BACKTEST mode without API keys, use mock data
    // Note: We read process.env directly here (not cached env) to support test isolation
    // Use 'in' operator to check if env var was explicitly set (even to empty string)
    const creamEnv = "CREAM_ENV" in process.env ? process.env.CREAM_ENV : env.CREAM_ENV;
    const polygonKey = "POLYGON_KEY" in process.env ? process.env.POLYGON_KEY : env.POLYGON_KEY;
    if (creamEnv === "BACKTEST" && !polygonKey) {
      warnings.push("BACKTEST mode without POLYGON_KEY: using mock market data");

      // Generate mock snapshots for testing
      for (const symbol of symbols) {
        snapshots.set(symbol, createMockSnapshot(symbol));
      }

      return snapshots;
    }

    const client = createPolygonClientFromEnv();

    // Fetch snapshots in batches for efficiency
    const batches = chunkArray(symbols, DEFAULT_SNAPSHOT_CONFIG.concurrency);

    for (const batch of batches) {
      const results = await Promise.allSettled(
        batch.map(async (symbol) => {
          const snapshot = await client.getSnapshot(symbol);
          return { symbol, snapshot };
        })
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          snapshots.set(result.value.symbol, result.value.snapshot);
        } else {
          errors.push(
            `Failed to fetch snapshot for ${result.status === "rejected" ? "symbol" : result.value.symbol}: ${result.reason}`
          );
        }
      }
    }
  } catch (error) {
    errors.push(`Market data fetch error: ${formatError(error)}`);
  }

  return snapshots;
}

/**
 * Create a mock snapshot for testing.
 */
function createMockSnapshot(symbol: string): Snapshot {
  const basePrice = 150.0 + Math.random() * 50;
  const now = Date.now();

  return {
    symbol,
    lastTrade: {
      price: basePrice,
      size: 100,
      timestamp: now,
      exchange: "Q",
    },
    lastQuote: {
      bid: basePrice - 0.05,
      ask: basePrice + 0.05,
      bidSize: 1000,
      askSize: 800,
      timestamp: now,
    },
    volume: 5000000,
    dayHigh: basePrice + 2.0,
    dayLow: basePrice - 2.0,
    prevClose: basePrice - 0.5,
    open: basePrice - 0.3,
  };
}

/**
 * Fetch historical candles for all symbols.
 */
async function fetchHistoricalCandles(
  symbols: string[],
  polygonClient: PolygonClient | null,
  errors: string[],
  warnings: string[]
): Promise<Map<string, Candle[]>> {
  const candles = new Map<string, Candle[]>();
  const requiredBars = getRequiredCandleCount(DEFAULT_RULE_BASED_CONFIG) + 10; // Extra buffer

  // If no client available, return mock candles in BACKTEST mode
  if (!polygonClient) {
    warnings.push("Using mock historical candles (no Polygon client available)");
    for (const symbol of symbols) {
      candles.set(symbol, createMockCandles(symbol, requiredBars));
    }
    return candles;
  }

  // Calculate date range (fetch last ~60 trading days for hourly bars)
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 90); // ~60 trading days

  const toStr = to.toISOString().split("T")[0];
  const fromStr = from.toISOString().split("T")[0];

  // Fetch candles in batches
  const batches = chunkArray(symbols, DEFAULT_SNAPSHOT_CONFIG.concurrency);

  for (const batch of batches) {
    const results = await Promise.allSettled(
      batch.map(async (symbol) => {
        const response = await polygonClient.getAggregates(symbol, 1, "hour", fromStr, toStr, {
          limit: requiredBars,
          sort: "desc",
        });

        const bars = response.results ?? [];
        // Convert to Candle format and reverse to oldest-first
        const symbolCandles: Candle[] = bars
          .map((bar) => ({
            timestamp: bar.t,
            open: bar.o,
            high: bar.h,
            low: bar.l,
            close: bar.c,
            volume: bar.v,
          }))
          .reverse();

        return { symbol, candles: symbolCandles };
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        candles.set(result.value.symbol, result.value.candles);
      } else {
        errors.push(`Failed to fetch candles for symbol: ${result.reason}`);
      }
    }
  }

  return candles;
}

/**
 * Create mock candles for testing.
 */
function createMockCandles(_symbol: string, count: number): Candle[] {
  const candles: Candle[] = [];
  let basePrice = 150.0 + Math.random() * 50;
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;

  for (let i = count - 1; i >= 0; i--) {
    const volatility = 0.01 + Math.random() * 0.02;
    const change = (Math.random() - 0.5) * volatility * basePrice;
    const open = basePrice;
    const close = basePrice + change;
    const high = Math.max(open, close) * (1 + Math.random() * volatility);
    const low = Math.min(open, close) * (1 - Math.random() * volatility);

    candles.push({
      timestamp: now - i * hourMs,
      open,
      high,
      low,
      close,
      volume: Math.floor(100000 + Math.random() * 500000),
    });

    basePrice = close;
  }

  return candles;
}

/**
 * Singleton gRPC client (lazy-initialized).
 */
let executionClient: ExecutionServiceClient | null = null;

/**
 * Get or create the execution gRPC client.
 */
function getExecutionClient(): ExecutionServiceClient {
  if (!executionClient) {
    executionClient = createExecutionClient(GRPC_CONFIG.baseUrl, {
      timeoutMs: GRPC_CONFIG.timeoutMs,
      maxRetries: GRPC_CONFIG.maxRetries,
    });
  }
  return executionClient;
}

/**
 * Fetch current positions from broker via gRPC.
 */
async function fetchPositions(errors: string[], warnings: string[]): Promise<Position[]> {
  try {
    // In BACKTEST mode, positions come from backtest state
    const environment = env.CREAM_ENV;

    if (environment === "BACKTEST") {
      warnings.push("Backtest mode: positions not fetched from broker");
      return [];
    }

    // Fetch from execution engine gRPC
    const client = getExecutionClient();
    const result = await client.getPositions({});

    // Convert gRPC Position to broker Position
    const positions: Position[] = result.data.positions.map((p) => ({
      symbol: p.instrument?.symbol ?? "",
      qty: p.quantity,
      side: p.quantity >= 0 ? "long" : "short",
      avgEntryPrice: p.avgEntryPrice,
      marketValue: p.marketValue,
      costBasis: p.costBasis,
      unrealizedPl: p.unrealizedPnl,
      unrealizedPlpc: p.unrealizedPnlPct,
      currentPrice: p.marketValue / Math.abs(p.quantity || 1),
      lastdayPrice: 0, // Not available from gRPC
      changeToday: 0, // Not available from gRPC
    }));

    return positions;
  } catch (error) {
    // Graceful degradation - return empty positions if gRPC fails
    const errorMsg = formatError(error);
    if (errorMsg.includes("UNAVAILABLE") || errorMsg.includes("connect")) {
      warnings.push(`Execution engine not available: ${errorMsg}`);
    } else {
      errors.push(`Position fetch error: ${errorMsg}`);
    }
    return [];
  }
}

/**
 * Classify current market regime using historical candles.
 */
async function classifyMarketRegime(
  historicalCandles: Map<string, Candle[]>,
  errors: string[],
  warnings: string[]
): Promise<Regime> {
  try {
    // Use SPY as market leader for regime classification
    const spyCandles = historicalCandles.get("SPY");

    if (!spyCandles || spyCandles.length === 0) {
      warnings.push("SPY candles not available for regime classification");
      return "RANGE_BOUND"; // Default regime
    }

    // Check if we have enough data for classification
    const requiredCount = getRequiredCandleCount(DEFAULT_RULE_BASED_CONFIG);
    if (spyCandles.length < requiredCount) {
      warnings.push(
        `Insufficient SPY candles for regime classification: ${spyCandles.length}/${requiredCount}`
      );
      return "RANGE_BOUND";
    }

    // Classify regime using rule-based classifier
    const result = classifyRegime({ candles: spyCandles }, DEFAULT_RULE_BASED_CONFIG);

    // Map regime labels to domain Regime type
    const regimeMap: Record<string, Regime> = {
      BULL_TREND: "BULL_TREND",
      BEAR_TREND: "BEAR_TREND",
      RANGE: "RANGE_BOUND",
      HIGH_VOL: "HIGH_VOL",
      LOW_VOL: "LOW_VOL",
    };

    const regime = regimeMap[result.regime] ?? "RANGE_BOUND";

    return regime;
  } catch (error) {
    errors.push(`Regime classification error: ${formatError(error)}`);
    return "RANGE_BOUND"; // Default fallback
  }
}

// ============================================
// Symbol Snapshot Building
// ============================================

/**
 * Build a complete symbol snapshot with indicators.
 */
async function buildSymbolSnapshot(
  symbol: string,
  data: SnapshotData,
  input: SnapshotBuilderInput
): Promise<SymbolSnapshot> {
  const polygonSnapshot = data.marketSnapshots.get(symbol);

  if (!polygonSnapshot) {
    throw new Error(`No market data available for ${symbol}`);
  }

  // Convert Polygon snapshot to domain Quote schema
  const quote = {
    symbol,
    bid: polygonSnapshot.lastQuote?.bid ?? polygonSnapshot.lastTrade?.price ?? 0,
    ask: polygonSnapshot.lastQuote?.ask ?? polygonSnapshot.lastTrade?.price ?? 0,
    bidSize: polygonSnapshot.lastQuote?.bidSize ?? 0,
    askSize: polygonSnapshot.lastQuote?.askSize ?? 0,
    last: polygonSnapshot.lastTrade?.price ?? 0,
    lastSize: polygonSnapshot.lastTrade?.size ?? 0,
    volume: polygonSnapshot.volume ?? 0,
    timestamp: new Date(polygonSnapshot.lastTrade?.timestamp ?? Date.now()).toISOString(),
  };

  // Get historical candles for this symbol
  const candles = data.historicalCandles.get(symbol) ?? [];

  // Convert candles to bar format for snapshot
  const bars = candles.slice(-DEFAULT_SNAPSHOT_CONFIG.historicalBars).map((candle) => ({
    timestamp: new Date(candle.timestamp).toISOString(),
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
  }));

  const marketStatus = determineMarketStatus();
  const asOf = input.asOf ?? new Date().toISOString();

  return {
    symbol,
    quote,
    bars,
    marketStatus,
    dayHigh: polygonSnapshot.dayHigh ?? quote.last,
    dayLow: polygonSnapshot.dayLow ?? quote.last,
    prevClose: polygonSnapshot.prevClose ?? quote.last,
    open: polygonSnapshot.open ?? quote.last,
    asOf,
  };
}

// ============================================
// Helper Functions
// ============================================

/**
 * Resolve trading universe symbols.
 */
async function resolveUniverseSymbols(): Promise<string[]> {
  try {
    // Create a simple default universe config
    // In production, this would be loaded from config files
    const defaultUniverseConfig: UniverseConfig = {
      sources: [
        {
          type: "static",
          enabled: true,
          tickers: ["SPY", "QQQ", "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "TSLA"],
        },
      ],
    };

    const symbols = await resolveUniverseSymbolsFromConfig(defaultUniverseConfig);
    return symbols;
  } catch (_error) {
    // Fallback to default watchlist
    return ["SPY", "QQQ", "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "TSLA"];
  }
}

/**
 * Determine current market status.
 */
function determineMarketStatus(): MarketStatus {
  const now = new Date();
  const hour = now.getUTCHours();
  const day = now.getUTCDay();

  // Weekend (Saturday = 6, Sunday = 0)
  if (day === 0 || day === 6) {
    return "CLOSED";
  }

  // Convert to ET (UTC-5 or UTC-4 depending on DST)
  // Simple approximation: 14:30-21:00 UTC is 9:30-16:00 ET
  const etHour = hour - 5;

  if (etHour >= 9.5 && etHour < 16) {
    return "OPEN";
  }

  if (etHour >= 4 && etHour < 9.5) {
    return "PRE_MARKET";
  }

  if (etHour >= 16 && etHour < 20) {
    return "AFTER_HOURS";
  }

  return "CLOSED";
}

/**
 * Chunk array into batches.
 */
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Format error for logging.
 */
function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Create empty metrics structure.
 */
function createEmptyMetrics(startTime: number): SnapshotBuilderResult["metrics"] {
  return {
    marketDataFetchMs: 0,
    indicatorCalculationMs: 0,
    regimeClassificationMs: 0,
    positionFetchMs: 0,
    totalMs: performance.now() - startTime,
  };
}

// ============================================
// Convenience Functions
// ============================================

/**
 * Build a snapshot for a specific set of symbols.
 *
 * Convenience wrapper for targeted snapshot building.
 */
export async function buildSnapshotForSymbols(symbols: string[]): Promise<SnapshotBuilderResult> {
  return executeMarketSnapshotBuilder({ symbols });
}

/**
 * Build a snapshot with the default universe.
 *
 * Convenience wrapper for full universe snapshot.
 */
export async function buildSnapshotForUniverse(): Promise<SnapshotBuilderResult> {
  return executeMarketSnapshotBuilder({});
}

/**
 * Build a snapshot at a specific point in time (for backtesting).
 *
 * Convenience wrapper for historical snapshot building.
 */
export async function buildHistoricalSnapshot(
  asOf: string,
  symbols?: string[]
): Promise<SnapshotBuilderResult> {
  return executeMarketSnapshotBuilder({ asOf, symbols });
}
