import type {
	CorporateIndicators,
	LiquidityIndicators,
	MarketContext,
	OptionsIndicators,
	PriceIndicators,
	QualityIndicators,
	SentimentIndicators,
	ShortInterestIndicators,
	SnapshotMetadata,
	ValueIndicators,
} from "./indicator-schemas";
import type { IndicatorSnapshot } from "./snapshot-schema";

export function createEmptyPriceIndicators(): PriceIndicators {
	return {
		rsi_14: null,
		atr_14: null,
		sma_20: null,
		sma_50: null,
		sma_200: null,
		ema_9: null,
		ema_12: null,
		ema_21: null,
		ema_26: null,
		macd_line: null,
		macd_signal: null,
		macd_histogram: null,
		bollinger_upper: null,
		bollinger_middle: null,
		bollinger_lower: null,
		bollinger_bandwidth: null,
		bollinger_percentb: null,
		stochastic_k: null,
		stochastic_d: null,
		momentum_1m: null,
		momentum_3m: null,
		momentum_6m: null,
		momentum_12m: null,
		realized_vol_20d: null,
		parkinson_vol_20d: null,
	};
}

export function createEmptyLiquidityIndicators(): LiquidityIndicators {
	return {
		bid_ask_spread: null,
		bid_ask_spread_pct: null,
		amihud_illiquidity: null,
		vwap: null,
		turnover_ratio: null,
		volume_ratio: null,
	};
}

export function createEmptyOptionsIndicators(): OptionsIndicators {
	return {
		atm_iv: null,
		iv_skew_25d: null,
		iv_put_25d: null,
		iv_call_25d: null,
		put_call_ratio_volume: null,
		put_call_ratio_oi: null,
		term_structure_slope: null,
		front_month_iv: null,
		back_month_iv: null,
		vrp: null,
		realized_vol_20d: null,
		net_delta: null,
		net_gamma: null,
		net_theta: null,
		net_vega: null,
	};
}

export function createEmptyValueIndicators(): ValueIndicators {
	return {
		pe_ratio_ttm: null,
		pe_ratio_forward: null,
		pb_ratio: null,
		ev_ebitda: null,
		earnings_yield: null,
		dividend_yield: null,
		cape_10yr: null,
	};
}

export function createEmptyQualityIndicators(): QualityIndicators {
	return {
		gross_profitability: null,
		roe: null,
		roa: null,
		asset_growth: null,
		accruals_ratio: null,
		cash_flow_quality: null,
		beneish_m_score: null,
		earnings_quality: null,
	};
}

export function createEmptyShortInterestIndicators(): ShortInterestIndicators {
	return {
		short_interest_ratio: null,
		days_to_cover: null,
		short_pct_float: null,
		short_interest_change: null,
		settlement_date: null,
	};
}

export function createEmptySentimentIndicators(): SentimentIndicators {
	return {
		overall_score: null,
		sentiment_strength: null,
		news_volume: null,
		sentiment_momentum: null,
		event_risk: null,
		classification: null,
	};
}

export function createEmptyCorporateIndicators(): CorporateIndicators {
	return {
		trailing_dividend_yield: null,
		ex_dividend_days: null,
		upcoming_earnings_days: null,
		recent_split: null,
	};
}

export function createEmptyMarketContext(): MarketContext {
	return {
		sector: null,
		industry: null,
		market_cap: null,
		market_cap_category: null,
	};
}

export function createDefaultMetadata(): SnapshotMetadata {
	return {
		price_updated_at: Date.now(),
		fundamentals_date: null,
		short_interest_date: null,
		sentiment_date: null,
		data_quality: "PARTIAL",
		missing_fields: [],
	};
}

export function createEmptySnapshot(symbol: string): IndicatorSnapshot {
	return {
		symbol,
		timestamp: Date.now(),
		price: createEmptyPriceIndicators(),
		liquidity: createEmptyLiquidityIndicators(),
		options: createEmptyOptionsIndicators(),
		value: createEmptyValueIndicators(),
		quality: createEmptyQualityIndicators(),
		short_interest: createEmptyShortInterestIndicators(),
		sentiment: createEmptySentimentIndicators(),
		corporate: createEmptyCorporateIndicators(),
		market: createEmptyMarketContext(),
		metadata: createDefaultMetadata(),
	};
}
