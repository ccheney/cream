/**
 * Indicator Types and Schemas
 *
 * Zod v4 schemas for the unified indicator snapshot format.
 * Covers all 8 indicator categories from the v2 plan:
 * 1. Price-Based (Real-time)
 * 2. Liquidity (Real-time)
 * 3. Options-Derived (Real-time)
 * 4. Value Factors (Batch)
 * 5. Quality Factors (Batch)
 * 6. Short Interest (Batch)
 * 7. Sentiment (Batch + Real-time)
 * 8. Corporate Actions (Batch)
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

import { z } from "zod";

import { calculateATR } from "../calculators/price/atr";
import { calculateRSI } from "../calculators/price/rsi";
import { calculateSMA } from "../calculators/price/sma";

// ============================================================
// ENUMS
// ============================================================

export const EarningsQuality = z.enum(["HIGH", "MEDIUM", "LOW"]);
export type EarningsQuality = z.infer<typeof EarningsQuality>;

export const SentimentClassification = z.enum([
	"STRONG_BULLISH",
	"BULLISH",
	"NEUTRAL",
	"BEARISH",
	"STRONG_BEARISH",
]);
export type SentimentClassification = z.infer<typeof SentimentClassification>;

export const MarketCapCategory = z.enum(["MEGA", "LARGE", "MID", "SMALL", "MICRO"]);
export type MarketCapCategory = z.infer<typeof MarketCapCategory>;

export const DataQuality = z.enum(["COMPLETE", "PARTIAL", "STALE"]);
export type DataQuality = z.infer<typeof DataQuality>;

export const TradingSession = z.enum(["PRE_MARKET", "RTH", "AFTER_HOURS", "CLOSED"]);
export type TradingSession = z.infer<typeof TradingSession>;

export const SyncRunType = z.enum([
	"fundamentals",
	"short_interest",
	"sentiment",
	"corporate_actions",
]);
export type SyncRunType = z.infer<typeof SyncRunType>;

export const SyncRunStatus = z.enum(["running", "completed", "failed"]);
export type SyncRunStatus = z.infer<typeof SyncRunStatus>;

// ============================================================
// CATEGORY SCHEMAS
// ============================================================

/**
 * Price-Based Indicators (Real-time from Alpaca bars)
 *
 * Includes trend, momentum, and volatility indicators.
 */
export const PriceIndicatorsSchema = z.object({
	// Momentum
	rsi_14: z.number().nullable(),

	// Volatility
	atr_14: z.number().nullable(),

	// Trend - SMAs
	sma_20: z.number().nullable(),
	sma_50: z.number().nullable(),
	sma_200: z.number().nullable(),

	// Trend - EMAs
	ema_9: z.number().nullable(),
	ema_12: z.number().nullable(),
	ema_21: z.number().nullable(),
	ema_26: z.number().nullable(),

	// MACD
	macd_line: z.number().nullable(),
	macd_signal: z.number().nullable(),
	macd_histogram: z.number().nullable(),

	// Bollinger Bands
	bollinger_upper: z.number().nullable(),
	bollinger_middle: z.number().nullable(),
	bollinger_lower: z.number().nullable(),
	bollinger_bandwidth: z.number().nullable(),
	bollinger_percentb: z.number().nullable(),

	// Stochastic
	stochastic_k: z.number().nullable(),
	stochastic_d: z.number().nullable(),

	// Momentum (returns)
	momentum_1m: z.number().nullable(),
	momentum_3m: z.number().nullable(),
	momentum_6m: z.number().nullable(),
	momentum_12m: z.number().nullable(),

	// Volatility
	realized_vol_20d: z.number().nullable(),
	parkinson_vol_20d: z.number().nullable(),
});
export type PriceIndicators = z.infer<typeof PriceIndicatorsSchema>;

/**
 * Liquidity Indicators (Real-time from Alpaca quotes)
 */
export const LiquidityIndicatorsSchema = z.object({
	bid_ask_spread: z.number().nullable(),
	bid_ask_spread_pct: z.number().nullable(),
	amihud_illiquidity: z.number().nullable(),
	vwap: z.number().nullable(),
	turnover_ratio: z.number().nullable(),
	volume_ratio: z.number().nullable(),
});
export type LiquidityIndicators = z.infer<typeof LiquidityIndicatorsSchema>;

