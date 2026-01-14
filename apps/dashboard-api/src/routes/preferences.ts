/**
 * User Preferences Routes
 *
 * Routes for managing user dashboard preferences.
 * Uses Turso/SQLite storage via UserPreferencesRepository for persistence.
 *
 * @see docs/plans/ui/04-data-requirements.md user_preferences
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getUser, requireAuth, type SessionVariables } from "../auth/index.js";
import { getUserPreferencesRepo } from "../db.js";

// ============================================
// App Setup
// ============================================

const app = new OpenAPIHono<{ Variables: SessionVariables }>();

// ============================================
// Schema Definitions
// ============================================

const NotificationSettingsSchema = z.object({
	emailAlerts: z.boolean().default(true),
	pushNotifications: z.boolean().default(false),
	tradeConfirmations: z.boolean().default(true),
	dailySummary: z.boolean().default(true),
	riskAlerts: z.boolean().default(true),
});

const UserPreferencesSchema = z.object({
	theme: z.enum(["light", "dark", "system"]).default("system"),
	chartTimeframe: z.enum(["1D", "1W", "1M", "3M", "6M", "1Y", "ALL"]).default("1M"),
	feedFilters: z.array(z.string()).default([]),
	sidebarCollapsed: z.boolean().default(false),
	notificationSettings: NotificationSettingsSchema.default({
		emailAlerts: true,
		pushNotifications: false,
		tradeConfirmations: true,
		dailySummary: true,
		riskAlerts: true,
	}),
	defaultPortfolioView: z.enum(["table", "cards"]).default("table"),
	dateFormat: z.enum(["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"]).default("MM/DD/YYYY"),
	timeFormat: z.enum(["12h", "24h"]).default("12h"),
	currency: z.string().default("USD"),
});

const UpdatePreferencesRequestSchema = UserPreferencesSchema.partial();

// ============================================
// Helper: Convert repository entity to API response
// ============================================

type PreferencesResponse = z.infer<typeof UserPreferencesSchema>;

function toApiResponse(prefs: {
	theme: string;
	chartTimeframe: string;
	feedFilters: string[];
	sidebarCollapsed: boolean;
	notificationSettings: {
		emailAlerts: boolean;
		pushNotifications: boolean;
		tradeConfirmations: boolean;
		dailySummary: boolean;
		riskAlerts: boolean;
	};
	defaultPortfolioView: string;
	dateFormat: string;
	timeFormat: string;
	currency: string;
}): PreferencesResponse {
	return {
		theme: prefs.theme as "light" | "dark" | "system",
		chartTimeframe: prefs.chartTimeframe as "1D" | "1W" | "1M" | "3M" | "6M" | "1Y" | "ALL",
		feedFilters: prefs.feedFilters,
		sidebarCollapsed: prefs.sidebarCollapsed,
		notificationSettings: prefs.notificationSettings,
		defaultPortfolioView: prefs.defaultPortfolioView as "table" | "cards",
		dateFormat: prefs.dateFormat as "MM/DD/YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD",
		timeFormat: prefs.timeFormat as "12h" | "24h",
		currency: prefs.currency,
	};
}

// ============================================
// Routes
// ============================================

// GET /preferences - Get user preferences
const getPreferencesRoute = createRoute({
	method: "get",
	path: "/",
	middleware: [requireAuth()],
	responses: {
		200: {
			content: {
				"application/json": {
					schema: UserPreferencesSchema,
				},
			},
			description: "User preferences",
		},
	},
	tags: ["Preferences"],
});

app.openapi(getPreferencesRoute, async (c) => {
	const user = getUser(c);
	const repo = await getUserPreferencesRepo();
	const preferences = await repo.getOrCreate(user.id);
	return c.json(toApiResponse(preferences));
});

// PUT /preferences - Update user preferences
const updatePreferencesRoute = createRoute({
	method: "put",
	path: "/",
	middleware: [requireAuth()],
	request: {
		body: {
			content: {
				"application/json": {
					schema: UpdatePreferencesRequestSchema,
				},
			},
		},
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: UserPreferencesSchema,
				},
			},
			description: "Updated preferences",
		},
	},
	tags: ["Preferences"],
});

app.openapi(updatePreferencesRoute, async (c) => {
	const user = getUser(c);
	const updates = c.req.valid("json");
	const repo = await getUserPreferencesRepo();

	// Ensure preferences exist first
	await repo.getOrCreate(user.id);

	// Update with new values
	const updated = await repo.update(user.id, {
		theme: updates.theme,
		chartTimeframe: updates.chartTimeframe,
		feedFilters: updates.feedFilters,
		sidebarCollapsed: updates.sidebarCollapsed,
		notificationSettings: updates.notificationSettings,
		defaultPortfolioView: updates.defaultPortfolioView,
		dateFormat: updates.dateFormat,
		timeFormat: updates.timeFormat,
		currency: updates.currency,
	});

	return c.json(toApiResponse(updated));
});

// PATCH /preferences/theme - Quick theme update
const updateThemeRoute = createRoute({
	method: "patch",
	path: "/theme",
	middleware: [requireAuth()],
	request: {
		body: {
			content: {
				"application/json": {
					schema: z.object({
						theme: z.enum(["light", "dark", "system"]),
					}),
				},
			},
		},
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({
						theme: z.enum(["light", "dark", "system"]),
					}),
				},
			},
			description: "Updated theme",
		},
	},
	tags: ["Preferences"],
});

app.openapi(updateThemeRoute, async (c) => {
	const user = getUser(c);
	const { theme } = c.req.valid("json");
	const repo = await getUserPreferencesRepo();

	// Ensure preferences exist first
	await repo.getOrCreate(user.id);

	// Update just the theme
	await repo.update(user.id, { theme });

	return c.json({ theme });
});

// POST /preferences/reset - Reset preferences to defaults
const resetPreferencesRoute = createRoute({
	method: "post",
	path: "/reset",
	middleware: [requireAuth()],
	responses: {
		200: {
			content: {
				"application/json": {
					schema: UserPreferencesSchema,
				},
			},
			description: "Reset preferences",
		},
	},
	tags: ["Preferences"],
});

app.openapi(resetPreferencesRoute, async (c) => {
	const user = getUser(c);
	const repo = await getUserPreferencesRepo();

	// Ensure preferences exist first, then reset
	await repo.getOrCreate(user.id);
	const defaults = await repo.reset(user.id);

	return c.json(toApiResponse(defaults));
});

// ============================================
// Export
// ============================================

export const preferencesRoutes = app;
export default preferencesRoutes;
