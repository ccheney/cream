/**
 * Validation Utilities
 *
 * Error formatting, validation middleware, and SQL injection prevention
 * utilities for the data validation layer.
 *
 * @see docs/plans/ui/04-data-requirements.md
 */

import { z } from "zod";

// ============================================
// Error Types
// ============================================

/**
 * Validation field error.
 */
export interface ValidationFieldError {
	/** Path to the field (e.g., "order.limitPrice") */
	path: string;
	/** Human-readable error message */
	message: string;
	/** Zod error code */
	code: string;
	/** Expected type (if type error) */
	expected?: string;
	/** Received type (if type error) */
	received?: string;
}

/**
 * Validation error response.
 */
export interface ValidationError {
	/** Error type identifier */
	type: "validation_error";
	/** Overall error message */
	message: string;
	/** Field-level errors */
	fields: ValidationFieldError[];
	/** Timestamp of error */
	timestamp: string;
}

// ============================================
// Error Formatting
// ============================================

/**
 * Format a Zod error into a structured validation error.
 *
 * @example
 * ```ts
 * try {
 *   OrderInsertSchema.parse(data);
 * } catch (error) {
 *   if (error instanceof z.ZodError) {
 *     return c.json(formatValidationError(error), 400);
 *   }
 * }
 * ```
 */
export function formatValidationError(error: z.ZodError): ValidationError {
	return {
		type: "validation_error",
		message: `Validation failed: ${error.issues.length} error(s)`,
		fields: error.issues.map(formatZodIssue),
		timestamp: new Date().toISOString(),
	};
}

/**
 * Format a single Zod issue.
 */
export function formatZodIssue(issue: z.ZodIssue): ValidationFieldError {
	const fieldError: ValidationFieldError = {
		path: issue.path.join(".") || "(root)",
		message: issue.message,
		code: issue.code,
	};

	// Add type information for type errors
	if (issue.code === "invalid_type" && "expected" in issue) {
		fieldError.expected = String((issue as { expected?: unknown }).expected);
		fieldError.received = String((issue as { input?: unknown }).input);
	}

	return fieldError;
}

/**
 * Get all error messages as a single string.
 */
export function getErrorMessages(error: z.ZodError): string {
	return error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
}

// ============================================
// Safe Parsing Utilities
// ============================================

/**
 * Result type for safe parsing.
 */
export type ParseResult<T> =
	| { success: true; data: T }
	| { success: false; error: ValidationError };

/**
 * Safely parse data with a Zod schema.
 *
 * @example
 * ```ts
 * const result = safeParse(OrderInsertSchema, data);
 * if (!result.success) {
 *   return c.json(result.error, 400);
 * }
 * // result.data is typed as OrderInsert
 * ```
 */
export function safeParse<T>(schema: z.ZodType<T>, data: unknown): ParseResult<T> {
	const result = schema.safeParse(data);

	if (result.success) {
		return { success: true, data: result.data };
	}

	return { success: false, error: formatValidationError(result.error) };
}

/**
 * Parse with default values for missing optional fields.
 */
export function parseWithDefaults<T>(schema: z.ZodType<T>, data: unknown): ParseResult<T> {
	// Use .parse which applies defaults
	try {
		const parsed = schema.parse(data);
		return { success: true, data: parsed };
	} catch (error) {
		if (error instanceof z.ZodError) {
			return { success: false, error: formatValidationError(error) };
		}
		throw error;
	}
}

// ============================================
// SQL Injection Prevention
// ============================================

/**
 * Dangerous SQL characters.
 */
