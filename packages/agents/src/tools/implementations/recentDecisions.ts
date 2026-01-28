/**
 * Recent Decisions Tool
 *
 * Provides cross-cycle context by querying recent decisions.
 * Helps prevent decision-making in a vacuum (e.g., buying immediately after closing).
 */

import type { ExecutionContext } from "@cream/domain";
import { DecisionsRepository } from "@cream/storage";

/**
 * A simplified decision record for cross-cycle context
 */
export interface RecentDecision {
	symbol: string;
	action: "BUY" | "SELL" | "HOLD" | "CLOSE";
	direction: "LONG" | "SHORT" | "FLAT";
	status: string;
	rationale: string | null;
	createdAt: string;
	/** Hours since this decision was made */
	hoursAgo: number;
}

export interface RecentDecisionsResponse {
	decisions: RecentDecision[];
	/** Symbols that were recently closed (within lookback window) */
	recentlyClosedSymbols: string[];
	/** Symbols that were recently bought (within lookback window) */
	recentlyBoughtSymbols: string[];
	/** Symbols that were recently sold (within lookback window) */
	recentlySoldSymbols: string[];
	lookbackHours: number;
}

/**
 * Get recent decisions within a lookback window.
 *
 * This tool provides cross-cycle context to prevent decision-making in a vacuum.
 * Use it to:
 * - Check if a symbol was recently closed (don't re-enter immediately)
 * - Check if a symbol was recently bought (don't double-enter)
 * - Understand recent trading activity patterns
 *
 * @param ctx - ExecutionContext
 * @param lookbackHours - Number of hours to look back (default: 4)
 * @returns Recent decisions with categorized symbols
 */
export async function getRecentDecisions(
	ctx: ExecutionContext,
	lookbackHours = 4,
): Promise<RecentDecisionsResponse> {
	const decisionsRepo = new DecisionsRepository();

	const recentDecisions = await decisionsRepo.findRecentWithinWindow(
		ctx.environment,
		lookbackHours,
		{
			status: ["approved", "executed"],
		},
	);

	const now = Date.now();
	const decisions: RecentDecision[] = recentDecisions.map((d) => ({
		symbol: d.symbol,
		action: d.action as "BUY" | "SELL" | "HOLD" | "CLOSE",
		direction: d.direction as "LONG" | "SHORT" | "FLAT",
		status: d.status,
		rationale: d.rationale,
		createdAt: d.createdAt,
		hoursAgo: Math.round(((now - new Date(d.createdAt).getTime()) / (1000 * 60 * 60)) * 10) / 10,
	}));

	// Categorize symbols by action type
	const recentlyClosedSymbols = [
		...new Set(
			decisions.filter((d) => d.action === "CLOSE" || d.action === "SELL").map((d) => d.symbol),
		),
	];

	const recentlyBoughtSymbols = [
		...new Set(decisions.filter((d) => d.action === "BUY").map((d) => d.symbol)),
	];

	const recentlySoldSymbols = [
		...new Set(decisions.filter((d) => d.action === "SELL").map((d) => d.symbol)),
	];

	return {
		decisions,
		recentlyClosedSymbols,
		recentlyBoughtSymbols,
		recentlySoldSymbols,
		lookbackHours,
	};
}

/**
 * Check if a symbol has a cooldown (was recently closed).
 * Returns the time since close if within cooldown, null otherwise.
 */
export async function checkSymbolCooldown(
	ctx: ExecutionContext,
	symbol: string,
	cooldownHours = 4,
): Promise<{ onCooldown: boolean; hoursSinceClose: number | null; closeRationale: string | null }> {
	const decisionsRepo = new DecisionsRepository();

	const recentCloses = await decisionsRepo.findRecentWithinWindow(ctx.environment, cooldownHours, {
		actions: ["CLOSE", "SELL"],
		status: ["approved", "executed"],
		symbols: [symbol],
	});

	const mostRecentClose = recentCloses.at(0);
	if (!mostRecentClose) {
		return { onCooldown: false, hoursSinceClose: null, closeRationale: null };
	}

	const hoursSinceClose =
		(Date.now() - new Date(mostRecentClose.createdAt).getTime()) / (1000 * 60 * 60);

	return {
		onCooldown: true,
		hoursSinceClose: Math.round(hoursSinceClose * 10) / 10,
		closeRationale: mostRecentClose.rationale,
	};
}
