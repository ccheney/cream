/**
 * Indicator Retirement Condition Checking
 *
 * Functions for evaluating whether indicators should be retired.
 */

import { mean, sum } from "./helpers.js";
import type {
  DailyICMetrics,
  RetirementCheck,
  RetirementCheckOptions,
  RetirementReason,
} from "./types.js";
import { MONITORING_DEFAULTS } from "./types.js";

/**
 * Count consecutive days with IC below threshold.
 */
export function countConsecutiveLowICDays(history: DailyICMetrics[]): number {
  let count = 0;
  for (const entry of history) {
    if (entry.icValue < MONITORING_DEFAULTS.minHealthyIC) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

/**
 * Detect if an indicator signal has become crowded (public knowledge).
 *
 * This is a placeholder that returns false. In production, this would:
 * 1. Search news for similar indicators/factors
 * 2. Query HelixDB for semantically similar public indicators
 * 3. Check if signal appears in competitor research
 *
 * @param _indicatorId - The indicator ID to check
 * @returns Whether the signal appears crowded
 */
export async function detectCrowding(_indicatorId: string): Promise<boolean> {
  return false;
}

/**
 * Evaluate retirement conditions from IC history.
 *
 * Checks three retirement conditions:
 * 1. IC Decay - Rolling IC below threshold for extended period
 * 2. Crowding - Signal became public knowledge (requires external detection)
 * 3. Capacity - Too many active indicators
 *
 * @param indicatorId - The indicator ID
 * @param history - IC history for the indicator
 * @param options - Optional parameters for capacity/crowding checking
 * @param isCrowded - Whether crowding was detected
 * @returns Retirement check result
 */
export function evaluateRetirementConditions(
  indicatorId: string,
  history: DailyICMetrics[],
  options: RetirementCheckOptions,
  isCrowded: boolean
): RetirementCheck {
  const { activeIndicatorCount = 0, maxCapacity = 20 } = options;

  if (history.length === 0) {
    return {
      indicatorId,
      shouldRetire: false,
      consecutiveLowICDays: 0,
      avgIC30Day: 0,
      hitRate: 0,
      isCrowded: false,
      activeIndicatorCount,
      recommendedAction: "monitor",
      reason: "Insufficient data for retirement evaluation",
    };
  }

  const consecutiveLowICDays = countConsecutiveLowICDays(history);
  const icValues = history.map((h) => h.icValue);
  const avgIC30Day = mean(icValues);

  const decisionsTotal = sum(history.map((h) => h.decisionsUsedIn));
  const decisionsCorrect = sum(history.map((h) => h.decisionsCorrect));
  const hitRate = decisionsTotal > 0 ? decisionsCorrect / decisionsTotal : 0;

  const icDecayRetire =
    consecutiveLowICDays >= MONITORING_DEFAULTS.retirementThresholdDays &&
    avgIC30Day < MONITORING_DEFAULTS.minHealthyIC;
  const capacityRetire = activeIndicatorCount > maxCapacity;

  const shouldRetire = icDecayRetire || isCrowded || capacityRetire;

  let recommendedAction: "none" | "monitor" | "retire";
  let reason: string | undefined;
  let retirementReason: RetirementReason | undefined;

  if (shouldRetire) {
    recommendedAction = "retire";
    if (isCrowded) {
      retirementReason = "crowding";
      reason = "Signal detected as crowded (public knowledge)";
    } else if (capacityRetire) {
      retirementReason = "capacity";
      reason = `Capacity exceeded: ${activeIndicatorCount} indicators (max: ${maxCapacity})`;
    } else {
      retirementReason = "ic_decay";
      reason = `IC below ${MONITORING_DEFAULTS.minHealthyIC} for ${consecutiveLowICDays} consecutive days`;
    }
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
    retirementReason,
    consecutiveLowICDays,
    avgIC30Day,
    hitRate,
    isCrowded,
    activeIndicatorCount,
    recommendedAction,
  };
}
