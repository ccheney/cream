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

export const TRIGGER_DEFAULTS = {
  minRollingIC: 0.02,
  minICDecayDays: 5,
  cooldownDays: 30,
  maxIndicatorCapacity: 20,
  icRollingWindowDays: 30,
} as const;

export const TriggerConditionsSchema = z.object({
  regimeGapDetected: z.boolean(),
  currentRegime: z.string().optional(),
  regimeGapDetails: z.string().optional(),
  closestIndicatorSimilarity: z.number().min(0).max(1).optional(),
  existingIndicatorsUnderperforming: z.boolean(),
  rollingIC30Day: z.number(),
  icDecayDays: z.number().int().min(0),
  daysSinceLastAttempt: z.number().int().min(0),
  lastAttemptAt: z.string().optional(),
  activeIndicatorCount: z.number().int().min(0),
  maxIndicatorCapacity: z.number().int().min(1).default(TRIGGER_DEFAULTS.maxIndicatorCapacity),
  evaluatedAt: z.string(),
});

export type TriggerConditions = z.infer<typeof TriggerConditionsSchema>;

export const TriggerEvaluationResultSchema = z.object({
  shouldTrigger: z.boolean(),
  conditions: TriggerConditionsSchema,
  reasons: z.array(z.string()),
  summary: z.string(),
});

export type TriggerEvaluationResult = z.infer<typeof TriggerEvaluationResultSchema>;

export const ICHistoryEntrySchema = z.object({
  date: z.string(),
  icValue: z.number(),
});

export type ICHistoryEntry = z.infer<typeof ICHistoryEntrySchema>;

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

export function evaluateTriggerConditions(conditions: TriggerConditions): TriggerEvaluationResult {
  const reasons: string[] = [];
  const failures: string[] = [];

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

/**
 * IC decay is defined as IC below threshold OR declining from previous day.
 * Expects icHistory with newest entries first.
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
    const belowThreshold = current.icValue < threshold;
    const declining = previous !== undefined && current.icValue < previous.icValue;

    if (belowThreshold || declining) {
      consecutiveDays++;
    } else {
      break;
    }
  }

  return consecutiveDays;
}

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

export function daysSince(timestamp: string | null | undefined, now: Date = new Date()): number {
  if (!timestamp) {
    // No previous attempt means cooldown is satisfied
    return Number.MAX_SAFE_INTEGER;
  }

  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export function isUnderperforming(rollingIC: number, icDecayDays: number): boolean {
  return (
    rollingIC < TRIGGER_DEFAULTS.minRollingIC || icDecayDays >= TRIGGER_DEFAULTS.minICDecayDays
  );
}

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
