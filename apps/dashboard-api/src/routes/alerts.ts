/**
 * Alert Settings Routes
 *
 * Routes for managing alert notification settings.
 * Settings are persisted in Turso database via AlertSettingsRepository.
 *
 * @see docs/plans/ui/05-api-endpoints.md Alerts section
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getUser, requireAuth, type SessionVariables } from "../auth/index.js";
import { getAlertSettingsRepo } from "../db.js";

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
// Helper Functions
// ============================================

/**
 * Map database AlertSettings to API response format
 */
function mapToResponse(settings: {
  enablePush: boolean;
  enableEmail: boolean;
  emailAddress: string | null;
  criticalOnly: boolean;
  quietHours: { start: string; end: string } | null;
}): z.infer<typeof AlertSettingsSchema> {
  return {
    enablePush: settings.enablePush,
    enableEmail: settings.enableEmail,
    emailAddress: settings.emailAddress,
    criticalOnly: settings.criticalOnly,
    quietHours: settings.quietHours,
  };
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

app.openapi(getAlertSettingsRoute, async (c) => {
  const user = getUser(c);
  const repo = await getAlertSettingsRepo();
  const settings = await repo.getOrCreate(user.id);
  return c.json(mapToResponse(settings));
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
  const repo = await getAlertSettingsRepo();

  // Update settings in database (creates if not exists)
  const updated = await repo.update(user.id, {
    enablePush: updates.enablePush,
    enableEmail: updates.enableEmail,
    emailAddress: updates.emailAddress,
    criticalOnly: updates.criticalOnly,
    quietHours: updates.quietHours,
  });

  return c.json(mapToResponse(updated));
});

// ============================================
// Export
// ============================================

export const alertsRoutes = app;
export default alertsRoutes;
