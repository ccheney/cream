/**
 * Authentication Tables (better-auth compatible)
 *
 * user, session, account, verification, two_factor
 *
 * Note: Timestamps use bigint (milliseconds since epoch) for better-auth compatibility.
 */
import {
	bigint,
	boolean,
	index,
	pgTable,
	text,
	uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// user: Core user table
export const user = pgTable(
	"user",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		name: text("name").notNull(),
		email: text("email").notNull().unique(),
		emailVerified: boolean("email_verified").notNull().default(false),
		image: text("image"),
		twoFactorEnabled: boolean("two_factor_enabled").default(false),
		createdAt: bigint("created_at", { mode: "number" })
			.notNull()
			.default(sql`(extract(epoch from now()) * 1000)::bigint`),
		updatedAt: bigint("updated_at", { mode: "number" })
			.notNull()
			.default(sql`(extract(epoch from now()) * 1000)::bigint`),
	},
	(table) => [
		index("idx_user_email").on(table.email),
		index("idx_user_created_at").on(table.createdAt),
	],
);

// session: User sessions
export const session = pgTable(
	"session",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
		token: text("token").notNull().unique(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		userId: uuid("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		createdAt: bigint("created_at", { mode: "number" })
			.notNull()
			.default(sql`(extract(epoch from now()) * 1000)::bigint`),
		updatedAt: bigint("updated_at", { mode: "number" })
			.notNull()
			.default(sql`(extract(epoch from now()) * 1000)::bigint`),
	},
	(table) => [
		index("idx_session_user_id").on(table.userId),
		index("idx_session_token").on(table.token),
		index("idx_session_expires_at").on(table.expiresAt),
	],
);

// account: OAuth provider accounts
export const account = pgTable(
	"account",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		accountId: text("account_id").notNull(),
		providerId: text("provider_id").notNull(),
		userId: uuid("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),
		accessTokenExpiresAt: bigint("access_token_expires_at", { mode: "number" }),
		refreshTokenExpiresAt: bigint("refresh_token_expires_at", {
			mode: "number",
		}),
		scope: text("scope"),
		password: text("password"),
		createdAt: bigint("created_at", { mode: "number" })
			.notNull()
			.default(sql`(extract(epoch from now()) * 1000)::bigint`),
		updatedAt: bigint("updated_at", { mode: "number" })
			.notNull()
			.default(sql`(extract(epoch from now()) * 1000)::bigint`),
	},
	(table) => [
		index("idx_account_user_id").on(table.userId),
		index("idx_account_provider_id").on(table.providerId),
		index("idx_account_provider_account").on(table.providerId, table.accountId),
	],
);

// verification: Email/token verification
export const verification = pgTable(
	"verification",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
		createdAt: bigint("created_at", { mode: "number" })
			.notNull()
			.default(sql`(extract(epoch from now()) * 1000)::bigint`),
		updatedAt: bigint("updated_at", { mode: "number" })
			.notNull()
			.default(sql`(extract(epoch from now()) * 1000)::bigint`),
	},
	(table) => [
		index("idx_verification_identifier").on(table.identifier),
		index("idx_verification_expires_at").on(table.expiresAt),
	],
);

// two_factor: Two-factor authentication secrets
export const twoFactor = pgTable(
	"two_factor",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		secret: text("secret").notNull(),
		backupCodes: text("backup_codes").notNull(),
		userId: uuid("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
	},
	(table) => [
		index("idx_two_factor_user_id").on(table.userId),
		index("idx_two_factor_secret").on(table.secret),
	],
);
