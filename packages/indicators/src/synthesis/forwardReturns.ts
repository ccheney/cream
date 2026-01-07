/**
 * Forward Returns Calculator
 *
 * Calculates forward returns for paper trading outcome recording.
 * Uses closing prices from the marketdata package.
 *
 * @see docs/plans/19-dynamic-indicator-synthesis.md (lines 955-1000)
 */

import { addTradingDays } from "./signalRecorder.js";

// ============================================
// Types
// ============================================

/**
 * Price data provider interface for fetching historical prices.
 * Can be implemented using marketdata package or mocked for testing.
 */
export interface PriceProvider {
  /**
   * Get closing price for a symbol on a specific date.
   *
   * @param symbol - Ticker symbol
   * @param date - Date (YYYY-MM-DD)
   * @returns Closing price or null if unavailable
   */
  getClosingPrice(symbol: string, date: string): Promise<number | null>;

  /**
   * Get closing prices for multiple symbols on a specific date.
   *
   * @param symbols - Array of ticker symbols
   * @param date - Date (YYYY-MM-DD)
   * @returns Map of symbol to closing price
   */
  getClosingPrices(symbols: string[], date: string): Promise<Map<string, number>>;
}

/**
 * Forward return result
 */
export interface ForwardReturn {
  symbol: string;
  startPrice: number;
  endPrice: number;
  return: number;
  startDate: string;
  endDate: string;
}

/**
 * Forward returns calculation config
 */
export interface ForwardReturnsConfig {
  /** Horizon in trading days (default: 5) */
  horizonDays?: number;
  /** Minimum required prices to calculate (default: 0.8 = 80%) */
  minCoverageRatio?: number;
}

// ============================================
// Constants
// ============================================

const DEFAULT_HORIZON_DAYS = 5;
const DEFAULT_MIN_COVERAGE = 0.8;

// ============================================
// Implementation
// ============================================

/**
 * Calculate forward returns for a set of symbols.
 *
 * Forward return = (price at T+horizon - price at T) / price at T
 *
 * @param priceProvider - Price data provider
 * @param symbols - Symbols to calculate returns for
 * @param signalDate - The date signals were generated (T)
 * @param config - Configuration options
 * @returns Map of symbol to forward return
 *
 * @example
 * ```typescript
 * const provider = createMarketdataProvider();
 * const returns = await calculateForwardReturns(
 *   provider,
 *   ["AAPL", "MSFT", "GOOGL"],
 *   "2024-01-15",
 *   { horizonDays: 5 }
 * );
 *
 * for (const [symbol, ret] of returns) {
 *   console.log(`${symbol}: ${(ret * 100).toFixed(2)}%`);
 * }
 * ```
 */
export async function calculateForwardReturns(
  priceProvider: PriceProvider,
  symbols: string[],
  signalDate: string,
  config: ForwardReturnsConfig = {}
): Promise<Map<string, number>> {
  const { horizonDays = DEFAULT_HORIZON_DAYS } = config;

  const returns = new Map<string, number>();

  if (symbols.length === 0) {
    return returns;
  }

  // Calculate the end date
  const endDate = addTradingDays(signalDate, horizonDays);

  // Fetch prices for both dates
  const [startPrices, endPrices] = await Promise.all([
    priceProvider.getClosingPrices(symbols, signalDate),
    priceProvider.getClosingPrices(symbols, endDate),
  ]);

  // Calculate returns for each symbol
  for (const symbol of symbols) {
    const startPrice = startPrices.get(symbol);
    const endPrice = endPrices.get(symbol);

    if (startPrice && endPrice && startPrice > 0) {
      const forwardReturn = (endPrice - startPrice) / startPrice;
      returns.set(symbol, forwardReturn);
    }
  }

  return returns;
}

/**
 * Calculate forward returns with detailed results.
 *
 * @param priceProvider - Price data provider
 * @param symbols - Symbols to calculate returns for
 * @param signalDate - The date signals were generated (T)
 * @param config - Configuration options
 * @returns Array of detailed forward return results
 */
export async function calculateForwardReturnsDetailed(
  priceProvider: PriceProvider,
  symbols: string[],
  signalDate: string,
  config: ForwardReturnsConfig = {}
): Promise<ForwardReturn[]> {
  const { horizonDays = DEFAULT_HORIZON_DAYS } = config;

  const results: ForwardReturn[] = [];

  if (symbols.length === 0) {
    return results;
  }

  const endDate = addTradingDays(signalDate, horizonDays);

  const [startPrices, endPrices] = await Promise.all([
    priceProvider.getClosingPrices(symbols, signalDate),
    priceProvider.getClosingPrices(symbols, endDate),
  ]);

  for (const symbol of symbols) {
    const startPrice = startPrices.get(symbol);
    const endPrice = endPrices.get(symbol);

    if (startPrice && endPrice && startPrice > 0) {
      results.push({
        symbol,
        startPrice,
        endPrice,
        return: (endPrice - startPrice) / startPrice,
        startDate: signalDate,
        endDate,
      });
    }
  }

  return results;
}

/**
 * Validate that sufficient price data is available for forward return calculation.
 *
 * @param priceProvider - Price data provider
 * @param symbols - Symbols to validate
 * @param signalDate - Signal date
 * @param config - Configuration options
 * @returns Validation result
 */
export async function validatePriceCoverage(
  priceProvider: PriceProvider,
  symbols: string[],
  signalDate: string,
  config: ForwardReturnsConfig = {}
): Promise<{
  isValid: boolean;
  coverage: number;
  missingStart: string[];
  missingEnd: string[];
}> {
  const { horizonDays = DEFAULT_HORIZON_DAYS, minCoverageRatio = DEFAULT_MIN_COVERAGE } = config;

  if (symbols.length === 0) {
    return { isValid: true, coverage: 1, missingStart: [], missingEnd: [] };
  }

  const endDate = addTradingDays(signalDate, horizonDays);

  const [startPrices, endPrices] = await Promise.all([
    priceProvider.getClosingPrices(symbols, signalDate),
    priceProvider.getClosingPrices(symbols, endDate),
  ]);

  const missingStart = symbols.filter((s) => !startPrices.has(s));
  const missingEnd = symbols.filter((s) => !endPrices.has(s));

  // Count symbols with both prices available
  let validCount = 0;
  for (const symbol of symbols) {
    if (startPrices.has(symbol) && endPrices.has(symbol)) {
      validCount++;
    }
  }

  const coverage = validCount / symbols.length;

  return {
    isValid: coverage >= minCoverageRatio,
    coverage,
    missingStart,
    missingEnd,
  };
}
