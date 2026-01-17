/**
 * External Data Tables
 *
 * prediction_market_snapshots, prediction_market_signals, prediction_market_arbitrage,
 * external_events, filings, filing_sync_runs, macro_watch_entries, morning_newspapers
 */
import { sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	jsonb,
	numeric,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import {
	environmentEnum,
	externalEventSourceEnum,
	filingStatusEnum,
	filingTypeEnum,
	macroWatchCategoryEnum,
	macroWatchSessionEnum,
	predictionMarketPlatformEnum,
	predictionMarketTypeEnum,
	sentimentEnum,
	syncRunStatusEnum,
	syncTriggerSourceEnum,
} from "./enums";

// prediction_market_snapshots: Point-in-time market data
export const predictionMarketSnapshots = pgTable(
	"prediction_market_snapshots",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		platform: predictionMarketPlatformEnum("platform").notNull(),
		marketTicker: text("market_ticker").notNull(),
		marketType: predictionMarketTypeEnum("market_type").notNull(),
		marketQuestion: text("market_question"),
		snapshotTime: timestamp("snapshot_time", { withTimezone: true }).notNull(),
		data: jsonb("data").$type<Record<string, unknown>>().notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		index("idx_pm_snapshots_platform").on(table.platform),
		index("idx_pm_snapshots_ticker").on(table.marketTicker),
		index("idx_pm_snapshots_type").on(table.marketType),
		index("idx_pm_snapshots_time").on(table.snapshotTime),
	]
);

// prediction_market_signals: Derived signals from prediction markets
export const predictionMarketSignals = pgTable(
	"prediction_market_signals",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		signalType: text("signal_type").notNull(),
		signalValue: numeric("signal_value", { precision: 8, scale: 4 }).notNull(),
		confidence: numeric("confidence", { precision: 4, scale: 3 }),
		computedAt: timestamp("computed_at", { withTimezone: true }).notNull(),
		inputs: jsonb("inputs").$type<Record<string, unknown>>().notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		check(
			"valid_confidence",
			sql`${table.confidence} IS NULL OR (${table.confidence}::numeric >= 0 AND ${table.confidence}::numeric <= 1)`
		),
		index("idx_pm_signals_type").on(table.signalType),
		index("idx_pm_signals_time").on(table.computedAt),
	]
);

// prediction_market_arbitrage: Cross-platform price divergences
export const predictionMarketArbitrage = pgTable(
	"prediction_market_arbitrage",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		kalshiTicker: text("kalshi_ticker").notNull(),
		polymarketToken: text("polymarket_token").notNull(),
		kalshiPrice: numeric("kalshi_price", { precision: 6, scale: 4 }).notNull(),
		polymarketPrice: numeric("polymarket_price", {
			precision: 6,
			scale: 4,
		}).notNull(),
		divergencePct: numeric("divergence_pct", {
			precision: 6,
			scale: 4,
		}).notNull(),
		marketType: predictionMarketTypeEnum("market_type").notNull(),
		detectedAt: timestamp("detected_at", { withTimezone: true }).notNull(),
		resolvedAt: timestamp("resolved_at", { withTimezone: true }),
		resolutionPrice: numeric("resolution_price", { precision: 6, scale: 4 }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		index("idx_pm_arbitrage_divergence").on(table.divergencePct),
		index("idx_pm_arbitrage_detected").on(table.detectedAt),
		index("idx_pm_arbitrage_unresolved")
			.on(table.resolvedAt)
			.where(sql`${table.resolvedAt} IS NULL`),
	]
);

// external_events: Processed external events (news, earnings, etc.)
export const externalEvents = pgTable(
	"external_events",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		sourceType: externalEventSourceEnum("source_type").notNull(),
		eventType: text("event_type").notNull(),
		eventTime: timestamp("event_time", { withTimezone: true }).notNull(),
		processedAt: timestamp("processed_at", { withTimezone: true }).notNull(),
		sentiment: sentimentEnum("sentiment").notNull(),
		confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull(),
		importance: integer("importance").notNull(),
		summary: text("summary").notNull(),
		keyInsights: jsonb("key_insights").$type<string[]>().notNull(),
		entities: jsonb("entities").$type<string[]>().notNull(),
		dataPoints: jsonb("data_points").$type<Record<string, unknown>[]>().notNull(),
		sentimentScore: numeric("sentiment_score", {
			precision: 5,
			scale: 4,
		}).notNull(),
		importanceScore: numeric("importance_score", {
			precision: 5,
			scale: 4,
		}).notNull(),
		surpriseScore: numeric("surprise_score", {
			precision: 5,
			scale: 4,
		}).notNull(),
		relatedInstruments: jsonb("related_instruments").$type<string[]>().notNull(),
		originalContent: text("original_content").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		check(
			"valid_confidence",
			sql`${table.confidence}::numeric >= 0 AND ${table.confidence}::numeric <= 1`
		),
		check("valid_importance", sql`${table.importance} >= 1 AND ${table.importance} <= 10`),
		check(
			"valid_sentiment_score",
			sql`${table.sentimentScore}::numeric >= -1 AND ${table.sentimentScore}::numeric <= 1`
		),
		check(
			"valid_importance_score",
			sql`${table.importanceScore}::numeric >= 0 AND ${table.importanceScore}::numeric <= 1`
		),
		check(
			"valid_surprise_score",
			sql`${table.surpriseScore}::numeric >= 0 AND ${table.surpriseScore}::numeric <= 1`
		),
		index("idx_external_events_event_time").on(table.eventTime),
		index("idx_external_events_source_type").on(table.sourceType),
		index("idx_external_events_event_type").on(table.eventType),
		index("idx_external_events_processed_at").on(table.processedAt),
		index("idx_external_events_sentiment").on(table.sentiment),
		index("idx_external_events_importance").on(table.importanceScore),
	]
);

