/**
 * Clock Synchronization and Timestamp Validation
 *
 * Provides utilities for validating system clock accuracy and
 * timestamp consistency across distributed components.
 *
 * ## Why Clock Sync Matters
 * - Trading systems require accurate timestamps for order execution
 * - Clock skew can cause data synchronization issues
 * - Multi-component systems (TS, Rust) need consistent time
 *
 * ## NTP/PTP Setup (Recommended)
 * For production deployments, ensure system clock is synced:
 * - Linux: Use chronyd or ntpd (systemctl enable chronyd)
 * - macOS: System Preferences → Date & Time → Set time automatically
 * - Windows: Settings → Time & language → Date & time → Set time automatically
 *
 * @see docs/plans/00-overview.md for clock sync requirements
 */

import type { ExecutionContext } from "./context";
import { isTest } from "./env";

// ============================================
// Configuration
// ============================================

/**
 * Clock skew thresholds
 */
export interface ClockSkewThresholds {
	/** Warn if skew exceeds this (ms) */
	warnThresholdMs: number;
	/** Error if skew exceeds this (ms) */
	errorThresholdMs: number;
	/** Cross-component skew warning threshold (ms) */
	componentSkewWarnMs: number;
}

/**
 * Default clock skew thresholds
 */
export const DEFAULT_CLOCK_THRESHOLDS: ClockSkewThresholds = {
	warnThresholdMs: 100, // 100ms - warn
	errorThresholdMs: 1000, // 1s - error
	componentSkewWarnMs: 10, // 10ms - cross-component
};

/**
 * Clock check result
 */
export interface ClockCheckResult {
	/** Whether the check passed */
	ok: boolean;
	/** Measured skew in milliseconds (positive = ahead, negative = behind) */
	skewMs: number;
	/** Server time used for comparison (ISO 8601) */
	referenceTime?: string;
	/** Warning message if applicable */
	warning?: string;
	/** Error message if applicable */
	error?: string;
	/** Timestamp of the check */
	checkedAt: string;
}

/**
 * Timestamp validation result
 */
export interface TimestampValidationResult {
	/** Whether the timestamp is valid */
	valid: boolean;
	/** The validated timestamp (may be adjusted) */
	timestamp: string;
	/** Warning messages */
	warnings: string[];
	/** Error messages */
	errors: string[];
}

// ============================================
// Clock Skew Detection
// ============================================

/**
 * Check system clock against reference time
 *
 * In test mode, always returns ok (tests don't need clock sync).
 *
 * @param ctx - ExecutionContext containing environment info
 * @param thresholds - Optional custom thresholds
 * @returns Clock check result
 */
export async function checkClockSkew(
	ctx: ExecutionContext,
	thresholds: ClockSkewThresholds = DEFAULT_CLOCK_THRESHOLDS,
): Promise<ClockCheckResult> {
	const checkedAt = new Date().toISOString();

	// Skip in test mode
	if (isTest(ctx)) {
		return {
			ok: true,
			skewMs: 0,
			checkedAt,
			warning: "Clock check skipped in test mode",
		};
	}

	try {
		// Try to get reference time from HTTP headers
		const { skewMs, referenceTime } = await measureHttpSkew();

		const result: ClockCheckResult = {
			ok: true,
			skewMs,
			referenceTime,
			checkedAt,
		};

		// Check against thresholds
		const absSkew = Math.abs(skewMs);

		if (absSkew >= thresholds.errorThresholdMs) {
			result.ok = false;
			result.error = `Clock skew ${skewMs}ms exceeds error threshold (${thresholds.errorThresholdMs}ms). Sync your system clock.`;
		} else if (absSkew >= thresholds.warnThresholdMs) {
			result.warning = `Clock skew ${skewMs}ms exceeds warning threshold (${thresholds.warnThresholdMs}ms). Consider syncing your system clock.`;
		}

		return result;
	} catch (error) {
		// If we can't check, warn but don't fail
		return {
			ok: true,
			skewMs: 0,
			checkedAt,
			warning: `Unable to verify clock sync: ${error instanceof Error ? error.message : String(error)}. Ensure NTP is configured.`,
		};
	}
}

/**
 * Measure clock skew using HTTP Date header
 *
 * This is less accurate than NTP but works without special protocols.
 * Typical accuracy: ±50-200ms depending on network latency.
 */
