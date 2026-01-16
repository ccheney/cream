/**
 * Historical Universe Tables
 *
 * index_constituents, ticker_changes, universe_snapshots
 */
import {
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
import { tickerChangeTypeEnum } from "./enums";

// index_constituents: Point-in-time index membership
export const indexConstituents = pgTable(
	"index_constituents",
	{
		id: serial("id").primaryKey(),
		indexId: text("index_id").notNull(),
		symbol: text("symbol").notNull(),
		dateAdded: timestamp("date_added", { withTimezone: true }).notNull(),
		dateRemoved: timestamp("date_removed", { withTimezone: true }),
		reasonAdded: text("reason_added"),
		reasonRemoved: text("reason_removed"),
		sector: text("sector"),
		industry: text("industry"),
		marketCapAtAdd: numeric("market_cap_at_add", { precision: 18, scale: 2 }),
		provider: text("provider").notNull().default("alpaca"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		index("idx_index_constituents_pit").on(table.indexId, table.dateAdded, table.dateRemoved),
		index("idx_index_constituents_symbol").on(table.symbol, table.indexId),
		index("idx_index_constituents_current").on(table.indexId, table.dateRemoved),
		uniqueIndex("idx_index_constituents_unique").on(table.indexId, table.symbol, table.dateAdded),
	]
);

// ticker_changes: Symbol renames, mergers, spinoffs
export const tickerChanges = pgTable(
	"ticker_changes",
	{
		id: serial("id").primaryKey(),
		oldSymbol: text("old_symbol").notNull(),
		newSymbol: text("new_symbol").notNull(),
		changeDate: timestamp("change_date", { withTimezone: true }).notNull(),
		changeType: tickerChangeTypeEnum("change_type").notNull(),
		conversionRatio: numeric("conversion_ratio", { precision: 10, scale: 6 }),
		reason: text("reason"),
		acquiringCompany: text("acquiring_company"),
		provider: text("provider").notNull().default("alpaca"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		index("idx_ticker_changes_old").on(table.oldSymbol, table.changeDate),
		index("idx_ticker_changes_new").on(table.newSymbol, table.changeDate),
		index("idx_ticker_changes_date").on(table.changeDate),
		uniqueIndex("idx_ticker_changes_unique").on(table.oldSymbol, table.newSymbol, table.changeDate),
	]
);

// universe_snapshots: Point-in-time universe composition
export const universeSnapshots = pgTable(
	"universe_snapshots",
	{
		id: serial("id").primaryKey(),
		snapshotDate: timestamp("snapshot_date", { withTimezone: true }).notNull(),
		indexId: text("index_id").notNull(),
		tickers: jsonb("tickers").$type<string[]>().notNull(),
		tickerCount: integer("ticker_count").notNull(),
		sourceVersion: text("source_version"),
		computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
		expiresAt: timestamp("expires_at", { withTimezone: true }),
	},
	(table) => [
		uniqueIndex("idx_universe_snapshots_pit").on(table.indexId, table.snapshotDate),
		index("idx_universe_snapshots_date").on(table.snapshotDate),
	]
);
