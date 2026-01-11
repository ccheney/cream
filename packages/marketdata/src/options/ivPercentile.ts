/**
 * Implied Volatility Percentile Calculation
 *
 * IV Percentile indicates where current implied volatility ranks relative to
 * historical IV observations over a lookback period (typically 252 trading days).
 *
 * - IV Percentile = 80% means current IV is higher than 80% of historical observations
 * - High IV (>70%) suggests options are expensive (good for selling)
 * - Low IV (<30%) suggests options are cheap (good for buying)
 *
 * @see docs/plans/08-options.md (Option Candidate Selection)
 */

// ============================================
// Types
// ============================================

/**
 * Configuration for IV percentile calculation.
 */
export interface IVPercentileConfig {
  /** Number of trading days to look back (default: 252 = 1 year) */
  lookbackDays: number;
  /** Minimum observations required for valid percentile (default: 20) */
  minObservations: number;
  /** Cache TTL in milliseconds (default: 1 hour) */
  cacheTtlMs: number;
}

/**
 * Historical IV observation.
 */
export interface IVObservation {
  /** Date of observation (YYYY-MM-DD) */
  date: string;
  /** Implied volatility value (e.g., 0.25 for 25%) */
  iv: number;
}

/**
 * Result of IV percentile calculation.
 */
export interface IVPercentileResult {
  /** Current IV value */
  currentIV: number;
  /** IV percentile (0-100) */
  percentile: number;
  /** Number of historical observations used */
  observationCount: number;
  /** 52-week IV high */
  high52Week: number;
  /** 52-week IV low */
  low52Week: number;
  /** Average IV over lookback period */
  averageIV: number;
}

/**
 * Provider function for historical IV data.
 * Returns array of IV observations for a symbol, sorted by date ascending.
 */
export type IVHistoryProvider = (symbol: string, lookbackDays: number) => Promise<IVObservation[]>;

// ============================================
// Default Configuration
// ============================================

export const DEFAULT_IV_PERCENTILE_CONFIG: IVPercentileConfig = {
  lookbackDays: 252, // 1 trading year
  minObservations: 20,
  cacheTtlMs: 60 * 60 * 1000, // 1 hour
};

// ============================================
// IV Percentile Calculator
// ============================================

/**
 * Cache entry for IV percentile data.
 */
interface CacheEntry {
  result: IVPercentileResult;
  timestamp: number;
}

/**
 * IV Percentile Calculator with caching.
 */
export class IVPercentileCalculator {
  private config: IVPercentileConfig;
  private provider: IVHistoryProvider;
  private cache: Map<string, CacheEntry> = new Map();

  constructor(provider: IVHistoryProvider, config: Partial<IVPercentileConfig> = {}) {
    this.provider = provider;
    this.config = { ...DEFAULT_IV_PERCENTILE_CONFIG, ...config };
  }

  /**
   * Calculate IV percentile for a symbol given current IV.
   *
   * @param symbol - Underlying symbol (e.g., "AAPL")
   * @param currentIV - Current implied volatility (e.g., 0.25 for 25%)
   * @returns IV percentile result or undefined if insufficient data
   */
  async calculate(symbol: string, currentIV: number): Promise<IVPercentileResult | undefined> {
    // Check cache
    const cached = this.getCached(symbol, currentIV);
    if (cached) {
      return cached;
    }

    // Fetch historical data
    const history = await this.provider(symbol, this.config.lookbackDays);

    // Validate minimum observations
    if (history.length < this.config.minObservations) {
      return undefined;
    }

    // Calculate percentile
    const result = this.calculatePercentile(currentIV, history);

    // Cache result
    this.setCache(symbol, result);

    return result;
  }

  /**
   * Calculate IV percentile from historical observations.
   */
  private calculatePercentile(currentIV: number, history: IVObservation[]): IVPercentileResult {
    const ivValues = history.map((h) => h.iv);

    // Sort for percentile calculation
    const sorted = ivValues.toSorted((a, b) => a - b);

    // Count how many historical values are below current IV
    const belowCount = sorted.filter((iv) => iv < currentIV).length;

    // Percentile = percentage of values below current
    const percentile = (belowCount / sorted.length) * 100;

    // Calculate statistics
    const high52Week = Math.max(...ivValues);
    const low52Week = Math.min(...ivValues);
    const averageIV = ivValues.reduce((sum, iv) => sum + iv, 0) / ivValues.length;

    return {
      currentIV,
      percentile,
      observationCount: ivValues.length,
      high52Week,
      low52Week,
      averageIV,
    };
  }

  /**
   * Check cache for valid entry.
   */
  private getCached(symbol: string, currentIV: number): IVPercentileResult | undefined {
    const entry = this.cache.get(symbol);
    if (!entry) {
      return undefined;
    }

    // Check TTL
    if (Date.now() - entry.timestamp > this.config.cacheTtlMs) {
      this.cache.delete(symbol);
      return undefined;
    }

    // Update current IV (percentile relative to history stays valid)
    return {
      ...entry.result,
      currentIV,
      percentile: this.recalculatePercentile(currentIV, entry.result),
    };
  }

