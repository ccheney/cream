/**
 * Indicator Monitoring Module
 *
 * Provides production monitoring for indicators including:
 * - Daily IC computation and tracking
 * - Decision attribution (which decisions used each indicator)
 * - Retirement condition detection
 * - Rolling performance metrics
 *
 * @see docs/plans/19-dynamic-indicator-synthesis.md (lines 1145-1200)
 */

import type { TursoClient } from "@cream/storage";
import { z } from "zod";
import { crossSectionalIC, spearmanCorrelation } from "./ic.js";

// ============================================
// Configuration
// ============================================

/**
 * Default configuration values for monitoring
 */
export const MONITORING_DEFAULTS = {
  /** Minimum IC threshold for healthy indicator */
  minHealthyIC: 0.02,
  /** Days of low IC before retirement consideration */
  retirementThresholdDays: 30,
  /** IC stability ratio threshold (mean/std) */
  minICStability: 0.5,
  /** Rolling window for metrics (days) */
  rollingWindowDays: 30,
  /** Minimum hit rate for healthy indicator */
  minHitRate: 0.5,
} as const;

// ============================================
// Schemas
// ============================================

/**
 * Daily IC metrics schema
 */
export const DailyICMetricsSchema = z.object({
  indicatorId: z.string(),
  date: z.string(),
  icValue: z.number(),
  icStd: z.number(),
  nObservations: z.number().int(),
  decisionsUsedIn: z.number().int(),
  decisionsCorrect: z.number().int(),
});

export type DailyICMetrics = z.infer<typeof DailyICMetricsSchema>;

/**
 * Rolling metrics schema
 */
export const RollingMetricsSchema = z.object({
  indicatorId: z.string(),
  ic30Day: z.number(),
  icStd30Day: z.number(),
  icStability: z.number(),
  decisionsTotal: z.number().int(),
  decisionsCorrect: z.number().int(),
  hitRate: z.number().min(0).max(1),
  daysTracked: z.number().int(),
  health: z.enum(["healthy", "degraded", "critical"]),
});

export type RollingMetrics = z.infer<typeof RollingMetricsSchema>;

/**
 * Retirement check result schema
 */
export const RetirementCheckSchema = z.object({
  indicatorId: z.string(),
  shouldRetire: z.boolean(),
  reason: z.string().optional(),
  consecutiveLowICDays: z.number().int(),
  avgIC30Day: z.number(),
  hitRate: z.number(),
  recommendedAction: z.enum(["none", "monitor", "retire"]),
});

export type RetirementCheck = z.infer<typeof RetirementCheckSchema>;

/**
 * Decision attribution schema
 */
export const DecisionAttributionSchema = z.object({
  id: z.string(),
  decisionId: z.string(),
  indicatorId: z.string(),
  signalValue: z.number(),
  contributionWeight: z.number().min(0).max(1),
  wasCorrect: z.boolean().nullable(),
  createdAt: z.string(),
});

export type DecisionAttribution = z.infer<typeof DecisionAttributionSchema>;

// ============================================
// Helper Functions
// ============================================

