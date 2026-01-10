/**
 * Agent API Routes
 *
 * Routes for agent status, outputs, and configuration.
 *
 * @see docs/plans/ui/05-api-endpoints.md Agents section
 * @see docs/plans/05-agents.md
 */

import { requireEnv } from "@cream/domain";
import type { AgentType as DbAgentType } from "@cream/storage";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getAgentConfigsRepo, getAgentOutputsRepo } from "../db.js";

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

/**
 * Map from API agent types (short) to database agent types (full)
 */
const API_TO_DB_AGENT_TYPE: Record<string, DbAgentType> = {
  technical: "technical_analyst",
  news: "news_analyst",
  fundamentals: "fundamentals_analyst",
  bullish: "bullish_researcher",
  bearish: "bearish_researcher",
  trader: "trader",
  risk: "risk_manager",
  critic: "critic",
};

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

/**
 * Default prompts for each agent type
 */
const DEFAULT_PROMPTS: Record<string, string> = {
  technical: "You are the Technical Analyst agent for the Cream trading system.",
  news: "You are the News & Sentiment agent for the Cream trading system.",
  fundamentals: "You are the Fundamentals & Macro agent for the Cream trading system.",
  bullish: "You are the Bullish Research agent for the Cream trading system.",
  bearish: "You are the Bearish Research agent for the Cream trading system.",
  trader: "You are the Trader agent for the Cream trading system.",
  risk: "You are the Risk Manager agent for the Cream trading system.",
  critic: "You are the Critic agent for the Cream trading system.",
};

// ============================================
// Helper Functions
// ============================================

async function getAgentStatus(type: string): Promise<z.infer<typeof AgentStatusSchema> | null> {
  const definition = AGENT_DEFINITIONS.find((a) => a.type === type);
  if (!definition) {
    return null;
  }

  const repo = await getAgentOutputsRepo();
  const outputs = await repo.findByAgentType(type, 100);

  const today = new Date().toISOString().slice(0, 10);
  const todayOutputs = outputs.filter((o) => o.createdAt.startsWith(today));

  const approves = outputs.filter((o) => o.vote === "APPROVE").length;
  const approvalRate = outputs.length > 0 ? approves / outputs.length : 0;
  const avgConfidence =
    outputs.length > 0 ? outputs.reduce((sum, o) => sum + o.confidence, 0) / outputs.length : 0;

  const lastOutput = outputs[0]; // Already sorted DESC by findByAgentType

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

app.openapi(statusRoute, async (c) => {
  const statuses = await Promise.all(AGENT_DEFINITIONS.map((a) => getAgentStatus(a.type)));
  return c.json(statuses.filter((s): s is NonNullable<typeof s> => s !== null));
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

app.openapi(outputsRoute, async (c) => {
  const { type } = c.req.valid("param");
  const { limit, offset } = c.req.valid("query");

  if (!AGENT_DEFINITIONS.find((a) => a.type === type)) {
    throw new HTTPException(404, { message: "Agent not found" });
  }

  const repo = await getAgentOutputsRepo();
  // Fetch more than needed to handle offset (repository doesn't support offset directly)
  const allOutputs = await repo.findByAgentType(type, offset + limit);
  const paginatedOutputs = allOutputs.slice(offset, offset + limit);

  // Map DB schema to API schema
  const outputs = paginatedOutputs.map((o) => ({
    id: String(o.id),
    agentType: o.agentType,
    decisionId: o.decisionId,
    vote: o.vote === "ABSTAIN" ? "REJECT" : o.vote, // API doesn't support ABSTAIN
    confidence: o.confidence,
    reasoning: o.reasoningSummary ?? o.fullReasoning ?? "",
    processingTimeMs: o.latencyMs ?? 0,
    createdAt: o.createdAt,
  }));

  return c.json({
    outputs,
    total: allOutputs.length,
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

app.openapi(getConfigRoute, async (c) => {
  const { type } = c.req.valid("param");
  const env = requireEnv();
  const dbType = API_TO_DB_AGENT_TYPE[type];

  if (!dbType) {
    throw new HTTPException(404, { message: "Agent not found" });
  }

  const repo = await getAgentConfigsRepo();
  const dbConfig = await repo.get(env, dbType);

  // Return config from database if exists, otherwise return defaults
  const defaultPrompt =
    DEFAULT_PROMPTS[type] ?? `You are the ${type} agent for the Cream trading system.`;
  const config: z.infer<typeof AgentConfigSchema> = dbConfig
    ? {
        type,
        systemPrompt: dbConfig.systemPromptOverride ?? defaultPrompt,
        enabled: dbConfig.enabled,
      }
    : {
        type,
        systemPrompt: defaultPrompt,
        enabled: true,
      };

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

app.openapi(updateConfigRoute, async (c) => {
  const { type } = c.req.valid("param");
  const updates = c.req.valid("json");
  const env = requireEnv();
  const dbType = API_TO_DB_AGENT_TYPE[type];

  if (!dbType) {
    throw new HTTPException(404, { message: "Agent not found" });
  }

  const repo = await getAgentConfigsRepo();

  // Upsert the config (creates if not exists, updates if exists)
  const dbConfig = await repo.upsert(env, dbType, {
    systemPromptOverride:
      updates.systemPrompt !== DEFAULT_PROMPTS[type] ? updates.systemPrompt : null,
    enabled: updates.enabled,
  });

  const defaultPrompt =
    DEFAULT_PROMPTS[type] ?? `You are the ${type} agent for the Cream trading system.`;
  const result: z.infer<typeof AgentConfigSchema> = {
    type,
    systemPrompt: dbConfig.systemPromptOverride ?? defaultPrompt,
    enabled: dbConfig.enabled,
  };

  return c.json(result);
});

// ============================================
// Export
// ============================================

export const agentsRoutes = app;
export default agentsRoutes;
