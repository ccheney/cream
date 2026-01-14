/**
 * User Preferences Repository
 *
 * Data access for user_preferences table. Manages user dashboard preferences
 * including theme, chart settings, notification settings, and UI state.
 *
 * @see apps/dashboard-api/src/routes/preferences.ts
 */

import type { Row, TursoClient } from "../turso.js";
import { fromBoolean, parseJson, RepositoryError, toBoolean, toJson } from "./base.js";

// ============================================
// Types
// ============================================

/**
 * Theme options
 */
export type Theme = "light" | "dark" | "system";

/**
 * Chart timeframe options
 */
export type ChartTimeframe = "1D" | "1W" | "1M" | "3M" | "6M" | "1Y" | "ALL";

/**
 * Portfolio view options
 */
export type PortfolioView = "table" | "cards";

/**
 * Date format options
 */
export type DateFormat = "MM/DD/YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD";

/**
 * Time format options
 */
export type TimeFormat = "12h" | "24h";

/**
 * Notification settings
 */
export interface NotificationSettings {
	emailAlerts: boolean;
	pushNotifications: boolean;
	tradeConfirmations: boolean;
	dailySummary: boolean;
	riskAlerts: boolean;
}

/**
 * User preferences entity
 */
export interface UserPreferences {
	id: string;
	userId: string;
	theme: Theme;
	chartTimeframe: ChartTimeframe;
	feedFilters: string[];
	sidebarCollapsed: boolean;
	notificationSettings: NotificationSettings;
	defaultPortfolioView: PortfolioView;
	dateFormat: DateFormat;
	timeFormat: TimeFormat;
	currency: string;
	createdAt: string;
	updatedAt: string;
}

/**
 * Create user preferences input
 */
export interface CreateUserPreferencesInput {
	id: string;
	userId: string;
	theme?: Theme;
	chartTimeframe?: ChartTimeframe;
	feedFilters?: string[];
	sidebarCollapsed?: boolean;
	notificationSettings?: Partial<NotificationSettings>;
	defaultPortfolioView?: PortfolioView;
	dateFormat?: DateFormat;
	timeFormat?: TimeFormat;
	currency?: string;
}

/**
 * Update user preferences input (partial)
 */
export interface UpdateUserPreferencesInput {
	theme?: Theme;
	chartTimeframe?: ChartTimeframe;
	feedFilters?: string[];
	sidebarCollapsed?: boolean;
	notificationSettings?: Partial<NotificationSettings>;
	defaultPortfolioView?: PortfolioView;
	dateFormat?: DateFormat;
	timeFormat?: TimeFormat;
	currency?: string;
}

// ============================================
// Default Values
// ============================================

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
	emailAlerts: true,
	pushNotifications: false,
	tradeConfirmations: true,
	dailySummary: true,
	riskAlerts: true,
};

const DEFAULT_PREFERENCES: Omit<UserPreferences, "id" | "userId" | "createdAt" | "updatedAt"> = {
	theme: "system",
	chartTimeframe: "1M",
	feedFilters: [],
	sidebarCollapsed: false,
	notificationSettings: DEFAULT_NOTIFICATION_SETTINGS,
	defaultPortfolioView: "table",
	dateFormat: "MM/DD/YYYY",
	timeFormat: "12h",
	currency: "USD",
};

// ============================================
// Row Mapper
// ============================================

function mapUserPreferencesRow(row: Row): UserPreferences {
	return {
		id: row.id as string,
		userId: row.user_id as string,
		theme: row.theme as Theme,
		chartTimeframe: row.chart_timeframe as ChartTimeframe,
		feedFilters: parseJson<string[]>(row.feed_filters, []),
		sidebarCollapsed: toBoolean(row.sidebar_collapsed),
		notificationSettings: parseJson<NotificationSettings>(
			row.notification_settings,
			DEFAULT_NOTIFICATION_SETTINGS
		),
		defaultPortfolioView: row.default_portfolio_view as PortfolioView,
		dateFormat: row.date_format as DateFormat,
		timeFormat: row.time_format as TimeFormat,
		currency: row.currency as string,
		createdAt: row.created_at as string,
		updatedAt: row.updated_at as string,
	};
}

// ============================================
// Repository
// ============================================

/**
 * User preferences repository
 */
export class UserPreferencesRepository {
	private readonly table = "user_preferences";

	constructor(private readonly client: TursoClient) {}

