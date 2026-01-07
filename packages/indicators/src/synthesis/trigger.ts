/**
 * Trigger Condition Detection Module
 *
 * Determines when new indicator generation should be attempted based on
 * multiple conditions that must ALL be true:
 * 1. Regime gap detected - existing indicators don't cover current market regime
 * 2. Sustained underperformance - rolling IC below threshold
 * 3. Cooldown respected - minimum days since last generation attempt
 * 4. Capacity available - under maximum active indicator limit
 *
 * @see docs/plans/19-dynamic-indicator-synthesis.md (lines 174-214)
 */

import { z } from "zod";

// ============================================
// Configuration
// ============================================

/**
 * Default configuration values for trigger detection
 */
export const TRIGGER_DEFAULTS = {
  /** Minimum IC threshold (below this indicates underperformance) */
  minRollingIC: 0.02,
  /** Minimum consecutive days of IC decay to trigger */
  minICDecayDays: 5,
  /** Minimum days between generation attempts */
  cooldownDays: 30,
  /** Maximum number of active indicators */
  maxIndicatorCapacity: 20,
  /** Rolling window for IC calculation (days) */
  icRollingWindowDays: 30,
} as const;

// ============================================
// Schemas
// ============================================

/**
 * Trigger conditions evaluation result
 */
export const TriggerConditionsSchema = z.object({
  // Regime gap analysis
  /** Whether a coverage gap was detected for current regime */
  regimeGapDetected: z.boolean(),
  /** Current market regime label */
  currentRegime: z.string().optional(),
  /** Details about the gap (e.g., missing indicator categories) */
  regimeGapDetails: z.string().optional(),
  /** Similarity score of closest matching indicator (0-1) */
  closestIndicatorSimilarity: z.number().min(0).max(1).optional(),

  // Performance metrics
  /** Whether existing indicators are underperforming */
  existingIndicatorsUnderperforming: z.boolean(),
  /** Rolling 30-day IC across portfolio */
  rollingIC30Day: z.number(),
  /** Number of consecutive days with declining/low IC */
  icDecayDays: z.number().int().min(0),

  // Cooldown
  /** Days since last generation attempt */
  daysSinceLastAttempt: z.number().int().min(0),
  /** ISO 8601 timestamp of last attempt */
  lastAttemptAt: z.string().optional(),

  // Capacity
  /** Current number of active indicators */
  activeIndicatorCount: z.number().int().min(0),
  /** Maximum allowed active indicators */
  maxIndicatorCapacity: z.number().int().min(1).default(TRIGGER_DEFAULTS.maxIndicatorCapacity),

  // Evaluation metadata
  /** When this evaluation was performed */
  evaluatedAt: z.string(),
});

export type TriggerConditions = z.infer<typeof TriggerConditionsSchema>;

/**
 * Trigger evaluation result
 */
export const TriggerEvaluationResultSchema = z.object({
  /** Whether generation should be triggered */
  shouldTrigger: z.boolean(),
  /** The evaluated conditions */
  conditions: TriggerConditionsSchema,
  /** Reasons for the decision */
  reasons: z.array(z.string()),
  /** Summary message */
  summary: z.string(),
});

export type TriggerEvaluationResult = z.infer<typeof TriggerEvaluationResultSchema>;

/**
 * IC history entry for decay analysis
 */
export const ICHistoryEntrySchema = z.object({
  /** Date (ISO 8601 date string) */
  date: z.string(),
  /** IC value for that date */
  icValue: z.number(),
});

export type ICHistoryEntry = z.infer<typeof ICHistoryEntrySchema>;

// ============================================
// Core Logic
// ============================================

/**
 * Evaluate whether indicator generation should be triggered.
 *
 * ALL conditions must be met for generation to trigger:
 * 1. Regime gap detected
 * 2. Existing indicators underperforming (rolling IC < 0.02)
 * 3. IC decay for 5+ consecutive days
 * 4. Cooldown of 30+ days since last attempt
 * 5. Under capacity limit
 *
 * @param conditions - The evaluated trigger conditions
 * @returns Whether generation should be triggered
 */
