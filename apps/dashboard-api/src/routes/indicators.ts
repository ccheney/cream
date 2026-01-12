/**
 * Indicator Lab API Routes
 *
 * API endpoints for the Indicator Lab dashboard, providing access to
 * indicator status, validation reports, IC history, and trigger conditions.
 *
 * @see docs/plans/19-dynamic-indicator-synthesis.md (lines 1385-1396)
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getDbClient } from "../db.js";

// ============================================
// App Setup
// ============================================

const app = new OpenAPIHono();

// ============================================
// Schema Definitions
// ============================================

const IndicatorStatusEnum = z.enum(["staging", "paper", "production", "retired"]);
const IndicatorCategoryEnum = z.enum([
  "momentum",
  "trend",
  "volatility",
  "volume",
  "custom",
  "correlation",
  "regime",
  "microstructure",
]);

const IndicatorSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  status: IndicatorStatusEnum,
  hypothesis: z.string(),
  generatedAt: z.string(),
  promotedAt: z.string().nullable(),
  retiredAt: z.string().nullable(),
});

const IndicatorDetailSchema = IndicatorSummarySchema.extend({
  economicRationale: z.string(),
  validationReport: z.any().nullable(),
  paperTradingReport: z.any().nullable(),
  paperTradingStart: z.string().nullable(),
  paperTradingEnd: z.string().nullable(),
  prUrl: z.string().nullable(),
  codeHash: z.string().nullable(),
  generatedBy: z.string(),
});

const ICHistoryEntrySchema = z.object({
  date: z.string(),
  icValue: z.number(),
  icStd: z.number(),
  decisionsUsedIn: z.number(),
  decisionsCorrect: z.number(),
});

const TriggerConditionsSchema = z.object({
  rollingIC30Day: z.number(),
  icDecayDays: z.number(),
  daysSinceLastAttempt: z.number(),
  activeIndicatorCount: z.number(),
  maxIndicatorCapacity: z.number(),
  regimeGapDetected: z.boolean(),
  currentRegime: z.string().nullable(),
});

const TriggerStatusSchema = z.object({
  shouldTrigger: z.boolean(),
  conditions: TriggerConditionsSchema,
  lastCheck: z.string(),
  recommendation: z.string(),
});

const ActivitySchema = z.object({
  type: z.enum(["generation", "promotion", "retirement", "paper_start"]),
  indicatorId: z.string(),
  name: z.string(),
  timestamp: z.string(),
  details: z.string().nullable(),
});

const PaperTradingIndicatorSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  paperTradingStart: z.string(),
  daysTrading: z.number(),
  signalsRecorded: z.number(),
  currentIC: z.number().nullable(),
  progress: z.number(),
});

// ============================================
// Route Definitions
// ============================================

// GET /api/indicators - List all indicators
const listIndicatorsRoute = createRoute({
  method: "get",
  path: "/",
  request: {
    query: z.object({
      status: IndicatorStatusEnum.optional(),
      category: IndicatorCategoryEnum.optional(),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            indicators: z.array(IndicatorSummarySchema),
          }),
        },
      },
      description: "List of indicators",
    },
  },
  tags: ["Indicators"],
});

app.openapi(listIndicatorsRoute, async (c) => {
  const { status, category } = c.req.valid("query");
  const db = await getDbClient();

  // Build dynamic query based on filters
  const conditions: string[] = [];
  const args: (string | null)[] = [];

  if (status) {
    conditions.push("status = ?");
    args.push(status);
  }
  if (category) {
    conditions.push("category = ?");
    args.push(category);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = await db.execute(
    `
      SELECT id, name, category, status, hypothesis,
             generated_at, promoted_at, retired_at
      FROM indicators
      ${whereClause}
      ORDER BY
        CASE status
          WHEN 'production' THEN 1
          WHEN 'paper' THEN 2
          WHEN 'staging' THEN 3
          ELSE 4
        END,
        name
    `,
    args
  );

  const indicators = rows.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    category: row.category as string,
    status: row.status as "staging" | "paper" | "production" | "retired",
    hypothesis: row.hypothesis as string,
    generatedAt: row.generated_at as string,
    promotedAt: row.promoted_at as string | null,
    retiredAt: row.retired_at as string | null,
  }));

  return c.json({ indicators });
});

// ============================================
// Static Routes (must be registered before /:id to avoid matching issues)
// ============================================

// GET /api/indicators/trigger-status - Get current trigger conditions
const getTriggerStatusRoute = createRoute({
  method: "get",
  path: "/trigger-status",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: TriggerStatusSchema,
        },
      },
      description: "Current trigger status",
    },
  },
  tags: ["Indicators"],
});

app.openapi(getTriggerStatusRoute, async (c) => {
  const db = await getDbClient();

  // Get active indicator count
  const activeRows = await db.execute(
    "SELECT COUNT(*) as count FROM indicators WHERE status IN ('paper', 'production')"
  );
  const activeCount = (activeRows[0]?.count as number) ?? 0;

  // Get recent IC values for rolling average
  const icRows = await db.execute(
    `
      SELECT ic_value
      FROM indicator_ic_history
      WHERE date >= date('now', '-30 days')
      ORDER BY date DESC
    `
  );

  const icValues = icRows.map((r) => r.ic_value as number);
  const rollingIC = icValues.length > 0 ? icValues.reduce((a, b) => a + b, 0) / icValues.length : 0;

  // Calculate IC decay (consecutive days below threshold)
  let icDecayDays = 0;
  for (const ic of icValues) {
    if (ic < 0.02) {
      icDecayDays++;
    } else {
      break;
    }
  }

  // Get last generation attempt
  const lastAttemptRows = await db.execute(
    "SELECT MAX(generated_at) as last_attempt FROM indicators"
  );
  const lastAttempt = lastAttemptRows[0]?.last_attempt as string | null;
  const daysSinceLastAttempt = lastAttempt
    ? Math.floor((Date.now() - new Date(lastAttempt).getTime()) / (24 * 60 * 60 * 1000))
    : 999;

  // Get current market regime from regime labels
  let currentRegime: string | null = null;
  let regimeGapDetected = false;
  try {
    const regimeRows = await db.execute(
      `SELECT regime, confidence FROM regime_labels
       WHERE symbol = '_MARKET' AND timeframe = '1d'
       ORDER BY timestamp DESC LIMIT 1`
    );
    if (regimeRows.length > 0) {
      currentRegime = regimeRows[0]?.regime as string;
      // A regime gap is detected when confidence is low (uncertain regime)
      const confidence = regimeRows[0]?.confidence as number;
      regimeGapDetected = confidence < 0.5;
    } else {
      // No regime data available - this is a gap
      regimeGapDetected = true;
    }
  } catch {
    // Regime labels table may not exist or be empty
    regimeGapDetected = true;
  }

  const conditions = {
    rollingIC30Day: rollingIC,
    icDecayDays,
    daysSinceLastAttempt,
    activeIndicatorCount: activeCount,
    maxIndicatorCapacity: 20,
    regimeGapDetected,
    currentRegime,
  };

  // Determine if generation should trigger
  const shouldTrigger =
    daysSinceLastAttempt >= 30 &&
    activeCount < conditions.maxIndicatorCapacity &&
    (rollingIC < 0.02 || icDecayDays >= 5);

  // Generate recommendation
  let recommendation = "";
  if (shouldTrigger) {
    recommendation = `Indicator generation warranted: Rolling IC ${rollingIC.toFixed(4)}, ${icDecayDays} days of decay.`;
  } else if (daysSinceLastAttempt < 30) {
    recommendation = `Cooldown active: ${30 - daysSinceLastAttempt} days remaining.`;
  } else if (rollingIC >= 0.02) {
    recommendation = `Portfolio IC healthy at ${rollingIC.toFixed(4)}, no generation needed.`;
  } else if (activeCount >= conditions.maxIndicatorCapacity) {
    recommendation = `Indicator capacity reached (${activeCount}/${conditions.maxIndicatorCapacity}).`;
  } else {
    recommendation = "No trigger conditions met.";
  }

  return c.json({
    shouldTrigger,
    conditions,
    lastCheck: new Date().toISOString(),
    recommendation,
  });
});

// POST /api/indicators/trigger-check - Force a trigger check
const forceTriggerCheckRoute = createRoute({
  method: "post",
  path: "/trigger-check",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: TriggerStatusSchema,
        },
      },
      description: "Trigger check result",
    },
  },
  tags: ["Indicators"],
});

app.openapi(forceTriggerCheckRoute, async (c) => {
  const db = await getDbClient();

  // Get active indicator count
  const activeRows = await db.execute(
    "SELECT COUNT(*) as count FROM indicators WHERE status IN ('paper', 'production')"
  );
  const activeCount = (activeRows[0]?.count as number) ?? 0;

  // Get recent IC values for rolling average
  const icRows = await db.execute(
    `
      SELECT ic_value
      FROM indicator_ic_history
      WHERE date >= date('now', '-30 days')
      ORDER BY date DESC
    `
  );

  const icValues = icRows.map((r) => r.ic_value as number);
  const rollingIC = icValues.length > 0 ? icValues.reduce((a, b) => a + b, 0) / icValues.length : 0;

  // Calculate IC decay (consecutive days below threshold)
  let icDecayDays = 0;
  for (const ic of icValues) {
    if (ic < 0.02) {
      icDecayDays++;
    } else {
      break;
    }
  }

  // Get last generation attempt
  const lastAttemptRows = await db.execute(
    "SELECT MAX(generated_at) as last_attempt FROM indicators"
  );
  const lastAttempt = lastAttemptRows[0]?.last_attempt as string | null;
  const daysSinceLastAttempt = lastAttempt
    ? Math.floor((Date.now() - new Date(lastAttempt).getTime()) / (24 * 60 * 60 * 1000))
    : 999;

  // Get current market regime from regime labels
  let currentRegime: string | null = null;
  let regimeGapDetected = false;
  try {
    const regimeRows = await db.execute(
      `SELECT regime, confidence FROM regime_labels
       WHERE symbol = '_MARKET' AND timeframe = '1d'
       ORDER BY timestamp DESC LIMIT 1`
    );
    if (regimeRows.length > 0) {
      currentRegime = regimeRows[0]?.regime as string;
      const confidence = regimeRows[0]?.confidence as number;
      regimeGapDetected = confidence < 0.5;
    } else {
      regimeGapDetected = true;
    }
  } catch {
    regimeGapDetected = true;
  }

  const conditions = {
    rollingIC30Day: rollingIC,
    icDecayDays,
    daysSinceLastAttempt,
    activeIndicatorCount: activeCount,
    maxIndicatorCapacity: 20,
    regimeGapDetected,
    currentRegime,
  };

  // Determine if generation should trigger
  const shouldTrigger =
    daysSinceLastAttempt >= 30 &&
    activeCount < conditions.maxIndicatorCapacity &&
    (rollingIC < 0.02 || icDecayDays >= 5);

  // Generate recommendation
  let recommendation = "";
  if (shouldTrigger) {
    recommendation = `Indicator generation warranted: Rolling IC ${rollingIC.toFixed(4)}, ${icDecayDays} days of decay.`;
  } else if (daysSinceLastAttempt < 30) {
    recommendation = `Cooldown active: ${30 - daysSinceLastAttempt} days remaining.`;
  } else if (rollingIC >= 0.02) {
    recommendation = `Portfolio IC healthy at ${rollingIC.toFixed(4)}, no generation needed.`;
  } else if (activeCount >= conditions.maxIndicatorCapacity) {
    recommendation = `Indicator capacity reached (${activeCount}/${conditions.maxIndicatorCapacity}).`;
  } else {
    recommendation = "No trigger conditions met.";
  }

  return c.json({
    shouldTrigger,
    conditions,
    lastCheck: new Date().toISOString(),
    recommendation,
  });
});

// GET /api/indicators/paper-trading - Get paper trading indicators
const getPaperTradingRoute = createRoute({
  method: "get",
  path: "/paper-trading",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            indicators: z.array(PaperTradingIndicatorSchema),
          }),
        },
      },
      description: "Paper trading indicators with progress",
    },
  },
  tags: ["Indicators"],
});

app.openapi(getPaperTradingRoute, async (c) => {
  const db = await getDbClient();

  const rows = await db.execute(
    `
      SELECT id, name, category, paper_trading_start,
             julianday('now') - julianday(paper_trading_start) as days_trading
      FROM indicators
      WHERE status = 'paper'
    `
  );

  const indicators = await Promise.all(
    rows.map(async (row) => {
      const indicatorId = row.id as string;

      // Get signal count
      const signalsRows = await db.execute(
        "SELECT COUNT(*) as count FROM indicator_paper_signals WHERE indicator_id = ?",
        [indicatorId]
      );
      const signalsRecorded = (signalsRows[0]?.count as number) ?? 0;

      // Calculate IC from paper signals
      const icRows = await db.execute(
        `
          SELECT signal, outcome
          FROM indicator_paper_signals
          WHERE indicator_id = ? AND outcome IS NOT NULL
        `,
        [indicatorId]
      );

      let currentIC: number | null = null;
      if (icRows.length > 0) {
        const signals = icRows.map((r) => r.signal as number);
        const outcomes = icRows.map((r) => r.outcome as number);
        // Simple IC calculation (Spearman correlation approximation)
        currentIC = calculateSimpleIC(signals, outcomes);
      }

      const daysTrading = (row.days_trading as number) ?? 0;

      return {
        id: indicatorId,
        name: row.name as string,
        category: row.category as string,
        paperTradingStart: row.paper_trading_start as string,
        daysTrading: Math.floor(daysTrading),
        signalsRecorded,
        currentIC,
        progress: Math.min((daysTrading / 30) * 100, 100),
      };
    })
  );

  return c.json({ indicators });
});

// GET /api/indicators/activity - Get recent activity log
const getActivityRoute = createRoute({
  method: "get",
  path: "/activity",
  request: {
    query: z.object({
      limit: z.coerce.number().min(1).max(100).default(20),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            activities: z.array(ActivitySchema),
          }),
        },
      },
      description: "Recent activity log",
    },
  },
  tags: ["Indicators"],
});

app.openapi(getActivityRoute, async (c) => {
  const { limit } = c.req.valid("query");
  const db = await getDbClient();

  // Combine events from multiple sources
  const rows = await db.execute(
    `
      SELECT
        'generation' as type,
        id as indicator_id,
        name,
        generated_at as timestamp,
        hypothesis as details
      FROM indicators
      WHERE generated_at IS NOT NULL

      UNION ALL

      SELECT
        'promotion' as type,
        id,
        name,
        promoted_at as timestamp,
        pr_url as details
      FROM indicators
      WHERE promoted_at IS NOT NULL

      UNION ALL

      SELECT
        'retirement' as type,
        id,
        name,
        retired_at as timestamp,
        retirement_reason as details
      FROM indicators
      WHERE retired_at IS NOT NULL

      UNION ALL

      SELECT
        'paper_start' as type,
        id,
        name,
        paper_trading_start as timestamp,
        'Started paper trading' as details
      FROM indicators
      WHERE paper_trading_start IS NOT NULL

      ORDER BY timestamp DESC
      LIMIT ?
    `,
    [limit]
  );

  const activities = rows.map((row) => ({
    type: row.type as "generation" | "promotion" | "retirement" | "paper_start",
    indicatorId: row.indicator_id as string,
    name: row.name as string,
    timestamp: row.timestamp as string,
    details: row.details as string | null,
  }));

  return c.json({ activities });
});

// GET /api/indicators/synthesis/status - Get synthesis pipeline status
const SynthesisPhaseSchema = z.enum([
  "gathering_context",
  "generating_hypothesis",
  "implementing",
  "validating",
  "initiating_paper_trading",
]);

const SynthesisTriggerConditionsSchema = z.object({
  regimeGapDetected: z.boolean(),
  currentRegime: z.string(),
  regimeGapDetails: z.string().optional(),
  closestIndicatorSimilarity: z.number(),
  rollingIC30Day: z.number(),
  icDecayDays: z.number(),
  existingIndicatorsUnderperforming: z.boolean(),
  daysSinceLastAttempt: z.number(),
  activeIndicatorCount: z.number(),
  maxIndicatorCapacity: z.number(),
  cooldownMet: z.boolean(),
  capacityAvailable: z.boolean(),
});

const SynthesisTriggerStatusSchema = z.object({
  shouldTrigger: z.boolean(),
  triggerReason: z.string().optional(),
  conditions: SynthesisTriggerConditionsSchema,
  summary: z.string(),
  recommendation: z.string(),
});

const ActiveSynthesisSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(["running", "completed", "failed"]),
  currentPhase: SynthesisPhaseSchema,
  startedAt: z.string(),
  triggeredByCycleId: z.string(),
  triggerReason: z.string(),
});

const SynthesisActivitySchema = z.object({
  indicatorName: z.string(),
  status: z.enum(["paper_trading_started", "validation_failed", "implementation_failed", "error"]),
  generatedAt: z.string(),
  success: z.boolean(),
});

const SynthesisStatusResponseSchema = z.object({
  triggerStatus: SynthesisTriggerStatusSchema.nullable(),
  activeSynthesis: ActiveSynthesisSchema.nullable(),
  recentActivity: z.array(SynthesisActivitySchema),
  lastEvaluatedAt: z.string().nullable(),
});

const getSynthesisStatusRoute = createRoute({
  method: "get",
  path: "/synthesis/status",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: SynthesisStatusResponseSchema,
        },
      },
      description: "Synthesis pipeline status",
    },
  },
  tags: ["Indicators"],
});

app.openapi(getSynthesisStatusRoute, async (c) => {
  const db = await getDbClient();

  // Get active indicator count
  const activeRows = await db.execute(
    "SELECT COUNT(*) as count FROM indicators WHERE status IN ('paper', 'production')"
  );
  const activeCount = (activeRows[0]?.count as number) ?? 0;

  // Get recent IC values for rolling average
  const icRows = await db.execute(
    `
      SELECT ic_value
      FROM indicator_ic_history
      WHERE date >= date('now', '-30 days')
      ORDER BY date DESC
    `
  );

  const icValues = icRows.map((r) => r.ic_value as number);
  const rollingIC = icValues.length > 0 ? icValues.reduce((a, b) => a + b, 0) / icValues.length : 0;

  // Calculate IC decay (consecutive days below threshold)
  let icDecayDays = 0;
  for (const ic of icValues) {
    if (ic < 0.02) {
      icDecayDays++;
    } else {
      break;
    }
  }

  // Get last generation attempt
  const lastAttemptRows = await db.execute(
    "SELECT MAX(generated_at) as last_attempt FROM indicators"
  );
  const lastAttempt = lastAttemptRows[0]?.last_attempt as string | null;
  const daysSinceLastAttempt = lastAttempt
    ? Math.floor((Date.now() - new Date(lastAttempt).getTime()) / (24 * 60 * 60 * 1000))
    : 999;

  // Get current market regime from regime labels
  let currentRegime = "Unknown";
  let regimeGapDetected = false;
  let regimeGapDetails: string | undefined;
  try {
    const regimeRows = await db.execute(
      `SELECT regime, confidence FROM regime_labels
       WHERE symbol = '_MARKET' AND timeframe = '1d'
       ORDER BY timestamp DESC LIMIT 1`
    );
    if (regimeRows.length > 0) {
      currentRegime = regimeRows[0]?.regime as string;
      const confidence = regimeRows[0]?.confidence as number;
      regimeGapDetected = confidence < 0.5;
      if (regimeGapDetected) {
        regimeGapDetails = `Low confidence (${(confidence * 100).toFixed(1)}%) in regime classification`;
      }
    } else {
      regimeGapDetected = true;
      regimeGapDetails = "No regime data available";
    }
  } catch {
    regimeGapDetected = true;
    regimeGapDetails = "Regime classification unavailable";
  }

  const cooldownMet = daysSinceLastAttempt >= 30;
  const capacityAvailable = activeCount < 20;
  const existingIndicatorsUnderperforming = rollingIC < 0.02 || icDecayDays >= 5;

  const conditions = {
    regimeGapDetected,
    currentRegime,
    regimeGapDetails,
    closestIndicatorSimilarity: 0,
    rollingIC30Day: rollingIC,
    icDecayDays,
    existingIndicatorsUnderperforming,
    daysSinceLastAttempt,
    activeIndicatorCount: activeCount,
    maxIndicatorCapacity: 20,
    cooldownMet,
    capacityAvailable,
  };

  // Determine if generation should trigger
  const shouldTrigger = cooldownMet && capacityAvailable && existingIndicatorsUnderperforming;

  // Generate recommendation and summary
  let recommendation = "";
  let summary = "";
  let triggerReason: string | undefined;

  if (shouldTrigger) {
    triggerReason = regimeGapDetected
      ? "regime_gap"
      : icDecayDays >= 5
        ? "ic_decay"
        : "low_rolling_ic";
    summary = `Synthesis triggered: ${triggerReason === "regime_gap" ? "Regime gap detected" : `IC decay (${icDecayDays} days)`}`;
    recommendation = `Indicator generation warranted: Rolling IC ${rollingIC.toFixed(4)}, ${icDecayDays} days of decay.`;
  } else if (!cooldownMet) {
    summary = `Cooldown active: ${30 - daysSinceLastAttempt} days remaining`;
    recommendation = `Cooldown active: ${30 - daysSinceLastAttempt} days remaining.`;
  } else if (!capacityAvailable) {
    summary = `Capacity reached: ${activeCount}/${conditions.maxIndicatorCapacity}`;
    recommendation = `Indicator capacity reached (${activeCount}/${conditions.maxIndicatorCapacity}).`;
  } else if (!existingIndicatorsUnderperforming) {
    summary = `Portfolio IC healthy at ${rollingIC.toFixed(4)}`;
    recommendation = `Portfolio IC healthy at ${rollingIC.toFixed(4)}, no generation needed.`;
  } else {
    summary = "No trigger conditions met";
    recommendation = "No trigger conditions met.";
  }

  const triggerStatus = {
    shouldTrigger,
    triggerReason,
    conditions,
    summary,
    recommendation,
  };

  // Check for active synthesis (staging indicator generated in last hour)
  let activeSynthesis = null;
  const stagingRows = await db.execute(
    `SELECT id, name, generated_at, generated_by
     FROM indicators
     WHERE status = 'staging'
       AND generated_at >= datetime('now', '-1 hour')
     ORDER BY generated_at DESC
     LIMIT 1`
  );

  if (stagingRows.length > 0) {
    const row = stagingRows[0];
    activeSynthesis = {
      id: row?.id as string,
      name: row?.name as string,
      status: "running" as const,
      currentPhase: "initiating_paper_trading" as const,
      startedAt: row?.generated_at as string,
      triggeredByCycleId: (row?.generated_by as string) ?? "unknown",
      triggerReason: triggerReason ?? "manual",
    };
  }

  // Get recent activity (last 5 generated indicators)
  const recentRows = await db.execute(
    `SELECT name, status, generated_at
     FROM indicators
     ORDER BY generated_at DESC
     LIMIT 5`
  );

  const recentActivity = recentRows.map((row) => {
    const status = row.status as string;
    let activityStatus:
      | "paper_trading_started"
      | "validation_failed"
      | "implementation_failed"
      | "error";
    let success = false;

    if (status === "paper" || status === "production") {
      activityStatus = "paper_trading_started";
      success = true;
    } else if (status === "retired") {
      activityStatus = "validation_failed";
      success = false;
    } else if (status === "staging") {
      activityStatus = "paper_trading_started";
      success = true;
    } else {
      activityStatus = "error";
      success = false;
    }

    return {
      indicatorName: row.name as string,
      status: activityStatus,
      generatedAt: row.generated_at as string,
      success,
    };
  });

  return c.json({
    triggerStatus,
    activeSynthesis,
    recentActivity,
    lastEvaluatedAt: new Date().toISOString(),
  });
});

// GET /api/indicators/synthesis/history - Get synthesis attempt history
const SynthesisHistoryEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  status: z.string(),
  hypothesis: z.string(),
  generatedAt: z.string(),
  paperTradingStart: z.string().nullable(),
  promotedAt: z.string().nullable(),
  retiredAt: z.string().nullable(),
  retirementReason: z.string().nullable(),
  ic: z.number().nullable(),
  triggerReason: z.string(),
});

const SynthesisHistoryResponseSchema = z.object({
  history: z.array(SynthesisHistoryEntrySchema),
});

const getSynthesisHistoryRoute = createRoute({
  method: "get",
  path: "/synthesis/history",
  request: {
    query: z.object({
      limit: z.coerce.number().min(1).max(100).default(20),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: SynthesisHistoryResponseSchema,
        },
      },
      description: "Synthesis attempt history",
    },
  },
  tags: ["Indicators"],
});

/**
 * Extract trigger reason from generated_by field or hypothesis.
 * The generated_by field contains the cycle ID that triggered synthesis.
 */
