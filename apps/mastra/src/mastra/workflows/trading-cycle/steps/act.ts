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

// ============================================
// Step Definition
// ============================================

export const actStep = createStep({
	id: "act-execute",
	description: "Submit orders and finalize workflow result",
	inputSchema: ActInputSchema,
	outputSchema: WorkflowResultSchema,
	execute: async ({ inputData }) => {
		const { cycleId, approved, iterations, decisionPlan, riskApproval, criticApproval, mode } =
			inputData;

		let orderSubmission = {
			submitted: false,
			orderIds: [] as string[],
			errors: [] as string[],
		};

		const thesisUpdates: z.infer<typeof ThesisUpdateSchema>[] = [];

		if (approved && decisionPlan) {
			// Filter to only decisions approved by BOTH risk manager and critic
			const riskApproved = new Set(riskApproval?.approvedDecisionIds ?? []);
			const criticApproved = new Set(criticApproval?.approvedDecisionIds ?? []);

			// If an agent returned APPROVE with empty approvedDecisionIds, treat all decisions as approved
			const allDecisionIds = decisionPlan.decisions.map((d) => d.decisionId);
			const effectiveRiskApproved =
				riskApproval?.verdict === "APPROVE" && riskApproved.size === 0
					? new Set(allDecisionIds)
					: riskApproved;
			const effectiveCriticApproved =
				criticApproval?.verdict === "APPROVE" && criticApproved.size === 0
					? new Set(allDecisionIds)
					: criticApproved;

			// Intersection: only decisions approved by both
			const approvedDecisions = decisionPlan.decisions.filter(
				(d) => effectiveRiskApproved.has(d.decisionId) && effectiveCriticApproved.has(d.decisionId),
			);

			log.info(
				{
					cycleId,
					totalDecisions: decisionPlan.decisions.length,
					approvedByRisk: effectiveRiskApproved.size,
					approvedByCritic: effectiveCriticApproved.size,
					approvedByBoth: approvedDecisions.length,
					approvedSymbols: approvedDecisions.map((d) => d.instrumentId),
				},
				"Filtered decisions for execution",
			);

			if (approvedDecisions.length === 0) {
				orderSubmission.errors.push("No decisions approved by both risk manager and critic");
			} else {
				const filteredPlan = { ...decisionPlan, decisions: approvedDecisions };
				const constraintCheck = await checkConstraints(filteredPlan);

				if (constraintCheck.passed) {
					orderSubmission = await submitOrders(cycleId, filteredPlan);

					for (const decision of approvedDecisions) {
						thesisUpdates.push({
							thesisId: `thesis-${decision.instrumentId}`,
							instrumentId: decision.instrumentId,
							fromState: null,
							toState: decision.thesisState,
							action: decision.action,
							reason: decision.rationale.summary,
						});
					}
				} else {
					orderSubmission.errors = constraintCheck.violations;
				}
			}
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
	},
});

// ============================================
// Helper Functions
// ============================================

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
	// CLOSE requires knowing the current position side to determine order direction
	if (action === "CLOSE") {
		if (currentPositionSide) {
			// If we have a current position, use its side to determine order direction
			// Long position → SELL to close, Short position → BUY to cover
			return currentPositionSide === "short" ? OrderSide.BUY : OrderSide.SELL;
		}
		// Fallback to direction if no position found (shouldn't happen for valid CLOSE)
		return direction === "SHORT" ? OrderSide.BUY : OrderSide.SELL;
	}
	// SELL action with SHORT direction = sell to open short
	if (action === "SELL") {
		return OrderSide.SELL;
	}
	// BUY action = buy to open long
	if (action === "BUY") {
		return OrderSide.BUY;
	}
	// REDUCE reduces exposure (opposite of direction)
	if (action === "REDUCE") {
		if (currentPositionSide) {
			return currentPositionSide === "long" ? OrderSide.SELL : OrderSide.BUY;
		}
		return direction === "LONG" ? OrderSide.SELL : OrderSide.BUY;
	}
	// INCREASE increases exposure (same as direction)
	if (action === "INCREASE") {
		return direction === "LONG" ? OrderSide.BUY : OrderSide.SELL;
	}
	// Default: use direction to determine side
	return direction === "LONG" ? OrderSide.BUY : OrderSide.SELL;
}

