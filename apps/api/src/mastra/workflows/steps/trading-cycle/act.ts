/**
 * Act Phase
 *
 * Constraint checking and order submission for the trading cycle workflow.
 */

import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import type { RuntimeConstraintsConfig } from "@cream/config";
import type { ExecutionContext } from "@cream/domain";
import { isTest } from "@cream/domain";
import { createNodeLogger } from "@cream/logger";
import {
	Action,
	Direction,
	Environment,
	InstrumentSchema,
	InstrumentType,
	OptionLegSchema,
	OrderType,
	PositionIntent,
	RiskDenomination,
	RiskLevelsSchema,
	SizeSchema,
	SizeUnit,
	StrategyFamily,
	ThesisState,
	TimeHorizon,
	TimeInForce,
} from "@cream/schema-gen/cream/v1/common";

const log = createNodeLogger({ service: "act-step" });

import {
	DecisionPlanSchema,
	DecisionSchema,
	type DecisionPlan as ProtobufDecisionPlan,
} from "@cream/schema-gen/cream/v1/decision";
import {
	OrderStatus as ProtoOrderStatus,
	RiskConstraintsSchema,
} from "@cream/schema-gen/cream/v1/execution";
import type { OrderStatus as StorageOrderStatus } from "@cream/storage";
import { getOrdersRepo } from "../../../../db.js";
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
 * Maps stopLoss/takeProfit to protobuf RiskLevels.
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
		}),
	);

	// Create risk levels from stopLoss and takeProfit
	// For options strategies, use OPTION_PRICE denomination; for equities, use UNDERLYING_PRICE
	const isOptionsStrategy =
		decision.strategyFamily.toUpperCase().includes("OPTION") ||
		decision.strategyFamily.toUpperCase().includes("SPREAD") ||
		decision.strategyFamily.toUpperCase().includes("CONDOR") ||
		decision.strategyFamily.toUpperCase().includes("STRADDLE") ||
		decision.strategyFamily.toUpperCase().includes("STRANGLE");

	const riskLevels = create(RiskLevelsSchema, {
		stopLossLevel: decision.stopLoss?.price ?? 0,
		takeProfitLevel: decision.takeProfit?.price ?? 0,
		denomination: isOptionsStrategy
			? RiskDenomination.OPTION_PRICE
			: RiskDenomination.UNDERLYING_PRICE,
	});

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
		riskLevels,
		strategyFamily: toProtobufStrategyFamily(decision.strategyFamily),
		rationale: decision.rationale?.summary ?? "",
		confidence: decision.confidence,
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
	ctx?: ExecutionContext,
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
 * Map TypeScript constraints to proto format for the execution engine.
 * Values are converted to basis points (bps) or cents as needed.
 */
function mapConstraintsToProto(constraints: RuntimeConstraintsConfig) {
	return create(RiskConstraintsSchema, {
		maxShares: constraints.perInstrument.maxShares,
		maxContracts: constraints.perInstrument.maxContracts,
		maxNotionalCents: BigInt(Math.round(constraints.perInstrument.maxNotional * 100)),
		maxPctEquityBps: Math.round(constraints.perInstrument.maxPctEquity * 10000),
		maxGrossPctEquityBps: Math.round(constraints.portfolio.maxGrossExposure * 10000),
		maxNetPctEquityBps: Math.round(constraints.portfolio.maxNetExposure * 10000),
		maxRiskPerTradeBps: Math.round(constraints.portfolio.maxRiskPerTrade * 10000),
		maxSectorExposureBps: Math.round(constraints.portfolio.maxSectorExposure * 10000),
		maxPositions: constraints.portfolio.maxPositions,
		maxConcentrationBps: Math.round(constraints.portfolio.maxConcentration * 10000),
		maxCorrelationBps: Math.round(constraints.portfolio.maxCorrelation * 10000),
		maxDrawdownBps: Math.round(constraints.portfolio.maxDrawdown * 10000),
		maxDeltaNotionalCents: BigInt(Math.round(constraints.options.maxDelta * 100)),
		maxGammaScaled: BigInt(Math.round(constraints.options.maxGamma * 10000)),
		maxVegaCents: BigInt(Math.round(constraints.options.maxVega * 100)),
		maxThetaCents: BigInt(Math.round(constraints.options.maxTheta * 100)),
	});
}

/**
 * Check constraints for the trading plan.
 *
 * In test mode (source: "test"), returns a simple pass/fail based on approval.
 * In PAPER/LIVE mode, calls the Rust execution engine for constraint validation.
 */
