/**
 * Act Step
 *
 * Eighth and final step in the OODA trading cycle. Submits approved orders
 * to the execution engine and returns the final workflow result.
 *
 * @see docs/plans/53-mastra-v1-migration.md
 */

import { create } from "@bufbuild/protobuf";
import { createAlpacaClient, type PositionSide } from "@cream/broker";
import { requireEnv } from "@cream/domain/env";
import { createExecutionClient } from "@cream/domain/grpc";
import { createNodeLogger } from "@cream/logger";
import { InstrumentType, OrderType, TimeInForce } from "@cream/schema-gen/cream/v1/common";
import { OrderSide, SubmitOrderRequestSchema } from "@cream/schema-gen/cream/v1/execution";
import { createStep } from "@mastra/core/workflows";
import { z } from "zod";

import {
	ApprovalSchema,
	DecisionPlanSchema,
	type ThesisUpdateSchema,
	WorkflowResultSchema,
} from "../schemas.js";

const log = createNodeLogger({ service: "trading-cycle:act" });

// ============================================
// Schemas
// ============================================

const ActInputSchema = z.object({
	cycleId: z.string().describe("Unique identifier for this trading cycle"),
	approved: z.boolean().describe("Whether the decision plan was approved"),
	iterations: z.number().describe("Number of consensus iterations"),
	decisionPlan: DecisionPlanSchema.optional().describe("Decision plan from trader step"),
	riskApproval: ApprovalSchema.optional().describe("Risk manager approval"),
	criticApproval: ApprovalSchema.optional().describe("Critic approval"),
	mode: z.enum(["STUB", "LLM"]).optional().describe("Execution mode"),
});

type ActInput = z.infer<typeof ActInputSchema>;
type DecisionPlan = z.infer<typeof DecisionPlanSchema>;
type Decision = DecisionPlan["decisions"][number];
type WorkflowResult = z.infer<typeof WorkflowResultSchema>;
type ThesisUpdate = z.infer<typeof ThesisUpdateSchema>;

// ============================================
// Step Definition
// ============================================

export const actStep = createStep({
	id: "act-execute",
	description: "Submit orders and finalize workflow result",
	inputSchema: ActInputSchema,
	outputSchema: WorkflowResultSchema,
	execute: async ({ inputData }) => executeActStep(inputData),
});

// ============================================
// Helper Functions
// ============================================

async function executeActStep(inputData: ActInput): Promise<WorkflowResult> {
	const { cycleId, approved, iterations, decisionPlan, riskApproval, criticApproval, mode } =
		inputData;
	let orderSubmission = createOrderSubmissionResult();
	let thesisUpdates: ThesisUpdate[] = [];

	if (approved && decisionPlan) {
		const executionResult = await executeApprovedDecisions(
			cycleId,
			decisionPlan,
			riskApproval,
			criticApproval,
		);
		orderSubmission = executionResult.orderSubmission;
		thesisUpdates = executionResult.thesisUpdates;
	}

	return {
		cycleId,
		approved,
		iterations,
		orderSubmission,
		decisionPlan,
		riskApproval,
		criticApproval,
		mode: mode ?? "STUB",
		configVersion: null,
		thesisUpdates: thesisUpdates.length > 0 ? thesisUpdates : undefined,
		thesisMemoryIngestion: undefined,
	};
}

async function executeApprovedDecisions(
	cycleId: string,
	decisionPlan: DecisionPlan,
	riskApproval: z.infer<typeof ApprovalSchema> | undefined,
	criticApproval: z.infer<typeof ApprovalSchema> | undefined,
): Promise<{ orderSubmission: OrderSubmissionResult; thesisUpdates: ThesisUpdate[] }> {
	const approvedDecisions = selectDecisionsApprovedByBoth(
		cycleId,
		decisionPlan,
		riskApproval,
		criticApproval,
	);
	if (approvedDecisions.length === 0) {
		return {
			orderSubmission: {
				submitted: false,
				orderIds: [],
				errors: ["No decisions approved by both risk manager and critic"],
			},
			thesisUpdates: [],
		};
	}

	const filteredPlan: DecisionPlan = { ...decisionPlan, decisions: approvedDecisions };
	const constraintCheck = await checkConstraints(filteredPlan);
	if (!constraintCheck.passed) {
		return {
			orderSubmission: { submitted: false, orderIds: [], errors: constraintCheck.violations },
			thesisUpdates: [],
		};
	}

	return {
		orderSubmission: await submitOrders(cycleId, filteredPlan),
		thesisUpdates: buildThesisUpdates(approvedDecisions),
	};
}

