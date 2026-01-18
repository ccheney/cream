/**
 * Act Phase
 *
 * Constraint checking and order submission for the trading cycle workflow.
 */

import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import type { ExecutionContext } from "@cream/domain";
import { isTest } from "@cream/domain";
import {
	Action,
	Environment,
	InstrumentSchema,
	InstrumentType,
	SizeSchema,
	SizeUnit,
	StrategyFamily,
} from "@cream/schema-gen/cream/v1/common";
import {
	DecisionPlanSchema,
	DecisionSchema,
	type DecisionPlan as ProtobufDecisionPlan,
} from "@cream/schema-gen/cream/v1/decision";

import {
	ExecutionEngineError,
	getExecutionEngineClient,
	OrderSide,
} from "../../../../grpc/index.js";
import type { Decision, WorkflowDecisionPlan } from "./types.js";

// ============================================
// Protobuf Conversion
// ============================================

/**
 * Map workflow action string to protobuf Action enum
 */
function toProtobufAction(action: Decision["action"]): Action {
	switch (action) {
		case "BUY":
			return Action.BUY;
		case "SELL":
			return Action.SELL;
		case "HOLD":
			return Action.HOLD;
		case "CLOSE":
			return Action.SELL; // CLOSE maps to SELL in proto
		default:
			return Action.UNSPECIFIED;
	}
}

/**
 * Map workflow size unit string to protobuf SizeUnit enum
 */
function toProtobufSizeUnit(unit: string): SizeUnit {
	switch (unit.toUpperCase()) {
		case "SHARES":
			return SizeUnit.SHARES;
		case "CONTRACTS":
			return SizeUnit.CONTRACTS;
		default:
			return SizeUnit.UNSPECIFIED;
	}
}

/**
 * Map workflow strategy family string to protobuf StrategyFamily enum
 */
function toProtobufStrategyFamily(family: string): StrategyFamily {
	switch (family.toUpperCase()) {
		case "TREND":
			return StrategyFamily.TREND;
		case "MEAN_REVERSION":
			return StrategyFamily.MEAN_REVERSION;
		case "EVENT_DRIVEN":
			return StrategyFamily.EVENT_DRIVEN;
		case "VOLATILITY":
			return StrategyFamily.VOLATILITY;
		default:
			return StrategyFamily.UNSPECIFIED;
	}
}

/**
 * Map environment string to protobuf Environment enum
 */
function toProtobufEnvironment(env: string): Environment {
	switch (env.toUpperCase()) {
		case "PAPER":
			return Environment.PAPER;
		case "LIVE":
			return Environment.LIVE;
		default:
			return Environment.UNSPECIFIED;
	}
}

/**
 * Convert a workflow Decision to protobuf Decision
 *
 * Note: The workflow uses percentage-based sizing (PCT_EQUITY) but the proto
 * expects absolute quantities (SHARES/CONTRACTS). We pass the percentage value
 * as quantity (x100 for precision) with UNSPECIFIED unit to signal this.
 * The Rust execution engine should handle the conversion to actual shares.
 */
function toProtobufDecision(decision: Decision) {
	// Convert percentage to a scaled integer (e.g., 5.5% -> 55)
	// The Rust execution engine expects percentage * 10 for precision
	const scaledQuantity =
		decision.size.unit.toUpperCase() === "PCT_EQUITY"
			? Math.round(decision.size.value * 10)
			: Math.round(decision.size.value);

	const sizeUnit =
		decision.size.unit.toUpperCase() === "PCT_EQUITY"
			? SizeUnit.UNSPECIFIED // Signal percentage-based sizing
			: toProtobufSizeUnit(decision.size.unit);

	return create(DecisionSchema, {
		instrument: create(InstrumentSchema, {
			instrumentId: decision.instrumentId,
			instrumentType: InstrumentType.EQUITY,
		}),
		action: toProtobufAction(decision.action),
		size: create(SizeSchema, {
			quantity: scaledQuantity,
			unit: sizeUnit,
			targetPositionQuantity: 0, // Calculated by execution engine
		}),
		strategyFamily: toProtobufStrategyFamily(decision.strategyFamily),
		rationale: decision.rationale?.summary ?? "",
		confidence: 0.8, // Default confidence - not tracked in workflow
	});
}