// filings: SEC filings tracking
export const filings = pgTable(
	"filings",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		accessionNumber: text("accession_number").notNull().unique(),
		symbol: text("symbol").notNull(),
		filingType: filingTypeEnum("filing_type").notNull(),
		filedDate: timestamp("filed_date", { withTimezone: true }).notNull(),
		reportDate: timestamp("report_date", { withTimezone: true }),

		companyName: text("company_name"),
		cik: text("cik"),

		sectionCount: integer("section_count").default(0),
		chunkCount: integer("chunk_count").default(0),

		status: filingStatusEnum("status").notNull().default("pending"),
		errorMessage: text("error_message"),

		ingestedAt: timestamp("ingested_at", { withTimezone: true }).notNull(),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		index("idx_filings_symbol").on(table.symbol),
		index("idx_filings_filing_type").on(table.filingType),
		index("idx_filings_filed_date").on(table.filedDate),
		index("idx_filings_status").on(table.status),
		index("idx_filings_symbol_type").on(table.symbol, table.filingType),
		index("idx_filings_symbol_date").on(table.symbol, table.filedDate),
	]
);

// filing_sync_runs: Track sync job executions
export const filingSyncRuns = pgTable(
	"filing_sync_runs",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
		completedAt: timestamp("completed_at", { withTimezone: true }),

		symbolsRequested: jsonb("symbols_requested").$type<string[]>().notNull(),
		filingTypes: jsonb("filing_types").$type<string[]>().notNull(),
		dateRangeStart: timestamp("date_range_start", { withTimezone: true }),
		dateRangeEnd: timestamp("date_range_end", { withTimezone: true }),

		symbolsTotal: integer("symbols_total").default(0),
		symbolsProcessed: integer("symbols_processed").default(0),
		filingsFetched: integer("filings_fetched").default(0),
		filingsIngested: integer("filings_ingested").default(0),
		chunksCreated: integer("chunks_created").default(0),

		status: syncRunStatusEnum("status").notNull().default("running"),
		errorMessage: text("error_message"),

		triggerSource: syncTriggerSourceEnum("trigger_source").notNull(),
		environment: environmentEnum("environment").notNull(),

		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		index("idx_filing_sync_runs_started_at").on(table.startedAt),
		index("idx_filing_sync_runs_status").on(table.status),
		index("idx_filing_sync_runs_environment").on(table.environment),
		index("idx_filing_sync_runs_trigger").on(table.triggerSource),
	]
);

// macro_watch_entries: Overnight macro watch entries
export const macroWatchEntries = pgTable(
	"macro_watch_entries",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
		session: macroWatchSessionEnum("session").notNull(),
		category: macroWatchCategoryEnum("category").notNull(),
		headline: text("headline").notNull(),
		symbols: jsonb("symbols").$type<string[]>().notNull(),
		source: text("source").notNull(),
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		index("idx_macro_watch_timestamp").on(table.timestamp),
		index("idx_macro_watch_category").on(table.category),
		index("idx_macro_watch_session").on(table.session),
	]
);

// morning_newspapers: Compiled daily digests
export const morningNewspapers = pgTable(
	"morning_newspapers",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		date: text("date").notNull().unique(),
		compiledAt: timestamp("compiled_at", { withTimezone: true }).notNull(),
		sections: jsonb("sections")
			.$type<{
				macro?: unknown;
				universe?: unknown;
				predictionMarkets?: unknown;
				economicCalendar?: unknown;
			}>()
			.notNull(),
		rawEntryIds: jsonb("raw_entry_ids").$type<string[]>().notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [index("idx_morning_newspapers_date").on(table.date)]
);
