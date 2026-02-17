import {
	createEmptyLiquidityIndicators,
	createEmptyPriceIndicators,
	createEmptyQualityIndicators,
	createEmptySnapshot,
	createEmptyValueIndicators,
} from "../types";

export function createTestSnapshot(symbol: string) {
	const snapshot = createEmptySnapshot(symbol);
	snapshot.price.rsi_14 = 55.5;
	snapshot.price.atr_14 = 2.3;
	return snapshot;
}

export function createTestPriceIndicators() {
	const price = createEmptyPriceIndicators();
	price.rsi_14 = 65.2;
	price.sma_20 = 150.5;
	price.ema_9 = 152.3;
	return price;
}

export function createTestLiquidityIndicators() {
	const liquidity = createEmptyLiquidityIndicators();
	liquidity.bid_ask_spread = 0.02;
	liquidity.vwap = 151.25;
	return liquidity;
}

export function createTestValueIndicators() {
	const value = createEmptyValueIndicators();
	value.pe_ratio_ttm = 25.5;
	value.pb_ratio = 8.2;
	return value;
}

export function createTestQualityIndicators() {
	const quality = createEmptyQualityIndicators();
	quality.roe = 0.85;
	quality.roa = 0.21;
	return quality;
}
