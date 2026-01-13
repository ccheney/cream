/**
 * Mastra Check Indicator Trigger Tool Definition
 *
 * Tool for evaluating indicator synthesis triggers during the Orient phase
 * of the OODA loop. Uses trigger conditions from @cream/indicators to determine
 * if dynamic indicator generation should be initiated.
 *
 * @see docs/plans/36-dynamic-indicator-synthesis-workflow.md - Phase 1, Step 1.1
 * @see docs/plans/19-dynamic-indicator-synthesis.md - Trigger criteria
 */

import {
  createTriggerConditions,
  evaluateTriggerConditions,
  type ICHistoryEntry,
  type TriggerConditions,
} from "@cream/indicators";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

// ============================================
// Input Schema
// ============================================

/**
 * IC (Information Coefficient) history entry schema
 */
const ICHistoryEntrySchema = z.object({
  date: z.string().describe("Date string in YYYY-MM-DD format"),
  icValue: z.number().describe("IC value for that date"),
});

/**
 * Input schema for checking indicator trigger conditions
 *
 * Trigger criteria (from docs/plans/19-dynamic-indicator-synthesis.md):
 * - Regime gap detected OR sustained underperformance (IC < 0.02 for 5+ days)
 * - Minimum 30 days since last indicator generation attempt
 * - Closest existing indicator similarity < 0.7
 * - Indicator portfolio under capacity (max 20 indicators)
 */
export const CheckIndicatorTriggerInputSchema = z.object({
  regimeGapDetected: z
    .boolean()
    .describe("Whether a regime gap was detected (current regime lacks indicator coverage)"),
  currentRegime: z
    .string()
    .describe("Current market regime label (e.g., BULL_TREND, BEAR_TREND, RANGE, HIGH_VOL)"),
  regimeGapDetails: z.string().optional().describe("Details about the regime gap if detected"),
  closestIndicatorSimilarity: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Similarity score of closest matching indicator (0-1, default 1.0)"),
  icHistory: z
    .array(ICHistoryEntrySchema)
    .describe("IC history entries (newest first) for calculating rolling IC and decay"),
  lastAttemptAt: z
    .string()
    .nullable()
    .optional()
    .describe("ISO timestamp of last generation attempt (null if never attempted)"),
  activeIndicatorCount: z
    .number()
    .int()
    .min(0)
    .describe("Current count of active indicators in the portfolio"),
  maxIndicatorCapacity: z
    .number()
    .int()
    .positive()
    .optional()
    .default(20)
    .describe("Maximum indicator capacity (defaults to 20)"),
});

export type CheckIndicatorTriggerInput = z.infer<typeof CheckIndicatorTriggerInputSchema>;

// ============================================
// Output Schema
// ============================================

/**
 * Computed trigger conditions for the output
 */
const TriggerConditionsSchema = z.object({
  regimeGapDetected: z.boolean().describe("Whether a regime gap was detected"),
  currentRegime: z.string().describe("Current market regime"),
  regimeGapDetails: z.string().optional().describe("Regime gap details if any"),
  closestIndicatorSimilarity: z.number().describe("Closest indicator similarity score (0-1)"),
  rollingIC30Day: z.number().describe("Rolling 30-day IC average"),
  icDecayDays: z.number().describe("Number of consecutive days of IC decay"),
  existingIndicatorsUnderperforming: z
    .boolean()
    .describe("Whether existing indicators are underperforming (IC < 0.02 for 5+ days)"),
  daysSinceLastAttempt: z.number().describe("Days since last generation attempt"),
  activeIndicatorCount: z.number().describe("Number of active indicators"),
  maxIndicatorCapacity: z.number().describe("Maximum indicator capacity"),
});

/**
 * Output schema for indicator trigger check
 */
export const CheckIndicatorTriggerOutputSchema = z.object({
  shouldTrigger: z.boolean().describe("Whether indicator generation should be triggered"),
  triggerReason: z
    .string()
    .nullable()
    .describe("The reason for triggering (or null if not triggered)"),
  conditions: TriggerConditionsSchema.describe("The computed trigger conditions"),
  summary: z.string().describe("Human-readable summary of the evaluation"),
  recommendation: z.string().describe("Actionable recommendation for the Orient agent"),
});

export type CheckIndicatorTriggerOutput = z.infer<typeof CheckIndicatorTriggerOutputSchema>;

// ============================================
// Tool Definition
// ============================================

