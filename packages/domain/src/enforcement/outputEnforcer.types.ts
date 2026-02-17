import type { ZodSchema } from "zod";
import type { ParseLogger } from "../llm-parsing";
import type { Decision, DecisionPlan } from "../schemas/decision-plan";

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
		context: MarketContext,
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
