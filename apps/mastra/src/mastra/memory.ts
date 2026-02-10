/**
 * Shared memory configuration for trading agents.
 *
 * Uses Mastra's Observational Memory with resource scope to persist
 * learnings across trading cycles. Observations accumulate at the
 * resource level (per-agent), not per-thread — threads are disposable
 * (one per cycle per batch) while observations persist indefinitely.
 *
 * Storage is inherited from the Mastra instance-level PostgresStore.
 */

import { Memory } from "@mastra/memory";

/**
 * Trader agent memory — highest value target for cross-cycle learning.
 * Makes final P&L decisions, benefits from recognizing repeated patterns
 * and avoiding prior mistakes across trading cycles.
 */
export function createTraderMemory(): Memory {
	return new Memory({
		options: {
			lastMessages: 10,
			observationalMemory: {
				scope: "resource",
				observation: {
					messageTokens: 128_000,
				},
				reflection: {
					observationTokens: 256_000,
				},
			},
		},
	});
}

/**
 * Analyst agent memory — for news and fundamentals analysts (Phase 2).
 * Enables recurring pattern recognition across cycles.
 */
export function createAnalystMemory(): Memory {
	return new Memory({
		options: {
			lastMessages: 8,
			observationalMemory: {
				scope: "resource",
				observation: {
					messageTokens: 128_000,
				},
				reflection: {
					observationTokens: 256_000,
				},
			},
		},
	});
}