function selectDecisionsApprovedByBoth(
	cycleId: string,
	decisionPlan: DecisionPlan,
	riskApproval: z.infer<typeof ApprovalSchema> | undefined,
	criticApproval: z.infer<typeof ApprovalSchema> | undefined,
): Decision[] {
	const allDecisionIds = decisionPlan.decisions.map((decision) => decision.decisionId);
	const effectiveRiskApproved = resolveApprovedDecisionIds(allDecisionIds, riskApproval);
	const effectiveCriticApproved = resolveApprovedDecisionIds(allDecisionIds, criticApproval);
	const approvedDecisions = decisionPlan.decisions.filter(
		(decision) =>
			effectiveRiskApproved.has(decision.decisionId) &&
			effectiveCriticApproved.has(decision.decisionId),
	);

	log.info(
		{
			cycleId,
			totalDecisions: decisionPlan.decisions.length,
			approvedByRisk: effectiveRiskApproved.size,
			approvedByCritic: effectiveCriticApproved.size,
			approvedByBoth: approvedDecisions.length,
			approvedSymbols: approvedDecisions.map((decision) => decision.instrumentId),
		},
		"Filtered decisions for execution",
	);

	return approvedDecisions;
}

function resolveApprovedDecisionIds(
	allDecisionIds: string[],
	approval: z.infer<typeof ApprovalSchema> | undefined,
): Set<string> {
	const explicitlyApproved = new Set(approval?.approvedDecisionIds ?? []);
	if (approval?.verdict === "APPROVE" && explicitlyApproved.size === 0) {
		return new Set(allDecisionIds);
	}
	return explicitlyApproved;
}

function buildThesisUpdates(decisions: Decision[]): ThesisUpdate[] {
	return decisions.map((decision) => ({
		thesisId: `thesis-${decision.instrumentId}`,
		instrumentId: decision.instrumentId,
		fromState: null,
		toState: decision.thesisState,
		action: decision.action,
		reason: decision.rationale.summary,
	}));
}

function createOrderSubmissionResult(): OrderSubmissionResult {
	return {
		submitted: false,
		orderIds: [],
		errors: [],
	};
}

interface ConstraintCheckResult {
	passed: boolean;
	violations: string[];
}

async function checkConstraints(
	decisionPlan: z.infer<typeof DecisionPlanSchema>,
): Promise<ConstraintCheckResult> {
	const violations: string[] = [];

	for (const decision of decisionPlan.decisions) {
		if (decision.action === "BUY" && !decision.stopLoss && decision.instrumentType !== "OPTION") {
			violations.push(`${decision.instrumentId}: Buy order missing stop loss`);
		}

		if (decision.confidence < 0.3) {
			violations.push(`${decision.instrumentId}: Confidence too low (${decision.confidence})`);
		}
	}

	return {
		passed: violations.length === 0,
		violations,
	};
}

interface OrderSubmissionResult {
	submitted: boolean;
	orderIds: string[];
	errors: string[];
}

/**
 * Map decision action/direction to order side.
 * For CLOSE actions, uses the current position side to determine the correct order direction.
 */
function getOrderSide(
	action: string,
	direction: string,
	currentPositionSide?: PositionSide,
): OrderSide {
	if (action === "BUY") return OrderSide.BUY;
	if (action === "SELL") return OrderSide.SELL;
	if (action === "CLOSE" || action === "REDUCE") {
		return resolveCloseOrReduceOrderSide(direction, currentPositionSide);
	}
	return resolveDirectionalSide(direction);
}

function resolveCloseOrReduceOrderSide(
	direction: string,
	currentPositionSide?: PositionSide,
): OrderSide {
	if (currentPositionSide) {
		return resolvePositionCloseSide(currentPositionSide);
	}
	return oppositeOrderSide(resolveDirectionalSide(direction));
}

function resolveDirectionalSide(direction: string): OrderSide {
	return direction === "LONG" ? OrderSide.BUY : OrderSide.SELL;
}

function resolvePositionCloseSide(positionSide: PositionSide): OrderSide {
	return positionSide === "short" ? OrderSide.BUY : OrderSide.SELL;
}

function oppositeOrderSide(side: OrderSide): OrderSide {
	return side === OrderSide.BUY ? OrderSide.SELL : OrderSide.BUY;
}

async function submitOrders(
	cycleId: string,
	decisionPlan: DecisionPlan,
): Promise<OrderSubmissionResult> {
	const orderIds: string[] = [];
	const errors: string[] = [];
	const executionEngineUrl = requireExecutionEngineUrl();
	const positionsBySide = await fetchPositionsBySide(cycleId);

	log.info(
		{ cycleId, decisionCount: decisionPlan.decisions.length, executionEngineUrl },
		"Submitting orders to execution engine",
	);

	const client = createExecutionClient(executionEngineUrl, { enableLogging: true });
	for (const decision of decisionPlan.decisions) {
		await submitSingleDecision(cycleId, decision, positionsBySide, client, orderIds, errors);
	}

	log.info(
		{ cycleId, submittedCount: orderIds.length, errorCount: errors.length },
		"Order submission complete",
	);
	return { submitted: orderIds.length > 0, orderIds, errors };
}

