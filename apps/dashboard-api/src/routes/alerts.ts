/**
 * Alert Settings Routes
 *
 * Routes for managing alert notification settings.
 *
 * @see docs/plans/ui/05-api-endpoints.md Alerts section
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

const QuietHoursSchema = z.object({
  /** Start time in HH:MM format (24-hour) */
  start: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Must be in HH:MM format"),
  /** End time in HH:MM format (24-hour) */
  end: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Must be in HH:MM format"),
});

const AlertSettingsSchema = z.object({
  /** Enable push notifications */
  enablePush: z.boolean().default(true),
  /** Enable email notifications */
  enableEmail: z.boolean().default(true),
  /** Email address for alerts (null = use account email) */
  emailAddress: z.string().email().nullable().default(null),
  /** Only send critical alerts */
  criticalOnly: z.boolean().default(false),
  /** Quiet hours configuration (null = no quiet hours) */
  quietHours: QuietHoursSchema.nullable().default(null),
});

const UpdateAlertSettingsRequestSchema = AlertSettingsSchema.partial();

// ============================================
// Mock Storage (replace with Turso in production)
// ============================================

// In-memory store keyed by user ID
const alertSettingsStore = new Map<string, z.infer<typeof AlertSettingsSchema>>();

// Get or create default alert settings for a user
function getOrCreateAlertSettings(userId: string): z.infer<typeof AlertSettingsSchema> {
  const existing = alertSettingsStore.get(userId);
  if (existing) {
    return existing;
  }

  const defaults: z.infer<typeof AlertSettingsSchema> = {
    enablePush: true,
    enableEmail: true,
    emailAddress: null,
    criticalOnly: false,
    quietHours: null,
  };

  alertSettingsStore.set(userId, defaults);
  return defaults;
}

// ============================================
// Routes
// ============================================

// GET /alerts/settings - Get alert settings
const getAlertSettingsRoute = createRoute({
  method: "get",
  path: "/settings",
  middleware: [requireAuth()],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: AlertSettingsSchema,
        },
      },
      description: "Current alert settings",
    },
  },
  tags: ["Alerts"],
});

app.openapi(getAlertSettingsRoute, (c) => {
  const user = getUser(c);
  const settings = getOrCreateAlertSettings(user.id);
  return c.json(settings);
});

// PUT /alerts/settings - Update alert settings
const updateAlertSettingsRoute = createRoute({
  method: "put",
  path: "/settings",
  middleware: [requireAuth()],
  request: {
    body: {
      content: {
        "application/json": {
          schema: UpdateAlertSettingsRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: AlertSettingsSchema,
        },
      },
      description: "Updated alert settings",
    },
  },
  tags: ["Alerts"],
});

app.openapi(updateAlertSettingsRoute, async (c) => {
  const user = getUser(c);
  const updates = c.req.valid("json");
  const current = getOrCreateAlertSettings(user.id);

  // Merge updates with current settings
  const updated: z.infer<typeof AlertSettingsSchema> = {
    ...current,
    ...updates,
  };

  alertSettingsStore.set(user.id, updated);
  return c.json(updated);
});

// ============================================
// Export
// ============================================

export const alertsRoutes = app;
export default alertsRoutes;
