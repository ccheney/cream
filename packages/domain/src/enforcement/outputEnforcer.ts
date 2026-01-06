/**
 * Output Enforcement for DecisionPlan
 *
 * Implements comprehensive output enforcement per spec lines 373-391:
 * - JSON parsing with retry (max 1 attempt)
 * - Preflight validation checks
 * - Plan revision request handling
 * - Fallback behavior (skip new entries, maintain existing positions)
 *
 * @see docs/plans/06-decision-contract.md - Output Enforcement section
 */

import type { ZodSchema } from "zod";
import {
  parseWithRetry,
  parseOnce,
  type ParseResult,
  type ParseLogger,
  defaultLogger,
} from "../llm-parsing";
import { DecisionPlanSchema, type DecisionPlan, type Decision, type Action } from "../schemas/decision-plan";

// ============================================
// Types
// ============================================

/**
 * Market context for preflight validation
 */
export interface MarketContext {
  /** Is the market currently open for trading */
  marketOpen: boolean;
  /** Current timestamp */
  currentTime: Date;
  /** Available buying power in dollars */
  buyingPower: number;
  /** Current margin usage percentage (0-1) */
  marginUsage: number;
  /** Maximum allowed margin usage (0-1) */
  maxMarginUsage: number;
  /** Current positions keyed by instrument ID */
  currentPositions: Map<string, PositionInfo>;
}

/**
 * Position information for preflight checks
 */
export interface PositionInfo {
  /** Instrument ID */
  instrumentId: string;
  /** Current quantity (positive=long, negative=short, zero=flat) */
  quantity: number;
  /** Average entry price */
  avgEntryPrice: number;
  /** Current market value */
  marketValue: number;
}

/**
 * Preflight error types
 */
export type PreflightErrorType =
  | "MARKET_CLOSED"
  | "INSUFFICIENT_BUYING_POWER"
  | "MARGIN_EXCEEDED"
  | "ACTION_CONFLICT"
  | "POSITION_NOT_FOUND"
  | "INVALID_SIZE";

/**
 * Preflight validation error
 */
export interface PreflightError {
  /** Error type */
  type: PreflightErrorType;
  /** Error message */
  message: string;
  /** Related instrument ID */
  instrumentId?: string;
  /** Related decision */
  decision?: Decision;
  /** Severity */
  severity: "ERROR" | "WARNING";
}

/**
 * Preflight validation result
 */
export interface PreflightResult {
  /** Whether preflight passed */
  valid: boolean;
  /** Errors found */
  errors: PreflightError[];
  /** Warnings found */
  warnings: PreflightError[];
  /** Estimated cost of all new entries */
  estimatedCost: number;
}

/**
 * Parse error for enforcement
 */
export interface ParseError {
  /** Error type */
  type: "JSON_PARSE" | "SCHEMA_VALIDATION" | "RETRY_FAILED";
  /** Error message */
  message: string;
  /** Raw output that failed */
  rawOutput?: string;
  /** Attempt count */
  attemptCount: number;
}

/**
 * Result type for enforcement operations
 */
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

/**
 * Enforcement result combining parse and preflight
 */
export interface EnforcementResult {
  /** Whether enforcement passed */
  success: boolean;
  /** Validated decision plan (if successful) */
  decisionPlan?: DecisionPlan;
  /** Parse errors (if any) */
  parseErrors?: ParseError[];
  /** Preflight errors (if any) */
  preflightErrors?: PreflightError[];
  /** Whether fallback was triggered */
  fallbackTriggered: boolean;
  /** Fallback reason */
  fallbackReason?: string;
  /** Retry attempt count */
  attemptCount: number;
}

/**
 * Agent interface for plan revision requests
 */
export interface TraderAgentInterface {
  /** Request a revised plan based on errors */
  requestRevision(
    originalPlan: string,
    errors: PreflightError[],
    context: MarketContext
  ): Promise<string>;
}

/**
 * Enforcement options
 */
