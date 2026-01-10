/**
 * Configuration API Routes
 *
 * Database-backed configuration management with draft/promote/rollback workflows.
 *
 * @see docs/plans/22-self-service-dashboard.md (Phase 2)
 */

import {
  type RuntimeAgentConfig,
  type RuntimeAgentType,
  RuntimeConfigError,
  type RuntimeOptionsLimits,
  type RuntimePerInstrumentLimits,
  type RuntimePortfolioLimits,
  type RuntimeTradingConfig,
  type RuntimeUniverseConfig,
  type TradingEnvironment,
} from "@cream/config";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getRuntimeConfigService } from "../db.js";

// ============================================
// App Setup
// ============================================

const app = new OpenAPIHono();

// ============================================
// Schema Definitions
// ============================================

const EnvironmentSchema = z.enum(["BACKTEST", "PAPER", "LIVE"]);

const GlobalModelSchema = z.enum(["gemini-3-flash-preview", "gemini-3-pro-preview"]);

const TradingConfigSchema = z.object({
  id: z.string(),
  environment: EnvironmentSchema,
  version: z.number(),
  globalModel: GlobalModelSchema,
  maxConsensusIterations: z.number(),
  agentTimeoutMs: z.number(),
  totalConsensusTimeoutMs: z.number(),
  convictionDeltaHold: z.number(),
  convictionDeltaAction: z.number(),
  highConvictionPct: z.number(),
  mediumConvictionPct: z.number(),
  lowConvictionPct: z.number(),
  minRiskRewardRatio: z.number(),
  kellyFraction: z.number(),
  tradingCycleIntervalMs: z.number(),
  predictionMarketsIntervalMs: z.number(),
  status: z.enum(["draft", "testing", "active", "archived"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  promotedFrom: z.string().nullable(),
});

const UniverseSourceSchema = z.enum(["static", "index", "screener"]);

const UniverseConfigSchema = z.object({
  id: z.string(),
  environment: EnvironmentSchema,
  source: UniverseSourceSchema,
  staticSymbols: z.array(z.string()).nullable(),
  indexSource: z.string().nullable(),
  minVolume: z.number().nullable(),
  minMarketCap: z.number().nullable(),
  optionableOnly: z.boolean(),
  includeList: z.array(z.string()),
  excludeList: z.array(z.string()),
  status: z.enum(["draft", "testing", "active", "archived"]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const AgentTypeSchema = z.enum([
  "technical_analyst",
  "news_analyst",
  "fundamentals_analyst",
  "bullish_researcher",
  "bearish_researcher",
  "trader",
  "risk_manager",
  "critic",
]);

const AgentConfigSchema = z.object({
  id: z.string(),
  environment: EnvironmentSchema,
  agentType: AgentTypeSchema,
  model: z.string(),
  systemPromptOverride: z.string().nullable(),
  enabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const ConstraintsConfigResponseSchema = z.object({
  id: z.string(),
  environment: EnvironmentSchema,
  perInstrument: z.object({
    maxShares: z.number(),
    maxContracts: z.number(),
    maxNotional: z.number(),
    maxPctEquity: z.number(),
  }),
  portfolio: z.object({
    maxGrossExposure: z.number(),
    maxNetExposure: z.number(),
    maxConcentration: z.number(),
    maxCorrelation: z.number(),
    maxDrawdown: z.number(),
  }),
  options: z.object({
    maxDelta: z.number(),
    maxGamma: z.number(),
    maxVega: z.number(),
    maxTheta: z.number(),
  }),
  status: z.enum(["draft", "testing", "active", "archived"]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const FullConfigSchema = z.object({
  trading: TradingConfigSchema,
  agents: z.record(AgentTypeSchema, AgentConfigSchema),
  universe: UniverseConfigSchema,
  constraints: ConstraintsConfigResponseSchema,
});

const ValidationErrorSchema = z.object({
  field: z.string(),
  message: z.string(),
  value: z.unknown().optional(),
});

const ValidationResultSchema = z.object({
  valid: z.boolean(),
  errors: z.array(ValidationErrorSchema),
  warnings: z.array(z.string()),
});

const ConfigHistoryEntrySchema = z.object({
  /** Unique version identifier (trading config id) */
  id: z.string(),
  /** Version number (sequential) */
  version: z.number(),
  /** Full configuration snapshot */
  config: FullConfigSchema,
  /** When this version was created */
  createdAt: z.string(),
  /** Who created this version (from auth, if available) */
  createdBy: z.string().optional(),
  /** Whether this is the active version */
  isActive: z.boolean(),
  /** Changed fields from previous version */
  changedFields: z.array(z.string()),
  /** Human-readable description of the change */
  description: z.string().optional(),
});

const ErrorResponseSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  details: z.unknown().optional(),
});

// ============================================
// Helper to get environment from query/header
// ============================================

function getEnvironment(c: {
  req: { query: (key: string) => string | undefined };
}): TradingEnvironment {
  const env = c.req.query("env") ?? "PAPER";
  if (env !== "BACKTEST" && env !== "PAPER" && env !== "LIVE") {
    return "PAPER";
  }
  return env;
}

// ============================================
// Routes
// ============================================

// GET /active - Get active configuration
const getActiveRoute = createRoute({
  method: "get",
  path: "/active",
  request: {
    query: z.object({
      env: EnvironmentSchema.optional().openapi({
        description: "Trading environment (default: PAPER)",
      }),
    }),
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

// GET /draft - Get draft configuration
const getDraftRoute = createRoute({
  method: "get",
  path: "/draft",
  request: {
    query: z.object({
      env: EnvironmentSchema.optional().openapi({
        description: "Trading environment (default: PAPER)",
      }),
    }),
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

// PUT /draft - Save draft configuration
const SaveDraftInputSchema = z.object({
  trading: TradingConfigSchema.partial().optional(),
  universe: UniverseConfigSchema.partial().optional(),
  agents: z.record(AgentTypeSchema, AgentConfigSchema.partial()).optional(),
});

const saveDraftRoute = createRoute({
  method: "put",
  path: "/draft",
  request: {
    query: z.object({
      env: EnvironmentSchema.optional().openapi({
        description: "Trading environment (default: PAPER)",
      }),
    }),
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

// POST /validate - Validate configuration for promotion
const validateRoute = createRoute({
  method: "post",
  path: "/validate",
  request: {
    query: z.object({
      env: EnvironmentSchema.optional().openapi({
        description: "Trading environment (default: PAPER)",
      }),
    }),
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

// POST /promote - Promote draft to active
const promoteRoute = createRoute({
  method: "post",
  path: "/promote",
  request: {
    query: z.object({
      env: EnvironmentSchema.optional().openapi({
        description: "Trading environment (default: PAPER)",
      }),
    }),
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

// POST /promote-to - Promote config from one environment to another
const PromoteToInputSchema = z.object({
  targetEnvironment: EnvironmentSchema,
});

const promoteToRoute = createRoute({
  method: "post",
  path: "/promote-to",
  request: {
    query: z.object({
      env: EnvironmentSchema.optional().openapi({
        description: "Source trading environment (default: PAPER)",
      }),
    }),
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

  // Validate promotion path: BACKTEST → PAPER → LIVE
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

// GET /history - Get configuration history
const getHistoryRoute = createRoute({
  method: "get",
  path: "/history",
  request: {
    query: z.object({
      env: EnvironmentSchema.optional().openapi({
        description: "Trading environment (default: PAPER)",
      }),
      limit: z.coerce.number().optional().default(20).openapi({
        description: "Maximum number of entries to return",
      }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: z.array(ConfigHistoryEntrySchema) },
      },
      description: "Configuration history",
    },
  },
  tags: ["Config"],
});

app.openapi(getHistoryRoute, async (c) => {
  const environment = getEnvironment(c);
  const limit = c.req.query("limit") ? parseInt(c.req.query("limit") as string, 10) : 20;

  const service = await getRuntimeConfigService();
  const history = await service.getHistory(environment, limit);
  return c.json(history, 200);
});

// POST /rollback - Rollback to a previous configuration
const RollbackInputSchema = z.object({
  versionId: z.string().openapi({
    description: "ID of the configuration version to rollback to",
  }),
});

const rollbackRoute = createRoute({
  method: "post",
  path: "/rollback",
  request: {
    query: z.object({
      env: EnvironmentSchema.optional().openapi({
        description: "Trading environment (default: PAPER)",
      }),
    }),
    body: {
      content: { "application/json": { schema: RollbackInputSchema } },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: FullConfigSchema } },
      description: "Rolled back configuration",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Rollback failed",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Configuration version not found",
    },
  },
  tags: ["Config"],
});

app.openapi(rollbackRoute, async (c) => {
  const environment = getEnvironment(c);
  const { versionId } = c.req.valid("json");

  try {
    const service = await getRuntimeConfigService();
    const config = await service.rollback(environment, versionId);
    return c.json(config, 200);
  } catch (err) {
    if (err instanceof RuntimeConfigError) {
      if (err.code === "ROLLBACK_FAILED") {
        if (err.message.includes("not found")) {
          return c.json({ error: err.message, code: err.code }, 404);
        }
        return c.json({ error: err.message, code: err.code }, 400);
      }
    }
    throw err;
  }
});

// GET /compare/:id1/:id2 - Compare two configuration versions
const compareRoute = createRoute({
  method: "get",
  path: "/compare/{id1}/{id2}",
  request: {
    params: z.object({
      id1: z.string().openapi({ description: "First configuration version ID" }),
      id2: z.string().openapi({ description: "Second configuration version ID" }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            config1: TradingConfigSchema,
            config2: TradingConfigSchema,
            differences: z.array(
              z.object({
                field: z.string(),
                value1: z.unknown(),
                value2: z.unknown(),
              })
            ),
          }),
        },
      },
      description: "Configuration comparison",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "One or both configuration versions not found",
    },
  },
  tags: ["Config"],
});

app.openapi(compareRoute, async (c) => {
  const { id1, id2 } = c.req.valid("param");

  const tradingRepo = await (await import("../db.js")).getTradingConfigRepo();

  const config1 = await tradingRepo.findById(id1);
  const config2 = await tradingRepo.findById(id2);

  if (!config1) {
    return c.json({ error: `Configuration ${id1} not found` }, 404);
  }
  if (!config2) {
    return c.json({ error: `Configuration ${id2} not found` }, 404);
  }

  // Find differences
  const differences: { field: string; value1: unknown; value2: unknown }[] = [];
  const fieldsToCompare = [
    "globalModel",
    "maxConsensusIterations",
    "agentTimeoutMs",
    "totalConsensusTimeoutMs",
    "convictionDeltaHold",
    "convictionDeltaAction",
    "highConvictionPct",
    "mediumConvictionPct",
    "lowConvictionPct",
    "minRiskRewardRatio",
    "kellyFraction",
    "tradingCycleIntervalMs",
    "predictionMarketsIntervalMs",
  ] as const;

  for (const field of fieldsToCompare) {
    if (config1[field] !== config2[field]) {
      differences.push({
        field,
        value1: config1[field],
        value2: config2[field],
      });
    }
  }

  return c.json({ config1, config2, differences }, 200);
});

// ============================================
// Universe Routes
// ============================================

// GET /universe - Get universe configuration
const getUniverseRoute = createRoute({
  method: "get",
  path: "/universe",
  request: {
    query: z.object({
      env: EnvironmentSchema.optional().openapi({
        description: "Trading environment (default: PAPER)",
      }),
    }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: UniverseConfigSchema } },
      description: "Universe configuration",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "No active configuration found",
    },
  },
  tags: ["Config"],
});

app.openapi(getUniverseRoute, async (c) => {
  const environment = getEnvironment(c);
  try {
    const service = await getRuntimeConfigService();
    const config = await service.getActiveConfig(environment);
    return c.json(config.universe, 200);
  } catch (err) {
    if (err instanceof RuntimeConfigError && err.code === "NOT_SEEDED") {
      return c.json({ error: err.message, code: err.code }, 404);
    }
    throw err;
  }
});

// PUT /universe - Update universe configuration (saves as draft)
const UniverseConfigInputSchema = z.object({
  source: UniverseSourceSchema.optional(),
  staticSymbols: z.array(z.string()).nullable().optional(),
  indexSource: z.string().nullable().optional(),
  minVolume: z.number().nullable().optional(),
  minMarketCap: z.number().nullable().optional(),
  optionableOnly: z.boolean().optional(),
  includeList: z.array(z.string()).optional(),
  excludeList: z.array(z.string()).optional(),
});

const updateUniverseRoute = createRoute({
  method: "put",
  path: "/universe",
  request: {
    query: z.object({
      env: EnvironmentSchema.optional().openapi({
        description: "Trading environment (default: PAPER)",
      }),
    }),
    body: {
      content: { "application/json": { schema: UniverseConfigInputSchema } },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: UniverseConfigSchema } },
      description: "Updated universe configuration",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "No active configuration to base draft on",
    },
  },
  tags: ["Config"],
});

app.openapi(updateUniverseRoute, async (c) => {
  const environment = getEnvironment(c);
  const universe = c.req.valid("json");

  try {
    const service = await getRuntimeConfigService();
    const updated = await service.saveDraft(environment, {
      universe: universe as Partial<RuntimeUniverseConfig>,
    });
    return c.json(updated.universe, 200);
  } catch (err) {
    if (err instanceof RuntimeConfigError && err.code === "NOT_SEEDED") {
      return c.json({ error: err.message, code: err.code }, 404);
    }
    throw err;
  }
});

// ============================================
// Constraints Routes
// ============================================

const ConstraintsConfigInputSchema = z.object({
  perInstrument: z.object({
    maxShares: z.number(),
    maxContracts: z.number(),
    maxNotional: z.number(),
    maxPctEquity: z.number(),
  }),
  portfolio: z.object({
    maxGrossExposure: z.number(),
    maxNetExposure: z.number(),
    maxConcentration: z.number(),
    maxCorrelation: z.number(),
    maxDrawdown: z.number(),
  }),
  options: z.object({
    maxDelta: z.number(),
    maxGamma: z.number(),
    maxVega: z.number(),
    maxTheta: z.number(),
  }),
});

// GET /constraints - Get constraints configuration
const getConstraintsRoute = createRoute({
  method: "get",
  path: "/constraints",
  request: {
    query: z.object({
      env: EnvironmentSchema.optional().openapi({
        description: "Trading environment (default: PAPER)",
      }),
    }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: ConstraintsConfigResponseSchema } },
      description: "Constraints configuration",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "No active configuration found",
    },
  },
  tags: ["Config"],
});

app.openapi(getConstraintsRoute, async (c) => {
  const environment = getEnvironment(c);
  try {
    const service = await getRuntimeConfigService();
    const config = await service.getActiveConfig(environment);
    return c.json(config.constraints, 200);
  } catch (err) {
    if (err instanceof RuntimeConfigError && err.code === "NOT_SEEDED") {
      return c.json({ error: err.message, code: err.code }, 404);
    }
    throw err;
  }
});

// PUT /constraints - Update constraints configuration (saves as draft)
const updateConstraintsRoute = createRoute({
  method: "put",
  path: "/constraints",
  request: {
    query: z.object({
      env: EnvironmentSchema.optional().openapi({
        description: "Trading environment (default: PAPER)",
      }),
    }),
    body: {
      content: { "application/json": { schema: ConstraintsConfigInputSchema } },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: ConstraintsConfigResponseSchema } },
      description: "Updated constraints configuration",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "No active configuration to base draft on",
    },
  },
  tags: ["Config"],
});

app.openapi(updateConstraintsRoute, async (c) => {
  const environment = getEnvironment(c);
  const constraints = c.req.valid("json");

  try {
    const service = await getRuntimeConfigService();
    const updated = await service.saveDraft(environment, {
      constraints: {
        perInstrument: constraints.perInstrument as Partial<RuntimePerInstrumentLimits>,
        portfolio: constraints.portfolio as Partial<RuntimePortfolioLimits>,
        options: constraints.options as Partial<RuntimeOptionsLimits>,
      },
    });
    return c.json(updated.constraints, 200);
  } catch (err) {
    if (err instanceof RuntimeConfigError && err.code === "NOT_SEEDED") {
      return c.json({ error: err.message, code: err.code }, 404);
    }
    throw err;
  }
});

// ============================================
// Legacy Routes (Backwards Compatibility)
// ============================================

// GET / - Redirect to /active
const getLegacyRoute = createRoute({
  method: "get",
  path: "/",
  request: {
    query: z.object({
      env: EnvironmentSchema.optional(),
    }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: FullConfigSchema } },
      description: "Current configuration (alias for /active)",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "No active configuration found",
    },
  },
  tags: ["Config"],
});

app.openapi(getLegacyRoute, async (c) => {
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
// Export
// ============================================

export const configRoutes = app;
export default configRoutes;
