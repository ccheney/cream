/**
 * Cycle Workflow Runner
 *
 * Runs trading cycle workflow and streams/normalizes agent events into websocket + persistence.
 */

import { enrichPositions, type PortfolioPosition } from "@cream/agents";
import { createAlpacaClient } from "@cream/broker";
import type { CreamEnvironment } from "@cream/domain";
import { createContext } from "@cream/domain";
import type { CyclePhase, CycleProgressData, CycleResultData } from "@cream/domain/websocket";
import { type EnrichedPosition, mastra } from "@cream/mastra";
import { getThesesRepo } from "../../src/db.js";
import log from "../../src/logger.js";
import type { CycleState } from "../../src/routes/system/types.js";
import { broadcastCycleProgress, broadcastCycleResult } from "../../src/websocket/handler.js";
import {
	extractAgentEvent,
	handleAgentEvent,
	handleWorkflowStepFinish,
	toRecord,
	traceWorkflowEvent,
} from "./cycles.trigger-events.js";
import {
	finalizeCycleState,
	flushSyncSafe,
	markCycleFailed,
} from "./cycles.trigger-persistence.js";

type EmitProgress = (phase: CyclePhase, progress: number, step: string, message: string) => void;
type EmitResult = (
	status: "completed" | "failed",
	durationMs: number,
	workflowResult?: WorkflowResult,
	error?: string,
) => void;

type TriggerCycleWorkflowContext = {
	cycleId: string;
	environment: CreamEnvironment;
	resolvedSymbols: string[];
	useDraftConfig: boolean;
	configVersion: string | null;
	cycleState: CycleState;
};

type WorkflowDecisionSize = {
	value: number;
	unit: string;
};

type WorkflowDecision = {
	decisionId: string;
	instrumentId: string;
	action: "BUY" | "SELL" | "HOLD" | "CLOSE";
	direction: "LONG" | "SHORT" | "FLAT";
	size: WorkflowDecisionSize;
	stopLoss?: { price: number; type: "FIXED" | "TRAILING" };
	takeProfit?: { price: number };
	strategyFamily: string;
	timeHorizon: string;
	rationale: {
		summary: string;
		bullishFactors: string[];
		bearishFactors: string[];
		decisionLogic: string;
		memoryReferences: string[];
	};
	thesisState: string;
	confidence: number;
	legs?: Array<{
		symbol: string;
		ratioQty: number;
		positionIntent: "BUY_TO_OPEN" | "BUY_TO_CLOSE" | "SELL_TO_OPEN" | "SELL_TO_CLOSE";
	}>;
	netLimitPrice?: number;
};

type WorkflowDecisionPlan = {
	decisions: WorkflowDecision[];
};

type WorkflowApproval = {
	verdict: "APPROVE" | "REJECT";
	notes?: string;
	violations?: Array<{
		constraint: string;
		current_value: string | number;
		limit: string | number;
		severity: "CRITICAL" | "WARNING";
		affected_decisions: string[];
	}>;
	required_changes?: Array<{
		decisionId: string;
		change: string;
		reason: string;
	}>;
};

export type WorkflowResult = {
	cycleId: string;
	approved: boolean;
	iterations: number;
	orderSubmission: { submitted: boolean; orderIds: string[]; errors: string[] };
	decisionPlan?: WorkflowDecisionPlan;
	riskApproval?: WorkflowApproval;
	criticApproval?: WorkflowApproval;
	mode: "STUB" | "LLM";
	configVersion: string | null;
};

const FALLBACK_RESULT: WorkflowResult = {
	cycleId: "",
	approved: false,
	iterations: 0,
	orderSubmission: { submitted: false, orderIds: [], errors: ["No result returned"] },
	mode: "STUB",
	configVersion: null,
};

type WorkflowStream = {
	fullStream: AsyncIterable<unknown>;
	status: "running" | "success" | "failed";
	result?: Promise<unknown>;
};

