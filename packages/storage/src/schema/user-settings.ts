/**
 * User Settings Tables
 *
 * alert_settings, user_preferences
 */
import {
	boolean,
	index,
	jsonb,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import {
	chartTimeframeEnum,
	dateFormatEnum,
	portfolioViewEnum,
	themeEnum,
	timeFormatEnum,
} from "./enums";

// alert_settings: Per-user alert preferences
export const alertSettings = pgTable(
	"alert_settings",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.unique()
			.references(() => user.id, { onDelete: "cascade" }),
		enablePush: boolean("enable_push").notNull().default(true),
		enableEmail: boolean("enable_email").notNull().default(true),
		emailAddress: text("email_address"),
		criticalOnly: boolean("critical_only").notNull().default(false),
		quietHoursStart: text("quiet_hours_start"),
		quietHoursEnd: text("quiet_hours_end"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [index("idx_alert_settings_user_id").on(table.userId)],
);

// Notification settings type
export interface NotificationSettings {
	emailAlerts: boolean;
	pushNotifications: boolean;
	tradeConfirmations: boolean;
	dailySummary: boolean;
	riskAlerts: boolean;
}

// user_preferences: UI and display preferences
export const userPreferences = pgTable(
	"user_preferences",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.unique()
			.references(() => user.id, { onDelete: "cascade" }),

		// UI Theme
		theme: themeEnum("theme").notNull().default("system"),

		// Chart settings
		chartTimeframe: chartTimeframeEnum("chart_timeframe")
			.notNull()
			.default("1M"),

		// Feed filters (JSON array of strings)
		feedFilters: jsonb("feed_filters").$type<string[]>().notNull().default([]),

		// UI state
		sidebarCollapsed: boolean("sidebar_collapsed").notNull().default(false),

		// Notification settings
		notificationSettings: jsonb("notification_settings")
			.$type<NotificationSettings>()
			.notNull()
			.default({
				emailAlerts: true,
				pushNotifications: false,
				tradeConfirmations: true,
				dailySummary: true,
				riskAlerts: true,
			}),

		// Portfolio view
		defaultPortfolioView: portfolioViewEnum("default_portfolio_view")
			.notNull()
			.default("table"),

		// Date/time formatting
		dateFormat: dateFormatEnum("date_format").notNull().default("MM/DD/YYYY"),
		timeFormat: timeFormatEnum("time_format").notNull().default("12h"),

		// Currency
		currency: text("currency").notNull().default("USD"),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index("idx_user_preferences_user_id").on(table.userId),
		index("idx_user_preferences_created_at").on(table.createdAt),
	],
);
