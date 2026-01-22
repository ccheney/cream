/**
 * Snapshot Size Limits and Performance Monitoring
 *
 * Implements size constraints, token estimation, and monitoring for market snapshots.
 * Ensures snapshots are efficiently consumable by LLMs within token budgets.
 *
 * @see docs/plans/03-market-snapshot.md - Market snapshot specification
 */

import type { MarketSnapshot, SymbolSnapshot } from "./marketSnapshot";

// ============================================
// Size Limit Constants
// ============================================

/**
 * Snapshot size limits in bytes.
 */
export const SNAPSHOT_SIZE_LIMITS = {
	/** Target snapshot size (bytes) - aim to stay under this */
	TARGET_BYTES: 100 * 1024, // 100 KB
	/** Maximum snapshot size (bytes) - hard limit, will warn if exceeded */
	MAX_BYTES: 500 * 1024, // 500 KB
	/** Warning threshold (bytes) - warn when approaching limit */
	WARNING_BYTES: 400 * 1024, // 400 KB
} as const;

/**
 * Data truncation limits for large datasets.
 */
export const TRUNCATION_LIMITS = {
	/** Maximum candles per symbol */
	MAX_CANDLES: 100,
	/** Maximum symbols in universe */
	MAX_SYMBOLS: 50,
	/** Maximum retrieved cases from memory */
	MAX_CASES: 20,
	/** Maximum external events per symbol */
	MAX_EVENTS_PER_SYMBOL: 10,
	/** Maximum lessons learned per case */
	MAX_LESSONS_PER_CASE: 5,
	/** Maximum option contracts in chain */
	MAX_OPTION_CONTRACTS: 50,
} as const;

/**
 * Token estimation constants.
 * Based on empirical analysis of GPT/Claude tokenization of JSON.
 */
export const TOKEN_ESTIMATION = {
	/** Average characters per token in JSON (conservative estimate) */
	CHARS_PER_TOKEN: 3.5,
	/** Target token count for snapshot (reserve headroom for reasoning) */
	TARGET_TOKENS: 10_000,
	/** Maximum token count before warning */
	MAX_TOKENS: 30_000,
	/** Overhead tokens for JSON structure (brackets, commas, quotes) */
	STRUCTURE_OVERHEAD_PERCENT: 0.15,
} as const;

/**
 * Performance targets in milliseconds.
 */
export const PERFORMANCE_LIMITS = {
	/** Target assembly time (ms) */
	TARGET_ASSEMBLY_MS: 200,
	/** Maximum assembly time (ms) */
	MAX_ASSEMBLY_MS: 1000,
	/** Target Zod validation time (ms) */
	TARGET_VALIDATION_MS: 50,
	/** Target serialization time (ms) */
	TARGET_SERIALIZATION_MS: 20,
	/** Target protobuf encoding time (ms) */
	TARGET_PROTOBUF_MS: 10,
} as const;

// ============================================
// Types
// ============================================

/**
 * Result of snapshot size estimation.
 */
export interface SnapshotSizeEstimate {
	/** Estimated size in bytes */
	bytes: number;
	/** Estimated token count */
	tokens: number;
	/** Breakdown by component */
	breakdown: {
		symbols: number;
		bars: number;
		quotes: number;
		metadata: number;
	};
	/** Whether within target limits */
	withinTarget: boolean;
	/** Whether within maximum limits */
	withinMax: boolean;
}

/**
 * Size validation result with warnings.
 */
export interface SnapshotSizeValidation {
	/** Whether validation passed (within max limits) */
	valid: boolean;
	/** Size estimate details */
	estimate: SnapshotSizeEstimate;
	/** Warning messages */
	warnings: string[];
	/** Error messages (if invalid) */
	errors: string[];
	/** Truncation recommendations */
	recommendations: string[];
}

/**
 * Performance metrics for snapshot assembly.
 */
export interface SnapshotPerformanceMetrics {
	/** Total assembly time (ms) */
	totalMs: number;
	/** Data fetch time (ms) */
	fetchMs: number;
	/** Indicator calculation time (ms) */
	indicatorMs: number;
	/** Validation time (ms) */
	validationMs: number;
	/** Serialization time (ms) */
	serializationMs: number;
	/** Whether within performance targets */
	withinTarget: boolean;
	/** Performance warnings */
	warnings: string[];
}

/**
 * Options for array truncation.
 */
export interface TruncationOptions {
	/** Maximum candles to keep */
	maxCandles?: number;
	/** Maximum symbols to keep */
	maxSymbols?: number;
	/** Maximum events per symbol */
	maxEventsPerSymbol?: number;
	/** Whether to keep most recent (true) or most significant (false) */
	keepMostRecent?: boolean;
}