async function measureHttpSkew(): Promise<{ skewMs: number; referenceTime: string }> {
	const beforeMs = Date.now();

	// Use a reliable server with accurate Date header
	const response = await fetch("https://www.google.com", {
		method: "HEAD",
		cache: "no-store",
	});

	const afterMs = Date.now();
	const dateHeader = response.headers.get("Date");

	if (!dateHeader) {
		throw new Error("No Date header in response");
	}

	const serverTime = new Date(dateHeader);
	if (Number.isNaN(serverTime.getTime())) {
		throw new Error(`Invalid Date header: ${dateHeader}`);
	}

	// Account for round-trip time
	const rttMs = afterMs - beforeMs;
	const estimatedServerTime = serverTime.getTime() + rttMs / 2;
	const localTime = beforeMs + rttMs / 2;

	const skewMs = Math.round(localTime - estimatedServerTime);

	return {
		skewMs,
		referenceTime: serverTime.toISOString(),
	};
}

// ============================================
// Timestamp Validation
// ============================================

/**
 * Validate a timestamp is within acceptable range
 *
 * @param timestamp - ISO 8601 timestamp to validate
 * @param options - Validation options
 * @returns Validation result
 */
export function validateTimestamp(
	timestamp: string,
	options: {
		/** Allow future timestamps (default: false) */
		allowFuture?: boolean;
		/** Maximum age in milliseconds (default: 30 days) */
		maxAgeMs?: number;
		/** Tolerance for future timestamps in ms (default: 5000 = 5s) */
		futureTolerance?: number;
	} = {},
): TimestampValidationResult {
	const {
		allowFuture = false,
		maxAgeMs = 30 * 24 * 60 * 60 * 1000, // 30 days
		futureTolerance = 5000, // 5 seconds
	} = options;

	const result: TimestampValidationResult = {
		valid: true,
		timestamp,
		warnings: [],
		errors: [],
	};

	// Parse timestamp
	const date = new Date(timestamp);
	if (Number.isNaN(date.getTime())) {
		result.valid = false;
		result.errors.push(`Invalid timestamp format: ${timestamp}`);
		return result;
	}

	const now = Date.now();
	const timestampMs = date.getTime();

	// Check for pre-epoch timestamp (most fundamental check)
	if (timestampMs < 0) {
		result.valid = false;
		result.errors.push(`Timestamp ${timestamp} is before Unix epoch`);
		return result;
	}

	// Check for future timestamp
	if (timestampMs > now + futureTolerance) {
		if (allowFuture) {
			result.warnings.push(
				`Timestamp ${timestamp} is ${Math.round((timestampMs - now) / 1000)}s in the future`,
			);
		} else {
			result.valid = false;
			result.errors.push(
				`Timestamp ${timestamp} is ${Math.round((timestampMs - now) / 1000)}s in the future (beyond ${futureTolerance}ms tolerance)`,
			);
		}
	}

	// Check for stale timestamp
	const ageMs = now - timestampMs;
	if (ageMs > maxAgeMs) {
		result.valid = false;
		result.errors.push(
			`Timestamp ${timestamp} is ${Math.round(ageMs / (24 * 60 * 60 * 1000))} days old (max: ${Math.round(maxAgeMs / (24 * 60 * 60 * 1000))} days)`,
		);
	}

	return result;
}

/**
 * Validate cross-component timestamp consistency
 *
 * Checks if two timestamps from different components are reasonably close.
 *
 * @param timestamp1 - First timestamp (ISO 8601)
 * @param timestamp2 - Second timestamp (ISO 8601)
 * @param maxDiffMs - Maximum allowed difference (default: 10ms)
 * @returns Whether timestamps are consistent
 */
export function validateTimestampConsistency(
	timestamp1: string,
	timestamp2: string,
	maxDiffMs = DEFAULT_CLOCK_THRESHOLDS.componentSkewWarnMs,
): { consistent: boolean; diffMs: number; warning?: string } {
	const time1 = new Date(timestamp1).getTime();
	const time2 = new Date(timestamp2).getTime();

	if (Number.isNaN(time1) || Number.isNaN(time2)) {
		return {
			consistent: false,
			diffMs: Number.NaN,
			warning: "One or both timestamps are invalid",
		};
	}

	const diffMs = Math.abs(time1 - time2);
	const consistent = diffMs <= maxDiffMs;

	return {
		consistent,
		diffMs,
		warning: consistent
			? undefined
			: `Timestamp skew ${diffMs}ms exceeds threshold (${maxDiffMs}ms)`,
	};
}

