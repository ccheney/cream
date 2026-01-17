/**
 * Market Data Tables
 *
 * candles, corporate_actions, universe_cache, features, regime_labels
 */
import { sql } from "drizzle-orm";
import {
	boolean,
	check,
	index,
	integer,
	jsonb,
	numeric,
	pgTable,
	serial,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { corporateActionTypeEnum, regimeEnum, timeframeEnum } from "./enums";

// candles: OHLCV data (will be converted to TimescaleDB hypertable)
export const candles = pgTable(
	"candles",
	{
		id: serial("id").primaryKey(),
		symbol: text("symbol").notNull(),
		timeframe: timeframeEnum("timeframe").notNull(),
		timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
		open: numeric("open", { precision: 12, scale: 4 }).notNull(),
		high: numeric("high", { precision: 12, scale: 4 }).notNull(),
		low: numeric("low", { precision: 12, scale: 4 }).notNull(),
		close: numeric("close", { precision: 12, scale: 4 }).notNull(),
		volume: numeric("volume", { precision: 18, scale: 0 }).notNull().default("0"),
		vwap: numeric("vwap", { precision: 12, scale: 4 }),
		tradeCount: integer("trade_count"),
		adjusted: boolean("adjusted").notNull().default(false),
		splitAdjusted: boolean("split_adjusted").notNull().default(false),
		dividendAdjusted: boolean("dividend_adjusted").notNull().default(false),
		qualityFlags: jsonb("quality_flags").$type<string[]>().default([]),
		provider: text("provider").notNull().default("alpaca"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		check(
			"valid_ohlc",
			sql`${table.high}::numeric >= ${table.low}::numeric AND
          ${table.high}::numeric >= ${table.open}::numeric AND
          ${table.high}::numeric >= ${table.close}::numeric AND
          ${table.low}::numeric <= ${table.open}::numeric AND
          ${table.low}::numeric <= ${table.close}::numeric`
		),
		check("positive_volume", sql`${table.volume}::numeric >= 0`),
		uniqueIndex("idx_candles_symbol_timeframe_ts").on(
			table.symbol,
			table.timeframe,
			table.timestamp
		),
		index("idx_candles_timestamp").on(table.timestamp),
		index("idx_candles_symbol").on(table.symbol),
		index("idx_candles_timeframe").on(table.timeframe),
	]
);

// corporate_actions: Splits, dividends, mergers
export const corporateActions = pgTable(
	"corporate_actions",
	{
		id: serial("id").primaryKey(),
		symbol: text("symbol").notNull(),
		actionType: corporateActionTypeEnum("action_type").notNull(),
		exDate: timestamp("ex_date", { withTimezone: true }).notNull(),
		recordDate: timestamp("record_date", { withTimezone: true }),
		payDate: timestamp("pay_date", { withTimezone: true }),
		ratio: numeric("ratio", { precision: 10, scale: 6 }),
		amount: numeric("amount", { precision: 12, scale: 4 }),
		details: text("details"),
		provider: text("provider").notNull().default("alpaca"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		index("idx_corporate_actions_symbol_date").on(table.symbol, table.exDate),
		index("idx_corporate_actions_ex_date").on(table.exDate),
		index("idx_corporate_actions_type").on(table.actionType),
		uniqueIndex("idx_corporate_actions_unique").on(table.symbol, table.actionType, table.exDate),
	]
);

// universe_cache: Cached universe resolution
export const universeCache = pgTable(
	"universe_cache",
	{
		id: serial("id").primaryKey(),
		sourceType: text("source_type").notNull(),
		sourceId: text("source_id").notNull(),
		sourceHash: text("source_hash").notNull(),
		tickers: jsonb("tickers").$type<string[]>().notNull(),
		tickerCount: integer("ticker_count").notNull(),
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
		cachedAt: timestamp("cached_at", { withTimezone: true }).notNull().defaultNow(),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		provider: text("provider"),
	},
	(table) => [
		uniqueIndex("idx_universe_cache_source").on(table.sourceType, table.sourceId),
		index("idx_universe_cache_expires").on(table.expiresAt),
		index("idx_universe_cache_hash").on(table.sourceHash),
	]
);

// features: Computed indicators
export const features = pgTable(
	"features",
	{
		id: serial("id").primaryKey(),
		symbol: text("symbol").notNull(),
		timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
		timeframe: timeframeEnum("timeframe").notNull(),
		indicatorName: text("indicator_name").notNull(),
		rawValue: numeric("raw_value", { precision: 18, scale: 8 }).notNull(),
		normalizedValue: numeric("normalized_value", { precision: 8, scale: 6 }),
		parameters: jsonb("parameters").$type<Record<string, unknown>>(),
		qualityScore: numeric("quality_score", { precision: 4, scale: 3 }),
		computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		check(
			"valid_quality_score",
			sql`${table.qualityScore} IS NULL OR (${table.qualityScore}::numeric >= 0 AND ${table.qualityScore}::numeric <= 1)`
		),
		uniqueIndex("idx_features_symbol_ts_indicator").on(
			table.symbol,
			table.timestamp,
			table.timeframe,
			table.indicatorName
		),
		index("idx_features_symbol_indicator_ts").on(
			table.symbol,
			table.indicatorName,
			table.timestamp
		),
		index("idx_features_timestamp").on(table.timestamp),
		index("idx_features_indicator").on(table.indicatorName),
	]
);

// regime_labels: Market regime classifications
export const regimeLabels = pgTable(
	"regime_labels",
	{
		id: serial("id").primaryKey(),
		symbol: text("symbol").notNull(),
		timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
		timeframe: timeframeEnum("timeframe").notNull(),
		regime: regimeEnum("regime").notNull(),
		confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull(),
		trendStrength: numeric("trend_strength", { precision: 4, scale: 3 }),
		volatilityPercentile: numeric("volatility_percentile", {
			precision: 5,
			scale: 2,
		}),
		correlationToMarket: numeric("correlation_to_market", {
			precision: 4,
			scale: 3,
		}),
		modelName: text("model_name").notNull().default("hmm_regime"),
		modelVersion: text("model_version"),
		computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		check(
			"valid_confidence",
			sql`${table.confidence}::numeric >= 0 AND ${table.confidence}::numeric <= 1`
		),
		check(
			"valid_trend_strength",
			sql`${table.trendStrength} IS NULL OR (${table.trendStrength}::numeric >= 0 AND ${table.trendStrength}::numeric <= 1)`
		),
		check(
			"valid_correlation",
			sql`${table.correlationToMarket} IS NULL OR (${table.correlationToMarket}::numeric >= -1 AND ${table.correlationToMarket}::numeric <= 1)`
		),
		uniqueIndex("idx_regime_labels_symbol_ts_tf").on(
			table.symbol,
			table.timestamp,
			table.timeframe
		),
		index("idx_regime_labels_symbol_ts").on(table.symbol, table.timestamp),
		index("idx_regime_labels_regime").on(table.regime),
		index("idx_regime_labels_market")
			.on(table.symbol, table.timestamp)
			.where(sql`${table.symbol} = '_MARKET'`),
	]
);