// ============================================
// Size Estimation
// ============================================

/**
 * Estimate the JSON size of a market snapshot.
 *
 * Uses a sampling approach for efficiency - measures actual JSON for
 * representative elements and extrapolates.
 *
 * @param snapshot - Market snapshot to estimate
 * @returns Size estimate with breakdown
 */
export function estimateSnapshotSize(snapshot: MarketSnapshot): SnapshotSizeEstimate {
	const breakdown = {
		symbols: 0,
		bars: 0,
		quotes: 0,
		metadata: 0,
	};

	// Estimate metadata (environment, asOf, marketStatus, regime)
	const metadataSize = JSON.stringify({
		environment: snapshot.environment,
		asOf: snapshot.asOf,
		marketStatus: snapshot.marketStatus,
		regime: snapshot.regime,
	}).length;
	breakdown.metadata = metadataSize;

	// Estimate symbols
	if (snapshot.symbols && snapshot.symbols.length > 0) {
		// Sample first symbol to get average size
		const sampleSymbol = snapshot.symbols[0];
		if (sampleSymbol) {
			const symbolSize = estimateSymbolSnapshotSize(sampleSymbol);
			breakdown.quotes = symbolSize.quotes * snapshot.symbols.length;
			breakdown.bars = symbolSize.bars * snapshot.symbols.length;
			breakdown.symbols = symbolSize.metadata * snapshot.symbols.length;
		}
	}

	// Sum total bytes
	const bytes = Object.values(breakdown).reduce((sum, val) => sum + val, 0);

	// Estimate tokens
	const tokens = estimateTokenCount(bytes);

	return {
		bytes,
		tokens,
		breakdown,
		withinTarget: bytes <= SNAPSHOT_SIZE_LIMITS.TARGET_BYTES,
		withinMax: bytes <= SNAPSHOT_SIZE_LIMITS.MAX_BYTES,
	};
}

/**
 * Estimate size of a single symbol snapshot.
 */
function estimateSymbolSnapshotSize(symbol: SymbolSnapshot): {
	quotes: number;
	bars: number;
	metadata: number;
} {
	let quotes = 0;
	let bars = 0;
	let metadata = 0;

	// Quote size
	if (symbol.quote) {
		quotes = JSON.stringify(symbol.quote).length;
	}

	// Bars size
	if (symbol.bars && symbol.bars.length > 0) {
		// Sample first bar
		const firstBar = symbol.bars[0];
		if (firstBar) {
			const sampleBar = JSON.stringify(firstBar).length;
			bars = sampleBar * symbol.bars.length;
		}
	}

	// Metadata (symbol name, dayHigh, dayLow, etc.)
	metadata = JSON.stringify({
		symbol: symbol.symbol,
		dayHigh: symbol.dayHigh,
		dayLow: symbol.dayLow,
		prevClose: symbol.prevClose,
		open: symbol.open,
		marketStatus: symbol.marketStatus,
		asOf: symbol.asOf,
	}).length;

	return { quotes, bars, metadata };
}

/**
 * Estimate token count from byte size.
 *
 * Uses empirical ratio for JSON content tokenization.
 *
 * @param bytes - Size in bytes
 * @returns Estimated token count
 */
export function estimateTokenCount(bytes: number): number {
	// JSON is UTF-8, so bytes ~ characters for ASCII content
	const chars = bytes;

	// Apply character-to-token ratio
	const rawTokens = Math.ceil(chars / TOKEN_ESTIMATION.CHARS_PER_TOKEN);

	// Add structure overhead (JSON has many single-char tokens like {, }, :, ,)
	const overhead = Math.ceil(rawTokens * TOKEN_ESTIMATION.STRUCTURE_OVERHEAD_PERCENT);

	return rawTokens + overhead;
}

/**
 * Estimate token count directly from a snapshot object.
 *
 * @param snapshot - Market snapshot to estimate
 * @returns Estimated token count
 */
export function estimateSnapshotTokens(snapshot: MarketSnapshot): number {
	const estimate = estimateSnapshotSize(snapshot);
	return estimate.tokens;
}

// ============================================
// Size Validation
// ============================================

/**
 * Validate snapshot size against limits.
 *
 * Returns validation result with warnings and recommendations.
 *
 * @param snapshot - Market snapshot to validate
 * @returns Validation result
 */
