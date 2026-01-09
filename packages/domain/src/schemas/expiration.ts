/**
 * Expiration Handling Schemas
 *
 * Configuration and types for option expiration handling, including:
 * - Minimum DTE thresholds by position type
 * - Expiration Friday timeline scheduling (12 PM, 2 PM, 3 PM ET)
 * - Pin risk detection thresholds
 * - Auto-close policies for ITM/OTM positions
 *
 * @see docs/plans/08-options.md - Expiration Handling (lines 1161-1246)
 */

import { z } from "zod";

/**
 * Action to take for an expiring position.
 *
 * - CLOSE: Sell to close the position
 * - EXERCISE: Allow exercise/assignment (requires explicit configuration)
 * - LET_EXPIRE: Let expire worthless (OTM only)
 * - ROLL: Roll to next expiration (handled by rolling system)
 */
export const ExpirationAction = z.enum(["CLOSE", "EXERCISE", "LET_EXPIRE", "ROLL"]);
export type ExpirationAction = z.infer<typeof ExpirationAction>;

/**
 * Why a position is being flagged for expiration handling.
 */
export const ExpirationReason = z.enum([
  "MINIMUM_DTE", // Below minimum DTE threshold
  "PIN_RISK", // Near strike price at expiration
  "ITM_EXPIRATION", // ITM and needs handling
  "TIMELINE_TRIGGER", // Scheduled timeline action (12 PM, 2 PM, 3 PM)
  "FORCE_CLOSE", // 3 PM force close
  "AFTER_HOURS_RISK", // At risk of after-hours ITM move
]);
export type ExpirationReason = z.infer<typeof ExpirationReason>;

/**
 * Position type for DTE threshold determination.
 */
export const PositionTypeForDTE = z.enum([
  "LONG_OPTION", // Long call or put - 1 DTE minimum
  "SHORT_UNCOVERED", // Short call or put (uncovered) - 3 DTE minimum
  "DEFINED_RISK_SPREAD", // Vertical spreads, iron condors - 1 DTE minimum
  "COMPLEX_STRATEGY", // Iron butterflies, calendars - 3 DTE minimum
]);
export type PositionTypeForDTE = z.infer<typeof PositionTypeForDTE>;

/**
 * Moneyness classification for expiration handling.
 */
export const Moneyness = z.enum([
  "DEEP_ITM", // > $5 ITM
  "ITM", // $0.01 to $5 ITM
  "ATM", // Within pin risk threshold of strike
  "OTM", // $0.01 to $5 OTM
  "DEEP_OTM", // > $5 OTM
]);
export type Moneyness = z.infer<typeof Moneyness>;

/**
 * Expiration Friday timeline checkpoints (all times ET).
 *
 * - MARKET_OPEN: 9:30 AM - Evaluate all expiring positions
 * - AUTO_CLOSE_ITM: 12:00 PM - Auto-close ITM positions (unless exercise intended)
 * - FINAL_WARNING: 2:00 PM - Final warning for all expiring positions
 * - FORCE_CLOSE: 3:00 PM - Force close any remaining positions
 * - MARKET_CLOSE: 4:00 PM - Regular trading ends
 * - OCC_DEADLINE: 5:30 PM - OCC exercise deadline (1.5 hours after close)
 */
export const ExpirationCheckpoint = z.enum([
  "MARKET_OPEN",
  "AUTO_CLOSE_ITM",
  "FINAL_WARNING",
  "FORCE_CLOSE",
  "MARKET_CLOSE",
  "OCC_DEADLINE",
]);
export type ExpirationCheckpoint = z.infer<typeof ExpirationCheckpoint>;

/**
 * Checkpoint times in ET (24-hour format).
 */
export const EXPIRATION_CHECKPOINT_TIMES: Record<ExpirationCheckpoint, string> = {
  MARKET_OPEN: "09:30",
  AUTO_CLOSE_ITM: "12:00",
  FINAL_WARNING: "14:00",
  FORCE_CLOSE: "15:00",
  MARKET_CLOSE: "16:00",
  OCC_DEADLINE: "17:30",
};

/**
 * Minimum DTE thresholds by position type.
 */
export const MinimumDTEConfig = z.object({
  /** Long options can hold to 1 DTE (can let expire worthless) */
  longOption: z.number().int().min(0).max(30).default(1),

  /** Short uncovered options require 3 DTE (pin risk, gamma risk) */
  shortUncovered: z.number().int().min(0).max(30).default(3),

  /** Defined-risk spreads can hold to 1 DTE (risk is capped) */
  definedRiskSpread: z.number().int().min(0).max(30).default(1),

  /** Complex strategies require 3 DTE (execution risk on legs) */
  complexStrategy: z.number().int().min(0).max(30).default(3),
});
export type MinimumDTEConfig = z.infer<typeof MinimumDTEConfig>;

/**
 * Pin risk detection configuration.
 */
