import {
	createEmptyQualityIndicators,
	createEmptyValueIndicators,
	type DataQuality,
	type LiquidityIndicators,
	type OptionsIndicators,
	type PriceIndicators,
	type QualityIndicators,
	type SentimentIndicators,
	type ShortInterestIndicators,
	type ValueIndicators,
} from "../types";

export type Fundamentals = { value: ValueIndicators; quality: QualityIndicators };

export function createEmptyFundamentals(): Fundamentals {
	return {
		value: createEmptyValueIndicators(),
		quality: createEmptyQualityIndicators(),
	};
}

export function unwrapSettledValue<T>(result: PromiseSettledResult<T>, fallback: T): T {
	return result.status === "fulfilled" ? result.value : fallback;
}

export function collectFailures(entries: [string, PromiseSettledResult<unknown>][]): string[] {
	return entries.flatMap(([name, result]) => {
		return result.status === "rejected" ? [name] : [];
	});
}

export function calculateMissingFields(
	price: PriceIndicators,
	liquidity: LiquidityIndicators,
	options: OptionsIndicators,
): string[] {
	const missing: string[] = [];
	if (price.rsi_14 === null) {
		missing.push("rsi_14");
	}
	if (price.atr_14 === null) {
		missing.push("atr_14");
	}
	if (liquidity.bid_ask_spread === null) {
		missing.push("bid_ask_spread");
	}
	if (options.atm_iv === null) {
		missing.push("implied_volatility");
	}
	return missing;
}

export function determineDataQuality(
	hasMarketData: boolean,
	price: PriceIndicators,
	liquidity: LiquidityIndicators,
	value: ValueIndicators,
	shortInterest: ShortInterestIndicators,
	sentiment: SentimentIndicators,
): DataQuality {
	let availableCategories = 0;
	if (hasMarketData && price.rsi_14 !== null) {
		availableCategories += 1;
	}
	if (liquidity.bid_ask_spread !== null || liquidity.vwap !== null) {
		availableCategories += 1;
	}
	if (value.pe_ratio_ttm !== null || value.pb_ratio !== null) {
		availableCategories += 1;
	}
	if (shortInterest.short_pct_float !== null) {
		availableCategories += 1;
	}
	if (sentiment.overall_score !== null) {
		availableCategories += 1;
	}
	if (availableCategories >= 5) {
		return "COMPLETE";
	}
	if (availableCategories >= 2) {
		return "PARTIAL";
	}
	return "STALE";
}
