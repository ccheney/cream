/**
 * Get Recent Decisions Tool
 *
 * Provides cross-cycle context by fetching recent trading decisions.
 * Prevents decision-making in a vacuum (e.g., re-entering immediately after closing).
 */

import { getRecentDecisions as getRecentDecisionsImpl } from "@cream/agents/implementations";
import { createContext, requireEnv } from "@cream/domain";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

function createToolContext() {
	return createContext(requireEnv(), "scheduled");
}

const RecentDecisionSchema = z.object({
	symbol: z.string(),
	action: z.enum(["BUY", "SELL", "HOLD", "CLOSE"]),
	direction: z.enum(["LONG", "SHORT", "FLAT"]),
	status: z.string(),
	rationale: z.string().nullable(),
	createdAt: z.string(),
	hoursAgo: z.number(),
});

const GetRecentDecisionsInputSchema = z.object({
	lookbackHours: z
		.number()
		.min(1)
		.max(24)
		.default(4)
		.describe("Number of hours to look back for recent decisions (1-24, default: 4)"),
});

const GetRecentDecisionsOutputSchema = z.object({
	decisions: z.array(RecentDecisionSchema),
	recentlyClosedSymbols: z.array(z.string()),
	recentlyBoughtSymbols: z.array(z.string()),
	recentlySoldSymbols: z.array(z.string()),
	lookbackHours: z.number(),
});

export const getRecentDecisions = createTool({
	id: "getRecentDecisions",
	description: `Get recent trading decisions from the past N hours for cross-cycle context.

CRITICAL: Call this tool at the START of every trading cycle to prevent:
- Re-entering positions that were just closed (churning)
- Issuing contradictory decisions within hours
- Making decisions in a vacuum without context from prior cycles

Returns:
- All decisions from the lookback window (default: 4 hours)
- recentlyClosedSymbols: Symbols with CLOSE/SELL decisions (DO NOT re-enter without strong justification)
- recentlyBoughtSymbols: Symbols with BUY decisions (avoid doubling down)
- recentlySoldSymbols: Symbols that were sold

Cooldown Rules:
- Symbol closed < 2 hours ago: DO NOT re-enter unless thesis fundamentally changed
- Symbol closed 2-4 hours ago: Re-entry requires explicit justification
- Symbol bought < 1 hour ago: DO NOT issue another BUY`,
	inputSchema: GetRecentDecisionsInputSchema,
	outputSchema: GetRecentDecisionsOutputSchema,
	execute: async ({ lookbackHours }) => {
		const ctx = createToolContext();
		return getRecentDecisionsImpl(ctx, lookbackHours);
	},
});

export { GetRecentDecisionsInputSchema, GetRecentDecisionsOutputSchema };