export const PinRiskConfig = z.object({
  /**
   * Distance from strike (in dollars) to consider pin risk.
   * Default: $0.50 - close OTM shorts within $0.50 of strike by 3 PM ET.
   */
  threshold: z.number().min(0).max(5).default(0.5),

  /**
   * Wider threshold for high-priced underlyings (> $500).
   * Default: $1.00
   */
  thresholdHighPrice: z.number().min(0).max(10).default(1.0),

  /**
   * Price threshold to use wider pin risk threshold.
   */
  highPriceThreshold: z.number().min(100).default(500),

  /**
   * Whether to auto-close on pin risk detection.
   */
  autoClose: z.boolean().default(true),
});
export type PinRiskConfig = z.infer<typeof PinRiskConfig>;

/**
 * Expiration policy configuration.
 */
export const ExpirationPolicyConfig = z.object({
  /**
   * Minimum DTE thresholds by position type.
   */
  minimumDTE: MinimumDTEConfig.default({
    longOption: 1,
    shortUncovered: 3,
    definedRiskSpread: 1,
    complexStrategy: 3,
  }),

  /**
   * Pin risk detection configuration.
   */
  pinRisk: PinRiskConfig.default({
    threshold: 0.5,
    thresholdHighPrice: 1.0,
    highPriceThreshold: 500,
    autoClose: true,
  }),

  /**
   * Whether to allow exercise (vs always close).
   * Default: false - always close to avoid capital requirements.
   */
  allowExercise: z.boolean().default(false),

  /**
   * Time to auto-close ITM positions (ET, 24-hour format).
   * Default: "12:00" (12:00 PM ET)
   */
  autoCloseITMTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .default("12:00"),

  /**
   * Time to force close all remaining positions (ET, 24-hour format).
   * Default: "15:00" (3:00 PM ET)
   */
  forceCloseTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .default("15:00"),

  /**
   * Close ITM positions by this time (ET, 24-hour format).
   * Default: "14:00" (2:00 PM ET) - gives buffer before 3 PM force close
   */
  closeITMByTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .default("14:00"),

  /**
   * Override to disable expiration handling (for testing).
   */
  disabled: z.boolean().default(false),
});
export type ExpirationPolicyConfig = z.infer<typeof ExpirationPolicyConfig>;

/**
 * An option position that is expiring and needs handling.
 */
export const ExpiringPositionSchema = z.object({
  /** Unique position identifier */
  positionId: z.string(),

  /** OSI symbol (21-character format) */
  osiSymbol: z.string(),

  /** Underlying symbol */
  underlyingSymbol: z.string(),

  /** Expiration date (YYYY-MM-DD) */
  expirationDate: z.string(),

  /** Strike price */
  strike: z.number(),

  /** Option right (CALL or PUT) */
  right: z.enum(["CALL", "PUT"]),

  /** Current quantity (positive = long, negative = short) */
  quantity: z.number().int(),

  /** Current underlying price */
  underlyingPrice: z.number(),

  /** Days to expiration (fractional) */
  dte: z.number(),

  /** Position type for DTE threshold */
  positionType: PositionTypeForDTE,

  /** Current moneyness classification */
  moneyness: Moneyness,

  /** Distance from strike in dollars */
  distanceFromStrike: z.number(),

  /** Whether position is in pin risk zone */
  isPinRisk: z.boolean(),

  /** Whether this is expiration day */
  isExpirationDay: z.boolean(),
});
export type ExpiringPosition = z.infer<typeof ExpiringPositionSchema>;

/**
 * Evaluation result for an expiring position.
 */
export const ExpirationEvaluationSchema = z.object({
  /** The expiring position */
  position: ExpiringPositionSchema,

  /** Recommended action */
  action: ExpirationAction,

  /** Reason for the action */
  reason: ExpirationReason,

  /** Priority (1-10, higher = more urgent) */
  priority: z.number().int().min(1).max(10),

  /** Human-readable explanation */
  explanation: z.string(),

  /** Deadline for action (ISO-8601) */
  deadline: z.string().optional(),

  /** Whether this is a forced action (non-negotiable) */
  isForced: z.boolean(),
});
export type ExpirationEvaluation = z.infer<typeof ExpirationEvaluationSchema>;

/**
 * Default minimum DTE configuration.
 */
export const DEFAULT_MINIMUM_DTE_CONFIG: MinimumDTEConfig = {
  longOption: 1,
  shortUncovered: 3,
  definedRiskSpread: 1,
  complexStrategy: 3,
};

/**
 * Default pin risk configuration.
 */
export const DEFAULT_PIN_RISK_CONFIG: PinRiskConfig = {
  threshold: 0.5,
  thresholdHighPrice: 1.0,
  highPriceThreshold: 500,
  autoClose: true,
};

/**
 * Default expiration policy configuration.
 */
export const DEFAULT_EXPIRATION_POLICY: ExpirationPolicyConfig = {
  minimumDTE: DEFAULT_MINIMUM_DTE_CONFIG,
  pinRisk: DEFAULT_PIN_RISK_CONFIG,
  allowExercise: false,
  autoCloseITMTime: "12:00",
  forceCloseTime: "15:00",
  closeITMByTime: "14:00",
  disabled: false,
};