/**
 * Options-Derived Indicators (Real-time from Alpaca options)
 */
export const OptionsIndicatorsSchema = z.object({
	// ATM Implied Volatility
	atm_iv: z.number().nullable(),

	// IV Skew (25-delta)
	iv_skew_25d: z.number().nullable(),
	iv_put_25d: z.number().nullable(),
	iv_call_25d: z.number().nullable(),

	// Put/Call Ratios
	put_call_ratio_volume: z.number().nullable(),
	put_call_ratio_oi: z.number().nullable(),

	// Term Structure
	term_structure_slope: z.number().nullable(),
	front_month_iv: z.number().nullable(),
	back_month_iv: z.number().nullable(),

	// Volatility Risk Premium
	vrp: z.number().nullable(),
	realized_vol_20d: z.number().nullable(),

	// Aggregate Greeks (for portfolio positions)
	net_delta: z.number().nullable(),
	net_gamma: z.number().nullable(),
	net_theta: z.number().nullable(),
	net_vega: z.number().nullable(),
});
export type OptionsIndicators = z.infer<typeof OptionsIndicatorsSchema>;

/**
 * Value Factors (Batch)
 */
export const ValueIndicatorsSchema = z.object({
	pe_ratio_ttm: z.number().nullable(),
	pe_ratio_forward: z.number().nullable(),
	pb_ratio: z.number().nullable(),
	ev_ebitda: z.number().nullable(),
	earnings_yield: z.number().nullable(),
	dividend_yield: z.number().nullable(),
	cape_10yr: z.number().nullable(),
});
export type ValueIndicators = z.infer<typeof ValueIndicatorsSchema>;

/**
 * Quality Factors (Batch from EDGAR)
 */
export const QualityIndicatorsSchema = z.object({
	gross_profitability: z.number().nullable(),
	roe: z.number().nullable(),
	roa: z.number().nullable(),
	asset_growth: z.number().nullable(),
	accruals_ratio: z.number().nullable(),
	cash_flow_quality: z.number().nullable(),
	beneish_m_score: z.number().nullable(),
	earnings_quality: EarningsQuality.nullable(),
});
export type QualityIndicators = z.infer<typeof QualityIndicatorsSchema>;

/**
 * Short Interest Indicators (Batch from FINRA)
 */
export const ShortInterestIndicatorsSchema = z.object({
	short_interest_ratio: z.number().nullable(),
	days_to_cover: z.number().nullable(),
	short_pct_float: z.number().nullable(),
	short_interest_change: z.number().nullable(),
	settlement_date: z.string().nullable(),
});
export type ShortInterestIndicators = z.infer<typeof ShortInterestIndicatorsSchema>;

/**
 * Sentiment Indicators (Batch + Real-time aggregation)
 */
export const SentimentIndicatorsSchema = z.object({
	overall_score: z.number().nullable(),
	sentiment_strength: z.number().nullable(),
	news_volume: z.number().nullable(),
	sentiment_momentum: z.number().nullable(),
	event_risk: z.boolean().nullable(),
	classification: SentimentClassification.nullable(),
});
export type SentimentIndicators = z.infer<typeof SentimentIndicatorsSchema>;

/**
 * Corporate Actions Indicators
 */
export const CorporateIndicatorsSchema = z.object({
	trailing_dividend_yield: z.number().nullable(),
	ex_dividend_days: z.number().nullable(),
	upcoming_earnings_days: z.number().nullable(),
	recent_split: z.boolean().nullable(),
});
export type CorporateIndicators = z.infer<typeof CorporateIndicatorsSchema>;

/**
 * Market Context
 */
export const MarketContextSchema = z.object({
	sector: z.string().nullable(),
	industry: z.string().nullable(),
	market_cap: z.number().nullable(),
	market_cap_category: MarketCapCategory.nullable(),
});
export type MarketContext = z.infer<typeof MarketContextSchema>;

/**
 * Snapshot Metadata
 */
