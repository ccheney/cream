import { z } from "zod";

import { SyncRunStatus, SyncRunType } from "./enums";

export const FundamentalIndicatorsRowSchema = z.object({
	id: z.string(),
	symbol: z.string(),
	date: z.string(),
	pe_ratio_ttm: z.number().nullable(),
	pe_ratio_forward: z.number().nullable(),
	pb_ratio: z.number().nullable(),
	ev_ebitda: z.number().nullable(),
	earnings_yield: z.number().nullable(),
	dividend_yield: z.number().nullable(),
	cape_10yr: z.number().nullable(),
	gross_profitability: z.number().nullable(),
	roe: z.number().nullable(),
	roa: z.number().nullable(),
	asset_growth: z.number().nullable(),
	accruals_ratio: z.number().nullable(),
	cash_flow_quality: z.number().nullable(),
	beneish_m_score: z.number().nullable(),
	market_cap: z.number().nullable(),
	sector: z.string().nullable(),
	industry: z.string().nullable(),
	source: z.string(),
	computed_at: z.string(),
});
export type FundamentalIndicatorsRow = z.infer<typeof FundamentalIndicatorsRowSchema>;

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
