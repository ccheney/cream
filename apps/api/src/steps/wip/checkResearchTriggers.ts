/**
 * Check Research Triggers Step
 *
 * Step in ORIENT phase: Detect conditions requiring autonomous research.
 *
 * Monitors for:
 * - REGIME_GAP: Current regime not covered by active strategies
 * - ALPHA_DECAY: Factor IC declining below threshold
 * - PERFORMANCE_DEGRADATION: Sharpe ratio falling
 * - FACTOR_CROWDING: High correlation with market beta
 *
 * When triggered, spawns the IdeaAgent to generate a new hypothesis.
 *
 * @see docs/plans/20-research-to-production-pipeline.md - Phase 0: Trigger Detection
 */

import { createContext, type ExecutionContext, isBacktest, requireEnv } from "@cream/domain";
import {
  createIdeaAgent,
  createResearchTriggerService,
  type IdeaGenerationResult,
} from "@cream/mastra-kit";
import { FactorZooRepository } from "@cream/storage";
import { createStep } from "@mastra/core/workflows";
import { z } from "zod";

import { getDbClient, getHelixClient } from "../db.js";
import { log } from "../logger.js";

// ============================================
// Types
// ============================================

/**
 * Create ExecutionContext for step invocation.
 */
function createStepContext(): ExecutionContext {
  return createContext(requireEnv(), "scheduled");
}

// ============================================
// Input/Output Schemas
// ============================================

export const CheckResearchTriggersInputSchema = z.object({
  cycleId: z.string(),
  regimeLabels: z.record(
    z.string(),
    z.object({
      regime: z.string(),
      confidence: z.number(),
      reasoning: z.string().optional(),
    })
  ),
  primarySymbol: z.string().optional(),
});

const ResearchTriggerSchema = z.object({
  type: z.enum(["REGIME_GAP", "ALPHA_DECAY", "PERFORMANCE_DEGRADATION", "FACTOR_CROWDING"]),
  severity: z.enum(["LOW", "MEDIUM", "HIGH"]),
  affectedFactors: z.array(z.string()),
  suggestedFocus: z.string(),
  detectedAt: z.string(),
  metadata: z.any().optional(),
});

const HypothesisSchema = z.object({
  id: z.string(),
  title: z.string(),
  economicRationale: z.string().optional(),
  marketMechanism: z.string().optional(),
  targetRegime: z.string().nullable().optional(),
  status: z.string(),
});

export const CheckResearchTriggersOutputSchema = z.object({
  triggered: z.boolean(),
  trigger: ResearchTriggerSchema.nullable(),
  hypothesis: HypothesisSchema.nullable(),
  allTriggers: z.array(ResearchTriggerSchema),
  blockedReasons: z.array(z.string()),
  checkedAt: z.string(),
});

export type CheckResearchTriggersInput = z.infer<typeof CheckResearchTriggersInputSchema>;
export type CheckResearchTriggersOutput = z.infer<typeof CheckResearchTriggersOutputSchema>;

// ============================================
// LLM Provider Interface
// ============================================

interface LLMProvider {
  generate(params: { systemPrompt: string; userPrompt: string; model?: string }): Promise<string>;
}

/**
 * Create a simple LLM provider using the environment's configured model.
 * In practice, this would use Mastra's agent infrastructure.
 */
function createLLMProvider(): LLMProvider | undefined {
  // Check if we have LLM credentials configured
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const hasGoogle = !!process.env.GOOGLE_API_KEY;

  if (!hasAnthropic && !hasGoogle) {
    return undefined;
  }

  // Return a stub provider for now - in practice this would use Mastra agents
  return {
    generate: async (_params: { systemPrompt: string; userPrompt: string; model?: string }) => {
      // This would be implemented with actual LLM call
      throw new Error("LLM provider not fully implemented - use Mastra agents instead");
    },
  };
}

// ============================================
// Step Implementation
// ============================================

