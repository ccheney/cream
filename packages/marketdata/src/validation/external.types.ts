/**
 * External data validation shared types and defaults.
 */

export interface ExternalDataValidationConfig {
	maxPrice: number;
	minPrice: number;
	maxVolume: number;
	maxAgeDays: number;
	maxFutureMinutes: number;
	enforceOHLC: boolean;
	maxPriceChangePct: number;
}

export const DEFAULT_EXTERNAL_VALIDATION_CONFIG: ExternalDataValidationConfig = {
	maxPrice: 100_000_000,
	minPrice: 0.0001,
	maxVolume: 10_000_000_000,
	maxAgeDays: 365 * 50,
	maxFutureMinutes: 5,
	enforceOHLC: true,
	maxPriceChangePct: 100,
};

export interface ExternalValidationIssue {
	field: string;
	value: unknown;
	issue: string;
	severity: "warning" | "error";
}

export interface ExternalValidationResult {
	valid: boolean;
	issues: ExternalValidationIssue[];
	sanitized?: Record<string, unknown>;
}

export interface RawCandle {
	timestamp?: unknown;
	t?: unknown;
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

export interface RateLimitStatus {
	isRateLimited: boolean;
	remaining?: number;
	limit?: number;
	resetTime?: Date;
	retryAfterSeconds?: number;
}
