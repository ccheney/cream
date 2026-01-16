/**
 * Audit Tables
 *
 * audit_log, parity_validation_history
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
import {
	environmentEnum,
	parityEntityTypeEnum,
	parityRecommendationEnum,
} from "./enums";

// audit_log: User action audit trail
export const auditLog = pgTable(
	"audit_log",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		timestamp: timestamp("timestamp", { withTimezone: true })
			.notNull()
			.defaultNow(),
		userId: text("user_id").notNull(),
		userEmail: text("user_email").notNull(),
		action: text("action").notNull(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		environment: environmentEnum("environment").notNull().default("LIVE"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index("idx_audit_log_user_id").on(table.userId),
		index("idx_audit_log_timestamp").on(table.timestamp),
		index("idx_audit_log_action").on(table.action),
		index("idx_audit_log_environment").on(table.environment),
	],
);

// parity_validation_history: Research-to-production validation history
export const parityValidationHistory = pgTable(
	"parity_validation_history",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		entityType: parityEntityTypeEnum("entity_type").notNull(),
		entityId: text("entity_id").notNull(),
		environment: environmentEnum("environment").notNull(),
		passed: boolean("passed").notNull(),
		recommendation: parityRecommendationEnum("recommendation").notNull(),
		blockingIssues: jsonb("blocking_issues").$type<string[]>(),
		warnings: jsonb("warnings").$type<string[]>(),
		fullReport: jsonb("full_report")
			.$type<Record<string, unknown>>()
			.notNull(),
		validatedAt: timestamp("validated_at", { withTimezone: true }).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index("idx_parity_history_entity").on(table.entityType, table.entityId),
		index("idx_parity_history_environment").on(table.environment),
		index("idx_parity_history_passed").on(table.passed),
		index("idx_parity_history_validated_at").on(table.validatedAt),
	],
);
