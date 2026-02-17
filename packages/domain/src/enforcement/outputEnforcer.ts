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
import { defaultLogger, type ParseLogger, parseOnce, parseWithRetry } from "../llm-parsing";
import {
	type Action,
	type Decision,
	type DecisionPlan,
	DecisionPlanSchema,
} from "../schemas/decision-plan";
import { createFallbackPlan } from "./outputEnforcer.fallback";
import {
	createParseError,
	createParseFailureResult,
	createPreflightFailureResult,
	createSuccessResult,
} from "./outputEnforcer.results";
import type {
	EnforcementOptions,
	EnforcementResult,
	MarketContext,
	ParseError,
	PositionInfo,
	PreflightError,
	PreflightResult,
	Result,
	TraderAgentInterface,
} from "./outputEnforcer.types";

export { createFallbackPlan } from "./outputEnforcer.fallback";
export type {
	EnforcementOptions,
	EnforcementResult,
	MarketContext,
	ParseError,
	PositionInfo,
	PreflightError,
	PreflightErrorType,
	PreflightResult,
	Result,
	TraderAgentInterface,
} from "./outputEnforcer.types";

interface NormalizedOptions {
	logger: ParseLogger;
	traderAgent?: TraderAgentInterface;
	schema: ZodSchema<DecisionPlan>;
	maxRevisionAttempts: number;
	skipPreflight: boolean;
}

const DEFAULT_OPTIONS = {
	logger: defaultLogger,
	maxRevisionAttempts: 1,
	skipPreflight: false,
} as const;

/**
 * Enforces output validation and preflight checks for DecisionPlan
 */
export class OutputEnforcer {
	private readonly options: NormalizedOptions;

	constructor(options: EnforcementOptions = {}) {
		this.options = {
			logger: options.logger ?? DEFAULT_OPTIONS.logger,
			traderAgent: options.traderAgent,
			schema: options.schema ?? DecisionPlanSchema,
			maxRevisionAttempts: options.maxRevisionAttempts ?? DEFAULT_OPTIONS.maxRevisionAttempts,
			skipPreflight: options.skipPreflight ?? DEFAULT_OPTIONS.skipPreflight,
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
		retryCallback?: (prompt: string) => Promise<string>,
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
			error: createParseError(result.finalError, response, 1, "Unknown parse error"),
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
	runPreflightChecks(plan: DecisionPlan, context: MarketContext): PreflightResult {
		const errors = this.getContextErrors(context);
		const warnings: PreflightError[] = [];
		const estimatedCost = this.validateDecisions(plan.decisions, context.currentPositions, errors);

		this.addBuyingPowerChecks(estimatedCost, context.buyingPower, errors, warnings);

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
		context: MarketContext,
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
			errorTypes: errors.map((error) => error.type),
		});

		try {
			const revisedResponse = await this.options.traderAgent.requestRevision(
				originalResponse,
				errors,
				context,
			);
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
		retryCallback?: (prompt: string) => Promise<string>,
	): Promise<EnforcementResult> {
		let attemptCount = 0;
		const parseResult = await this.parseAndValidateJSON(response, retryCallback);
		attemptCount += 1;

		if (!parseResult.ok) {
			this.options.logger.error("Parse failed after retry", {
				error: parseResult.error.message,
			});
			return createParseFailureResult(parseResult.error, attemptCount);
		}

		if (this.options.skipPreflight) {
			return createSuccessResult(parseResult.value, attemptCount);
		}

		const preflightResult = this.runPreflightChecks(parseResult.value, context);
		if (preflightResult.valid) {
			this.options.logger.info("Enforcement passed", {
				decisionsCount: parseResult.value.decisions.length,
				estimatedCost: preflightResult.estimatedCost,
			});
			return createSuccessResult(parseResult.value, attemptCount);
		}

		this.options.logger.warn("Preflight validation failed", {
			errorCount: preflightResult.errors.length,
			errors: preflightResult.errors.map((error) => error.message),
		});

		const revisionResult = await this.tryRevision(
			response,
			context,
			preflightResult.errors,
			attemptCount,
		);
		if (revisionResult) {
			return revisionResult;
		}

		return createPreflightFailureResult(
			preflightResult.errors,
			"Preflight validation failed - executing no new entries",
			attemptCount,
		);
	}

	private getContextErrors(context: MarketContext): PreflightError[] {
		const errors: PreflightError[] = [];

		if (!context.marketOpen) {
			errors.push({
				type: "MARKET_CLOSED",
				message: "Market is currently closed - cannot execute trades",
				severity: "ERROR",
			});
		}

		if (context.marginUsage >= context.maxMarginUsage) {
			errors.push({
				type: "MARGIN_EXCEEDED",
				message: `Margin usage (${(context.marginUsage * 100).toFixed(1)}%) exceeds maximum allowed (${(context.maxMarginUsage * 100).toFixed(1)}%)`,
				severity: "ERROR",
			});
		}

		return errors;
	}

	private validateDecisions(
		decisions: Decision[],
		currentPositions: Map<string, PositionInfo>,
		errors: PreflightError[],
	): number {
		let estimatedCost = 0;

		for (const decision of decisions) {
			const actionError = this.validateActionCompatibility(
				decision,
				currentPositions.get(decision.instrument.instrumentId),
			);
			if (actionError) {
				errors.push(actionError);
			}

			if (this.isNewEntry(decision.action)) {
				estimatedCost += this.estimateDecisionCost(decision);
			}

			if (decision.size.quantity < 0) {
				errors.push({
					type: "INVALID_SIZE",
					message: `Invalid size quantity (${decision.size.quantity}) - must be non-negative`,
					instrumentId: decision.instrument.instrumentId,
					decision,
					severity: "ERROR",
				});
			}
		}

		return estimatedCost;
	}

	private addBuyingPowerChecks(
		estimatedCost: number,
		buyingPower: number,
		errors: PreflightError[],
		warnings: PreflightError[],
	): void {
		if (estimatedCost > buyingPower) {
			errors.push({
				type: "INSUFFICIENT_BUYING_POWER",
				message: `Estimated cost ($${estimatedCost.toFixed(2)}) exceeds available buying power ($${buyingPower.toFixed(2)})`,
				severity: "ERROR",
			});
			return;
		}

		if (estimatedCost > buyingPower * 0.8) {
			warnings.push({
				type: "INSUFFICIENT_BUYING_POWER",
				message: `Estimated cost ($${estimatedCost.toFixed(2)}) uses more than 80% of buying power`,
				severity: "WARNING",
			});
		}
	}

	private async tryRevision(
		response: string,
		context: MarketContext,
		errors: PreflightError[],
		attemptCount: number,
	): Promise<EnforcementResult | null> {
		if (!this.options.traderAgent) {
			return null;
		}

		if (attemptCount >= this.options.maxRevisionAttempts + 1) {
			return null;
		}

		const revisionResult = await this.requestPlanRevision(response, errors, context);
		const revisionAttemptCount = attemptCount + 1;

		if (!revisionResult.ok) {
			return null;
		}

		const revisedPreflight = this.runPreflightChecks(revisionResult.value, context);
		if (revisedPreflight.valid) {
			this.options.logger.info("Revised plan passed enforcement", {
				decisionsCount: revisionResult.value.decisions.length,
			});
			return createSuccessResult(revisionResult.value, revisionAttemptCount);
		}

		this.options.logger.error("Revised plan also failed preflight", {
			errors: revisedPreflight.errors.map((error) => error.message),
		});

		return createPreflightFailureResult(
			revisedPreflight.errors,
			"Revised plan failed preflight - executing no new entries",
			revisionAttemptCount,
		);
	}

	private async parseWithRetryInternal(
		response: string,
		retryCallback?: (prompt: string) => Promise<string>,
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
			error: createParseError(
				result.finalError,
				response,
				result.attempts.length,
				"Unknown parse error",
			),
		};
	}