async function submitOrders(
	cycleId: string,
	decisionPlan: z.infer<typeof DecisionPlanSchema>,
): Promise<OrderSubmissionResult> {
	const orderIds: string[] = [];
	const errors: string[] = [];

	const executionEngineUrl = Bun.env.EXECUTION_ENGINE_URL;
	if (!executionEngineUrl) {
		throw new Error("EXECUTION_ENGINE_URL environment variable is required");
	}

	// Fetch current positions to determine correct order side for CLOSE/REDUCE actions
	const environment = requireEnv();
	const alpacaKey = Bun.env.ALPACA_KEY;
	const alpacaSecret = Bun.env.ALPACA_SECRET;

	if (!alpacaKey || !alpacaSecret) {
		throw new Error("ALPACA_KEY and ALPACA_SECRET environment variables are required");
	}

	const brokerClient = createAlpacaClient({
		apiKey: alpacaKey,
		apiSecret: alpacaSecret,
		environment,
	});

	let positionsBySide: Map<string, PositionSide> = new Map();
	try {
		const positions = await brokerClient.getPositions();
		positionsBySide = new Map(positions.map((p) => [p.symbol, p.side]));
		log.info(
			{
				cycleId,
				positionCount: positions.length,
				positions: positions.map((p) => ({ symbol: p.symbol, side: p.side, qty: p.qty })),
			},
			"Fetched current positions for order side determination",
		);
	} catch (err) {
		log.warn(
			{
				cycleId,
				error: err instanceof Error ? err.message : String(err),
			},
			"Failed to fetch positions, will use decision direction for order side",
		);
	}

	log.info(
		{
			cycleId,
			decisionCount: decisionPlan.decisions.length,
			executionEngineUrl,
		},
		"Submitting orders to execution engine",
	);

	const client = createExecutionClient(executionEngineUrl, { enableLogging: true });

	for (const decision of decisionPlan.decisions) {
		// Skip HOLD decisions - they don't require order submission
		if (decision.action === "HOLD") {
			continue;
		}

		const clientOrderId = `${cycleId}-${decision.instrumentId}-${Date.now()}`;
		const currentPositionSide = positionsBySide.get(decision.instrumentId);

		try {
			const side = getOrderSide(decision.action, decision.direction, currentPositionSide);

			const instrumentType =
				decision.instrumentType === "OPTION" ? InstrumentType.OPTION : InstrumentType.EQUITY;

			const isOption = instrumentType === InstrumentType.OPTION;

			const request = create(SubmitOrderRequestSchema, {
				instrument: {
					instrumentId: decision.instrumentId,
					instrumentType,
				},
				side,
				quantity: decision.size.value,
				orderType: isOption && decision.netLimitPrice != null ? OrderType.LIMIT : OrderType.MARKET,
				limitPrice: isOption ? decision.netLimitPrice : undefined,
				timeInForce: TimeInForce.DAY,
				clientOrderId,
				cycleId,
			});

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

			const response = await client.submitOrder(request, cycleId);

			if (response.data.orderId) {
				orderIds.push(response.data.orderId);
				log.info(
					{
						cycleId,
						symbol: decision.instrumentId,
						orderId: response.data.orderId,
						status: response.data.status,
					},
					"Order submitted successfully",
				);
			} else if (response.data.errorMessage) {
				errors.push(`${decision.instrumentId}: ${response.data.errorMessage}`);
				log.error(
					{
						cycleId,
						symbol: decision.instrumentId,
						error: response.data.errorMessage,
					},
					"Order submission failed",
				);
			}
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			errors.push(`${decision.instrumentId}: ${errorMsg}`);
			log.error(
				{
					cycleId,
					symbol: decision.instrumentId,
					error: errorMsg,
				},
				"Failed to submit order to execution engine",
			);
		}
	}

	log.info(
		{
			cycleId,
			submittedCount: orderIds.length,
			errorCount: errors.length,
		},
		"Order submission complete",
	);

	return {
		submitted: orderIds.length > 0,
		orderIds,
		errors,
	};
}
