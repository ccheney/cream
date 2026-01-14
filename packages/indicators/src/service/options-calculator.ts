/**
 * OptionsCalculatorAdapter
 *
 * Adapter that fetches options indicators from an OptionsDataProvider
 * and returns them as an OptionsIndicators object.
 *
 * Implements the OptionsCalculator interface expected by IndicatorService.
 *
 * Note: This adapter uses a simple provider interface that returns pre-calculated
 * values. For raw options chain calculations, use the calculators directly:
 * - calculators/options/iv-skew.ts
 * - calculators/options/put-call-ratio.ts
 * - calculators/options/vrp.ts
 * - calculators/options/term-structure.ts
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

import { log } from "../logger";
import { createEmptyOptionsIndicators, type OptionsIndicators } from "../types";
import type { OptionsCalculator, OptionsDataProvider } from "./indicator-service";

/** Timeout for options data fetching (5 seconds) */
const OPTIONS_FETCH_TIMEOUT_MS = 5000;

/**
 * Wrap a promise with a timeout. Returns null if timeout expires.
 */
async function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
	label: string
): Promise<T | null> {
	const { promise: timeoutPromise, resolve } = Promise.withResolvers<T | null>();
	const timer = setTimeout(() => {
		log.warn({ label, timeoutMs }, "Options data fetch timed out");
		resolve(null);
	}, timeoutMs);

	try {
		const result = await Promise.race([promise, timeoutPromise]);
		clearTimeout(timer);
		return result;
	} catch (error) {
		clearTimeout(timer);
		log.warn({ label, error }, "Options data fetch failed");
		return null;
	}
}

/**
 * Default implementation of OptionsCalculator.
 *
 * Fetches options indicators from an OptionsDataProvider and constructs
 * the OptionsIndicators object. Most fields return null as they require
 * raw options chain data not available through the simple provider interface.
 *
 * For full options calculations with raw chain data, use the calculators directly.
 */
export class OptionsCalculatorAdapter implements OptionsCalculator {
	/**
	 * Fetch options indicators from provider.
	 *
	 * @param symbol - Stock symbol
	 * @param provider - Options data provider
	 * @returns OptionsIndicators object with available values
	 *
	 * @example
	 * ```typescript
	 * const adapter = new OptionsCalculatorAdapter();
	 * const provider = { ... };
	 * const indicators = await adapter.calculate("AAPL", provider);
	 * console.log(indicators.atm_iv); // 0.25
	 * ```
	 */
	async calculate(symbol: string, provider: OptionsDataProvider): Promise<OptionsIndicators> {
		// Fetch available indicators from provider in parallel with timeout
		const [atmIV, ivSkew, putCallRatio] = await Promise.all([
			withTimeout(provider.getImpliedVolatility(symbol), OPTIONS_FETCH_TIMEOUT_MS, "atmIV"),
			withTimeout(provider.getIVSkew(symbol), OPTIONS_FETCH_TIMEOUT_MS, "ivSkew"),
			withTimeout(provider.getPutCallRatio(symbol), OPTIONS_FETCH_TIMEOUT_MS, "putCallRatio"),
		]);

		// Start with empty indicators
		const indicators = createEmptyOptionsIndicators();

		// Fill in values from provider
		indicators.atm_iv = atmIV;
		indicators.iv_skew_25d = ivSkew;
		indicators.put_call_ratio_volume = putCallRatio;

		// Note: The following fields require raw options chain data
		// and are not available through the simple provider interface:
		// - iv_put_25d, iv_call_25d (need options chain)
		// - put_call_ratio_oi (need open interest data)
		// - term_structure_slope, front_month_iv, back_month_iv (need multiple expirations)
		// - vrp, realized_vol_20d (need OHLCV bars)
		// - net_delta, net_gamma, net_theta, net_vega (need positions)

		return indicators;
	}
}

/**
 * Factory function to create an OptionsCalculatorAdapter instance.
 */
export function createOptionsCalculator(): OptionsCalculator {
	return new OptionsCalculatorAdapter();
}
