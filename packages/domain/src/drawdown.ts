/**
 * Drawdown Metrics Calculation
 *
 * Implements drawdown calculation for portfolio risk management:
 * - Current drawdown: (current_equity - peak_equity) / peak_equity
 * - Maximum drawdown: Largest peak-to-trough decline
 * - Drawdown duration: Number of periods in current drawdown
 *
 * Risk thresholds from spec:
 * - < 5% drawdown: optimal
 * - > 25% drawdown: high risk
 * - 50% drawdown requires 100% gain to recover
 *
 * @see docs/plans/03-market-snapshot.md lines 501-507
 */

import { z } from "zod";

// ============================================
// Types
// ============================================

/**
 * Single point in equity curve
 */
export interface EquityPoint {
	/** ISO8601 timestamp */
	timestamp: string;
	/** Portfolio equity value */
	equity: number;
}

/**
 * Drawdown statistics
 */
export const DrawdownStatsSchema = z.object({
	/** Current drawdown as percentage (e.g., 0.05 = 5%) */
	currentDrawdown: z.number().min(0).max(1),
	/** Current drawdown in absolute dollars */
	currentDrawdownAbsolute: z.number().min(0),
	/** Maximum drawdown as percentage */
	maxDrawdown: z.number().min(0).max(1),
	/** Maximum drawdown in absolute dollars */
	maxDrawdownAbsolute: z.number().min(0),
	/** Number of periods in current drawdown */
	drawdownDuration: z.number().int().nonnegative(),
	/** Timestamp when current drawdown started */
	drawdownStartTime: z.string().nullable(),
	/** Peak equity value */
	peakEquity: z.number().positive(),
	/** Timestamp of peak equity */
	peakTimestamp: z.string(),
	/** Trough equity during max drawdown */
	troughEquity: z.number().positive(),
	/** Timestamp of trough equity */
	troughTimestamp: z.string(),
	/** Recovery percentage needed (e.g., 0.5 = 50% gain needed) */
	recoveryNeeded: z.number().min(0),
	/** Risk level based on drawdown */
	riskLevel: z.enum(["optimal", "normal", "elevated", "high", "critical"]),
});
export type DrawdownStats = z.infer<typeof DrawdownStatsSchema>;

/**
 * Drawdown event for history tracking
 */
export interface DrawdownEvent {
	/** Start timestamp of drawdown */
	startTimestamp: string;
	/** End timestamp (null if ongoing) */
	endTimestamp: string | null;
	/** Peak equity before drawdown */
	peakEquity: number;
	/** Trough equity during drawdown */
	troughEquity: number;
	/** Maximum drawdown percentage reached */
	maxDrawdownPct: number;
	/** Duration in periods (hours for hourly cycles) */
	duration: number;
	/** Whether drawdown has recovered */
	recovered: boolean;
}

// ============================================
// Constants
// ============================================

/** Drawdown risk thresholds */
export const DRAWDOWN_THRESHOLDS = {
	/** Optimal threshold (< 5%) */
	optimal: 0.05,
	/** Normal threshold (< 10%) */
	normal: 0.1,
	/** Elevated threshold (< 15%) */
	elevated: 0.15,
	/** High risk threshold (< 25%) */
	high: 0.25,
	/** Critical threshold (>= 25%) */
	critical: 0.25,
} as const;

// ============================================
// Calculation Functions
// ============================================

/**
 * Calculate drawdown from a single equity value against peak
 */
export function calculateDrawdown(currentEquity: number, peakEquity: number): number {
	if (peakEquity <= 0) {
		return 0;
	}
	if (currentEquity >= peakEquity) {
		return 0;
	}
	return (peakEquity - currentEquity) / peakEquity;
}

/**
 * Calculate recovery percentage needed from current drawdown
 * A 50% drawdown requires 100% gain to recover
 */
export function calculateRecoveryNeeded(drawdownPct: number): number {
	if (drawdownPct <= 0 || drawdownPct >= 1) {
		return drawdownPct <= 0 ? 0 : Number.POSITIVE_INFINITY;
	}
	// Recovery needed = drawdown / (1 - drawdown)
	// E.g., 50% drawdown: 0.5 / 0.5 = 100% gain needed
	return drawdownPct / (1 - drawdownPct);
}

/**
 * Get risk level from drawdown percentage
 */