function generateId(): string {
  return `icm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function today(): string {
  return new Date().toISOString().split("T")[0] ?? "";
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function std(values: number[]): number {
  if (values.length < 2) {
    return 0;
  }
  const avg = mean(values);
  const squaredDiffs = values.map((v) => (v - avg) ** 2);
  return Math.sqrt(mean(squaredDiffs));
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

// ============================================
// Indicator Monitor Implementation
// ============================================

/**
 * Production indicator monitoring service.
 *
 * Tracks daily IC, decision attribution, and retirement conditions
 * for indicators in production.
 *
 * @example
 * ```typescript
 * const monitor = new IndicatorMonitor(db);
 *
 * // Compute daily metrics for all production indicators
 * const indicators = await getProductionIndicators();
 * for (const indicator of indicators) {
 *   await monitor.computeDailyMetrics(indicator.id, signals, outcomes);
 * }
 *
 * // Check if any should be retired
 * for (const indicator of indicators) {
 *   const check = await monitor.checkRetirementConditions(indicator.id);
 *   if (check.shouldRetire) {
 *     console.log(`Consider retiring ${indicator.id}: ${check.reason}`);
 *   }
 * }
 * ```
 */
export class IndicatorMonitor {
  constructor(private readonly db: TursoClient) {}

  // ============================================
  // Daily Metrics Computation
  // ============================================

  /**
   * Compute and store daily IC metrics for an indicator.
   *
   * @param indicatorId - The indicator ID
   * @param signals - Map of symbol to signal value for today
   * @param outcomes - Map of symbol to forward return (outcome)
   * @param date - Date for the metrics (defaults to today)
   */
  async computeDailyMetrics(
    indicatorId: string,
    signals: Map<string, number>,
    outcomes: Map<string, number>,
    date: string = today()
  ): Promise<DailyICMetrics> {
    // Align signals and outcomes
    const alignedSignals: number[] = [];
    const alignedOutcomes: number[] = [];

    for (const [symbol, signal] of signals) {
      const outcome = outcomes.get(symbol);
      if (outcome !== undefined) {
        alignedSignals.push(signal);
        alignedOutcomes.push(outcome);
      }
    }

    // Compute IC
    const icResult = crossSectionalIC(alignedSignals, alignedOutcomes);

    // Get decision attribution for today
    const decisions = await this.getDecisionAttributions(indicatorId, date);
    const correctDecisions = decisions.filter((d) => d.wasCorrect === true).length;

    // Store metrics
    const metrics: DailyICMetrics = {
      indicatorId,
      date,
      icValue: icResult.ic,
      icStd: this.computeICStd(alignedSignals, alignedOutcomes),
      nObservations: icResult.nObservations,
      decisionsUsedIn: decisions.length,
      decisionsCorrect: correctDecisions,
    };

    await this.storeDailyMetrics(metrics);

    return metrics;
  }

  /**
   * Compute IC standard deviation using bootstrap.
   */
  private computeICStd(signals: number[], outcomes: number[]): number {
    if (signals.length < 5) {
      return 0;
    }

    // Simple approach: compute IC on random subsamples
    const nBootstrap = 100;
    const icValues: number[] = [];

    for (let i = 0; i < nBootstrap; i++) {
      const subsampleSignals: number[] = [];
      const subsampleOutcomes: number[] = [];

      for (let j = 0; j < signals.length; j++) {
        const idx = Math.floor(Math.random() * signals.length);
        const sig = signals[idx];
        const out = outcomes[idx];
        if (sig !== undefined && out !== undefined) {
          subsampleSignals.push(sig);
          subsampleOutcomes.push(out);
        }
      }

      const ic = spearmanCorrelation(subsampleSignals, subsampleOutcomes);
      icValues.push(ic);
    }

    return std(icValues);
  }

  /**
   * Store daily metrics in the database.
   */
  private async storeDailyMetrics(metrics: DailyICMetrics): Promise<void> {
    await this.db.run(
      `INSERT OR REPLACE INTO indicator_ic_history (
        id, indicator_id, date, ic_value, ic_std,
        decisions_used_in, decisions_correct
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        generateId(),
        metrics.indicatorId,
        metrics.date,
        metrics.icValue,
        metrics.icStd,
        metrics.decisionsUsedIn,
        metrics.decisionsCorrect,
      ]
    );
  }

  // ============================================
  // IC History Retrieval
  // ============================================

  /**
   * Get IC history for an indicator.
   *
   * @param indicatorId - The indicator ID
   * @param days - Number of recent days to retrieve
   * @returns Array of IC history entries (newest first)
   */
  async getICHistory(
    indicatorId: string,
    days: number = MONITORING_DEFAULTS.rollingWindowDays
  ): Promise<DailyICMetrics[]> {
    const rows = await this.db.execute<{
      id: string;
      indicator_id: string;
      date: string;
      ic_value: number;
      ic_std: number;
      decisions_used_in: number;
      decisions_correct: number;
    }>(
      `SELECT id, indicator_id, date, ic_value, ic_std, decisions_used_in, decisions_correct
       FROM indicator_ic_history
       WHERE indicator_id = ?
       ORDER BY date DESC
       LIMIT ?`,
      [indicatorId, days]
    );

    return rows.map((row) => ({
      indicatorId: row.indicator_id,
      date: row.date,
      icValue: row.ic_value,
      icStd: row.ic_std,
      nObservations: 0, // Not stored, would need separate column
      decisionsUsedIn: row.decisions_used_in,
      decisionsCorrect: row.decisions_correct,
    }));
  }

  // ============================================
  // Rolling Metrics
  // ============================================

  /**
   * Compute rolling metrics for an indicator.
   *
   * @param indicatorId - The indicator ID
   * @returns Rolling performance metrics
   */
  async computeRollingMetrics(indicatorId: string): Promise<RollingMetrics> {
    const history = await this.getICHistory(indicatorId, MONITORING_DEFAULTS.rollingWindowDays);

    if (history.length === 0) {
      return {
        indicatorId,
        ic30Day: 0,
        icStd30Day: 0,
        icStability: 0,
        decisionsTotal: 0,
        decisionsCorrect: 0,
        hitRate: 0,
        daysTracked: 0,
        health: "critical",
      };
    }

    const icValues = history.map((h) => h.icValue);
    const ic30Day = mean(icValues);
    const icStd30Day = std(icValues);
    const icStability = icStd30Day > 0 ? ic30Day / icStd30Day : 0;

    const decisionsTotal = sum(history.map((h) => h.decisionsUsedIn));
    const decisionsCorrect = sum(history.map((h) => h.decisionsCorrect));
    const hitRate = decisionsTotal > 0 ? decisionsCorrect / decisionsTotal : 0;

    // Determine health status
    let health: "healthy" | "degraded" | "critical";
    if (ic30Day >= MONITORING_DEFAULTS.minHealthyIC && hitRate >= MONITORING_DEFAULTS.minHitRate) {
      health = "healthy";
    } else if (
      ic30Day >= MONITORING_DEFAULTS.minHealthyIC / 2 ||
      hitRate >= MONITORING_DEFAULTS.minHitRate - 0.05
    ) {
      health = "degraded";
    } else {
      health = "critical";
    }

    return {
      indicatorId,
      ic30Day,
      icStd30Day,
      icStability,
      decisionsTotal,
      decisionsCorrect,
      hitRate,
      daysTracked: history.length,
      health,
    };
  }

  // ============================================
  // Retirement Condition Checking
  // ============================================

  /**
   * Check whether an indicator should be considered for retirement.
   *
   * @param indicatorId - The indicator ID
   * @returns Retirement check result
   */
  async checkRetirementConditions(indicatorId: string): Promise<RetirementCheck> {
    const history = await this.getICHistory(
      indicatorId,
      MONITORING_DEFAULTS.retirementThresholdDays
    );

    if (history.length === 0) {
      return {
        indicatorId,
        shouldRetire: false,
        consecutiveLowICDays: 0,
        avgIC30Day: 0,
        hitRate: 0,
        recommendedAction: "monitor",
        reason: "Insufficient data for retirement evaluation",
      };
    }

    // Count consecutive days below threshold
    let consecutiveLowICDays = 0;
    for (const entry of history) {
      if (entry.icValue < MONITORING_DEFAULTS.minHealthyIC) {
        consecutiveLowICDays++;
      } else {
        break;
      }
    }

    const icValues = history.map((h) => h.icValue);
    const avgIC30Day = mean(icValues);

    const decisionsTotal = sum(history.map((h) => h.decisionsUsedIn));
    const decisionsCorrect = sum(history.map((h) => h.decisionsCorrect));
    const hitRate = decisionsTotal > 0 ? decisionsCorrect / decisionsTotal : 0;

    // Determine if should retire
    const shouldRetire =
      consecutiveLowICDays >= MONITORING_DEFAULTS.retirementThresholdDays &&
      avgIC30Day < MONITORING_DEFAULTS.minHealthyIC;

    let recommendedAction: "none" | "monitor" | "retire";
    let reason: string | undefined;

    if (shouldRetire) {
      recommendedAction = "retire";
      reason = `IC below ${MONITORING_DEFAULTS.minHealthyIC} for ${consecutiveLowICDays} consecutive days`;
    } else if (consecutiveLowICDays >= MONITORING_DEFAULTS.retirementThresholdDays / 2) {
      recommendedAction = "monitor";
      reason = `IC showing sustained weakness (${consecutiveLowICDays} days below threshold)`;
    } else {
      recommendedAction = "none";
    }

    return {
      indicatorId,
      shouldRetire,
      reason,
      consecutiveLowICDays,
      avgIC30Day,
      hitRate,
      recommendedAction,
    };
  }

  // ============================================
  // Decision Attribution
  // ============================================

  /**
   * Record a decision attribution.
   *
   * @param attribution - The attribution to record
   */
  async recordDecisionAttribution(
    attribution: Omit<DecisionAttribution, "id" | "createdAt">
  ): Promise<void> {
    await this.db.run(
      `INSERT INTO decision_attributions (
        id, decision_id, indicator_id, signal_value,
        contribution_weight, was_correct
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        generateId(),
        attribution.decisionId,
        attribution.indicatorId,
        attribution.signalValue,
        attribution.contributionWeight,
        attribution.wasCorrect,
      ]
    );
  }

  /**
   * Get decision attributions for an indicator on a specific date.
   *
   * @param indicatorId - The indicator ID
   * @param date - The date to query
   * @returns Array of decision attributions
   */
  async getDecisionAttributions(indicatorId: string, date: string): Promise<DecisionAttribution[]> {
    // Query decision attributions
    // Note: This assumes a decision_attributions table exists
    // If not, we'll return empty array and the table can be added later
    try {
      const rows = await this.db.execute<{
        id: string;
        decision_id: string;
        indicator_id: string;
        signal_value: number;
        contribution_weight: number;
        was_correct: number | null;
        created_at: string;
      }>(
        `SELECT id, decision_id, indicator_id, signal_value, contribution_weight, was_correct, created_at
         FROM decision_attributions
         WHERE indicator_id = ? AND DATE(created_at) = ?`,
        [indicatorId, date]
      );

      return rows.map((row) => ({
        id: row.id,
        decisionId: row.decision_id,
        indicatorId: row.indicator_id,
        signalValue: row.signal_value,
        contributionWeight: row.contribution_weight,
        wasCorrect: row.was_correct === null ? null : row.was_correct === 1,
        createdAt: row.created_at,
      }));
    } catch {
      // Table might not exist yet, return empty array
      return [];
    }
  }

  /**
   * Update decision outcome (mark as correct or incorrect).
   *
   * @param decisionId - The decision ID
   * @param wasCorrect - Whether the decision was correct
   */
  async updateDecisionOutcome(decisionId: string, wasCorrect: boolean): Promise<void> {
    await this.db.run(`UPDATE decision_attributions SET was_correct = ? WHERE decision_id = ?`, [
      wasCorrect ? 1 : 0,
      decisionId,
    ]);
  }

  // ============================================
  // Bulk Operations
  // ============================================

  /**
   * Run daily monitoring for all production indicators.
   *
   * @param indicators - Array of indicator IDs
   * @param signalsByIndicator - Map of indicator ID to signals (symbol -> value)
   * @param outcomes - Map of symbol to forward return
   * @param date - Date for the metrics
   */
  async runDailyMonitoring(
    indicators: string[],
    signalsByIndicator: Map<string, Map<string, number>>,
    outcomes: Map<string, number>,
    date: string = today()
  ): Promise<Map<string, DailyICMetrics>> {
    const results = new Map<string, DailyICMetrics>();

    for (const indicatorId of indicators) {
      const signals = signalsByIndicator.get(indicatorId);
      if (signals) {
        const metrics = await this.computeDailyMetrics(indicatorId, signals, outcomes, date);
        results.set(indicatorId, metrics);
      }
    }

    return results;
  }

  /**
   * Get health summary for all production indicators.
   *
   * @param indicatorIds - Array of indicator IDs to check
   * @returns Array of rolling metrics for each indicator
   */
  async getHealthSummary(indicatorIds: string[]): Promise<RollingMetrics[]> {
    const results: RollingMetrics[] = [];

    for (const id of indicatorIds) {
      const metrics = await this.computeRollingMetrics(id);
      results.push(metrics);
    }

    return results;
  }

  /**
   * Get retirement candidates.
   *
   * @param indicatorIds - Array of indicator IDs to check
   * @returns Array of retirement checks for candidates
   */
  async getRetirementCandidates(indicatorIds: string[]): Promise<RetirementCheck[]> {
    const candidates: RetirementCheck[] = [];

    for (const id of indicatorIds) {
      const check = await this.checkRetirementConditions(id);
      if (check.recommendedAction !== "none") {
        candidates.push(check);
      }
    }

    return candidates;
  }
}
