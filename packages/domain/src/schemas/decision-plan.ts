/**
 * DecisionPlan Zod Schema Mirrors
 *
 * TypeScript Zod schemas that mirror the Protobuf definitions in:
 * packages/schema/cream/v1/decision.proto
 * packages/schema/cream/v1/common.proto
 *
 * These schemas are used for:
 * - Validating LLM-generated DecisionPlans
 * - API request/response validation
 * - TypeScript type safety
 *
 * @see docs/plans/06-decision-contract.md
 */

import { z } from "zod";

// ============================================
// Enums (mirroring common.proto)
// ============================================

/** Trading environment */
export const EnvironmentSchema = z.enum(["BACKTEST", "PAPER", "LIVE"]);
export type Environment = z.infer<typeof EnvironmentSchema>;

/** Trading action expressing intent in terms of exposure */
export const ActionSchema = z.enum([
  "BUY", // Establish new long from flat
  "SELL", // Establish new short from flat
  "HOLD", // Maintain current position
  "INCREASE", // Increase exposure in direction
  "REDUCE", // Reduce exposure magnitude
  "NO_TRADE", // Remain flat
]);
export type Action = z.infer<typeof ActionSchema>;

/** Direction derived from action and position */
export const DirectionSchema = z.enum(["LONG", "SHORT", "FLAT"]);
export type Direction = z.infer<typeof DirectionSchema>;

/** Instrument type */
export const InstrumentTypeSchema = z.enum(["EQUITY", "OPTION"]);
export type InstrumentType = z.infer<typeof InstrumentTypeSchema>;

/** Option type (call or put) */
export const OptionTypeSchema = z.enum(["CALL", "PUT"]);
export type OptionType = z.infer<typeof OptionTypeSchema>;

/** Size unit for position sizing */
export const SizeUnitSchema = z.enum(["SHARES", "CONTRACTS"]);
export type SizeUnit = z.infer<typeof SizeUnitSchema>;

/** Order type */
export const OrderTypeSchema = z.enum(["LIMIT", "MARKET"]);
export type OrderType = z.infer<typeof OrderTypeSchema>;

/** Time in force for orders */
export const TimeInForceSchema = z.enum(["DAY", "GTC", "IOC", "FOK"]);
export type TimeInForce = z.infer<typeof TimeInForceSchema>;

/** Risk level denomination */
export const RiskDenominationSchema = z.enum(["UNDERLYING_PRICE", "OPTION_PRICE"]);
export type RiskDenomination = z.infer<typeof RiskDenominationSchema>;

/** Strategy family */
export const StrategyFamilySchema = z.enum([
  "TREND",
  "MEAN_REVERSION",
  "EVENT_DRIVEN",
  "VOLATILITY",
  "RELATIVE_VALUE",
]);
export type StrategyFamily = z.infer<typeof StrategyFamilySchema>;

/** Market regime classification */
export const RegimeSchema = z.enum([
  "BULL_TREND",
  "BEAR_TREND",
  "RANGE_BOUND",
  "HIGH_VOLATILITY",
  "LOW_VOLATILITY",
  "CRISIS",
]);
export type Regime = z.infer<typeof RegimeSchema>;

// ============================================
// Common Messages (mirroring common.proto)
// ============================================

/** Option contract details */
export const OptionContractSchema = z.object({
  /** Underlying symbol (e.g., "AAPL") */
  underlyingSymbol: z.string().min(1),
  /** Expiration date in YYYY-MM-DD format */
  expirationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Strike price */
  strike: z.number().positive(),
  /** Call or put */
  right: OptionTypeSchema,
  /** Contract multiplier (typically 100 for equity options) */
  multiplier: z.number().int().positive().default(100),
});
export type OptionContract = z.infer<typeof OptionContractSchema>;

