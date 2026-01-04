/**
 * DecisionPlan Zod Schema
 *
 * JSON structure for trading decisions with mandatory risk controls.
 * All decisions MUST include stop-loss and take-profit levels.
 *
 * @see docs/plans/06-decision-contract.md for full specification
 */

import { z } from "zod";

// ============================================
// Enums
// ============================================

/**
 * Trading action that expresses intent in terms of exposure
 */
export const Action = z.enum([
  "BUY", // Establish new long from flat
  "SELL", // Establish new short from flat
  "HOLD", // Maintain current position
  "INCREASE", // Increase exposure in direction
  "REDUCE", // Reduce exposure magnitude
  "NO_TRADE", // Remain flat
]);
export type Action = z.infer<typeof Action>;

/**
 * Instrument type
 */
export const InstrumentType = z.enum(["EQUITY", "OPTION"]);
export type InstrumentType = z.infer<typeof InstrumentType>;

/**
 * Size unit
 */
export const SizeUnit = z.enum(["SHARES", "CONTRACTS"]);
export type SizeUnit = z.infer<typeof SizeUnit>;

/**
 * Order type
 */
export const OrderType = z.enum(["LIMIT", "MARKET"]);
export type OrderType = z.infer<typeof OrderType>;

/**
 * Time in force
 */
export const TimeInForce = z.enum(["DAY", "GTC", "IOC", "FOK"]);
export type TimeInForce = z.infer<typeof TimeInForce>;

/**
 * Risk level denomination
 */
export const RiskDenomination = z.enum(["UNDERLYING_PRICE", "OPTION_PRICE"]);
export type RiskDenomination = z.infer<typeof RiskDenomination>;

/**
 * Strategy family
 */
export const StrategyFamily = z.enum([
  "TREND",
  "MEAN_REVERSION",
  "EVENT_DRIVEN",
  "VOLATILITY",
  "RELATIVE_VALUE",
]);
export type StrategyFamily = z.infer<typeof StrategyFamily>;

/**
 * Direction derived from action and position
 */
export const Direction = z.enum(["LONG", "SHORT", "FLAT"]);
export type Direction = z.infer<typeof Direction>;

/**
 * Market regime classification
 */
export const Regime = z.enum([
  "BULL_TREND",
  "BEAR_TREND",
  "RANGE_BOUND",
  "HIGH_VOLATILITY",
  "LOW_VOLATILITY",
  "CRISIS",
]);
export type Regime = z.infer<typeof Regime>;

/**
 * Market hours status
 */
export const MarketStatus = z.enum([
  "PRE_MARKET",
  "OPEN",
  "AFTER_HOURS",
  "CLOSED",
]);
export type MarketStatus = z.infer<typeof MarketStatus>;

/**
 * Option type (call or put)
 */
export const OptionType = z.enum(["CALL", "PUT"]);
export type OptionType = z.infer<typeof OptionType>;

// ============================================
// Sub-Schemas
// ============================================

/**
 * Option contract details (required when instrumentType is OPTION)
 */
export const OptionContractSchema = z.object({
  underlying: z.string().min(1),
  expiration: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  strike: z.number().positive(),
  optionType: OptionType,
});
export type OptionContract = z.infer<typeof OptionContractSchema>;

/**
 * Instrument identifier
 */
export const InstrumentSchema = z
  .object({
    instrumentId: z.string().min(1),
    instrumentType: InstrumentType,
    optionContract: OptionContractSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.instrumentType === "OPTION" && !data.optionContract) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "optionContract is required when instrumentType is OPTION",
        path: ["optionContract"],
      });
    }
  });
export type Instrument = z.infer<typeof InstrumentSchema>;

/**
 * Position sizing
 */
export const SizeSchema = z.object({
  quantity: z.number().int().nonnegative(),
  unit: SizeUnit,
  targetPositionQuantity: z.number().int(), // Signed: positive=long, negative=short
});
export type Size = z.infer<typeof SizeSchema>;

/**
 * Order plan
 */
