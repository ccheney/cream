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
import {
  getDecisionAttributions,
  recordDecisionAttribution,
  updateDecisionOutcome,
} from "./attribution.js";
import { today } from "./helpers.js";
import {
  computeDailyICMetrics,
  computeRollingMetricsFromHistory,
  getICHistory,
  storeDailyMetrics,
} from "./metrics.js";
import { detectCrowding, evaluateRetirementConditions } from "./retirementCheck.js";
import type {
  DailyICMetrics,
  DecisionAttribution,
  RetirementCheck,
  RetirementCheckOptions,
  RollingMetrics,
} from "./types.js";
import { MONITORING_DEFAULTS } from "./types.js";

// Re-export helper functions for external use
export { computeHealthStatus, computeRollingMetricsFromHistory } from "./metrics.js";
export { detectCrowding, evaluateRetirementConditions } from "./retirementCheck.js";
// Re-export all types and schemas
export {
  type DailyICMetrics,
  DailyICMetricsSchema,
  type DecisionAttribution,
  DecisionAttributionSchema,
  MONITORING_DEFAULTS,
  type RetirementCheck,
  type RetirementCheckOptions,
  RetirementCheckSchema,
  type RetirementReason,
  RetirementReasonSchema,
  type RollingMetrics,
  RollingMetricsSchema,
} from "./types.js";

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
    const decisions = await this.getDecisionAttributions(indicatorId, date);

    const metrics = computeDailyICMetrics(signals, outcomes, indicatorId, decisions);
    const metricsWithDate = { ...metrics, date };

    await storeDailyMetrics(this.db, metricsWithDate);

    return metricsWithDate;
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
    return getICHistory(this.db, indicatorId, days);
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
    return computeRollingMetricsFromHistory(indicatorId, history);
  }

  // ============================================
  // Retirement Condition Checking
  // ============================================

  /**
   * Check whether an indicator should be considered for retirement.
   *
   * Checks three retirement conditions:
   * 1. IC Decay - Rolling IC below threshold for extended period
   * 2. Crowding - Signal became public knowledge (requires external detection)
   * 3. Capacity - Too many active indicators
   *
   * @param indicatorId - The indicator ID
   * @param options - Optional parameters for capacity checking
   * @returns Retirement check result
   */
  async checkRetirementConditions(
    indicatorId: string,
    options: RetirementCheckOptions = {}
  ): Promise<RetirementCheck> {
    const { checkCrowding = false } = options;

    const history = await this.getICHistory(
      indicatorId,
      MONITORING_DEFAULTS.retirementThresholdDays
    );

    const isCrowded = checkCrowding ? await detectCrowding(indicatorId) : false;

    return evaluateRetirementConditions(indicatorId, history, options, isCrowded);
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
    return recordDecisionAttribution(this.db, attribution);
  }

  /**
   * Get decision attributions for an indicator on a specific date.
   *
   * @param indicatorId - The indicator ID
   * @param date - The date to query
   * @returns Array of decision attributions
   */
  async getDecisionAttributions(indicatorId: string, date: string): Promise<DecisionAttribution[]> {
    return getDecisionAttributions(this.db, indicatorId, date);
  }

  /**
   * Update decision outcome (mark as correct or incorrect).
   *
   * @param decisionId - The decision ID
   * @param wasCorrect - Whether the decision was correct
   */
  async updateDecisionOutcome(decisionId: string, wasCorrect: boolean): Promise<void> {
    return updateDecisionOutcome(this.db, decisionId, wasCorrect);
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
