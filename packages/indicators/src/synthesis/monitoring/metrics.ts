/**
 * Indicator Monitoring Metrics
 *
 * Functions for computing daily and rolling IC metrics.
 */

import type { TursoClient } from "@cream/storage";
import { crossSectionalIC, spearmanCorrelation } from "../ic.js";
import { generateId, mean, std, sum, today } from "./helpers.js";
import type { DailyICMetrics, DecisionAttribution, RollingMetrics } from "./types.js";
import { MONITORING_DEFAULTS } from "./types.js";

// ============================================
// IC Computation
// ============================================

/**
 * Compute IC standard deviation using bootstrap.
 */
export function computeICStd(signals: number[], outcomes: number[]): number {
  if (signals.length < 5) {
    return 0;
  }

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

// ============================================
// Daily Metrics
// ============================================

/**
 * Compute daily IC metrics for an indicator.
 *
 * @param signals - Map of symbol to signal value for today
 * @param outcomes - Map of symbol to forward return (outcome)
 * @param indicatorId - The indicator ID
 * @param decisionAttributions - Decision attributions for the day
 * @returns Daily IC metrics
 */
export function computeDailyICMetrics(
  signals: Map<string, number>,
  outcomes: Map<string, number>,
  indicatorId: string,
  decisionAttributions: DecisionAttribution[]
): DailyICMetrics {
  const alignedSignals: number[] = [];
  const alignedOutcomes: number[] = [];

  for (const [symbol, signal] of signals) {
    const outcome = outcomes.get(symbol);
    if (outcome !== undefined) {
      alignedSignals.push(signal);
      alignedOutcomes.push(outcome);
    }
  }

  const icResult = crossSectionalIC(alignedSignals, alignedOutcomes);
  const correctDecisions = decisionAttributions.filter((d) => d.wasCorrect === true).length;

  return {
    indicatorId,
    date: today(),
    icValue: icResult.ic,
    icStd: computeICStd(alignedSignals, alignedOutcomes),
    nObservations: icResult.nObservations,
    decisionsUsedIn: decisionAttributions.length,
    decisionsCorrect: correctDecisions,
  };
}

/**
 * Store daily metrics in the database.
 */
export async function storeDailyMetrics(db: TursoClient, metrics: DailyICMetrics): Promise<void> {
  await db.run(
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
 * @param db - Database client
 * @param indicatorId - The indicator ID
 * @param days - Number of recent days to retrieve
 * @returns Array of IC history entries (newest first)
 */
export async function getICHistory(
  db: TursoClient,
  indicatorId: string,
  days: number = MONITORING_DEFAULTS.rollingWindowDays
): Promise<DailyICMetrics[]> {
  const rows = await db.execute<{
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
    nObservations: 0,
    decisionsUsedIn: row.decisions_used_in,
    decisionsCorrect: row.decisions_correct,
  }));
}

// ============================================
// Rolling Metrics
// ============================================

/**
 * Compute health status from IC and hit rate values.
 */
export function computeHealthStatus(
  ic30Day: number,
  hitRate: number
): "healthy" | "degraded" | "critical" {
  if (ic30Day >= MONITORING_DEFAULTS.minHealthyIC && hitRate >= MONITORING_DEFAULTS.minHitRate) {
    return "healthy";
  }
  if (
    ic30Day >= MONITORING_DEFAULTS.minHealthyIC / 2 ||
    hitRate >= MONITORING_DEFAULTS.minHitRate - 0.05
  ) {
    return "degraded";
  }
  return "critical";
}

/**
 * Compute rolling metrics from IC history.
 *
 * @param indicatorId - The indicator ID
 * @param history - Array of daily IC metrics
 * @returns Rolling performance metrics
 */
export function computeRollingMetricsFromHistory(
  indicatorId: string,
  history: DailyICMetrics[]
): RollingMetrics {
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

  const health = computeHealthStatus(ic30Day, hitRate);

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
