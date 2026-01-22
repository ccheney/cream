/**
 * Execution Engine Zod Schemas
 *
 * Messages for Rust execution engine communication.
 * Mirrors cream/v1/execution.proto
 *
 * @see packages/proto/cream/v1/execution.proto
 */

import { z } from "zod";
import { DecisionPlanSchema, InstrumentSchema, OrderType, TimeInForce } from "./decision";
import { Iso8601Schema } from "./time";

// ============================================
// Constraint Check Enums
// ============================================

/**
 * Result of a constraint check
 */
export const ConstraintResult = z.enum(["PASS", "FAIL", "WARN"]);
export type ConstraintResult = z.infer<typeof ConstraintResult>;

// ============================================
// Order Enums
// ============================================

/**
 * Order status
 */
export const OrderStatus = z.enum([
	"PENDING",
	"ACCEPTED",
	"PARTIAL_FILL",
	"FILLED",
	"CANCELLED",
	"REJECTED",
	"EXPIRED",
]);
export type OrderStatus = z.infer<typeof OrderStatus>;

/**
 * Order side
 */
export const OrderSide = z.enum(["BUY", "SELL"]);
export type OrderSide = z.infer<typeof OrderSide>;

// ============================================
// Account State
// ============================================

/**
 * Current account state
 */
export const AccountStateSchema = z.object({
	/** Account identifier */
	accountId: z.string().min(1),

	/** Total account equity */
	equity: z.number().nonnegative(),

	/** Available cash for trading */
	buyingPower: z.number().nonnegative(),

	/** Current margin used */
	marginUsed: z.number().nonnegative(),

	/** Day trade count (for PDT rule) */
	dayTradeCount: z.number().int().nonnegative(),

	/** Whether pattern day trader rules apply */
	isPdtRestricted: z.boolean(),

	/** Timestamp of state snapshot */
	asOf: Iso8601Schema,
});
export type AccountState = z.infer<typeof AccountStateSchema>;

// ============================================
// Positions
// ============================================

/**
 * Current position
 */
export const PositionSchema = z.object({
	/** Instrument */
	instrument: InstrumentSchema,

	/** Quantity held (signed: positive=long, negative=short) */
	quantity: z.number().int(),

	/** Average entry price */
	avgEntryPrice: z.number().positive(),

	/** Current market value */
	marketValue: z.number(),

	/** Unrealized P&L */
	unrealizedPnl: z.number(),

	/** Unrealized P&L percentage */
	unrealizedPnlPct: z.number(),

	/** Cost basis */
	costBasis: z.number(),
});
export type Position = z.infer<typeof PositionSchema>;

// ============================================
// Constraint Check
// ============================================

/**
 * Individual constraint check result
 */
export const ConstraintCheckSchema = z.object({
	/** Name of the constraint */
	name: z.string().min(1),

	/** Result of the check */
	result: ConstraintResult,

	/** Description of the constraint */
	description: z.string(),

	/** Actual value that was checked */
	actualValue: z.number().optional(),

	/** Threshold that was applied */
	threshold: z.number().optional(),
});
export type ConstraintCheck = z.infer<typeof ConstraintCheckSchema>;

/**
 * Request to validate a decision plan against constraints
 */
export const CheckConstraintsRequestSchema = z.object({
	/** Decision plan to validate */
	decisionPlan: DecisionPlanSchema,

	/** Current account state */
	accountState: AccountStateSchema,

	/** Current positions */
	positions: z.array(PositionSchema),
});
export type CheckConstraintsRequest = z.infer<typeof CheckConstraintsRequestSchema>;

/**
 * Response from constraint validation
 */
export const CheckConstraintsResponseSchema = z.object({
	/** Overall result */
	approved: z.boolean(),

	/** Individual constraint results */
	checks: z.array(ConstraintCheckSchema),

	/** Timestamp of validation */
	validatedAt: Iso8601Schema,

	/** Rejection reason (if not approved) */
	rejectionReason: z.string().optional(),
});
export type CheckConstraintsResponse = z.infer<typeof CheckConstraintsResponseSchema>;