/** Instrument identifier */
export const InstrumentSchema = z
  .object({
    /** Unique identifier (ticker or OCC symbol for options) */
    instrumentId: z.string().min(1),
    /** Type of instrument */
    instrumentType: InstrumentTypeSchema,
    /** Option contract details (required when instrumentType is OPTION) */
    optionContract: OptionContractSchema.optional(),
  })
  .superRefine((data, ctx) => {
    // Option contract required when instrumentType is OPTION
    if (data.instrumentType === "OPTION" && !data.optionContract) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "optionContract is required when instrumentType is OPTION",
        path: ["optionContract"],
      });
    }
  });
export type Instrument = z.infer<typeof InstrumentSchema>;

/** Position sizing */
export const SizeSchema = z.object({
  /** Number of shares or contracts (absolute value) */
  quantity: z.number().int().nonnegative(),
  /** Unit of size */
  unit: SizeUnitSchema,
  /** Target position after execution (signed: positive=long, negative=short) */
  targetPositionQuantity: z.number().int(),
});
export type Size = z.infer<typeof SizeSchema>;

/** Risk levels - mandatory for all decisions */
export const RiskLevelsSchema = z
  .object({
    /** Stop-loss price level */
    stopLossLevel: z.number().finite().positive(),
    /** Take-profit price level */
    takeProfitLevel: z.number().finite().positive(),
    /** What price the levels refer to */
    denomination: RiskDenominationSchema,
  })
  .superRefine((data, ctx) => {
    // Stop loss and take profit must be different
    if (data.stopLossLevel === data.takeProfitLevel) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "stopLossLevel and takeProfitLevel must be different",
        path: ["takeProfitLevel"],
      });
    }
  });
export type RiskLevels = z.infer<typeof RiskLevelsSchema>;

// ============================================
// Order Planning (mirroring decision.proto)
// ============================================

/** Execution tactic for algorithmic execution */
export const ExecutionTacticSchema = z.enum(["PASSIVE_LIMIT", "TWAP", "VWAP"]).optional();
export type ExecutionTactic = z.infer<typeof ExecutionTacticSchema>;

/** Execution parameters for tactics */
export const ExecutionParamsSchema = z
  .object({
    /** Duration in minutes (for TWAP/VWAP) */
    durationMinutes: z.number().int().positive().optional(),
    /** Interval between child orders in minutes (for TWAP) */
    intervalMinutes: z.number().int().positive().optional(),
    /** Randomize timing to avoid detection (for TWAP) */
    randomize: z.boolean().optional(),
    /** Target participation rate 0-1 (for VWAP) */
    participationRate: z.number().min(0).max(1).optional(),
    /** Limit price (for PASSIVE_LIMIT) */
    limitPrice: z.number().positive().optional(),
    /** Max wait time in seconds (for PASSIVE_LIMIT) */
    maxWaitSeconds: z.number().int().positive().optional(),
  })
  .passthrough(); // Allow additional params
export type ExecutionParams = z.infer<typeof ExecutionParamsSchema>;

/** Order execution plan */
export const OrderPlanSchema = z
  .object({
    /** Order type for entry */
    entryOrderType: OrderTypeSchema,
    /** Limit price for entry (required when entryOrderType is LIMIT) */
    entryLimitPrice: z.number().positive().optional(),
    /** Order type for exit */
    exitOrderType: OrderTypeSchema,
    /** Time in force for orders */
    timeInForce: TimeInForceSchema,
    /** Execution tactic identifier */
    executionTactic: z.string().optional().default(""),
    /** Additional execution parameters */
    executionParams: ExecutionParamsSchema.optional().default({}),
  })
  .superRefine((data, ctx) => {
    // Validate LIMIT order requires limit price
    if (data.entryOrderType === "LIMIT" && data.entryLimitPrice === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "entryLimitPrice is required when entryOrderType is LIMIT",
        path: ["entryLimitPrice"],
      });
    }

    // Validate executionTactic is valid
    if (
      data.executionTactic &&
      !["", "PASSIVE_LIMIT", "TWAP", "VWAP"].includes(data.executionTactic)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "executionTactic must be one of: PASSIVE_LIMIT, TWAP, VWAP, or empty string",
        path: ["executionTactic"],
      });
    }
  });
