/**
 * Put/Call Ratio Calculator
 *
 * The Put/Call Ratio measures the relative trading activity between
 * put options and call options. Used as a contrarian sentiment indicator.
 *
 * Theoretical Foundation:
 * - High ratio (>1): More puts traded, potentially bearish sentiment
 *   - Contrarian view: May signal bottom (excessive fear)
 * - Low ratio (<1): More calls traded, potentially bullish sentiment
 *   - Contrarian view: May signal top (excessive greed)
 *
 * Types:
 * - Volume-based: Put Volume / Call Volume
 * - Open Interest-based: Put OI / Call OI
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

import type { OptionsChain, OptionsContract } from "./iv-skew";

// ============================================================
// TYPES
// ============================================================

export interface PutCallRatioResult {
  /** Volume-based put/call ratio */
  volumeRatio: number | null;
  /** Open interest-based put/call ratio */
  openInterestRatio: number | null;
  /** Total put volume */
  putVolume: number;
  /** Total call volume */
  callVolume: number;
  /** Total put open interest */
  putOpenInterest: number;
  /** Total call open interest */
  callOpenInterest: number;
  /** Expiration used (if single expiration) */
  expiration: string | null;
  /** Timestamp */
  timestamp: number;
}

export interface AggregatedPutCallRatio {
  /** Underlying symbol */
  symbol: string;
  /** Volume-weighted average ratio across expirations */
  volumeRatio: number | null;
  /** OI-weighted average ratio across expirations */
  openInterestRatio: number | null;
  /** Number of expirations included */
  expirationsIncluded: number;
  /** Per-expiration breakdown */
  byExpiration: Array<{
    expiration: string;
    volumeRatio: number | null;
    openInterestRatio: number | null;
  }>;
  /** Timestamp */
  timestamp: number;
}

// ============================================================
// CALCULATORS
// ============================================================

/**
 * Sum volume across contracts
 */
function sumVolume(contracts: OptionsContract[]): number {
  return contracts.reduce((sum, c) => sum + (c.volume ?? 0), 0);
}

/**
 * Sum open interest across contracts
 */
function sumOpenInterest(contracts: OptionsContract[]): number {
  return contracts.reduce((sum, c) => sum + (c.openInterest ?? 0), 0);
}

/**
 * Calculate Put/Call ratio for a single options chain
 *
 * @param chain - Options chain with puts and calls
 * @returns Put/Call ratio result
 *
 * @example
 * ```typescript
 * const chain = {
 *   underlyingSymbol: "AAPL",
 *   underlyingPrice: 175,
 *   expiration: "2024-01-19",
 *   calls: [...],
 *   puts: [...]
 * };
 * const result = calculatePutCallRatio(chain);
 * // result.volumeRatio = 0.85 (more call volume)
 * // result.openInterestRatio = 1.2 (more put OI)
 * ```
 */
export function calculatePutCallRatio(chain: OptionsChain): PutCallRatioResult {
  const putVolume = sumVolume(chain.puts);
  const callVolume = sumVolume(chain.calls);
  const putOpenInterest = sumOpenInterest(chain.puts);
  const callOpenInterest = sumOpenInterest(chain.calls);

  const volumeRatio = callVolume > 0 ? putVolume / callVolume : null;
  const openInterestRatio = callOpenInterest > 0 ? putOpenInterest / callOpenInterest : null;

  return {
    volumeRatio,
    openInterestRatio,
    putVolume,
    callVolume,
    putOpenInterest,
    callOpenInterest,
    expiration: chain.expiration,
    timestamp: Date.now(),
  };
}

/**
 * Calculate aggregated Put/Call ratio across multiple expirations
 *
 * @param chains - Array of options chains
 * @returns Aggregated P/C ratio
 */
export function calculateAggregatedPutCallRatio(
  chains: OptionsChain[]
): AggregatedPutCallRatio | null {
  if (chains.length === 0) {
    return null;
  }

  const symbol = chains[0]?.underlyingSymbol;
  if (!symbol) {
    return null;
  }

  let totalPutVolume = 0;
  let totalCallVolume = 0;
  let totalPutOI = 0;
  let totalCallOI = 0;

  const byExpiration: AggregatedPutCallRatio["byExpiration"] = [];

  for (const chain of chains) {
    const result = calculatePutCallRatio(chain);

    totalPutVolume += result.putVolume;
    totalCallVolume += result.callVolume;
    totalPutOI += result.putOpenInterest;
    totalCallOI += result.callOpenInterest;

    byExpiration.push({
      expiration: chain.expiration,
      volumeRatio: result.volumeRatio,
      openInterestRatio: result.openInterestRatio,
    });
  }

  const volumeRatio = totalCallVolume > 0 ? totalPutVolume / totalCallVolume : null;
  const openInterestRatio = totalCallOI > 0 ? totalPutOI / totalCallOI : null;

  return {
    symbol,
    volumeRatio,
    openInterestRatio,
    expirationsIncluded: chains.length,
    byExpiration,
    timestamp: Date.now(),
  };
}

/**
 * Classify put/call ratio sentiment
 */
export type PCRSentiment =
  | "extreme_bearish"
  | "bearish"
  | "neutral"
  | "bullish"
  | "extreme_bullish";

/**
 * Classify put/call ratio as sentiment indicator
 *
 * Note: This uses the contrarian interpretation:
 * - High P/C (fear) = potential bullish signal
 * - Low P/C (greed) = potential bearish signal
 *
 * Thresholds based on equity options norms:
 *
 * @param ratio - Put/Call ratio
 * @returns Sentiment classification (contrarian interpretation)
 */
export function classifyPCRSentiment(ratio: number): PCRSentiment {
  // Contrarian: high P/C = bullish (too much fear), low P/C = bearish (too much greed)
  if (ratio > 1.5) {
    return "extreme_bullish"; // Extreme fear = buy signal
  }
  if (ratio > 1.0) {
    return "bullish"; // Elevated fear
  }
  if (ratio >= 0.7) {
    return "neutral"; // Normal range
  }
  if (ratio >= 0.5) {
    return "bearish"; // Low fear / complacency
  }
  return "extreme_bearish"; // Extreme complacency = sell signal
}

/**
 * Calculate relative P/C ratio vs historical average
 *
 * @param currentRatio - Current P/C ratio
 * @param historicalAvg - Historical average P/C ratio
 * @returns Ratio relative to history (1.0 = at average)
 */
export function calculateRelativePCR(currentRatio: number, historicalAvg: number): number | null {
  if (historicalAvg <= 0) {
    return null;
  }
  return currentRatio / historicalAvg;
}

/**
 * Check for extreme P/C ratio readings
 *
 * @param ratio - Current P/C ratio
 * @param historicalMean - Historical mean
 * @param historicalStd - Historical standard deviation
 * @param threshold - Number of standard deviations for "extreme" (default: 2)
 * @returns Whether ratio is at extreme level
 */
export function isExtremePCR(
  ratio: number,
  historicalMean: number,
  historicalStd: number,
  threshold = 2
): { isExtreme: boolean; zScore: number; direction: "high" | "low" | "normal" } {
  if (historicalStd <= 0) {
    return { isExtreme: false, zScore: 0, direction: "normal" };
  }

  const zScore = (ratio - historicalMean) / historicalStd;
  const isExtreme = Math.abs(zScore) >= threshold;

  let direction: "high" | "low" | "normal" = "normal";
  if (zScore >= threshold) {
    direction = "high";
  } else if (zScore <= -threshold) {
    direction = "low";
  }

  return { isExtreme, zScore, direction };
}
