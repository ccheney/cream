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
	Direction,
	Environment,
	InstrumentSchema,
	InstrumentType,
	OptionLegSchema,
	PositionIntent,
	SizeSchema,
	SizeUnit,
	StrategyFamily,
	ThesisState,
	TimeHorizon,
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
			return Action.CLOSE;
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
		case "DOLLARS":
			return SizeUnit.DOLLARS;
		case "PCT_EQUITY":
			return SizeUnit.PCT_EQUITY;
		default:
			return SizeUnit.UNSPECIFIED;
	}
}

/**
 * Map workflow strategy family string to protobuf StrategyFamily enum
 */
function toProtobufStrategyFamily(family: string): StrategyFamily {
	switch (family.toUpperCase()) {
		case "EQUITY_LONG":
			return StrategyFamily.EQUITY_LONG;
		case "EQUITY_SHORT":
			return StrategyFamily.EQUITY_SHORT;
		case "OPTION_LONG":
			return StrategyFamily.OPTION_LONG;
		case "OPTION_SHORT":
			return StrategyFamily.OPTION_SHORT;
		case "VERTICAL_SPREAD":
			return StrategyFamily.VERTICAL_SPREAD;
		case "IRON_CONDOR":
			return StrategyFamily.IRON_CONDOR;
		case "STRADDLE":
			return StrategyFamily.STRADDLE;
		case "STRANGLE":
			return StrategyFamily.STRANGLE;
		case "CALENDAR_SPREAD":
			return StrategyFamily.CALENDAR_SPREAD;
		default:
			return StrategyFamily.UNSPECIFIED;
	}
}

/**
 * Map workflow direction string to protobuf Direction enum
 */
function toProtobufDirection(direction: Decision["direction"]): Direction {
	switch (direction) {
		case "LONG":
			return Direction.LONG;
		case "SHORT":
			return Direction.SHORT;
		case "FLAT":
			return Direction.FLAT;
		default:
			return Direction.UNSPECIFIED;
	}
}

/**
 * Map workflow time horizon string to protobuf TimeHorizon enum
 */
function toProtobufTimeHorizon(horizon: string): TimeHorizon {
	switch (horizon.toUpperCase()) {
		case "INTRADAY":
			return TimeHorizon.INTRADAY;
		case "SWING":
			return TimeHorizon.SWING;
		case "POSITION":
			return TimeHorizon.POSITION;
		default:
			return TimeHorizon.UNSPECIFIED;
	}
}

/**
 * Map workflow thesis state string to protobuf ThesisState enum
 */
function toProtobufThesisState(state: string): ThesisState {
	switch (state.toUpperCase()) {
		case "WATCHING":
			return ThesisState.WATCHING;
		case "ENTERED":
			return ThesisState.ENTERED;
		case "ADDING":
			return ThesisState.ADDING;
		case "MANAGING":
			return ThesisState.MANAGING;
		case "EXITING":
			return ThesisState.EXITING;
		case "CLOSED":
			return ThesisState.CLOSED;
		default:
			return ThesisState.UNSPECIFIED;
	}
}

/**
 * Map workflow position intent string to protobuf PositionIntent enum
 */
function toProtobufPositionIntent(intent: string): PositionIntent {
	switch (intent.toUpperCase()) {
		case "BUY_TO_OPEN":
			return PositionIntent.BUY_TO_OPEN;
		case "BUY_TO_CLOSE":
			return PositionIntent.BUY_TO_CLOSE;
		case "SELL_TO_OPEN":
			return PositionIntent.SELL_TO_OPEN;
		case "SELL_TO_CLOSE":
			return PositionIntent.SELL_TO_CLOSE;
		default:
			return PositionIntent.UNSPECIFIED;
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
 * Now supports all size units including PCT_EQUITY and DOLLARS directly.
 * Also supports multi-leg options strategies with legs and netLimitPrice.
 */
function toProtobufDecision(decision: Decision) {
	// Convert percentage to a scaled integer (e.g., 5.5% -> 55)
	// The Rust execution engine expects percentage * 10 for precision
	const scaledQuantity =
		decision.size.unit.toUpperCase() === "PCT_EQUITY"
			? Math.round(decision.size.value * 10)
			: Math.round(decision.size.value);

	// Convert option legs for multi-leg strategies
	const legs = (decision.legs ?? []).map((leg) =>
		create(OptionLegSchema, {
			symbol: leg.symbol,
			ratioQty: leg.ratioQty,
			positionIntent: toProtobufPositionIntent(leg.positionIntent),
		})
	);

	return create(DecisionSchema, {
		instrument: create(InstrumentSchema, {
			instrumentId: decision.instrumentId,
			instrumentType: InstrumentType.EQUITY,
		}),
		action: toProtobufAction(decision.action),
		size: create(SizeSchema, {
			quantity: scaledQuantity,
			unit: toProtobufSizeUnit(decision.size.unit),
			targetPositionQuantity: 0, // Calculated by execution engine
		}),
		strategyFamily: toProtobufStrategyFamily(decision.strategyFamily),
		rationale: decision.rationale?.summary ?? "",
		confidence: 0.8, // Default confidence - not tracked in workflow
		direction: toProtobufDirection(decision.direction),
		timeHorizon: toProtobufTimeHorizon(decision.timeHorizon),
		thesisState: toProtobufThesisState(decision.thesisState),
		bullishFactors: decision.rationale?.bullishFactors ?? [],
		bearishFactors: decision.rationale?.bearishFactors ?? [],
		legs,
		netLimitPrice: decision.netLimitPrice,
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