export type OrderPlan = z.infer<typeof OrderPlanSchema>;

// ============================================
// References (mirroring decision.proto)
// ============================================

/** References to supporting data */
export const ReferencesSchema = z.object({
  /** Indicator names used in decision */
  usedIndicators: z.array(z.string()).default([]),
  /** Memory case IDs from HelixDB */
  memoryCaseIds: z.array(z.string()).default([]),
  /** Event IDs that influenced decision */
  eventIds: z.array(z.string()).default([]),
});
export type References = z.infer<typeof ReferencesSchema>;

// ============================================
// Decision (mirroring decision.proto)
// ============================================

/** Individual decision for an instrument */
export const DecisionSchema = z.object({
  /** Target instrument */
  instrument: InstrumentSchema,
  /** Trading action */
  action: ActionSchema,
  /** Position sizing */
  size: SizeSchema,
  /** Order execution plan */
  orderPlan: OrderPlanSchema,
  /** Risk levels (mandatory - always required) */
  riskLevels: RiskLevelsSchema,
  /** Strategy family */
  strategyFamily: StrategyFamilySchema,
  /** Human-readable rationale for the decision */
  rationale: z.string().min(1),
  /** Confidence score [0.0, 1.0] */
  confidence: z.number().min(0).max(1),
  /** Supporting references */
  references: ReferencesSchema.optional().default({
    usedIndicators: [],
    memoryCaseIds: [],
    eventIds: [],
  }),
});
export type Decision = z.infer<typeof DecisionSchema>;

// ============================================
// DecisionPlan (mirroring decision.proto)
// ============================================

/** ISO-8601 timestamp with UTC timezone */
export const ISO8601TimestampSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/,
    "Must be ISO-8601 format with UTC timezone (e.g., 2026-01-04T15:00:00Z)"
  );
export type ISO8601Timestamp = z.infer<typeof ISO8601TimestampSchema>;

/** Complete decision plan for a trading cycle */
export const DecisionPlanSchema = z.object({
  /** Unique identifier for this trading cycle */
  cycleId: z.string().min(1),
  /** Timestamp when the decision was made (ISO-8601 with UTC) */
  asOfTimestamp: ISO8601TimestampSchema,
  /** Trading environment */
  environment: EnvironmentSchema,
  /** List of decisions for this cycle */
  decisions: z.array(DecisionSchema),
  /** Optional portfolio-level notes */
  portfolioNotes: z.string().optional(),
});
export type DecisionPlan = z.infer<typeof DecisionPlanSchema>;

// ============================================
// Validation Results (mirroring decision.proto)
// ============================================

/** Risk validation result */
export const RiskValidationResultSchema = z.object({
  /** Whether the validation passed */
  valid: z.boolean(),
  /** Validation errors (blocking issues) */
  errors: z.array(z.string()).default([]),
  /** Validation warnings (non-blocking issues) */
  warnings: z.array(z.string()).default([]),
  /** Calculated risk-reward ratio */
  riskRewardRatio: z.number().positive().optional(),
});
export type RiskValidationResult = z.infer<typeof RiskValidationResultSchema>;

/** Decision plan validation result */
export const DecisionPlanValidationResultSchema = z.object({
  /** Whether the validation passed */
  success: z.boolean(),
  /** Validated decision plan (if successful) */
  decisionPlan: DecisionPlanSchema.optional(),
  /** Validation errors */
  errors: z.array(z.string()).default([]),
  /** Validation warnings */
  warnings: z.array(z.string()).default([]),
});
export type DecisionPlanValidationResult = z.infer<typeof DecisionPlanValidationResultSchema>;

// ============================================
// Validation Utilities
// ============================================