const SQL_INJECTION_PATTERNS = [
	/['"]/,
	/--/,
	/;/,
	/\/\*/,
	/\*\//,
	/\bOR\b/i,
	/\bAND\b/i,
	/\bDROP\b/i,
	/\bDELETE\b/i,
	/\bINSERT\b/i,
	/\bUPDATE\b/i,
	/\bEXEC\b/i,
	/\bUNION\b/i,
];

/**
 * Check if a string contains potential SQL injection.
 *
 * Note: This is a basic check. Always use parameterized queries.
 */
export function containsSqlInjection(value: string): boolean {
	return SQL_INJECTION_PATTERNS.some((pattern) => pattern.test(value));
}

/**
 * Create a safe string validator that rejects SQL injection attempts.
 */
export function safeString(minLength = 0, maxLength = 255): z.ZodString {
	return z
		.string()
		.min(minLength)
		.max(maxLength)
		.refine((value) => !containsSqlInjection(value), {
			message: "Input contains potentially unsafe characters",
		});
}

/**
 * Create a safe ticker symbol validator.
 */
export function safeTickerSymbol(): z.ZodString {
	return z
		.string()
		.min(1)
		.max(21)
		.regex(/^[A-Z0-9]+$/, "Ticker must be uppercase alphanumeric");
}

/**
 * Sanitize a string by removing dangerous characters.
 *
 * Note: Prefer parameterized queries over sanitization.
 */
export function sanitizeString(value: string): string {
	return value
		.replaceAll("'", "''")
		.replaceAll('"', '""')
		.replaceAll(";", "")
		.replaceAll("--", "")
		.replaceAll("/*", "")
		.replaceAll("*/", "");
}

// ============================================
// Validation Decorators
// ============================================

/**
 * Create a validated version of a function.
 *
 * @example
 * ```ts
 * const createOrder = validated(OrderInsertSchema, async (order) => {
 *   await db.insert(order);
 * });
 *
 * // Type-safe: order is OrderInsert
 * await createOrder({ ... });
 * ```
 */
export function validated<T, R>(
	schema: z.ZodType<T>,
	fn: (data: T) => R | Promise<R>,
): (data: unknown) => Promise<R> {
	return async (data: unknown) => {
		const parsed = schema.parse(data);
		return fn(parsed);
	};
}

/**
 * Create a validated version that returns a result instead of throwing.
 */
export function validatedSafe<T, R>(
	schema: z.ZodType<T>,
	fn: (data: T) => R | Promise<R>,
): (data: unknown) => Promise<ParseResult<R>> {
	return async (data: unknown) => {
		const result = safeParse(schema, data);
		if (!result.success) {
			return result;
		}
		const output = await fn(result.data);
		return { success: true, data: output };
	};
}

// ============================================
// Batch Validation
// ============================================

/**
 * Batch validation result.
 */
export interface BatchValidationResult<T> {
	valid: T[];
	invalid: Array<{ index: number; data: unknown; error: ValidationError }>;
}

/**
 * Validate an array of items, collecting both valid and invalid entries.
 *
 * @example
 * ```ts
 * const result = validateBatch(OrderInsertSchema, orders);
 * console.log(`${result.valid.length} valid, ${result.invalid.length} invalid`);
 * ```
 */
export function validateBatch<T>(schema: z.ZodType<T>, items: unknown[]): BatchValidationResult<T> {
	const valid: T[] = [];
	const invalid: Array<{ index: number; data: unknown; error: ValidationError }> = [];

	items.forEach((item, index) => {
		const result = safeParse(schema, item);
		if (result.success) {
			valid.push(result.data);
		} else {
			invalid.push({ index, data: item, error: result.error });
		}
	});

	return { valid, invalid };
}

// ============================================
// Type Guards
// ============================================

/**
 * Create a type guard from a Zod schema.
 *
 * @example
 * ```ts
 * const isOrder = createTypeGuard(OrderInsertSchema);
 *
 * if (isOrder(data)) {
 *   // data is OrderInsert
 * }
 * ```
 */
export function createTypeGuard<T>(schema: z.ZodType<T>): (data: unknown) => data is T {
	return (data: unknown): data is T => {
		return schema.safeParse(data).success;
	};
}

// ============================================
// Coercion Utilities
// ============================================

/**
 * Coerce query parameters to proper types.
 *
 * @example
 * ```ts
 * const QuerySchema = z.object({
 *   page: coerceInt(1),
 *   limit: coerceInt(20),
 *   active: coerceBool(true),
 * });
 * ```
 */
export function coerceInt(defaultValue?: number) {
	return z
		.unknown()
		.transform((val) => {
			if (val === undefined || val === null || val === "") {
				return defaultValue ?? 0;
			}
			const num = Number(val);
			return Number.isNaN(num) ? (defaultValue ?? 0) : Math.floor(num);
		})
		.pipe(z.number().int());
}

export function coerceBool(defaultValue?: boolean) {
	return z.unknown().transform((val) => {
		if (val === undefined || val === null) {
			return defaultValue ?? false;
		}
		if (typeof val === "boolean") {
			return val;
		}
		if (typeof val === "string") {
			const lower = val.toLowerCase();
			if (lower === "true" || lower === "1" || lower === "yes") {
				return true;
			}
			if (lower === "false" || lower === "0" || lower === "no" || lower === "") {
				return false;
			}
		}
		if (typeof val === "number") {
			return val !== 0;
		}
		return Boolean(val);
	});
}

export function coerceDate() {
	return z
		.unknown()
		.transform((val) => {
			if (val instanceof Date) {
				return val;
			}
			if (typeof val === "string" || typeof val === "number") {
				return new Date(val);
			}
			return new Date(NaN);
		})
		.pipe(z.date());
}

// ============================================
// Schema Composition Utilities
// ============================================

/**
 * Make all fields optional except specified ones.
 */
export function partialExcept<T extends z.ZodRawShape, K extends keyof T>(
	schema: z.ZodObject<T>,
	required: K[],
) {
	const shape = schema.shape;
	const entries = Object.entries(shape) as [string, z.ZodType<unknown>][];
	const newEntries = entries.map(([key, value]) => {
		if (required.includes(key as K)) {
			return [key, value] as const;
		}
		return [key, value.optional()] as const;
	});

	return z.object(Object.fromEntries(newEntries) as z.ZodRawShape);
}

/**
 * Add timestamps to a schema.
 */
export function withTimestamps<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
	return schema.extend({
		createdAt: z.string().datetime(),
		updatedAt: z.string().datetime(),
	});
}

/**
 * Add soft delete to a schema.
 */
export function withSoftDelete<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
	return schema.extend({
		deletedAt: z.string().datetime().nullable().optional(),
	});
}

// ============================================
// Exports
// ============================================

export default {
	// Error formatting
	formatValidationError,
	formatZodIssue,
	getErrorMessages,

	// Safe parsing
	safeParse,
	parseWithDefaults,

	// SQL injection prevention
	containsSqlInjection,
	safeString,
	safeTickerSymbol,
	sanitizeString,

	// Validation decorators
	validated,
	validatedSafe,

	// Batch validation
	validateBatch,

	// Type guards
	createTypeGuard,

	// Coercion
	coerceInt,
	coerceBool,
	coerceDate,

	// Schema composition
	partialExcept,
	withTimestamps,
	withSoftDelete,
};