export async function runCycleWorkflow(context: TriggerCycleWorkflowContext): Promise<void> {
	const { cycleId, environment, resolvedSymbols, useDraftConfig, configVersion, cycleState } =
		context;
	const startTime = Date.now();
	cycleState.status = "running";
	const emitProgress = createProgressEmitter(cycleId, cycleState);
	const emitResult = createResultEmitter(cycleId, environment, configVersion);

	emitProgress("observe", 0, "starting", "Starting trading cycle...");

	try {
		const workflowResult = await executeWorkflow({
			cycleId,
			environment,
			resolvedSymbols,
			useDraftConfig,
			emitProgress,
		});

		cycleState.status = "completed";
		cycleState.completedAt = new Date().toISOString();
		const durationMs = Date.now() - startTime;
		await finalizeCycleState({
			cycleId,
			environment,
			result: workflowResult ?? FALLBACK_RESULT,
			durationMs,
			emitProgress,
			emitResult,
		});
	} catch (error) {
		await handleWorkflowFailure({
			cycleId,
			environment,
			startTime,
			cycleState,
			emitProgress,
			emitResult,
			error,
		});
	}
}

function createProgressEmitter(cycleId: string, cycleState: CycleState): EmitProgress {
	return (phase, progress, step, message) => {
		cycleState.phase = phase.toLowerCase() as CycleState["phase"];
		broadcastCycleProgress({
			type: "cycle_progress",
			data: {
				cycleId,
				phase,
				step,
				progress,
				message,
				timestamp: new Date().toISOString(),
			} as CycleProgressData,
		});
	};
}

function createResultEmitter(
	cycleId: string,
	environment: CreamEnvironment,
	configVersion: string | null,
): EmitResult {
	return (status, durationMs, workflowResult, error) => {
		broadcastCycleResult({
			type: "cycle_result",
			data: {
				cycleId,
				environment,
				status,
				durationMs,
				configVersion: configVersion ?? undefined,
				error,
				result:
					status === "completed" && workflowResult
						? {
								approved: workflowResult.approved,
								iterations: workflowResult.iterations,
								decisions: [],
								orders: (workflowResult.orderSubmission?.orderIds ?? []).map((orderId) => ({
									orderId,
									symbol: "unknown",
									side: "buy" as const,
									quantity: 0,
									status: "submitted" as const,
								})),
							}
						: undefined,
				timestamp: new Date().toISOString(),
			} as CycleResultData,
		});
	};
}

async function executeWorkflow(params: {
	cycleId: string;
	environment: CreamEnvironment;
	resolvedSymbols: string[];
	useDraftConfig: boolean;
	emitProgress: EmitProgress;
}): Promise<WorkflowResult | null> {
	const { cycleId, environment, resolvedSymbols, useDraftConfig, emitProgress } = params;
	emitProgress("observe", 10, "market_data", "Fetching market data...");

	const recentCloses = await loadCooldownCloses(environment, cycleId);
	const enrichedPositions = await loadEnrichedPositions(environment, cycleId);

	const workflow = mastra.getWorkflow("tradingCycleWorkflow");
	const run = await workflow.createRun();
	const stream = await run.stream({
		inputData: {
			cycleId,
			instruments: resolvedSymbols,
			useDraftConfig,
			recentCloses,
			positions: enrichedPositions,
		},
	});

	return consumeWorkflowStream(stream, { cycleId, emitProgress });
}

async function consumeWorkflowStream(
	stream: WorkflowStream,
	deps: { cycleId: string; emitProgress: EmitProgress },
): Promise<WorkflowResult | null> {
	const { cycleId, emitProgress } = deps;
	await processWorkflowEvents(stream.fullStream, { cycleId, emitProgress });
	ensureWorkflowSucceeded(stream.status, cycleId);
	return extractWorkflowResult(stream.result, cycleId);
}

async function processWorkflowEvents(
	fullStream: AsyncIterable<unknown>,
	deps: { cycleId: string; emitProgress: EmitProgress },
): Promise<void> {
	const { cycleId, emitProgress } = deps;
	const seenEventTypes = new Set<string>();
	const seenStepNames = new Set<string>();

	for await (const event of fullStream) {
		const evt = toRecord(event);
		traceWorkflowEvent(evt, seenEventTypes, seenStepNames);
		const agentEvent = extractAgentEvent(evt);
		if (agentEvent) {
			handleAgentEvent(agentEvent, cycleId);
		}
		if (evt.type === "workflow-step-finish") {
			handleWorkflowStepFinish(evt, emitProgress);
		}
	}
}

function ensureWorkflowSucceeded(status: WorkflowStream["status"], cycleId: string): void {
	if (status !== "success") {
		log.error({ cycleId, status }, "Workflow execution failed");
		throw new Error("Workflow execution failed");
	}
}