function extractTriggerReason(row: {
  generated_by: string | null;
  hypothesis: string | null;
}): string {
  const generatedBy = row.generated_by ?? "";

  // Check for synthesis cycle patterns
  if (generatedBy.startsWith("synthesis-")) {
    return "synthesis";
  }
  if (generatedBy.startsWith("orient-")) {
    return "ooda_cycle";
  }

  // Check hypothesis for regime-related keywords
  const hypothesis = (row.hypothesis ?? "").toLowerCase();
  if (hypothesis.includes("regime") || hypothesis.includes("market condition")) {
    return "regime_gap";
  }
  if (hypothesis.includes("decay") || hypothesis.includes("underperform")) {
    return "ic_decay";
  }

  return "manual";
}

app.openapi(getSynthesisHistoryRoute, async (c) => {
  const { limit } = c.req.valid("query");
  const db = await getDbClient();

  // Query indicators with generated_at set (synthesized indicators)
  // Join with IC history to get 30-day rolling IC
  const rows = await db.execute(
    `
      SELECT
        i.id, i.name, i.category, i.status, i.hypothesis,
        i.generated_at, i.paper_trading_start, i.promoted_at,
        i.retired_at, i.retirement_reason, i.generated_by,
        (SELECT AVG(ic_value) FROM indicator_ic_history
         WHERE indicator_id = i.id AND date >= date('now', '-30 days')) as ic
      FROM indicators i
      WHERE i.generated_at IS NOT NULL
      ORDER BY i.generated_at DESC
      LIMIT ?
    `,
    [limit]
  );

  const history = rows.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    category: row.category as string,
    status: row.status as string,
    hypothesis: row.hypothesis as string,
    generatedAt: row.generated_at as string,
    paperTradingStart: row.paper_trading_start as string | null,
    promotedAt: row.promoted_at as string | null,
    retiredAt: row.retired_at as string | null,
    retirementReason: row.retirement_reason as string | null,
    ic: row.ic as number | null,
    triggerReason: extractTriggerReason({
      generated_by: row.generated_by as string | null,
      hypothesis: row.hypothesis as string | null,
    }),
  }));

  return c.json({ history });
});