export function shouldTriggerGeneration(conditions: TriggerConditions): boolean {
  return (
    conditions.regimeGapDetected &&
    conditions.existingIndicatorsUnderperforming &&
    conditions.rollingIC30Day < TRIGGER_DEFAULTS.minRollingIC &&
    conditions.icDecayDays >= TRIGGER_DEFAULTS.minICDecayDays &&
    conditions.daysSinceLastAttempt >= TRIGGER_DEFAULTS.cooldownDays &&
    conditions.activeIndicatorCount < conditions.maxIndicatorCapacity
  );
}

/**
 * Evaluate trigger conditions and provide detailed reasoning.
 *
 * @param conditions - The evaluated trigger conditions
 * @returns Detailed evaluation result with reasons
 */
export function evaluateTriggerConditions(conditions: TriggerConditions): TriggerEvaluationResult {
  const reasons: string[] = [];
  const failures: string[] = [];

  // Check each condition
  if (conditions.regimeGapDetected) {
    reasons.push(
      `Regime gap detected for ${conditions.currentRegime ?? "unknown"} regime` +
        (conditions.regimeGapDetails ? `: ${conditions.regimeGapDetails}` : "")
    );
  } else {
    failures.push("No regime gap detected - existing indicators provide adequate coverage");
  }

  if (conditions.existingIndicatorsUnderperforming) {
    reasons.push(
      `Indicators underperforming: rolling IC = ${conditions.rollingIC30Day.toFixed(4)}`
    );
  } else {
    failures.push(
      `Indicators performing adequately: rolling IC = ${conditions.rollingIC30Day.toFixed(4)} ` +
        `(threshold: < ${TRIGGER_DEFAULTS.minRollingIC})`
    );
  }

  if (conditions.icDecayDays >= TRIGGER_DEFAULTS.minICDecayDays) {
    reasons.push(`IC decay sustained for ${conditions.icDecayDays} consecutive days`);
  } else {
    failures.push(
      `IC decay insufficient: ${conditions.icDecayDays} days ` +
        `(need >= ${TRIGGER_DEFAULTS.minICDecayDays})`
    );
  }

  if (conditions.daysSinceLastAttempt >= TRIGGER_DEFAULTS.cooldownDays) {
    reasons.push(`Cooldown satisfied: ${conditions.daysSinceLastAttempt} days since last attempt`);
  } else {
    failures.push(
      `Cooldown not met: ${conditions.daysSinceLastAttempt} days since last attempt ` +
        `(need >= ${TRIGGER_DEFAULTS.cooldownDays})`
    );
  }

  if (conditions.activeIndicatorCount < conditions.maxIndicatorCapacity) {
    reasons.push(
      `Capacity available: ${conditions.activeIndicatorCount}/${conditions.maxIndicatorCapacity} indicators active`
    );
  } else {
    failures.push(
      `At capacity: ${conditions.activeIndicatorCount}/${conditions.maxIndicatorCapacity} indicators active`
    );
  }

  const shouldTrigger = shouldTriggerGeneration(conditions);

  const summary = shouldTrigger
    ? `Generation triggered: All ${reasons.length} conditions met`
    : `Generation blocked: ${failures.length} condition(s) not met`;

  return {
    shouldTrigger,
    conditions,
    reasons: shouldTrigger ? reasons : failures,
    summary,
  };
}

// ============================================
// Helper Functions
// ============================================

/**
 * Calculate the number of consecutive days with IC decay.
 *
 * IC decay is defined as IC below threshold OR declining from previous day.
 *
 * @param icHistory - Array of IC history entries (newest first)
 * @param threshold - IC threshold (default: 0.02)
 * @returns Number of consecutive decay days
 */
