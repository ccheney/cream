/**
 * Thesis State Tables
 *
 * thesis_state, thesis_state_history
 */
import { sql } from "drizzle-orm";
import {
	index,
	integer,
	numeric,
	pgTable,
	serial,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { environmentEnum, thesisStateEnum } from "./enums";

// thesis_state: Active trading theses
export const thesisState = pgTable(
	"thesis_state",
	{
		thesisId: uuid("thesis_id").primaryKey().defaultRandom(),
		instrumentId: text("instrument_id").notNull(),
		state: thesisStateEnum("state").notNull(),
		entryPrice: numeric("entry_price", { precision: 12, scale: 4 }),
		entryDate: timestamp("entry_date", { withTimezone: true }),
		currentStop: numeric("current_stop", { precision: 12, scale: 4 }),
		currentTarget: numeric("current_target", { precision: 12, scale: 4 }),
		conviction: numeric("conviction", { precision: 4, scale: 3 }),
		entryThesis: text("entry_thesis"),
		invalidationConditions: text("invalidation_conditions"),
		addCount: integer("add_count").notNull().default(0),
		maxPositionReached: integer("max_position_reached").notNull().default(0),
		peakUnrealizedPnl: numeric("peak_unrealized_pnl", {
			precision: 14,
			scale: 2,
		}),
		closeReason: text("close_reason"),
		exitPrice: numeric("exit_price", { precision: 12, scale: 4 }),
		realizedPnl: numeric("realized_pnl", { precision: 14, scale: 2 }),
		realizedPnlPct: numeric("realized_pnl_pct", { precision: 8, scale: 4 }),
		environment: environmentEnum("environment").notNull(),
		notes: text("notes"),
		lastUpdated: timestamp("last_updated", { withTimezone: true })
			.notNull()
			.defaultNow(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		closedAt: timestamp("closed_at", { withTimezone: true }),
	},
	(table) => [
		index("idx_thesis_state_instrument").on(table.instrumentId),
		index("idx_thesis_state_state").on(table.state),
		index("idx_thesis_state_environment").on(table.environment),
		index("idx_thesis_state_created_at").on(table.createdAt),
		index("idx_thesis_state_closed_at").on(table.closedAt),
		index("idx_thesis_state_active")
			.on(table.environment, table.state)
			.where(sql`${table.state} != 'CLOSED'`),
		index("idx_thesis_state_instrument_active")
			.on(table.instrumentId, table.environment)
			.where(sql`${table.state} != 'CLOSED'`),
	],
);

// thesis_state_history: State transitions
export const thesisStateHistory = pgTable(
	"thesis_state_history",
	{
		id: serial("id").primaryKey(),
		thesisId: uuid("thesis_id")
			.notNull()
			.references(() => thesisState.thesisId, { onDelete: "cascade" }),
		fromState: thesisStateEnum("from_state").notNull(),
		toState: thesisStateEnum("to_state").notNull(),
		triggerReason: text("trigger_reason"),
		cycleId: uuid("cycle_id"),
		priceAtTransition: numeric("price_at_transition", {
			precision: 12,
			scale: 4,
		}),
		convictionAtTransition: numeric("conviction_at_transition", {
			precision: 4,
			scale: 3,
		}),
		notes: text("notes"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index("idx_thesis_history_thesis_id").on(table.thesisId),
		index("idx_thesis_history_created_at").on(table.createdAt),
		index("idx_thesis_history_thesis_created").on(
			table.thesisId,
			table.createdAt,
		),
	],
);
