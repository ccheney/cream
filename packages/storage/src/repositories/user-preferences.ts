/**
 * User Preferences Repository (Drizzle ORM)
 *
 * Data access for user_preferences table. Manages user dashboard preferences
 * including theme, chart settings, notification settings, and UI state.
 *
 * @see apps/dashboard-api/src/routes/preferences.ts
 */
import { eq } from "drizzle-orm";
import { getDb, type Database } from "../db";
import { userPreferences, type NotificationSettings } from "../schema/user-settings";

// ============================================
// Types
// ============================================

export type Theme = "light" | "dark" | "system";

export type ChartTimeframe = "1D" | "1W" | "1M" | "3M" | "6M" | "1Y" | "ALL";

export type PortfolioView = "table" | "cards";

export type DateFormat = "MM/DD/YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD";

export type TimeFormat = "12h" | "24h";

export type { NotificationSettings };

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

export interface CreateUserPreferencesInput {
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
// Row Mapping
// ============================================

type UserPreferencesRow = typeof userPreferences.$inferSelect;

function mapUserPreferencesRow(row: UserPreferencesRow): UserPreferences {
	return {
		id: row.id,
		userId: row.userId,
		theme: row.theme as Theme,
		chartTimeframe: row.chartTimeframe as ChartTimeframe,
		feedFilters: (row.feedFilters as string[]) ?? [],
		sidebarCollapsed: row.sidebarCollapsed,
		notificationSettings: (row.notificationSettings as NotificationSettings) ?? DEFAULT_NOTIFICATION_SETTINGS,
		defaultPortfolioView: row.defaultPortfolioView as PortfolioView,
		dateFormat: row.dateFormat as DateFormat,
		timeFormat: row.timeFormat as TimeFormat,
		currency: row.currency,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

// ============================================
// Repository
// ============================================

export class UserPreferencesRepository {
	private db: Database;

	constructor(db?: Database) {
		this.db = db ?? getDb();
	}

	async create(input: CreateUserPreferencesInput): Promise<UserPreferences> {
		const notificationSettings = {
			...DEFAULT_NOTIFICATION_SETTINGS,
			...(input.notificationSettings ?? {}),
		};

		const [row] = await this.db
			.insert(userPreferences)
			.values({
				userId: input.userId,
				theme: (input.theme ?? DEFAULT_PREFERENCES.theme) as typeof userPreferences.$inferInsert.theme,
				chartTimeframe: (input.chartTimeframe ?? DEFAULT_PREFERENCES.chartTimeframe) as typeof userPreferences.$inferInsert.chartTimeframe,
				feedFilters: input.feedFilters ?? DEFAULT_PREFERENCES.feedFilters,
				sidebarCollapsed: input.sidebarCollapsed ?? DEFAULT_PREFERENCES.sidebarCollapsed,
				notificationSettings,
				defaultPortfolioView: (input.defaultPortfolioView ?? DEFAULT_PREFERENCES.defaultPortfolioView) as typeof userPreferences.$inferInsert.defaultPortfolioView,
				dateFormat: (input.dateFormat ?? DEFAULT_PREFERENCES.dateFormat) as typeof userPreferences.$inferInsert.dateFormat,
				timeFormat: (input.timeFormat ?? DEFAULT_PREFERENCES.timeFormat) as typeof userPreferences.$inferInsert.timeFormat,
				currency: input.currency ?? DEFAULT_PREFERENCES.currency,
			})
			.returning();

		return mapUserPreferencesRow(row);
	}

	async findById(id: string): Promise<UserPreferences | null> {
		const [row] = await this.db
			.select()
			.from(userPreferences)
			.where(eq(userPreferences.id, id))
			.limit(1);

		return row ? mapUserPreferencesRow(row) : null;
	}

	async findByUserId(userId: string): Promise<UserPreferences | null> {
		const [row] = await this.db
			.select()
			.from(userPreferences)
			.where(eq(userPreferences.userId, userId))
			.limit(1);

		return row ? mapUserPreferencesRow(row) : null;
	}

	async getOrCreate(userId: string): Promise<UserPreferences> {
		const existing = await this.findByUserId(userId);
		if (existing) {
			return existing;
		}

		return this.create({ userId });
	}

	async update(userId: string, input: UpdateUserPreferencesInput): Promise<UserPreferences> {
		const existing = await this.findByUserId(userId);

		if (!existing) {
			throw new Error(`User preferences not found: ${userId}`);
		}

		const updates: Record<string, unknown> = {
			updatedAt: new Date(),
		};

		if (input.theme !== undefined) {
			updates.theme = input.theme;
		}
		if (input.chartTimeframe !== undefined) {
			updates.chartTimeframe = input.chartTimeframe;
		}
		if (input.feedFilters !== undefined) {
			updates.feedFilters = input.feedFilters;
		}
		if (input.sidebarCollapsed !== undefined) {
			updates.sidebarCollapsed = input.sidebarCollapsed;
		}
		if (input.notificationSettings !== undefined) {
			const mergedSettings = {
				...existing.notificationSettings,
				...input.notificationSettings,
			};
			updates.notificationSettings = mergedSettings;
		}
		if (input.defaultPortfolioView !== undefined) {
			updates.defaultPortfolioView = input.defaultPortfolioView;
		}
		if (input.dateFormat !== undefined) {
			updates.dateFormat = input.dateFormat;
		}
		if (input.timeFormat !== undefined) {
			updates.timeFormat = input.timeFormat;
		}
		if (input.currency !== undefined) {
			updates.currency = input.currency;
		}

		const [row] = await this.db
			.update(userPreferences)
			.set(updates)
			.where(eq(userPreferences.id, existing.id))
			.returning();

		return mapUserPreferencesRow(row);
	}

	async reset(userId: string): Promise<UserPreferences> {
		const existing = await this.findByUserId(userId);

		if (!existing) {
			throw new Error(`User preferences not found: ${userId}`);
		}

		const [row] = await this.db
			.update(userPreferences)
			.set({
				theme: DEFAULT_PREFERENCES.theme as typeof userPreferences.$inferInsert.theme,
				chartTimeframe: DEFAULT_PREFERENCES.chartTimeframe as typeof userPreferences.$inferInsert.chartTimeframe,
				feedFilters: DEFAULT_PREFERENCES.feedFilters,
				sidebarCollapsed: DEFAULT_PREFERENCES.sidebarCollapsed,
				notificationSettings: DEFAULT_PREFERENCES.notificationSettings,
				defaultPortfolioView: DEFAULT_PREFERENCES.defaultPortfolioView as typeof userPreferences.$inferInsert.defaultPortfolioView,
				dateFormat: DEFAULT_PREFERENCES.dateFormat as typeof userPreferences.$inferInsert.dateFormat,
				timeFormat: DEFAULT_PREFERENCES.timeFormat as typeof userPreferences.$inferInsert.timeFormat,
				currency: DEFAULT_PREFERENCES.currency,
				updatedAt: new Date(),
			})
			.where(eq(userPreferences.id, existing.id))
			.returning();

		return mapUserPreferencesRow(row);
	}

	async delete(userId: string): Promise<boolean> {
		const result = await this.db
			.delete(userPreferences)
			.where(eq(userPreferences.userId, userId))
			.returning({ id: userPreferences.id });

		return result.length > 0;
	}

	getDefaults(): Omit<UserPreferences, "id" | "userId" | "createdAt" | "updatedAt"> {
		return { ...DEFAULT_PREFERENCES };
	}
}
