/**
 * Check Indicator Trigger Tool
 *
 * Evaluates whether conditions warrant new indicator generation
 * during the OODA loop Orient phase.
 *
 * @see docs/plans/19-dynamic-indicator-synthesis.md (lines 216-272)
 */

import {
  createTriggerConditions,
  evaluateTriggerConditions,
  type ICHistoryEntry,
  type TriggerEvaluationResult,
} from "@cream/indicators";

// ============================================
// Tool Types
// ============================================

/**
 * Input parameters for the check-indicator-trigger tool
 */
export interface CheckIndicatorTriggerInput {
  /** Current market regime label */
  currentRegime: string;
  /** Whether a regime gap was detected */
  regimeGapDetected: boolean;
  /** Details about the regime gap (if any) */
  regimeGapDetails?: string;
  /** Similarity score of closest matching indicator (0-1) */
  closestIndicatorSimilarity?: number;
  /** IC history entries (newest first) */
  icHistory: ICHistoryEntry[];
  /** ISO timestamp of last generation attempt (null if never attempted) */
  lastAttemptAt?: string | null;
  /** Current count of active indicators */
  activeIndicatorCount: number;
  /** Maximum indicator capacity (defaults to 20) */
  maxIndicatorCapacity?: number;
}

/**
 * Output from the check-indicator-trigger tool
 */
export interface CheckIndicatorTriggerOutput {
  /** Whether indicator generation should be triggered */
  shouldTrigger: boolean;
  /** Detailed evaluation result */
  evaluation: TriggerEvaluationResult;
  /** Human-readable recommendation */
  recommendation: string;
}

// ============================================
// Tool Implementation
// ============================================

/**
 * Check whether conditions warrant new indicator generation.
 *
 * This tool evaluates multiple conditions:
 * 1. Regime gap detected - current regime lacks indicator coverage
 * 2. Sustained underperformance - rolling IC below threshold
 * 3. IC decay - declining performance over consecutive days
 * 4. Cooldown respected - minimum time since last attempt
 * 5. Capacity available - under indicator limit
 *
 * @param input - The trigger check parameters
 * @returns Evaluation result with recommendation
 *
 * @example
 * ```typescript
 * const result = await checkIndicatorTrigger({
 *   currentRegime: "HIGH_VOL",
 *   regimeGapDetected: true,
 *   regimeGapDetails: "Missing volatility cluster indicators",
 *   icHistory: [
 *     { date: "2026-01-07", icValue: 0.015 },
 *     { date: "2026-01-06", icValue: 0.018 },
 *   ],
 *   lastAttemptAt: "2025-11-15T10:00:00Z",
 *   activeIndicatorCount: 12,
 * });
 *
 * if (result.shouldTrigger) {
 *   console.log(result.recommendation);
 *   // => "Indicator generation warranted: Missing volatility cluster indicators"
 * }
 * ```
 */
export async function checkIndicatorTrigger(
  input: CheckIndicatorTriggerInput
): Promise<CheckIndicatorTriggerOutput> {
  // Create conditions object from inputs
  const conditions = createTriggerConditions({
    regimeGapDetected: input.regimeGapDetected,
    currentRegime: input.currentRegime,
    regimeGapDetails: input.regimeGapDetails,
    closestIndicatorSimilarity: input.closestIndicatorSimilarity,
    icHistory: input.icHistory,
    lastAttemptAt: input.lastAttemptAt,
    activeIndicatorCount: input.activeIndicatorCount,
    maxIndicatorCapacity: input.maxIndicatorCapacity,
  });

  // Evaluate all conditions
  const evaluation = evaluateTriggerConditions(conditions);

  // Generate human-readable recommendation
  const recommendation = generateRecommendation(evaluation, input);

  return {
    shouldTrigger: evaluation.shouldTrigger,
    evaluation,
    recommendation,
  };
}

// ============================================
// Recommendation Generator
// ============================================

/**
 * Generate a human-readable recommendation based on the evaluation.
 */
function generateRecommendation(
  evaluation: TriggerEvaluationResult,
  input: CheckIndicatorTriggerInput
): string {
  const { conditions } = evaluation;

  // Generation warranted
  if (evaluation.shouldTrigger) {
    const details = input.regimeGapDetails ?? `for ${input.currentRegime} regime`;
    return (
      `Indicator generation warranted: ${details}. ` +
      `Rolling IC: ${conditions.rollingIC30Day.toFixed(4)}, ` +
      `IC decay: ${conditions.icDecayDays} days.`
    );
  }

  // Check specific blocking conditions

  // Cooldown active
  if (conditions.daysSinceLastAttempt < 30) {
    const remaining = 30 - conditions.daysSinceLastAttempt;
    return (
      `Cooldown active: ${remaining} day${remaining !== 1 ? "s" : ""} remaining. ` +
      `Last attempt was ${conditions.daysSinceLastAttempt} days ago.`
    );
  }

  // IC healthy
  if (conditions.rollingIC30Day >= 0.02 && !conditions.existingIndicatorsUnderperforming) {
    return (
      `Portfolio IC healthy at ${conditions.rollingIC30Day.toFixed(4)}, ` +
      `no generation needed. ` +
      `Indicators are performing adequately.`
    );
  }

  // Capacity full
  if (conditions.activeIndicatorCount >= conditions.maxIndicatorCapacity) {
    return (
      `Indicator capacity reached (${conditions.activeIndicatorCount}/${conditions.maxIndicatorCapacity}). ` +
      `Consider retiring underperforming indicators before generating new ones.`
    );
  }

  // No regime gap
  if (!conditions.regimeGapDetected) {
    return (
      `No regime gap detected for ${input.currentRegime} regime. ` +
      `Existing indicators provide adequate coverage.`
    );
  }

  // IC decay insufficient
  if (conditions.icDecayDays < 5) {
    return (
      `IC decay insufficient (${conditions.icDecayDays} days). ` +
      `Need 5+ consecutive days of underperformance to trigger generation.`
    );
  }

  // Default fallback
  return evaluation.summary;
}

export default checkIndicatorTrigger;