// ============================================
// Parameterized Routes (after static routes)
// ============================================

// GET /api/indicators/:id - Get indicator detail
const getIndicatorRoute = createRoute({
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
          schema: z.object({
            indicator: IndicatorDetailSchema,
          }),
        },
      },
      description: "Indicator detail",
    },
    404: {
      content: {
        "application/json": {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
      description: "Indicator not found",
    },
  },
  tags: ["Indicators"],
});

// @ts-expect-error - Hono OpenAPI multi-response type inference limitation
app.openapi(getIndicatorRoute, async (c) => {
  const { id } = c.req.valid("param");
  const db = await getDbClient();

  const rows = await db.execute("SELECT * FROM indicators WHERE id = ?", [id]);
  const row = rows[0];
  if (!row) {
    throw new HTTPException(404, { message: "Indicator not found" });
  }
  const indicator = {
    id: row.id as string,
    name: row.name as string,
    category: row.category as string,
    status: row.status as "staging" | "paper" | "production" | "retired",
    hypothesis: row.hypothesis as string,
    economicRationale: row.economic_rationale as string,
    generatedAt: row.generated_at as string,
    generatedBy: row.generated_by as string,
    promotedAt: row.promoted_at as string | null,
    retiredAt: row.retired_at as string | null,
    validationReport: row.validation_report ? JSON.parse(row.validation_report as string) : null,
    paperTradingReport: row.paper_trading_report
      ? JSON.parse(row.paper_trading_report as string)
      : null,
    paperTradingStart: row.paper_trading_start as string | null,
    paperTradingEnd: row.paper_trading_end as string | null,
    prUrl: row.pr_url as string | null,
    codeHash: row.code_hash as string | null,
  };

  return c.json({ indicator });
});

