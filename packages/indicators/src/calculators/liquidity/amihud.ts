/**
 * Amihud Illiquidity Measure Calculator
 *
 * The Amihud (2002) illiquidity measure captures price impact per unit of trading volume.
 * Higher values indicate less liquid securities where trades have greater price impact.
 *
 * Theoretical Foundation:
 * - Amihud (2002): "Illiquidity and Stock Returns: Cross-Section and Time-Series Effects"
 *   Journal of Financial Markets
 *
 * Formula:
 * ILLIQ = (1/N) * Σ |R_t| / Volume_t
 *
 * Where:
 * - R_t = daily return
 * - Volume_t = daily dollar volume
 * - N = number of trading days
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

import type { OHLCVBar } from "../../types";

export interface AmihudResult {
  /** Amihud illiquidity ratio (higher = less liquid) */
  illiquidity: number;
  /** Number of days used in calculation */
  daysUsed: number;
  /** Average daily dollar volume */
  avgDollarVolume: number;
  /** Timestamp of calculation */
  timestamp: number;
}

/**
 * Calculate Amihud illiquidity measure for a series of bars
 *
 * @param bars - OHLCV bars (oldest first)
 * @param period - Lookback period in days (default: 20)
 * @returns Amihud illiquidity metrics or null if insufficient data
 *
 * @example
 * ```typescript
 * const bars = [...]; // 20+ daily bars
 * const result = calculateAmihud(bars, 20);
 * // result.illiquidity = 0.00001 (low = highly liquid)
 * ```
 */
export function calculateAmihud(bars: OHLCVBar[], period = 20): AmihudResult | null {
  if (bars.length < period + 1) {
    return null;
  }

  const recentBars = bars.slice(-period - 1);
  let sumRatio = 0;
  let validDays = 0;
  let totalDollarVolume = 0;

  for (let i = 1; i < recentBars.length; i++) {
    const current = recentBars[i];
    const previous = recentBars[i - 1];

    if (!current || !previous) continue;
    if (previous.close <= 0 || current.volume <= 0) continue;

    // Calculate daily return
    const dailyReturn = (current.close - previous.close) / previous.close;
    const absReturn = Math.abs(dailyReturn);

    // Calculate dollar volume (using close price as proxy)
    const dollarVolume = current.close * current.volume;

    if (dollarVolume > 0) {
      sumRatio += absReturn / dollarVolume;
      totalDollarVolume += dollarVolume;
      validDays++;
    }
  }

  if (validDays === 0) {
    return null;
  }

  const illiquidity = sumRatio / validDays;
  const avgDollarVolume = totalDollarVolume / validDays;
  const latestBar = bars[bars.length - 1];

  return {
    illiquidity,
    daysUsed: validDays,
    avgDollarVolume,
    timestamp: latestBar?.timestamp ?? Date.now(),
  };
}

/**
 * Classify liquidity based on Amihud illiquidity measure
 *
 * Thresholds are approximate and depend on market/security type:
 * - Highly Liquid: < 1e-10 (large cap, high volume)
 * - Liquid: 1e-10 to 1e-8 (mid cap)
 * - Moderately Liquid: 1e-8 to 1e-6 (small cap)
 * - Illiquid: > 1e-6 (micro cap, thinly traded)
 */
export type LiquidityClass = "highly_liquid" | "liquid" | "moderate" | "illiquid";

export function classifyAmihudLiquidity(illiquidity: number): LiquidityClass {
  if (illiquidity < 1e-10) return "highly_liquid";
  if (illiquidity < 1e-8) return "liquid";
  if (illiquidity < 1e-6) return "moderate";
  return "illiquid";
}
