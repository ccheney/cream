/**
 * Cycle persistence helpers for completed/failed workflow runs.
 */

import type { CreamEnvironment } from "@cream/domain";
import { getCyclesRepo, getDecisionsRepo } from "../../src/db.js";
import log from "../../src/logger.js";
import { updateCycleState } from "../../src/routes/system/state.js";
import { flushSync } from "../../src/services/cycle-event-persistence.js";
import { broadcastCycleProgress } from "../../src/websocket/handler.js";
import type { WorkflowResult } from "./cycles.trigger-runner.js";

export const VALID_SIZE_UNITS = ["SHARES", "CONTRACTS", "DOLLARS", "PCT_EQUITY"] as const;
type SizeUnit = (typeof VALID_SIZE_UNITS)[number];
type WorkflowDecision = {
	decisionId: string;
	instrumentId: string;
	action: "BUY" | "SELL" | "HOLD" | "CLOSE";
	direction: "LONG" | "SHORT" | "FLAT";
	size: {
		value: number;
		unit: string;
	};
	stopLoss?: { price: number; type: "FIXED" | "TRAILING" };
	takeProfit?: { price: number };
	strategyFamily: string;
	timeHorizon: string;
	rationale?: {
		summary?: string;
		bullishFactors?: string[];
		bearishFactors?: string[];
		decisionLogic?: string;
		memoryReferences?: string[];
	};
	thesisState?: string;
	legs?: Array<{
		symbol: string;
		ratioQty: number;
		positionIntent: "BUY_TO_OPEN" | "BUY_TO_CLOSE" | "SELL_TO_OPEN" | "SELL_TO_CLOSE";
	}>;
	netLimitPrice?: number;
};

export async function flushSyncSafe(cycleId: string): Promise<void> {
	try {
		await flushSync(cycleId);
	} catch {
		// Non-critical
	}
}

export async function markCycleFailed(params: {
	cycleId: string;
	durationMs: number;
	error: string;
}): Promise<void> {
	const { cycleId, durationMs, error } = params;
	const cyclesRepo = getCyclesRepo();
	try {
		await cyclesRepo.fail(cycleId, error, undefined, durationMs);
	} catch {
		// Non-critical
	}
}

export async function finalizeCycleState(params: {
	cycleId: string;
	environment: CreamEnvironment;
	result: WorkflowResult;
	durationMs: number;
	emitProgress: (phase: string, progress: number, step: string, message: string) => void;
	emitResult: (
		status: "completed" | "failed",
		durationMs: number,
		workflowResult?: WorkflowResult,
		error?: string,
	) => void;
}): Promise<void> {
	const { cycleId, environment, result, durationMs, emitProgress, emitResult } = params;

	await flushSyncSafe(cycleId);
	await updateCycleState(environment, cycleId, "complete");
	await persistWorkflowDecisions({ cycleId, environment, result });

	const cyclesRepo = getCyclesRepo();
	const decisionsRepo = await getDecisionsRepo();
	const decisionsResult = await decisionsRepo.findMany({ cycleId, environment });
	const decisionSummaries = decisionsResult.data.map((decision) => ({
		symbol: decision.symbol,
		action: decision.action as "BUY" | "SELL" | "HOLD",
		direction: decision.direction as "LONG" | "SHORT" | "FLAT",
		confidence: decision.confidenceScore ?? 0,
	}));

	await cyclesRepo.complete(cycleId, {
		approved: result.approved,
		iterations: result.iterations,
		decisions: decisionSummaries,
		orders: (result.orderSubmission?.orderIds ?? []).map((orderId) => ({
			orderId,
			symbol: "unknown",
			side: "buy" as const,
			quantity: 0,
			status: "submitted" as const,
		})),
		durationMs,
	});

	const statusMessage = result.approved
		? `Cycle completed: ${result.iterations} iteration(s), plan approved`
		: `Cycle completed: ${result.iterations} iteration(s), plan rejected`;
	emitProgress("complete", 100, "done", statusMessage);
	emitResult("completed", durationMs, result);

	if (decisionsResult.data.length > 0) {
		broadcastCycleProgress({
			type: "cycle_progress",
			data: {
				cycleId,
				phase: "complete" as const,
				step: "decisions_ready",
				progress: 100,
				message: `${decisionsResult.data.length} decision(s) ready`,
				timestamp: new Date().toISOString(),
			},
		});
	}
}

async function persistWorkflowDecisions(params: {
	cycleId: string;
	environment: CreamEnvironment;
	result: WorkflowResult;
}): Promise<void> {
	const { cycleId, environment, result } = params;
	const decisionPlan = result.decisionPlan?.decisions;
	if (!decisionPlan?.length) {
		logNoDecisionPlan(cycleId, result);
		return;
	}

	logDecisionPlan(cycleId, decisionPlan);
	const decisionsRepo = await getDecisionsRepo();
	const status = result.approved ? "approved" : "rejected";
	const persistedCount = await persistDecisionPlan({
		decisionsRepo,
		cycleId,
		environment,
		status,
		decisionPlan,
		result,
	});

	log.info(
		{ cycleId, persistedCount, total: decisionPlan.length },
		"Decision persistence complete",
	);
}

function logNoDecisionPlan(cycleId: string, result: WorkflowResult): void {
	log.warn(
		{
			cycleId,
			hasDecisionPlan: !!result.decisionPlan,
			hasDecisions: !!result.decisionPlan?.decisions,
			decisionCount: result.decisionPlan?.decisions?.length ?? 0,
			workflowResultKeys: Object.keys(result),
		},
		"No decisions in workflow result to persist",
	);
}

