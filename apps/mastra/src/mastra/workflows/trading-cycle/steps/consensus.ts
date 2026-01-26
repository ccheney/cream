/**
 * Consensus Step
 *
 * Seventh step in the OODA trading cycle. Runs risk manager and critic
 * agents in parallel to approve or reject the decision plan.
 *
 * @see docs/plans/53-mastra-v1-migration.md
 */

import { createNodeLogger } from "@cream/logger";
import { createStep } from "@mastra/core/workflows";
import { z } from "zod";

import { critic, riskManager } from "../../../agents/index.js";

const log = createNodeLogger({ service: "trading-cycle:consensus" });

import {
	ApprovalSchema,
	type Constraints,
	ConstraintsSchema,
	type ConstraintViolationSchema,
	DecisionPlanSchema,
	type DecisionSchema,
	type RequiredChangeSchema,
} from "../schemas.js";

// ============================================
// Schemas
// ============================================

const ConsensusInputSchema = z.object({
	cycleId: z.string().describe("Unique identifier for this trading cycle"),
	decisionPlan: DecisionPlanSchema.describe("Decision plan from trader step"),
	constraints: ConstraintsSchema.optional().describe("Runtime risk constraints"),
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
		const { cycleId, decisionPlan, constraints, iterations: inputIterations } = inputData;
		const iterations = (inputIterations ?? 0) + 1;
		const errors: string[] = [];
		const warnings: string[] = [];

		log.info(
			{
				cycleId,
				decisionCount: decisionPlan.decisions.length,
				iteration: iterations,
				hasConstraints: !!constraints,
			},
			"Starting consensus step",
		);

		// Early rejection for empty decision plans - nothing to approve
		if (decisionPlan.decisions.length === 0) {
			log.warn({ cycleId }, "No decisions in plan - rejecting automatically");
			const emptyRejection: z.infer<typeof ApprovalSchema> = {
				verdict: "REJECT",
				approvedDecisionIds: [],
				rejectedDecisionIds: [],
				violations: [],
				required_changes: [],
				notes: "No decisions to approve - plan is empty",
			};
			return {
				cycleId,
				approved: false,
				iterations,
				riskApproval: emptyRejection,
				criticApproval: emptyRejection,
				errors,
				warnings,
				metrics: {
					totalMs: performance.now() - startTime,
					riskManagerMs: 0,
					criticMs: 0,
				},
			};
		}

		const riskStart = performance.now();
		const criticStart = performance.now();

		const [riskApproval, criticApproval] = await Promise.all([
			runRiskManager(cycleId, decisionPlan.decisions, constraints, errors, warnings),
			runCritic(cycleId, decisionPlan.decisions, errors, warnings),
		]);

		const riskManagerMs = performance.now() - riskStart;
		const criticMs = performance.now() - criticStart;

		const approved = riskApproval.verdict === "APPROVE" && criticApproval.verdict === "APPROVE";

		log.info(
			{
				cycleId,
				approved,
				riskVerdict: riskApproval.verdict,
				criticVerdict: criticApproval.verdict,
				errorCount: errors.length,
				warningCount: warnings.length,
			},
			"Completed consensus step",
		);

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
	cycleId: string,
	decisions: z.infer<typeof DecisionSchema>[],
	constraints: Constraints | undefined,
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

	try {
		const prompt = buildRiskManagerPrompt(decisions, constraints);
		log.debug(
			{ cycleId, decisionCount: decisions.length, hasConstraints: !!constraints },
			"Calling risk manager",
		);
		const response = await riskManager.generate(prompt);

		const approval = parseApproval(cycleId, response.text, decisions, "risk_manager", warnings);
		if (approval) {
			log.debug({ cycleId, verdict: approval.verdict }, "Risk manager returned verdict");
			return approval;
		}
		log.warn({ cycleId }, "Risk manager returned unparseable response, using default approval");
		return defaultApproval;
	} catch (err) {
		const errorMsg = `Risk manager failed: ${formatError(err)}`;
		errors.push(errorMsg);
		log.error({ cycleId, error: formatError(err) }, "Risk manager LLM call failed");
		return defaultApproval;
	}
}

async function runCritic(
	cycleId: string,
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

	try {
		const prompt = buildCriticPrompt(decisions);
		log.debug({ cycleId, decisionCount: decisions.length }, "Calling critic");
		const response = await critic.generate(prompt);

		const approval = parseApproval(cycleId, response.text, decisions, "critic", warnings);
		if (approval) {
			log.debug({ cycleId, verdict: approval.verdict }, "Critic returned verdict");
			return approval;
		}
		log.warn({ cycleId }, "Critic returned unparseable response, using default approval");
		return defaultApproval;
	} catch (err) {
		const errorMsg = `Critic failed: ${formatError(err)}`;
		errors.push(errorMsg);
		log.error({ cycleId, error: formatError(err) }, "Critic LLM call failed");
		return defaultApproval;
	}
}

function buildRiskManagerPrompt(
	decisions: z.infer<typeof DecisionSchema>[],
	constraints: Constraints | undefined,
): string {
	const parts = ["Review these trading decisions for risk compliance.", ""];

	if (constraints) {
		parts.push(`## Risk Constraints (ACTUAL LIMITS - ENFORCE STRICTLY)`);
		parts.push(`### Per-Instrument Limits`);
		parts.push(
			`- maxPctEquity: ${(constraints.perInstrument.maxPctEquity * 100).toFixed(1)}% of portfolio per position`,
		);
		parts.push(
			`- maxNotional: $${constraints.perInstrument.maxNotional.toLocaleString()} per position`,
		);
		parts.push(
			`- maxShares: ${constraints.perInstrument.maxShares.toLocaleString()} shares per equity position`,
		);
		parts.push(
			`- maxContracts: ${constraints.perInstrument.maxContracts} contracts per options position`,
		);
		parts.push(`### Portfolio Limits`);
		parts.push(`- maxPositions: ${constraints.portfolio.maxPositions} total positions`);
		parts.push(
			`- maxConcentration: ${(constraints.portfolio.maxConcentration * 100).toFixed(1)}% max single position`,
		);
		parts.push(
			`- maxGrossExposure: ${(constraints.portfolio.maxGrossExposure * 100).toFixed(0)}% of equity`,
		);
		parts.push(
			`- maxNetExposure: ${(constraints.portfolio.maxNetExposure * 100).toFixed(0)}% of equity`,
		);
		parts.push(
			`- maxRiskPerTrade: ${(constraints.portfolio.maxRiskPerTrade * 100).toFixed(1)}% of portfolio per trade`,
		);
		parts.push(
			`- maxDrawdown: ${(constraints.portfolio.maxDrawdown * 100).toFixed(0)}% max drawdown limit`,
		);
		parts.push(
			`- maxSectorExposure: ${(constraints.portfolio.maxSectorExposure * 100).toFixed(0)}% per sector`,
		);
		parts.push(`### Options Greeks Limits`);
		parts.push(`- maxDelta: ${constraints.options.maxDelta.toLocaleString()}`);
		parts.push(`- maxGamma: ${constraints.options.maxGamma.toLocaleString()}`);
		parts.push(`- maxVega: $${constraints.options.maxVega.toLocaleString()}`);
		parts.push(`- maxTheta: $${constraints.options.maxTheta.toLocaleString()}/day`);
		parts.push("");
	}

	parts.push("## Decisions");

	for (const d of decisions) {
		parts.push(`### ${d.decisionId}`);
		parts.push(`- Instrument: ${d.instrumentId}`);
		parts.push(`- Action: ${d.action} ${d.direction}`);
		parts.push(`- Size: ${d.size.value} ${d.size.unit}`);
		if (d.stopLoss) {
			parts.push(`- Stop Loss: ${d.stopLoss.price} (${d.stopLoss.type})`);
		} else if (d.action === "BUY" || d.action === "SELL") {
			parts.push(`- Stop Loss: **MISSING** (REQUIRED for ${d.action})`);
		}
		parts.push(`- Confidence: ${d.confidence}`);
		parts.push(`- Rationale: ${d.rationale.summary}`);
		parts.push("");
	}

	parts.push(`## Risk Review Guidelines`);
	parts.push(`1. Check position sizing vs portfolio limits`);
	parts.push(`2. Verify stop losses are present and appropriate for all BUY/SELL actions`);
	parts.push(`3. Assess concentration risk`);
	parts.push(`4. Evaluate correlation exposure`);
	parts.push(`5. REJECT any BUY/SELL decision without a stop-loss`);
	parts.push("");
	parts.push(
		`Return JSON with: verdict (APPROVE/PARTIAL_APPROVE/REJECT), approvedDecisionIds[], rejectedDecisionIds[], violations[], required_changes[], notes`,
	);

	return parts.join("\n");
}

function buildCriticPrompt(decisions: z.infer<typeof DecisionSchema>[]): string {
	const parts = [
		"Critically review these trading decisions for logical soundness.",
		"Focus on the quality of reasoning, not risk constraints or position sizing.",
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
	cycleId: string,
	text: string,
	decisions: z.infer<typeof DecisionSchema>[],
	agentType: string,
	warnings: string[],
): z.infer<typeof ApprovalSchema> | null {
	const jsonMatch = text.match(/\{[\s\S]*\}/);
	if (!jsonMatch) {
		const warnMsg = `Could not extract JSON from ${agentType} response`;
		warnings.push(warnMsg);
		log.warn(
			{ cycleId, agentType, responsePreview: text.slice(0, 200) },
			`No JSON found in ${agentType} response`,
		);
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
			violations: normalizeViolations(parsed.violations, decisions),
			required_changes: normalizeRequiredChanges(parsed.required_changes, decisions),
			notes: String(parsed.notes ?? ""),
		};
	} catch (err) {
		const warnMsg = `Failed to parse ${agentType} response JSON`;
		warnings.push(warnMsg);
		log.warn(
			{ cycleId, agentType, error: formatError(err), jsonPreview: jsonMatch[0].slice(0, 200) },
			`JSON parse failed for ${agentType}`,
		);
		return null;
	}
}

function normalizeViolations(
	raw: unknown,
	decisions: z.infer<typeof DecisionSchema>[],
): z.infer<typeof ConstraintViolationSchema>[] {
	if (!Array.isArray(raw)) return [];

	const decisionIds = decisions.map((d) => d.decisionId);

	return raw.map((item) => {
		if (typeof item === "string") {
			return {
				constraint: item,
				current_value: "unknown",
				limit: "unknown",
				severity: "WARNING" as const,
				affected_decisions: decisionIds,
			};
		}
		if (typeof item === "object" && item !== null) {
			const obj = item as Record<string, unknown>;
			return {
				constraint: String(obj.constraint ?? "Unknown constraint"),
				current_value: normalizeValueOrNumber(obj.current_value),
				limit: normalizeValueOrNumber(obj.limit),
				severity: obj.severity === "CRITICAL" ? ("CRITICAL" as const) : ("WARNING" as const),
				affected_decisions: Array.isArray(obj.affected_decisions)
					? obj.affected_decisions.map(String)
					: decisionIds,
			};
		}
		return {
			constraint: String(item),
			current_value: "unknown",
			limit: "unknown",
			severity: "WARNING" as const,
			affected_decisions: decisionIds,
		};
	});
}

function normalizeRequiredChanges(
	raw: unknown,
	decisions: z.infer<typeof DecisionSchema>[],
): z.infer<typeof RequiredChangeSchema>[] {
	if (!Array.isArray(raw)) return [];

	const firstDecisionId = decisions[0]?.decisionId ?? "unknown";

	return raw.map((item) => {
		if (typeof item === "string") {
			return {
				decisionId: firstDecisionId,
				change: item,
				reason: "Required by risk review",
			};
		}
		if (typeof item === "object" && item !== null) {
			const obj = item as Record<string, unknown>;
			return {
				decisionId: String(obj.decisionId ?? firstDecisionId),
				change: String(obj.change ?? "Unknown change"),
				reason: String(obj.reason ?? "Required by review"),
			};
		}
		return {
			decisionId: firstDecisionId,
			change: String(item),
			reason: "Required by risk review",
		};
	});
}

function normalizeValueOrNumber(val: unknown): string | number {
	if (typeof val === "number") return val;
	if (typeof val === "string") return val;
	return "unknown";
}

function formatError(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}