/**
 * Validate risk-reward ratio for a decision.
 * Returns minimum 1.5:1 risk-reward ratio as per spec.
 */
export function validateRiskReward(decision: Decision, entryPrice: number): RiskValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const { stopLossLevel, takeProfitLevel } = decision.riskLevels;

  // Determine direction from action and target position
  const isLong = decision.size.targetPositionQuantity > 0;
  const isShort = decision.size.targetPositionQuantity < 0;

  if (isLong) {
    // Long position: stop < entry < profit
    if (stopLossLevel >= entryPrice) {
      errors.push(
        `Long position: stopLossLevel (${stopLossLevel}) must be below entry (${entryPrice})`
      );
    }
    if (takeProfitLevel <= entryPrice) {
      errors.push(
        `Long position: takeProfitLevel (${takeProfitLevel}) must be above entry (${entryPrice})`
      );
    }
  } else if (isShort) {
    // Short position: profit < entry < stop
    if (stopLossLevel <= entryPrice) {
      errors.push(
        `Short position: stopLossLevel (${stopLossLevel}) must be above entry (${entryPrice})`
      );
    }
    if (takeProfitLevel >= entryPrice) {
      errors.push(
        `Short position: takeProfitLevel (${takeProfitLevel}) must be below entry (${entryPrice})`
      );
    }
  }

  // Calculate risk-reward ratio
  const risk = Math.abs(entryPrice - stopLossLevel);
  const reward = Math.abs(takeProfitLevel - entryPrice);
  const riskRewardRatio = risk > 0 ? reward / risk : 0;

  // Minimum 1.5:1 risk-reward per spec
  if (riskRewardRatio < 1.5) {
    errors.push(`Risk-reward ratio ${riskRewardRatio.toFixed(2)}:1 is below minimum 1.5:1`);
  }

  // Warning for 5:1 stop distance rule
  if (risk > reward * 5) {
    warnings.push(`Stop loss distance exceeds 5x the profit target`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    riskRewardRatio: riskRewardRatio > 0 ? riskRewardRatio : undefined,
  };
}

/**
 * Validate an entire decision plan.
 */
export function validateDecisionPlan(plan: unknown): DecisionPlanValidationResult {
  const parseResult = DecisionPlanSchema.safeParse(plan);

  if (!parseResult.success) {
    return {
      success: false,
      errors: parseResult.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
      warnings: [],
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  // Additional business logic validation
  for (const decision of parseResult.data.decisions) {
    // Validate size consistency
    if (decision.action === "NO_TRADE" && decision.size.quantity !== 0) {
      warnings.push(`${decision.instrument.instrumentId}: NO_TRADE action should have quantity 0`);
    }

    // Validate unit matches instrument type
    if (decision.instrument.instrumentType === "OPTION" && decision.size.unit !== "CONTRACTS") {
      errors.push(
        `${decision.instrument.instrumentId}: OPTIONS must use CONTRACTS unit, not ${decision.size.unit}`
      );
    }
    if (decision.instrument.instrumentType === "EQUITY" && decision.size.unit !== "SHARES") {
      errors.push(
        `${decision.instrument.instrumentId}: EQUITY must use SHARES unit, not ${decision.size.unit}`
      );
    }
  }

  return {
    success: errors.length === 0,
    decisionPlan: errors.length === 0 ? parseResult.data : undefined,
    errors,
    warnings,
  };
}

// ============================================
// Exports
// ============================================

export {
  // Re-export all for convenience
  ActionSchema as Action_Schema,
  DecisionPlanSchema as DecisionPlan_Schema,
  DecisionSchema as Decision_Schema,
  EnvironmentSchema as Environment_Schema,
  InstrumentSchema as Instrument_Schema,
  OrderPlanSchema as OrderPlan_Schema,
  RiskLevelsSchema as RiskLevels_Schema,
  SizeSchema as Size_Schema,
};