export function getRiskLevel(
	drawdownPct: number,
): "optimal" | "normal" | "elevated" | "high" | "critical" {
	if (drawdownPct < DRAWDOWN_THRESHOLDS.optimal) {
		return "optimal";
	}
	if (drawdownPct < DRAWDOWN_THRESHOLDS.normal) {
		return "normal";
	}
	if (drawdownPct < DRAWDOWN_THRESHOLDS.elevated) {
		return "elevated";
	}
	if (drawdownPct < DRAWDOWN_THRESHOLDS.high) {
		return "high";
	}
	return "critical";
}

/**
 * Calculate full drawdown statistics from an equity curve
 */
export function calculateDrawdownStats(equityCurve: EquityPoint[]): DrawdownStats {
	if (equityCurve.length === 0) {
		return createEmptyDrawdownStats();
	}

	// Initialize with first point (safe after length check)
	const firstPoint = equityCurve[0];
	if (!firstPoint) {
		return createEmptyDrawdownStats();
	}
	let peakEquity = firstPoint.equity;
	let peakTimestamp = firstPoint.timestamp;
	let troughEquity = firstPoint.equity;
	let troughTimestamp = firstPoint.timestamp;
	let maxDrawdownPct = 0;
	let maxDrawdownAbsolute = 0;

	// Track current drawdown
	let currentDrawdownStart: string | null = null;
	let currentDrawdownDuration = 0;
	let inDrawdown = false;

	// Iterate through equity curve
	for (const point of equityCurve) {
		if (point.equity >= peakEquity) {
			// New high - reset peak and exit drawdown
			peakEquity = point.equity;
			peakTimestamp = point.timestamp;
			inDrawdown = false;
			currentDrawdownStart = null;
			currentDrawdownDuration = 0;
		} else {
			// In drawdown
			if (!inDrawdown) {
				// Starting new drawdown
				inDrawdown = true;
				currentDrawdownStart = point.timestamp;
				currentDrawdownDuration = 1;
			} else {
				currentDrawdownDuration++;
			}

			const drawdown = calculateDrawdown(point.equity, peakEquity);
			const drawdownAbsolute = peakEquity - point.equity;

			if (drawdown > maxDrawdownPct) {
				maxDrawdownPct = drawdown;
				maxDrawdownAbsolute = drawdownAbsolute;
				troughEquity = point.equity;
				troughTimestamp = point.timestamp;
			}
		}
	}

	// Get current (last) values (safe - we checked length > 0 at start)
	const lastPoint = equityCurve.at(-1);
	if (!lastPoint) {
		return createEmptyDrawdownStats();
	}
	const currentDrawdownPct = calculateDrawdown(lastPoint.equity, peakEquity);
	const currentDrawdownAbsolute = Math.max(0, peakEquity - lastPoint.equity);

	return {
		currentDrawdown: currentDrawdownPct,
		currentDrawdownAbsolute,
		maxDrawdown: maxDrawdownPct,
		maxDrawdownAbsolute,
		drawdownDuration: currentDrawdownDuration,
		drawdownStartTime: currentDrawdownStart,
		peakEquity,
		peakTimestamp,
		troughEquity: maxDrawdownPct > 0 ? troughEquity : peakEquity,
		troughTimestamp: maxDrawdownPct > 0 ? troughTimestamp : peakTimestamp,
		recoveryNeeded: calculateRecoveryNeeded(currentDrawdownPct),
		riskLevel: getRiskLevel(currentDrawdownPct),
	};
}

/**
 * Create empty drawdown stats (for new portfolios)
 */
export function createEmptyDrawdownStats(initialEquity = 100000): DrawdownStats {
	const now = new Date().toISOString();
	return {
		currentDrawdown: 0,
		currentDrawdownAbsolute: 0,
		maxDrawdown: 0,
		maxDrawdownAbsolute: 0,
		drawdownDuration: 0,
		drawdownStartTime: null,
		peakEquity: initialEquity,
		peakTimestamp: now,
		troughEquity: initialEquity,
		troughTimestamp: now,
		recoveryNeeded: 0,
		riskLevel: "optimal",
	};
}

// ============================================
// DrawdownTracker Class
// ============================================

/**
 * Streaming drawdown tracker for online updates
 *
 * @example
 * ```typescript
 * const tracker = new DrawdownTracker(100000);
 * tracker.update(98000, "2024-01-02T10:00:00Z"); // 2% drawdown
 * tracker.update(95000, "2024-01-03T10:00:00Z"); // 5% drawdown
 * tracker.update(102000, "2024-01-04T10:00:00Z"); // New high, recovered
 * const stats = tracker.getStats();
 * ```
 */
