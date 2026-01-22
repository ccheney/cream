/**
 * Indicator Tables
 *
 * fundamental_indicators, short_interest_indicators, sentiment_indicators,
 * options_indicators_cache, corporate_actions_indicators, indicator_sync_runs
 */
import { sql } from "drizzle-orm";
import {
	boolean,
	index,
	integer,
	numeric,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import { environmentEnum, syncRunStatusEnum } from "./enums";

// fundamental_indicators: Computed from market data
export const fundamentalIndicators = pgTable(
	"fundamental_indicators",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		symbol: text("symbol").notNull(),
		date: timestamp("date", { withTimezone: true }).notNull(),

		// Value factors
		peRatioTtm: numeric("pe_ratio_ttm", { precision: 10, scale: 2 }),
		peRatioForward: numeric("pe_ratio_forward", { precision: 10, scale: 2 }),
		pbRatio: numeric("pb_ratio", { precision: 10, scale: 2 }),
		evEbitda: numeric("ev_ebitda", { precision: 10, scale: 2 }),
		earningsYield: numeric("earnings_yield", { precision: 8, scale: 4 }),
		dividendYield: numeric("dividend_yield", { precision: 8, scale: 4 }),
		cape10yr: numeric("cape_10yr", { precision: 10, scale: 2 }),

		// Quality factors
		grossProfitability: numeric("gross_profitability", { precision: 8, scale: 4 }),
		roe: numeric("roe", { precision: 8, scale: 4 }),
		roa: numeric("roa", { precision: 8, scale: 4 }),
		assetGrowth: numeric("asset_growth", { precision: 8, scale: 4 }),
		accrualsRatio: numeric("accruals_ratio", { precision: 8, scale: 4 }),
		cashFlowQuality: numeric("cash_flow_quality", { precision: 8, scale: 4 }),
		beneishMScore: numeric("beneish_m_score", { precision: 8, scale: 4 }),

		// Size/market context
		marketCap: numeric("market_cap", { precision: 18, scale: 2 }),
		sector: text("sector"),
		industry: text("industry"),

		source: text("source").notNull().default("computed"),
		computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		unique("fundamental_indicators_symbol_date").on(table.symbol, table.date),
		index("idx_fundamental_symbol_date").on(table.symbol, table.date),
		index("idx_fundamental_symbol").on(table.symbol),
	],
);

// short_interest_indicators: Bi-weekly batch from FINRA
export const shortInterestIndicators = pgTable(
	"short_interest_indicators",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		symbol: text("symbol").notNull(),
		settlementDate: timestamp("settlement_date", { withTimezone: true }).notNull(),

		shortInterest: numeric("short_interest", { precision: 18, scale: 0 }).notNull(),
		shortInterestRatio: numeric("short_interest_ratio", { precision: 8, scale: 2 }),
		daysToCover: numeric("days_to_cover", { precision: 8, scale: 2 }),
		shortPctFloat: numeric("short_pct_float", { precision: 8, scale: 4 }),
		shortInterestChange: numeric("short_interest_change", { precision: 8, scale: 4 }),

		source: text("source").notNull().default("FINRA"),
		fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		unique("short_interest_symbol_date").on(table.symbol, table.settlementDate),
		index("idx_short_interest_symbol").on(table.symbol, table.settlementDate),
		index("idx_short_interest_settlement").on(table.settlementDate),
	],
);

// sentiment_indicators: Nightly aggregation
export const sentimentIndicators = pgTable(
	"sentiment_indicators",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		symbol: text("symbol").notNull(),
		date: timestamp("date", { withTimezone: true }).notNull(),

		sentimentScore: numeric("sentiment_score", { precision: 5, scale: 4 }),
		sentimentStrength: numeric("sentiment_strength", { precision: 5, scale: 4 }),
		newsVolume: integer("news_volume"),
		sentimentMomentum: numeric("sentiment_momentum", { precision: 5, scale: 4 }),
		eventRiskFlag: boolean("event_risk_flag").default(false),

		newsSentiment: numeric("news_sentiment", { precision: 5, scale: 4 }),
		socialSentiment: numeric("social_sentiment", { precision: 5, scale: 4 }),
		analystSentiment: numeric("analyst_sentiment", { precision: 5, scale: 4 }),

		computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		unique("sentiment_indicators_symbol_date").on(table.symbol, table.date),
		index("idx_sentiment_symbol_date").on(table.symbol, table.date),
		index("idx_sentiment_symbol").on(table.symbol),
	],
);

// options_indicators_cache: Refreshed hourly
export const optionsIndicatorsCache = pgTable(
	"options_indicators_cache",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		symbol: text("symbol").notNull().unique(),
		timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),

		impliedVolatility: numeric("implied_volatility", { precision: 8, scale: 4 }),
		ivPercentile30d: numeric("iv_percentile_30d", { precision: 5, scale: 2 }),
		ivSkew: numeric("iv_skew", { precision: 8, scale: 4 }),
		putCallRatio: numeric("put_call_ratio", { precision: 8, scale: 4 }),
		vrp: numeric("vrp", { precision: 8, scale: 4 }),
		termStructureSlope: numeric("term_structure_slope", { precision: 8, scale: 4 }),

		netDelta: numeric("net_delta", { precision: 12, scale: 4 }),
		netGamma: numeric("net_gamma", { precision: 12, scale: 4 }),
		netTheta: numeric("net_theta", { precision: 12, scale: 4 }),
		netVega: numeric("net_vega", { precision: 12, scale: 4 }),

		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	},
	(table) => [
		index("idx_options_cache_symbol").on(table.symbol),
		index("idx_options_cache_expires").on(table.expiresAt),
	],
);

// corporate_actions_indicators: Daily update
export const corporateActionsIndicators = pgTable(
	"corporate_actions_indicators",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		symbol: text("symbol").notNull(),
		date: timestamp("date", { withTimezone: true }).notNull(),

		trailingDividendYield: numeric("trailing_dividend_yield", {
			precision: 8,
			scale: 4,
		}),
		exDividendDays: integer("ex_dividend_days"),
		upcomingEarningsDays: integer("upcoming_earnings_days"),
		recentSplit: boolean("recent_split").default(false),
		splitRatio: text("split_ratio"),
	},
	(table) => [
		unique("corp_actions_indicators_symbol_date").on(table.symbol, table.date),
		index("idx_corp_actions_symbol").on(table.symbol, table.date),
		index("idx_corp_actions_symbol_only").on(table.symbol),
	],
);

// indicator_sync_runs: Tracking indicator sync jobs
export const indicatorSyncRuns = pgTable(
	"indicator_sync_runs",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		runType: text("run_type").notNull(),
		startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		symbolsProcessed: integer("symbols_processed").default(0),
		symbolsFailed: integer("symbols_failed").default(0),
		status: syncRunStatusEnum("status").notNull().default("running"),
		errorMessage: text("error_message"),
		environment: environmentEnum("environment").notNull(),
	},
	(table) => [
		index("idx_indicator_sync_runs_type").on(table.runType),
		index("idx_indicator_sync_runs_status").on(table.status),
		index("idx_indicator_sync_runs_started").on(table.startedAt),
	],
);