export const OrderPlanSchema = z
  .object({
    entryOrderType: OrderType,
    entryLimitPrice: z.number().positive().optional(),
    exitOrderType: OrderType,
    timeInForce: TimeInForce,
    executionTactic: z.string().optional(),
    executionParams: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.entryOrderType === "LIMIT" && data.entryLimitPrice === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "entryLimitPrice is required when entryOrderType is LIMIT",
        path: ["entryLimitPrice"],
      });
    }
  });
export type OrderPlan = z.infer<typeof OrderPlanSchema>;

/**
 * Risk levels - MANDATORY for all decisions
 *
 * These are always required:
 * - BUY/SELL/INCREASE: Standard stop-loss and take-profit
 * - HOLD: Thresholds that would trigger action
 * - REDUCE: Levels for remaining position
 * - NO_TRADE: Entry trigger thresholds
 */
export const RiskLevelsSchema = z
  .object({
    stopLossLevel: z.number().positive(),
    takeProfitLevel: z.number().positive(),
    denomination: RiskDenomination,
  })
  .refine((data) => data.stopLossLevel !== data.takeProfitLevel, {
    message: "stopLossLevel and takeProfitLevel must be different",
  });
export type RiskLevels = z.infer<typeof RiskLevelsSchema>;

/**
 * References to supporting data
 */
export const ReferencesSchema = z.object({
  usedIndicators: z.array(z.string()).optional(),
  memoryCaseIds: z.array(z.string()).optional(),
  eventIds: z.array(z.string()).optional(),
});
export type References = z.infer<typeof ReferencesSchema>;

// ============================================
// Decision Schema with Validation
// ============================================

/**
 * Individual decision for an instrument
 *
 * Mandatory stop-loss and take-profit are enforced via riskLevels.
 */
export const DecisionSchema = z.object({
  instrument: InstrumentSchema,
  action: Action,
  size: SizeSchema,
  orderPlan: OrderPlanSchema,
  riskLevels: RiskLevelsSchema, // MANDATORY - always required
  strategyFamily: StrategyFamily,
  rationale: z.string().min(10), // Must provide meaningful justification
  confidence: z.number().min(0).max(1),
  references: ReferencesSchema.optional(),
});
export type Decision = z.infer<typeof DecisionSchema>;

// ============================================
// Risk Validation Utilities
// ============================================

/**
 * Determine the direction of a decision
 */
export function getDecisionDirection(decision: Decision): Direction {
  const { action, size } = decision;

  if (action === "NO_TRADE" || action === "HOLD") {
    if (size.targetPositionQuantity > 0) return "LONG";
    if (size.targetPositionQuantity < 0) return "SHORT";
    return "FLAT";
  }

  if (action === "BUY" || (action === "INCREASE" && size.targetPositionQuantity > 0)) {
    return "LONG";
  }

  if (action === "SELL" || (action === "INCREASE" && size.targetPositionQuantity < 0)) {
    return "SHORT";
  }

  if (action === "REDUCE") {
    if (size.targetPositionQuantity > 0) return "LONG";
    if (size.targetPositionQuantity < 0) return "SHORT";
    return "FLAT";
  }

  return "FLAT";
}

/**
 * Risk validation result
 */
export interface RiskValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  riskRewardRatio: number | null;
}

/**
 * Validate risk levels for a decision
 *
 * Checks:
 * 1. Positive values (handled by schema)
 * 2. Distinct values (handled by schema)
 * 3. Logical direction (stop below/above entry based on direction)
 * 4. Minimum risk-reward ratio (>= 1.5)
 * 5. Maximum stop distance (stop not > 5x profit target)
 */
