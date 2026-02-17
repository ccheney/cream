import type { DecisionPlan } from "../schemas/decision-plan";
import type { EnforcementResult, ParseError, PreflightError } from "./outputEnforcer.types";

export function createParseError(
	finalError: string | undefined,
	rawOutput: string,
	attemptCount: number,
	fallbackMessage: string,
): ParseError {
	return {
		type: finalError?.includes("JSON") ? "JSON_PARSE" : "SCHEMA_VALIDATION",
		message: finalError ?? fallbackMessage,
		rawOutput,
		attemptCount,
	};
}

export function createSuccessResult(plan: DecisionPlan, attemptCount: number): EnforcementResult {
	return {
		success: true,
		decisionPlan: plan,
		fallbackTriggered: false,
		attemptCount,
	};
}

export function createParseFailureResult(
	parseError: ParseError,
	attemptCount: number,
): EnforcementResult {
	return {
		success: false,
		parseErrors: [parseError],
		fallbackTriggered: true,
		fallbackReason: "JSON parsing failed after retry - executing no new entries",
		attemptCount,
	};
}

export function createPreflightFailureResult(
	preflightErrors: PreflightError[],
	fallbackReason: string,
	attemptCount: number,
): EnforcementResult {
	return {
		success: false,
		preflightErrors,
		fallbackTriggered: true,
		fallbackReason,
		attemptCount,
	};
}
