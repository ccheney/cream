/**
 * Mastra Research Trigger Tool Definitions
 *
 * Tools for triggering and monitoring autonomous research pipelines
 * from the Orient agent during OODA loops.
 *
 * @see docs/plans/20-research-to-production-pipeline.md - Phase 0: Trigger Detection
 */

import {
  type ResearchRun,
  type ResearchTrigger,
  ResearchTriggerDetectionTypeSchema,
  TriggerSeveritySchema,
} from "@cream/domain";
import type { FactorZooRepository } from "@cream/storage";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  createResearchTriggerService,
  type ResearchTriggerDependencies,
} from "../../services/research-trigger.js";

// ============================================
// Trigger Research Tool
// ============================================

/**
 * Input schema for triggering research
 */
export const TriggerResearchInputSchema = z.object({
  focus: z.string().min(10).describe("Research focus/hypothesis direction to investigate"),
  targetRegime: z
    .enum(["bull", "bear", "sideways", "volatile", "all"])
    .optional()
    .describe("Target market regime for the new factor (optional)"),
  replaceFactorId: z
    .string()
    .optional()
    .describe("Factor ID to replace if this is a refinement (optional)"),
  triggerType: z
    .enum(["manual", "decay_detected", "regime_change", "scheduled", "refinement"])
    .default("manual")
    .describe("Type of trigger initiating this research"),
});

export type TriggerResearchInput = z.infer<typeof TriggerResearchInputSchema>;

/**
 * Output schema for research trigger result
 */
export const TriggerResearchOutputSchema = z.object({
  success: z.boolean().describe("Whether the research pipeline was started"),
  runId: z.string().optional().describe("Research run ID if started"),
  hypothesisId: z.string().optional().describe("Generated hypothesis ID"),
  blocked: z.boolean().describe("Whether the request was blocked"),
  blockingReasons: z.array(z.string()).describe("Reasons if blocked"),
  message: z.string().describe("Human-readable status message"),
});

export type TriggerResearchOutput = z.infer<typeof TriggerResearchOutputSchema>;

/**
 * Factory function to create the trigger research tool with dependencies
 */
export function createTriggerResearchTool(factorZoo: FactorZooRepository) {
  const deps: ResearchTriggerDependencies = { factorZoo };
  const triggerService = createResearchTriggerService(deps);

  return createTool({
    id: "trigger_research",
    description: `Manually trigger a research pipeline to develop new alpha factors.

Use this tool when:
- A regime gap is detected (current market regime lacks factor coverage)
- Alpha decay is detected in existing factors (rolling IC declining)
- Performance degradation is observed (rolling Sharpe below threshold)
- Manual research is requested by the operator

The tool checks blocking conditions before starting:
- Cooldown period (7 days between research runs)
- Active research limit (max 2 concurrent pipelines)
- Factor Zoo capacity (max 30 active factors)
- Budget constraints

Returns a research run ID to track progress with check_research_status.`,
    inputSchema: TriggerResearchInputSchema,
    outputSchema: TriggerResearchOutputSchema,
    execute: async ({ context }) => {
      const { focus, targetRegime, replaceFactorId, triggerType } = context;

      // Check blocking conditions first
      const blockingCheck = await triggerService.checkBlockingConditions();

      if (blockingCheck.isBlocked) {
        return {
          success: false,
          blocked: true,
          blockingReasons: blockingCheck.reasons,
          message: `Research blocked: ${blockingCheck.reasons.join("; ")}`,
        };
      }

      try {
        // Generate hypothesis ID
        const hypothesisId = `hypo-${Date.now().toString(36)}`;
        const runId = `run-${Date.now().toString(36)}`;

        // Create research run record
        await factorZoo.createResearchRun({
          runId,
          triggerType,
          triggerReason: focus,
          phase: "idea",
          currentIteration: 1,
          hypothesisId,
          factorId: replaceFactorId ?? null,
          prUrl: null,
          errorMessage: null,
          tokensUsed: 0,
          computeHours: 0,
          completedAt: null,
        });

        // Create hypothesis record
        await factorZoo.createHypothesis({
          hypothesisId,
          title: focus.substring(0, 100),
          economicRationale: focus,
          marketMechanism: `Research triggered by ${triggerType}`,
          targetRegime: targetRegime ?? null,
          falsificationCriteria: null,
          status: "proposed",
          iteration: 1,
          parentHypothesisId: replaceFactorId
            ? ((await factorZoo.findFactorById(replaceFactorId))?.hypothesisId ?? null)
            : null,
        });

        return {
          success: true,
          runId,
          hypothesisId,
          blocked: false,
          blockingReasons: [],
          message: `Research pipeline started with run ID: ${runId}`,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          blocked: false,
          blockingReasons: [],
          message: `Failed to start research: ${errorMessage}`,
        };
      }
    },
  });
}

