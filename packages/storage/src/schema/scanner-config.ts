/**
 * Scanner Configuration Table
 *
 * Stores environment-scoped scanner settings with draft/active workflow.
 */
import { sql } from "drizzle-orm";
import {
	bigint,
	boolean,
	index,
	integer,
	numeric,
	pgTable,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { configStatusEnum, environmentEnum } from "./enums";

export const scannerConfigs = pgTable(
	"scanner_configs",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		environment: environmentEnum("environment").notNull(),
		minPrice: numeric("min_price", { precision: 10, scale: 2 }).notNull().default("5.0"),
		minAvgVolume: bigint("min_avg_volume", { mode: "number" }).notNull().default(100_000),
		volumeSpikeThreshold: numeric("volume_spike_threshold", { precision: 10, scale: 4 })
			.notNull()
			.default("3.0"),
		priceMoveThreshold: numeric("price_move_threshold", { precision: 10, scale: 4 })
			.notNull()
			.default("2.0"),
		gapThreshold: numeric("gap_threshold", { precision: 10, scale: 4 }).notNull().default("2.0"),
		maxCandidates: integer("max_candidates").notNull().default(10),
		cooldownSeconds: bigint("cooldown_seconds", { mode: "number" }).notNull().default(300),
		enabled: boolean("enabled").notNull().default(true),
		status: configStatusEnum("status").notNull().default("draft"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		index("idx_scanner_configs_environment").on(table.environment),
		index("idx_scanner_configs_status").on(table.status),
		index("idx_scanner_configs_env_status").on(table.environment, table.status),
		uniqueIndex("idx_scanner_configs_env_active")
			.on(table.environment)
			.where(sql`${table.status} = 'active'`),
	],
);
