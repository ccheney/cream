/**
 * API Error Handler Utilities
 *
 * Error handling utilities for API errors with toast integration.
 *
 * @see docs/plans/ui/28-states.md lines 83-87
 */

// ============================================
// Types
// ============================================

/**
 * API error types.
 */
export type ApiErrorType =
	| "network"
	| "timeout"
	| "unauthorized"
	| "forbidden"
	| "not_found"
	| "validation"
	| "rate_limit"
	| "server"
	| "unknown";

/**
 * Structured API error.
 */
export interface ApiError {
	type: ApiErrorType;
	message: string;
	statusCode?: number;
	code?: string;
	details?: Record<string, unknown>;
	timestamp: number;
	isTransient: boolean;
}

/**
 * Error handler options.
 */
export interface ErrorHandlerOptions {
	/** Show toast notification for transient errors */
	showToast?: boolean;
	/** Error code prefix */
	codePrefix?: string;
	/** Custom error messages by type */
	messages?: Partial<Record<ApiErrorType, string>>;
}

// ============================================
// Constants
// ============================================

/**
 * Default error messages by type.
 */
export const DEFAULT_ERROR_MESSAGES: Record<ApiErrorType, string> = {
	network: "Unable to connect to the server. Please check your internet connection.",
	timeout: "The request timed out. Please try again.",
	unauthorized: "Your session has expired. Please sign in again.",
	forbidden: "You don't have permission to perform this action.",
	not_found: "The requested resource was not found.",
	validation: "Please check your input and try again.",
	rate_limit: "Too many requests. Please wait a moment and try again.",
	server: "Something went wrong on our end. Please try again later.",
	unknown: "An unexpected error occurred. Please try again.",
};

/**
 * HTTP status code to error type mapping.
 */
export const STATUS_TO_ERROR_TYPE: Record<number, ApiErrorType> = {
	400: "validation",
	401: "unauthorized",
	403: "forbidden",
	404: "not_found",
	408: "timeout",
	429: "rate_limit",
	500: "server",
	502: "server",
	503: "server",
	504: "timeout",
};

/**
 * Transient error types (can be retried).
 */
export const TRANSIENT_ERROR_TYPES: Set<ApiErrorType> = new Set<ApiErrorType>([
	"network",
	"timeout",
	"rate_limit",
	"server",
]);

// ============================================
// Error Detection
// ============================================

/**
 * Determine error type from error object.
 */
export function getErrorType(error: unknown): ApiErrorType {
	// Network errors
	if (error instanceof TypeError && error.message.includes("fetch")) {
		return "network";
	}

	// Abort/timeout errors
	if (error instanceof DOMException && error.name === "AbortError") {
		return "timeout";
	}

	// Response errors
	if (isResponseError(error)) {
		const statusCode = error.status ?? error.statusCode;
		if (statusCode && STATUS_TO_ERROR_TYPE[statusCode]) {
			return STATUS_TO_ERROR_TYPE[statusCode];
		}
	}

	return "unknown";
}

/**
 * Check if error is a response error with status code.
 */
export function isResponseError(
	error: unknown
): error is { status?: number; statusCode?: number; message?: string } {
	return (
		typeof error === "object" && error !== null && ("status" in error || "statusCode" in error)
	);
}

/**
 * Check if error is transient (can be retried).
 */
export function isTransientError(error: ApiError | ApiErrorType): boolean {
	const type = typeof error === "string" ? error : error.type;
	return TRANSIENT_ERROR_TYPES.has(type);
}

/**
 * Check if error is authentication-related.
 */
export function isAuthError(error: ApiError | ApiErrorType): boolean {
	const type = typeof error === "string" ? error : error.type;
	return type === "unauthorized" || type === "forbidden";
}

// ============================================
// Error Parsing
// ============================================

/**
 * Parse any error into structured ApiError.
 */
