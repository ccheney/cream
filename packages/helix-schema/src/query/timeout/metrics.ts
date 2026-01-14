/**
 * Metrics collection for HelixDB queries.
 * @module
 */

import { TIMEOUT_RATE_ALERT_THRESHOLD } from "./constants.js";
import type { QueryMetrics } from "./types.js";

/**
 * Query metrics collector.
 */
export class MetricsCollector {
	private latencies: number[] = [];
	private timeouts = 0;
	private cacheHits = 0;
	private totalQueries = 0;

	/**
	 * Record a query execution.
	 *
	 * @param latencyMs - Query latency in ms
	 * @param timedOut - Whether query timed out
	 * @param fromCache - Whether result was from cache
	 */
	record(latencyMs: number, timedOut: boolean, fromCache: boolean): void {
		this.totalQueries++;
		this.latencies.push(latencyMs);

		if (timedOut) {
			this.timeouts++;
		}
		if (fromCache) {
			this.cacheHits++;
		}

		if (this.latencies.length > 1000) {
			this.latencies.shift();
		}
	}

	/**
	 * Calculate percentile from sorted array.
	 */
	private percentile(sorted: number[], p: number): number {
		if (sorted.length === 0) {
			return 0;
		}
		const index = Math.ceil((p / 100) * sorted.length) - 1;
		return sorted[Math.max(0, Math.min(index, sorted.length - 1))] ?? 0;
	}

	/**
	 * Get current metrics.
	 */
	getMetrics(): QueryMetrics {
		const sorted = this.latencies.toSorted((a, b) => a - b);
		const timeoutRate = this.totalQueries > 0 ? this.timeouts / this.totalQueries : 0;
		const cacheHitRate = this.totalQueries > 0 ? this.cacheHits / this.totalQueries : 0;

		return {
			totalQueries: this.totalQueries,
			timeoutCount: this.timeouts,
			timeoutRate,
			cacheHits: this.cacheHits,
			cacheHitRate,
			latencyP50: this.percentile(sorted, 50),
			latencyP95: this.percentile(sorted, 95),
			latencyP99: this.percentile(sorted, 99),
			alertRequired: timeoutRate > TIMEOUT_RATE_ALERT_THRESHOLD,
		};
	}

	/**
	 * Reset metrics.
	 */
	reset(): void {
		this.latencies = [];
		this.timeouts = 0;
		this.cacheHits = 0;
		this.totalQueries = 0;
	}
}