// ============================================
// Order Execution
// ============================================

/**
 * Request to submit an order
 */
export const SubmitOrderRequestSchema = z
	.object({
		/** Instrument to trade */
		instrument: InstrumentSchema,

		/** Buy or sell */
		side: OrderSide,

		/** Quantity */
		quantity: z.number().int().positive(),

		/** Order type */
		orderType: OrderType,

		/** Limit price (required for limit orders) */
		limitPrice: z.number().positive().optional(),

		/** Time in force */
		timeInForce: TimeInForce,

		/** Client order ID for tracking */
		clientOrderId: z.string().min(1),

		/** Reference to decision cycle */
		cycleId: z.string().min(1),
	})
	.superRefine((data, ctx) => {
		if (data.orderType === "LIMIT" && data.limitPrice === undefined) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "limitPrice is required when orderType is LIMIT",
				path: ["limitPrice"],
			});
		}
	});
export type SubmitOrderRequest = z.infer<typeof SubmitOrderRequestSchema>;

/**
 * Response from order submission
 */
export const SubmitOrderResponseSchema = z.object({
	/** Broker-assigned order ID */
	orderId: z.string().min(1),

	/** Client order ID (echoed back) */
	clientOrderId: z.string().min(1),

	/** Current order status */
	status: OrderStatus,

	/** Submission timestamp */
	submittedAt: Iso8601Schema,

	/** Error message if rejected */
	errorMessage: z.string().optional(),
});
export type SubmitOrderResponse = z.infer<typeof SubmitOrderResponseSchema>;

/**
 * Order execution acknowledgment
 */
export const ExecutionAckSchema = z.object({
	/** Order ID */
	orderId: z.string().min(1),

	/** Client order ID */
	clientOrderId: z.string().min(1),

	/** Current status */
	status: OrderStatus,

	/** Filled quantity */
	filledQuantity: z.number().int().nonnegative(),

	/** Average fill price */
	avgFillPrice: z.number().nonnegative(),

	/** Remaining quantity */
	remainingQuantity: z.number().int().nonnegative(),

	/** Last update timestamp */
	updatedAt: Iso8601Schema,

	/** Commission charged */
	commission: z.number().nonnegative(),
});
export type ExecutionAck = z.infer<typeof ExecutionAckSchema>;

// ============================================
// Service Request/Response Types
// ============================================

/**
 * Request to stream executions
 */
export const StreamExecutionsRequestSchema = z.object({
	/** Filter by cycle ID (optional) */
	cycleId: z.string().min(1).optional(),

	/** Filter by order IDs (optional) */
	orderIds: z.array(z.string().min(1)).default([]),
});
export type StreamExecutionsRequest = z.infer<typeof StreamExecutionsRequestSchema>;

/**
 * Response with execution update (streamed)
 */
export const StreamExecutionsResponseSchema = z.object({
	/** Execution acknowledgment */
	execution: ExecutionAckSchema,
});
export type StreamExecutionsResponse = z.infer<typeof StreamExecutionsResponseSchema>;

/**
 * Request for account state
 */
export const GetAccountStateRequestSchema = z.object({
	/** Account ID (uses default if not specified) */
	accountId: z.string().min(1).optional(),
});
export type GetAccountStateRequest = z.infer<typeof GetAccountStateRequestSchema>;

/**
 * Response with account state
 */
export const GetAccountStateResponseSchema = z.object({
	/** Current account state */
	accountState: AccountStateSchema,
});
export type GetAccountStateResponse = z.infer<typeof GetAccountStateResponseSchema>;

/**
 * Request for positions
 */
export const GetPositionsRequestSchema = z.object({
	/** Account ID (uses default if not specified) */
	accountId: z.string().min(1).optional(),

	/** Filter by symbols (optional) */
	symbols: z.array(z.string().min(1)).default([]),
});
export type GetPositionsRequest = z.infer<typeof GetPositionsRequestSchema>;

