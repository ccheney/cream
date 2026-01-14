/**
 * Error handling for HelixDB queries.
 * @module
 */

import { z } from "zod/v4";

/**
 * Query error types
 */
export const QueryErrorType = z.enum([
	"timeout",
	"network",
	"syntax",
	"index_not_ready",
	"out_of_memory",
	"unknown",
]);
export type QueryErrorType = z.infer<typeof QueryErrorType>;

/**
 * Query error with classification
 */
export class QueryError extends Error {
	readonly errorType: QueryErrorType;
	readonly retryable: boolean;

	constructor(message: string, errorType: QueryErrorType, retryable = false) {
		super(message);
		this.name = "QueryError";
		this.errorType = errorType;
		this.retryable = retryable;
	}
}

/**
 * Classify an error into a query error type.
 *
 * @param error - Error to classify
 * @returns Classified query error
 */
export function classifyError(error: unknown): QueryError {
	if (error instanceof QueryError) {
		return error;
	}

	const message = error instanceof Error ? error.message : String(error);
	const lowerMessage = message.toLowerCase();

	if (lowerMessage.includes("timeout")) {
		return new QueryError(message, "timeout", true);
	}
	if (lowerMessage.includes("network") || lowerMessage.includes("connection")) {
		return new QueryError(message, "network", true);
	}
	if (lowerMessage.includes("syntax") || lowerMessage.includes("parse")) {
		return new QueryError(message, "syntax", false);
	}
	if (lowerMessage.includes("index") && lowerMessage.includes("not ready")) {
		return new QueryError(message, "index_not_ready", true);
	}
	if (lowerMessage.includes("memory")) {
		return new QueryError(message, "out_of_memory", false);
	}

	return new QueryError(message, "unknown", false);
}

/**
 * Check if error is retryable.
 *
 * @param error - Error to check
 * @returns Whether the error is retryable
 */
export function isRetryableError(error: unknown): boolean {
	const classified = classifyError(error);
	return classified.retryable;
}