function logDecisionPlan(cycleId: string, decisionPlan: WorkflowDecision[]): void {
	log.info(
		{
			cycleId,
			decisionCount: decisionPlan.length,
			decisions: decisionPlan.map((decision) => ({
				id: decision.decisionId,
				symbol: decision.instrumentId,
				action: decision.action,
				size: decision.size,
			})),
		},
		"Persisting decisions from workflow",
	);
}

async function persistDecisionPlan(params: {
	decisionsRepo: Awaited<ReturnType<typeof getDecisionsRepo>>;
	cycleId: string;
	environment: CreamEnvironment;
	status: "approved" | "rejected";
	decisionPlan: WorkflowDecision[];
	result: WorkflowResult;
}): Promise<number> {
	const { decisionsRepo, cycleId, environment, status, decisionPlan, result } = params;
	let persistedCount = 0;

	for (const decision of decisionPlan) {
		const sizeUnit = normalizeSizeUnit(decision.size.unit);
		const approvalMetadata = buildApprovalMetadata(decision.decisionId, result);
		const fullMetadata = buildDecisionMetadata(decision, approvalMetadata);

		const persisted = await createDecisionRecord({
			decisionsRepo,
			cycleId,
			direction: decision.direction,
			action: decision.action,
			symbol: decision.instrumentId,
			size: Math.abs(decision.size.value),
			sizeUnit,
			status,
			environment,
			rationale: decision.rationale?.summary ?? null,
			bullishFactors: decision.rationale?.bullishFactors ?? [],
			bearishFactors: decision.rationale?.bearishFactors ?? [],
			strategyFamily: decision.strategyFamily,
			timeHorizon: decision.timeHorizon,
			stopPrice: decision.stopLoss?.price ?? null,
			targetPrice: decision.takeProfit?.price ?? null,
			metadata: fullMetadata,
			decisionId: decision.decisionId,
		});
		if (persisted) {
			persistedCount++;
		}
	}

	return persistedCount;
}

type DecisionCreateInput = {
	decisionsRepo: Awaited<ReturnType<typeof getDecisionsRepo>>;
	cycleId: string;
	action: "BUY" | "SELL" | "HOLD" | "CLOSE";
	direction: "LONG" | "SHORT" | "FLAT";
	symbol: string;
	size: number;
	sizeUnit: SizeUnit | undefined;
	status: "approved" | "rejected";
	environment: CreamEnvironment;
	rationale: string | null;
	bullishFactors: string[];
	bearishFactors: string[];
	strategyFamily: string;
	timeHorizon: string;
	stopPrice: number | null;
	targetPrice: number | null;
	metadata: Record<string, unknown>;
	decisionId: string;
};

async function createDecisionRecord(params: DecisionCreateInput): Promise<boolean> {
	const {
		decisionsRepo,
		cycleId,
		action,
		direction,
		symbol,
		size,
		sizeUnit,
		status,
		environment,
		rationale,
		bullishFactors,
		bearishFactors,
		strategyFamily,
		timeHorizon,
		stopPrice,
		targetPrice,
		metadata,
		decisionId,
	} = params;

	try {
		await decisionsRepo.create({
			id: decisionId,
			cycleId,
			symbol,
			action,
			direction,
			size,
			sizeUnit,
			status,
			strategyFamily,
			timeHorizon,
			rationale,
			bullishFactors,
			bearishFactors,
			environment,
			stopPrice,
			targetPrice,
			metadata,
		});
		return true;
	} catch (err) {
		log.error(
			{
				decisionId,
				symbol,
				size,
				error: err instanceof Error ? err.message : String(err),
			},
			"Failed to persist decision",
		);
		return false;
	}
}

function normalizeSizeUnit(unit: string): SizeUnit | undefined {
	return VALID_SIZE_UNITS.includes(unit as SizeUnit) ? (unit as SizeUnit) : undefined;
}

function buildDecisionMetadata(
	decision: WorkflowDecision,
	approvalMetadata: Record<string, unknown>,
): Record<string, unknown> {
	return {
		...approvalMetadata,
		stopLoss: decision.stopLoss ?? null,
		takeProfit: decision.takeProfit ?? null,
		thesisState: decision.thesisState ?? null,
		decisionLogic: decision.rationale?.decisionLogic ?? null,
		memoryReferences: decision.rationale?.memoryReferences ?? [],
		legs: decision.legs ?? [],
		netLimitPrice: decision.netLimitPrice ?? null,
		originalAction: decision.action,
	};
}

function buildApprovalMetadata(
	decisionId: string,
	result: WorkflowResult,
): Record<string, unknown> {
	const approvalMetadata: Record<string, unknown> = {};
	if (result.riskApproval) {
		const decisionViolations = result.riskApproval.violations?.filter((violation) =>
			violation.affected_decisions?.includes(decisionId),
		);
		const decisionChanges = result.riskApproval.required_changes?.filter(
			(change) => change.decisionId === decisionId,
		);
		approvalMetadata.riskApproval = {
			verdict: result.riskApproval.verdict,
			notes: result.riskApproval.notes,
			violations: decisionViolations?.length ? decisionViolations : undefined,
			requiredChanges: decisionChanges?.length ? decisionChanges : undefined,
		};
	}
	if (result.criticApproval) {
		const decisionViolations = result.criticApproval.violations?.filter((violation) =>
			violation.affected_decisions?.includes(decisionId),
		);
		const decisionChanges = result.criticApproval.required_changes?.filter(
			(change) => change.decisionId === decisionId,
		);
		approvalMetadata.criticApproval = {
			verdict: result.criticApproval.verdict,
			notes: result.criticApproval.notes,
			violations: decisionViolations?.length ? decisionViolations : undefined,
			requiredChanges: decisionChanges?.length ? decisionChanges : undefined,
		};
	}
	return approvalMetadata;
}