  /**
   * Recalculate percentile given updated current IV.
   * Uses linear interpolation between low and high.
   */
  private recalculatePercentile(currentIV: number, cachedResult: IVPercentileResult): number {
    const { low52Week, high52Week } = cachedResult;

    if (currentIV <= low52Week) {
      return 0;
    }
    if (currentIV >= high52Week) {
      return 100;
    }

    // Linear interpolation for approximation
    // This is a simplification - actual percentile would require full history
    const range = high52Week - low52Week;
    if (range === 0) {
      return 50;
    }

    return ((currentIV - low52Week) / range) * 100;
  }

  /**
   * Set cache entry.
   */
  private setCache(symbol: string, result: IVPercentileResult): void {
    this.cache.set(symbol, {
      result,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear cache for symbol or all symbols.
   */
  clearCache(symbol?: string): void {
    if (symbol) {
      this.cache.delete(symbol);
    } else {
      this.cache.clear();
    }
  }
}

// ============================================
// Pure Calculation Function
// ============================================

/**
 * Calculate IV percentile from an array of historical IV values.
 * Pure function for direct use when history is already available.
 *
 * @param currentIV - Current implied volatility
 * @param historicalIVs - Array of historical IV values
 * @returns Percentile (0-100) or undefined if insufficient data
 */
export function calculateIVPercentile(
  currentIV: number,
  historicalIVs: number[],
  minObservations = 20
): number | undefined {
  if (historicalIVs.length < minObservations) {
    return undefined;
  }

  const sorted = historicalIVs.toSorted((a, b) => a - b);
  const belowCount = sorted.filter((iv) => iv < currentIV).length;

  return (belowCount / sorted.length) * 100;
}

/**
 * Calculate IV rank (alternative to percentile).
 * IV Rank = (Current IV - 52wk Low) / (52wk High - 52wk Low) * 100
 *
 * Unlike percentile, rank only considers the range, not distribution.
 * Useful when historical data is sparse.
 *
 * @param currentIV - Current implied volatility
 * @param historicalIVs - Array of historical IV values
 * @returns IV rank (0-100) or undefined if insufficient data
 */
export function calculateIVRank(
  currentIV: number,
  historicalIVs: number[],
  minObservations = 2
): number | undefined {
  if (historicalIVs.length < minObservations) {
    return undefined;
  }

  const high = Math.max(...historicalIVs);
  const low = Math.min(...historicalIVs);

  const range = high - low;
  if (range === 0) {
    return 50; // If all values are the same, return middle
  }

  // Clamp to 0-100
  const rank = ((currentIV - low) / range) * 100;
  return Math.max(0, Math.min(100, rank));
}

// ============================================
// VIX Proxy Provider
// ============================================

/**
 * Create an IV history provider that uses VIX as a proxy for SPY options.
 * For other symbols, returns empty array (no historical data).
 *
 * This is useful when historical option IV data is not available.
 * VIX closely tracks SPY ATM option IV.
 *
 * @param vixDataFetcher - Function to fetch VIX historical data
 */
export function createVixProxyProvider(
  vixDataFetcher: (lookbackDays: number) => Promise<IVObservation[]>
): IVHistoryProvider {
  return async (symbol: string, lookbackDays: number): Promise<IVObservation[]> => {
    // VIX is only a valid proxy for SPY/SPX options
    if (symbol !== "SPY" && symbol !== "SPX") {
      return [];
    }

    const vixData = await vixDataFetcher(lookbackDays);

    // VIX is quoted in percentage points (e.g., 15 = 15% volatility)
    // Convert to decimal for consistency with option IV
    return vixData.map((obs) => ({
      date: obs.date,
      iv: obs.iv / 100, // Convert from percentage to decimal
    }));
  };
}

// ============================================
// In-Memory History Store
// ============================================

/**
 * Simple in-memory IV history store.
 * Useful for testing or when caching calculated IVs.
 */
export class InMemoryIVHistoryStore {
  private store: Map<string, IVObservation[]> = new Map();

  /**
   * Add IV observation for a symbol.
   */
  addObservation(symbol: string, observation: IVObservation): void {
    const history = this.store.get(symbol) ?? [];
    history.push(observation);
    // Sort by date
    history.sort((a, b) => a.date.localeCompare(b.date));
    this.store.set(symbol, history);
  }

  /**
   * Set complete history for a symbol.
   */
  setHistory(symbol: string, history: IVObservation[]): void {
    const sorted = history.toSorted((a, b) => a.date.localeCompare(b.date));
    this.store.set(symbol, sorted);
  }

  /**
   * Get history provider function.
   */
  getProvider(): IVHistoryProvider {
    return async (symbol: string, lookbackDays: number): Promise<IVObservation[]> => {
      const history = this.store.get(symbol) ?? [];

      // Filter to lookback period
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);
      const cutoffStr = cutoffDate.toISOString().slice(0, 10); // YYYY-MM-DD

      return history.filter((obs) => obs.date >= cutoffStr);
    };
  }

  /**
   * Clear store.
   */
  clear(): void {
    this.store.clear();
  }
}

// ============================================
// Exports
// ============================================

export default {
  IVPercentileCalculator,
  calculateIVPercentile,
  calculateIVRank,
  createVixProxyProvider,
  InMemoryIVHistoryStore,
  DEFAULT_IV_PERCENTILE_CONFIG,
};