/**
 * Response with positions
 */
export const GetPositionsResponseSchema = z.object({
	/** Current positions */
	positions: z.array(PositionSchema),

	/** Timestamp of snapshot */
	asOf: Iso8601Schema,
});
export type GetPositionsResponse = z.infer<typeof GetPositionsResponseSchema>;

// ============================================
// Portfolio State
// ============================================

/**
 * Complete portfolio state combining account and positions
 *
 * Used for snapshot creation and constraint validation
 */
export const PortfolioStateSchema = z.object({
	/** Account state */
	account: AccountStateSchema,

	/** Current positions */
	positions: z.array(PositionSchema),

	/** Total portfolio market value (equity + unrealized P&L) */
	totalMarketValue: z.number(),

	/** Gross exposure (sum of absolute position values) */
	grossExposure: z.number().nonnegative(),

	/** Net exposure (long - short) */
	netExposure: z.number(),

	/** Snapshot timestamp */
	asOf: Iso8601Schema,
});
export type PortfolioState = z.infer<typeof PortfolioStateSchema>;

// ============================================
// Action Semantics and Broker Order Mapping
// ============================================

import type { Action } from "./decision";

/**
 * Result of mapping a decision action to broker order side.
 */
export interface BrokerOrderMapping {
	/** Broker order side (BUY or SELL) */
	side: "BUY" | "SELL";
	/** Absolute quantity for the order */
	quantity: number;
	/** Description of what this order does */
	description: string;
}

/**
 * Error when action cannot be mapped to broker order.
 */
export class ActionMappingError extends Error {
	constructor(
		message: string,
		public readonly action: Action,
		public readonly currentPosition: number,
		public readonly targetPosition: number,
	) {
		super(message);
		this.name = "ActionMappingError";
	}
}

/**
 * Map a decision action to a broker order side.
 *
 * Actions express intent in terms of exposure, not broker order side:
 * - BUY: Establish new long position from flat → broker BUY
 * - SELL: Establish new short position from flat → broker SELL
 * - INCREASE long: Add to long position → broker BUY
 * - INCREASE short: Add to short position → broker SELL
 * - REDUCE long: Decrease long position → broker SELL
 * - REDUCE short: Decrease short position → broker BUY
 * - HOLD/NO_TRADE: No order generated
 *
 * @see docs/plans/06-decision-contract.md - Action Semantics
 *
 * @param action - The decision action (BUY, SELL, HOLD, INCREASE, REDUCE, NO_TRADE)
 * @param currentPosition - Current signed position quantity (positive=long, negative=short, 0=flat)
 * @param targetPosition - Target signed position quantity after trade
 * @returns BrokerOrderMapping with side and quantity, or null if no order needed
 * @throws ActionMappingError if the action is invalid for the given position state
 */