/**
 * Convert a WorkflowDecisionPlan to protobuf DecisionPlan for gRPC calls
 */
function toProtobufDecisionPlan(
	plan: WorkflowDecisionPlan,
	ctx?: ExecutionContext
): ProtobufDecisionPlan {
	return create(DecisionPlanSchema, {
		cycleId: plan.cycleId,
		asOfTimestamp: timestampFromDate(new Date(plan.timestamp)),
		environment: ctx ? toProtobufEnvironment(ctx.environment) : Environment.UNSPECIFIED,
		decisions: plan.decisions.map(toProtobufDecision),
		portfolioNotes: plan.portfolioNotes,
	});
}

// ============================================
// Constraint Checking
// ============================================

/**
 * Check constraints for the trading plan.
 *
 * In test mode (source: "test"), returns a simple pass/fail based on approval.
 * In PAPER/LIVE mode, calls the Rust execution engine for constraint validation.
 */
export async function checkConstraints(
	approved: boolean,
	plan: WorkflowDecisionPlan,
	ctx?: ExecutionContext
): Promise<{ passed: boolean; violations: string[] }> {
	if (!approved) {
		return { passed: false, violations: ["Plan not approved by agents"] };
	}

	if (ctx && isTest(ctx)) {
		return { passed: true, violations: [] };
	}

	try {
		const client = getExecutionEngineClient();

		const [accountResponse, positionsResponse] = await Promise.all([
			client.getAccountState({}),
			client.getPositions({}),
		]);

		// Convert workflow plan to protobuf format for the execution engine
		const decisionPlan = toProtobufDecisionPlan(plan, ctx);

		const response = await client.checkConstraints({
			decisionPlan,
			accountState: accountResponse.accountState,
			positions: positionsResponse.positions,
		});

		return {
			passed: response.approved,
			violations: response.violations.map((v) => v.message),
		};
	} catch (error) {
		const message = error instanceof ExecutionEngineError ? error.message : String(error);
		return { passed: false, violations: [`Execution engine error: ${message}`] };
	}
}

// ============================================
// Order Submission
// ============================================

/**
 * Submit orders for approved decisions.
 *
 * In test mode (source: "test"), returns mock order IDs without executing.
 * In PAPER/LIVE mode, calls the Rust execution engine to submit orders.
 */
export async function submitOrders(
	constraintsPassed: boolean,
	plan: WorkflowDecisionPlan,
	cycleId: string,
	ctx?: ExecutionContext
): Promise<{ submitted: boolean; orderIds: string[]; errors: string[] }> {
	if (!constraintsPassed) {
		return { submitted: false, orderIds: [], errors: ["Constraints not passed"] };
	}

	const actionableDecisions = plan.decisions.filter((d) => d.action !== "HOLD");

	if (actionableDecisions.length === 0) {
		return { submitted: true, orderIds: [], errors: [] };
	}

	if (ctx && isTest(ctx)) {
		const mockOrderIds = actionableDecisions.map(
			(d) => `mock-${d.instrumentId}-${cycleId}-${Date.now()}`
		);
		return { submitted: true, orderIds: mockOrderIds, errors: [] };
	}

	const client = getExecutionEngineClient();
	const orderIds: string[] = [];
	const errors: string[] = [];

	for (const decision of actionableDecisions) {
		try {
			const response = await client.submitOrder({
				instrument: create(InstrumentSchema, {
					instrumentId: decision.instrumentId,
					instrumentType: InstrumentType.EQUITY,
				}),
				side: decision.action === "BUY" ? OrderSide.BUY : OrderSide.SELL,
				quantity: decision.size.value,
				orderType: 1,
				timeInForce: 0,
				clientOrderId: decision.decisionId,
				cycleId,
			});

			if (response.orderId) {
				orderIds.push(response.orderId);
			}
			if (response.errorMessage) {
				errors.push(`${decision.instrumentId}: ${response.errorMessage}`);
			}
		} catch (error) {
			const message = error instanceof ExecutionEngineError ? error.message : String(error);
			errors.push(`${decision.instrumentId}: ${message}`);
		}
	}

	return {
		submitted: orderIds.length > 0 || errors.length === 0,
		orderIds,
		errors,
	};
}
