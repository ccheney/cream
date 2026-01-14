/**
 * Indicator Synthesis Workflow
 *
 * Autonomous indicator generation pipeline using Mastra workflows.
 * Chains together hypothesis generation, implementation, validation,
 * and paper trading initiation steps.
 *
 * @see docs/plans/36-dynamic-indicator-synthesis-workflow.md
 */

import { IndicatorHypothesisSchema } from "@cream/indicators";
import { createNodeLogger } from "@cream/logger";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

import {
	gatherTriggerContextStep,
	generateHypothesisStep,
	type HypothesisOutput,
	type ImplementationOutput,
	implementIndicatorStep,
	initiatePaperTradingStep,
	type ValidationOutput,
	validateIndicatorStep,
} from "./steps.js";

const log = createNodeLogger({ service: "indicator-synthesis", level: "info" });

// ============================================
// Workflow Input/Output Schemas
// ============================================

/**
 * Input schema for indicator synthesis workflow.
 * Matches output from checkIndicatorTrigger in Orient phase.
 */
export const IndicatorSynthesisInputSchema = z.object({
	triggerReason: z.string(),
	currentRegime: z.string(),
	regimeGapDetails: z.string().optional(),
	rollingIC30Day: z.number(),
	icDecayDays: z.number(),
	cycleId: z.string(),
});

export type IndicatorSynthesisInput = z.infer<typeof IndicatorSynthesisInputSchema>;

/**
 * Output schema for indicator synthesis workflow.
 * Aggregates results from all phases.
 */
export const IndicatorSynthesisOutputSchema = z.object({
	success: z.boolean(),
	indicatorId: z.string().optional(),
	indicatorName: z.string().optional(),
	status: z.enum([
		"paper_trading_started",
		"validation_failed",
		"implementation_failed",
		"hypothesis_failed",
		"error",
	]),
	message: z.string(),
	phases: z.object({
		hypothesisGenerated: z.boolean(),
		implementationSucceeded: z.boolean(),
		validationPassed: z.boolean(),
		paperTradingStarted: z.boolean(),
	}),
});

export type IndicatorSynthesisOutput = z.infer<typeof IndicatorSynthesisOutputSchema>;

/**
 * Workflow state schema.
 * Preserves hypothesis and intermediate results across steps.
 */
const WorkflowStateSchema = z.object({
	cycleId: z.string().optional(),
	hypothesis: IndicatorHypothesisSchema.optional(),
	hypothesisGenerated: z.boolean(),
	implementationResult: z
		.object({
			success: z.boolean(),
			indicatorPath: z.string().optional(),
			testPath: z.string().optional(),
		})
		.optional(),
	validationResult: z
		.object({
			isValid: z.boolean(),
			validationErrors: z.array(z.string()),
		})
		.optional(),
});

// ============================================
// Intermediate Steps
// ============================================

/**
 * Step to save hypothesis to workflow state after generation.
 * This allows the hypothesis to be accessed later in the pipeline.
 */
const saveHypothesisToStateStep = createStep({
	id: "save-hypothesis-to-state",
	description: "Save generated hypothesis to workflow state",
	inputSchema: z.object({
		cycleId: z.string(),
		hypothesis: IndicatorHypothesisSchema,
		confidence: z.number(),
		researchSummary: z.string(),
		academicReferences: z.array(z.string()),
	}),
	outputSchema: z.object({
		cycleId: z.string(),
		hypothesis: IndicatorHypothesisSchema,
		confidence: z.number(),
		researchSummary: z.string(),
		academicReferences: z.array(z.string()),
	}),
	stateSchema: WorkflowStateSchema,
	execute: async ({ inputData, setState }) => {
		await setState({
			cycleId: inputData.cycleId,
			hypothesis: inputData.hypothesis,
			hypothesisGenerated: true,
		});
		return inputData;
	},
});

/**
 * Step to save implementation result to workflow state.
 */
const saveImplementationToStateStep = createStep({
	id: "save-implementation-to-state",
	description: "Save implementation result to workflow state",
	inputSchema: z.object({
		cycleId: z.string(),
		success: z.boolean(),
		indicatorPath: z.string().optional(),
		testPath: z.string().optional(),
		astSimilarity: z.number().optional(),
		turnsUsed: z.number().optional(),
		testsPassed: z.boolean().optional(),
		error: z.string().optional(),
	}),
	outputSchema: z.object({
		cycleId: z.string(),
		success: z.boolean(),
		indicatorPath: z.string().optional(),
		testPath: z.string().optional(),
		astSimilarity: z.number().optional(),
		turnsUsed: z.number().optional(),
		testsPassed: z.boolean().optional(),
		error: z.string().optional(),
	}),
	stateSchema: WorkflowStateSchema,
	execute: async ({ inputData, setState, state }) => {
		await setState({
			...state,
			implementationResult: {
				success: inputData.success,
				indicatorPath: inputData.indicatorPath,
				testPath: inputData.testPath,
			},
		});
		return inputData;
	},
});

/**
 * Step to prepare paper trading input by combining state with validation output.
 */