export interface EnforcementOptions {
  /** Logger for observability */
  logger?: ParseLogger;
  /** Trader agent for revision requests */
  traderAgent?: TraderAgentInterface;
  /** Custom schema (defaults to DecisionPlanSchema) */
  schema?: ZodSchema<DecisionPlan>;
  /** Maximum revision attempts (default 1) */
  maxRevisionAttempts?: number;
  /** Whether to skip preflight checks */
  skipPreflight?: boolean;
}

const DEFAULT_OPTIONS: EnforcementOptions = {
  logger: defaultLogger,
  maxRevisionAttempts: 1,
  skipPreflight: false,
};

// ============================================
// Output Enforcer Class
// ============================================

/**
 * Enforces output validation and preflight checks for DecisionPlan
 */
export class OutputEnforcer {
  private readonly options: Required<EnforcementOptions>;

  constructor(options: EnforcementOptions = {}) {
    this.options = {
      logger: options.logger ?? DEFAULT_OPTIONS.logger!,
      traderAgent: options.traderAgent ?? undefined!,
      schema: options.schema ?? DecisionPlanSchema,
      maxRevisionAttempts: options.maxRevisionAttempts ?? DEFAULT_OPTIONS.maxRevisionAttempts!,
      skipPreflight: options.skipPreflight ?? DEFAULT_OPTIONS.skipPreflight!,
    };
  }

  /**
   * Parse and validate JSON response from LLM
   *
   * Per spec lines 377-383:
   * - If parse fails OR required keys missing: request ONE reformat
   * - If still failing: return error, execute no new entries
   */
  parseAndValidateJSON(
    response: string,
    retryCallback?: (prompt: string) => Promise<string>
  ): Promise<Result<DecisionPlan, ParseError>> {
    return this.parseWithRetryInternal(response, retryCallback);
  }

  /**
   * Parse JSON synchronously without retry
   */
  parseJSONOnce(response: string): Result<DecisionPlan, ParseError> {
    const result = parseOnce(response, this.options.schema, {
      agentType: "TraderAgent",
      logger: this.options.logger,
    });

    if (result.success && result.data) {
      return { ok: true, value: result.data };
    }

    return {
      ok: false,
      error: {
        type: result.finalError?.includes("JSON") ? "JSON_PARSE" : "SCHEMA_VALIDATION",
        message: result.finalError ?? "Unknown parse error",
        rawOutput: response,
        attemptCount: 1,
      },
    };
  }

