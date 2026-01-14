/**
 * External Data Input Validation
 *
 * Validates raw data from external APIs (Alpaca, Alpha Vantage)
 * to prevent malformed or malicious data from entering the system.
 *
 * Key validations:
 * - Price bounds (negative prices, extreme values)
 * - Volume bounds (negative, extreme values)
 * - Timestamp validity (future dates, too old)
 * - Data integrity (OHLC relationships)
 * - Rate limiting indicators
 *
 * @see docs/plans/02-data-layer.md
 */

import { z } from "zod";

// ============================================
// Configuration
// ============================================

/**
 * External data validation configuration.
 */
export interface ExternalDataValidationConfig {
	/** Maximum allowed price value */
	maxPrice: number;
	/** Minimum allowed price (typically 0 for stocks) */
	minPrice: number;
	/** Maximum allowed volume */
	maxVolume: number;
	/** Maximum allowed timestamp age in days */
	maxAgeDays: number;
	/** Maximum allowed future timestamp offset in minutes */
	maxFutureMinutes: number;
	/** Enforce OHLC relationships */
	enforceOHLC: boolean;
	/** Maximum percent change in single candle */
	maxPriceChangePct: number;
}

export const DEFAULT_EXTERNAL_VALIDATION_CONFIG: ExternalDataValidationConfig = {
	maxPrice: 100_000_000, // $100M (for Berkshire Hathaway A)
	minPrice: 0.0001, // $0.0001 (penny stocks)
	maxVolume: 10_000_000_000, // 10B shares (rare but possible on high-volume days)
	maxAgeDays: 365 * 50, // 50 years of historical data
	maxFutureMinutes: 5, // Allow 5 minutes into future (clock skew)
	enforceOHLC: true,
	maxPriceChangePct: 100, // 100% max change (circuit breakers typically ~20%)
};

// ============================================
// Validation Result Types
// ============================================

/**
 * External data validation issue.
 */
export interface ExternalValidationIssue {
	field: string;
	value: unknown;
	issue: string;
	severity: "warning" | "error";
}

/**
 * External data validation result.
 */
export interface ExternalValidationResult {
	valid: boolean;
	issues: ExternalValidationIssue[];
	sanitized?: Record<string, unknown>;
}

// ============================================
// Price Validation
// ============================================

/**
 * Validate a price value.
 */
export function validatePrice(
	price: unknown,
	fieldName: string,
	config: ExternalDataValidationConfig = DEFAULT_EXTERNAL_VALIDATION_CONFIG
): ExternalValidationIssue[] {
	const issues: ExternalValidationIssue[] = [];

	if (price === null || price === undefined) {
		issues.push({
			field: fieldName,
			value: price,
			issue: "Price is null or undefined",
			severity: "error",
		});
		return issues;
	}

	const num = Number(price);

	if (Number.isNaN(num)) {
		issues.push({
			field: fieldName,
			value: price,
			issue: "Price is not a valid number",
			severity: "error",
		});
		return issues;
	}

	if (!Number.isFinite(num)) {
		issues.push({
			field: fieldName,
			value: price,
			issue: "Price is infinite",
			severity: "error",
		});
		return issues;
	}

	if (num < config.minPrice) {
		issues.push({
			field: fieldName,
			value: num,
			issue: `Price ${num} is below minimum ${config.minPrice}`,
			severity: num < 0 ? "error" : "warning",
		});
	}

	if (num > config.maxPrice) {
		issues.push({
			field: fieldName,
			value: num,
			issue: `Price ${num} exceeds maximum ${config.maxPrice}`,
			severity: "error",
		});
	}

	return issues;
}

/**
 * Validate OHLC relationships.
 * High >= Open, Close, Low
 * Low <= Open, Close, High
 */
export function validateOHLC(
	open: number,
	high: number,
	low: number,
	close: number
): ExternalValidationIssue[] {
	const issues: ExternalValidationIssue[] = [];

	if (high < open) {
		issues.push({
			field: "high",
			value: high,
			issue: `High (${high}) is less than Open (${open})`,
			severity: "error",
		});
	}

	if (high < close) {
		issues.push({
			field: "high",
			value: high,
			issue: `High (${high}) is less than Close (${close})`,
			severity: "error",
		});
	}

	if (high < low) {
		issues.push({
			field: "high",
			value: high,
			issue: `High (${high}) is less than Low (${low})`,
			severity: "error",
		});
	}

	if (low > open) {
		issues.push({
			field: "low",
			value: low,
			issue: `Low (${low}) is greater than Open (${open})`,
			severity: "error",
		});
	}

	if (low > close) {
		issues.push({
			field: "low",
			value: low,
			issue: `Low (${low}) is greater than Close (${close})`,
			severity: "error",
		});
	}

	return issues;
}

