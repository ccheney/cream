/**
 * OptionsCalculatorAdapter
 *
 * Wraps all options-based calculators (IV Skew, Term Structure, VRP,
 * Put/Call Ratio, Greeks Aggregator) into a unified interface for
 * the IndicatorService.
 *
 * Implements the OptionsCalculator interface expected by IndicatorService.
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

import {
  aggregateGreeks,
  calculateAggregatedPutCallRatio,
  calculateATMIV,
  calculateIVSkew,
  calculateTermStructureSlope,
  calculateVRP,
  type OptionPosition,
  type OptionsChain,
} from "../calculators/options";
import { createEmptyOptionsIndicators, type OHLCVBar, type OptionsIndicators } from "../types";
import type { OptionsCalculator } from "./indicator-service";

/**
 * Input data for options calculations.
 *
 * Provides all necessary options market data for computing
 * options-derived indicators.
 */
export interface OptionsCalculatorInput {
  /** Options chains (one per expiration) */
  chains: OptionsChain[];
  /** Current option positions for Greeks aggregation */
  positions?: OptionPosition[];
  /** OHLCV bars for realized volatility (VRP calculation) */
  bars: OHLCVBar[];
}

/**
 * Default implementation of OptionsCalculator.
 *
 * Calculates all options-based technical indicators from options chains
 * and position data.
 */
export class OptionsCalculatorAdapter implements OptionsCalculator {
  /**
   * Calculate all options-based indicators.
   *
   * @param chains - Options chains (one per expiration)
   * @param positions - Current option positions for Greeks
   * @param bars - OHLCV bars for realized volatility
   * @returns OptionsIndicators object with all calculated values
   *
   * @example
   * ```typescript
   * const adapter = new OptionsCalculatorAdapter();
   * const chains = await optionsData.getChains("AAPL");
   * const positions = await portfolio.getOptionsPositions("AAPL");
   * const bars = await marketData.getBars("AAPL", 30);
   * const indicators = adapter.calculate(chains, positions, bars);
   * console.log(indicators.iv_skew_25d); // 0.03
   * ```
   */
  calculate(
    chains: OptionsChain[],
    positions: OptionPosition[],
    bars: OHLCVBar[]
  ): OptionsIndicators {
    if (chains.length === 0) {
      return createEmptyOptionsIndicators();
    }

    // Find front-month chain (closest expiration)
    const sortedChains = [...chains].sort((a, b) => {
      return new Date(a.expiration).getTime() - new Date(b.expiration).getTime();
    });
    const frontChain = sortedChains[0];

    // Calculate ATM IV from front-month
    const atmIV = frontChain ? calculateATMIV(frontChain) : null;

    // Calculate IV Skew
    const skewResult = frontChain ? calculateIVSkew(frontChain, 0.25) : null;

    // Calculate Put/Call Ratio
    const pcrResult = calculateAggregatedPutCallRatio(chains);

    // Calculate Term Structure
    const termStructure = calculateTermStructureSlope(chains);

    // Calculate VRP (IV - Realized Vol)
    const vrpResult = atmIV !== null ? calculateVRP(atmIV, bars, 20) : null;

    // Aggregate Greeks if positions provided
    const greeksResult = positions.length > 0 ? aggregateGreeks(positions) : null;

    return {
      // Implied Volatility
      atm_iv: atmIV,

      // IV Skew
      iv_skew_25d: skewResult?.skew ?? null,
      iv_put_25d: skewResult?.putIV ?? null,
      iv_call_25d: skewResult?.callIV ?? null,

      // Put/Call Ratio
      put_call_ratio_volume: pcrResult?.volumeRatio ?? null,
      put_call_ratio_oi: pcrResult?.openInterestRatio ?? null,

      // Term Structure
      term_structure_slope: termStructure?.slope ?? null,
      front_month_iv: termStructure?.frontIV ?? null,
      back_month_iv: termStructure?.backIV ?? null,

      // VRP
      vrp: vrpResult?.vrp ?? null,
      realized_vol_20d: vrpResult?.realizedVolatility ?? null,

      // Greeks
      net_delta: greeksResult?.netDelta ?? null,
      net_gamma: greeksResult?.netGamma ?? null,
      net_theta: greeksResult?.netTheta ?? null,
      net_vega: greeksResult?.netVega ?? null,
    };
  }
}

/**
 * Factory function to create an OptionsCalculatorAdapter instance.
 */
export function createOptionsCalculator(): OptionsCalculator {
  return new OptionsCalculatorAdapter();
}