// ============================================
// Check Research Status Tool
// ============================================

/**
 * Input schema for checking research status
 */
export const CheckResearchStatusInputSchema = z.object({
  runId: z
    .string()
    .optional()
    .describe("Specific research run ID to check (optional - returns all active if omitted)"),
});

export type CheckResearchStatusInput = z.infer<typeof CheckResearchStatusInputSchema>;

/**
 * Research run status for output
 */
const ResearchRunStatusSchema = z.object({
  runId: z.string(),
  phase: z.string(),
  triggerType: z.string(),
  triggerReason: z.string(),
  hypothesisId: z.string().nullable(),
  factorId: z.string().nullable(),
  iteration: z.number(),
  tokensUsed: z.number(),
  computeHours: z.number(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  errorMessage: z.string().nullable(),
  prUrl: z.string().nullable(),
});

/**
 * Output schema for research status
 */
export const CheckResearchStatusOutputSchema = z.object({
  activeRuns: z.array(ResearchRunStatusSchema),
  totalActive: z.number(),
  recentCompleted: z.array(ResearchRunStatusSchema),
  message: z.string().describe("Human-readable summary"),
});

export type CheckResearchStatusOutput = z.infer<typeof CheckResearchStatusOutputSchema>;

/**
 * Factory function to create the check research status tool with dependencies
 */
export function createCheckResearchStatusTool(factorZoo: FactorZooRepository) {
  return createTool({
    id: "check_research_status",
    description: `Check the status of research pipelines.

Use this tool to:
- Monitor progress of triggered research runs
- Check if there are active research pipelines
- Review recently completed research runs
- Diagnose failed research attempts

Returns details about active and recent research runs including:
- Current phase (idea, implementation, stage1, stage2, translation, equivalence, paper, promotion)
- Token and compute usage
- Error messages if failed
- PR URL if promotion complete`,
    inputSchema: CheckResearchStatusInputSchema,
    outputSchema: CheckResearchStatusOutputSchema,
    execute: async ({ context }) => {
      const { runId } = context;

      try {
        // Get all active research runs
        const activeRuns = await factorZoo.findActiveResearchRuns();

        // Transform to output format
        const transformRun = (run: ResearchRun) => ({
          runId: run.runId,
          phase: run.phase,
          triggerType: run.triggerType,
          triggerReason: run.triggerReason,
          hypothesisId: run.hypothesisId,
          factorId: run.factorId,
          iteration: run.currentIteration,
          tokensUsed: run.tokensUsed,
          computeHours: run.computeHours,
          startedAt: run.startedAt,
          completedAt: run.completedAt,
          errorMessage: run.errorMessage,
          prUrl: run.prUrl,
        });

        // If specific run ID requested, filter to that
        if (runId) {
          const targetRun = activeRuns.find((r) => r.runId === runId);
          if (targetRun) {
            return {
              activeRuns: [transformRun(targetRun)],
              totalActive: activeRuns.length,
              recentCompleted: [],
              message: `Research run ${runId} is in phase: ${targetRun.phase}`,
            };
          }
          // Run not found in active - could be completed
          return {
            activeRuns: [],
            totalActive: activeRuns.length,
            recentCompleted: [],
            message: `Research run ${runId} not found in active runs`,
          };
        }

        // Return all active runs
        const transformedActive = activeRuns.map(transformRun);

        const message =
          activeRuns.length === 0
            ? "No active research pipelines"
            : `${activeRuns.length} active research pipeline(s): ${activeRuns.map((r) => `${r.runId} (${r.phase})`).join(", ")}`;

        return {
          activeRuns: transformedActive,
          totalActive: activeRuns.length,
          recentCompleted: [], // Could query for recently completed if needed
          message,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          activeRuns: [],
          totalActive: 0,
          recentCompleted: [],
          message: `Failed to check research status: ${errorMessage}`,
        };
      }
    },
  });
}

// ============================================
// Check Trigger Conditions Tool
// ============================================

/**
 * Input schema for checking trigger conditions
 */
export const CheckTriggerConditionsInputSchema = z.object({
  currentRegime: z
    .string()
    .describe("Current market regime (e.g., BULL_TREND, BEAR_TREND, RANGE, HIGH_VOL, LOW_VOL)"),
  activeRegimes: z.array(z.string()).describe("Regimes covered by currently active factors"),
});

export type CheckTriggerConditionsInput = z.infer<typeof CheckTriggerConditionsInputSchema>;

/**
 * Output schema for trigger condition check
 */
export const CheckTriggerConditionsOutputSchema = z.object({
  shouldTrigger: z.boolean().describe("Whether research should be triggered"),
  trigger: z
    .object({
      type: ResearchTriggerDetectionTypeSchema,
      severity: TriggerSeveritySchema,
      affectedFactors: z.array(z.string()),
      suggestedFocus: z.string(),
    })
    .nullable()
    .describe("Highest priority trigger if found"),
  allTriggers: z
    .array(
      z.object({
        type: ResearchTriggerDetectionTypeSchema,
        severity: TriggerSeveritySchema,
        suggestedFocus: z.string(),
      })
    )
    .describe("All detected triggers"),
  blockingCheck: z
    .object({
      isBlocked: z.boolean(),
      reasons: z.array(z.string()),
    })
    .describe("Blocking condition check result"),
  recommendation: z.string().describe("Human-readable recommendation"),
});

export type CheckTriggerConditionsOutput = z.infer<typeof CheckTriggerConditionsOutputSchema>;

/**
 * Factory function to create the check trigger conditions tool with dependencies
 */
export function createCheckTriggerConditionsTool(factorZoo: FactorZooRepository) {
  const deps: ResearchTriggerDependencies = { factorZoo };
  const triggerService = createResearchTriggerService(deps);

  return createTool({
    id: "check_trigger_conditions",
    description: `Check if conditions warrant triggering autonomous research.

This tool evaluates multiple trigger conditions:
1. **Regime Gap**: Current market regime lacks factor coverage
2. **Alpha Decay**: Rolling IC < 50% of peak for 20+ days
3. **Performance Degradation**: Rolling Sharpe < 0.5 for 10+ days
4. **Factor Crowding**: Correlation with market beta > 0.8

Also checks blocking conditions:
- Cooldown period (7 days between runs)
- Active research limit (max 2 concurrent)
- Factor Zoo capacity (max 30 factors)
- Budget constraints

Use this to decide if trigger_research should be called.`,
    inputSchema: CheckTriggerConditionsInputSchema,
    outputSchema: CheckTriggerConditionsOutputSchema,
    execute: async ({ context }) => {
      const { currentRegime, activeRegimes } = context;

      try {
        const activeFactors = await factorZoo.findActiveFactors();
        const activeFactorIds = activeFactors.map((f) => f.factorId);

        const result = await triggerService.shouldTriggerResearch({
          currentRegime,
          activeRegimes,
          activeFactorIds,
          timestamp: new Date().toISOString(),
        });

        // Transform triggers to output format
        const transformTrigger = (t: ResearchTrigger) => ({
          type: t.type,
          severity: t.severity,
          suggestedFocus: t.suggestedFocus,
        });

        // Build recommendation
        let recommendation: string;
        if (result.blockingCheck.isBlocked) {
          recommendation = `Research blocked: ${result.blockingCheck.reasons.join("; ")}`;
        } else if (result.shouldTrigger && result.trigger) {
          recommendation = `Research recommended: ${result.trigger.suggestedFocus} (${result.trigger.severity} severity ${result.trigger.type})`;
        } else {
          recommendation = "No research trigger conditions detected";
        }

        return {
          shouldTrigger: result.shouldTrigger,
          trigger: result.trigger
            ? {
                type: result.trigger.type,
                severity: result.trigger.severity,
                affectedFactors: result.trigger.affectedFactors,
                suggestedFocus: result.trigger.suggestedFocus,
              }
            : null,
          allTriggers: result.allTriggers.map(transformTrigger),
          blockingCheck: {
            isBlocked: result.blockingCheck.isBlocked,
            reasons: result.blockingCheck.reasons,
          },
          recommendation,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          shouldTrigger: false,
          trigger: null,
          allTriggers: [],
          blockingCheck: {
            isBlocked: true,
            reasons: [`Error checking conditions: ${errorMessage}`],
          },
          recommendation: `Failed to check trigger conditions: ${errorMessage}`,
        };
      }
    },
  });
}
