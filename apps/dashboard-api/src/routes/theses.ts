/**
 * Theses API Routes
 *
 * Routes for managing trading theses and convictions.
 * Returns real data from HelixDB or error responses - NO mock data.
 *
 * Note: HelixDB integration is not yet complete.
 * All routes return 503 Service Unavailable until the database is integrated.
 *
 * @see docs/plans/ui/05-api-endpoints.md Theses section
 * @see docs/plans/07-helix-schema.md
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";

// ============================================
// App Setup
// ============================================

const app = new OpenAPIHono();

// ============================================
// Schema Definitions
// ============================================

const ThesisStatusSchema = z.enum(["ACTIVE", "INVALIDATED", "REALIZED", "EXPIRED"]);

const ThesisSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  direction: z.enum(["BULLISH", "BEARISH", "NEUTRAL"]),
  thesis: z.string(),
  catalysts: z.array(z.string()),
  invalidationConditions: z.array(z.string()),
  targetPrice: z.number().nullable(),
  stopPrice: z.number().nullable(),
  timeHorizon: z.enum(["INTRADAY", "SWING", "POSITION", "LONG_TERM"]),
  confidence: z.number().min(0).max(1),
  status: ThesisStatusSchema,
  entryPrice: z.number().nullable(),
  currentPrice: z.number().nullable(),
  pnlPct: z.number().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  expiresAt: z.string().nullable(),
  agentSource: z.string(),
  supportingEvidence: z.array(
    z.object({
      type: z.enum(["technical", "fundamental", "sentiment", "macro"]),
      summary: z.string(),
      weight: z.number(),
    })
  ),
});

const CreateThesisSchema = z.object({
  symbol: z.string(),
  direction: z.enum(["BULLISH", "BEARISH", "NEUTRAL"]),
  thesis: z.string(),
  catalysts: z.array(z.string()),
  invalidationConditions: z.array(z.string()),
  targetPrice: z.number().nullable(),
  stopPrice: z.number().nullable(),
  timeHorizon: z.enum(["INTRADAY", "SWING", "POSITION", "LONG_TERM"]),
  confidence: z.number().min(0).max(1),
  expiresAt: z.string().nullable(),
});

const ThesisHistoryEntrySchema = z.object({
  id: z.string(),
  thesisId: z.string(),
  field: z.string(),
  oldValue: z.unknown(),
  newValue: z.unknown(),
  reason: z.string().nullable(),
  timestamp: z.string(),
});

const ErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
});

// ============================================
// Service Availability Check
// ============================================

/**
 * Check if theses service (HelixDB) is available.
 * Currently always throws 503 as HelixDB is not yet integrated.
 */
function requireThesesService(): never {
  throw new HTTPException(503, {
    message: "Theses service unavailable: HelixDB not yet integrated (Phase 7)",
  });
}

// ============================================
// Routes
// ============================================

// GET / - List theses
const listRoute = createRoute({
  method: "get",
  path: "/",
  request: {
    query: z.object({
      status: ThesisStatusSchema.optional(),
      symbol: z.string().optional(),
      direction: z.enum(["BULLISH", "BEARISH", "NEUTRAL"]).optional(),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.array(ThesisSchema),
        },
      },
      description: "List of theses",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Theses service unavailable",
    },
  },
  tags: ["Theses"],
});

app.openapi(listRoute, () => {
  requireThesesService();
});

// POST / - Create thesis
const createThesisRoute = createRoute({
  method: "post",
  path: "/",
  request: {
    body: {
      content: {
        "application/json": {
          schema: CreateThesisSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        "application/json": {
          schema: ThesisSchema,
        },
      },
      description: "Created thesis",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Theses service unavailable",
    },
  },
  tags: ["Theses"],
});

app.openapi(createThesisRoute, () => {
  requireThesesService();
});

// GET /:id - Get thesis
const getRoute = createRoute({
  method: "get",
  path: "/:id",
  request: {
    params: z.object({
      id: z.string(),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: ThesisSchema,
        },
      },
      description: "Thesis details",
    },
    404: {
      description: "Thesis not found",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Theses service unavailable",
    },
  },
  tags: ["Theses"],
});

app.openapi(getRoute, () => {
  requireThesesService();
});

// PUT /:id - Update thesis
const updateRoute = createRoute({
  method: "put",
  path: "/:id",
  request: {
    params: z.object({
      id: z.string(),
    }),
    body: {
      content: {
        "application/json": {
          schema: CreateThesisSchema.partial(),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: ThesisSchema,
        },
      },
      description: "Updated thesis",
    },
    404: {
      description: "Thesis not found",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Theses service unavailable",
    },
  },
  tags: ["Theses"],
});

app.openapi(updateRoute, () => {
  requireThesesService();
});

// POST /:id/invalidate - Invalidate thesis
const invalidateRoute = createRoute({
  method: "post",
  path: "/:id/invalidate",
  request: {
    params: z.object({
      id: z.string(),
    }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            reason: z.string(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: ThesisSchema,
        },
      },
      description: "Invalidated thesis",
    },
    404: {
      description: "Thesis not found",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Theses service unavailable",
    },
  },
  tags: ["Theses"],
});

app.openapi(invalidateRoute, () => {
  requireThesesService();
});

// POST /:id/realize - Mark thesis as realized
const realizeRoute = createRoute({
  method: "post",
  path: "/:id/realize",
  request: {
    params: z.object({
      id: z.string(),
    }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            exitPrice: z.number(),
            notes: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: ThesisSchema,
        },
      },
      description: "Realized thesis",
    },
    404: {
      description: "Thesis not found",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Theses service unavailable",
    },
  },
  tags: ["Theses"],
});

app.openapi(realizeRoute, () => {
  requireThesesService();
});

// GET /:id/history - Get thesis history
const historyRoute = createRoute({
  method: "get",
  path: "/:id/history",
  request: {
    params: z.object({
      id: z.string(),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.array(ThesisHistoryEntrySchema),
        },
      },
      description: "Thesis change history",
    },
    404: {
      description: "Thesis not found",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Theses service unavailable",
    },
  },
  tags: ["Theses"],
});

app.openapi(historyRoute, () => {
  requireThesesService();
});

// DELETE /:id - Delete thesis
const deleteRoute = createRoute({
  method: "delete",
  path: "/:id",
  request: {
    params: z.object({
      id: z.string(),
    }),
  },
  responses: {
    204: {
      description: "Thesis deleted",
    },
    404: {
      description: "Thesis not found",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Theses service unavailable",
    },
  },
  tags: ["Theses"],
});

app.openapi(deleteRoute, () => {
  requireThesesService();
});

// ============================================
// Export
// ============================================

export const thesesRoutes = app;
export default thesesRoutes;
