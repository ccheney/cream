/**
 * Trading Cycle Workflow
 *
 * OODA loop implementation for hourly trading decisions.
 * Connects all steps: observe → orient → grounding → analysts → debate → trader → consensus → act
 *
 * @see docs/plans/53-mastra-v1-migration.md
 */

import { createWorkflow } from "@mastra/core/workflows";

import { WorkflowInputSchema, WorkflowResultSchema } from "./schemas.js";
import {
	actStep,
	analystsStep,
	consensusStep,
	debateStep,
	groundingStep,
	observeStep,
	orientStep,
	traderStep,
} from "./steps/index.js";

export const tradingCycleWorkflow = createWorkflow({
	id: "trading-cycle",
	inputSchema: WorkflowInputSchema,
	outputSchema: WorkflowResultSchema,
})
	// Step 1: Observe - Fetch market snapshot
	.then(observeStep)
	// Map observe output to orient input
	.map(async ({ inputData }) => ({
		cycleId: inputData.cycleId,
		marketSnapshot: inputData.marketSnapshot,
		regimeLabels: inputData.regimeLabels,
		constraints: inputData.constraints,
	}))
	// Step 2: Orient - Load memory and compute regimes
	.then(orientStep)
	// Map orient output to grounding input
	.map(async ({ inputData }) => ({
		cycleId: inputData.cycleId,
		instruments: inputData.marketSnapshot.instruments,
	}))
	// Step 3: Grounding - Fetch real-time web context
	.then(groundingStep)
	// Map grounding output to analysts input (need to carry forward context)
	.map(async ({ inputData, getStepResult }) => {
		const orientResult = getStepResult(orientStep);
		return {
			cycleId: inputData.cycleId,
			instruments: orientResult?.marketSnapshot.instruments ?? [],
			regimeLabels: orientResult?.regimeLabels ?? {},
			groundingContext: {
				perSymbol: inputData.perSymbol,
				global: inputData.global,
			},
		};
	})
	// Step 4: Analysts - Run news and fundamentals analysts
	.then(analystsStep)
	// Map analysts output to debate input
	.map(async ({ inputData, getStepResult }) => {
		const orientResult = getStepResult(orientStep);
		return {
			cycleId: inputData.cycleId,
			instruments: orientResult?.marketSnapshot.instruments ?? [],
			regimeLabels: orientResult?.regimeLabels ?? {},
			newsAnalysis: inputData.newsAnalysis,
			fundamentalsAnalysis: inputData.fundamentalsAnalysis,
		};
	})
	// Step 5: Debate - Run bullish and bearish researchers
	.then(debateStep)
	// Map debate output to trader input
	.map(async ({ inputData, getStepResult }) => {
		const observeResult = getStepResult(observeStep);
		const orientResult = getStepResult(orientStep);
		const analystsResult = getStepResult(analystsStep);
		return {
			cycleId: inputData.cycleId,
			instruments: orientResult?.marketSnapshot.instruments ?? [],
			regimeLabels: orientResult?.regimeLabels ?? {},
			constraints: orientResult?.constraints,
			newsAnalysis: analystsResult?.newsAnalysis,
			fundamentalsAnalysis: analystsResult?.fundamentalsAnalysis,
			bullishResearch: inputData.bullishResearch,
			bearishResearch: inputData.bearishResearch,
			recentCloses: observeResult?.recentCloses,
		};
	})
	// Step 6: Trader - Synthesize decision plan
	.then(traderStep)
	// Map trader output to consensus input
	.map(async ({ inputData, getStepResult }) => {
		const orientResult = getStepResult(orientStep);
		return {
			cycleId: inputData.cycleId,
			decisionPlan: inputData.decisionPlan,
			constraints: orientResult?.constraints,
			iterations: 0,
		};
	})
	// Step 7: Consensus - Run risk manager and critic
	.then(consensusStep)
	// Map consensus output to act input
	.map(async ({ inputData, getStepResult }) => {
		const traderResult = getStepResult(traderStep);
		return {
			cycleId: inputData.cycleId,
			approved: inputData.approved,
			iterations: inputData.iterations,
			decisionPlan: traderResult?.decisionPlan,
			riskApproval: inputData.riskApproval,
			criticApproval: inputData.criticApproval,
			mode: "LLM" as const,
		};
	})
	// Step 8: Act - Execute approved decisions
	.then(actStep)
	.commit();