export function mapActionToBrokerOrder(
	action: Action,
	currentPosition: number,
	targetPosition: number,
): BrokerOrderMapping | null {
	const positionDelta = targetPosition - currentPosition;

	// HOLD and NO_TRADE generate no orders
	if (action === "HOLD" || action === "NO_TRADE") {
		return null;
	}

	// BUY: Must be flat, target must be long
	if (action === "BUY") {
		if (currentPosition !== 0) {
			throw new ActionMappingError(
				`BUY action requires flat position (currentPosition=${currentPosition})`,
				action,
				currentPosition,
				targetPosition,
			);
		}
		if (targetPosition <= 0) {
			throw new ActionMappingError(
				`BUY action requires positive target position (targetPosition=${targetPosition})`,
				action,
				currentPosition,
				targetPosition,
			);
		}
		return {
			side: "BUY",
			quantity: targetPosition,
			description: `Establish long position of ${targetPosition} units`,
		};
	}

	// SELL: Must be flat, target must be short
	if (action === "SELL") {
		if (currentPosition !== 0) {
			throw new ActionMappingError(
				`SELL action requires flat position (currentPosition=${currentPosition})`,
				action,
				currentPosition,
				targetPosition,
			);
		}
		if (targetPosition >= 0) {
			throw new ActionMappingError(
				`SELL action requires negative target position (targetPosition=${targetPosition})`,
				action,
				currentPosition,
				targetPosition,
			);
		}
		return {
			side: "SELL",
			quantity: Math.abs(targetPosition),
			description: `Establish short position of ${Math.abs(targetPosition)} units`,
		};
	}

	// INCREASE: Add to existing position in same direction
	if (action === "INCREASE") {
		if (currentPosition === 0) {
			throw new ActionMappingError(
				`INCREASE action requires existing position (currentPosition=${currentPosition})`,
				action,
				currentPosition,
				targetPosition,
			);
		}

		const isLong = currentPosition > 0;
		const isTargetSameDirection = isLong
			? targetPosition > currentPosition
			: targetPosition < currentPosition;

		if (!isTargetSameDirection) {
			throw new ActionMappingError(
				`INCREASE action requires target to extend position in same direction`,
				action,
				currentPosition,
				targetPosition,
			);
		}

		return {
			side: isLong ? "BUY" : "SELL",
			quantity: Math.abs(positionDelta),
			description: isLong
				? `Add ${Math.abs(positionDelta)} units to long position`
				: `Add ${Math.abs(positionDelta)} units to short position`,
		};
	}

	// REDUCE: Decrease position magnitude (towards flat)
	if (action === "REDUCE") {
		if (currentPosition === 0) {
			throw new ActionMappingError(
				`REDUCE action requires existing position (currentPosition=${currentPosition})`,
				action,
				currentPosition,
				targetPosition,
			);
		}

		const isLong = currentPosition > 0;
		const isReducing = isLong
			? targetPosition < currentPosition && targetPosition >= 0
			: targetPosition > currentPosition && targetPosition <= 0;

		if (!isReducing) {
			throw new ActionMappingError(
				`REDUCE action requires target to decrease position magnitude towards flat`,
				action,
				currentPosition,
				targetPosition,
			);
		}

		return {
			side: isLong ? "SELL" : "BUY",
			quantity: Math.abs(positionDelta),
			description: isLong
				? `Reduce long position by ${Math.abs(positionDelta)} units`
				: `Cover short position by ${Math.abs(positionDelta)} units`,
		};
	}

	// Shouldn't reach here with valid Action type
	throw new ActionMappingError(
		`Unknown action: ${action}`,
		action,
		currentPosition,
		targetPosition,
	);
}

/**
 * Derive the action from current and target positions.
 * Useful for validating that a Decision's action matches its size fields.
 *
 * @param currentPosition - Current signed position quantity
 * @param targetPosition - Target signed position quantity
 * @returns The implied action, or null if positions are identical
 */
export function deriveActionFromPositions(
	currentPosition: number,
	targetPosition: number,
): Action | null {
	// No change
	if (currentPosition === targetPosition) {
		return currentPosition === 0 ? "NO_TRADE" : "HOLD";
	}

	// From flat
	if (currentPosition === 0) {
		return targetPosition > 0 ? "BUY" : "SELL";
	}

	// To flat or beyond
	const isLong = currentPosition > 0;

	if (isLong) {
		if (targetPosition > currentPosition) {
			return "INCREASE";
		}
		if (targetPosition >= 0) {
			return "REDUCE";
		}
		// Flipping from long to short is not a single action
		throw new ActionMappingError(
			"Cannot flip from long to short in single action",
			"REDUCE", // placeholder
			currentPosition,
			targetPosition,
		);
	} else {
		// isShort
		if (targetPosition < currentPosition) {
			return "INCREASE";
		}
		if (targetPosition <= 0) {
			return "REDUCE";
		}
		// Flipping from short to long is not a single action
		throw new ActionMappingError(
			"Cannot flip from short to long in single action",
			"REDUCE", // placeholder
			currentPosition,
			targetPosition,
		);
	}
}