export function validateSnapshotSize(snapshot: MarketSnapshot): SnapshotSizeValidation {
	const estimate = estimateSnapshotSize(snapshot);
	const warnings: string[] = [];
	const errors: string[] = [];
	const recommendations: string[] = [];

	// Check against limits
	if (estimate.bytes > SNAPSHOT_SIZE_LIMITS.MAX_BYTES) {
		errors.push(
			`Snapshot size (${formatBytes(estimate.bytes)}) exceeds maximum limit (${formatBytes(SNAPSHOT_SIZE_LIMITS.MAX_BYTES)})`,
		);
	}

	if (estimate.bytes > SNAPSHOT_SIZE_LIMITS.WARNING_BYTES) {
		warnings.push(
			`Snapshot size (${formatBytes(estimate.bytes)}) approaching maximum limit (${formatBytes(SNAPSHOT_SIZE_LIMITS.MAX_BYTES)})`,
		);
	}

	if (!estimate.withinTarget) {
		warnings.push(
			`Snapshot size (${formatBytes(estimate.bytes)}) exceeds target (${formatBytes(SNAPSHOT_SIZE_LIMITS.TARGET_BYTES)})`,
		);
	}

	// Check token count
	if (estimate.tokens > TOKEN_ESTIMATION.MAX_TOKENS) {
		warnings.push(
			`Token count (~${estimate.tokens}) exceeds maximum (${TOKEN_ESTIMATION.MAX_TOKENS})`,
		);
	} else if (estimate.tokens > TOKEN_ESTIMATION.TARGET_TOKENS) {
		warnings.push(
			`Token count (~${estimate.tokens}) exceeds target (${TOKEN_ESTIMATION.TARGET_TOKENS})`,
		);
	}

	// Generate recommendations based on breakdown
	if (estimate.breakdown.bars > estimate.bytes * 0.5) {
		recommendations.push(
			`Consider reducing candle history - bars use ${formatPercent(estimate.breakdown.bars / estimate.bytes)} of snapshot`,
		);
	}

	if (snapshot.symbols && snapshot.symbols.length > TRUNCATION_LIMITS.MAX_SYMBOLS) {
		recommendations.push(
			`Consider limiting universe to ${TRUNCATION_LIMITS.MAX_SYMBOLS} symbols (current: ${snapshot.symbols.length})`,
		);
	}

	return {
		valid: errors.length === 0,
		estimate,
		warnings,
		errors,
		recommendations,
	};
}

// ============================================
// Array Truncation
// ============================================

/**
 * Truncate arrays in a snapshot to stay within size limits.
 *
 * Creates a new snapshot with truncated arrays - does not mutate input.
 *
 * @param snapshot - Market snapshot to truncate
 * @param options - Truncation options
 * @returns Truncated snapshot copy
 */
export function truncateSnapshot(
	snapshot: MarketSnapshot,
	options: TruncationOptions = {},
): MarketSnapshot {
	const maxCandles = options.maxCandles ?? TRUNCATION_LIMITS.MAX_CANDLES;
	const maxSymbols = options.maxSymbols ?? TRUNCATION_LIMITS.MAX_SYMBOLS;
	const keepMostRecent = options.keepMostRecent ?? true;

	// Truncate symbols array
	let truncatedSymbols = snapshot.symbols ? [...snapshot.symbols] : [];

	if (truncatedSymbols.length > maxSymbols) {
		truncatedSymbols = truncatedSymbols.slice(0, maxSymbols);
	}

	// Truncate bars in each symbol
	truncatedSymbols = truncatedSymbols.map((symbol) => {
		const truncatedSymbol = { ...symbol };

		// Truncate bars
		if (truncatedSymbol.bars && truncatedSymbol.bars.length > maxCandles) {
			if (keepMostRecent) {
				// Keep most recent candles
				truncatedSymbol.bars = truncatedSymbol.bars.slice(-maxCandles);
			} else {
				// Keep first N candles
				truncatedSymbol.bars = truncatedSymbol.bars.slice(0, maxCandles);
			}
		}

		return truncatedSymbol;
	});

	return {
		...snapshot,
		symbols: truncatedSymbols,
	};
}

/**
 * Truncate an array while tracking what was removed.
 *
 * @param array - Array to truncate
 * @param maxLength - Maximum length
 * @param keepMostRecent - Whether to keep most recent elements
 * @returns Truncated array and removal count
 */
export function truncateArray<T>(
	array: T[],
	maxLength: number,
	keepMostRecent = true,
): { result: T[]; removed: number } {
	if (array.length <= maxLength) {
		return { result: array, removed: 0 };
	}

	const removed = array.length - maxLength;

	if (keepMostRecent) {
		return { result: array.slice(-maxLength), removed };
	}

	return { result: array.slice(0, maxLength), removed };
}

// ============================================
// Performance Monitoring
// ============================================

