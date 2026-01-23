/**
 * Consensus Step
 *
 * Seventh step in the OODA trading cycle. Runs risk manager and critic
 * agents in parallel to approve or reject the decision plan.
 *
 * @see docs/plans/53-mastra-v1-migration.md
 */

import { createStep } from "@mastra/core/workflows";
import { z } from "zod";

import { critic, riskManager } from "../../../agents/index.js";
import { ApprovalSchema, DecisionPlanSchema, type DecisionSchema } from "../schemas.js";

// ============================================
// Schemas
// ============================================

const ConsensusInputSchema = z.object({
	cycleId: z.string().describe("Unique identifier for this trading cycle"),
	decisionPlan: DecisionPlanSchema.describe("Decision plan from trader step"),
	iterations: z.number().optional().describe("Current iteration count"),
});

const ConsensusOutputSchema = z.object({
	cycleId: z.string(),
	approved: z.boolean(),
	iterations: z.number(),
	riskApproval: ApprovalSchema,
	criticApproval: ApprovalSchema,
	errors: z.array(z.string()),
	warnings: z.array(z.string()),
	metrics: z.object({
		totalMs: z.number(),
		riskManagerMs: z.number(),
		criticMs: z.number(),
	}),
});

// ============================================
// Step Definition
// ============================================

export const consensusStep = createStep({
	id: "consensus-approval",
	description: "Run risk manager and critic for approval",
	inputSchema: ConsensusInputSchema,
	outputSchema: ConsensusOutputSchema,
	execute: async ({ inputData }) => {
		const startTime = performance.now();
		const { cycleId, decisionPlan, iterations: inputIterations } = inputData;
		const iterations = (inputIterations ?? 0) + 1;
		const errors: string[] = [];
		const warnings: string[] = [];

		const riskStart = performance.now();
		const criticStart = performance.now();

		const [riskApproval, criticApproval] = await Promise.all([
			runRiskManager(decisionPlan.decisions, errors, warnings),
			runCritic(decisionPlan.decisions, errors, warnings),
		]);

		const riskManagerMs = performance.now() - riskStart;
		const criticMs = performance.now() - criticStart;

		const approved = riskApproval.verdict === "APPROVE" && criticApproval.verdict === "APPROVE";

		return {
			cycleId,
			approved,
			iterations,
			riskApproval,
			criticApproval,
			errors,
			warnings,
			metrics: {
				totalMs: performance.now() - startTime,
				riskManagerMs,
				criticMs,
			},
		};
	},
});

// ============================================
// Helper Functions
// ============================================

async function runRiskManager(
	decisions: z.infer<typeof DecisionSchema>[],
	errors: string[],
	warnings: string[],
): Promise<z.infer<typeof ApprovalSchema>> {
	const defaultApproval: z.infer<typeof ApprovalSchema> = {
		verdict: "APPROVE",
		approvedDecisionIds: decisions.map((d) => d.decisionId),
		rejectedDecisionIds: [],
		violations: [],
		required_changes: [],
		notes: "Default approval - risk manager not called",
	};

	if (decisions.length === 0) {
		return defaultApproval;
	}

	try {
		const prompt = buildRiskManagerPrompt(decisions);
		const response = await riskManager.generate(prompt);

		return parseApproval(response.text, decisions, "risk_manager", warnings) ?? defaultApproval;
	} catch (err) {
		errors.push(`Risk manager failed: ${formatError(err)}`);
		return defaultApproval;
	}
}

async function runCritic(
	decisions: z.infer<typeof DecisionSchema>[],
	errors: string[],
	warnings: string[],
): Promise<z.infer<typeof ApprovalSchema>> {
	const defaultApproval: z.infer<typeof ApprovalSchema> = {
		verdict: "APPROVE",
		approvedDecisionIds: decisions.map((d) => d.decisionId),
		rejectedDecisionIds: [],
		violations: [],
		required_changes: [],
		notes: "Default approval - critic not called",
	};

	if (decisions.length === 0) {
		return defaultApproval;
	}

	try {
		const prompt = buildCriticPrompt(decisions);
		const response = await critic.generate(prompt);

		return parseApproval(response.text, decisions, "critic", warnings) ?? defaultApproval;
	} catch (err) {
		errors.push(`Critic failed: ${formatError(err)}`);
		return defaultApproval;
	}
}

