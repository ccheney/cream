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

import { IndicatorHypothesisSchema, validateIndicatorFileFromPath } from "@cream/indicators";
import { type ImplementIndicatorOutput, implementIndicator } from "@cream/mastra-kit";
import { createStep } from "@mastra/core/workflows";
import { z } from "zod";

import { runIndicatorResearcher } from "../../agents/researchers.js";
import { getIndicatorsRepo } from "../../db.js";
import { log } from "../../logger.js";

// Example indicator code for pattern reference
const EXAMPLE_INDICATOR_PATTERN = `/**
 * RSI (Relative Strength Index) Calculator
 *
 * RSI is a momentum oscillator that measures the speed and magnitude of
 * recent price changes to evaluate overbought or oversold conditions.
 */

import type { OHLCVBar } from "../../types";

export interface RSIResult {
  rsi: number;
  avgGain: number;
  avgLoss: number;
  timestamp: number;
}

export function calculateRSI(bars: OHLCVBar[], period = 14): RSIResult | null {
  if (bars.length < period + 1) {
    return null;
  }

  // Calculate gains and losses
  const changes: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    changes.push(bars[i].close - bars[i - 1].close);
  }

  // Initial average
  const initialGains = changes.slice(0, period).filter((c) => c > 0);
  const initialLosses = changes.slice(0, period).filter((c) => c < 0).map(Math.abs);

  let avgGain = initialGains.reduce((a, b) => a + b, 0) / period;
  let avgLoss = initialLosses.reduce((a, b) => a + b, 0) / period;

  // Wilder smoothing for remaining bars
  for (let i = period; i < changes.length; i++) {
    const change = changes[i];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);

  return {
    rsi,
    avgGain,
    avgLoss,
    timestamp: bars[bars.length - 1].timestamp,
  };
}
`;

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

// ============================================
// Schemas: implementIndicator
// ============================================

/**
 * Output schema for implementIndicator step.
 * Matches ImplementIndicatorOutput from claudeCodeIndicator.
 */
export const ImplementationOutputSchema = z.object({
  success: z.boolean(),
  indicatorPath: z.string().optional(),
  testPath: z.string().optional(),
  astSimilarity: z.number().min(0).max(1).optional(),
  turnsUsed: z.number().optional(),
  testsPassed: z.boolean().optional(),
  error: z.string().optional(),
});

export type ImplementationOutput = z.infer<typeof ImplementationOutputSchema>;

// ============================================
// Step: implementIndicator
// ============================================

/**
 * Implement Indicator Step
 *
 * Third step in the indicator synthesis workflow. Uses Claude Code
 * to implement the indicator from the generated hypothesis.
 *
 * Uses Claude Agent SDK V2 as subprocess with:
 * - Restricted paths: packages/indicators/src/custom/
 * - Allowed tools: Read, Write, Edit, Grep, Glob, Bash (test/ls only)
 * - Security sandboxing for file operations
 */