/**
 * Validate price change percentage.
 */
export function validatePriceChange(
	prevClose: number,
	currentOpen: number,
	config: ExternalDataValidationConfig = DEFAULT_EXTERNAL_VALIDATION_CONFIG
): ExternalValidationIssue[] {
	const issues: ExternalValidationIssue[] = [];

	if (prevClose <= 0) {
		return issues; // Can't calculate change from zero/negative
	}

	const changePct = Math.abs((currentOpen - prevClose) / prevClose) * 100;

	if (changePct > config.maxPriceChangePct) {
		issues.push({
			field: "open",
			value: currentOpen,
			issue: `Price change of ${changePct.toFixed(2)}% exceeds maximum ${config.maxPriceChangePct}%`,
			severity: "warning",
		});
	}

	return issues;
}

// ============================================
// Volume Validation
// ============================================

/**
 * Validate a volume value.
 */
export function validateVolume(
	volume: unknown,
	config: ExternalDataValidationConfig = DEFAULT_EXTERNAL_VALIDATION_CONFIG
): ExternalValidationIssue[] {
	const issues: ExternalValidationIssue[] = [];

	if (volume === null || volume === undefined) {
		issues.push({
			field: "volume",
			value: volume,
			issue: "Volume is null or undefined",
			severity: "error",
		});
		return issues;
	}

	const num = Number(volume);

	if (Number.isNaN(num)) {
		issues.push({
			field: "volume",
			value: volume,
			issue: "Volume is not a valid number",
			severity: "error",
		});
		return issues;
	}

	if (!Number.isFinite(num)) {
		issues.push({
			field: "volume",
			value: volume,
			issue: "Volume is infinite",
			severity: "error",
		});
		return issues;
	}

	if (num < 0) {
		issues.push({
			field: "volume",
			value: num,
			issue: "Volume cannot be negative",
			severity: "error",
		});
	}

	if (num > config.maxVolume) {
		issues.push({
			field: "volume",
			value: num,
			issue: `Volume ${num} exceeds maximum ${config.maxVolume}`,
			severity: "warning",
		});
	}

	return issues;
}

// ============================================
// Timestamp Validation
// ============================================

/**
 * Validate a timestamp value.
 */
export function validateTimestamp(
	timestamp: unknown,
	config: ExternalDataValidationConfig = DEFAULT_EXTERNAL_VALIDATION_CONFIG
): ExternalValidationIssue[] {
	const issues: ExternalValidationIssue[] = [];

	if (timestamp === null || timestamp === undefined) {
		issues.push({
			field: "timestamp",
			value: timestamp,
			issue: "Timestamp is null or undefined",
			severity: "error",
		});
		return issues;
	}

	let date: Date;

	if (timestamp instanceof Date) {
		date = timestamp;
	} else if (typeof timestamp === "string") {
		date = new Date(timestamp);
	} else if (typeof timestamp === "number") {
		// Could be Unix timestamp (seconds or milliseconds)
		date = timestamp > 1e12 ? new Date(timestamp) : new Date(timestamp * 1000);
	} else {
		issues.push({
			field: "timestamp",
			value: timestamp,
			issue: "Timestamp must be Date, string, or number",
			severity: "error",
		});
		return issues;
	}

	if (Number.isNaN(date.getTime())) {
		issues.push({
			field: "timestamp",
			value: timestamp,
			issue: "Invalid timestamp format",
			severity: "error",
		});
		return issues;
	}

	const now = Date.now();
	const maxFuture = now + config.maxFutureMinutes * 60 * 1000;
	const minPast = now - config.maxAgeDays * 24 * 60 * 60 * 1000;

	if (date.getTime() > maxFuture) {
		issues.push({
			field: "timestamp",
			value: timestamp,
			issue: `Timestamp ${date.toISOString()} is too far in the future`,
			severity: "error",
		});
	}

	if (date.getTime() < minPast) {
		issues.push({
			field: "timestamp",
			value: timestamp,
			issue: `Timestamp ${date.toISOString()} is too old (>${config.maxAgeDays} days)`,
			severity: "warning",
		});
	}

	return issues;
}

