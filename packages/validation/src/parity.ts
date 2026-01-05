/**
 * Research-to-Production Feature Parity Validation
 *
 * Implements validation mechanisms to ensure backtesting features match
 * live trading capabilities, preventing look-ahead bias and ensuring
 * statistical parity.
 *
 * Reference: docs/plans/00-overview.md (Lines 197-201)
 *
 * @module @cream/validation/parity
 */

import { z } from "zod";

// =============================================================================
// Indicator Version Tracking
// =============================================================================

/**
 * Schema for tracking indicator versions.
 * Each indicator has a unique ID and semantic version.
 */
export const IndicatorVersionSchema = z.object({
  /** Unique identifier for the indicator (e.g., "sma", "rsi", "atr") */
  id: z.string().min(1),
  /** Semantic version (e.g., "1.0.0", "2.1.3") */
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  /** When this version was introduced */
  introducedAt: z.string().datetime(),
  /** SHA-256 hash of the indicator implementation for change detection */
  implementationHash: z.string().length(64).optional(),
  /** Parameters used for this indicator */
  parameters: z.record(z.unknown()).optional(),
});

export type IndicatorVersion = z.infer<typeof IndicatorVersionSchema>;

/**
 * Schema for a version registry that tracks all indicators.
 */
export const VersionRegistrySchema = z.object({
  /** Timestamp when registry was created */
  createdAt: z.string().datetime(),
  /** Environment this registry applies to */
  environment: z.enum(["BACKTEST", "PAPER", "LIVE"]),
  /** Map of indicator ID to version info */
  indicators: z.record(IndicatorVersionSchema),
});

export type VersionRegistry = z.infer<typeof VersionRegistrySchema>;

/**
 * Result of comparing two version registries.
 */
export interface VersionComparisonResult {
  /** Whether all versions match */
  match: boolean;
  /** Indicators with mismatched versions */
  mismatches: Array<{
    indicatorId: string;
    backtestVersion: string;
    liveVersion: string;
  }>;
  /** Indicators missing from live */
  missingFromLive: string[];
  /** Indicators missing from backtest */
  missingFromBacktest: string[];
}

/**
 * Compare indicator versions between backtest and live registries.
 */
export function compareVersionRegistries(
  backtest: VersionRegistry,
  live: VersionRegistry
): VersionComparisonResult {
  const mismatches: VersionComparisonResult["mismatches"] = [];
  const missingFromLive: string[] = [];
  const missingFromBacktest: string[] = [];

  const backtestIds = new Set(Object.keys(backtest.indicators));
  const liveIds = new Set(Object.keys(live.indicators));

  // Check for mismatches and missing from live
  for (const id of backtestIds) {
    const backtestIndicator = backtest.indicators[id];
    if (!backtestIndicator) continue;

    if (!liveIds.has(id)) {
      missingFromLive.push(id);
    } else {
      const liveIndicator = live.indicators[id];
      if (liveIndicator && backtestIndicator.version !== liveIndicator.version) {
        mismatches.push({
          indicatorId: id,
          backtestVersion: backtestIndicator.version,
          liveVersion: liveIndicator.version,
        });
      }
    }
  }

  // Check for missing from backtest
  for (const id of liveIds) {
    if (!backtestIds.has(id)) {
      missingFromBacktest.push(id);
    }
  }

  return {
    match:
      mismatches.length === 0 &&
      missingFromLive.length === 0 &&
      missingFromBacktest.length === 0,
    mismatches,
    missingFromLive,
    missingFromBacktest,
  };
}

// =============================================================================
// Look-Ahead Bias Prevention
// =============================================================================

/**
 * Schema for a single candle/bar of data.
 */
export const CandleSchema = z.object({
  /** Candle open timestamp (ISO 8601) */
  timestamp: z.string().datetime(),
  /** Open price */
  open: z.number().positive(),
  /** High price */
  high: z.number().positive(),
  /** Low price */
  low: z.number().positive(),
  /** Close price */
  close: z.number().positive(),
  /** Volume */
  volume: z.number().nonnegative(),
});

export type Candle = z.infer<typeof CandleSchema>;

/**
 * Result of look-ahead bias check.
 */