/**
 * Create the checkIndicatorTrigger tool
 *
 * This tool evaluates whether conditions warrant triggering autonomous
 * indicator synthesis. It's designed to be called during the Orient phase
 * of the OODA loop.
 *
 * @example
 * ```typescript
 * const tool = createCheckIndicatorTriggerTool();
 * const result = await tool.execute({
 *   regimeGapDetected: true,
 *   currentRegime: "HIGH_VOL",
 *   icHistory: [{ date: "2024-01-15", icValue: 0.015 }, ...],
 *   activeIndicatorCount: 12,
 * });
 *
 * if (result.shouldTrigger) {
 *   // Launch indicator synthesis workflow
 * }
 * ```
 */
export function createCheckIndicatorTriggerTool() {
  return createTool({
    id: "check_indicator_trigger",
    description: `Check if conditions warrant triggering autonomous indicator synthesis.

This tool evaluates multiple trigger conditions for the Dynamic Indicator Synthesis pipeline:

**Trigger Conditions (any one required):**
1. **Regime Gap**: Current market regime lacks indicator coverage
2. **Underperformance**: IC < 0.02 sustained for 5+ consecutive days

**Blocking Conditions (all must pass):**
1. **Cooldown Period**: 30+ days since last generation attempt
2. **Similarity Check**: Closest existing indicator < 0.7 similarity
3. **Capacity Check**: Portfolio under max indicator capacity (default 20)

Use this during the Orient phase to decide if indicator synthesis should be initiated.
Returns detailed conditions and a recommendation for next steps.`,
    inputSchema: CheckIndicatorTriggerInputSchema,
    outputSchema: CheckIndicatorTriggerOutputSchema,
    execute: async (inputData) => {
      const {
        regimeGapDetected,
        currentRegime,
        regimeGapDetails,
        closestIndicatorSimilarity,
        icHistory,
        lastAttemptAt,
        activeIndicatorCount,
        maxIndicatorCapacity,
      } = inputData;

      // Transform input to TriggerConditionsInput format
      const triggerInput = {
        regimeGapDetected,
        currentRegime,
        regimeGapDetails,
        closestIndicatorSimilarity,
        icHistory: icHistory as ICHistoryEntry[],
        lastAttemptAt,
        activeIndicatorCount,
        maxIndicatorCapacity,
      };

      // Create computed conditions using the indicators package
      const conditions: TriggerConditions = createTriggerConditions(triggerInput);

      // Evaluate trigger conditions
      const evaluation = evaluateTriggerConditions(conditions);

      // Determine trigger reason
      let triggerReason: string | null = null;
      if (evaluation.shouldTrigger) {
        if (conditions.regimeGapDetected) {
          triggerReason = `Regime gap detected: ${conditions.currentRegime}${conditions.regimeGapDetails ? ` - ${conditions.regimeGapDetails}` : ""}`;
        } else if (conditions.existingIndicatorsUnderperforming) {
          triggerReason = `Sustained underperformance: IC ${conditions.rollingIC30Day.toFixed(4)} < 0.02 for ${conditions.icDecayDays}+ days`;
        }
      }

      // Build actionable recommendation
      let recommendation: string;
      if (evaluation.shouldTrigger) {
        recommendation = `Launch indicator synthesis workflow targeting ${conditions.currentRegime} regime. ${triggerReason}`;
      } else if (conditions.daysSinceLastAttempt < 30) {
        const daysRemaining = 30 - conditions.daysSinceLastAttempt;
        recommendation = `Wait ${daysRemaining} more day(s) before next synthesis attempt (cooldown active)`;
      } else if (conditions.activeIndicatorCount >= conditions.maxIndicatorCapacity) {
        recommendation = `Retire underperforming indicators before creating new ones (capacity: ${conditions.activeIndicatorCount}/${conditions.maxIndicatorCapacity})`;
      } else if (conditions.closestIndicatorSimilarity >= 0.7) {
        recommendation = `Existing indicators are sufficient (similarity: ${conditions.closestIndicatorSimilarity.toFixed(2)}). Consider refinement instead of new synthesis.`;
      } else {
        recommendation = "Continue monitoring. No action required at this time.";
      }

      return {
        shouldTrigger: evaluation.shouldTrigger,
        triggerReason,
        conditions: {
          regimeGapDetected: conditions.regimeGapDetected,
          currentRegime: conditions.currentRegime,
          regimeGapDetails: conditions.regimeGapDetails,
          closestIndicatorSimilarity: conditions.closestIndicatorSimilarity,
          rollingIC30Day: conditions.rollingIC30Day,
          icDecayDays: conditions.icDecayDays,
          existingIndicatorsUnderperforming: conditions.existingIndicatorsUnderperforming,
          daysSinceLastAttempt: conditions.daysSinceLastAttempt,
          activeIndicatorCount: conditions.activeIndicatorCount,
          maxIndicatorCapacity: conditions.maxIndicatorCapacity,
        },
        summary: evaluation.summary,
        recommendation,
      };
    },
  });
}