export function calculateICDecayDays(
  icHistory: ICHistoryEntry[],
  threshold: number = TRIGGER_DEFAULTS.minRollingIC
): number {
  if (icHistory.length === 0) {
    return 0;
  }

  let consecutiveDays = 0;

  for (let i = 0; i < icHistory.length; i++) {
    const current = icHistory[i];
    if (!current) {
      break;
    }

    const previous = icHistory[i + 1];

    // Check if current IC is below threshold
    const belowThreshold = current.icValue < threshold;

    // Check if IC is declining from previous day
    const declining = previous !== undefined && current.icValue < previous.icValue;

    if (belowThreshold || declining) {
      consecutiveDays++;
    } else {
      // Streak broken
      break;
    }
  }

  return consecutiveDays;
}

/**
 * Calculate rolling IC over a window of days.
 *
 * @param icHistory - Array of IC history entries
 * @param windowDays - Number of days for rolling window
 * @returns Average IC over the window, or 0 if insufficient data
 */
export function calculateRollingIC(
  icHistory: ICHistoryEntry[],
  windowDays: number = TRIGGER_DEFAULTS.icRollingWindowDays
): number {
  if (icHistory.length === 0) {
    return 0;
  }

  const windowEntries = icHistory.slice(0, windowDays);

  if (windowEntries.length === 0) {
    return 0;
  }

  const sum = windowEntries.reduce((acc, entry) => acc + entry.icValue, 0);
  return sum / windowEntries.length;
}

/**
 * Calculate days since a given timestamp.
 *
 * @param timestamp - ISO 8601 timestamp
 * @param now - Current time (defaults to now)
 * @returns Number of days since timestamp
 */
export function daysSince(timestamp: string | null | undefined, now: Date = new Date()): number {
  if (!timestamp) {
    return Number.MAX_SAFE_INTEGER; // No previous attempt = infinite days
  }

  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Determine if indicators are underperforming based on IC.
 *
 * @param rollingIC - Current rolling IC value
 * @param icDecayDays - Number of consecutive decay days
 * @returns Whether indicators are considered underperforming
 */
export function isUnderperforming(rollingIC: number, icDecayDays: number): boolean {
  return (
    rollingIC < TRIGGER_DEFAULTS.minRollingIC || icDecayDays >= TRIGGER_DEFAULTS.minICDecayDays
  );
}

/**
 * Create a trigger conditions object for evaluation.
 *
 * This is a helper to construct the conditions object from various inputs.
 *
 * @param params - Individual condition parameters
 * @returns TriggerConditions object
 */
export function createTriggerConditions(params: {
  regimeGapDetected: boolean;
  currentRegime?: string;
  regimeGapDetails?: string;
  closestIndicatorSimilarity?: number;
  icHistory: ICHistoryEntry[];
  lastAttemptAt?: string | null;
  activeIndicatorCount: number;
  maxIndicatorCapacity?: number;
  evaluatedAt?: string;
}): TriggerConditions {
  const evaluatedAt = params.evaluatedAt ?? new Date().toISOString();
  const rollingIC30Day = calculateRollingIC(params.icHistory);
  const icDecayDays = calculateICDecayDays(params.icHistory);
  const daysFromLastAttempt = daysSince(params.lastAttemptAt, new Date(evaluatedAt));

  return {
    regimeGapDetected: params.regimeGapDetected,
    currentRegime: params.currentRegime,
    regimeGapDetails: params.regimeGapDetails,
    closestIndicatorSimilarity: params.closestIndicatorSimilarity,
    existingIndicatorsUnderperforming: isUnderperforming(rollingIC30Day, icDecayDays),
    rollingIC30Day,
    icDecayDays,
    daysSinceLastAttempt: daysFromLastAttempt,
    lastAttemptAt: params.lastAttemptAt ?? undefined,
    activeIndicatorCount: params.activeIndicatorCount,
    maxIndicatorCapacity: params.maxIndicatorCapacity ?? TRIGGER_DEFAULTS.maxIndicatorCapacity,
    evaluatedAt,
  };
}
