/**
 * Authentication Tables (better-auth compatible)
 *
 * user, session, account, verification, two_factor
 *
 * Note: Field names use snake_case to match better-auth expectations.
 * Timestamps use PostgreSQL timestamp type for better-auth compatibility.
 */

import { sql } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// user: Core user table
export const user = pgTable(
	"user",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		name: text("name").notNull(),
		email: text("email").notNull().unique(),
		email_verified: boolean("email_verified").notNull().default(false),
		image: text("image"),
		two_factor_enabled: boolean("two_factor_enabled").default(false),
		created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updated_at: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("idx_user_email").on(table.email),
		index("idx_user_created_at").on(table.created_at),
	],
);

// session: User sessions
export const session = pgTable(
	"session",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
		token: text("token").notNull().unique(),
		ip_address: text("ip_address"),
		user_agent: text("user_agent"),
		user_id: uuid("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updated_at: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("idx_session_user_id").on(table.user_id),
		index("idx_session_token").on(table.token),
		index("idx_session_expires_at").on(table.expires_at),
	],
);

// account: OAuth provider accounts
export const account = pgTable(
	"account",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		account_id: text("account_id").notNull(),
		provider_id: text("provider_id").notNull(),
		user_id: uuid("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		access_token: text("access_token"),
		refresh_token: text("refresh_token"),
		id_token: text("id_token"),
		access_token_expires_at: timestamp("access_token_expires_at", { withTimezone: true }),
		refresh_token_expires_at: timestamp("refresh_token_expires_at", { withTimezone: true }),
		scope: text("scope"),
		password: text("password"),
		created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updated_at: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("idx_account_user_id").on(table.user_id),
		index("idx_account_provider_id").on(table.provider_id),
		index("idx_account_provider_account").on(table.provider_id, table.account_id),
	],
);

// verification: Email/token verification
export const verification = pgTable(
	"verification",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
		created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updated_at: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("idx_verification_identifier").on(table.identifier),
		index("idx_verification_expires_at").on(table.expires_at),
	],
);

// two_factor: Two-factor authentication secrets
export const twoFactor = pgTable(
	"two_factor",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		secret: text("secret").notNull(),
		backup_codes: text("backup_codes").notNull(),
		user_id: uuid("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
	},
	(table) => [
		index("idx_two_factor_user_id").on(table.user_id),
		index("idx_two_factor_secret").on(table.secret),
	],
);