/**
 * Create a performance timer for snapshot assembly.
 *
 * @returns Performance tracker
 */
export function createPerformanceTracker(): PerformanceTracker {
	return new PerformanceTracker();
}

/**
 * Performance tracker for measuring snapshot assembly phases.
 */
export class PerformanceTracker {
	private startTime: number;
	private phases: Map<string, { start: number; end?: number }> = new Map();

	constructor() {
		this.startTime = performance.now();
	}

	/**
	 * Start timing a phase.
	 */
	startPhase(name: string): void {
		this.phases.set(name, { start: performance.now() });
	}

	/**
	 * End timing a phase.
	 */
	endPhase(name: string): number {
		const phase = this.phases.get(name);
		if (!phase) {
			return 0;
		}
		phase.end = performance.now();
		return phase.end - phase.start;
	}

	/**
	 * Get duration of a completed phase.
	 */
	getPhaseDuration(name: string): number {
		const phase = this.phases.get(name);
		if (!phase || !phase.end) {
			return 0;
		}
		return phase.end - phase.start;
	}

	/**
	 * Get total elapsed time.
	 */
	getTotalTime(): number {
		return performance.now() - this.startTime;
	}

	/**
	 * Generate performance metrics.
	 */
	getMetrics(): SnapshotPerformanceMetrics {
		const totalMs = this.getTotalTime();
		const fetchMs = this.getPhaseDuration("fetch");
		const indicatorMs = this.getPhaseDuration("indicators");
		const validationMs = this.getPhaseDuration("validation");
		const serializationMs = this.getPhaseDuration("serialization");

		const warnings: string[] = [];

		if (totalMs > PERFORMANCE_LIMITS.MAX_ASSEMBLY_MS) {
			warnings.push(
				`Total assembly time (${totalMs.toFixed(0)}ms) exceeds maximum (${PERFORMANCE_LIMITS.MAX_ASSEMBLY_MS}ms)`,
			);
		} else if (totalMs > PERFORMANCE_LIMITS.TARGET_ASSEMBLY_MS) {
			warnings.push(
				`Total assembly time (${totalMs.toFixed(0)}ms) exceeds target (${PERFORMANCE_LIMITS.TARGET_ASSEMBLY_MS}ms)`,
			);
		}

		if (validationMs > PERFORMANCE_LIMITS.TARGET_VALIDATION_MS) {
			warnings.push(
				`Validation time (${validationMs.toFixed(0)}ms) exceeds target (${PERFORMANCE_LIMITS.TARGET_VALIDATION_MS}ms)`,
			);
		}

		if (serializationMs > PERFORMANCE_LIMITS.TARGET_SERIALIZATION_MS) {
			warnings.push(
				`Serialization time (${serializationMs.toFixed(0)}ms) exceeds target (${PERFORMANCE_LIMITS.TARGET_SERIALIZATION_MS}ms)`,
			);
		}

		return {
			totalMs,
			fetchMs,
			indicatorMs,
			validationMs,
			serializationMs,
			withinTarget: totalMs <= PERFORMANCE_LIMITS.TARGET_ASSEMBLY_MS,
			warnings,
		};
	}
}

// ============================================
// Formatting Utilities
// ============================================

/**
 * Format bytes to human-readable string.
 */
export function formatBytes(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes} B`;
	}
	if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(1)} KB`;
	}
	return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Format number as percentage.
 */
function formatPercent(ratio: number): string {
	return `${(ratio * 100).toFixed(1)}%`;
}

/**
 * Format performance metrics as summary string.
 */
export function formatPerformanceMetrics(metrics: SnapshotPerformanceMetrics): string {
	const parts = [
		`Total: ${metrics.totalMs.toFixed(0)}ms`,
		`Fetch: ${metrics.fetchMs.toFixed(0)}ms`,
		`Indicators: ${metrics.indicatorMs.toFixed(0)}ms`,
		`Validation: ${metrics.validationMs.toFixed(0)}ms`,
		`Serialization: ${metrics.serializationMs.toFixed(0)}ms`,
	];

	if (!metrics.withinTarget) {
		parts.push(`[SLOW]`);
	}

	return parts.join(" | ");
}

/**
 * Format size validation result as summary string.
 */
export function formatSizeValidation(validation: SnapshotSizeValidation): string {
	const parts = [
		`Size: ${formatBytes(validation.estimate.bytes)}`,
		`Tokens: ~${validation.estimate.tokens}`,
	];

	if (!validation.valid) {
		parts.push(`[OVERSIZED]`);
	} else if (!validation.estimate.withinTarget) {
		parts.push(`[ABOVE TARGET]`);
	}

	return parts.join(" | ");
}