// ============================================
// Candle Validation
// ============================================

/**
 * Raw candle data from external API.
 */
export interface RawCandle {
	timestamp?: unknown;
	t?: unknown; // Polygon uses 't'
	open?: unknown;
	o?: unknown;
	high?: unknown;
	h?: unknown;
	low?: unknown;
	l?: unknown;
	close?: unknown;
	c?: unknown;
	volume?: unknown;
	v?: unknown;
	[key: string]: unknown;
}

/**
 * Validate a raw candle from an external API.
 */
export function validateRawCandle(
	candle: RawCandle,
	config: ExternalDataValidationConfig = DEFAULT_EXTERNAL_VALIDATION_CONFIG
): ExternalValidationResult {
	const issues: ExternalValidationIssue[] = [];

	// Extract values with fallbacks for different API formats
	const timestamp = candle.timestamp ?? candle.t;
	const open = candle.open ?? candle.o;
	const high = candle.high ?? candle.h;
	const low = candle.low ?? candle.l;
	const close = candle.close ?? candle.c;
	const volume = candle.volume ?? candle.v;

	// Validate timestamp
	issues.push(...validateTimestamp(timestamp, config));

	// Validate prices
	issues.push(...validatePrice(open, "open", config));
	issues.push(...validatePrice(high, "high", config));
	issues.push(...validatePrice(low, "low", config));
	issues.push(...validatePrice(close, "close", config));

	// Validate volume
	issues.push(...validateVolume(volume, config));

	// Validate OHLC relationships if all prices are valid numbers
	if (
		config.enforceOHLC &&
		typeof open === "number" &&
		typeof high === "number" &&
		typeof low === "number" &&
		typeof close === "number"
	) {
		issues.push(...validateOHLC(open, high, low, close));
	}

	const hasErrors = issues.some((i) => i.severity === "error");

	return {
		valid: !hasErrors,
		issues,
		sanitized: hasErrors
			? undefined
			: {
					timestamp,
					open: Number(open),
					high: Number(high),
					low: Number(low),
					close: Number(close),
					volume: Number(volume),
				},
	};
}

/**
 * Validate an array of raw candles.
 */
export function validateRawCandles(
	candles: RawCandle[],
	config: ExternalDataValidationConfig = DEFAULT_EXTERNAL_VALIDATION_CONFIG
): {
	valid: RawCandle[];
	invalid: Array<{ index: number; candle: RawCandle; issues: ExternalValidationIssue[] }>;
	totalIssues: number;
} {
	const valid: RawCandle[] = [];
	const invalid: Array<{
		index: number;
		candle: RawCandle;
		issues: ExternalValidationIssue[];
	}> = [];
	let totalIssues = 0;

	for (let i = 0; i < candles.length; i++) {
		const candle = candles[i];
		if (!candle) {
			continue;
		}

		const result = validateRawCandle(candle, config);
		totalIssues += result.issues.length;

		if (result.valid) {
			valid.push(candle);
		} else {
			invalid.push({
				index: i,
				candle,
				issues: result.issues,
			});
		}
	}

	return { valid, invalid, totalIssues };
}

// ============================================
// API Response Validation Schemas
// ============================================

/**
 * Generic API error response schema.
 */
export const ApiErrorResponseSchema = z.object({
	error: z.string().optional(),
	message: z.string().optional(),
	status: z.union([z.string(), z.number()]).optional(),
	code: z.union([z.string(), z.number()]).optional(),
});

export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

/**
 * Check if response indicates an API error.
 */
export function isApiErrorResponse(response: unknown): response is ApiErrorResponse {
	if (typeof response !== "object" || response === null) {
		return false;
	}

	const obj = response as Record<string, unknown>;

	// Common error patterns from various APIs
	if (obj.error || obj.Error || obj.ERROR) {
		return true;
	}

	if (typeof obj.status === "string" && obj.status.toLowerCase().includes("error")) {
		return true;
	}

	if (typeof obj.status === "number" && obj.status >= 400) {
		return true;
	}

	if (typeof obj.code === "number" && obj.code !== 200 && obj.code !== 0) {
		return true;
	}

	return false;
}

/**
 * Extract error message from API error response.
 */