export const implementIndicatorStep = createStep({
  id: "implement-indicator",
  description: "Implement indicator using Claude Code from hypothesis",
  inputSchema: HypothesisOutputSchema,
  outputSchema: ImplementationOutputSchema,
  execute: async ({ inputData }) => {
    const { hypothesis, confidence } = inputData;

    log.info(
      {
        hypothesisName: hypothesis.name,
        category: hypothesis.category,
        confidence,
      },
      "Implementing indicator via Claude Code"
    );

    try {
      const result: ImplementIndicatorOutput = await implementIndicator({
        hypothesis,
        existingPatterns: EXAMPLE_INDICATOR_PATTERN,
        config: {
          model: "claude-opus-4-5-20251101",
          maxTurns: 20,
          timeout: 5 * 60 * 1000, // 5 minutes
        },
      });

      if (result.success) {
        log.info(
          {
            indicatorPath: result.indicatorPath,
            testPath: result.testPath,
            turnsUsed: result.turnsUsed,
            testsPassed: result.testsPassed,
          },
          "Indicator implemented successfully"
        );
      } else {
        log.warn(
          {
            error: result.error,
            turnsUsed: result.turnsUsed,
          },
          "Indicator implementation failed"
        );
      }

      return {
        success: result.success,
        indicatorPath: result.indicatorPath,
        testPath: result.testPath,
        astSimilarity: result.astSimilarity,
        turnsUsed: result.turnsUsed,
        testsPassed: result.testsPassed,
        error: result.error,
      };
    } catch (error) {
      log.error(
        { error: error instanceof Error ? error.message : String(error) },
        "Failed to implement indicator"
      );

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

// ============================================
// Schemas: validateIndicator
// ============================================

/**
 * Output schema for validateIndicator step.
 * Contains validation results and any errors found.
 */
export const ValidationOutputSchema = z.object({
  isValid: z.boolean(),
  testsPass: z.boolean(),
  astSimilarity: z.number(),
  securityScanPassed: z.boolean(),
  validationErrors: z.array(z.string()),
});

export type ValidationOutput = z.infer<typeof ValidationOutputSchema>;

// ============================================
// Constants: Validation
// ============================================

/** Maximum allowed AST similarity to existing indicators (80%) */
const MAX_AST_SIMILARITY = 0.8;

// ============================================
// Step: validateIndicator
// ============================================

/**
 * Validate Indicator Step
 *
 * Fourth step in the indicator synthesis workflow. Validates the
 * generated indicator through multiple checks:
 * - Tests must pass
 * - AST similarity to existing indicators must be <= 80%
 * - Security scan must pass (no dangerous patterns)
 */
export const validateIndicatorStep = createStep({
  id: "validate-indicator",
  description: "Validate generated indicator through tests, AST check, and security scan",
  inputSchema: ImplementationOutputSchema,
  outputSchema: ValidationOutputSchema,
  execute: async ({ inputData }) => {
    const { success, indicatorPath, astSimilarity, testsPassed, error } = inputData;

    const validationErrors: string[] = [];

    log.info(
      {
        indicatorPath,
        implementationSuccess: success,
        testsPassed,
        astSimilarity,
      },
      "Validating generated indicator"
    );

    // Check 1: Implementation must have succeeded
    if (!success) {
      validationErrors.push(`Implementation failed: ${error ?? "Unknown error"}`);
      return {
        isValid: false,
        testsPass: false,
        astSimilarity: astSimilarity ?? 0,
        securityScanPassed: false,
        validationErrors,
      };
    }

    // Check 2: Tests must pass
    const testsPass = testsPassed === true;
    if (!testsPass) {
      validationErrors.push("Tests did not pass");
    }

    // Check 3: AST similarity must be below threshold
    const actualAstSimilarity = astSimilarity ?? 0;
    if (actualAstSimilarity > MAX_AST_SIMILARITY) {
      validationErrors.push(
        `AST similarity (${(actualAstSimilarity * 100).toFixed(1)}%) exceeds maximum (${MAX_AST_SIMILARITY * 100}%)`
      );
    }

    // Check 4: Security scan must pass
    let securityScanPassed = false;
    if (indicatorPath) {
      try {
        const scanResult = await validateIndicatorFileFromPath(indicatorPath);
        securityScanPassed = scanResult.safe;

        if (!scanResult.safe) {
          validationErrors.push(...scanResult.issues.map((issue) => `Security: ${issue}`));
        }

        log.info(
          {
            securityScanPassed,
            issuesFound: scanResult.issues.length,
            fileSize: scanResult.fileSize,
            lineCount: scanResult.lineCount,
          },
          "Security scan completed"
        );
      } catch (scanError) {
        validationErrors.push(
          `Security scan failed: ${scanError instanceof Error ? scanError.message : String(scanError)}`
        );
      }
    } else {
      validationErrors.push("No indicator path provided for security scan");
    }

    const isValid = validationErrors.length === 0;

    log.info(
      {
        isValid,
        testsPass,
        astSimilarity: actualAstSimilarity,
        securityScanPassed,
        errorCount: validationErrors.length,
      },
      isValid ? "Indicator validation passed" : "Indicator validation failed"
    );

    return {
      isValid,
      testsPass,
      astSimilarity: actualAstSimilarity,
      securityScanPassed,
      validationErrors,
    };
  },
});