function requireExecutionEngineUrl(): string {
	const executionEngineUrl = Bun.env.EXECUTION_ENGINE_URL;
	if (!executionEngineUrl) {
		throw new Error("EXECUTION_ENGINE_URL environment variable is required");
	}
	return executionEngineUrl;
}

function createBrokerClientFromEnv() {
	const environment = requireEnv();
	const alpacaKey = Bun.env.ALPACA_KEY;
	const alpacaSecret = Bun.env.ALPACA_SECRET;
	if (!alpacaKey || !alpacaSecret) {
		throw new Error("ALPACA_KEY and ALPACA_SECRET environment variables are required");
	}
	return createAlpacaClient({ apiKey: alpacaKey, apiSecret: alpacaSecret, environment });
}

async function fetchPositionsBySide(cycleId: string): Promise<Map<string, PositionSide>> {
	try {
		const brokerClient = createBrokerClientFromEnv();
		const positions = await brokerClient.getPositions();
		log.info(
			{
				cycleId,
				positionCount: positions.length,
				positions: positions.map((position) => ({
					symbol: position.symbol,
					side: position.side,
					qty: position.qty,
				})),
			},
			"Fetched current positions for order side determination",
		);
		return new Map(positions.map((position) => [position.symbol, position.side]));
	} catch (err) {
		log.warn(
			{ cycleId, error: err instanceof Error ? err.message : String(err) },
			"Failed to fetch positions, will use decision direction for order side",
		);
		return new Map();
	}
}

async function submitSingleDecision(
	cycleId: string,
	decision: Decision,
	positionsBySide: Map<string, PositionSide>,
	client: ReturnType<typeof createExecutionClient>,
	orderIds: string[],
	errors: string[],
): Promise<void> {
	if (decision.action === "HOLD") return;
	const clientOrderId = `${cycleId}-${decision.instrumentId}-${Date.now()}`;
	const currentPositionSide = positionsBySide.get(decision.instrumentId);

	try {
		const request = buildSubmitOrderRequest(cycleId, decision, currentPositionSide, clientOrderId);
		logOrderSubmission(cycleId, decision, currentPositionSide, request.side, clientOrderId);
		const response = await client.submitOrder(request, cycleId);
		recordOrderSubmissionResult(
			cycleId,
			decision,
			response.data.orderId,
			response.data.errorMessage,
			response.data.status,
			orderIds,
			errors,
		);
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : String(err);
		errors.push(`${decision.instrumentId}: ${errorMsg}`);
		log.error(
			{ cycleId, symbol: decision.instrumentId, error: errorMsg },
			"Failed to submit order to execution engine",
		);
	}
}

function buildSubmitOrderRequest(
	cycleId: string,
	decision: Decision,
	currentPositionSide: PositionSide | undefined,
	clientOrderId: string,
) {
	const side = getOrderSide(decision.action, decision.direction, currentPositionSide);
	const instrumentType =
		decision.instrumentType === "OPTION" ? InstrumentType.OPTION : InstrumentType.EQUITY;
	const isOption = instrumentType === InstrumentType.OPTION;

	return create(SubmitOrderRequestSchema, {
		instrument: { instrumentId: decision.instrumentId, instrumentType },
		side,
		quantity: decision.size.value,
		orderType: isOption && decision.netLimitPrice != null ? OrderType.LIMIT : OrderType.MARKET,
		limitPrice: isOption ? decision.netLimitPrice : undefined,
		timeInForce: TimeInForce.DAY,
		clientOrderId,
		cycleId,
	});
}

function logOrderSubmission(
	cycleId: string,
	decision: Decision,
	currentPositionSide: PositionSide | undefined,
	side: OrderSide,
	clientOrderId: string,
): void {
	log.info(
		{
			cycleId,
			symbol: decision.instrumentId,
			instrumentType: decision.instrumentType,
			action: decision.action,
			direction: decision.direction,
			currentPositionSide: currentPositionSide ?? "none",
			side: side === OrderSide.BUY ? "BUY" : "SELL",
			quantity: decision.size.value,
			clientOrderId,
		},
		"Submitting order",
	);
}

function recordOrderSubmissionResult(
	cycleId: string,
	decision: Decision,
	orderId: string | undefined,
	errorMessage: string | undefined,
	status: string | number | undefined,
	orderIds: string[],
	errors: string[],
): void {
	if (orderId) {
		orderIds.push(orderId);
		log.info(
			{ cycleId, symbol: decision.instrumentId, orderId, status },
			"Order submitted successfully",
		);
		return;
	}
	if (!errorMessage) return;
	errors.push(`${decision.instrumentId}: ${errorMessage}`);
	log.error(
		{ cycleId, symbol: decision.instrumentId, error: errorMessage },
		"Order submission failed",
	);
}