export class DrawdownTracker {
	private peakEquity: number;
	private peakTimestamp: string;
	private troughEquity: number;
	private troughTimestamp: string;
	private maxDrawdownPct: number;
	private maxDrawdownAbsolute: number;
	private currentDrawdownStart: string | null;
	private currentDrawdownDuration: number;
	private lastEquity: number;
	private lastTimestamp: string;
	private history: DrawdownEvent[];

	constructor(initialEquity: number, timestamp?: string) {
		const now = timestamp ?? new Date().toISOString();
		this.peakEquity = initialEquity;
		this.peakTimestamp = now;
		this.troughEquity = initialEquity;
		this.troughTimestamp = now;
		this.maxDrawdownPct = 0;
		this.maxDrawdownAbsolute = 0;
		this.currentDrawdownStart = null;
		this.currentDrawdownDuration = 0;
		this.lastEquity = initialEquity;
		this.lastTimestamp = now;
		this.history = [];
	}

	/**
	 * Update with new equity value
	 */
	update(equity: number, timestamp: string): DrawdownStats {
		const previousInDrawdown = this.currentDrawdownStart !== null;

		if (equity >= this.peakEquity) {
			// New high - check if recovering from drawdown
			if (previousInDrawdown && this.currentDrawdownStart !== null) {
				// Record completed drawdown event
				this.history.push({
					startTimestamp: this.currentDrawdownStart,
					endTimestamp: timestamp,
					peakEquity: this.peakEquity,
					troughEquity: this.troughEquity,
					maxDrawdownPct: calculateDrawdown(this.troughEquity, this.peakEquity),
					duration: this.currentDrawdownDuration,
					recovered: true,
				});
			}

			// Reset to new peak
			this.peakEquity = equity;
			this.peakTimestamp = timestamp;
			this.currentDrawdownStart = null;
			this.currentDrawdownDuration = 0;
		} else {
			// In drawdown
			if (!previousInDrawdown) {
				// Starting new drawdown
				this.currentDrawdownStart = timestamp;
				this.currentDrawdownDuration = 1;
				this.troughEquity = equity;
				this.troughTimestamp = timestamp;
			} else {
				this.currentDrawdownDuration++;

				// Check for new trough
				if (equity < this.troughEquity) {
					this.troughEquity = equity;
					this.troughTimestamp = timestamp;
				}
			}

			// Update max drawdown if current is larger
			const currentDrawdown = calculateDrawdown(equity, this.peakEquity);
			if (currentDrawdown > this.maxDrawdownPct) {
				this.maxDrawdownPct = currentDrawdown;
				this.maxDrawdownAbsolute = this.peakEquity - equity;
			}
		}

		this.lastEquity = equity;
		this.lastTimestamp = timestamp;

		return this.getStats();
	}

	/**
	 * Get current drawdown statistics
	 */
	getStats(): DrawdownStats {
		const currentDrawdownPct = calculateDrawdown(this.lastEquity, this.peakEquity);
		const currentDrawdownAbsolute = Math.max(0, this.peakEquity - this.lastEquity);

		return {
			currentDrawdown: currentDrawdownPct,
			currentDrawdownAbsolute,
			maxDrawdown: this.maxDrawdownPct,
			maxDrawdownAbsolute: this.maxDrawdownAbsolute,
			drawdownDuration: this.currentDrawdownDuration,
			drawdownStartTime: this.currentDrawdownStart,
			peakEquity: this.peakEquity,
			peakTimestamp: this.peakTimestamp,
			troughEquity: this.maxDrawdownPct > 0 ? this.troughEquity : this.peakEquity,
			troughTimestamp: this.maxDrawdownPct > 0 ? this.troughTimestamp : this.peakTimestamp,
			recoveryNeeded: calculateRecoveryNeeded(currentDrawdownPct),
			riskLevel: getRiskLevel(currentDrawdownPct),
		};
	}

	/**
	 * Get drawdown history (completed drawdown events)
	 */
	getHistory(): DrawdownEvent[] {
		return [...this.history];
	}

	/**
	 * Get current peak equity
	 */
	getPeakEquity(): number {
		return this.peakEquity;
	}

	/**
	 * Check if currently in drawdown
	 */
	isInDrawdown(): boolean {
		return this.currentDrawdownStart !== null;
	}

	/**
	 * Reset tracker to new initial state
	 */
	reset(initialEquity: number, timestamp?: string): void {
		const now = timestamp ?? new Date().toISOString();
		this.peakEquity = initialEquity;
		this.peakTimestamp = now;
		this.troughEquity = initialEquity;
		this.troughTimestamp = now;
		this.maxDrawdownPct = 0;
		this.maxDrawdownAbsolute = 0;
		this.currentDrawdownStart = null;
		this.currentDrawdownDuration = 0;
		this.lastEquity = initialEquity;
		this.lastTimestamp = now;
		this.history = [];
	}

