/**
 * Dashboard Tables
 *
 * alerts, system_state
 */
import { sql } from "drizzle-orm";
import {
	boolean,
	index,
	jsonb,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { alertSeverityEnum, environmentEnum, systemStatusEnum } from "./enums";

// alerts: System and trading alerts
export const alerts = pgTable(
	"alerts",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		severity: alertSeverityEnum("severity").notNull(),
		type: text("type").notNull(),
		title: text("title").notNull(),
		message: text("message").notNull(),
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
		acknowledged: boolean("acknowledged").notNull().default(false),
		acknowledgedBy: text("acknowledged_by"),
		acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
		environment: environmentEnum("environment").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		expiresAt: timestamp("expires_at", { withTimezone: true }),
	},
	(table) => [
		index("idx_alerts_severity").on(table.severity),
		index("idx_alerts_type").on(table.type),
		index("idx_alerts_acknowledged").on(table.acknowledged),
		index("idx_alerts_created_at").on(table.createdAt),
		index("idx_alerts_environment").on(table.environment),
		index("idx_alerts_unack_env")
			.on(table.environment, table.acknowledged)
			.where(sql`${table.acknowledged} = false`),
	]
);

// system_state: Current system state per environment
export const systemState = pgTable("system_state", {
	environment: environmentEnum("environment").primaryKey(),
	status: systemStatusEnum("status").notNull().default("stopped"),
	lastCycleId: uuid("last_cycle_id"),
	lastCycleTime: timestamp("last_cycle_time", { withTimezone: true }),
	currentPhase: text("current_phase"),
	phaseStartedAt: timestamp("phase_started_at", { withTimezone: true }),
	nextCycleAt: timestamp("next_cycle_at", { withTimezone: true }),
	errorMessage: text("error_message"),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