export function extractApiErrorMessage(response: unknown): string {
	if (typeof response !== "object" || response === null) {
		return "Unknown error";
	}

	const obj = response as Record<string, unknown>;

	// Try common error message fields
	if (typeof obj.error === "string") {
		return obj.error;
	}
	if (typeof obj.message === "string") {
		return obj.message;
	}
	if (typeof obj.Error === "string") {
		return obj.Error;
	}
	if (typeof obj.Message === "string") {
		return obj.Message;
	}
	if (typeof obj.error_message === "string") {
		return obj.error_message;
	}

	// Try nested error object
	if (typeof obj.error === "object" && obj.error !== null) {
		const nested = obj.error as Record<string, unknown>;
		if (typeof nested.message === "string") {
			return nested.message;
		}
	}

	return JSON.stringify(response);
}

// ============================================
// Rate Limit Detection
// ============================================

/**
 * Rate limit status from API response.
 */
export interface RateLimitStatus {
	isRateLimited: boolean;
	remaining?: number;
	limit?: number;
	resetTime?: Date;
	retryAfterSeconds?: number;
}

/**
 * Extract rate limit status from HTTP headers.
 */
export function extractRateLimitStatus(headers: Headers | Record<string, string>): RateLimitStatus {
	const getHeader = (name: string): string | null => {
		if (headers instanceof Headers) {
			return headers.get(name);
		}
		return headers[name] ?? headers[name.toLowerCase()] ?? null;
	};

	const remaining = getHeader("X-RateLimit-Remaining") ?? getHeader("RateLimit-Remaining");
	const limit = getHeader("X-RateLimit-Limit") ?? getHeader("RateLimit-Limit");
	const reset = getHeader("X-RateLimit-Reset") ?? getHeader("RateLimit-Reset");
	const retryAfter = getHeader("Retry-After");

	const remainingNum = remaining ? parseInt(remaining, 10) : undefined;
	const limitNum = limit ? parseInt(limit, 10) : undefined;

	let resetTime: Date | undefined;
	if (reset) {
		const resetNum = parseInt(reset, 10);
		if (!Number.isNaN(resetNum)) {
			// Could be Unix timestamp or seconds from now
			resetTime =
				resetNum > 1e9 ? new Date(resetNum * 1000) : new Date(Date.now() + resetNum * 1000);
		}
	}

	let retryAfterSeconds: number | undefined;
	if (retryAfter) {
		retryAfterSeconds = parseInt(retryAfter, 10);
		if (Number.isNaN(retryAfterSeconds)) {
			// Could be HTTP-date format
			const retryDate = new Date(retryAfter);
			if (!Number.isNaN(retryDate.getTime())) {
				retryAfterSeconds = Math.max(0, Math.ceil((retryDate.getTime() - Date.now()) / 1000));
			}
		}
	}

	const isRateLimited = remainingNum === 0 || retryAfterSeconds !== undefined;

	return {
		isRateLimited,
		remaining: remainingNum,
		limit: limitNum,
		resetTime,
		retryAfterSeconds,
	};
}

// ============================================
// Symbol Validation
// ============================================

/**
 * Validate a ticker symbol.
 */
export function validateSymbol(symbol: unknown): ExternalValidationIssue[] {
	const issues: ExternalValidationIssue[] = [];

	if (typeof symbol !== "string") {
		issues.push({
			field: "symbol",
			value: symbol,
			issue: "Symbol must be a string",
			severity: "error",
		});
		return issues;
	}

	if (symbol.length === 0) {
		issues.push({
			field: "symbol",
			value: symbol,
			issue: "Symbol cannot be empty",
			severity: "error",
		});
		return issues;
	}

	if (symbol.length > 21) {
		issues.push({
			field: "symbol",
			value: symbol,
			issue: "Symbol exceeds maximum length of 21 characters",
			severity: "error",
		});
	}

	// Allow alphanumeric plus common option symbol characters
	if (!/^[A-Z0-9.^/-]+$/i.test(symbol)) {
		issues.push({
			field: "symbol",
			value: symbol,
			issue: "Symbol contains invalid characters",
			severity: "error",
		});
	}

	return issues;
}

// ============================================
// Export Default
// ============================================

export default {
	validatePrice,
	validateOHLC,
	validatePriceChange,
	validateVolume,
	validateTimestamp,
	validateRawCandle,
	validateRawCandles,
	validateSymbol,
	isApiErrorResponse,
	extractApiErrorMessage,
	extractRateLimitStatus,
	DEFAULT_EXTERNAL_VALIDATION_CONFIG,
};
