/**
 * Shared test fixtures and helpers for forgetting policy tests.
 */

import type { NodeInfo } from "../../src/retention/forgetting.js";

export function createNodeInfo(overrides: Partial<NodeInfo> = {}): NodeInfo {
	return {
		id: "test-node-1",
		nodeType: "TradeDecision",
		environment: "PAPER",
		createdAt: new Date(),
		accessCount: 0,
		edgeCount: 0,
		...overrides,
	};
}

export function daysAgo(days: number): Date {
	const date = new Date();
	date.setDate(date.getDate() - days);
	return date;
}