	private validateActionCompatibility(
		decision: Decision,
		currentPosition?: PositionInfo,
	): PreflightError | null {
		const { action } = decision;
		const instrumentId = decision.instrument.instrumentId;
		const hasPosition = currentPosition !== undefined && currentPosition.quantity !== 0;

		switch (action) {
			case "BUY":
				return hasPosition
					? this.createActionConflict(
							decision,
							`Cannot BUY ${instrumentId}: already have position (qty: ${currentPosition?.quantity}). Use INCREASE to add to position.`,
						)
					: null;
			case "SELL":
				return hasPosition
					? this.createActionConflict(
							decision,
							`Cannot SELL ${instrumentId}: already have position (qty: ${currentPosition?.quantity}). Use REDUCE to decrease position.`,
						)
					: null;
			case "INCREASE":
				return this.validateIncreaseAction(decision, currentPosition, hasPosition);
			case "REDUCE":
				return hasPosition
					? null
					: this.createActionConflict(
							decision,
							`Cannot REDUCE ${instrumentId}: no existing position to reduce`,
						);
			case "HOLD":
				return hasPosition
					? null
					: this.createActionConflict(
							decision,
							`Cannot HOLD ${instrumentId}: no existing position to hold`,
						);
			default:
				return null;
		}
	}

	private validateIncreaseAction(
		decision: Decision,
		currentPosition: PositionInfo | undefined,
		hasPosition: boolean,
	): PreflightError | null {
		const instrumentId = decision.instrument.instrumentId;

		if (!hasPosition) {
			return this.createActionConflict(
				decision,
				`Cannot INCREASE ${instrumentId}: no existing position. Use BUY or SELL to establish position.`,
			);
		}

		const targetIsLong = decision.size.targetPositionQuantity > 0;
		const currentIsLong = (currentPosition?.quantity ?? 0) > 0;
		const currentIsShort = (currentPosition?.quantity ?? 0) < 0;

		if ((currentIsLong && !targetIsLong) || (currentIsShort && targetIsLong)) {
			return this.createActionConflict(
				decision,
				`Cannot INCREASE ${instrumentId}: target direction conflicts with current position`,
			);
		}

		return null;
	}

	private createActionConflict(decision: Decision, message: string): PreflightError {
		return {
			type: "ACTION_CONFLICT",
			message,
			instrumentId: decision.instrument.instrumentId,
			decision,
			severity: "ERROR",
		};
	}

	private isNewEntry(action: Action): boolean {
		return action === "BUY" || action === "SELL";
	}

	private estimateDecisionCost(decision: Decision): number {
		const quantity = decision.size.quantity;
		const limitPrice = decision.orderPlan.entryLimitPrice;
		if (limitPrice) {
			return quantity * limitPrice;
		}

		const multiplier = decision.instrument.instrumentType === "OPTION" ? 100 : 1;
		return quantity * multiplier * 100;
	}
}

/**
 * Create an output enforcer with default options
 */
export function createOutputEnforcer(options?: EnforcementOptions): OutputEnforcer {
	return new OutputEnforcer(options);
}

/**
 * Parse and validate JSON response (standalone function)
 */
export async function parseAndValidateJSON(
	response: string,
	retryCallback?: (prompt: string) => Promise<string>,
	logger?: ParseLogger,
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
	logger?: ParseLogger,
): PreflightResult {
	const enforcer = createOutputEnforcer({ logger });
	return enforcer.runPreflightChecks(plan, context);
}

export default {
	OutputEnforcer,
	createOutputEnforcer,
	parseAndValidateJSON,
	runPreflightChecks,
	createFallbackPlan,
};
