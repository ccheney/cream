/**
 * Decisions Routes
 *
 * Endpoints for listing, viewing, and managing trading decisions.
 *
 * @see docs/plans/ui/05-api-endpoints.md
 */

import { createHelixClientFromEnv, getDecisionCitations } from "@cream/helix";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getAgentOutputsRepo, getDecisionsRepo, getOrdersRepo } from "../db.js";

// ============================================
// Schemas
// ============================================

const DecisionActionSchema = z.enum(["BUY", "SELL", "HOLD", "CLOSE"]);
const DecisionDirectionSchema = z.enum(["LONG", "SHORT", "FLAT"]);
const SizeUnitSchema = z.enum(["SHARES", "CONTRACTS", "DOLLARS", "PCT_EQUITY"]);
const DecisionStatusSchema = z.enum(["PENDING", "APPROVED", "REJECTED", "EXECUTED", "FAILED"]);

const DecisionSchema = z.object({
  id: z.string(),
  cycleId: z.string(),
  symbol: z.string(),
  action: DecisionActionSchema,
  direction: DecisionDirectionSchema,
  size: z.number(),
  sizeUnit: SizeUnitSchema,
  entryPrice: z.number().nullable(),
  stopPrice: z.number().nullable(),
  targetPrice: z.number().nullable(),
  status: DecisionStatusSchema,
  confidenceScore: z.number().nullable(),
  createdAt: z.string(),
});

const AgentOutputSchema = z.object({
  agentType: z.string(),
  vote: z.enum(["APPROVE", "REJECT"]),
  confidence: z.number(),
  reasoning: z.string(),
  processingTimeMs: z.number(),
  createdAt: z.string(),
});

const CitationSchema = z.object({
  id: z.string(),
  url: z.string(),
  title: z.string(),
  source: z.string(),
  snippet: z.string(),
  relevanceScore: z.number(),
  fetchedAt: z.string(),
});

const ExecutionDetailSchema = z.object({
  orderId: z.string(),
  brokerOrderId: z.string().nullable(),
  broker: z.string(),
  status: z.string(),
  filledQty: z.number(),
  avgFillPrice: z.number().nullable(),
  slippage: z.number().nullable(),
  commissions: z.number().nullable(),
  timestamps: z.object({
    submitted: z.string(),
    accepted: z.string().nullable(),
    filled: z.string().nullable(),
  }),
});

const DecisionDetailSchema = DecisionSchema.extend({
  strategyFamily: z.string().nullable(),
  timeHorizon: z.string().nullable(),
  rationale: z.string().nullable(),
  bullishFactors: z.array(z.string()),
  bearishFactors: z.array(z.string()),
  agentOutputs: z.array(AgentOutputSchema),
  citations: z.array(CitationSchema),
  execution: ExecutionDetailSchema.nullable(),
});

const PaginatedDecisionsSchema = z.object({
  decisions: z.array(DecisionSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});

const DecisionQuerySchema = z.object({
  symbol: z.string().optional(),
  action: DecisionActionSchema.optional(),
  status: DecisionStatusSchema.optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

// ============================================
// Routes
// ============================================

const app = new OpenAPIHono();

// GET /api/decisions
const listRoute = createRoute({
  method: "get",
  path: "/",
  request: {
    query: DecisionQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: PaginatedDecisionsSchema } },
      description: "List of decisions",
    },
  },
  tags: ["Decisions"],
});

// @ts-expect-error - Hono OpenAPI enum type inference limitation
app.openapi(listRoute, async (c) => {
  const query = c.req.valid("query");
  const repo = await getDecisionsRepo();

  const result = await repo.findMany(
    {
      symbol: query.symbol,
      action: query.action,
      status: query.status as any,
      fromDate: query.dateFrom,
      toDate: query.dateTo,
    },
    {
      page: Math.floor(query.offset / query.limit) + 1,
      pageSize: query.limit,
    }
  );

  return c.json({
    decisions: result.data.map((d) => ({
      id: d.id,
      cycleId: d.cycleId,
      symbol: d.symbol,
      action: d.action,
      direction: d.direction,
      size: d.size,
      sizeUnit: d.sizeUnit,
      entryPrice: d.entryPrice,
      stopPrice: d.stopPrice,
      targetPrice: d.targetPrice,
      status: d.status,
      confidenceScore: d.confidenceScore,
      createdAt: d.createdAt,
    })),
    total: result.total,
    limit: result.pageSize,
    offset: (result.page - 1) * result.pageSize,
  });
});