export interface LookAheadBiasResult {
  /** Whether the data is free of look-ahead bias */
  valid: boolean;
  /** Specific violations found */
  violations: Array<{
    type: "future_data" | "non_sequential" | "unadjusted" | "peeking";
    description: string;
    timestamp?: string;
  }>;
}

/**
 * Check for look-ahead bias in candle data.
 *
 * Validates:
 * - No future data used (decision timestamp <= candle close time)
 * - Candle timestamps are strictly sequential
 * - No peeking at next candle close
 *
 * @param candles - Array of candles to validate
 * @param decisionTimestamp - When the trading decision was made
 */
export function checkLookAheadBias(
  candles: Candle[],
  decisionTimestamp: string
): LookAheadBiasResult {
  const violations: LookAheadBiasResult["violations"] = [];
  const decisionTime = new Date(decisionTimestamp).getTime();

  // Check for future data
  for (const candle of candles) {
    const candleTime = new Date(candle.timestamp).getTime();
    if (candleTime > decisionTime) {
      violations.push({
        type: "future_data",
        description: `Candle at ${candle.timestamp} is in the future relative to decision at ${decisionTimestamp}`,
        timestamp: candle.timestamp,
      });
    }
  }

  // Check for sequential timestamps
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1];
    const curr = candles[i];
    if (!prev || !curr) continue;

    const prevTime = new Date(prev.timestamp).getTime();
    const currTime = new Date(curr.timestamp).getTime();

    if (currTime <= prevTime) {
      violations.push({
        type: "non_sequential",
        description: `Candle at ${curr.timestamp} is not after previous candle at ${prev.timestamp}`,
        timestamp: curr.timestamp,
      });
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * Validate that no unadjusted data is used (splits, dividends applied).
 *
 * @param prices - Array of historical prices with adjustment info
 */
export function validateAdjustedData(
  prices: Array<{
    timestamp: string;
    price: number;
    adjustedPrice: number;
    splitFactor?: number;
    dividendAdjustment?: number;
  }>
): LookAheadBiasResult {
  const violations: LookAheadBiasResult["violations"] = [];

  for (const p of prices) {
    // Check if adjustment factors differ significantly
    if (p.splitFactor !== undefined && p.splitFactor !== 1) {
      const expectedAdjusted = p.price / p.splitFactor;
      const tolerance = 0.001; // 0.1% tolerance

      if (Math.abs(p.adjustedPrice - expectedAdjusted) / expectedAdjusted > tolerance) {
        violations.push({
          type: "unadjusted",
          description: `Price at ${p.timestamp} may not be properly split-adjusted. Raw: ${p.price}, Adjusted: ${p.adjustedPrice}, Factor: ${p.splitFactor}`,
          timestamp: p.timestamp,
        });
      }
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

// =============================================================================
// Fill Model Validation
// =============================================================================

/**
 * Schema for a fill record.
 */
export const FillRecordSchema = z.object({
  /** Order ID */
  orderId: z.string(),
  /** Symbol */
  symbol: z.string(),
  /** Side (buy/sell) */
  side: z.enum(["buy", "sell"]),
  /** Requested quantity */
  requestedQty: z.number().positive(),
  /** Filled quantity */
  filledQty: z.number().nonnegative(),
  /** Requested price (for limit orders) */
  requestedPrice: z.number().positive().optional(),
  /** Actual fill price */
  fillPrice: z.number().positive().optional(),
  /** Order type */
  orderType: z.enum(["market", "limit", "stop", "stop_limit"]),
  /** Timestamp of fill */
  filledAt: z.string().datetime().optional(),
  /** Slippage in basis points */
  slippageBps: z.number().optional(),
});

export type FillRecord = z.infer<typeof FillRecordSchema>;

/**
 * Fill model comparison result.
 */
export interface FillModelComparisonResult {
  /** Overall match quality (0-1) */
  matchScore: number;
  /** Total fills compared */
  totalFills: number;
  /** Fills that matched within tolerance */
  matchedFills: number;
  /** Statistics */
  stats: {
    avgSlippageBacktest: number;
    avgSlippageLive: number;
    fillRateBacktest: number;
    fillRateLive: number;
    avgLatencyMs?: number;
  };
  /** Significant discrepancies */
  discrepancies: Array<{
    orderId: string;
    field: string;
    backtestValue: number | string;
    liveValue: number | string;
  }>;
}

/**
 * Compare backtest fill model against live trading fills.
 *
 * @param backtestFills - Fills from backtest simulation
 * @param liveFills - Actual fills from live/paper trading
 * @param tolerance - Acceptable difference in slippage (basis points)
 */
export function compareFillModels(
  backtestFills: FillRecord[],
  liveFills: FillRecord[],
  tolerance: { slippageBps: number; fillRatePct: number } = {
    slippageBps: 10,
    fillRatePct: 5,
  }
): FillModelComparisonResult {
  const discrepancies: FillModelComparisonResult["discrepancies"] = [];

  // Calculate backtest stats
  const backtestSlippages = backtestFills
    .map((f) => f.slippageBps)
    .filter((s): s is number => s !== undefined);
  const avgSlippageBacktest =
    backtestSlippages.length > 0
      ? backtestSlippages.reduce((a, b) => a + b, 0) / backtestSlippages.length
      : 0;

  const backtestFillRate =
    backtestFills.length > 0
      ? backtestFills.filter((f) => f.filledQty > 0).length / backtestFills.length
      : 0;

  // Calculate live stats
  const liveSlippages = liveFills
    .map((f) => f.slippageBps)
    .filter((s): s is number => s !== undefined);
  const avgSlippageLive =
    liveSlippages.length > 0
      ? liveSlippages.reduce((a, b) => a + b, 0) / liveSlippages.length
      : 0;

  const liveFillRate =
    liveFills.length > 0
      ? liveFills.filter((f) => f.filledQty > 0).length / liveFills.length
      : 0;

  // Check for discrepancies
  if (Math.abs(avgSlippageBacktest - avgSlippageLive) > tolerance.slippageBps) {
    discrepancies.push({
      orderId: "aggregate",
      field: "avgSlippage",
      backtestValue: avgSlippageBacktest,
      liveValue: avgSlippageLive,
    });
  }

  if (
    Math.abs((backtestFillRate - liveFillRate) * 100) > tolerance.fillRatePct
  ) {
    discrepancies.push({
      orderId: "aggregate",
      field: "fillRate",
      backtestValue: backtestFillRate,
      liveValue: liveFillRate,
    });
  }

  // Match individual fills by orderId
  const liveByOrderId = new Map(liveFills.map((f) => [f.orderId, f]));
  let matchedFills = 0;

  for (const btFill of backtestFills) {
    const liveFill = liveByOrderId.get(btFill.orderId);
    if (liveFill) {
      const btSlip = btFill.slippageBps ?? 0;
      const liveSlip = liveFill.slippageBps ?? 0;

      if (Math.abs(btSlip - liveSlip) <= tolerance.slippageBps) {
        matchedFills++;
      }
    }
  }

  const matchScore =
    backtestFills.length > 0 ? matchedFills / backtestFills.length : 1;

  return {
    matchScore,
    totalFills: backtestFills.length,
    matchedFills,
    stats: {
      avgSlippageBacktest,
      avgSlippageLive,
      fillRateBacktest: backtestFillRate,
      fillRateLive: liveFillRate,
    },
    discrepancies,
  };
}

// =============================================================================
// Statistical Parity
// =============================================================================

/**
 * Schema for performance metrics.
 */
export const PerformanceMetricsSchema = z.object({
  /** Sharpe ratio (risk-adjusted return) */
  sharpeRatio: z.number(),
  /** Sortino ratio (downside risk-adjusted return) */
  sortinoRatio: z.number(),
  /** Calmar ratio (return/max drawdown) */
  calmarRatio: z.number(),
  /** Maximum drawdown (percentage) */
  maxDrawdownPct: z.number(),
  /** Total return (percentage) */
  totalReturnPct: z.number(),
  /** Win rate (percentage) */
  winRatePct: z.number(),
  /** Average win/loss ratio */
  winLossRatio: z.number(),
  /** Number of trades */
  tradeCount: z.number().int().nonnegative(),
  /** Time period (days) */
  periodDays: z.number().positive(),
});

export type PerformanceMetrics = z.infer<typeof PerformanceMetricsSchema>;

/**
 * Result of statistical parity comparison.
 */
export interface StatisticalParityResult {
  /** Whether metrics are within acceptable tolerance */
  withinTolerance: boolean;
  /** Overall parity score (0-1, higher is better) */
  parityScore: number;
  /** Metric-by-metric comparison */
  metricComparisons: Array<{
    metric: keyof PerformanceMetrics;
    backtestValue: number;
    liveValue: number;
    differencePercent: number;
    withinTolerance: boolean;
  }>;
  /** Recommendation */
  recommendation: "APPROVE" | "INVESTIGATE" | "REJECT";
  /** Reason for recommendation */
  reason: string;
}

/**
 * Default tolerances for metric comparison.
 */
export const DEFAULT_METRIC_TOLERANCES: Record<keyof PerformanceMetrics, number> = {
  sharpeRatio: 20, // 20% difference acceptable
  sortinoRatio: 25,
  calmarRatio: 30,
  maxDrawdownPct: 15,
  totalReturnPct: 20,
  winRatePct: 10,
  winLossRatio: 20,
  tradeCount: 10,
  periodDays: 0, // Must match exactly
};

/**
 * Compare performance metrics between backtest and live trading.
 *
 * @param backtest - Metrics from backtesting
 * @param live - Metrics from live/paper trading
 * @param tolerances - Per-metric tolerance (percentage difference allowed)
 */
export function comparePerformanceMetrics(
  backtest: PerformanceMetrics,
  live: PerformanceMetrics,
  tolerances: Partial<Record<keyof PerformanceMetrics, number>> = {}
): StatisticalParityResult {
  const mergedTolerances = { ...DEFAULT_METRIC_TOLERANCES, ...tolerances };

  const metricComparisons: StatisticalParityResult["metricComparisons"] = [];
  let withinToleranceCount = 0;

  const metrics: (keyof PerformanceMetrics)[] = [
    "sharpeRatio",
    "sortinoRatio",
    "calmarRatio",
    "maxDrawdownPct",
    "totalReturnPct",
    "winRatePct",
    "winLossRatio",
    "tradeCount",
    "periodDays",
  ];

  for (const metric of metrics) {
    const btValue = backtest[metric];
    const liveValue = live[metric];

    // Calculate percentage difference
    // Handle zero values specially
    let diffPct: number;
    if (btValue === 0 && liveValue === 0) {
      diffPct = 0;
    } else if (btValue === 0) {
      diffPct = 100; // Infinite difference if backtest is 0 but live isn't
    } else {
      diffPct = Math.abs((liveValue - btValue) / btValue) * 100;
    }

    const tolerance = mergedTolerances[metric];
    const withinTol = diffPct <= tolerance;

    if (withinTol) {
      withinToleranceCount++;
    }

    metricComparisons.push({
      metric,
      backtestValue: btValue,
      liveValue,
      differencePercent: diffPct,
      withinTolerance: withinTol,
    });
  }

  const parityScore = withinToleranceCount / metrics.length;
  const withinTolerance = parityScore >= 0.8; // 80% of metrics must be within tolerance

  // Determine recommendation
  let recommendation: StatisticalParityResult["recommendation"];
  let reason: string;

  if (parityScore >= 0.9) {
    recommendation = "APPROVE";
    reason = `${Math.round(parityScore * 100)}% of metrics within tolerance. Strategy performs consistently.`;
  } else if (parityScore >= 0.7) {
    recommendation = "INVESTIGATE";
    reason = `${Math.round(parityScore * 100)}% of metrics within tolerance. Some divergence detected - investigate before going LIVE.`;
  } else {
    recommendation = "REJECT";
    reason = `Only ${Math.round(parityScore * 100)}% of metrics within tolerance. Significant parity issues detected.`;
  }

  return {
    withinTolerance,
    parityScore,
    metricComparisons,
    recommendation,
    reason,
  };
}

// =============================================================================
// Data Consistency Validation
// =============================================================================

/**
 * Schema for data source metadata.
 */
export const DataSourceMetadataSchema = z.object({
  /** Data provider (e.g., "polygon", "databento") */
  provider: z.string(),
  /** Data feed type */
  feedType: z.enum(["historical", "realtime"]),
  /** Whether data is adjusted for corporate actions */
  adjusted: z.boolean(),
  /** Start of data period */
  startDate: z.string().datetime(),
  /** End of data period */
  endDate: z.string().datetime(),
  /** Symbols included */
  symbols: z.array(z.string()),
});

export type DataSourceMetadata = z.infer<typeof DataSourceMetadataSchema>;

/**
 * Result of data consistency check.
 */
export interface DataConsistencyResult {
  /** Whether data is consistent */
  consistent: boolean;
  /** Consistency issues found */
  issues: Array<{
    type: "provider_mismatch" | "adjustment_mismatch" | "survivorship_bias" | "data_gap";
    description: string;
    severity: "error" | "warning";
  }>;
  /** Recommendations */
  recommendations: string[];
}

/**
 * Validate data consistency between historical and real-time sources.
 *
 * @param historical - Historical data source metadata
 * @param realtime - Real-time data source metadata
 * @param delistedSymbols - Symbols that were delisted during the period
 */
export function validateDataConsistency(
  historical: DataSourceMetadata,
  realtime: DataSourceMetadata,
  delistedSymbols: string[] = []
): DataConsistencyResult {
  const issues: DataConsistencyResult["issues"] = [];
  const recommendations: string[] = [];

  // Check provider consistency
  if (historical.provider !== realtime.provider) {
    issues.push({
      type: "provider_mismatch",
      description: `Historical data from ${historical.provider}, real-time from ${realtime.provider}. Data may differ.`,
      severity: "warning",
    });
    recommendations.push(
      `Consider using same provider (${realtime.provider}) for both historical and real-time data.`
    );
  }

  // Check adjustment consistency
  if (historical.adjusted !== realtime.adjusted) {
    issues.push({
      type: "adjustment_mismatch",
      description: `Historical data adjusted=${historical.adjusted}, real-time adjusted=${realtime.adjusted}.`,
      severity: "error",
    });
    recommendations.push("Ensure both data sources use same adjustment setting.");
  }

  // Check for survivorship bias
  const historicalSymbols = new Set(historical.symbols);
  for (const symbol of delistedSymbols) {
    if (!historicalSymbols.has(symbol)) {
      issues.push({
        type: "survivorship_bias",
        description: `Delisted symbol ${symbol} not included in historical data. May introduce survivorship bias.`,
        severity: "warning",
      });
    }
  }

  if (delistedSymbols.length > 0 && issues.some((i) => i.type === "survivorship_bias")) {
    recommendations.push(
      "Include delisted symbols in historical data to avoid survivorship bias."
    );
  }

  return {
    consistent: issues.filter((i) => i.severity === "error").length === 0,
    issues,
    recommendations,
  };
}

// =============================================================================
// Validation Workflow
// =============================================================================

/**
 * Complete parity validation result.
 */
export interface ParityValidationResult {
  /** Overall validation passed */
  passed: boolean;
  /** Timestamp of validation */
  validatedAt: string;
  /** Version comparison result */
  versionComparison?: VersionComparisonResult;
  /** Look-ahead bias check result */
  lookAheadBiasCheck?: LookAheadBiasResult;
  /** Fill model comparison result */
  fillModelComparison?: FillModelComparisonResult;
  /** Statistical parity result */
  statisticalParity?: StatisticalParityResult;
  /** Data consistency result */
  dataConsistency?: DataConsistencyResult;
  /** Overall recommendation */
  recommendation: "APPROVE_FOR_LIVE" | "NEEDS_INVESTIGATION" | "NOT_READY";
  /** Blocking issues that must be resolved */
  blockingIssues: string[];
  /** Warnings that should be reviewed */
  warnings: string[];
}

/**
 * Run complete parity validation workflow.
 *
 * @param params - Validation parameters
 */
export function runParityValidation(params: {
  backtestRegistry?: VersionRegistry;
  liveRegistry?: VersionRegistry;
  candles?: Candle[];
  decisionTimestamp?: string;
  backtestFills?: FillRecord[];
  liveFills?: FillRecord[];
  backtestMetrics?: PerformanceMetrics;
  liveMetrics?: PerformanceMetrics;
  historicalData?: DataSourceMetadata;
  realtimeData?: DataSourceMetadata;
  delistedSymbols?: string[];
}): ParityValidationResult {
  const blockingIssues: string[] = [];
  const warnings: string[] = [];

  let versionComparison: VersionComparisonResult | undefined;
  let lookAheadBiasCheck: LookAheadBiasResult | undefined;
  let fillModelComparison: FillModelComparisonResult | undefined;
  let statisticalParity: StatisticalParityResult | undefined;
  let dataConsistency: DataConsistencyResult | undefined;

  // Version comparison
  if (params.backtestRegistry && params.liveRegistry) {
    versionComparison = compareVersionRegistries(
      params.backtestRegistry,
      params.liveRegistry
    );

    if (!versionComparison.match) {
      if (versionComparison.mismatches.length > 0) {
        blockingIssues.push(
          `Indicator version mismatches: ${versionComparison.mismatches.map((m) => m.indicatorId).join(", ")}`
        );
      }
      if (versionComparison.missingFromLive.length > 0) {
        blockingIssues.push(
          `Indicators missing from live: ${versionComparison.missingFromLive.join(", ")}`
        );
      }
      if (versionComparison.missingFromBacktest.length > 0) {
        warnings.push(
          `Indicators missing from backtest: ${versionComparison.missingFromBacktest.join(", ")}`
        );
      }
    }
  }

  // Look-ahead bias check
  if (params.candles && params.decisionTimestamp) {
    lookAheadBiasCheck = checkLookAheadBias(params.candles, params.decisionTimestamp);

    if (!lookAheadBiasCheck.valid) {
      for (const v of lookAheadBiasCheck.violations) {
        if (v.type === "future_data" || v.type === "peeking") {
          blockingIssues.push(`Look-ahead bias: ${v.description}`);
        } else {
          warnings.push(`Data issue: ${v.description}`);
        }
      }
    }
  }

  // Fill model comparison
  if (params.backtestFills && params.liveFills) {
    fillModelComparison = compareFillModels(params.backtestFills, params.liveFills);

    if (fillModelComparison.matchScore < 0.8) {
      warnings.push(
        `Fill model match score ${Math.round(fillModelComparison.matchScore * 100)}% is below 80% threshold`
      );
    }

    for (const d of fillModelComparison.discrepancies) {
      warnings.push(`Fill discrepancy in ${d.field}: backtest=${d.backtestValue}, live=${d.liveValue}`);
    }
  }

  // Statistical parity
  if (params.backtestMetrics && params.liveMetrics) {
    statisticalParity = comparePerformanceMetrics(
      params.backtestMetrics,
      params.liveMetrics
    );

    if (statisticalParity.recommendation === "REJECT") {
      blockingIssues.push(statisticalParity.reason);
    } else if (statisticalParity.recommendation === "INVESTIGATE") {
      warnings.push(statisticalParity.reason);
    }
  }

  // Data consistency
  if (params.historicalData && params.realtimeData) {
    dataConsistency = validateDataConsistency(
      params.historicalData,
      params.realtimeData,
      params.delistedSymbols
    );

    for (const issue of dataConsistency.issues) {
      if (issue.severity === "error") {
        blockingIssues.push(issue.description);
      } else {
        warnings.push(issue.description);
      }
    }
  }

  // Determine overall recommendation
  let recommendation: ParityValidationResult["recommendation"];
  if (blockingIssues.length > 0) {
    recommendation = "NOT_READY";
  } else if (warnings.length > 0) {
    recommendation = "NEEDS_INVESTIGATION";
  } else {
    recommendation = "APPROVE_FOR_LIVE";
  }

  return {
    passed: blockingIssues.length === 0,
    validatedAt: new Date().toISOString(),
    versionComparison,
    lookAheadBiasCheck,
    fillModelComparison,
    statisticalParity,
    dataConsistency,
    recommendation,
    blockingIssues,
    warnings,
  };
}