export function parseError(error: unknown, options: ErrorHandlerOptions = {}): ApiError {
	const type = getErrorType(error);
	const messages = { ...DEFAULT_ERROR_MESSAGES, ...options.messages };

	let message = messages[type];
	let statusCode: number | undefined;
	let code: string | undefined;
	let details: Record<string, unknown> | undefined;

	// Extract details from response error
	if (isResponseError(error)) {
		statusCode = error.status ?? error.statusCode;

		if (error.message) {
			message = error.message;
		}
	}

	// Extract from Error object
	if (error instanceof Error) {
		if (!message || type === "unknown") {
			message = error.message || messages.unknown;
		}
	}

	// Extract from object with body/data
	if (typeof error === "object" && error !== null) {
		const errorObj = error as Record<string, unknown>;

		if (errorObj.code && typeof errorObj.code === "string") {
			code = errorObj.code;
		}

		if (errorObj.details && typeof errorObj.details === "object") {
			details = errorObj.details as Record<string, unknown>;
		}

		// Try to extract message from various formats
		const body = errorObj.body ?? errorObj.data ?? errorObj;
		if (typeof body === "object" && body !== null) {
			const bodyObj = body as Record<string, unknown>;
			if (bodyObj.message && typeof bodyObj.message === "string") {
				message = bodyObj.message;
			}
			if (bodyObj.error && typeof bodyObj.error === "string") {
				message = bodyObj.error;
			}
		}
	}

	// Add code prefix if provided
	if (options.codePrefix && !code) {
		code = `${options.codePrefix}-${type.toUpperCase()}`;
	}

	return {
		type,
		message,
		statusCode,
		code,
		details,
		timestamp: Date.now(),
		isTransient: isTransientError(type),
	};
}

// ============================================
// Error Formatting
// ============================================

/**
 * Format error for display.
 */
export function formatError(error: ApiError): {
	title: string;
	message: string;
	hint?: string;
	code?: string;
} {
	const titles: Record<ApiErrorType, string> = {
		network: "Connection Error",
		timeout: "Request Timeout",
		unauthorized: "Session Expired",
		forbidden: "Access Denied",
		not_found: "Not Found",
		validation: "Invalid Input",
		rate_limit: "Too Many Requests",
		server: "Server Error",
		unknown: "Error",
	};

	const hints: Partial<Record<ApiErrorType, string>> = {
		network: "Check your internet connection and try again.",
		timeout: "The server is taking too long to respond.",
		unauthorized: "Please sign in again to continue.",
		rate_limit: "Please wait a few moments before trying again.",
		server: "Our team has been notified. Please try again later.",
	};

	return {
		title: titles[error.type],
		message: error.message,
		hint: hints[error.type],
		code: error.code,
	};
}

/**
 * Format error for toast notification.
 */
export function formatErrorForToast(error: ApiError): {
	title?: string;
	message: string;
} {
	const formatted = formatError(error);
	return {
		title: formatted.title,
		message: formatted.message,
	};
}

// ============================================
// Error Handler Class
// ============================================

/**
 * Error handler with toast integration.
 */
export class ErrorHandler {
	private options: ErrorHandlerOptions;
	private toastFn?: (message: string, options?: { title?: string }) => void;

	constructor(options: ErrorHandlerOptions = {}) {
		this.options = options;
	}

	/**
	 * Set toast function for notifications.
	 */
	setToastFunction(fn: (message: string, options?: { title?: string }) => void): void {
		this.toastFn = fn;
	}

	/**
	 * Handle error and optionally show toast.
	 */
	handle(error: unknown): ApiError {
		const parsed = parseError(error, this.options);

		if (this.options.showToast !== false && parsed.isTransient && this.toastFn) {
			const { title, message } = formatErrorForToast(parsed);
			this.toastFn(message, { title });
		}

		return parsed;
	}

	/**
	 * Handle error silently (no toast).
	 */
	handleSilent(error: unknown): ApiError {
		return parseError(error, this.options);
	}
}

// ============================================
// TanStack Query Integration
// ============================================

/**
 * Default query error handler for TanStack Query.
 *
 * @example
 * ```tsx
 * const queryClient = new QueryClient({
 *   defaultOptions: {
 *     queries: {
 *       onError: createQueryErrorHandler(toast.error),
 *     },
 *   },
 * });
 * ```
 */
export function createQueryErrorHandler(
	toastError: (message: string, options?: { title?: string }) => void
) {
	return (error: unknown) => {
		const parsed = parseError(error);

		// Only show toast for transient errors
		if (parsed.isTransient) {
			const { title, message } = formatErrorForToast(parsed);
			toastError(message, { title });
		}
	};
}

/**
 * Create retry condition for TanStack Query.
 */
export function createRetryCondition(maxRetries = 3) {
	return (failureCount: number, error: unknown) => {
		if (failureCount >= maxRetries) {
			return false;
		}

		const parsed = parseError(error);

		// Only retry transient errors
		return parsed.isTransient && parsed.type !== "rate_limit";
	};
}

// ============================================
// Default Instance
// ============================================

/**
 * Default error handler instance.
 */
export const errorHandler = new ErrorHandler({
	showToast: true,
	codePrefix: "CREAM",
});
