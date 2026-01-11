/**
 * Agent Configuration Routes
 *
 * Agent configuration is managed through the draft workflow in trading.ts.
 * This module provides dedicated agent-specific endpoints for convenience.
 *
 * Agents are configured per-environment with:
 * - System prompt overrides
 * - Enable/disable toggles
 */

import { type RuntimeAgentConfig, type RuntimeAgentType, RuntimeConfigError } from "@cream/config";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getRuntimeConfigService } from "../../db.js";
import {
  AgentConfigSchema,
  AgentTypeSchema,
  EnvironmentQuerySchema,
  ErrorResponseSchema,
  getEnvironment,
} from "./types.js";

const app = new OpenAPIHono();

// ============================================
// GET /agents - Get all agent configurations
// ============================================

const getAgentsRoute = createRoute({
  method: "get",
  path: "/agents",
  request: {
    query: EnvironmentQuerySchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.record(AgentTypeSchema, AgentConfigSchema),
        },
      },
      description: "Agent configurations",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "No active configuration found",
    },
  },
  tags: ["Config"],
});

app.openapi(getAgentsRoute, async (c) => {
  const environment = getEnvironment(c);
  try {
    const service = await getRuntimeConfigService();
    const config = await service.getActiveConfig(environment);
    return c.json(config.agents, 200);
  } catch (err) {
    if (err instanceof RuntimeConfigError && err.code === "NOT_SEEDED") {
      return c.json({ error: err.message, code: err.code }, 404);
    }
    throw err;
  }
});

// ============================================
// PUT /agents/:agentType - Update single agent configuration
// ============================================

const AgentUpdateInputSchema = z.object({
  systemPromptOverride: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
});

const updateAgentRoute = createRoute({
  method: "put",
  path: "/agents/{agentType}",
  request: {
    query: EnvironmentQuerySchema,
    params: z.object({
      agentType: AgentTypeSchema.openapi({ description: "Agent type to update" }),
    }),
    body: {
      content: { "application/json": { schema: AgentUpdateInputSchema } },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: AgentConfigSchema } },
      description: "Updated agent configuration",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "No active configuration found",
    },
  },
  tags: ["Config"],
});

app.openapi(updateAgentRoute, async (c) => {
  const environment = getEnvironment(c);
  const { agentType } = c.req.valid("param");
  const updates = c.req.valid("json");

  try {
    const service = await getRuntimeConfigService();
    const updated = await service.saveDraft(environment, {
      agents: {
        [agentType]: updates as Partial<RuntimeAgentConfig>,
      } as Partial<Record<RuntimeAgentType, Partial<RuntimeAgentConfig>>>,
    });
    return c.json(updated.agents[agentType as RuntimeAgentType], 200);
  } catch (err) {
    if (err instanceof RuntimeConfigError && err.code === "NOT_SEEDED") {
      return c.json({ error: err.message, code: err.code }, 404);
    }
    throw err;
  }
});

export const agentsRoutes = app;
export default agentsRoutes;