export const SnapshotMetadataSchema = z.object({
	price_updated_at: z.number(),
	fundamentals_date: z.string().nullable(),
	short_interest_date: z.string().nullable(),
	sentiment_date: z.string().nullable(),
	data_quality: DataQuality,
	missing_fields: z.array(z.string()),
	/** Current trading session when snapshot was taken */
	trading_session: TradingSession.optional(),
});
export type SnapshotMetadata = z.infer<typeof SnapshotMetadataSchema>;

// ============================================================
// UNIFIED INDICATOR SNAPSHOT
// ============================================================

/**
 * IndicatorSnapshot — The unified output format
 *
 * Combines all 8 indicator categories plus market context and metadata.
 * This is the main type consumed by the OODA loop and dashboard.
 */
export const IndicatorSnapshotSchema = z.object({
	symbol: z.string(),
	timestamp: z.number(),

	// Real-time indicators
	price: PriceIndicatorsSchema,
	liquidity: LiquidityIndicatorsSchema,
	options: OptionsIndicatorsSchema,

	// Batch indicators
	value: ValueIndicatorsSchema,
	quality: QualityIndicatorsSchema,
	short_interest: ShortInterestIndicatorsSchema,
	sentiment: SentimentIndicatorsSchema,
	corporate: CorporateIndicatorsSchema,

	// Context
	market: MarketContextSchema,
	metadata: SnapshotMetadataSchema,
});
export type IndicatorSnapshot = z.infer<typeof IndicatorSnapshotSchema>;

// ============================================================
// BATCH DATABASE SCHEMAS (PostgreSQL table mappings)
// ============================================================

/**
 * Fundamental indicators stored in PostgreSQL (nightly batch)
 */
export const FundamentalIndicatorsRowSchema = z.object({
	id: z.string(),
	symbol: z.string(),
	date: z.string(),

	// Value factors
	pe_ratio_ttm: z.number().nullable(),
	pe_ratio_forward: z.number().nullable(),
	pb_ratio: z.number().nullable(),
	ev_ebitda: z.number().nullable(),
	earnings_yield: z.number().nullable(),
	dividend_yield: z.number().nullable(),
	cape_10yr: z.number().nullable(),

	// Quality factors
	gross_profitability: z.number().nullable(),
	roe: z.number().nullable(),
	roa: z.number().nullable(),
	asset_growth: z.number().nullable(),
	accruals_ratio: z.number().nullable(),
	cash_flow_quality: z.number().nullable(),
	beneish_m_score: z.number().nullable(),

	// Market context
	market_cap: z.number().nullable(),
	sector: z.string().nullable(),
	industry: z.string().nullable(),

	// Metadata
	source: z.string(),
	computed_at: z.string(),
});
export type FundamentalIndicatorsRow = z.infer<typeof FundamentalIndicatorsRowSchema>;

/**
 * Short interest indicators stored in PostgreSQL (bi-weekly batch)
 */
export const ShortInterestIndicatorsRowSchema = z.object({
	id: z.string(),
	symbol: z.string(),
	settlement_date: z.string(),

	short_interest: z.number(),
	short_interest_ratio: z.number().nullable(),
	days_to_cover: z.number().nullable(),
	short_pct_float: z.number().nullable(),
	short_interest_change: z.number().nullable(),

	source: z.string(),
	fetched_at: z.string(),
});
export type ShortInterestIndicatorsRow = z.infer<typeof ShortInterestIndicatorsRowSchema>;

/**
 * Sentiment indicators stored in PostgreSQL (nightly aggregation)
 */
export const SentimentIndicatorsRowSchema = z.object({
	id: z.string(),
	symbol: z.string(),
	date: z.string(),

	sentiment_score: z.number().nullable(),
	sentiment_strength: z.number().nullable(),
	news_volume: z.number().nullable(),
	sentiment_momentum: z.number().nullable(),
	event_risk_flag: z.boolean(),

	news_sentiment: z.number().nullable(),
	social_sentiment: z.number().nullable(),
	analyst_sentiment: z.number().nullable(),

	computed_at: z.string(),
});
export type SentimentIndicatorsRow = z.infer<typeof SentimentIndicatorsRowSchema>;

/**
 * Options indicators cache stored in PostgreSQL (refreshed hourly)
 */
