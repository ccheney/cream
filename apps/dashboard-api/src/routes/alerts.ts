/**
 * Alerts Routes
 *
 * Endpoints for listing, acknowledging, and managing alerts.
 *
 * @see docs/plans/ui/05-api-endpoints.md
 */

import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { getAlertsRepo } from "../db.js";

// ============================================
// Schemas
// ============================================

const AlertSeveritySchema = z.enum(["critical", "warning", "info"]);

const AlertSchema = z.object({
  id: z.string(),
  severity: AlertSeveritySchema,
  type: z.string(),
  title: z.string(),
  message: z.string(),
  metadata: z.record(z.unknown()),
  acknowledged: z.boolean(),
  createdAt: z.string(),
});

const AlertSettingsSchema = z.object({
  enablePush: z.boolean(),
  enableEmail: z.boolean(),
  emailAddress: z.string().nullable(),
  criticalOnly: z.boolean(),
  quietHours: z
    .object({
      start: z.string(),
      end: z.string(),
    })
    .nullable(),
});

const AlertQuerySchema = z.object({
  severity: AlertSeveritySchema.optional(),
  acknowledged: z
    .string()
    .transform((v) => v === "true")
    .optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

// ============================================
// In-Memory Settings (would be stored in DB in production)
// ============================================

let alertSettings: z.infer<typeof AlertSettingsSchema> = {
  enablePush: true,
  enableEmail: false,
  emailAddress: null,
  criticalOnly: false,
  quietHours: null,
};

// ============================================
// Routes
// ============================================

const app = new OpenAPIHono();

// GET /api/alerts
const listRoute = createRoute({
  method: "get",
  path: "/",
  request: {
    query: AlertQuerySchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            alerts: z.array(AlertSchema),
            total: z.number(),
          }),
        },
      },
      description: "List of alerts",
    },
  },
  tags: ["Alerts"],
});

app.openapi(listRoute, async (c) => {
  const query = c.req.valid("query");
  const repo = await getAlertsRepo();

  const result = await repo.findMany(
    {
      severity: query.severity,
      acknowledged: query.acknowledged,
    },
    {
      limit: query.limit,
      offset: query.offset,
    }
  );

  return c.json({
    alerts: result.data.map((a) => ({
      id: a.id,
      severity: a.severity,
      type: a.type,
      title: a.title,
      message: a.message,
      metadata: a.metadata,
      acknowledged: a.acknowledged,
      createdAt: a.createdAt,
    })),
    total: result.total,
  });
});

// POST /api/alerts/:id/acknowledge
const acknowledgeRoute = createRoute({
  method: "post",
  path: "/:id/acknowledge",
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: AlertSchema } },
      description: "Alert acknowledged",
    },
    404: {
      content: {
        "application/json": {
          schema: z.object({ error: z.string() }),
        },
      },
      description: "Alert not found",
    },
  },
  tags: ["Alerts"],
});

app.openapi(acknowledgeRoute, async (c) => {
  const { id } = c.req.valid("param");
  const repo = await getAlertsRepo();

  const alert = await repo.findById(id);
  if (!alert) {
    return c.json({ error: "Alert not found" }, 404);
  }

  const updated = await repo.acknowledge(id, "system");

  return c.json({
    id: updated.id,
    severity: updated.severity,
    type: updated.type,
    title: updated.title,
    message: updated.message,
    metadata: updated.metadata,
    acknowledged: updated.acknowledged,
    createdAt: updated.createdAt,
  });
});

// DELETE /api/alerts/:id
const deleteRoute = createRoute({
  method: "delete",
  path: "/:id",
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    204: {
      description: "Alert deleted",
    },
    404: {
      content: {
        "application/json": {
          schema: z.object({ error: z.string() }),
        },
      },
      description: "Alert not found",
    },
  },
  tags: ["Alerts"],
});

app.openapi(deleteRoute, async (c) => {
  const { id } = c.req.valid("param");
  const repo = await getAlertsRepo();

  const deleted = await repo.delete(id);
  if (!deleted) {
    return c.json({ error: "Alert not found" }, 404);
  }

  return c.body(null, 204);
});

// GET /api/alerts/settings
const getSettingsRoute = createRoute({
  method: "get",
  path: "/settings",
  responses: {
    200: {
      content: { "application/json": { schema: AlertSettingsSchema } },
      description: "Alert settings",
    },
  },
  tags: ["Alerts"],
});

app.openapi(getSettingsRoute, (c) => {
  return c.json(alertSettings);
});

// PUT /api/alerts/settings
const updateSettingsRoute = createRoute({
  method: "put",
  path: "/settings",
  request: {
    body: {
      content: { "application/json": { schema: AlertSettingsSchema } },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: AlertSettingsSchema } },
      description: "Updated alert settings",
    },
  },
  tags: ["Alerts"],
});

app.openapi(updateSettingsRoute, (c) => {
  const body = c.req.valid("json");
  alertSettings = body;
  return c.json(alertSettings);
});

// POST /api/alerts/acknowledge-all
const acknowledgeAllRoute = createRoute({
  method: "post",
  path: "/acknowledge-all",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            acknowledged: z.number(),
          }),
        },
      },
      description: "All alerts acknowledged",
    },
  },
  tags: ["Alerts"],
});

app.openapi(acknowledgeAllRoute, async (c) => {
  const repo = await getAlertsRepo();

  // Get all unacknowledged alerts
  const unacked = await repo.findMany({ acknowledged: false });

  // Acknowledge each one
  let count = 0;
  for (const alert of unacked.data) {
    await repo.acknowledge(alert.id, "system");
    count++;
  }

  return c.json({ acknowledged: count });
});

export default app;
