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

import { getModelId } from "@cream/domain";
import { xmlQuotes, xmlRecentCloses, xmlRegimes } from "../prompt-helpers.js";
import {
	ApprovalSchema,
	type Constraints,
	ConstraintsSchema,
	DecisionPlanSchema,
	type DecisionSchema,
	QuoteDataSchema,
	type RecentClose,
	RecentCloseSchema,
	RegimeDataSchema,
} from "../schemas.js";

// ============================================
// Schemas
// ============================================

const ConsensusInputSchema = z.object({
	cycleId: z.string().describe("Unique identifier for this trading cycle"),
	decisionPlan: DecisionPlanSchema.describe("Decision plan from trader step"),
	constraints: ConstraintsSchema.optional().describe("Runtime risk constraints"),
	regimeLabels: z
		.record(z.string(), RegimeDataSchema)
		.optional()
		.describe("Regime classifications per symbol"),
	iterations: z.number().optional().describe("Current iteration count"),
	quotes: z
		.record(z.string(), QuoteDataSchema)
		.optional()
		.describe("Current market quotes keyed by symbol"),
	recentCloses: z
		.array(RecentCloseSchema)
		.optional()
		.describe("Recently closed positions (cooldown)"),
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
		const {
			cycleId,
			decisionPlan,
			constraints,
			regimeLabels,
			iterations: inputIterations,
			quotes,
			recentCloses,
		} = inputData;
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
			runRiskManager(
				cycleId,
				decisionPlan.decisions,
				constraints,
				regimeLabels ?? {},
				quotes ?? {},
				recentCloses ?? [],
				errors,
			),
			runCritic(cycleId, decisionPlan.decisions, errors),
		]);

		const riskManagerMs = performance.now() - riskStart;
		const criticMs = performance.now() - criticStart;

		// Determine overall approval:
		// - APPROVE + APPROVE = approved (all decisions)
		// - PARTIAL_APPROVE + APPROVE = approved (only approved decisions)
		// - PARTIAL_APPROVE + PARTIAL_APPROVE = approved (intersection of approved decisions)
		// - Any REJECT = not approved
		const riskOk = riskApproval.verdict === "APPROVE" || riskApproval.verdict === "PARTIAL_APPROVE";
		const criticOk =
			criticApproval.verdict === "APPROVE" || criticApproval.verdict === "PARTIAL_APPROVE";
		const approved = riskOk && criticOk;

		log.info(
			{
				cycleId,
				approved,
				riskVerdict: riskApproval.verdict,
				criticVerdict: criticApproval.verdict,
				riskApprovedCount: riskApproval.approvedDecisionIds?.length ?? 0,
				riskRejectedCount: riskApproval.rejectedDecisionIds?.length ?? 0,
				criticApprovedCount: criticApproval.approvedDecisionIds?.length ?? 0,
				criticRejectedCount: criticApproval.rejectedDecisionIds?.length ?? 0,
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
	regimeLabels: Record<string, z.infer<typeof RegimeDataSchema>>,
	quotes: Record<string, z.infer<typeof QuoteDataSchema>>,
	recentCloses: RecentClose[],
	errors: string[],
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
		const prompt = buildRiskManagerPrompt(
			decisions,
			constraints,
			regimeLabels,
			quotes,
			recentCloses,
		);
		log.debug(
			{ cycleId, decisionCount: decisions.length, hasConstraints: !!constraints },
			"Calling risk manager",
		);
		const response = await riskManager.generate(prompt, {
			structuredOutput: {
				schema: ApprovalSchema,
				model: getModelId(),
			},
		});

		if (response.object) {
			log.debug({ cycleId, verdict: response.object.verdict }, "Risk manager returned verdict");
			return normalizeApproval(response.object, decisions);
		}
		log.warn({ cycleId }, "Risk manager returned no structured output, using default approval");
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
		const response = await critic.generate(prompt, {
			structuredOutput: {
				schema: ApprovalSchema,
				model: getModelId(),
			},
		});

		if (response.object) {
			log.debug({ cycleId, verdict: response.object.verdict }, "Critic returned verdict");
			return normalizeApproval(response.object, decisions);
		}
		log.warn({ cycleId }, "Critic returned no structured output, using default approval");
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
	regimeLabels: Record<string, z.infer<typeof RegimeDataSchema>>,
	quotes: Record<string, z.infer<typeof QuoteDataSchema>>,
	recentCloses: RecentClose[],
): string {
	const contextSections: string[] = [];

	contextSections.push(xmlRegimes(regimeLabels));
	contextSections.push(xmlQuotes(quotes));

	if (constraints) {
		contextSections.push(`<risk_constraints>
  <per_instrument max_pct_equity="${(constraints.perInstrument.maxPctEquity * 100).toFixed(1)}%" max_notional="${constraints.perInstrument.maxNotional}" max_shares="${constraints.perInstrument.maxShares}" max_contracts="${constraints.perInstrument.maxContracts}" />
  <portfolio max_positions="${constraints.portfolio.maxPositions}" max_concentration="${(constraints.portfolio.maxConcentration * 100).toFixed(1)}%" max_gross_exposure="${(constraints.portfolio.maxGrossExposure * 100).toFixed(0)}%" max_net_exposure="${(constraints.portfolio.maxNetExposure * 100).toFixed(0)}%" max_risk_per_trade="${(constraints.portfolio.maxRiskPerTrade * 100).toFixed(1)}%" max_drawdown="${(constraints.portfolio.maxDrawdown * 100).toFixed(0)}%" max_sector_exposure="${(constraints.portfolio.maxSectorExposure * 100).toFixed(0)}%" />
  <options max_delta="${constraints.options.maxDelta}" max_gamma="${constraints.options.maxGamma}" max_vega="${constraints.options.maxVega}" max_theta="${constraints.options.maxTheta}" />
</risk_constraints>`);
	}

	contextSections.push(xmlRecentCloses(recentCloses));

	const decisionSections = decisions.map((d) => {
		const stopLine = d.stopLoss
			? `  <stop_loss price="${d.stopLoss.price}" type="${d.stopLoss.type}" />`
			: d.action === "BUY" || d.action === "SELL"
				? `  <stop_loss status="MISSING" />`
				: "";
		return `<decision id="${d.decisionId}" instrument="${d.instrumentId}" action="${d.action}" direction="${d.direction}" confidence="${d.confidence}">
  <size value="${d.size.value}" unit="${d.size.unit}" />
${stopLine}
  <rationale>${d.rationale.summary}</rationale>
</decision>`;
	});

	return `Review these trading decisions for risk compliance.

${contextSections.filter(Boolean).join("\n\n")}

<decisions>
${decisionSections.join("\n")}
</decisions>

<review_guidelines>
1. Check position sizing vs portfolio limits
2. Verify stop losses are present and appropriate for all BUY/SELL actions
3. Assess concentration risk using market_regimes for correlation analysis
4. Validate stop-loss levels against current_market_prices
5. REJECT any BUY/SELL decision without a stop-loss
6. REJECT any BUY for symbols in recent_closes_cooldown unless close reason has materially changed
</review_guidelines>

Validate stop-loss levels against current_market_prices. REJECT any BUY for symbols in recent_closes_cooldown unless close reason has materially changed.`;
}

function buildCriticPrompt(decisions: z.infer<typeof DecisionSchema>[]): string {
	const decisionSections = decisions.map(
		(
			d,
		) => `<decision id="${d.decisionId}" instrument="${d.instrumentId}" action="${d.action}" direction="${d.direction}" confidence="${d.confidence}">
  <rationale>${d.rationale.summary}</rationale>
  <bullish_factors>${d.rationale.bullishFactors.join(", ")}</bullish_factors>
  <bearish_factors>${d.rationale.bearishFactors.join(", ")}</bearish_factors>
  <decision_logic>${d.rationale.decisionLogic}</decision_logic>
</decision>`,
	);

	return `Critically review these trading decisions for logical soundness.
Focus on the quality of reasoning, not risk constraints or position sizing.

<decisions>
${decisionSections.join("\n")}
</decisions>

<review_guidelines>
1. Challenge assumptions in the rationale
2. Identify logical inconsistencies
3. Question conviction levels vs evidence
4. Suggest improvements or alternatives
</review_guidelines>

Suggest improvements or alternatives where reasoning is weak.`;
}

function normalizeApproval(
	approval: z.infer<typeof ApprovalSchema>,
	decisions: z.infer<typeof DecisionSchema>[],
): z.infer<typeof ApprovalSchema> {
	const allDecisionIds = decisions.map((d) => d.decisionId);

	let approvedDecisionIds: string[];
	if (approval.approvedDecisionIds && approval.approvedDecisionIds.length > 0) {
		approvedDecisionIds = approval.approvedDecisionIds;
	} else if (approval.verdict === "APPROVE") {
		approvedDecisionIds = allDecisionIds;
	} else if (approval.verdict === "REJECT") {
		approvedDecisionIds = [];
	} else {
		const rejectedIds = new Set(approval.rejectedDecisionIds ?? []);
		approvedDecisionIds = allDecisionIds.filter((id) => !rejectedIds.has(id));
	}

	return {
		...approval,
		approvedDecisionIds,
		rejectedDecisionIds: approval.rejectedDecisionIds ?? [],
		violations: approval.violations ?? [],
		required_changes: approval.required_changes ?? [],
		notes: approval.notes ?? "",
	};
}

function formatError(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}