// GET /api/indicators/:id/ic-history - Get IC history
const getICHistoryRoute = createRoute({
  method: "get",
  path: "/:id/ic-history",
  request: {
    params: z.object({
      id: z.string(),
    }),
    query: z.object({
      days: z.coerce.number().min(1).max(365).default(30),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            history: z.array(ICHistoryEntrySchema),
          }),
        },
      },
      description: "IC history for indicator",
    },
  },
  tags: ["Indicators"],
});

app.openapi(getICHistoryRoute, async (c) => {
  const { id } = c.req.valid("param");
  const { days } = c.req.valid("query");
  const db = await getDbClient();

  const rows = await db.execute(
    `
      SELECT date, ic_value, ic_std, decisions_used_in, decisions_correct
      FROM indicator_ic_history
      WHERE indicator_id = ?
      ORDER BY date DESC
      LIMIT ?
    `,
    [id, days]
  );

  const history = rows.map((row) => ({
    date: row.date as string,
    icValue: row.ic_value as number,
    icStd: row.ic_std as number,
    decisionsUsedIn: row.decisions_used_in as number,
    decisionsCorrect: row.decisions_correct as number,
  }));

  return c.json({ history });
});

// POST /api/indicators/:id/retire - Retire an indicator
const retireIndicatorRoute = createRoute({
  method: "post",
  path: "/:id/retire",
  request: {
    params: z.object({
      id: z.string(),
    }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            reason: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
          }),
        },
      },
      description: "Indicator retired successfully",
    },
    404: {
      content: {
        "application/json": {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
      description: "Indicator not found",
    },
  },
  tags: ["Indicators"],
});

