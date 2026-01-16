/**
 * Indicator Tables
 *
 * indicators, indicator_trials, indicator_ic_history,
 * fundamental_indicators, short_interest_indicators, sentiment_indicators,
 * options_indicators_cache, corporate_actions_indicators, indicator_sync_runs,
 * indicator_paper_signals
 */
import { sql } from "drizzle-orm";
import {
	boolean,
	index,
	integer,
	jsonb,
	numeric,
	pgTable,
	text,
	timestamp,
	unique,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import {
	environmentEnum,
	indicatorCategoryEnum,
	indicatorStatusEnum,
	syncRunStatusEnum,
} from "./enums";

// indicators: Indicator synthesis tracking
export const indicators = pgTable(
	"indicators",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		name: text("name").notNull().unique(),
		category: indicatorCategoryEnum("category").notNull(),
		status: indicatorStatusEnum("status").notNull().default("staging"),
		hypothesis: text("hypothesis").notNull(),
		economicRationale: text("economic_rationale").notNull(),
		generatedAt: timestamp("generated_at", { withTimezone: true }).notNull(),
		generatedBy: text("generated_by").notNull(),
		codeHash: text("code_hash"),
		astSignature: text("ast_signature"),
		validationReport: text("validation_report"),
		paperTradingStart: timestamp("paper_trading_start", { withTimezone: true }),
		paperTradingEnd: timestamp("paper_trading_end", { withTimezone: true }),
		paperTradingReport: text("paper_trading_report"),
		promotedAt: timestamp("promoted_at", { withTimezone: true }),
		prUrl: text("pr_url"),
		mergedAt: timestamp("merged_at", { withTimezone: true }),
		retiredAt: timestamp("retired_at", { withTimezone: true }),
		retirementReason: text("retirement_reason"),
		similarTo: uuid("similar_to"),
		replaces: uuid("replaces"),
		parityReport: text("parity_report"),
		parityValidatedAt: timestamp("parity_validated_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index("idx_indicators_status").on(table.status),
		index("idx_indicators_category").on(table.category),
		index("idx_indicators_code_hash").on(table.codeHash),
		index("idx_indicators_active")
			.on(table.status)
			.where(sql`${table.status} IN ('paper', 'production')`),
	],
);

// indicator_trials: Trial runs for indicators
export const indicatorTrials = pgTable(
	"indicator_trials",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		indicatorId: uuid("indicator_id")
			.notNull()
			.references(() => indicators.id, { onDelete: "cascade" }),
		trialNumber: integer("trial_number").notNull(),
		hypothesis: text("hypothesis").notNull(),
		parameters: jsonb("parameters")
			.$type<Record<string, unknown>>()
			.notNull(),
		sharpeRatio: numeric("sharpe_ratio", { precision: 8, scale: 4 }),
		informationCoefficient: numeric("information_coefficient", {
			precision: 6,
			scale: 4,
		}),
		maxDrawdown: numeric("max_drawdown", { precision: 6, scale: 4 }),
		calmarRatio: numeric("calmar_ratio", { precision: 8, scale: 4 }),
		sortinoRatio: numeric("sortino_ratio", { precision: 8, scale: 4 }),
		selected: boolean("selected").notNull().default(false),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		unique("indicator_trials_indicator_trial").on(
			table.indicatorId,
			table.trialNumber,
		),
		index("idx_trials_indicator").on(table.indicatorId),
	],
);

// indicator_ic_history: Information coefficient history
export const indicatorIcHistory = pgTable(
	"indicator_ic_history",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		indicatorId: uuid("indicator_id")
			.notNull()
			.references(() => indicators.id, { onDelete: "cascade" }),
		date: timestamp("date", { withTimezone: true }).notNull(),
		icValue: numeric("ic_value", { precision: 6, scale: 4 }).notNull(),
		icStd: numeric("ic_std", { precision: 6, scale: 4 }).notNull(),
		decisionsUsedIn: integer("decisions_used_in").notNull().default(0),
		decisionsCorrect: integer("decisions_correct").notNull().default(0),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		unique("indicator_ic_history_indicator_date").on(
			table.indicatorId,
			table.date,
		),
		index("idx_ic_history_indicator_date").on(table.indicatorId, table.date),
	],
);

// fundamental_indicators: Computed from market data
export const fundamentalIndicators = pgTable(
	"fundamental_indicators",
	{
		id: uuid("id").primaryKey().defaultRandom(),
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
		computedAt: timestamp("computed_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
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
		id: uuid("id").primaryKey().defaultRandom(),
		symbol: text("symbol").notNull(),
		settlementDate: timestamp("settlement_date", { withTimezone: true }).notNull(),

		shortInterest: numeric("short_interest", { precision: 18, scale: 0 }).notNull(),
		shortInterestRatio: numeric("short_interest_ratio", { precision: 8, scale: 2 }),
		daysToCover: numeric("days_to_cover", { precision: 8, scale: 2 }),
		shortPctFloat: numeric("short_pct_float", { precision: 8, scale: 4 }),
		shortInterestChange: numeric("short_interest_change", { precision: 8, scale: 4 }),

		source: text("source").notNull().default("FINRA"),
		fetchedAt: timestamp("fetched_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
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
		id: uuid("id").primaryKey().defaultRandom(),
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

		computedAt: timestamp("computed_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
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
		id: uuid("id").primaryKey().defaultRandom(),
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
		id: uuid("id").primaryKey().defaultRandom(),
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
		id: uuid("id").primaryKey().defaultRandom(),
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

// indicator_paper_signals: Paper trading signal recording
export const indicatorPaperSignals = pgTable(
	"indicator_paper_signals",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		indicatorId: uuid("indicator_id")
			.notNull()
			.references(() => indicators.id, { onDelete: "cascade" }),
		symbol: text("symbol").notNull(),
		signalDate: timestamp("signal_date", { withTimezone: true }).notNull(),
		signal: numeric("signal", { precision: 5, scale: 4 }).notNull(),
		outcome: numeric("outcome", { precision: 8, scale: 4 }),
		outcomeDate: timestamp("outcome_date", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		unique("indicator_paper_signals_unique").on(
			table.indicatorId,
			table.symbol,
			table.signalDate,
		),
		index("idx_paper_signals_indicator").on(table.indicatorId),
		index("idx_paper_signals_symbol").on(table.symbol),
		index("idx_paper_signals_date").on(table.signalDate),
	],
);
