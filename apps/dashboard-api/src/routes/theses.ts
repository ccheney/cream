/**
 * Theses API Routes
 *
 * Routes for managing trading theses and convictions.
 * Data is stored in Turso (SQLite) via ThesisStateRepository.
 *
 * @see docs/plans/ui/05-api-endpoints.md Theses section
 * @see packages/storage/src/repositories/thesis-state.ts
 * @see bead cream-9s0n8
 */

import type { Thesis, ThesisState } from "@cream/storage";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getThesesRepo } from "../db.js";
import { systemState } from "./system.js";

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

// ErrorSchema available for future 4xx/5xx response definitions
const _ErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
});

// ============================================
// Type Mapping Helpers
// ============================================

/**
 * Map internal thesis state to API status
 */
function mapStateToStatus(state: ThesisState): "ACTIVE" | "INVALIDATED" | "REALIZED" | "EXPIRED" {
  if (state === "CLOSED") {
    return "REALIZED";
  }
  return "ACTIVE";
}

/**
 * Infer direction from thesis text (basic heuristic)
 */
function inferDirection(thesis: Thesis): "BULLISH" | "BEARISH" | "NEUTRAL" {
  const thesisText = (thesis.entryThesis ?? "").toLowerCase();
  if (thesisText.includes("bullish") || thesisText.includes("long") || thesisText.includes("buy")) {
    return "BULLISH";
  }
  if (
    thesisText.includes("bearish") ||
    thesisText.includes("short") ||
    thesisText.includes("sell")
  ) {
    return "BEARISH";
  }
  return "NEUTRAL";
}

/**
 * Map repository thesis to API response format
 */
function mapThesisToResponse(thesis: Thesis): z.infer<typeof ThesisSchema> {
  const notes = thesis.notes as Record<string, unknown>;

  return {
    id: thesis.thesisId,
    symbol: thesis.instrumentId,
    direction: inferDirection(thesis),
    thesis: thesis.entryThesis ?? "",
    catalysts: (notes.catalysts as string[]) ?? [],
    invalidationConditions: thesis.invalidationConditions ? [thesis.invalidationConditions] : [],
    targetPrice: thesis.currentTarget,
    stopPrice: thesis.currentStop,
    timeHorizon: (notes.timeHorizon as "INTRADAY" | "SWING" | "POSITION" | "LONG_TERM") ?? "SWING",
    confidence: thesis.conviction ?? 0.5,
    status: mapStateToStatus(thesis.state),
    entryPrice: thesis.entryPrice,
    currentPrice: null, // Would need market data to populate
    pnlPct: thesis.realizedPnlPct,
    createdAt: thesis.createdAt,
    updatedAt: thesis.lastUpdated,
    expiresAt: (notes.expiresAt as string) ?? null,
    agentSource: (notes.agentSource as string) ?? "manual",
    supportingEvidence:
      (notes.supportingEvidence as z.infer<typeof ThesisSchema>["supportingEvidence"]) ?? [],
  };
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
  },
  tags: ["Theses"],
});

app.openapi(listRoute, async (c) => {
  const { status, symbol } = c.req.valid("query");
  const repo = await getThesesRepo();

  // Map API status to internal states
  let states: ThesisState[] | undefined;
  if (status === "ACTIVE") {
    states = ["WATCHING", "ENTERED", "ADDING", "MANAGING", "EXITING"];
  } else if (status === "REALIZED" || status === "INVALIDATED" || status === "EXPIRED") {
    states = ["CLOSED"];
  }

  const result = await repo.findMany({
    instrumentId: symbol,
    states,
    environment: systemState.environment,
  });

  const theses = result.data.map(mapThesisToResponse);
  return c.json(theses);
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
  },
  tags: ["Theses"],
});