// ============================================
// Candle Alignment
// ============================================

/**
 * Align timestamp to hourly candle boundary
 *
 * Returns the start of the hour for the given timestamp.
 *
 * @param timestamp - ISO 8601 timestamp
 * @returns Start of hour (ISO 8601)
 */
export function alignToHourlyCandle(timestamp: string): string {
	const date = new Date(timestamp);
	date.setUTCMinutes(0, 0, 0);
	return date.toISOString();
}

/**
 * Align timestamp to daily candle boundary
 *
 * Returns the start of the UTC day for the given timestamp.
 *
 * @param timestamp - ISO 8601 timestamp
 * @returns Start of UTC day (ISO 8601)
 */
export function alignToDailyCandle(timestamp: string): string {
	const date = new Date(timestamp);
	date.setUTCHours(0, 0, 0, 0);
	return date.toISOString();
}

/**
 * Check if timestamp aligns to hourly boundary
 *
 * @param timestamp - ISO 8601 timestamp
 * @returns Whether timestamp is on hour boundary
 */
export function isHourlyAligned(timestamp: string): boolean {
	const date = new Date(timestamp);
	return (
		date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0
	);
}

/**
 * Validate candle sequence for gaps and order
 *
 * @param timestamps - Array of candle timestamps (should be hourly)
 * @returns Validation result with detected issues
 */
export function validateCandleSequence(timestamps: string[]): {
	valid: boolean;
	gaps: { from: string; to: string; missingHours: number }[];
	outOfOrder: { index: number; timestamp: string }[];
} {
	const gaps: { from: string; to: string; missingHours: number }[] = [];
	const outOfOrder: { index: number; timestamp: string }[] = [];

	if (timestamps.length < 2) {
		return { valid: true, gaps, outOfOrder };
	}

	const hourMs = 60 * 60 * 1000;

	for (let i = 1; i < timestamps.length; i++) {
		const prevTimestamp = timestamps[i - 1];
		const currTimestamp = timestamps[i];

		if (!prevTimestamp || !currTimestamp) {
			continue;
		}

		const prevTime = new Date(prevTimestamp).getTime();
		const currTime = new Date(currTimestamp).getTime();

		// Check for out-of-order
		if (currTime <= prevTime) {
			outOfOrder.push({ index: i, timestamp: currTimestamp });
		}

		// Check for gaps (more than 1 hour apart)
		const diff = currTime - prevTime;
		if (diff > hourMs) {
			const missingHours = Math.floor(diff / hourMs) - 1;
			if (missingHours > 0) {
				gaps.push({
					from: prevTimestamp,
					to: currTimestamp,
					missingHours,
				});
			}
		}
	}

	return {
		valid: gaps.length === 0 && outOfOrder.length === 0,
		gaps,
		outOfOrder,
	};
}

// ============================================
// Monitoring
// ============================================

/**
 * Clock monitoring state
 */
interface ClockMonitorState {
	lastCheck: string | null;
	lastSkewMs: number;
	checkCount: number;
	warningCount: number;
	errorCount: number;
}

let monitorState: ClockMonitorState = {
	lastCheck: null,
	lastSkewMs: 0,
	checkCount: 0,
	warningCount: 0,
	errorCount: 0,
};

/**
 * Perform periodic clock check and update monitoring state
 *
 * @param ctx - ExecutionContext containing environment info
 * @param thresholds - Clock skew thresholds
 * @returns Check result
 */
export async function periodicClockCheck(
	ctx: ExecutionContext,
	thresholds: ClockSkewThresholds = DEFAULT_CLOCK_THRESHOLDS,
): Promise<ClockCheckResult> {
	const result = await checkClockSkew(ctx, thresholds);

	monitorState.lastCheck = result.checkedAt;
	monitorState.lastSkewMs = result.skewMs;
	monitorState.checkCount++;

	if (result.warning) {
		monitorState.warningCount++;
	}
	if (result.error) {
		monitorState.errorCount++;
	}

	return result;
}

/**
 * Get current clock monitoring state
 */
export function getClockMonitorState(): ClockMonitorState {
	return { ...monitorState };
}

/**
 * Reset clock monitoring state (for testing)
 */
export function resetClockMonitorState(): void {
	monitorState = {
		lastCheck: null,
		lastSkewMs: 0,
		checkCount: 0,
		warningCount: 0,
		errorCount: 0,
	};
}