// @ts-expect-error - Hono OpenAPI multi-response type inference limitation
app.openapi(retireIndicatorRoute, async (c) => {
  const { id } = c.req.valid("param");
  const { reason } = c.req.valid("json");
  const db = await getDbClient();

  const result = await db.run(
    `
      UPDATE indicators
      SET status = 'retired',
          retired_at = datetime('now'),
          retirement_reason = ?,
          updated_at = datetime('now')
      WHERE id = ? AND status != 'retired'
    `,
    [reason ?? "Manual retirement", id]
  );

  if (result.changes === 0) {
    throw new HTTPException(404, { message: "Indicator not found or already retired" });
  }

  return c.json({ success: true });
});

// ============================================
// Helper Functions
// ============================================

/**
 * Calculate a simple Information Coefficient (Pearson correlation)
 */
function calculateSimpleIC(signals: number[], outcomes: number[]): number {
  if (signals.length === 0 || signals.length !== outcomes.length) {
    return 0;
  }

  const n = signals.length;
  const meanSignal = signals.reduce((a, b) => a + b, 0) / n;
  const meanOutcome = outcomes.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denomSignal = 0;
  let denomOutcome = 0;

  for (let i = 0; i < n; i++) {
    const signal = signals[i];
    const outcome = outcomes[i];
    if (signal === undefined || outcome === undefined) {
      continue;
    }
    const diffSignal = signal - meanSignal;
    const diffOutcome = outcome - meanOutcome;
    numerator += diffSignal * diffOutcome;
    denomSignal += diffSignal * diffSignal;
    denomOutcome += diffOutcome * diffOutcome;
  }

  const denominator = Math.sqrt(denomSignal * denomOutcome);
  return denominator === 0 ? 0 : numerator / denominator;
}

// ============================================
// Export
// ============================================

export default app;
