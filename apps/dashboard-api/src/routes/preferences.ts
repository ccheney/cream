/**
 * User Preferences Routes
 *
 * Routes for managing user dashboard preferences.
 *
 * @see docs/plans/ui/04-data-requirements.md user_preferences
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getUser, requireAuth, type SessionVariables } from "../auth/index.js";

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
// Mock Storage (replace with Turso in production)
// ============================================

// In-memory store keyed by user ID
const preferencesStore = new Map<string, z.infer<typeof UserPreferencesSchema>>();

// Get or create default preferences for a user
function getOrCreatePreferences(userId: string): z.infer<typeof UserPreferencesSchema> {
  const existing = preferencesStore.get(userId);
  if (existing) {
    return existing;
  }

  const defaults: z.infer<typeof UserPreferencesSchema> = {
    theme: "system",
    chartTimeframe: "1M",
    feedFilters: [],
    sidebarCollapsed: false,
    notificationSettings: {
      emailAlerts: true,
      pushNotifications: false,
      tradeConfirmations: true,
      dailySummary: true,
      riskAlerts: true,
    },
    defaultPortfolioView: "table",
    dateFormat: "MM/DD/YYYY",
    timeFormat: "12h",
    currency: "USD",
  };

  preferencesStore.set(userId, defaults);
  return defaults;
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

app.openapi(getPreferencesRoute, (c) => {
  const user = getUser(c);
  const preferences = getOrCreatePreferences(user.id);
  return c.json(preferences);
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
  const current = getOrCreatePreferences(user.id);

  // Merge updates with current preferences
  const updated: z.infer<typeof UserPreferencesSchema> = {
    ...current,
    ...updates,
    notificationSettings: {
      ...current.notificationSettings,
      ...(updates.notificationSettings ?? {}),
    },
  };

  preferencesStore.set(user.id, updated);
  return c.json(updated);
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
  const current = getOrCreatePreferences(user.id);
  current.theme = theme;
  preferencesStore.set(user.id, current);

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

app.openapi(resetPreferencesRoute, (c) => {
  const user = getUser(c);

  // Delete current and recreate with defaults
  preferencesStore.delete(user.id);
  const defaults = getOrCreatePreferences(user.id);

  return c.json(defaults);
});

// ============================================
// Export
// ============================================

export const preferencesRoutes = app;
export default preferencesRoutes;
