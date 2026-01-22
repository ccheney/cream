/**
 * Forgetting Decisions Module
 *
 * Provides the decision-making logic for determining what actions
 * to take on nodes based on their retention scores.
 */

import {
	COMPLIANCE_PERIOD_DAYS,
	DELETION_THRESHOLD,
	SUMMARIZATION_THRESHOLD,
} from "./constants.js";
import { calculateRetentionScore, shouldDelete, shouldSummarize } from "./decay.js";
import type { ForgettingDecision, NodeInfo } from "./types.js";

/**
 * Get forgetting decision for a node.
 *
 * @param nodeInfo - Node information
 * @param referenceDate - Reference date for age calculation
 * @returns Forgetting decision with score and recommended actions
 */
export function getForgettingDecision(
	nodeInfo: NodeInfo,
	referenceDate: Date = new Date(),
): ForgettingDecision {
	const breakdown = calculateRetentionScore(nodeInfo, referenceDate);
	const { finalScore } = breakdown;

	const summarize = shouldSummarize(finalScore, SUMMARIZATION_THRESHOLD);
	const deleteNode = shouldDelete(finalScore, nodeInfo.environment, DELETION_THRESHOLD);

	let reason: string;
	if (breakdown.complianceOverride) {
		reason = `Compliance override: LIVE ${nodeInfo.nodeType} must be retained for ${COMPLIANCE_PERIOD_DAYS} days`;
	} else if (deleteNode) {
		reason = `Score ${finalScore.toFixed(4)} below deletion threshold ${DELETION_THRESHOLD}`;
	} else if (summarize) {
		reason = `Score ${finalScore.toFixed(4)} below summarization threshold ${SUMMARIZATION_THRESHOLD}`;
	} else {
		reason = `Retention score ${finalScore.toFixed(4)} above thresholds`;
	}

	return {
		nodeId: nodeInfo.id,
		score: finalScore,
		breakdown,
		shouldSummarize: summarize,
		shouldDelete: deleteNode,
		reason,
	};
}

/**
 * Get forgetting decisions for multiple nodes.
 *
 * @param nodes - Array of node information
 * @param referenceDate - Reference date for age calculation
 * @returns Array of forgetting decisions
 */
export function batchGetForgettingDecisions(
	nodes: NodeInfo[],
	referenceDate: Date = new Date(),
): ForgettingDecision[] {
	return nodes.map((node) => getForgettingDecision(node, referenceDate));
}

/**
 * Filter nodes that need summarization.
 *
 * @param decisions - Array of forgetting decisions
 * @returns Decisions for nodes that should be summarized
 */
export function filterForSummarization(decisions: ForgettingDecision[]): ForgettingDecision[] {
	return decisions.filter((d) => d.shouldSummarize && !d.shouldDelete);
}

/**
 * Filter nodes that should be deleted.
 *
 * @param decisions - Array of forgetting decisions
 * @returns Decisions for nodes that should be deleted
 */
export function filterForDeletion(decisions: ForgettingDecision[]): ForgettingDecision[] {
	return decisions.filter((d) => d.shouldDelete);
}