async function extractWorkflowResult(
	result: Promise<unknown> | undefined,
	cycleId: string,
): Promise<WorkflowResult | null> {
	if (!result) {
		log.warn({ cycleId }, "No stream.result available");
		return null;
	}

	const rawResult = await result;
	log.debug(
		{
			cycleId,
			hasRawResult: !!rawResult,
			rawResultKeys: rawResult ? Object.keys(rawResult as object) : [],
		},
		"Raw workflow result received",
	);
	const actualResult = (rawResult as { result?: WorkflowResult })?.result;
	log.debug(
		{
			cycleId,
			hasActualResult: !!actualResult,
			actualResultKeys: actualResult ? Object.keys(actualResult as object) : [],
			hasDecisionPlan: !!actualResult?.decisionPlan,
		},
		"Extracted workflow result",
	);

	return actualResult ?? null;
}

async function handleWorkflowFailure(params: {
	cycleId: string;
	environment: CreamEnvironment;
	startTime: number;
	cycleState: CycleState;
	emitProgress: EmitProgress;
	emitResult: EmitResult;
	error: unknown;
}): Promise<void> {
	const { cycleId, startTime, cycleState, emitProgress, emitResult, error } = params;
	const durationMs = Date.now() - startTime;
	cycleState.status = "failed";
	cycleState.completedAt = new Date().toISOString();
	cycleState.error = error instanceof Error ? error.message : "Unknown error";

	await flushSyncSafe(cycleId);
	await markCycleFailed({ cycleId, durationMs, error: cycleState.error });
	emitProgress("error", 0, "failed", `Cycle failed: ${cycleState.error}`);
	emitResult("failed", durationMs, undefined, cycleState.error);
}

async function loadCooldownCloses(environment: CreamEnvironment, cycleId: string) {
	const thesesRepo = getThesesRepo();
	const symbolsOnCooldown = await thesesRepo.findSymbolsOnCooldown(environment);
	const recentCloses = symbolsOnCooldown.map((item) => ({
		symbol: item.instrumentId,
		closedAt: item.closedAt ?? new Date().toISOString(),
		closePrice: null as number | null,
		closeReason: item.closeReason,
		cooldownUntil: item.cooldownUntil,
		rationale: null as string | null,
	}));

	if (recentCloses.length > 0) {
		log.info(
			{ cycleId, cooldownSymbols: recentCloses.map((c) => c.symbol) },
			"Found symbols on cooldown - passing to workflow",
		);
	}
	return recentCloses;
}

async function loadEnrichedPositions(
	environment: CreamEnvironment,
	cycleId: string,
): Promise<EnrichedPosition[]> {
	if (!Bun.env.ALPACA_KEY || !Bun.env.ALPACA_SECRET) {
		return [];
	}
	try {
		const brokerClient = createAlpacaClient({
			apiKey: Bun.env.ALPACA_KEY,
			apiSecret: Bun.env.ALPACA_SECRET,
			environment,
		});

		const alpacaPositions = await brokerClient.getPositions();
		const portfolioPositions: PortfolioPosition[] = alpacaPositions.map((position) => ({
			symbol: position.symbol,
			quantity: position.qty,
			averageCost: position.avgEntryPrice,
			marketValue: position.marketValue,
			unrealizedPnL: position.unrealizedPl,
		}));

		const context = createContext(environment, "scheduled");
		const enrichedPortfolio = await enrichPositions(portfolioPositions, context);

		const enrichedPositions = enrichedPortfolio.map((ep) => ({
			symbol: ep.symbol,
			quantity: ep.quantity,
			side: ep.quantity >= 0 ? ("long" as const) : ("short" as const),
			averageCost: ep.averageCost,
			marketValue: ep.marketValue,
			unrealizedPnl: ep.unrealizedPnL,
			unrealizedPnlPct:
				ep.averageCost > 0 ? (ep.unrealizedPnL / (ep.averageCost * ep.quantity)) * 100 : 0,
			holdingDays: ep.holdingDays,
			riskParams: ep.riskParams,
			thesis: ep.thesis,
		}));

		log.info({ cycleId, positionCount: enrichedPositions.length }, "Enriched positions for cycle");
		return enrichedPositions;
	} catch (error) {
		log.warn({ cycleId, error }, "Failed to fetch positions, continuing without");
		return [];
	}
}