function buildRiskManagerPrompt(decisions: z.infer<typeof DecisionSchema>[]): string {
	const parts = ["Review these trading decisions for risk compliance.", "", "## Decisions"];

	for (const d of decisions) {
		parts.push(`### ${d.decisionId}`);
		parts.push(`- Instrument: ${d.instrumentId}`);
		parts.push(`- Action: ${d.action} ${d.direction}`);
		parts.push(`- Size: ${d.size.value} ${d.size.unit}`);
		if (d.stopLoss) {
			parts.push(`- Stop Loss: ${d.stopLoss.price} (${d.stopLoss.type})`);
		}
		parts.push(`- Confidence: ${d.confidence}`);
		parts.push(`- Rationale: ${d.rationale.summary}`);
		parts.push("");
	}

	parts.push(`## Risk Review Guidelines`);
	parts.push(`1. Check position sizing vs portfolio limits`);
	parts.push(`2. Verify stop losses are appropriate`);
	parts.push(`3. Assess concentration risk`);
	parts.push(`4. Evaluate correlation exposure`);
	parts.push("");
	parts.push(
		`Return JSON with: verdict (APPROVE/PARTIAL_APPROVE/REJECT), approvedDecisionIds[], rejectedDecisionIds[], violations[], required_changes[], notes`,
	);

	return parts.join("\n");
}

function buildCriticPrompt(decisions: z.infer<typeof DecisionSchema>[]): string {
	const parts = [
		"Critically review these trading decisions for logical soundness.",
		"",
		"## Decisions",
	];

	for (const d of decisions) {
		parts.push(`### ${d.decisionId}`);
		parts.push(`- Instrument: ${d.instrumentId}`);
		parts.push(`- Action: ${d.action} ${d.direction}`);
		parts.push(`- Rationale: ${d.rationale.summary}`);
		parts.push(`- Bullish factors: ${d.rationale.bullishFactors.join(", ")}`);
		parts.push(`- Bearish factors: ${d.rationale.bearishFactors.join(", ")}`);
		parts.push(`- Decision logic: ${d.rationale.decisionLogic}`);
		parts.push(`- Confidence: ${d.confidence}`);
		parts.push("");
	}

	parts.push(`## Critic Review Guidelines`);
	parts.push(`1. Challenge assumptions in the rationale`);
	parts.push(`2. Identify logical inconsistencies`);
	parts.push(`3. Question conviction levels vs evidence`);
	parts.push(`4. Suggest improvements or alternatives`);
	parts.push("");
	parts.push(
		`Return JSON with: verdict (APPROVE/PARTIAL_APPROVE/REJECT), approvedDecisionIds[], rejectedDecisionIds[], violations[], required_changes[], notes`,
	);

	return parts.join("\n");
}

function parseApproval(
	text: string,
	decisions: z.infer<typeof DecisionSchema>[],
	agentType: string,
	warnings: string[],
): z.infer<typeof ApprovalSchema> | null {
	const jsonMatch = text.match(/\{[\s\S]*\}/);
	if (!jsonMatch) {
		warnings.push(`Could not extract JSON from ${agentType} response`);
		return null;
	}

	try {
		const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

		return {
			verdict: (parsed.verdict as "APPROVE" | "PARTIAL_APPROVE" | "REJECT") ?? "APPROVE",
			approvedDecisionIds: Array.isArray(parsed.approvedDecisionIds)
				? parsed.approvedDecisionIds
				: decisions.map((d) => d.decisionId),
			rejectedDecisionIds: Array.isArray(parsed.rejectedDecisionIds)
				? parsed.rejectedDecisionIds
				: [],
			violations: Array.isArray(parsed.violations) ? parsed.violations : [],
			required_changes: Array.isArray(parsed.required_changes) ? parsed.required_changes : [],
			notes: String(parsed.notes ?? ""),
		};
	} catch {
		warnings.push(`Failed to parse ${agentType} response JSON`);
		return null;
	}
}

function formatError(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}