export const checkResearchTriggersStep = createStep({
  id: "check-research-triggers",
  description: "Check for conditions requiring autonomous research",
  inputSchema: CheckResearchTriggersInputSchema,
  outputSchema: CheckResearchTriggersOutputSchema,
  retries: 1,
  execute: async ({ inputData }) => {
    const { cycleId, regimeLabels, primarySymbol } = inputData;

    const ctx = createStepContext();
    const now = new Date().toISOString();

    // Empty result for early returns
    const emptyResult: CheckResearchTriggersOutput = {
      triggered: false,
      trigger: null,
      hypothesis: null,
      allTriggers: [],
      blockedReasons: [],
      checkedAt: now,
    };

    // In BACKTEST mode, skip research trigger detection
    if (isBacktest(ctx)) {
      log.debug({ cycleId, mode: "BACKTEST" }, "Skipping research trigger check in backtest mode");
      return {
        ...emptyResult,
        blockedReasons: ["Skipped in backtest mode"],
      };
    }

    // Get Factor Zoo repository
    let factorZoo: FactorZooRepository;
    try {
      const client = await getDbClient();
      factorZoo = new FactorZooRepository(client);
    } catch (error) {
      log.warn(
        { cycleId, error: error instanceof Error ? error.message : String(error) },
        "Failed to get Factor Zoo repository"
      );
      return {
        ...emptyResult,
        blockedReasons: ["Factor Zoo unavailable"],
      };
    }

    // Create research trigger service
    const triggerService = createResearchTriggerService({ factorZoo });

    // Determine current regime from labels
    const primaryRegime =
      primarySymbol && regimeLabels[primarySymbol]
        ? regimeLabels[primarySymbol].regime
        : (Object.values(regimeLabels)[0]?.regime ?? "RANGE");

    // Get active regimes covered by current factors
    const activeFactors = await factorZoo.findActiveFactors();
    const activeRegimes = new Set<string>();
    for (const factor of activeFactors) {
      for (const regime of factor.targetRegimes ?? []) {
        if (regime === "all") {
          // Factor covers all regimes
          activeRegimes.add("BULL_TREND");
          activeRegimes.add("BEAR_TREND");
          activeRegimes.add("RANGE");
          activeRegimes.add("HIGH_VOL");
          activeRegimes.add("LOW_VOL");
        } else {
          // Map domain regime to trigger regime format
          const regimeMap: Record<string, string> = {
            bull: "BULL_TREND",
            bear: "BEAR_TREND",
            sideways: "RANGE",
            volatile: "HIGH_VOL",
          };
          const mapped = regimeMap[regime];
          if (mapped) {
            activeRegimes.add(mapped);
          }
        }
      }
    }

    // Check for triggers
    log.info({ cycleId, currentRegime: primaryRegime }, "Checking research triggers");

    const result = await triggerService.shouldTriggerResearch({
      currentRegime: primaryRegime,
      activeRegimes: Array.from(activeRegimes),
    });

    // If blocked, return early
    if (result.blockingCheck.isBlocked) {
      log.info({ cycleId, reasons: result.blockingCheck.reasons }, "Research triggers blocked");
      return {
        ...emptyResult,
        allTriggers: result.allTriggers,
        blockedReasons: result.blockingCheck.reasons,
      };
    }

    // If no trigger, return early
    if (!result.shouldTrigger || !result.trigger) {
      log.debug({ cycleId }, "No research triggers detected");
      return {
        ...emptyResult,
        allTriggers: result.allTriggers,
      };
    }

    // Trigger detected - spawn IdeaAgent to generate hypothesis
    log.info(
      {
        cycleId,
        triggerType: result.trigger.type,
        severity: result.trigger.severity,
        affectedFactors: result.trigger.affectedFactors,
      },
      "Research trigger detected, spawning IdeaAgent"
    );

    // Get HelixDB client for hypothesis memory queries
    const helixClient = getHelixClient();

    // Create IdeaAgent
    const llmProvider = createLLMProvider();
    const ideaAgent = createIdeaAgent(
      {
        factorZoo,
        helixClient: helixClient
          ? {
              query: async <T>(query: string, _params?: Record<string, unknown>) => {
                // Wrap HelixDB client for IdeaAgent interface
                const rawResult = await helixClient.query(query);
                return rawResult as T[];
              },
              vectorSearch: async <T>(
                _collection: string,
                _embedding: number[],
                _options?: { limit?: number; filter?: Record<string, unknown> }
              ) => {
                // Vector search would be implemented here
                return [] as T[];
              },
            }
          : undefined,
      },
      llmProvider
    );

    // Generate hypothesis
    let hypothesisResult: IdeaGenerationResult | null = null;
    try {
      hypothesisResult = await ideaAgent.generateHypothesis(result.trigger);
      log.info(
        {
          cycleId,
          hypothesisId: hypothesisResult.hypothesis.id,
          title: hypothesisResult.hypothesis.title,
        },
        "Hypothesis generated"
      );
    } catch (error) {
      log.warn(
        { cycleId, error: error instanceof Error ? error.message : String(error) },
        "Failed to generate hypothesis"
      );
    }

    return {
      triggered: true,
      trigger: result.trigger,
      hypothesis: hypothesisResult
        ? {
            id: hypothesisResult.hypothesis.id,
            title: hypothesisResult.hypothesis.title,
            economicRationale: hypothesisResult.hypothesis.economicRationale,
            marketMechanism: hypothesisResult.hypothesis.marketMechanism,
            targetRegime: hypothesisResult.hypothesis.targetRegime,
            status: hypothesisResult.hypothesis.status,
          }
        : null,
      allTriggers: result.allTriggers,
      blockedReasons: [],
      checkedAt: now,
    };
  },
});

export default checkResearchTriggersStep;
