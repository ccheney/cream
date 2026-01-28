/**
 * LiquidityCalculatorAdapter
 *
 * Wraps all liquidity-based calculators (Bid-Ask Spread, Amihud Illiquidity,
 * VWAP, Turnover Ratio) into a unified interface for the IndicatorService.
 *
 * Implements the LiquidityCalculator interface expected by IndicatorService.
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

import {
	calculateAmihud,
	calculateBidAskSpread,
	calculateTurnover,
	calculateVWAP,
} from "../calculators/liquidity";
import {
	createEmptyLiquidityIndicators,
	type LiquidityIndicators,
	type OHLCVBar,
	type Quote,
} from "../types";
import type { LiquidityCalculator } from "./indicator-service";

/**
 * Default implementation of LiquidityCalculator.
 *
 * Calculates all liquidity indicators from OHLCV bars and quote data.
 */
export class LiquidityCalculatorAdapter implements LiquidityCalculator {
	/**
	 * Calculate all liquidity indicators from market data.
	 *
	 * @param bars - OHLCV bars (oldest first)
	 * @param quote - Current quote with bid/ask prices (optional)
	 * @returns LiquidityIndicators object with all calculated values
	 *
	 * @example
	 * ```typescript
	 * const adapter = new LiquidityCalculatorAdapter();
	 * const bars = await marketData.getBars("AAPL", 200);
	 * const quote = await marketData.getQuote("AAPL");
	 * const indicators = adapter.calculate(bars, quote);
	 * console.log(indicators.bid_ask_spread_pct); // 0.02
	 * ```
	 */
	calculate(bars: OHLCVBar[], quote: Quote | null): LiquidityIndicators {
		if (bars.length === 0) {
			return createEmptyLiquidityIndicators();
		}

		// Calculate bid-ask spread from quote
		const spreadResult = quote ? calculateBidAskSpread(quote) : null;

		// Calculate Amihud illiquidity from bars
		const amihudResult = calculateAmihud(bars, 20);

		// Calculate VWAP from bars
		const vwapResult = calculateVWAP(bars);

		// Calculate turnover/volume ratio from bars
		const turnoverResult = calculateTurnover(bars, 20);

		return {
			// Bid-ask spread
			bid_ask_spread: spreadResult?.spread ?? null,
			bid_ask_spread_pct: spreadResult?.spreadPct ?? null,

			// Amihud illiquidity
			amihud_illiquidity: amihudResult?.illiquidity ?? null,

			// VWAP
			vwap: vwapResult?.vwap ?? null,

			// Turnover ratio (volume vs average)
			turnover_ratio: turnoverResult
				? this.calculateTurnoverRatio(bars, turnoverResult.avgVolume)
				: null,

			// Volume ratio
			volume_ratio: turnoverResult?.volumeRatio ?? null,
		};
	}

	/**
	 * Calculate turnover ratio as percentage of shares outstanding.
	 *
	 * Since shares outstanding isn't available in OHLCV data, we use
	 * current volume divided by average volume as a proxy metric.
	 *
	 * @param bars - OHLCV bars
	 * @param avgVolume - Average volume over lookback period
	 * @returns Normalized turnover ratio (0-1 scale) or null
	 */
	private calculateTurnoverRatio(bars: OHLCVBar[], avgVolume: number): number | null {
		const lastBar = bars.at(-1);
		if (!lastBar || avgVolume <= 0) {
			return null;
		}

		// Normalize to 0-1 scale based on typical volume patterns
		// This is a simplified proxy since we don't have shares outstanding
		const volumeRatio = lastBar.volume / avgVolume;

		// Cap at 10x (1000%) for extreme volume days
		return Math.min(volumeRatio / 10, 1);
	}
}

/**
 * Factory function to create a LiquidityCalculatorAdapter instance.
 */
export function createLiquidityCalculator(): LiquidityCalculator {
	return new LiquidityCalculatorAdapter();
}