export function validateRiskLevels(
  decision: Decision,
  entryPrice: number
): RiskValidationResult {
  const result: RiskValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    riskRewardRatio: null,
  };

  const { stopLossLevel, takeProfitLevel } = decision.riskLevels;
  const direction = getDecisionDirection(decision);

  // Skip detailed validation for FLAT positions
  if (direction === "FLAT") {
    return result;
  }

  const riskAmount = Math.abs(entryPrice - stopLossLevel);
  const rewardAmount = Math.abs(takeProfitLevel - entryPrice);

  // Calculate risk-reward ratio
  if (riskAmount > 0) {
    result.riskRewardRatio = rewardAmount / riskAmount;
  }

  // Validate logical direction
  if (direction === "LONG") {
    if (stopLossLevel >= entryPrice) {
      result.valid = false;
      result.errors.push(
        `LONG position: stopLossLevel (${stopLossLevel}) must be below entryPrice (${entryPrice})`
      );
    }
    if (takeProfitLevel <= entryPrice) {
      result.valid = false;
      result.errors.push(
        `LONG position: takeProfitLevel (${takeProfitLevel}) must be above entryPrice (${entryPrice})`
      );
    }
  } else if (direction === "SHORT") {
    if (stopLossLevel <= entryPrice) {
      result.valid = false;
      result.errors.push(
        `SHORT position: stopLossLevel (${stopLossLevel}) must be above entryPrice (${entryPrice})`
      );
    }
    if (takeProfitLevel >= entryPrice) {
      result.valid = false;
      result.errors.push(
        `SHORT position: takeProfitLevel (${takeProfitLevel}) must be below entryPrice (${entryPrice})`
      );
    }
  }

  // Check minimum risk-reward ratio (1.5:1)
  if (result.riskRewardRatio !== null && result.riskRewardRatio < 1.5) {
    result.warnings.push(
      `Risk-reward ratio (${result.riskRewardRatio.toFixed(2)}) is below minimum 1.5:1`
    );
  }

  // Check maximum stop distance (stop loss not > 5x profit target)
  if (riskAmount > rewardAmount * 5) {
    result.warnings.push(
      `Stop distance (${riskAmount.toFixed(2)}) exceeds 5x profit target (${rewardAmount.toFixed(2)})`
    );
  }

  return result;
}

// ============================================
// DecisionPlan Schema
// ============================================

/**
 * Complete decision plan for a trading cycle
 */
export const DecisionPlanSchema = z.object({
  cycleId: z.string().min(1),
  asOfTimestamp: z.string().datetime({ offset: true }), // ISO-8601 with timezone
  environment: z.enum(["BACKTEST", "PAPER", "LIVE"]),
  decisions: z.array(DecisionSchema),
  portfolioNotes: z.string().optional(),
});
export type DecisionPlan = z.infer<typeof DecisionPlanSchema>;

// ============================================
// Validation Functions
// ============================================

/**
 * Validate a complete decision plan
 *
 * This includes both schema validation and business logic validation
 * for risk levels.
 */
export function validateDecisionPlan(
  plan: unknown,
  entryPrices?: Map<string, number>
): {
  success: boolean;
  data?: DecisionPlan;
  errors: string[];
  warnings: string[];
} {
  // Schema validation
  const parseResult = DecisionPlanSchema.safeParse(plan);

  if (!parseResult.success) {
    return {
      success: false,
      errors: parseResult.error.issues.map(
        (i) => `${i.path.join(".")}: ${i.message}`
      ),
      warnings: [],
    };
  }

  const validPlan = parseResult.data;
  const errors: string[] = [];
  const warnings: string[] = [];

  // Business logic validation for each decision
  for (const decision of validPlan.decisions) {
    const entryPrice = entryPrices?.get(decision.instrument.instrumentId);

    if (entryPrice !== undefined) {
      const riskResult = validateRiskLevels(decision, entryPrice);
      if (!riskResult.valid) {
        errors.push(
          ...riskResult.errors.map(
            (e) => `${decision.instrument.instrumentId}: ${e}`
          )
        );
      }
      warnings.push(
        ...riskResult.warnings.map(
          (w) => `${decision.instrument.instrumentId}: ${w}`
        )
      );
    }
  }

  if (errors.length === 0) {
    return {
      success: true,
      data: validPlan,
      errors,
      warnings,
    };
  }

  return {
    success: false,
    errors,
    warnings,
  };
}
