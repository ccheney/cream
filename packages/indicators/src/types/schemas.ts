/**
 * Pure Type Exports
 *
 * This file exports only Zod schemas and types WITHOUT any runtime code.
 * Used by packages that only need type definitions (e.g., dashboard-types).
 *
 * @see ./index.ts for full types + runtime utilities
 */

import { z } from "zod";

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

// ============================================================
// CATEGORY SCHEMAS
// ============================================================

export const PriceIndicatorsSchema = z.object({
  rsi_14: z.number().nullable(),
  atr_14: z.number().nullable(),
  sma_20: z.number().nullable(),
  sma_50: z.number().nullable(),
  sma_200: z.number().nullable(),
  ema_9: z.number().nullable(),
  ema_12: z.number().nullable(),
  ema_21: z.number().nullable(),
  ema_26: z.number().nullable(),
  macd_line: z.number().nullable(),
  macd_signal: z.number().nullable(),
  macd_histogram: z.number().nullable(),
  bollinger_upper: z.number().nullable(),
  bollinger_middle: z.number().nullable(),
  bollinger_lower: z.number().nullable(),
  bollinger_bandwidth: z.number().nullable(),
  bollinger_percentb: z.number().nullable(),
  stochastic_k: z.number().nullable(),
  stochastic_d: z.number().nullable(),
  momentum_1m: z.number().nullable(),
  momentum_3m: z.number().nullable(),
  momentum_6m: z.number().nullable(),
  momentum_12m: z.number().nullable(),
  realized_vol_20d: z.number().nullable(),
  parkinson_vol_20d: z.number().nullable(),
});
export type PriceIndicators = z.infer<typeof PriceIndicatorsSchema>;

export const LiquidityIndicatorsSchema = z.object({
  bid_ask_spread: z.number().nullable(),
  bid_ask_spread_pct: z.number().nullable(),
  amihud_illiquidity: z.number().nullable(),
  vwap: z.number().nullable(),
  turnover_ratio: z.number().nullable(),
  volume_ratio: z.number().nullable(),
});
export type LiquidityIndicators = z.infer<typeof LiquidityIndicatorsSchema>;

export const OptionsIndicatorsSchema = z.object({
  atm_iv: z.number().nullable(),
  iv_skew_25d: z.number().nullable(),
  iv_put_25d: z.number().nullable(),
  iv_call_25d: z.number().nullable(),
  put_call_ratio_volume: z.number().nullable(),
  put_call_ratio_oi: z.number().nullable(),
  term_structure_slope: z.number().nullable(),
  front_month_iv: z.number().nullable(),
  back_month_iv: z.number().nullable(),
  vrp: z.number().nullable(),
  realized_vol_20d: z.number().nullable(),
  net_delta: z.number().nullable(),
  net_gamma: z.number().nullable(),
  net_theta: z.number().nullable(),
  net_vega: z.number().nullable(),
});
export type OptionsIndicators = z.infer<typeof OptionsIndicatorsSchema>;

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

export const ShortInterestIndicatorsSchema = z.object({
  short_interest_ratio: z.number().nullable(),
  days_to_cover: z.number().nullable(),
  short_pct_float: z.number().nullable(),
  short_interest_change: z.number().nullable(),
  settlement_date: z.string().nullable(),
});
export type ShortInterestIndicators = z.infer<typeof ShortInterestIndicatorsSchema>;

export const SentimentIndicatorsSchema = z.object({
  overall_score: z.number().nullable(),
  sentiment_strength: z.number().nullable(),
  news_volume: z.number().nullable(),
  sentiment_momentum: z.number().nullable(),
  event_risk: z.boolean().nullable(),
  classification: SentimentClassification.nullable(),
});
export type SentimentIndicators = z.infer<typeof SentimentIndicatorsSchema>;

export const CorporateIndicatorsSchema = z.object({
  trailing_dividend_yield: z.number().nullable(),
  ex_dividend_days: z.number().nullable(),
  upcoming_earnings_days: z.number().nullable(),
  recent_split: z.boolean().nullable(),
});
export type CorporateIndicators = z.infer<typeof CorporateIndicatorsSchema>;

export const MarketContextSchema = z.object({
  sector: z.string().nullable(),
  industry: z.string().nullable(),
  market_cap: z.number().nullable(),
  market_cap_category: MarketCapCategory.nullable(),
});
export type MarketContext = z.infer<typeof MarketContextSchema>;

export const TradingSession = z.enum(["PRE_MARKET", "RTH", "AFTER_HOURS", "CLOSED"]);
export type TradingSession = z.infer<typeof TradingSession>;

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

export const IndicatorSnapshotSchema = z.object({
  symbol: z.string(),
  timestamp: z.number(),
  price: PriceIndicatorsSchema,
  liquidity: LiquidityIndicatorsSchema,
  options: OptionsIndicatorsSchema,
  value: ValueIndicatorsSchema,
  quality: QualityIndicatorsSchema,
  short_interest: ShortInterestIndicatorsSchema,
  sentiment: SentimentIndicatorsSchema,
  corporate: CorporateIndicatorsSchema,
  market: MarketContextSchema,
  metadata: SnapshotMetadataSchema,
});
export type IndicatorSnapshot = z.infer<typeof IndicatorSnapshotSchema>;
