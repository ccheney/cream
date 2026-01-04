/**
 * Execution Engine Zod Schemas
 *
 * Messages for Rust execution engine communication.
 * Mirrors cream/v1/execution.proto
 *
 * @see packages/schema/cream/v1/execution.proto
 */

import { z } from "zod";
import {
  InstrumentSchema,
  OrderType,
  TimeInForce,
  DecisionPlanSchema,
} from "./decision";
import { TimestampSchema } from "./marketSnapshot";

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
  asOf: TimestampSchema,
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
  validatedAt: TimestampSchema,

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
  submittedAt: TimestampSchema,

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
  updatedAt: TimestampSchema,

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
  asOf: TimestampSchema,
});
export type GetPositionsResponse = z.infer<typeof GetPositionsResponseSchema>;
