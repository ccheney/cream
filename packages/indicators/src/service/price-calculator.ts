/**
 * PriceCalculatorAdapter
 *
 * Wraps all price-based calculators (RSI, ATR, SMA, EMA, MACD, Bollinger,
 * Stochastic, Momentum, Volatility) into a unified interface for the
 * IndicatorService.
 *
 * Implements the PriceCalculator interface expected by IndicatorService.
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

import {
	calculateATR,
	calculateBollingerBands,
	calculateCloseToCloseVolatility,
	calculateEMA,
	calculateMACD,
	calculateMomentum,
	calculateParkinsonVolatility,
	calculateRSI,
	calculateSMA,
	calculateStochastic,
} from "../calculators/price";
import { createEmptyPriceIndicators, type OHLCVBar, type PriceIndicators } from "../types";
import type { PriceCalculator } from "./indicator-service";

/**
 * Default implementation of PriceCalculator.
 *
 * Calculates all price-based technical indicators from OHLCV data.
 */
export class PriceCalculatorAdapter implements PriceCalculator {
	/**
	 * Calculate all price-based indicators from OHLCV bars.
	 *
	 * @param bars - OHLCV bars (oldest first)
	 * @returns PriceIndicators object with all calculated values
	 *
	 * @example
	 * ```typescript
	 * const adapter = new PriceCalculatorAdapter();
	 * const bars = await marketData.getBars("AAPL", 200);
	 * const indicators = adapter.calculate(bars);
	 * console.log(indicators.rsi_14); // 65.5
	 * ```
	 */
	calculate(bars: OHLCVBar[]): PriceIndicators {
		if (bars.length === 0) {
			return createEmptyPriceIndicators();
		}

		return {
			// RSI (14-period)
			rsi_14: calculateRSI(bars, 14)?.rsi ?? null,

			// ATR (14-period)
			atr_14: calculateATR(bars, 14),

			// SMAs
			sma_20: calculateSMA(bars, 20),
			sma_50: calculateSMA(bars, 50),
			sma_200: calculateSMA(bars, 200),

			// EMAs
			ema_9: calculateEMA(bars, 9)?.ema ?? null,
			ema_12: calculateEMA(bars, 12)?.ema ?? null,
			ema_21: calculateEMA(bars, 21)?.ema ?? null,
			ema_26: calculateEMA(bars, 26)?.ema ?? null,

			// MACD (12, 26, 9)
			...this.calculateMACDValues(bars),

			// Bollinger Bands (20, 2)
			...this.calculateBollingerValues(bars),

			// Stochastic (14, 3, 3)
			...this.calculateStochasticValues(bars),

			// Momentum (returns as ROC %)
			...this.calculateMomentumValues(bars),

			// Volatility (20-day)
			realized_vol_20d: calculateCloseToCloseVolatility(bars, 20)?.volatility ?? null,
			parkinson_vol_20d: calculateParkinsonVolatility(bars, 20)?.volatility ?? null,
		};
	}

	private calculateMACDValues(
		bars: OHLCVBar[]
	): Pick<PriceIndicators, "macd_line" | "macd_signal" | "macd_histogram"> {
		const macd = calculateMACD(bars, { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 });

		return {
			macd_line: macd?.macdLine ?? null,
			macd_signal: macd?.signalLine ?? null,
			macd_histogram: macd?.histogram ?? null,
		};
	}

	private calculateBollingerValues(
		bars: OHLCVBar[]
	): Pick<
		PriceIndicators,
		| "bollinger_upper"
		| "bollinger_middle"
		| "bollinger_lower"
		| "bollinger_bandwidth"
		| "bollinger_percentb"
	> {
		const bb = calculateBollingerBands(bars, 20, 2);

		return {
			bollinger_upper: bb?.upper ?? null,
			bollinger_middle: bb?.middle ?? null,
			bollinger_lower: bb?.lower ?? null,
			bollinger_bandwidth: bb?.bandwidth ?? null,
			bollinger_percentb: bb?.percentB ?? null,
		};
	}

	private calculateStochasticValues(
		bars: OHLCVBar[]
	): Pick<PriceIndicators, "stochastic_k" | "stochastic_d"> {
		const stoch = calculateStochastic(bars, { kPeriod: 14, dPeriod: 3 });

		return {
			stochastic_k: stoch?.k ?? null,
			stochastic_d: stoch?.d ?? null,
		};
	}

	private calculateMomentumValues(
		bars: OHLCVBar[]
	): Pick<PriceIndicators, "momentum_1m" | "momentum_3m" | "momentum_6m" | "momentum_12m"> {
		// Momentum periods in trading days
		const mom1m = calculateMomentum(bars, 21);
		const mom3m = calculateMomentum(bars, 63);
		const mom6m = calculateMomentum(bars, 126);
		const mom12m = calculateMomentum(bars, 252);

		return {
			momentum_1m: mom1m?.roc ?? null,
			momentum_3m: mom3m?.roc ?? null,
			momentum_6m: mom6m?.roc ?? null,
			momentum_12m: mom12m?.roc ?? null,
		};
	}
}

/**
 * Factory function to create a PriceCalculatorAdapter instance.
 */
export function createPriceCalculator(): PriceCalculator {
	return new PriceCalculatorAdapter();
}