// GET /api/decisions/:id
const detailRoute = createRoute({
  method: "get",
  path: "/:id",
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: DecisionDetailSchema } },
      description: "Decision detail",
    },
    404: {
      content: {
        "application/json": {
          schema: z.object({ error: z.string() }),
        },
      },
      description: "Decision not found",
    },
  },
  tags: ["Decisions"],
});

// @ts-expect-error - Hono OpenAPI multi-response type inference limitation
app.openapi(detailRoute, async (c) => {
  const { id } = c.req.valid("param");
  const [decisionsRepo, agentOutputsRepo, ordersRepo] = await Promise.all([
    getDecisionsRepo(),
    getAgentOutputsRepo(),
    getOrdersRepo(),
  ]);

  const decision = await decisionsRepo.findById(id);
  if (!decision) {
    return c.json({ error: "Decision not found" }, 404);
  }

  // Get agent outputs for this decision
  const agentOutputs = await agentOutputsRepo.findByDecision(id);

  // Get execution details (orders linked to this decision)
  const orders = await ordersRepo.findByDecision(id);
  const order = orders[0]; // Primary order

  // Fetch citations from HelixDB (non-blocking - empty array if unavailable)
  let citations: Array<{
    id: string;
    url: string;
    title: string;
    source: string;
    snippet: string;
    relevanceScore: number;
    fetchedAt: string;
  }> = [];

  try {
    const helixClient = createHelixClientFromEnv();
    const rawCitations = await getDecisionCitations(helixClient, id);
    citations = rawCitations.map((citation) => ({
      id: citation.id,
      url: citation.url ?? "",
      title: citation.title,
      source: citation.source,
      snippet: citation.snippet,
      relevanceScore: citation.relevanceScore,
      fetchedAt: citation.fetchedAt,
    }));
  } catch {
    // HelixDB unavailable - continue with empty citations
  }

  return c.json({
    id: decision.id,
    cycleId: decision.cycleId,
    symbol: decision.symbol,
    action: decision.action,
    direction: decision.direction,
    size: decision.size,
    sizeUnit: decision.sizeUnit as "SHARES" | "CONTRACTS" | "DOLLARS" | "PCT_EQUITY",
    entryPrice: decision.entryPrice,
    stopPrice: decision.stopPrice,
    targetPrice: decision.targetPrice,
    status: decision.status,
    confidenceScore: decision.confidenceScore,
    createdAt: decision.createdAt,
    strategyFamily: decision.strategyFamily,
    timeHorizon: decision.timeHorizon,
    rationale: decision.rationale,
    bullishFactors: decision.bullishFactors ?? [],
    bearishFactors: decision.bearishFactors ?? [],
    agentOutputs: agentOutputs.map((ao) => ({
      agentType: ao.agentType,
      vote: ao.vote,
      confidence: ao.confidence,
      reasoning: ao.reasoningSummary ?? "",
      processingTimeMs: ao.latencyMs ?? 0,
      createdAt: ao.createdAt,
    })),
    citations,
    execution: order
      ? {
          orderId: order.id,
          brokerOrderId: order.brokerOrderId,
          broker: "ALPACA",
          status: order.status,
          filledQty: order.filledQuantity,
          avgFillPrice: order.avgFillPrice,
          slippage: null,
          commissions: null,
          timestamps: {
            submitted: order.createdAt,
            accepted: order.submittedAt,
            filled: order.filledAt,
          },
        }
      : null,
  });
});

