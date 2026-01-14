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

import { type ImplementIndicatorOutput, implementIndicator } from "@cream/agents";
import { IndicatorHypothesisSchema, validateIndicatorFileFromPath } from "@cream/indicators";
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
	cycleId: z.string(),
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
	cycleId: z.string(),
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
		const { cycleId, triggerReason, currentRegime, regimeGapDetails, rollingIC30Day, icDecayDays } =
			inputData;

		const stepStartTime = Date.now();

		log.info(
			{
				cycleId,
				phase: "gather_context",
				triggerReason,
				currentRegime,
				rollingIC30Day,
				icDecayDays,
			},
			"Starting gather trigger context step"
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

			const stepDurationMs = Date.now() - stepStartTime;

			log.info(
				{
					cycleId,
					phase: "gather_context",
					existingIndicatorCount: existingIndicatorNames.length,
					previousHypothesesCount: previousHypotheses.length,
					durationMs: stepDurationMs,
				},
				"Gather trigger context step completed"
			);

			return {
				cycleId,
				currentRegime,
				regimeGapDetails: regimeGapDetails ?? "",
				rollingIC: rollingIC30Day,
				icDecayDays,
				existingIndicators: existingIndicatorNames,
				previousHypotheses,
			};
		} catch (error) {
			const stepDurationMs = Date.now() - stepStartTime;

			log.error(
				{
					cycleId,
					phase: "gather_context",
					error: error instanceof Error ? error.message : String(error),
					durationMs: stepDurationMs,
				},
				"Gather trigger context step failed"
			);

			// Return minimal context on error to allow workflow to continue
			return {
				cycleId,
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
	cycleId: z.string(),
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
			cycleId,
			currentRegime,
			regimeGapDetails,
			rollingIC,
			icDecayDays,
			existingIndicators,
			previousHypotheses,
		} = inputData;

		const stepStartTime = Date.now();

		log.info(
			{
				cycleId,
				phase: "generate_hypothesis",
				currentRegime,
				rollingIC,
				icDecayDays,
				existingIndicatorCount: existingIndicators.length,
				previousHypothesesCount: previousHypotheses.length,
			},
			"Starting generate hypothesis step"
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

			const stepDurationMs = Date.now() - stepStartTime;

			log.info(
				{
					cycleId,
					phase: "generate_hypothesis",
					hypothesisName: hypothesis.name,
					category: hypothesis.category,
					confidence,
					academicReferencesCount: academicReferences.length,
					durationMs: stepDurationMs,
				},
				"Generate hypothesis step completed"
			);

			return {
				cycleId,
				hypothesis,
				confidence,
				researchSummary,
				academicReferences,
			};
		} catch (error) {
			const stepDurationMs = Date.now() - stepStartTime;

			log.error(
				{
					cycleId,
					phase: "generate_hypothesis",
					error: error instanceof Error ? error.message : String(error),
					durationMs: stepDurationMs,
				},
				"Generate hypothesis step failed"
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
	cycleId: z.string(),
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
		const { cycleId, hypothesis, confidence } = inputData;

		const stepStartTime = Date.now();

		log.info(
			{
				cycleId,
				phase: "implement",
				hypothesisName: hypothesis.name,
				category: hypothesis.category,
				confidence,
			},
			"Starting implement indicator step"
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

			const stepDurationMs = Date.now() - stepStartTime;

			if (result.success) {
				log.info(
					{
						cycleId,
						phase: "implement",
						hypothesisName: hypothesis.name,
						indicatorPath: result.indicatorPath,
						testPath: result.testPath,
						turnsUsed: result.turnsUsed,
						testsPassed: result.testsPassed,
						durationMs: stepDurationMs,
					},
					"Implement indicator step completed successfully"
				);
			} else {
				log.warn(
					{
						cycleId,
						phase: "implement",
						hypothesisName: hypothesis.name,
						error: result.error,
						turnsUsed: result.turnsUsed,
						durationMs: stepDurationMs,
					},
					"Implement indicator step completed with failure"
				);
			}

			return {
				cycleId,
				success: result.success,
				indicatorPath: result.indicatorPath,
				testPath: result.testPath,
				astSimilarity: result.astSimilarity,
				turnsUsed: result.turnsUsed,
				testsPassed: result.testsPassed,
				error: result.error,
			};
		} catch (error) {
			const stepDurationMs = Date.now() - stepStartTime;

			log.error(
				{
					cycleId,
					phase: "implement",
					hypothesisName: hypothesis.name,
					error: error instanceof Error ? error.message : String(error),
					durationMs: stepDurationMs,
				},
				"Implement indicator step failed with exception"
			);

			return {
				cycleId,
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
	cycleId: z.string(),
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

/**
 * Map hypothesis category to repository-compatible category.
 * Repository supports: momentum, trend, volatility, volume, custom
 * Hypothesis adds: liquidity, correlation, microstructure, sentiment, regime
 */
function mapToRepositoryCategory(
	hypothesisCategory: string
): "momentum" | "trend" | "volatility" | "volume" | "custom" {
	const directMappings = ["momentum", "trend", "volatility", "volume"] as const;
	if (directMappings.includes(hypothesisCategory as (typeof directMappings)[number])) {
		return hypothesisCategory as (typeof directMappings)[number];
	}
	// Extended categories (liquidity, correlation, microstructure, sentiment, regime) map to custom
	return "custom";
}

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
		const { cycleId, success, indicatorPath, astSimilarity, testsPassed, error } = inputData;

		const stepStartTime = Date.now();
		const validationErrors: string[] = [];

		log.info(
			{
				cycleId,
				phase: "validate",
				indicatorPath,
				implementationSuccess: success,
				testsPassed,
				astSimilarity,
			},
			"Starting validate indicator step"
		);

		// Check 1: Implementation must have succeeded
		if (!success) {
			const stepDurationMs = Date.now() - stepStartTime;
			validationErrors.push(`Implementation failed: ${error ?? "Unknown error"}`);

			log.warn(
				{
					cycleId,
					phase: "validate",
					errorCount: validationErrors.length,
					durationMs: stepDurationMs,
				},
				"Validate indicator step completed - implementation failure"
			);

			return {
				cycleId,
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
						cycleId,
						phase: "validate",
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
		const stepDurationMs = Date.now() - stepStartTime;

		log.info(
			{
				cycleId,
				phase: "validate",
				isValid,
				testsPass,
				astSimilarity: actualAstSimilarity,
				securityScanPassed,
				errorCount: validationErrors.length,
				durationMs: stepDurationMs,
			},
			isValid
				? "Validate indicator step completed - passed"
				: "Validate indicator step completed - failed"
		);

		return {
			cycleId,
			isValid,
			testsPass,
			astSimilarity: actualAstSimilarity,
			securityScanPassed,
			validationErrors,
		};
	},
});

// ============================================
// Schemas: initiatePaperTrading
// ============================================

/**
 * Input schema for initiatePaperTrading step.
 * Combines hypothesis with validation results.
 */
export const PaperTradingInputSchema = z.object({
	cycleId: z.string(),
	hypothesis: IndicatorHypothesisSchema,
	isValid: z.boolean(),
	indicatorPath: z.string().optional(),
	testPath: z.string().optional(),
	validationErrors: z.array(z.string()),
});

export type PaperTradingInput = z.infer<typeof PaperTradingInputSchema>;

/**
 * Output schema for initiatePaperTrading step.
 * Returns indicator ID and status of paper trading initiation.
 */
export const PaperTradingOutputSchema = z.object({
	cycleId: z.string(),
	indicatorId: z.string().optional(),
	status: z.enum(["paper_trading_started", "validation_failed", "error"]),
	paperTradingStart: z.string().optional(),
	message: z.string(),
});

export type PaperTradingOutput = z.infer<typeof PaperTradingOutputSchema>;

// ============================================
// Step: initiatePaperTrading
// ============================================

/**
 * Initiate Paper Trading Step
 *
 * Final step in the indicator synthesis workflow. Creates the indicator
 * record and starts the paper trading period after validation passes.
 *
 * - Returns early with validation_failed if !isValid
 * - Generates UUID for new indicator
 * - Creates indicator record in Turso with status 'staging'
 * - Transitions to 'paper' status with paper_trading_start timestamp
 * - Optionally creates HelixDB node for graph relationships
 */
export const initiatePaperTradingStep = createStep({
	id: "initiate-paper-trading",
	description: "Create indicator record and start paper trading period",
	inputSchema: PaperTradingInputSchema,
	outputSchema: PaperTradingOutputSchema,
	execute: async ({ inputData }) => {
		const { cycleId, hypothesis, isValid, indicatorPath, validationErrors } = inputData;

		const stepStartTime = Date.now();

		// Early return if validation failed
		if (!isValid) {
			const stepDurationMs = Date.now() - stepStartTime;

			log.warn(
				{
					cycleId,
					phase: "initiate_paper_trading",
					hypothesisName: hypothesis.name,
					errorCount: validationErrors.length,
					errors: validationErrors,
					durationMs: stepDurationMs,
				},
				"Initiate paper trading step completed - validation failed"
			);

			return {
				cycleId,
				status: "validation_failed" as const,
				message: `Validation failed with ${validationErrors.length} error(s): ${validationErrors.join("; ")}`,
			};
		}

		log.info(
			{
				cycleId,
				phase: "initiate_paper_trading",
				hypothesisName: hypothesis.name,
				category: hypothesis.category,
				indicatorPath,
			},
			"Starting initiate paper trading step"
		);

		try {
			const indicatorsRepo = await getIndicatorsRepo();

			// Generate UUID for the new indicator
			const indicatorId = crypto.randomUUID();
			const paperTradingStart = new Date().toISOString();

			// Create indicator record with 'staging' status
			await indicatorsRepo.create({
				id: indicatorId,
				name: hypothesis.name,
				category: mapToRepositoryCategory(hypothesis.category),
				hypothesis: hypothesis.hypothesis,
				economicRationale: hypothesis.economicRationale,
				generatedBy: "indicator-synthesis-workflow",
				codeHash: indicatorPath ?? undefined,
			});

			// Transition to paper trading status
			await indicatorsRepo.startPaperTrading(indicatorId, paperTradingStart);

			const stepDurationMs = Date.now() - stepStartTime;

			log.info(
				{
					cycleId,
					phase: "initiate_paper_trading",
					indicatorId,
					name: hypothesis.name,
					paperTradingStart,
					durationMs: stepDurationMs,
				},
				"Initiate paper trading step completed - success"
			);

			return {
				cycleId,
				indicatorId,
				status: "paper_trading_started" as const,
				paperTradingStart,
				message: `Paper trading started for indicator "${hypothesis.name}" (${indicatorId})`,
			};
		} catch (error) {
			const stepDurationMs = Date.now() - stepStartTime;

			log.error(
				{
					cycleId,
					phase: "initiate_paper_trading",
					hypothesisName: hypothesis.name,
					error: error instanceof Error ? error.message : String(error),
					durationMs: stepDurationMs,
				},
				"Initiate paper trading step failed"
			);

			return {
				cycleId,
				status: "error" as const,
				message: `Failed to initiate paper trading: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	},
});
