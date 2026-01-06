/**
 * Configuration API Routes
 *
 * Routes for system configuration management.
 *
 * @see docs/plans/ui/05-api-endpoints.md Configuration section
 * @see docs/plans/11-configuration.md
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

// ============================================
// App Setup
// ============================================

const app = new OpenAPIHono();

// ============================================
// Schema Definitions
// ============================================

const EnvironmentSchema = z.enum(["BACKTEST", "PAPER", "LIVE"]);

const UniverseSourceSchema = z.object({
  type: z.enum(["static", "index", "etf_holdings", "screener"]),
  symbols: z.array(z.string()).optional(),
  index: z.string().optional(),
  etf: z.string().optional(),
  screenerParams: z.record(z.unknown()).optional(),
});

const UniverseConfigSchema = z.object({
  sources: z.array(UniverseSourceSchema),
  filters: z.object({
    optionableOnly: z.boolean(),
    minAvgVolume: z.number(),
    minMarketCap: z.number(),
    excludeSectors: z.array(z.string()),
  }),
  include: z.array(z.string()),
  exclude: z.array(z.string()),
});

const ConstraintsConfigSchema = z.object({
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

const ConfigurationSchema = z.object({
  version: z.string(),
  environment: EnvironmentSchema,
  universe: UniverseConfigSchema,
  indicators: z.record(z.unknown()),
  regime: z.record(z.unknown()),
  constraints: ConstraintsConfigSchema,
  options: z.record(z.unknown()),
  memory: z.record(z.unknown()),
  schedule: z.record(z.unknown()),
});

const ConfigVersionSchema = z.object({
  id: z.string(),
  version: z.string(),
  createdAt: z.string(),
  createdBy: z.string(),
  changes: z.array(z.string()),
});

// ============================================
// Default Configuration
// ============================================

const DEFAULT_CONFIG: z.infer<typeof ConfigurationSchema> = {
  version: "1.0.0",
  environment: "PAPER",
  universe: {
    sources: [{ type: "index", index: "SPY" }],
    filters: {
      optionableOnly: true,
      minAvgVolume: 1000000,
      minMarketCap: 1000000000,
      excludeSectors: [],
    },
    include: [],
    exclude: [],
  },
  indicators: {
    rsi: { period: 14 },
    sma: { periods: [20, 50, 200] },
    atr: { period: 14 },
  },
  regime: {
    vixThresholds: { low: 15, high: 25 },
    trendStrength: 0.6,
  },
  constraints: {
    perInstrument: {
      maxShares: 1000,
      maxContracts: 10,
      maxNotional: 50000,
      maxPctEquity: 0.05,
    },
    portfolio: {
      maxGrossExposure: 2.0,
      maxNetExposure: 1.0,
      maxConcentration: 0.2,
      maxCorrelation: 0.8,
      maxDrawdown: 0.15,
    },
    options: {
      maxDelta: 100,
      maxGamma: 50,
      maxVega: 1000,
      maxTheta: -500,
    },
  },
  options: {
    minDTE: 7,
    maxDTE: 45,
    maxSpread: 0.1,
  },
  memory: {
    decisionRetentionDays: 90,
    priceHistoryDays: 365,
  },
  schedule: {
    cycleInterval: "1h",
    marketHoursOnly: true,
    timezone: "America/New_York",
  },
};

// ============================================
// In-Memory Store (replace with DB)
// ============================================

let currentConfig = { ...DEFAULT_CONFIG };
const configHistory: z.infer<typeof ConfigVersionSchema>[] = [
  {
    id: "config-001",
    version: "1.0.0",
    createdAt: new Date().toISOString(),
    createdBy: "system",
    changes: ["Initial configuration"],
  },
];

// ============================================
// Routes
// ============================================

// GET / - Get current configuration
const getConfigRoute = createRoute({
  method: "get",
  path: "/",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: ConfigurationSchema,
        },
      },
      description: "Current configuration",
    },
  },
  tags: ["Config"],
});

app.openapi(getConfigRoute, (c) => {
  return c.json(currentConfig);
});

// PUT / - Update configuration
const updateConfigRoute = createRoute({
  method: "put",
  path: "/",
  request: {
    body: {
      content: {
        "application/json": {
          schema: ConfigurationSchema.partial(),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: ConfigurationSchema,
        },
      },
      description: "Updated configuration",
    },
  },
  tags: ["Config"],
});

app.openapi(updateConfigRoute, (c) => {
  const updates = c.req.valid("json");

  // Merge updates
  currentConfig = {
    ...currentConfig,
    ...updates,
    version: `${parseInt(currentConfig.version.split(".")[0], 10) + 1}.0.0`,
  };

  // Add to history
  configHistory.unshift({
    id: `config-${String(configHistory.length + 1).padStart(3, "0")}`,
    version: currentConfig.version,
    createdAt: new Date().toISOString(),
    createdBy: "user",
    changes: Object.keys(updates),
  });

  return c.json(currentConfig);
});

// GET /history - Get configuration history
const getHistoryRoute = createRoute({
  method: "get",
  path: "/history",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.array(ConfigVersionSchema),
        },
      },
      description: "Configuration history",
    },
  },
  tags: ["Config"],
});

app.openapi(getHistoryRoute, (c) => {
  return c.json(configHistory);
});

// POST /reset - Reset to defaults
const resetConfigRoute = createRoute({
  method: "post",
  path: "/reset",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: ConfigurationSchema,
        },
      },
      description: "Reset configuration",
    },
  },
  tags: ["Config"],
});

app.openapi(resetConfigRoute, (c) => {
  currentConfig = { ...DEFAULT_CONFIG };

  configHistory.unshift({
    id: `config-${String(configHistory.length + 1).padStart(3, "0")}`,
    version: "1.0.0",
    createdAt: new Date().toISOString(),
    createdBy: "system",
    changes: ["Reset to defaults"],
  });

  return c.json(currentConfig);
});

// GET /universe - Get universe configuration
const getUniverseRoute = createRoute({
  method: "get",
  path: "/universe",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: UniverseConfigSchema,
        },
      },
      description: "Universe configuration",
    },
  },
  tags: ["Config"],
});

app.openapi(getUniverseRoute, (c) => {
  return c.json(currentConfig.universe);
});

// PUT /universe - Update universe configuration
const updateUniverseRoute = createRoute({
  method: "put",
  path: "/universe",
  request: {
    body: {
      content: {
        "application/json": {
          schema: UniverseConfigSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: UniverseConfigSchema,
        },
      },
      description: "Updated universe configuration",
    },
  },
  tags: ["Config"],
});

app.openapi(updateUniverseRoute, (c) => {
  const universe = c.req.valid("json");
  currentConfig.universe = universe;
  return c.json(currentConfig.universe);
});

// GET /constraints - Get constraints configuration
const getConstraintsRoute = createRoute({
  method: "get",
  path: "/constraints",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: ConstraintsConfigSchema,
        },
      },
      description: "Constraints configuration",
    },
  },
  tags: ["Config"],
});

app.openapi(getConstraintsRoute, (c) => {
  return c.json(currentConfig.constraints);
});

// PUT /constraints - Update constraints configuration
const updateConstraintsRoute = createRoute({
  method: "put",
  path: "/constraints",
  request: {
    body: {
      content: {
        "application/json": {
          schema: ConstraintsConfigSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: ConstraintsConfigSchema,
        },
      },
      description: "Updated constraints configuration",
    },
  },
  tags: ["Config"],
});

app.openapi(updateConstraintsRoute, (c) => {
  const constraints = c.req.valid("json");
  currentConfig.constraints = constraints;
  return c.json(currentConfig.constraints);
});

// ============================================
// Export
// ============================================

export const configRoutes = app;
export default configRoutes;
