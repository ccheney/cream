/**
 * Agent API Routes
 *
 * Routes for agent status, outputs, and configuration.
 *
 * @see docs/plans/ui/05-api-endpoints.md Agents section
 * @see docs/plans/05-agents.md
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getAgentOutputsRepo } from "../db.js";

// ============================================
// App Setup
// ============================================

const app = new OpenAPIHono();

// ============================================
// Schema Definitions
// ============================================

const AgentTypeSchema = z.enum([
  "technical",
  "news",
  "fundamentals",
  "bullish",
  "bearish",
  "trader",
  "risk",
  "critic",
]);

const AgentStatusSchema = z.object({
  type: z.string(),
  displayName: z.string(),
  status: z.enum(["idle", "processing", "error"]),
  lastOutputAt: z.string().nullable(),
  outputsToday: z.number(),
  avgConfidence: z.number(),
  approvalRate: z.number(),
});

const AgentOutputSchema = z.object({
  id: z.string(),
  agentType: z.string(),
  decisionId: z.string(),
  vote: z.enum(["APPROVE", "REJECT"]),
  confidence: z.number(),
  reasoning: z.string(),
  processingTimeMs: z.number(),
  createdAt: z.string(),
});

const AgentConfigSchema = z.object({
  type: z.string(),
  model: z.string(),
  temperature: z.number(),
  maxTokens: z.number(),
  systemPrompt: z.string(),
  enabled: z.boolean(),
});

const PaginatedOutputsSchema = z.object({
  outputs: z.array(AgentOutputSchema),
  total: z.number(),
  offset: z.number(),
  limit: z.number(),
});

// ============================================
// Agent Definitions
// ============================================

const AGENT_DEFINITIONS = [
  { type: "technical", displayName: "Technical Analyst" },
  { type: "news", displayName: "News & Sentiment" },
  { type: "fundamentals", displayName: "Fundamentals & Macro" },
  { type: "bullish", displayName: "Bullish Research" },
  { type: "bearish", displayName: "Bearish Research" },
  { type: "trader", displayName: "Trader" },
  { type: "risk", displayName: "Risk Manager" },
  { type: "critic", displayName: "Critic" },
];

// In-memory config store (TODO: persist to database when agent_configs table is added)
const agentConfigs = new Map<string, z.infer<typeof AgentConfigSchema>>(
  AGENT_DEFINITIONS.map((agent) => [
    agent.type,
    {
      type: agent.type,
      model: "gemini-3-pro-preview",
      temperature: 0.7,
      maxTokens: 4096,
      systemPrompt: `You are the ${agent.displayName} agent for the Cream trading system.`,
      enabled: true,
    },
  ])
);

// ============================================
// Helper Functions
// ============================================

function getAgentStatus(type: string): z.infer<typeof AgentStatusSchema> | null {
  const definition = AGENT_DEFINITIONS.find((a) => a.type === type);
  if (!definition) {
    return null;
  }

  const outputs = agentOutputs.filter((o) => o.agentType === type);
  const today = new Date().toISOString().slice(0, 10);
  const todayOutputs = outputs.filter((o) => o.createdAt.startsWith(today));

  const approves = outputs.filter((o) => o.vote === "APPROVE").length;
  const approvalRate = outputs.length > 0 ? approves / outputs.length : 0;
  const avgConfidence =
    outputs.length > 0 ? outputs.reduce((sum, o) => sum + o.confidence, 0) / outputs.length : 0;

  const lastOutput = outputs.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )[0];

  return {
    type: definition.type,
    displayName: definition.displayName,
    status: "idle",
    lastOutputAt: lastOutput?.createdAt ?? null,
    outputsToday: todayOutputs.length,
    avgConfidence: Math.round(avgConfidence * 100) / 100,
    approvalRate: Math.round(approvalRate * 100) / 100,
  };
}

// ============================================
// Routes
// ============================================

// GET /status - Get all agent statuses
const statusRoute = createRoute({
  method: "get",
  path: "/status",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.array(AgentStatusSchema),
        },
      },
      description: "All agent statuses",
    },
  },
  tags: ["Agents"],
});

app.openapi(statusRoute, (c) => {
  const statuses = AGENT_DEFINITIONS.map((a) => getAgentStatus(a.type)!);
  return c.json(statuses);
});

// GET /:type/outputs - Get agent outputs
const outputsRoute = createRoute({
  method: "get",
  path: "/:type/outputs",
  request: {
    params: z.object({
      type: AgentTypeSchema,
    }),
    query: z.object({
      limit: z.coerce.number().min(1).max(100).default(20),
      offset: z.coerce.number().min(0).default(0),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: PaginatedOutputsSchema,
        },
      },
      description: "Agent outputs",
    },
    404: {
      description: "Agent not found",
    },
  },
  tags: ["Agents"],
});

app.openapi(outputsRoute, (c) => {
  const { type } = c.req.valid("param");
  const { limit, offset } = c.req.valid("query");

  if (!AGENT_DEFINITIONS.find((a) => a.type === type)) {
    throw new HTTPException(404, { message: "Agent not found" });
  }

  const typeOutputs = agentOutputs
    .filter((o) => o.agentType === type)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const paginated = typeOutputs.slice(offset, offset + limit);

  return c.json({
    outputs: paginated,
    total: typeOutputs.length,
    offset,
    limit,
  });
});

// GET /:type/config - Get agent config
const getConfigRoute = createRoute({
  method: "get",
  path: "/:type/config",
  request: {
    params: z.object({
      type: AgentTypeSchema,
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: AgentConfigSchema,
        },
      },
      description: "Agent config",
    },
    404: {
      description: "Agent not found",
    },
  },
  tags: ["Agents"],
});

app.openapi(getConfigRoute, (c) => {
  const { type } = c.req.valid("param");

  const config = agentConfigs.get(type);
  if (!config) {
    throw new HTTPException(404, { message: "Agent not found" });
  }

  return c.json(config);
});

// PUT /:type/config - Update agent config
const updateConfigRoute = createRoute({
  method: "put",
  path: "/:type/config",
  request: {
    params: z.object({
      type: AgentTypeSchema,
    }),
    body: {
      content: {
        "application/json": {
          schema: AgentConfigSchema.omit({ type: true }),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: AgentConfigSchema,
        },
      },
      description: "Updated agent config",
    },
    404: {
      description: "Agent not found",
    },
  },
  tags: ["Agents"],
});

app.openapi(updateConfigRoute, (c) => {
  const { type } = c.req.valid("param");
  const updates = c.req.valid("json");

  const existing = agentConfigs.get(type);
  if (!existing) {
    throw new HTTPException(404, { message: "Agent not found" });
  }

  const updated: z.infer<typeof AgentConfigSchema> = {
    ...existing,
    ...updates,
    type, // Ensure type can't be changed
  };

  agentConfigs.set(type, updated);

  return c.json(updated);
});

// ============================================
// Export
// ============================================

export const agentsRoutes = app;
export default agentsRoutes;