export async function checkConstraints(
	approved: boolean,
	plan: WorkflowDecisionPlan,
	ctx?: ExecutionContext,
	constraints?: RuntimeConstraintsConfig,
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
			constraints: constraints ? mapConstraintsToProto(constraints) : undefined,
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
// Order Status Mapping
// ============================================

/**
 * Map protobuf OrderStatus to storage OrderStatus
 */
function toStorageOrderStatus(protoStatus: ProtoOrderStatus): StorageOrderStatus {
	switch (protoStatus) {
		case ProtoOrderStatus.NEW:
		case ProtoOrderStatus.PENDING:
			return "pending";
		case ProtoOrderStatus.ACCEPTED:
			return "accepted";
		case ProtoOrderStatus.PARTIAL_FILL:
			return "partial_fill";
		case ProtoOrderStatus.FILLED:
			return "filled";
		case ProtoOrderStatus.CANCELLED:
			return "cancelled";
		case ProtoOrderStatus.REJECTED:
			return "rejected";
		case ProtoOrderStatus.EXPIRED:
			return "expired";
		default:
			return "submitted";
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
	ctx?: ExecutionContext,
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
			(d) => `mock-${d.instrumentId}-${cycleId}-${Date.now()}`,
		);
		return { submitted: true, orderIds: mockOrderIds, errors: [] };
	}

	const client = getExecutionEngineClient();
	const orderIds: string[] = [];
	const errors: string[] = [];

	for (const decision of actionableDecisions) {
		// Determine order type and limit price based on decision data
		// - For options/spreads with netLimitPrice: use LIMIT order
		// - For equities: use MARKET order (stopLoss/takeProfit are for exits, not entries)
		const hasNetLimitPrice =
			decision.netLimitPrice !== undefined && decision.netLimitPrice !== null;
		const orderType = hasNetLimitPrice ? OrderType.LIMIT : OrderType.MARKET;
		const limitPrice = hasNetLimitPrice ? decision.netLimitPrice : undefined;

		const side = decision.action === "BUY" ? OrderSide.BUY : OrderSide.SELL;

		log.info(
			{
				cycleId,
				decisionId: decision.decisionId,
				instrumentId: decision.instrumentId,
				action: decision.action,
				side: side === OrderSide.BUY ? "BUY" : "SELL",
				quantity: decision.size.value,
				orderType: orderType === OrderType.LIMIT ? "LIMIT" : "MARKET",
				limitPrice,
			},
			"Submitting order to execution engine",
		);

		try {
			const response = await client.submitOrder({
				instrument: create(InstrumentSchema, {
					instrumentId: decision.instrumentId,
					instrumentType: InstrumentType.EQUITY,
				}),
				side,
				quantity: decision.size.value,
				orderType,
				timeInForce: TimeInForce.DAY,
				limitPrice,
				clientOrderId: decision.decisionId,
				cycleId,
			});

			if (response.orderId) {
				orderIds.push(response.orderId);

				// Persist order to PostgreSQL
				try {
					const ordersRepo = getOrdersRepo();
					const storageOrderType = orderType === OrderType.LIMIT ? "limit" : "market";
					const storageSide = decision.action === "BUY" ? "buy" : "sell";

					const order = await ordersRepo.create({
						decisionId: decision.decisionId,
						symbol: decision.instrumentId,
						side: storageSide,
						quantity: decision.size.value,
						orderType: storageOrderType,
						limitPrice: limitPrice ?? null,
						timeInForce: "day",
						environment: ctx?.environment ?? "PAPER",
					});

					// Update with broker order ID and status
					await ordersRepo.updateStatus(
						order.id,
						toStorageOrderStatus(response.status),
						response.orderId,
					);

					log.info(
						{
							cycleId,
							decisionId: decision.decisionId,
							instrumentId: decision.instrumentId,
							orderId: response.orderId,
							internalOrderId: order.id,
							status: response.status,
						},
						"Order submitted to Alpaca and persisted to database",
					);
				} catch (persistError) {
					log.error(
						{
							cycleId,
							decisionId: decision.decisionId,
							instrumentId: decision.instrumentId,
							orderId: response.orderId,
							error: persistError instanceof Error ? persistError.message : String(persistError),
						},
						"Order submitted to Alpaca but failed to persist to database",
					);
				}
			}
			if (response.errorMessage) {
				errors.push(`${decision.instrumentId}: ${response.errorMessage}`);
				log.error(
					{
						cycleId,
						decisionId: decision.decisionId,
						instrumentId: decision.instrumentId,
						errorMessage: response.errorMessage,
					},
					"Order rejected by Alpaca",
				);
			}
		} catch (error) {
			const message = error instanceof ExecutionEngineError ? error.message : String(error);
			errors.push(`${decision.instrumentId}: ${message}`);
			log.error(
				{
					cycleId,
					decisionId: decision.decisionId,
					instrumentId: decision.instrumentId,
					error: message,
				},
				"Failed to submit order to execution engine",
			);
		}
	}

	return {
		submitted: orderIds.length > 0 || errors.length === 0,
		orderIds,
		errors,
	};
}