  /**
   * Run preflight validation checks
   *
   * Per spec lines 385-391:
   * - Check market open/closed
   * - Check sufficient margin/buying power
   * - Check action conflicts with current holdings
   * - Do NOT coerce or clip - require explicit re-planning
   */
  runPreflightChecks(
    plan: DecisionPlan,
    context: MarketContext
  ): PreflightResult {
    const errors: PreflightError[] = [];
    const warnings: PreflightError[] = [];
    let estimatedCost = 0;

    // Check market hours
    if (!context.marketOpen) {
      errors.push({
        type: "MARKET_CLOSED",
        message: "Market is currently closed - cannot execute trades",
        severity: "ERROR",
      });
    }

    // Check margin usage
    if (context.marginUsage >= context.maxMarginUsage) {
      errors.push({
        type: "MARGIN_EXCEEDED",
        message: `Margin usage (${(context.marginUsage * 100).toFixed(1)}%) exceeds maximum allowed (${(context.maxMarginUsage * 100).toFixed(1)}%)`,
        severity: "ERROR",
      });
    }

    // Validate each decision
    for (const decision of plan.decisions) {
      const instrumentId = decision.instrument.instrumentId;
      const currentPosition = context.currentPositions.get(instrumentId);

      // Check action compatibility with current holdings
      const actionError = this.validateActionCompatibility(
        decision,
        currentPosition
      );
      if (actionError) {
        errors.push(actionError);
      }

      // Estimate cost for new entries
      if (this.isNewEntry(decision.action)) {
        const cost = this.estimateDecisionCost(decision);
        estimatedCost += cost;
      }

      // Check size validity
      if (decision.size.quantity < 0) {
        errors.push({
          type: "INVALID_SIZE",
          message: `Invalid size quantity (${decision.size.quantity}) - must be non-negative`,
          instrumentId,
          decision,
          severity: "ERROR",
        });
      }
    }

    // Check buying power
    if (estimatedCost > context.buyingPower) {
      errors.push({
        type: "INSUFFICIENT_BUYING_POWER",
        message: `Estimated cost ($${estimatedCost.toFixed(2)}) exceeds available buying power ($${context.buyingPower.toFixed(2)})`,
        severity: "ERROR",
      });
    } else if (estimatedCost > context.buyingPower * 0.8) {
      warnings.push({
        type: "INSUFFICIENT_BUYING_POWER",
        message: `Estimated cost ($${estimatedCost.toFixed(2)}) uses more than 80% of buying power`,
        severity: "WARNING",
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      estimatedCost,
    };
  }

  /**
   * Request a revised plan from the Trader Agent
   *
   * Per spec lines 385-391:
   * - Request revised plan from Trader Agent
   * - Do NOT coerce or clip
   * - Maximum 1 revision attempt per cycle
   */
  async requestPlanRevision(
    originalResponse: string,
    errors: PreflightError[],
    context: MarketContext
  ): Promise<Result<DecisionPlan, ParseError>> {
    if (!this.options.traderAgent) {
      return {
        ok: false,
        error: {
          type: "RETRY_FAILED",
          message: "No trader agent configured for revision requests",
          attemptCount: 0,
        },
      };
    }

    this.options.logger.info("Requesting plan revision from Trader Agent", {
      errorCount: errors.length,
      errorTypes: errors.map((e) => e.type),
    });

    try {
      const revisedResponse = await this.options.traderAgent.requestRevision(
        originalResponse,
        errors,
        context
      );

      // Parse the revised plan (no further retries)
      return this.parseJSONOnce(revisedResponse);
    } catch (error) {
      this.options.logger.error("Trader Agent revision request failed", {
        error: String(error),
      });

      return {
        ok: false,
        error: {
          type: "RETRY_FAILED",
          message: `Revision request failed: ${String(error)}`,
          attemptCount: 1,
        },
      };
    }
  }

  /**
   * Full enforcement pipeline
   *
   * Flow:
   * 1. Parse and validate JSON (with 1 retry on failure)
   * 2. Run preflight checks
   * 3. If preflight fails, request revision (1 attempt)
   * 4. If still failing, trigger fallback (skip new entries)
   */
  async enforce(
    response: string,
    context: MarketContext,
    retryCallback?: (prompt: string) => Promise<string>
  ): Promise<EnforcementResult> {
    let attemptCount = 0;

    // Step 1: Parse and validate JSON
    const parseResult = await this.parseAndValidateJSON(response, retryCallback);
    attemptCount++;

    if (!parseResult.ok) {
      this.options.logger.error("Parse failed after retry", {
        error: parseResult.error.message,
      });

      return {
        success: false,
        parseErrors: [parseResult.error],
        fallbackTriggered: true,
        fallbackReason: "JSON parsing failed after retry - executing no new entries",
        attemptCount,
      };
    }

    const plan = parseResult.value;

    // Step 2: Skip preflight if configured
    if (this.options.skipPreflight) {
      return {
        success: true,
        decisionPlan: plan,
        fallbackTriggered: false,
        attemptCount,
      };
    }

    // Step 3: Run preflight checks
    const preflightResult = this.runPreflightChecks(plan, context);

    if (preflightResult.valid) {
      this.options.logger.info("Enforcement passed", {
        decisionsCount: plan.decisions.length,
        estimatedCost: preflightResult.estimatedCost,
      });

      return {
        success: true,
        decisionPlan: plan,
        fallbackTriggered: false,
        attemptCount,
      };
    }

    // Step 4: Preflight failed - request revision (if agent available)
    this.options.logger.warn("Preflight validation failed", {
      errorCount: preflightResult.errors.length,
      errors: preflightResult.errors.map((e) => e.message),
    });

    if (this.options.traderAgent && attemptCount < this.options.maxRevisionAttempts + 1) {
      const revisionResult = await this.requestPlanRevision(
        response,
        preflightResult.errors,
        context
      );
      attemptCount++;

      if (revisionResult.ok) {
        // Re-run preflight on revised plan
        const revisedPreflightResult = this.runPreflightChecks(
          revisionResult.value,
          context
        );

        if (revisedPreflightResult.valid) {
          this.options.logger.info("Revised plan passed enforcement", {
            decisionsCount: revisionResult.value.decisions.length,
          });

          return {
            success: true,
            decisionPlan: revisionResult.value,
            fallbackTriggered: false,
            attemptCount,
          };
        }

        // Revised plan also failed preflight
        this.options.logger.error("Revised plan also failed preflight", {
          errors: revisedPreflightResult.errors.map((e) => e.message),
        });

        return {
          success: false,
          preflightErrors: revisedPreflightResult.errors,
          fallbackTriggered: true,
          fallbackReason: "Revised plan failed preflight - executing no new entries",
          attemptCount,
        };
      }
    }

    // Step 5: Fallback - skip new entries
    return {
      success: false,
      preflightErrors: preflightResult.errors,
      fallbackTriggered: true,
      fallbackReason: "Preflight validation failed - executing no new entries",
      attemptCount,
    };
  }

  // ============================================
  // Private Helpers
  // ============================================

  private async parseWithRetryInternal(
    response: string,
    retryCallback?: (prompt: string) => Promise<string>
  ): Promise<Result<DecisionPlan, ParseError>> {
    const result = await parseWithRetry(response, this.options.schema, {
      agentType: "TraderAgent",
      taskContext: "Generate a valid DecisionPlan for the current trading cycle",
      logger: this.options.logger,
      retryCallback,
    });

    if (result.success && result.data) {
      return { ok: true, value: result.data };
    }

    return {
      ok: false,
      error: {
        type: result.finalError?.includes("JSON") ? "JSON_PARSE" : "SCHEMA_VALIDATION",
        message: result.finalError ?? "Unknown parse error",
        rawOutput: response,
        attemptCount: result.attempts.length,
      },
    };
  }

  private validateActionCompatibility(
    decision: Decision,
    currentPosition?: PositionInfo
  ): PreflightError | null {
    const instrumentId = decision.instrument.instrumentId;
    const action = decision.action;
    const hasPosition = currentPosition && currentPosition.quantity !== 0;
    const isLong = currentPosition && currentPosition.quantity > 0;
    const isShort = currentPosition && currentPosition.quantity < 0;

    // BUY requires flat position (or no position)
    if (action === "BUY" && hasPosition) {
      return {
        type: "ACTION_CONFLICT",
        message: `Cannot BUY ${instrumentId}: already have position (qty: ${currentPosition.quantity}). Use INCREASE to add to position.`,
        instrumentId,
        decision,
        severity: "ERROR",
      };
    }

    // SELL requires flat position (or no position)
    if (action === "SELL" && hasPosition) {
      return {
        type: "ACTION_CONFLICT",
        message: `Cannot SELL ${instrumentId}: already have position (qty: ${currentPosition.quantity}). Use REDUCE to decrease position.`,
        instrumentId,
        decision,
        severity: "ERROR",
      };
    }

    // INCREASE requires existing position in same direction
    if (action === "INCREASE") {
      if (!hasPosition) {
        return {
          type: "ACTION_CONFLICT",
          message: `Cannot INCREASE ${instrumentId}: no existing position. Use BUY or SELL to establish position.`,
          instrumentId,
          decision,
          severity: "ERROR",
        };
      }

      const targetIsLong = decision.size.targetPositionQuantity > 0;
      if ((isLong && !targetIsLong) || (isShort && targetIsLong)) {
        return {
          type: "ACTION_CONFLICT",
          message: `Cannot INCREASE ${instrumentId}: target direction conflicts with current position`,
          instrumentId,
          decision,
          severity: "ERROR",
        };
      }
    }

    // REDUCE requires existing position
    if (action === "REDUCE" && !hasPosition) {
      return {
        type: "ACTION_CONFLICT",
        message: `Cannot REDUCE ${instrumentId}: no existing position to reduce`,
        instrumentId,
        decision,
        severity: "ERROR",
      };
    }

    // HOLD requires existing position
    if (action === "HOLD" && !hasPosition) {
      return {
        type: "ACTION_CONFLICT",
        message: `Cannot HOLD ${instrumentId}: no existing position to hold`,
        instrumentId,
        decision,
        severity: "ERROR",
      };
    }

    return null;
  }

  private isNewEntry(action: Action): boolean {
    return action === "BUY" || action === "SELL";
  }

  private estimateDecisionCost(decision: Decision): number {
    // Rough cost estimation based on quantity and order plan
    const quantity = decision.size.quantity;
    const limitPrice = decision.orderPlan.entryLimitPrice;

    if (limitPrice) {
      return quantity * limitPrice;
    }

    // If no limit price, use a conservative estimate
    // For options, multiply by 100 (contract multiplier)
    const multiplier = decision.instrument.instrumentType === "OPTION" ? 100 : 1;
    return quantity * multiplier * 100; // Assume $100 per share/contract
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create an output enforcer with default options
 */
export function createOutputEnforcer(
  options?: EnforcementOptions
): OutputEnforcer {
  return new OutputEnforcer(options);
}

/**
 * Parse and validate JSON response (standalone function)
 */
export async function parseAndValidateJSON(
  response: string,
  retryCallback?: (prompt: string) => Promise<string>,
  logger?: ParseLogger
): Promise<Result<DecisionPlan, ParseError>> {
  const enforcer = createOutputEnforcer({ logger });
  return enforcer.parseAndValidateJSON(response, retryCallback);
}

/**
 * Run preflight checks (standalone function)
 */
export function runPreflightChecks(
  plan: DecisionPlan,
  context: MarketContext,
  logger?: ParseLogger
): PreflightResult {
  const enforcer = createOutputEnforcer({ logger });
  return enforcer.runPreflightChecks(plan, context);
}

/**
 * Create a fallback decision plan that maintains existing positions
 */
export function createFallbackPlan(
  cycleId: string,
  currentPositions: Map<string, PositionInfo>
): DecisionPlan {
  const decisions: Decision[] = [];

  for (const [instrumentId, position] of currentPositions) {
    if (position.quantity !== 0) {
      decisions.push({
        instrument: {
          instrumentId,
          instrumentType: "EQUITY", // Default, should be enhanced with actual type
        },
        action: "HOLD",
        size: {
          quantity: Math.abs(position.quantity),
          unit: "SHARES",
          targetPositionQuantity: position.quantity,
        },
        orderPlan: {
          entryOrderType: "LIMIT",
          exitOrderType: "MARKET",
          timeInForce: "DAY",
        },
        riskLevels: {
          // Maintain existing risk levels (these should be from the original plan)
          stopLossLevel: position.avgEntryPrice * (position.quantity > 0 ? 0.95 : 1.05),
          takeProfitLevel: position.avgEntryPrice * (position.quantity > 0 ? 1.1 : 0.9),
          denomination: "UNDERLYING_PRICE",
        },
        strategyFamily: "TREND",
        rationale: "Fallback: maintaining existing position due to plan validation failure",
        confidence: 0.5,
      });
    }
  }

  return {
    cycleId,
    asOfTimestamp: new Date().toISOString().replace(/\.\d{3}/, "") + "Z",
    environment: "PAPER",
    decisions,
    portfolioNotes: "Fallback plan: no new entries, maintaining existing positions",
  };
}

// ============================================
// Exports
// ============================================

export default {
  OutputEnforcer,
  createOutputEnforcer,
  parseAndValidateJSON,
  runPreflightChecks,
  createFallbackPlan,
};