export const OptionsIndicatorsCacheRowSchema = z.object({
	id: z.string(),
	symbol: z.string(),
	timestamp: z.string(),

	implied_volatility: z.number().nullable(),
	iv_skew: z.number().nullable(),
	put_call_ratio: z.number().nullable(),
	vrp: z.number().nullable(),
	term_structure_slope: z.number().nullable(),

	net_delta: z.number().nullable(),
	net_gamma: z.number().nullable(),
	net_theta: z.number().nullable(),
	net_vega: z.number().nullable(),

	expires_at: z.string(),
});
export type OptionsIndicatorsCacheRow = z.infer<typeof OptionsIndicatorsCacheRowSchema>;

/**
 * Corporate actions indicators stored in PostgreSQL (daily update)
 */
export const CorporateActionsIndicatorsRowSchema = z.object({
	id: z.string(),
	symbol: z.string(),
	date: z.string(),

	trailing_dividend_yield: z.number().nullable(),
	ex_dividend_days: z.number().nullable(),
	recent_split: z.boolean(),
	split_ratio: z.string().nullable(),
});
export type CorporateActionsIndicatorsRow = z.infer<typeof CorporateActionsIndicatorsRowSchema>;

/**
 * Indicator sync run tracking
 */
export const IndicatorSyncRunSchema = z.object({
	id: z.string(),
	run_type: SyncRunType,
	started_at: z.string(),
	completed_at: z.string().nullable(),
	symbols_processed: z.number(),
	symbols_failed: z.number(),
	status: SyncRunStatus,
	error_message: z.string().nullable(),
	environment: z.string(),
});
export type IndicatorSyncRun = z.infer<typeof IndicatorSyncRunSchema>;

// ============================================================
// CALCULATOR RESULT TYPES
// ============================================================

/**
 * Result from a price indicator calculator
 */
export const CalculatorResultSchema = z.object({
	value: z.number().nullable(),
	timestamp: z.number(),
	metadata: z.record(z.string(), z.unknown()).optional(),
});
export type CalculatorResult = z.infer<typeof CalculatorResultSchema>;

/**
 * OHLCV bar input for calculators
 */
export const OHLCVBarSchema = z.object({
	timestamp: z.number(),
	open: z.number(),
	high: z.number(),
	low: z.number(),
	close: z.number(),
	volume: z.number(),
});
export type OHLCVBar = z.infer<typeof OHLCVBarSchema>;

/**
 * Candle type alias for backward compatibility
 * (Identical to OHLCVBar)
 */
export type Candle = OHLCVBar;

/**
 * Quote input for liquidity calculators
 */
export const QuoteSchema = z.object({
	timestamp: z.number(),
	bidPrice: z.number(),
	bidSize: z.number(),
	askPrice: z.number(),
	askSize: z.number(),
});
export type Quote = z.infer<typeof QuoteSchema>;

// ============================================================
// FACTORY FUNCTIONS
// ============================================================

/**
 * Creates an empty PriceIndicators object with all nulls
 */
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

/**
 * Creates an empty LiquidityIndicators object with all nulls
 */
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

/**
 * Creates an empty OptionsIndicators object with all nulls
 */
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

/**
 * Creates an empty ValueIndicators object with all nulls
 */
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

/**
 * Creates an empty QualityIndicators object with all nulls
 */
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

/**
 * Creates an empty ShortInterestIndicators object with all nulls
 */
export function createEmptyShortInterestIndicators(): ShortInterestIndicators {
	return {
		short_interest_ratio: null,
		days_to_cover: null,
		short_pct_float: null,
		short_interest_change: null,
		settlement_date: null,
	};
}

/**
 * Creates an empty SentimentIndicators object with all nulls
 */
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

/**
 * Creates an empty CorporateIndicators object with all nulls
 */
export function createEmptyCorporateIndicators(): CorporateIndicators {
	return {
		trailing_dividend_yield: null,
		ex_dividend_days: null,
		upcoming_earnings_days: null,
		recent_split: null,
	};
}

/**
 * Creates an empty MarketContext object with all nulls
 */
export function createEmptyMarketContext(): MarketContext {
	return {
		sector: null,
		industry: null,
		market_cap: null,
		market_cap_category: null,
	};
}

/**
 * Creates a default SnapshotMetadata object
 */
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

/**
 * Creates an empty IndicatorSnapshot for a symbol
 */
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