	/**
	 * Create new user preferences
	 */
	async create(input: CreateUserPreferencesInput): Promise<UserPreferences> {
		const now = new Date().toISOString();
		const notificationSettings = {
			...DEFAULT_NOTIFICATION_SETTINGS,
			...(input.notificationSettings ?? {}),
		};

		try {
			await this.client.run(
				`INSERT INTO ${this.table} (
          id, user_id, theme, chart_timeframe, feed_filters,
          sidebar_collapsed, notification_settings, default_portfolio_view,
          date_format, time_format, currency, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					input.id,
					input.userId,
					input.theme ?? DEFAULT_PREFERENCES.theme,
					input.chartTimeframe ?? DEFAULT_PREFERENCES.chartTimeframe,
					toJson(input.feedFilters ?? DEFAULT_PREFERENCES.feedFilters),
					fromBoolean(input.sidebarCollapsed ?? DEFAULT_PREFERENCES.sidebarCollapsed),
					toJson(notificationSettings),
					input.defaultPortfolioView ?? DEFAULT_PREFERENCES.defaultPortfolioView,
					input.dateFormat ?? DEFAULT_PREFERENCES.dateFormat,
					input.timeFormat ?? DEFAULT_PREFERENCES.timeFormat,
					input.currency ?? DEFAULT_PREFERENCES.currency,
					now,
					now,
				]
			);
		} catch (error) {
			throw RepositoryError.fromSqliteError(this.table, error as Error);
		}

		return this.findById(input.id) as Promise<UserPreferences>;
	}

	/**
	 * Find preferences by ID
	 */
	async findById(id: string): Promise<UserPreferences | null> {
		const row = await this.client.get<Row>(`SELECT * FROM ${this.table} WHERE id = ?`, [id]);

		return row ? mapUserPreferencesRow(row) : null;
	}

	/**
	 * Find preferences by user ID
	 */
	async findByUserId(userId: string): Promise<UserPreferences | null> {
		const row = await this.client.get<Row>(`SELECT * FROM ${this.table} WHERE user_id = ?`, [
			userId,
		]);

		return row ? mapUserPreferencesRow(row) : null;
	}

	/**
	 * Get or create preferences for a user
	 * Returns existing preferences or creates new ones with defaults
	 */
	async getOrCreate(userId: string): Promise<UserPreferences> {
		const existing = await this.findByUserId(userId);

		if (existing) {
			return existing;
		}

		// Create new preferences with defaults
		const id = `pref_${userId}_${Date.now()}`;
		return this.create({ id, userId });
	}

	/**
	 * Update user preferences
	 */
	async update(userId: string, input: UpdateUserPreferencesInput): Promise<UserPreferences> {
		const existing = await this.findByUserId(userId);

		if (!existing) {
			throw RepositoryError.notFound(this.table, userId);
		}

		const now = new Date().toISOString();
		const updateFields: string[] = [];
		const updateValues: unknown[] = [];

		if (input.theme !== undefined) {
			updateFields.push("theme = ?");
			updateValues.push(input.theme);
		}
		if (input.chartTimeframe !== undefined) {
			updateFields.push("chart_timeframe = ?");
			updateValues.push(input.chartTimeframe);
		}
		if (input.feedFilters !== undefined) {
			updateFields.push("feed_filters = ?");
			updateValues.push(toJson(input.feedFilters));
		}
		if (input.sidebarCollapsed !== undefined) {
			updateFields.push("sidebar_collapsed = ?");
			updateValues.push(fromBoolean(input.sidebarCollapsed));
		}
		if (input.notificationSettings !== undefined) {
			// Merge with existing notification settings
			const mergedSettings = {
				...existing.notificationSettings,
				...input.notificationSettings,
			};
			updateFields.push("notification_settings = ?");
			updateValues.push(toJson(mergedSettings));
		}
		if (input.defaultPortfolioView !== undefined) {
			updateFields.push("default_portfolio_view = ?");
			updateValues.push(input.defaultPortfolioView);
		}
		if (input.dateFormat !== undefined) {
			updateFields.push("date_format = ?");
			updateValues.push(input.dateFormat);
		}
		if (input.timeFormat !== undefined) {
			updateFields.push("time_format = ?");
			updateValues.push(input.timeFormat);
		}
		if (input.currency !== undefined) {
			updateFields.push("currency = ?");
			updateValues.push(input.currency);
		}

		if (updateFields.length > 0) {
			updateFields.push("updated_at = ?");
			updateValues.push(now);
			updateValues.push(existing.id);

			try {
				await this.client.run(
					`UPDATE ${this.table} SET ${updateFields.join(", ")} WHERE id = ?`,
					updateValues
				);
			} catch (error) {
				throw RepositoryError.fromSqliteError(this.table, error as Error);
			}
		}

		return this.findById(existing.id) as Promise<UserPreferences>;
	}

	/**
	 * Reset preferences to defaults
	 */
	async reset(userId: string): Promise<UserPreferences> {
		const existing = await this.findByUserId(userId);

		if (!existing) {
			throw RepositoryError.notFound(this.table, userId);
		}

		const now = new Date().toISOString();

		try {
			await this.client.run(
				`UPDATE ${this.table} SET
          theme = ?,
          chart_timeframe = ?,
          feed_filters = ?,
          sidebar_collapsed = ?,
          notification_settings = ?,
          default_portfolio_view = ?,
          date_format = ?,
          time_format = ?,
          currency = ?,
          updated_at = ?
        WHERE id = ?`,
				[
					DEFAULT_PREFERENCES.theme,
					DEFAULT_PREFERENCES.chartTimeframe,
					toJson(DEFAULT_PREFERENCES.feedFilters),
					fromBoolean(DEFAULT_PREFERENCES.sidebarCollapsed),
					toJson(DEFAULT_PREFERENCES.notificationSettings),
					DEFAULT_PREFERENCES.defaultPortfolioView,
					DEFAULT_PREFERENCES.dateFormat,
					DEFAULT_PREFERENCES.timeFormat,
					DEFAULT_PREFERENCES.currency,
					now,
					existing.id,
				]
			);
		} catch (error) {
			throw RepositoryError.fromSqliteError(this.table, error as Error);
		}

		return this.findById(existing.id) as Promise<UserPreferences>;
	}

	/**
	 * Delete user preferences
	 */
	async delete(userId: string): Promise<boolean> {
		const result = await this.client.run(`DELETE FROM ${this.table} WHERE user_id = ?`, [userId]);

		return result.changes > 0;
	}

	/**
	 * Get default preferences (without persisting)
	 */
	getDefaults(): Omit<UserPreferences, "id" | "userId" | "createdAt" | "updatedAt"> {
		return { ...DEFAULT_PREFERENCES };
	}
}