// GET /api/decisions/:id/agents
const agentsRoute = createRoute({
  method: "get",
  path: "/:id/agents",
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: z.array(AgentOutputSchema) } },
      description: "Agent outputs for decision",
    },
    404: {
      content: {
        "application/json": {
          schema: z.object({ error: z.string() }),
        },
      },
      description: "Decision not found",
    },
  },
  tags: ["Decisions"],
});

// @ts-expect-error - Hono OpenAPI multi-response type inference limitation
app.openapi(agentsRoute, async (c) => {
  const { id } = c.req.valid("param");
  const [decisionsRepo, agentOutputsRepo] = await Promise.all([
    getDecisionsRepo(),
    getAgentOutputsRepo(),
  ]);

  const decision = await decisionsRepo.findById(id);
  if (!decision) {
    return c.json({ error: "Decision not found" }, 404);
  }

  const agentOutputs = await agentOutputsRepo.findByDecision(id);

  return c.json(
    agentOutputs.map((ao) => ({
      agentType: ao.agentType,
      vote: ao.vote,
      confidence: ao.confidence,
      reasoning: ao.reasoningSummary ?? "",
      processingTimeMs: ao.latencyMs ?? 0,
      createdAt: ao.createdAt,
    }))
  );
});

// GET /api/decisions/:id/citations
const citationsRoute = createRoute({
  method: "get",
  path: "/:id/citations",
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: z.array(CitationSchema) } },
      description: "Citations for decision",
    },
    404: {
      content: {
        "application/json": {
          schema: z.object({ error: z.string() }),
        },
      },
      description: "Decision not found",
    },
  },
  tags: ["Decisions"],
});

// @ts-expect-error - Hono OpenAPI multi-response type inference limitation
app.openapi(citationsRoute, async (c) => {
  const { id } = c.req.valid("param");
  const decisionsRepo = await getDecisionsRepo();

  const decision = await decisionsRepo.findById(id);
  if (!decision) {
    return c.json({ error: "Decision not found" }, 404);
  }

  // Fetch citations from HelixDB
  try {
    const helixClient = createHelixClientFromEnv();
    const citations = await getDecisionCitations(helixClient, id);

    return c.json(
      citations.map((citation) => ({
        id: citation.id,
        url: citation.url ?? "",
        title: citation.title,
        source: citation.source,
        snippet: citation.snippet,
        relevanceScore: citation.relevanceScore,
        fetchedAt: citation.fetchedAt,
      }))
    );
  } catch {
    // If HelixDB is unavailable, return empty array gracefully
    return c.json([]);
  }
});

// GET /api/decisions/:id/execution
const executionRoute = createRoute({
  method: "get",
  path: "/:id/execution",
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: ExecutionDetailSchema.nullable() } },
      description: "Execution details for decision",
    },
    404: {
      content: {
        "application/json": {
          schema: z.object({ error: z.string() }),
        },
      },
      description: "Decision not found",
    },
  },
  tags: ["Decisions"],
});

// @ts-expect-error - Hono OpenAPI multi-response type inference limitation
app.openapi(executionRoute, async (c) => {
  const { id } = c.req.valid("param");
  const [decisionsRepo, ordersRepo] = await Promise.all([getDecisionsRepo(), getOrdersRepo()]);

  const decision = await decisionsRepo.findById(id);
  if (!decision) {
    return c.json({ error: "Decision not found" }, 404);
  }

  const orders = await ordersRepo.findByDecision(id);
  const order = orders[0];

  if (!order) {
    return c.json(null);
  }

  return c.json({
    orderId: order.id,
    brokerOrderId: order.brokerOrderId,
    broker: "ALPACA",
    status: order.status,
    filledQty: order.filledQuantity,
    avgFillPrice: order.avgFillPrice,
    slippage: null,
    commissions: null,
    timestamps: {
      submitted: order.createdAt,
      accepted: order.submittedAt,
      filled: order.filledAt,
    },
  });
});

export default app;
