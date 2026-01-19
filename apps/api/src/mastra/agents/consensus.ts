/**
 * Consensus loop orchestration for trading decisions.
 *
 * Coordinates the full agent network: analysts -> debate -> trader -> approval.
 * Handles plan revision when approvers reject.
 */

import type { AnalystOutputs } from "./analysts.js";
import { runAnalystsParallel, runAnalystsParallelStreaming } from "./analysts.js";
import { runApprovalParallel, runApprovalParallelStreaming } from "./approvers.js";
import { runDebateParallel, runDebateParallelStreaming } from "./researchers.js";
import type { DebateOutputs } from "./trader.js";
import { revisePlan, runTrader, runTraderStreaming } from "./trader.js";
import type {
	AgentContext,
	CriticOutput,
	DecisionPlan,
	OnStreamChunk,
	RiskManagerOutput,
} from "./types.js";

// Re-export types for convenience
export type { AnalystOutputs, DebateOutputs };

// ============================================
// Constants
// ============================================

/** Maximum number of revision attempts before giving up */
const MAX_REVISION_ATTEMPTS = 3;

// ============================================
// Consensus Result Types
// ============================================

export interface ConsensusResult {
	/** The final approved plan (or last rejected plan if all attempts failed) */
	plan: DecisionPlan;
	/** Whether the plan was approved */
	approved: boolean;
	/** Risk manager output from final approval attempt */
	riskManager: RiskManagerOutput;
	/** Critic output from final approval attempt */
	critic: CriticOutput;
	/** Intermediate outputs for debugging/logging */
	intermediates: {
		analystOutputs: AnalystOutputs;
		debateOutputs: DebateOutputs;
		revisionAttempts: number;
	};
}

// ============================================
// Consensus Loop Functions
// ============================================

/**
 * Extract rejection reasons from approval outputs.
 */
function extractRejectionReasons(riskManager: RiskManagerOutput, critic: CriticOutput): string[] {
	const reasons: string[] = [];

	if (riskManager.verdict === "REJECT") {
		for (const violation of riskManager.violations) {
			reasons.push(`Risk: ${violation.constraint} - ${violation.severity}`);
		}
		for (const change of riskManager.required_changes) {
			reasons.push(`Risk change required: ${change.change} (${change.reason})`);
		}
	}

	if (critic.verdict === "REJECT") {
		for (const violation of critic.violations) {
			reasons.push(
				`Critic: ${violation.constraint} (${violation.current_value} vs ${violation.limit}) - ${violation.severity}`
			);
		}
		for (const change of critic.required_changes) {
			reasons.push(`Critic change required: ${change.change} (${change.reason})`);
		}
		if (critic.notes) {
			reasons.push(`Critic notes: ${critic.notes}`);
		}
	}

	return reasons;
}

/**
 * Run the full consensus loop without streaming.
 *
 * Flow:
 * 1. Run analysts in parallel (technical, news, fundamentals)
 * 2. Run debate phase in parallel (bullish vs bearish researchers)
 * 3. Trader synthesizes DecisionPlan
 * 4. Approvers validate (risk manager + critic)
 * 5. If rejected, revise plan and re-validate (up to MAX_REVISION_ATTEMPTS)
 */
export async function runConsensusLoop(
	context: AgentContext,
	portfolioState?: Record<string, unknown>,
	constraints?: Record<string, unknown>
): Promise<ConsensusResult> {
	// Phase 1: Analysts
	const analystOutputs = await runAnalystsParallel(context);

	// Phase 2: Debate
	const debateOutputs = await runDebateParallel(context, analystOutputs);

	// Phase 3: Initial trading plan
	let plan = await runTrader(context, debateOutputs, portfolioState);

	// Phase 4: Approval loop with revisions
	let revisionAttempts = 0;
	// These will always be assigned in the first iteration (0 <= MAX_REVISION_ATTEMPTS)
	let riskManager!: RiskManagerOutput;
	let critic!: CriticOutput;

	while (revisionAttempts <= MAX_REVISION_ATTEMPTS) {
		const approval = await runApprovalParallel(
			plan,
			analystOutputs,
			debateOutputs,
			portfolioState,
			constraints,
			context.agentConfigs
		);

		riskManager = approval.riskManager;
		critic = approval.critic;

		const approved = riskManager.verdict === "APPROVE" && critic.verdict === "APPROVE";

		if (approved) {
			return {
				plan,
				approved: true,
				riskManager,
				critic,
				intermediates: {
					analystOutputs,
					debateOutputs,
					revisionAttempts,
				},
			};
		}

		if (revisionAttempts >= MAX_REVISION_ATTEMPTS) {
			break;
		}

		// Revise plan based on rejection feedback
		const rejectionReasons = extractRejectionReasons(riskManager, critic);
		plan = await revisePlan(
			plan,
			rejectionReasons,
			analystOutputs,
			debateOutputs,
			context.agentConfigs
		);
		revisionAttempts++;
	}

	// Return last rejected plan
	return {
		plan,
		approved: false,
		riskManager,
		critic,
		intermediates: {
			analystOutputs,
			debateOutputs,
			revisionAttempts,
		},
	};
}

/**
 * Run the full consensus loop with streaming.
 *
 * Same flow as runConsensusLoop but emits stream chunks via callback.
 */
export async function runConsensusLoopStreaming(
	context: AgentContext,
	onChunk: OnStreamChunk,
	portfolioState?: Record<string, unknown>,
	constraints?: Record<string, unknown>
): Promise<ConsensusResult> {
	// Phase 1: Analysts
	const analystOutputs = await runAnalystsParallelStreaming(context, onChunk);

	// Phase 2: Debate
	const debateOutputs = await runDebateParallelStreaming(context, analystOutputs, onChunk);

	// Phase 3: Initial trading plan
	let plan = await runTraderStreaming(context, debateOutputs, onChunk, portfolioState);

	// Phase 4: Approval loop with revisions
	let revisionAttempts = 0;
	// These will always be assigned in the first iteration (0 <= MAX_REVISION_ATTEMPTS)
	let riskManager!: RiskManagerOutput;
	let critic!: CriticOutput;

	while (revisionAttempts <= MAX_REVISION_ATTEMPTS) {
		const approval = await runApprovalParallelStreaming(
			plan,
			analystOutputs,
			debateOutputs,
			onChunk,
			portfolioState,
			constraints,
			context.agentConfigs
		);

		riskManager = approval.riskManager;
		critic = approval.critic;

		const approved = riskManager.verdict === "APPROVE" && critic.verdict === "APPROVE";

		if (approved) {
			return {
				plan,
				approved: true,
				riskManager,
				critic,
				intermediates: {
					analystOutputs,
					debateOutputs,
					revisionAttempts,
				},
			};
		}

		if (revisionAttempts >= MAX_REVISION_ATTEMPTS) {
			break;
		}

		// Revise plan based on rejection feedback (no streaming for revision)
		const rejectionReasons = extractRejectionReasons(riskManager, critic);
		plan = await revisePlan(
			plan,
			rejectionReasons,
			analystOutputs,
			debateOutputs,
			context.agentConfigs
		);
		revisionAttempts++;
	}

	// Return last rejected plan
	return {
		plan,
		approved: false,
		riskManager,
		critic,
		intermediates: {
			analystOutputs,
			debateOutputs,
			revisionAttempts,
		},
	};
}
