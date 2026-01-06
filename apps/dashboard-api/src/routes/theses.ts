/**
 * Theses API Routes
 *
 * Routes for managing trading theses and convictions.
 *
 * @see docs/plans/ui/05-api-endpoints.md Theses section
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

// ============================================
// In-Memory Store (replace with DB)
// ============================================

const theses = new Map<string, z.infer<typeof ThesisSchema>>();
const thesisHistory = new Map<string, z.infer<typeof ThesisHistoryEntrySchema>[]>();

// Seed with sample theses
function seedTheses() {
  const sample1: z.infer<typeof ThesisSchema> = {
    id: "thesis-001",
    symbol: "NVDA",
    direction: "BULLISH",
    thesis:
      "NVDA continues to dominate AI chip market with strong data center demand. Q4 guidance suggests accelerating growth.",
    catalysts: [
      "Upcoming earnings release",
      "New Blackwell GPU architecture launch",
      "Cloud provider capex expansion",
    ],
    invalidationConditions: [
      "Break below $120 support",
      "Significant competition from AMD MI300",
      "Data center demand slowdown",
    ],
    targetPrice: 180,
    stopPrice: 120,
    timeHorizon: "POSITION",
    confidence: 0.78,
    status: "ACTIVE",
    entryPrice: 140,
    currentPrice: 155,
    pnlPct: 10.7,
    createdAt: "2026-01-02T09:00:00Z",
    updatedAt: "2026-01-06T10:00:00Z",
    expiresAt: "2026-03-31T16:00:00Z",
    agentSource: "technical_analyst",
    supportingEvidence: [
      {
        type: "technical",
        summary: "Price above all major moving averages, RSI neutral at 55",
        weight: 0.3,
      },
      {
        type: "fundamental",
        summary: "Forward P/E reasonable given 40%+ growth rate",
        weight: 0.4,
      },
      {
        type: "sentiment",
        summary: "Analyst upgrades outpacing downgrades 3:1",
        weight: 0.3,
      },
    ],
  };

  const sample2: z.infer<typeof ThesisSchema> = {
    id: "thesis-002",
    symbol: "TSLA",
    direction: "BEARISH",
    thesis:
      "TSLA faces margin compression from price cuts and increasing competition in EV market.",
    catalysts: [
      "Q4 delivery numbers below expectations",
      "Chinese EV makers gaining market share",
      "FSD regulatory headwinds",
    ],
    invalidationConditions: [
      "Break above $280 resistance",
      "Robotaxi announcement with concrete timeline",
      "Significant margin improvement",
    ],
    targetPrice: 180,
    stopPrice: 280,
    timeHorizon: "SWING",
    confidence: 0.65,
    status: "ACTIVE",
    entryPrice: 250,
    currentPrice: 235,
    pnlPct: 6.0,
    createdAt: "2026-01-03T14:00:00Z",
    updatedAt: "2026-01-05T11:00:00Z",
    expiresAt: "2026-02-28T16:00:00Z",
    agentSource: "fundamentals_analyst",
    supportingEvidence: [
      {
        type: "fundamental",
        summary: "Gross margins declining QoQ for 4 consecutive quarters",
        weight: 0.5,
      },
      {
        type: "sentiment",
        summary: "Consumer sentiment surveys show brand perception decline",
        weight: 0.25,
      },
      {
        type: "macro",
        summary: "Rising interest rates impacting auto financing",
        weight: 0.25,
      },
    ],
  };

  const sample3: z.infer<typeof ThesisSchema> = {
    id: "thesis-003",
    symbol: "AAPL",
    direction: "NEUTRAL",
    thesis:
      "AAPL trading in range as market awaits Vision Pro sales data and iPhone 17 cycle clarity.",
    catalysts: [
      "Vision Pro sales report",
      "Services revenue growth",
      "iPhone 17 cycle expectations",
    ],
    invalidationConditions: ["Break above $200 or below $170", "Significant China sales weakness"],
    targetPrice: null,
    stopPrice: null,
    timeHorizon: "SWING",
    confidence: 0.55,
    status: "ACTIVE",
    entryPrice: null,
    currentPrice: 185,
    pnlPct: null,
    createdAt: "2026-01-04T10:00:00Z",
    updatedAt: "2026-01-06T09:00:00Z",
    expiresAt: "2026-01-31T16:00:00Z",
    agentSource: "trader_agent",
    supportingEvidence: [
      {
        type: "technical",
        summary: "Consolidating in $175-$195 range for 3 weeks",
        weight: 0.4,
      },
      {
        type: "fundamental",
        summary: "Valuation fair at current levels, no clear catalyst",
        weight: 0.6,
      },
    ],
  };

  theses.set(sample1.id, sample1);
  theses.set(sample2.id, sample2);
  theses.set(sample3.id, sample3);
}

seedTheses();

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

app.openapi(listRoute, (c) => {
  const { status, symbol, direction } = c.req.valid("query");

  let list = Array.from(theses.values());

  if (status) {
    list = list.filter((t) => t.status === status);
  }
  if (symbol) {
    list = list.filter((t) => t.symbol === symbol.toUpperCase());
  }
  if (direction) {
    list = list.filter((t) => t.direction === direction);
  }

  list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return c.json(list);
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

app.openapi(createThesisRoute, (c) => {
  const input = c.req.valid("json");

  const id = `thesis-${String(theses.size + 1).padStart(3, "0")}`;
  const now = new Date().toISOString();

  const thesis: z.infer<typeof ThesisSchema> = {
    id,
    ...input,
    symbol: input.symbol.toUpperCase(),
    status: "ACTIVE",
    entryPrice: null,
    currentPrice: null,
    pnlPct: null,
    createdAt: now,
    updatedAt: now,
    agentSource: "user",
    supportingEvidence: [],
  };

  theses.set(id, thesis);
  thesisHistory.set(id, []);

  return c.json(thesis, 201);
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

app.openapi(getRoute, (c) => {
  const { id } = c.req.valid("param");
  const thesis = theses.get(id);

  if (!thesis) {
    throw new HTTPException(404, { message: "Thesis not found" });
  }

  return c.json(thesis);
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

app.openapi(updateRoute, (c) => {
  const { id } = c.req.valid("param");
  const updates = c.req.valid("json");
  const thesis = theses.get(id);

  if (!thesis) {
    throw new HTTPException(404, { message: "Thesis not found" });
  }

  // Track changes in history
  const history = thesisHistory.get(id) ?? [];
  for (const [key, value] of Object.entries(updates)) {
    if (thesis[key as keyof typeof thesis] !== value) {
      history.push({
        id: `hist-${history.length + 1}`,
        thesisId: id,
        field: key,
        oldValue: thesis[key as keyof typeof thesis],
        newValue: value,
        reason: null,
        timestamp: new Date().toISOString(),
      });
    }
  }
  thesisHistory.set(id, history);

  // Apply updates
  Object.assign(thesis, updates, { updatedAt: new Date().toISOString() });
  theses.set(id, thesis);

  return c.json(thesis);
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

app.openapi(invalidateRoute, (c) => {
  const { id } = c.req.valid("param");
  const { reason } = c.req.valid("json");
  const thesis = theses.get(id);

  if (!thesis) {
    throw new HTTPException(404, { message: "Thesis not found" });
  }

  const history = thesisHistory.get(id) ?? [];
  history.push({
    id: `hist-${history.length + 1}`,
    thesisId: id,
    field: "status",
    oldValue: thesis.status,
    newValue: "INVALIDATED",
    reason,
    timestamp: new Date().toISOString(),
  });
  thesisHistory.set(id, history);

  thesis.status = "INVALIDATED";
  thesis.updatedAt = new Date().toISOString();
  theses.set(id, thesis);

  return c.json(thesis);
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

app.openapi(realizeRoute, (c) => {
  const { id } = c.req.valid("param");
  const { exitPrice, notes } = c.req.valid("json");
  const thesis = theses.get(id);

  if (!thesis) {
    throw new HTTPException(404, { message: "Thesis not found" });
  }

  const history = thesisHistory.get(id) ?? [];
  history.push({
    id: `hist-${history.length + 1}`,
    thesisId: id,
    field: "status",
    oldValue: thesis.status,
    newValue: "REALIZED",
    reason: notes ?? `Exit at ${exitPrice}`,
    timestamp: new Date().toISOString(),
  });
  thesisHistory.set(id, history);

  thesis.status = "REALIZED";
  thesis.currentPrice = exitPrice;
  if (thesis.entryPrice) {
    const pnl =
      thesis.direction === "BEARISH"
        ? thesis.entryPrice - exitPrice
        : exitPrice - thesis.entryPrice;
    thesis.pnlPct = (pnl / thesis.entryPrice) * 100;
  }
  thesis.updatedAt = new Date().toISOString();
  theses.set(id, thesis);

  return c.json(thesis);
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

app.openapi(historyRoute, (c) => {
  const { id } = c.req.valid("param");

  if (!theses.has(id)) {
    throw new HTTPException(404, { message: "Thesis not found" });
  }

  return c.json(thesisHistory.get(id) ?? []);
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

app.openapi(deleteRoute, (c) => {
  const { id } = c.req.valid("param");

  if (!theses.has(id)) {
    throw new HTTPException(404, { message: "Thesis not found" });
  }

  theses.delete(id);
  thesisHistory.delete(id);

  return c.body(null, 204);
});

// ============================================
// Export
// ============================================

export const thesesRoutes = app;
export default thesesRoutes;