const preparePaperTradingStep = createStep({
	id: "prepare-paper-trading",
	description: "Prepare input for paper trading by combining hypothesis with validation results",
	inputSchema: z.object({
		cycleId: z.string(),
		isValid: z.boolean(),
		testsPass: z.boolean(),
		astSimilarity: z.number(),
		securityScanPassed: z.boolean(),
		validationErrors: z.array(z.string()),
	}),
	outputSchema: z.object({
		cycleId: z.string(),
		hypothesis: IndicatorHypothesisSchema,
		isValid: z.boolean(),
		indicatorPath: z.string().optional(),
		testPath: z.string().optional(),
		validationErrors: z.array(z.string()),
	}),
	stateSchema: WorkflowStateSchema,
	execute: async ({ inputData, state, setState }) => {
		const hypothesis = state.hypothesis;
		const implementationResult = state.implementationResult;

		if (!hypothesis) {
			throw new Error("Hypothesis not found in workflow state");
		}

		await setState({
			...state,
			validationResult: {
				isValid: inputData.isValid,
				validationErrors: inputData.validationErrors,
			},
		});

		return {
			cycleId: inputData.cycleId,
			hypothesis,
			isValid: inputData.isValid,
			indicatorPath: implementationResult?.indicatorPath,
			testPath: implementationResult?.testPath,
			validationErrors: inputData.validationErrors,
		};
	},
});

/**
 * Step to handle implementation failure path.
 */
const implementationFailedStep = createStep({
	id: "implementation-failed",
	description: "Handle implementation failure",
	inputSchema: z.object({
		cycleId: z.string(),
		success: z.boolean(),
		indicatorPath: z.string().optional(),
		testPath: z.string().optional(),
		astSimilarity: z.number().optional(),
		turnsUsed: z.number().optional(),
		testsPassed: z.boolean().optional(),
		error: z.string().optional(),
	}),
	outputSchema: z.object({
		cycleId: z.string(),
		isValid: z.boolean(),
		testsPass: z.boolean(),
		astSimilarity: z.number(),
		securityScanPassed: z.boolean(),
		validationErrors: z.array(z.string()),
	}),
	execute: async ({ inputData }) => {
		log.warn(
			{
				cycleId: inputData.cycleId,
				phase: "implementation_failed",
				error: inputData.error,
				turnsUsed: inputData.turnsUsed,
			},
			"Implementation failed - skipping validation"
		);

		return {
			cycleId: inputData.cycleId,
			isValid: false,
			testsPass: false,
			astSimilarity: 0,
			securityScanPassed: false,
			validationErrors: [`Implementation failed: ${inputData.error ?? "Unknown error"}`],
		};
	},
});

/**
 * Step to aggregate final results from paper trading step.
 */
const aggregateResultsStep = createStep({
	id: "aggregate-results",
	description: "Aggregate final workflow results",
	inputSchema: z.object({
		cycleId: z.string(),
		indicatorId: z.string().optional(),
		status: z.enum(["paper_trading_started", "validation_failed", "error"]),
		paperTradingStart: z.string().optional(),
		message: z.string(),
	}),
	outputSchema: IndicatorSynthesisOutputSchema,
	stateSchema: WorkflowStateSchema,
	execute: async ({ inputData, state }) => {
		const hypothesis = state.hypothesis;
		const implementationResult = state.implementationResult;
		const validationResult = state.validationResult;

		const statusMap = {
			paper_trading_started: "paper_trading_started" as const,
			validation_failed: "validation_failed" as const,
			error: "error" as const,
		};

		const result = {
			success: inputData.status === "paper_trading_started",
			indicatorId: inputData.indicatorId,
			indicatorName: hypothesis?.name,
			status: statusMap[inputData.status],
			message: inputData.message,
			phases: {
				hypothesisGenerated: state.hypothesisGenerated ?? false,
				implementationSucceeded: implementationResult?.success ?? false,
				validationPassed: validationResult?.isValid ?? false,
				paperTradingStarted: inputData.status === "paper_trading_started",
			},
		};

		log.info(
			{
				cycleId: inputData.cycleId,
				phase: "workflow_complete",
				success: result.success,
				status: result.status,
				indicatorId: result.indicatorId,
				indicatorName: result.indicatorName,
				phases: result.phases,
			},
			"Indicator synthesis workflow completed"
		);

		return result;
	},
});

// ============================================
// Workflow Definition
// ============================================

/**
 * Indicator Synthesis Workflow
 *
 * Orchestrates the autonomous indicator generation pipeline:
 * 1. Gather trigger context (regime, IC history, existing indicators)
 * 2. Generate hypothesis via Indicator Researcher agent
 * 3. Implement indicator via Claude Code
 * 4. Branch: validate if implementation succeeded, or handle failure
 * 5. Prepare paper trading input by combining hypothesis with validation
 * 6. Initiate paper trading if validation passed
 * 7. Aggregate final results
 */
export const indicatorSynthesisWorkflow = createWorkflow({
	id: "indicator-synthesis",
	description: "Autonomous indicator generation pipeline",
	inputSchema: IndicatorSynthesisInputSchema,
	outputSchema: IndicatorSynthesisOutputSchema,
})
	.then(gatherTriggerContextStep)
	.then(generateHypothesisStep)
	.then(saveHypothesisToStateStep)
	.then(implementIndicatorStep)
	.then(saveImplementationToStateStep)
	.branch([
		[async ({ inputData }) => inputData.success === true, validateIndicatorStep],
		[async ({ inputData }) => inputData.success === false, implementationFailedStep],
	])
	.then(preparePaperTradingStep)
	.then(initiatePaperTradingStep)
	.then(aggregateResultsStep)
	.commit();

// ============================================
// Type Exports
// ============================================

export type { HypothesisOutput, ImplementationOutput, ValidationOutput };