/**
 * Get the minimum DTE for a position type.
 *
 * @param positionType - Type of position
 * @param config - DTE configuration
 * @returns Minimum DTE threshold
 */
export function getMinimumDTE(
  positionType: PositionTypeForDTE,
  config: MinimumDTEConfig = DEFAULT_EXPIRATION_POLICY.minimumDTE
): number {
  switch (positionType) {
    case "LONG_OPTION":
      return config.longOption;
    case "SHORT_UNCOVERED":
      return config.shortUncovered;
    case "DEFINED_RISK_SPREAD":
      return config.definedRiskSpread;
    case "COMPLEX_STRATEGY":
      return config.complexStrategy;
  }
}

/**
 * Classify moneyness based on distance from strike.
 *
 * @param underlyingPrice - Current underlying price
 * @param strike - Strike price
 * @param right - CALL or PUT
 * @returns Moneyness classification
 */
export function classifyMoneyness(
  underlyingPrice: number,
  strike: number,
  right: "CALL" | "PUT"
): Moneyness {
  const distance = right === "CALL" ? underlyingPrice - strike : strike - underlyingPrice;
  const absDistance = Math.abs(distance);

  // Check ATM first (within pin risk threshold of $0.50)
  if (absDistance <= 0.5) {
    return "ATM";
  }

  // Then check ITM/OTM based on direction
  if (distance > 5) {
    return "DEEP_ITM";
  }
  if (distance > 0) {
    return "ITM";
  }
  if (distance > -5) {
    return "OTM";
  }
  return "DEEP_OTM";
}

/**
 * Check if a position is in the pin risk zone.
 *
 * @param underlyingPrice - Current underlying price
 * @param strike - Strike price
 * @param config - Pin risk configuration
 * @returns Whether position is in pin risk zone
 */
export function checkPinRisk(
  underlyingPrice: number,
  strike: number,
  config: PinRiskConfig = DEFAULT_EXPIRATION_POLICY.pinRisk
): boolean {
  const threshold =
    underlyingPrice >= config.highPriceThreshold ? config.thresholdHighPrice : config.threshold;

  const distance = Math.abs(underlyingPrice - strike);
  return distance <= threshold;
}

/**
 * Get the pin risk threshold for an underlying price.
 *
 * @param underlyingPrice - Current underlying price
 * @param config - Pin risk configuration
 * @returns Threshold in dollars
 */
export function getPinRiskThreshold(
  underlyingPrice: number,
  config: PinRiskConfig = DEFAULT_EXPIRATION_POLICY.pinRisk
): number {
  return underlyingPrice >= config.highPriceThreshold
    ? config.thresholdHighPrice
    : config.threshold;
}

/**
 * Determine if an option should be let expire worthless.
 *
 * Only applies to OTM long options where letting expire is safe.
 * Short options should NOT be let expire due to pin risk.
 *
 * @param position - The expiring position
 * @returns Whether to let expire worthless
 */
export function shouldLetExpireWorthless(position: ExpiringPosition): boolean {
  // Only long positions can safely expire worthless
  if (position.quantity <= 0) {
    return false;
  }

  // Must be OTM or deeper
  if (position.moneyness !== "OTM" && position.moneyness !== "DEEP_OTM") {
    return false;
  }

  // Must not be in pin risk zone
  if (position.isPinRisk) {
    return false;
  }

  return true;
}

/**
 * Parse ET time string to minutes since midnight.
 */
export function parseETTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  if (hours === undefined || minutes === undefined) {
    throw new Error(`Invalid time format: ${time}`);
  }
  return hours * 60 + minutes;
}

/**
 * Get current checkpoint based on ET time.
 *
 * @param etTimeMinutes - Current time in minutes since midnight ET
 * @returns Current or most recent checkpoint
 */
export function getCurrentCheckpoint(etTimeMinutes: number): ExpirationCheckpoint | null {
  const checkpoints: ExpirationCheckpoint[] = [
    "OCC_DEADLINE",
    "MARKET_CLOSE",
    "FORCE_CLOSE",
    "FINAL_WARNING",
    "AUTO_CLOSE_ITM",
    "MARKET_OPEN",
  ];

  for (const checkpoint of checkpoints) {
    const time = EXPIRATION_CHECKPOINT_TIMES[checkpoint];
    const minutes = parseETTimeToMinutes(time);
    if (etTimeMinutes >= minutes) {
      return checkpoint;
    }
  }

  return null; // Before market open
}

/**
 * Check if we're past a specific checkpoint.
 *
 * @param checkpoint - Checkpoint to check
 * @param etTimeMinutes - Current time in minutes since midnight ET
 * @returns Whether we're past the checkpoint
 */
export function isPastCheckpoint(checkpoint: ExpirationCheckpoint, etTimeMinutes: number): boolean {
  const minutes = parseETTimeToMinutes(EXPIRATION_CHECKPOINT_TIMES[checkpoint]);
  return etTimeMinutes >= minutes;
}
