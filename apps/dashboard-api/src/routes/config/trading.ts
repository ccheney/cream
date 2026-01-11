/**
 * Trading Configuration Routes
 *
 * CRUD endpoints for trading configuration with draft/promote workflow.
 */

import {
  type RuntimeAgentConfig,
  type RuntimeAgentType,
  RuntimeConfigError,
  type RuntimeTradingConfig,
  type RuntimeUniverseConfig,
  type TradingEnvironment,
} from "@cream/config";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { getRuntimeConfigService } from "../../db.js";
import {
  EnvironmentQuerySchema,
  ErrorResponseSchema,
  FullConfigSchema,
  getEnvironment,
  PromoteToInputSchema,
  SaveDraftInputSchema,
  ValidationResultSchema,
} from "./types.js";

const app = new OpenAPIHono();

// ============================================
// GET /active - Get active configuration
// ============================================

const getActiveRoute = createRoute({
  method: "get",
  path: "/active",
  request: {
    query: EnvironmentQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: FullConfigSchema } },
      description: "Active configuration",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "No active configuration found",
    },
  },
  tags: ["Config"],
});

app.openapi(getActiveRoute, async (c) => {
  const environment = getEnvironment(c);
  try {
    const service = await getRuntimeConfigService();
    const config = await service.getActiveConfig(environment);
    return c.json(config, 200);
  } catch (err) {
    if (err instanceof RuntimeConfigError && err.code === "NOT_SEEDED") {
      return c.json({ error: err.message, code: err.code }, 404);
    }
    throw err;
  }
});

// ============================================
// GET /draft - Get draft configuration
// ============================================

const getDraftRoute = createRoute({
  method: "get",
  path: "/draft",
  request: {
    query: EnvironmentQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: FullConfigSchema } },
      description: "Draft configuration",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "No draft configuration found",
    },
  },
  tags: ["Config"],
});

app.openapi(getDraftRoute, async (c) => {
  const environment = getEnvironment(c);
  try {
    const service = await getRuntimeConfigService();
    const config = await service.getDraft(environment);
    return c.json(config, 200);
  } catch (err) {
    if (err instanceof RuntimeConfigError && err.code === "NOT_SEEDED") {
      return c.json({ error: err.message, code: err.code }, 404);
    }
    throw err;
  }
});

// ============================================
// PUT /draft - Save draft configuration
// ============================================

const saveDraftRoute = createRoute({
  method: "put",
  path: "/draft",
  request: {
    query: EnvironmentQuerySchema,
    body: {
      content: { "application/json": { schema: SaveDraftInputSchema } },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: FullConfigSchema } },
      description: "Updated draft configuration",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "No active configuration to base draft on",
    },
  },
  tags: ["Config"],
});

app.openapi(saveDraftRoute, async (c) => {
  const environment = getEnvironment(c);
  const updates = c.req.valid("json");

  try {
    const service = await getRuntimeConfigService();
    const config = await service.saveDraft(environment, {
      trading: updates.trading as Partial<RuntimeTradingConfig>,
      universe: updates.universe as Partial<RuntimeUniverseConfig>,
      agents: updates.agents as Partial<Record<RuntimeAgentType, Partial<RuntimeAgentConfig>>>,
    });
    return c.json(config, 200);
  } catch (err) {
    if (err instanceof RuntimeConfigError && err.code === "NOT_SEEDED") {
      return c.json({ error: err.message, code: err.code }, 404);
    }
    throw err;
  }
});

// ============================================
// POST /validate - Validate configuration for promotion
// ============================================

const validateRoute = createRoute({
  method: "post",
  path: "/validate",
  request: {
    query: EnvironmentQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: ValidationResultSchema } },
      description: "Validation result",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "No configuration to validate",
    },
  },
  tags: ["Config"],
});

app.openapi(validateRoute, async (c) => {
  const environment = getEnvironment(c);

  try {
    const service = await getRuntimeConfigService();
    const draft = await service.getDraft(environment);
    const result = await service.validateForPromotion(draft);
    return c.json(result, 200);
  } catch (err) {
    if (err instanceof RuntimeConfigError && err.code === "NOT_SEEDED") {
      return c.json({ error: err.message, code: err.code }, 404);
    }
    throw err;
  }
});

// ============================================
// POST /promote - Promote draft to active
// ============================================

const promoteRoute = createRoute({
  method: "post",
  path: "/promote",
  request: {
    query: EnvironmentQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: FullConfigSchema } },
      description: "Promoted configuration",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Validation failed",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "No draft configuration to promote",
    },
  },
  tags: ["Config"],
});

app.openapi(promoteRoute, async (c) => {
  const environment = getEnvironment(c);

  try {
    const service = await getRuntimeConfigService();
    const config = await service.promote(environment);
    return c.json(config, 200);
  } catch (err) {
    if (err instanceof RuntimeConfigError) {
      if (err.code === "NOT_SEEDED") {
        return c.json({ error: err.message, code: err.code }, 404);
      }
      if (err.code === "VALIDATION_FAILED") {
        return c.json({ error: err.message, code: err.code, details: err.details }, 400);
      }
    }
    throw err;
  }
});

// ============================================
// POST /promote-to - Promote config from one environment to another
// ============================================

const promoteToRoute = createRoute({
  method: "post",
  path: "/promote-to",
  request: {
    query: EnvironmentQuerySchema,
    body: {
      content: { "application/json": { schema: PromoteToInputSchema } },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: FullConfigSchema } },
      description: "Promoted configuration in target environment",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Validation failed or invalid promotion path",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "No active configuration in source environment",
    },
  },
  tags: ["Config"],
});

app.openapi(promoteToRoute, async (c) => {
  const sourceEnvironment = getEnvironment(c);
  const { targetEnvironment } = c.req.valid("json");

  const validPromotions: Record<TradingEnvironment, TradingEnvironment[]> = {
    BACKTEST: ["PAPER"],
    PAPER: ["LIVE"],
    LIVE: [],
  };

  if (!validPromotions[sourceEnvironment].includes(targetEnvironment)) {
    return c.json(
      {
        error: `Cannot promote from ${sourceEnvironment} to ${targetEnvironment}. Valid paths: BACKTEST → PAPER → LIVE`,
        code: "INVALID_PROMOTION_PATH",
      },
      400
    );
  }

  try {
    const service = await getRuntimeConfigService();
    const config = await service.promoteToEnvironment(sourceEnvironment, targetEnvironment);
    return c.json(config, 200);
  } catch (err) {
    if (err instanceof RuntimeConfigError) {
      if (err.code === "NOT_SEEDED") {
        return c.json({ error: err.message, code: err.code }, 404);
      }
      if (err.code === "VALIDATION_FAILED") {
        return c.json({ error: err.message, code: err.code, details: err.details }, 400);
      }
    }
    throw err;
  }
});

export const tradingRoutes = app;
export default tradingRoutes;