// ============================================================
// INDICATOR PIPELINE (STUBS)
// ============================================================

/**
 * Pipeline configuration for multi-timeframe indicator calculation
 *
 * NOTE: This is a stub for forward compatibility. Full implementation pending.
 * @see docs/plans/02-data-layer.md - Feature Computation
 */
export interface IndicatorPipelineConfig {
	/** Timeframes to calculate indicators for */
	timeframes: string[];
	/** Base period for calculations */
	basePeriod: number;
	/** Whether to include volume indicators */
	includeVolume: boolean;
}

/**
 * Default pipeline configuration
 */
export const DEFAULT_PIPELINE_CONFIG: IndicatorPipelineConfig = {
	timeframes: ["1d", "1h", "15m"],
	basePeriod: 14,
	includeVolume: true,
};

/**
 * Transform configuration for feature normalization
 */
export interface TransformConfig {
	/** Normalization method */
	method: "zscore" | "minmax" | "robust";
	/** Lookback period for normalization */
	lookbackPeriod: number;
	/** Whether to clip outliers */
	clipOutliers: boolean;
	/** Standard deviation threshold for outlier clipping */
	clipThreshold: number;
}

/**
 * Default transform configuration
 */
export const DEFAULT_TRANSFORM_CONFIG: TransformConfig = {
	method: "zscore",
	lookbackPeriod: 20,
	clipOutliers: true,
	clipThreshold: 3,
};

/**
 * Multi-timeframe indicator calculation result
 */
export interface MultiTimeframeIndicators {
	[timeframe: string]: {
		[indicator: string]: number | null;
	};
}

/**
 * Calculate indicators across multiple timeframes
 *
 * Calculates RSI, SMA, and ATR indicators for the given candles.
 *
 * NOTE: Currently only calculates for the input timeframe (labeled as "1h").
 * Full multi-timeframe support requires candle aggregation infrastructure.
 *
 * @param candles - Input candles (assumed to be base timeframe)
 * @param config - Pipeline configuration
 * @returns Multi-timeframe indicator values
 */
export function calculateMultiTimeframeIndicators(
	candles: OHLCVBar[],
	config: Partial<IndicatorPipelineConfig> = {}
): MultiTimeframeIndicators {
	if (candles.length === 0) {
		return {};
	}

	const fullConfig = { ...DEFAULT_PIPELINE_CONFIG, ...config };
	const period = fullConfig.basePeriod;
	const indicators: { [indicator: string]: number | null } = {};

	// Calculate RSI
	const rsiResult = calculateRSI(candles, period);
	indicators[`rsi_${period}`] = rsiResult?.rsi ?? null;

	// Calculate SMA
	indicators[`sma_${period}`] = calculateSMA(candles, period);

	// Calculate ATR
	indicators[`atr_${period}`] = calculateATR(candles, period);

	return {
		"1h": indicators,
	};
}

/**
 * Transformed feature result
 */
export interface TransformedFeatures {
	[feature: string]: number;
}

// ============================================================
// NORMALIZATION HELPER FUNCTIONS
// ============================================================

/**
 * Calculate mean of an array of numbers
 */
