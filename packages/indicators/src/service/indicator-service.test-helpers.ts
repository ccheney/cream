import {
	createEmptyCorporateIndicators,
	createEmptyLiquidityIndicators,
	createEmptyOptionsIndicators,
	createEmptyPriceIndicators,
	createEmptyQualityIndicators,
	createEmptySentimentIndicators,
	createEmptyShortInterestIndicators,
	createEmptyValueIndicators,
	type OHLCVBar,
	type Quote,
} from "../types";
import { IndicatorCache } from "./indicator-cache";
import type {
	CorporateActionsRepository,
	FundamentalRepository,
	IndicatorServiceDependencies,
	LiquidityCalculator,
	MarketDataProvider,
	OptionsCalculator,
	OptionsDataProvider,
	PriceCalculator,
	SentimentRepository,
	ShortInterestRepository,
} from "./indicator-service";

export function createMockBars(count: number, startPrice = 100): OHLCVBar[] {
	const bars: OHLCVBar[] = [];
	const baseTime = Date.now() - count * 86400000;

	for (let i = 0; i < count; i++) {
		const price = startPrice + i * 0.5;
		bars.push({
			timestamp: baseTime + i * 86400000,
			open: price,
			high: price + 1,
			low: price - 1,
			close: price + 0.5,
			volume: 1000000,
		});
	}

	return bars;
}

export function createMockQuote(): Quote {
	return {
		timestamp: Date.now(),
		bidPrice: 150.0,
		bidSize: 100,
		askPrice: 150.05,
		askSize: 200,
	};
}

export function createMockMarketDataProvider(
	bars: OHLCVBar[],
	quote: Quote | null,
): MarketDataProvider {
	return {
		async getBars() {
			return bars;
		},
		async getQuote() {
			return quote;
		},
	};
}

export function createMockPriceCalculator(): PriceCalculator {
	return {
		calculate() {
			const indicators = createEmptyPriceIndicators();
			indicators.rsi_14 = 55.5;
			indicators.atr_14 = 2.3;
			indicators.sma_20 = 105.0;
			return indicators;
		},
	};
}

export function createPriceCalculatorEmptyOnNoBars(): PriceCalculator {
	return {
		calculate(bars) {
			if (bars.length === 0) {
				return createEmptyPriceIndicators();
			}
			const indicators = createEmptyPriceIndicators();
			indicators.rsi_14 = 55.5;
			return indicators;
		},
	};
}

export function createMockLiquidityCalculator(): LiquidityCalculator {
	return {
		calculate() {
			const indicators = createEmptyLiquidityIndicators();
			indicators.bid_ask_spread = 0.05;
			indicators.vwap = 150.25;
			return indicators;
		},
	};
}

export function createLiquidityCalculatorEmptyOnNoData(): LiquidityCalculator {
	return {
		calculate(bars, quote) {
			if (bars.length === 0 && quote === null) {
				return createEmptyLiquidityIndicators();
			}
			const indicators = createEmptyLiquidityIndicators();
			indicators.bid_ask_spread = 0.05;
			return indicators;
		},
	};
}

export function createLiquidityCalculatorEmptyOnNoBars(): LiquidityCalculator {
	return {
		calculate(bars) {
			if (bars.length === 0) {
				return createEmptyLiquidityIndicators();
			}
			const indicators = createEmptyLiquidityIndicators();
			indicators.bid_ask_spread = 0.05;
			return indicators;
		},
	};
}

export function createMockOptionsDataProvider(): OptionsDataProvider {
	return {
		async getImpliedVolatility() {
			return 0.35;
		},
		async getIVSkew() {
			return 0.05;
		},
		async getPutCallRatio() {
			return 0.8;
		},
	};
}

export function createMockOptionsCalculator(): OptionsCalculator {
	return {
		async calculate() {
			const indicators = createEmptyOptionsIndicators();
			indicators.atm_iv = 0.35;
			indicators.iv_skew_25d = 0.05;
			return indicators;
		},
	};
}

export function createMockFundamentalRepo(): FundamentalRepository {
	return {
		async getLatest() {
			const value = createEmptyValueIndicators();
			value.pe_ratio_ttm = 25.5;
			value.pb_ratio = 8.2;
			const quality = createEmptyQualityIndicators();
			quality.roe = 0.85;
			return { value, quality };
		},
	};
}

export function createMockShortInterestRepo(): ShortInterestRepository {
	return {
		async getLatest() {
			const indicators = createEmptyShortInterestIndicators();
			indicators.short_pct_float = 0.05;
			indicators.days_to_cover = 2.5;
			indicators.settlement_date = "2026-01-08";
			return indicators;
		},
	};
}

export function createMockSentimentRepo(): SentimentRepository {
	return {
		async getLatest() {
			const indicators = createEmptySentimentIndicators();
			indicators.overall_score = 0.65;
			indicators.news_volume = 150;
			return indicators;
		},
	};
}

export function createMockCorporateRepo(): CorporateActionsRepository {
	return {
		async getLatest() {
			const indicators = createEmptyCorporateIndicators();
			indicators.trailing_dividend_yield = 0.005;
			indicators.recent_split = false;
			return indicators;
		},
	};
}

export function createFullDependencies(): IndicatorServiceDependencies {
	return {
		marketData: createMockMarketDataProvider(createMockBars(200), createMockQuote()),
		optionsData: createMockOptionsDataProvider(),
		priceCalculator: createMockPriceCalculator(),
		liquidityCalculator: createMockLiquidityCalculator(),
		optionsCalculator: createMockOptionsCalculator(),
		fundamentalRepo: createMockFundamentalRepo(),
		shortInterestRepo: createMockShortInterestRepo(),
		sentimentRepo: createMockSentimentRepo(),
		corporateActionsRepo: createMockCorporateRepo(),
		cache: new IndicatorCache(),
	};
}