	/**
	 * Serialize tracker state for persistence
	 */
	serialize(): string {
		return JSON.stringify({
			peakEquity: this.peakEquity,
			peakTimestamp: this.peakTimestamp,
			troughEquity: this.troughEquity,
			troughTimestamp: this.troughTimestamp,
			maxDrawdownPct: this.maxDrawdownPct,
			maxDrawdownAbsolute: this.maxDrawdownAbsolute,
			currentDrawdownStart: this.currentDrawdownStart,
			currentDrawdownDuration: this.currentDrawdownDuration,
			lastEquity: this.lastEquity,
			lastTimestamp: this.lastTimestamp,
			history: this.history,
		});
	}

	/**
	 * Deserialize tracker state from persistence
	 */
	static deserialize(json: string): DrawdownTracker {
		const data = JSON.parse(json);
		const tracker = new DrawdownTracker(data.peakEquity, data.peakTimestamp);
		tracker.troughEquity = data.troughEquity;
		tracker.troughTimestamp = data.troughTimestamp;
		tracker.maxDrawdownPct = data.maxDrawdownPct;
		tracker.maxDrawdownAbsolute = data.maxDrawdownAbsolute;
		tracker.currentDrawdownStart = data.currentDrawdownStart;
		tracker.currentDrawdownDuration = data.currentDrawdownDuration;
		tracker.lastEquity = data.lastEquity;
		tracker.lastTimestamp = data.lastTimestamp;
		tracker.history = data.history ?? [];
		return tracker;
	}
}

// ============================================
// Alerting
// ============================================

/**
 * Drawdown alert configuration
 */
export interface DrawdownAlertConfig {
	/** Alert when current drawdown exceeds this percentage */
	currentDrawdownThreshold: number;
	/** Alert when max drawdown exceeds this percentage */
	maxDrawdownThreshold: number;
	/** Alert when drawdown duration exceeds this many periods */
	durationThreshold: number;
}

/**
 * Default alert configuration
 */
export const DEFAULT_DRAWDOWN_ALERT_CONFIG: DrawdownAlertConfig = {
	currentDrawdownThreshold: 0.15, // 15%
	maxDrawdownThreshold: 0.25, // 25%
	durationThreshold: 24, // 24 hours (for hourly cycles)
};

/**
 * Check if drawdown stats trigger an alert
 */
export function checkDrawdownAlert(
	stats: DrawdownStats,
	config: DrawdownAlertConfig = DEFAULT_DRAWDOWN_ALERT_CONFIG,
): {
	shouldAlert: boolean;
	reasons: string[];
} {
	const reasons: string[] = [];

	if (stats.currentDrawdown >= config.currentDrawdownThreshold) {
		reasons.push(
			`Current drawdown (${(stats.currentDrawdown * 100).toFixed(2)}%) exceeds threshold (${(config.currentDrawdownThreshold * 100).toFixed(0)}%)`,
		);
	}

	if (stats.maxDrawdown >= config.maxDrawdownThreshold) {
		reasons.push(
			`Max drawdown (${(stats.maxDrawdown * 100).toFixed(2)}%) exceeds threshold (${(config.maxDrawdownThreshold * 100).toFixed(0)}%)`,
		);
	}

	if (stats.drawdownDuration >= config.durationThreshold) {
		reasons.push(
			`Drawdown duration (${stats.drawdownDuration} periods) exceeds threshold (${config.durationThreshold})`,
		);
	}

	return {
		shouldAlert: reasons.length > 0,
		reasons,
	};
}

/**
 * Format drawdown stats for display
 */
export function formatDrawdownStats(stats: DrawdownStats): string {
	return [
		`Current Drawdown: ${(stats.currentDrawdown * 100).toFixed(2)}% ($${stats.currentDrawdownAbsolute.toLocaleString()})`,
		`Max Drawdown: ${(stats.maxDrawdown * 100).toFixed(2)}% ($${stats.maxDrawdownAbsolute.toLocaleString()})`,
		`Duration: ${stats.drawdownDuration} periods`,
		`Peak: $${stats.peakEquity.toLocaleString()} (${stats.peakTimestamp})`,
		`Risk Level: ${stats.riskLevel.toUpperCase()}`,
		stats.recoveryNeeded > 0
			? `Recovery Needed: ${(stats.recoveryNeeded * 100).toFixed(2)}%`
			: "No recovery needed",
	].join("\n");
}