function mean(values: number[]): number {
	if (values.length === 0) {
		return 0;
	}
	return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Calculate standard deviation of an array of numbers
 */
function stdDev(values: number[], valueMean?: number): number {
	if (values.length < 2) {
		return 0;
	}
	const m = valueMean ?? mean(values);
	const squaredDiffs = values.map((v) => (v - m) ** 2);
	return Math.sqrt(squaredDiffs.reduce((sum, v) => sum + v, 0) / (values.length - 1));
}

/**
 * Calculate median of an array of numbers
 */
function median(values: number[]): number {
	if (values.length === 0) {
		return 0;
	}
	const sorted = values.toSorted((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 0) {
		return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
	}
	return sorted[mid] ?? 0;
}

/**
 * Calculate interquartile range (IQR = Q3 - Q1)
 */
function iqr(values: number[]): number {
	if (values.length < 4) {
		return 0;
	}
	const sorted = values.toSorted((a, b) => a - b);
	const q1Index = Math.floor(sorted.length * 0.25);
	const q3Index = Math.floor(sorted.length * 0.75);
	const q1 = sorted[q1Index] ?? 0;
	const q3 = sorted[q3Index] ?? 0;
	return q3 - q1;
}

/**
 * Z-score normalization: (x - mean) / stddev
 * Centers data around 0 with unit variance
 */
function normalizeZScore(value: number, values: number[]): number | null {
	const m = mean(values);
	const s = stdDev(values, m);
	if (s === 0) {
		return null;
	}
	return (value - m) / s;
}

/**
 * Min-max normalization: (x - min) / (max - min)
 * Scales data to [0, 1] range
 */
function normalizeMinMax(value: number, values: number[]): number | null {
	const min = Math.min(...values);
	const max = Math.max(...values);
	const range = max - min;
	if (range === 0) {
		return null;
	}
	return (value - min) / range;
}

/**
 * Robust normalization: (x - median) / IQR
 * Uses median and IQR, resistant to outliers
 */
function normalizeRobust(value: number, values: number[]): number | null {
	const med = median(values);
	const interquartileRange = iqr(values);
	if (interquartileRange === 0) {
		return null;
	}
	return (value - med) / interquartileRange;
}

/**
 * Clip value to be within threshold standard deviations from mean
 */
function clipOutliers(value: number, values: number[], threshold: number): number {
	const m = mean(values);
	const s = stdDev(values, m);
	if (s === 0) {
		return value;
	}
	const lower = m - threshold * s;
	const upper = m + threshold * s;
	return Math.max(lower, Math.min(upper, value));
}

/**
 * Extract a feature series from candles
 */
function extractFeatureSeries(
	candles: OHLCVBar[],
	feature: "close" | "return" | "volume" | "high_low_range"
): number[] {
	switch (feature) {
		case "close":
			return candles.map((c) => c.close);
		case "return": {
			const returns: number[] = [];
			for (let i = 1; i < candles.length; i++) {
				const prev = candles[i - 1];
				const curr = candles[i];
				if (prev && curr && prev.close !== 0) {
					returns.push((curr.close - prev.close) / prev.close);
				}
			}
			return returns;
		}
		case "volume":
			return candles.map((c) => c.volume);
		case "high_low_range":
			return candles.map((c) => (c.close !== 0 ? (c.high - c.low) / c.close : 0));
		default:
			return [];
	}
}

/**
 * Apply transforms (normalization) to indicator values
 *
 * Normalizes key features from candle data using the specified method.
 * Supports z-score, min-max, and robust (median/IQR) normalization.
 *
 * @param candles - Input candles (oldest first)
 * @param timeframe - Timeframe identifier for naming
 * @param config - Transform configuration
 * @returns Transformed feature values with keys like "zscore_close_{timeframe}"
 */
export function applyTransforms(
	candles: OHLCVBar[],
	timeframe: string,
	config: Partial<TransformConfig> = {}
): TransformedFeatures {
	const fullConfig = { ...DEFAULT_TRANSFORM_CONFIG, ...config };
	const { method, lookbackPeriod, clipOutliers: shouldClip, clipThreshold } = fullConfig;

	if (candles.length < 2) {
		return {};
	}

	const result: TransformedFeatures = {};

	const features = ["close", "return", "volume", "high_low_range"] as const;

	for (const feature of features) {
		const series = extractFeatureSeries(candles, feature);
		if (series.length < lookbackPeriod) {
			continue;
		}

		const lookbackValues = series.slice(-lookbackPeriod);
		let currentValue = series[series.length - 1];
		if (currentValue === undefined) {
			continue;
		}

		if (shouldClip) {
			currentValue = clipOutliers(currentValue, lookbackValues, clipThreshold);
		}

		let normalizedValue: number | null = null;
		switch (method) {
			case "zscore":
				normalizedValue = normalizeZScore(currentValue, lookbackValues);
				break;
			case "minmax":
				normalizedValue = normalizeMinMax(currentValue, lookbackValues);
				break;
			case "robust":
				normalizedValue = normalizeRobust(currentValue, lookbackValues);
				break;
		}

		if (normalizedValue !== null && Number.isFinite(normalizedValue)) {
			result[`${method}_${feature}_${lookbackPeriod}_${timeframe}`] = normalizedValue;
		}
	}

	return result;
}