app.openapi(createThesisRoute, async (c) => {
  const body = c.req.valid("json");
  const repo = await getThesesRepo();

  const thesisId = `thesis_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  const thesis = await repo.create({
    thesisId,
    instrumentId: body.symbol,
    state: "WATCHING",
    entryThesis: body.thesis,
    invalidationConditions: body.invalidationConditions.join("; "),
    conviction: body.confidence,
    currentStop: body.stopPrice ?? undefined,
    currentTarget: body.targetPrice ?? undefined,
    environment: systemState.environment,
    notes: {
      direction: body.direction,
      catalysts: body.catalysts,
      timeHorizon: body.timeHorizon,
      expiresAt: body.expiresAt,
      agentSource: "dashboard-api",
    },
  });

  return c.json(mapThesisToResponse(thesis), 201);
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
  },
  tags: ["Theses"],
});

app.openapi(getRoute, async (c) => {
  const { id } = c.req.valid("param");
  const repo = await getThesesRepo();

  const thesis = await repo.findById(id);
  if (!thesis) {
    throw new HTTPException(404, { message: "Thesis not found" });
  }

  return c.json(mapThesisToResponse(thesis));
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
  },
  tags: ["Theses"],
});

app.openapi(updateRoute, async (c) => {
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");
  const repo = await getThesesRepo();

  const existing = await repo.findById(id);
  if (!existing) {
    throw new HTTPException(404, { message: "Thesis not found" });
  }

  // Update conviction if provided
  if (body.confidence !== undefined) {
    await repo.updateConviction(id, body.confidence);
  }

  // Update stop/target if provided
  if (body.stopPrice !== undefined || body.targetPrice !== undefined) {
    await repo.updateLevels(id, body.stopPrice ?? undefined, body.targetPrice ?? undefined);
  }

  // Update notes with any new fields
  const existingNotes = existing.notes as Record<string, unknown>;
  const updatedNotes: Record<string, unknown> = { ...existingNotes };

  if (body.direction !== undefined) {
    updatedNotes.direction = body.direction;
  }
  if (body.catalysts !== undefined) {
    updatedNotes.catalysts = body.catalysts;
  }
  if (body.timeHorizon !== undefined) {
    updatedNotes.timeHorizon = body.timeHorizon;
  }
  if (body.expiresAt !== undefined) {
    updatedNotes.expiresAt = body.expiresAt;
  }

  // Add notes one at a time (repository pattern)
  for (const [key, value] of Object.entries(updatedNotes)) {
    if (value !== existingNotes[key]) {
      await repo.addNotes(id, key, value);
    }
  }

  const updated = await repo.findById(id);
  if (!updated) {
    throw new HTTPException(404, { message: "Thesis not found after update" });
  }
  return c.json(mapThesisToResponse(updated));
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
  },
  tags: ["Theses"],
});

app.openapi(invalidateRoute, async (c) => {
  const { id } = c.req.valid("param");
  const { reason } = c.req.valid("json");
  const repo = await getThesesRepo();

  const existing = await repo.findById(id);
  if (!existing) {
    throw new HTTPException(404, { message: "Thesis not found" });
  }

  await repo.close(id, "INVALIDATED", undefined, undefined);
  await repo.addNotes(id, "invalidationReason", reason);

  const updated = await repo.findById(id);
  if (!updated) {
    throw new HTTPException(404, { message: "Thesis not found after invalidation" });
  }
  return c.json(mapThesisToResponse(updated));
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
  },
  tags: ["Theses"],
});

app.openapi(realizeRoute, async (c) => {
  const { id } = c.req.valid("param");
  const { exitPrice, notes } = c.req.valid("json");
  const repo = await getThesesRepo();

  const existing = await repo.findById(id);
  if (!existing) {
    throw new HTTPException(404, { message: "Thesis not found" });
  }

  // Calculate realized P&L if entry price exists
  const realizedPnl = existing.entryPrice ? exitPrice - existing.entryPrice : undefined;

  // Determine close reason based on price vs target/stop
  let closeReason: "TARGET_HIT" | "STOP_HIT" | "MANUAL" = "MANUAL";
  if (existing.currentTarget && exitPrice >= existing.currentTarget) {
    closeReason = "TARGET_HIT";
  } else if (existing.currentStop && exitPrice <= existing.currentStop) {
    closeReason = "STOP_HIT";
  }

  await repo.close(id, closeReason, exitPrice, realizedPnl);

  if (notes) {
    await repo.addNotes(id, "realizationNotes", notes);
  }

  const updated = await repo.findById(id);
  if (!updated) {
    throw new HTTPException(404, { message: "Thesis not found after realization" });
  }
  return c.json(mapThesisToResponse(updated));
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
  },
  tags: ["Theses"],
});

app.openapi(historyRoute, async (c) => {
  const { id } = c.req.valid("param");
  const repo = await getThesesRepo();

  const thesis = await repo.findById(id);
  if (!thesis) {
    throw new HTTPException(404, { message: "Thesis not found" });
  }

  const history = await repo.getHistory(id);

  // Map state history to API format
  const historyEntries = history.map((entry) => ({
    id: String(entry.id),
    thesisId: entry.thesisId,
    field: "state",
    oldValue: entry.fromState,
    newValue: entry.toState,
    reason: entry.triggerReason,
    timestamp: entry.createdAt,
  }));

  return c.json(historyEntries);
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
  },
  tags: ["Theses"],
});

app.openapi(deleteRoute, async (c) => {
  const { id } = c.req.valid("param");
  const repo = await getThesesRepo();

  const deleted = await repo.delete(id);
  if (!deleted) {
    throw new HTTPException(404, { message: "Thesis not found" });
  }

  return c.body(null, 204);
});

// ============================================
// Export
// ============================================

export const thesesRoutes = app;
export default thesesRoutes;
