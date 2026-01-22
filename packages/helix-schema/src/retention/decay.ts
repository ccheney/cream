/**
 * Decay Calculations for Active Forgetting Policy
 *
 * Implements the core Ebbinghaus forgetting curve calculations:
 * - Recency: exponential decay with configurable half-life
 * - Frequency: log-scaled access count (spaced repetition effect)
 * - Importance: domain-specific significance weighting
 * - Compliance: SEC Rule 17a-4 override for LIVE trades
 */

import {
	COMPLIANCE_PERIOD_DAYS,
	DECAY_CONSTANT_DAYS,
	EDGE_COUNT_NORMALIZATION_FACTOR,
	FREQUENCY_SCALE_FACTOR,
	INFINITE_RETENTION,
	PNL_NORMALIZATION_FACTOR,
} from "./constants.js";
import type { ForgettingEnvironment, NodeInfo, RetentionScoreBreakdown } from "./types.js";

/**
 * Calculate the recency factor using exponential decay (Ebbinghaus curve).
 *
 * The recency factor decreases exponentially with age:
 *   recency = e^(-age_days / decay_constant)
 *
 * With decay_constant = 365 days:
 *   - Day 0: recency = 1.0
 *   - Day 30: recency = 0.92
 *   - Day 90: recency = 0.78
 *   - Day 365: recency = 0.37 (1/e)
 *   - Day 730: recency = 0.14
 *
 * @param ageDays - Age of the node in days
 * @param decayConstant - Decay constant in days (default: 365)
 * @returns Recency factor between 0 and 1
 */
export function calculateRecency(
	ageDays: number,
	decayConstant: number = DECAY_CONSTANT_DAYS,
): number {
	if (ageDays < 0) {
		throw new Error("Age cannot be negative");
	}
	return Math.exp(-ageDays / decayConstant);
}

/**
 * Calculate the frequency factor based on access count.
 *
 * Uses log scaling to prevent over-weighting highly accessed nodes
 * (spaced repetition effect).
 *
 *   frequency = log(1 + access_count) / scale_factor
 *
 * The +1 prevents log(0) and ensures frequency is always >= 0.
 *
 * @param accessCount - Number of times the node has been accessed
 * @param scaleFactor - Scaling factor (default: 10)
 * @returns Frequency factor (0 for never accessed, increases logarithmically)
 */
export function calculateFrequency(
	accessCount: number,
	scaleFactor: number = FREQUENCY_SCALE_FACTOR,
): number {
	if (accessCount < 0) {
		throw new Error("Access count cannot be negative");
	}
	return Math.log(1 + accessCount) / scaleFactor;
}

/**
 * Calculate the importance factor based on node type and properties.
 *
 * For TradeDecision nodes:
 *   importance = |realized_pnl| / normalization_factor
 *
 * For other nodes:
 *   importance = edge_count / normalization_factor
 *
 * This mimics emotional salience in memory - significant events
 * (large gains/losses) are remembered longer.
 *
 * @param nodeInfo - Node information
 * @returns Importance factor (higher = more important)
 */
export function calculateImportance(nodeInfo: NodeInfo): number {
	if (nodeInfo.nodeType === "TradeDecision" && nodeInfo.realizedPnl !== undefined) {
		return Math.abs(nodeInfo.realizedPnl) / PNL_NORMALIZATION_FACTOR;
	}

	return nodeInfo.edgeCount / EDGE_COUNT_NORMALIZATION_FACTOR;
}

/**
 * Check if compliance override applies (LIVE trades < 6 years).
 *
 * SEC Rule 17a-4 requires:
 * - Records preserved for 6 years
 * - First 2 years must be easily accessible
 *
 * @param nodeInfo - Node information
 * @param ageDays - Age of node in days
 * @returns True if compliance override applies (infinite retention)
 */
export function hasComplianceOverride(nodeInfo: NodeInfo, ageDays: number): boolean {
	if (nodeInfo.environment !== "LIVE") {
		return false;
	}

	if (nodeInfo.nodeType !== "TradeDecision" && nodeInfo.nodeType !== "TradeLifecycleEvent") {
		return false;
	}

	return ageDays < COMPLIANCE_PERIOD_DAYS;
}

/**
 * Calculate the complete retention score for a node.
 *
 * Formula:
 *   score = base_score * recency * (1 + frequency) * (1 + importance)
 *
 * If compliance override applies, returns INFINITE_RETENTION.
 *
 * @param nodeInfo - Node information
 * @param referenceDate - Reference date for age calculation (default: now)
 * @returns Complete retention score breakdown
 */
export function calculateRetentionScore(
	nodeInfo: NodeInfo,
	referenceDate: Date = new Date(),
): RetentionScoreBreakdown {
	const ageDays = Math.floor(
		(referenceDate.getTime() - nodeInfo.createdAt.getTime()) / (1000 * 60 * 60 * 24),
	);

	const baseScore = 1.0;
	const recencyFactor = calculateRecency(ageDays);
	const frequencyFactor = 1 + calculateFrequency(nodeInfo.accessCount);
	const importanceFactor = 1 + calculateImportance(nodeInfo);
	const complianceOverride = hasComplianceOverride(nodeInfo, ageDays);

	let finalScore: number;
	if (complianceOverride) {
		finalScore = INFINITE_RETENTION;
	} else {
		finalScore = baseScore * recencyFactor * frequencyFactor * importanceFactor;
	}

	return {
		baseScore,
		recencyFactor,
		frequencyFactor,
		importanceFactor,
		complianceOverride,
		finalScore,
		ageDays,
	};
}

/**
 * Determine if a node should be summarized based on retention score.
 *
 * @param score - Retention score
 * @param threshold - Summarization threshold (default: 0.1)
 * @returns True if node should be summarized
 */
export function shouldSummarize(score: number, threshold = 0.1): boolean {
	if (!Number.isFinite(score)) {
		return false;
	}
	return score < threshold;
}

/**
 * Determine if a node should be deleted based on retention score.
 *
 * Only non-LIVE nodes can be deleted. LIVE nodes must be retained
 * for compliance.
 *
 * @param score - Retention score
 * @param environment - Trading environment
 * @param threshold - Deletion threshold (default: 0.05)
 * @returns True if node should be deleted
 */
export function shouldDelete(
	score: number,
	environment: ForgettingEnvironment,
	threshold = 0.05,
): boolean {
	if (!Number.isFinite(score)) {
		return false;
	}
	if (environment === "LIVE") {
		return false;
	}
	return score < threshold;
}
