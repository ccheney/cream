/**
 * Indicator Synthesis Workflow Steps
 *
 * Workflow steps for the LLM-driven autonomous indicator generation pipeline.
 * These steps are used by the indicator synthesis workflow to:
 * 1. Gather trigger context (regime data, IC history, existing indicators)
 * 2. Generate hypotheses via the Indicator Researcher agent
 * 3. Implement indicators via Claude Code tool
 * 4. Validate generated indicators
 *
 * @see docs/plans/36-dynamic-indicator-synthesis-workflow.md
 */

import { IndicatorHypothesisSchema } from "@cream/indicators";
import { createStep } from "@mastra/core/workflows";
import { z } from "zod";

import { runIndicatorResearcher } from "../../agents/researchers.js";
import { getIndicatorsRepo } from "../../db.js";
import { log } from "../../logger.js";

// ============================================
// Schemas
// ============================================

/**
 * Input schema for gatherTriggerContext step.
 * Receives trigger information from checkIndicatorTrigger in Orient phase.
 */
export const TriggerContextInputSchema = z.object({
  triggerReason: z.string(),
  currentRegime: z.string(),
  regimeGapDetails: z.string().optional(),
  rollingIC30Day: z.number(),
  icDecayDays: z.number(),
});

export type TriggerContextInput = z.infer<typeof TriggerContextInputSchema>;

/**
 * Previous hypothesis attempt record for context
 */
export const PreviousHypothesisSchema = z.object({
  name: z.string(),
  status: z.string(),
  rejectionReason: z.string().optional(),
});

export type PreviousHypothesis = z.infer<typeof PreviousHypothesisSchema>;

/**
 * Output schema for gatherTriggerContext step.
 * Provides aggregated context for hypothesis generation.
 */
export const TriggerContextOutputSchema = z.object({
  currentRegime: z.string(),
  regimeGapDetails: z.string(),
  rollingIC: z.number(),
  icDecayDays: z.number(),
  existingIndicators: z.array(z.string()),
  previousHypotheses: z.array(PreviousHypothesisSchema),
});

export type TriggerContextOutput = z.infer<typeof TriggerContextOutputSchema>;

// ============================================
// Step: gatherTriggerContext
// ============================================

/**
 * Gather Trigger Context Step
 *
 * First step in the indicator synthesis workflow. Collects context data
 * for hypothesis generation including:
 * - Current regime and gap details
 * - Rolling IC and decay information
 * - Existing active indicator names (to avoid duplication)
 * - Previous hypothesis attempts (to learn from failures)
 */
export const gatherTriggerContextStep = createStep({
  id: "gather-trigger-context",
  description: "Gather context data for indicator hypothesis generation",
  inputSchema: TriggerContextInputSchema,
  outputSchema: TriggerContextOutputSchema,
  execute: async ({ inputData }) => {
    const { triggerReason, currentRegime, regimeGapDetails, rollingIC30Day, icDecayDays } =
      inputData;

    log.info(
      {
        triggerReason,
        currentRegime,
        rollingIC30Day,
        icDecayDays,
      },
      "Gathering trigger context for indicator synthesis"
    );

    try {
      const indicatorsRepo = await getIndicatorsRepo();

      // Query existing active indicators (paper + production)
      const activeIndicators = await indicatorsRepo.findActive();
      const existingIndicatorNames = activeIndicators.map((ind) => ind.name);

      // Query previous hypothesis attempts (retired + staging, last 5)
      const previousAttempts = await indicatorsRepo.findMany(
        { status: ["retired", "staging"] },
        { page: 1, pageSize: 5 }
      );

      const previousHypotheses: PreviousHypothesis[] = previousAttempts.data.map((ind) => ({
        name: ind.name,
        status: ind.status,
        rejectionReason: ind.retirementReason ?? undefined,
      }));

      log.info(
        {
          existingIndicatorCount: existingIndicatorNames.length,
          previousHypothesesCount: previousHypotheses.length,
        },
        "Trigger context gathered successfully"
      );

      return {
        currentRegime,
        regimeGapDetails: regimeGapDetails ?? "",
        rollingIC: rollingIC30Day,
        icDecayDays,
        existingIndicators: existingIndicatorNames,
        previousHypotheses,
      };
    } catch (error) {
      log.error(
        { error: error instanceof Error ? error.message : String(error) },
        "Failed to gather trigger context"
      );

      // Return minimal context on error to allow workflow to continue
      return {
        currentRegime,
        regimeGapDetails: regimeGapDetails ?? "",
        rollingIC: rollingIC30Day,
        icDecayDays,
        existingIndicators: [],
        previousHypotheses: [],
      };
    }
  },
});

// ============================================
// Schemas: generateHypothesis
// ============================================

/**
 * Output schema for generateHypothesis step.
 * Contains the generated hypothesis with metadata.
 */
export const HypothesisOutputSchema = z.object({
  hypothesis: IndicatorHypothesisSchema,
  confidence: z.number().min(0).max(1),
  researchSummary: z.string(),
  academicReferences: z.array(z.string()),
});

export type HypothesisOutput = z.infer<typeof HypothesisOutputSchema>;

// ============================================
// Step: generateHypothesis
// ============================================

/**
 * Generate Hypothesis Step
 *
 * Second step in the indicator synthesis workflow. Invokes the Indicator
 * Researcher agent to generate a hypothesis based on the gathered context.
 *
 * Uses Chain-of-Thought reasoning to:
 * - Analyze the regime gap
 * - Research relevant academic literature
 * - Formulate a testable hypothesis
 * - Define falsification criteria
 */
export const generateHypothesisStep = createStep({
  id: "generate-hypothesis",
  description: "Generate indicator hypothesis using the Indicator Researcher agent",
  inputSchema: TriggerContextOutputSchema,
  outputSchema: HypothesisOutputSchema,
  execute: async ({ inputData }) => {
    const {
      currentRegime,
      regimeGapDetails,
      rollingIC,
      icDecayDays,
      existingIndicators,
      previousHypotheses,
    } = inputData;

    log.info(
      {
        currentRegime,
        rollingIC,
        icDecayDays,
        existingIndicatorCount: existingIndicators.length,
        previousHypothesesCount: previousHypotheses.length,
      },
      "Generating indicator hypothesis via Indicator Researcher agent"
    );

    try {
      const hypothesis = await runIndicatorResearcher({
        currentRegime,
        regimeGapDetails,
        rollingIC,
        icDecayDays,
        existingIndicators,
        previousHypotheses,
      });

      // Derive confidence from expected properties
      // expectedICRange is a tuple [min, max]
      const [icMin, icMax] = hypothesis.expectedProperties.expectedICRange;
      const avgExpectedIC = (icMin + icMax) / 2;
      const confidence = Math.min(0.9, Math.max(0.3, avgExpectedIC * 10));

      // Build research summary from hypothesis content
      const researchSummary =
        `Generated hypothesis "${hypothesis.name}" targeting ${currentRegime} regime. ` +
        `Economic rationale: ${hypothesis.economicRationale.slice(0, 200)}...`;

      // Extract academic references from hypothesis
      const academicReferences = hypothesis.relatedAcademicWork ?? [];

      log.info(
        {
          hypothesisName: hypothesis.name,
          category: hypothesis.category,
          confidence,
          academicReferencesCount: academicReferences.length,
        },
        "Hypothesis generated successfully"
      );

      return {
        hypothesis,
        confidence,
        researchSummary,
        academicReferences,
      };
    } catch (error) {
      log.error(
        { error: error instanceof Error ? error.message : String(error) },
        "Failed to generate hypothesis"
      );
      throw error;
    }
  },
});
