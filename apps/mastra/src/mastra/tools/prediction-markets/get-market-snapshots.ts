/**
 * Get Market Snapshots Tool (v1)
 *
 * Fetches prediction market snapshots with outcome probabilities.
 * Data is populated every 15 minutes by the prediction-markets workflow.
 */

import { createContext, isTest, requireEnv } from "@cream/domain";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

type PredictionPlatform = "KALSHI" | "POLYMARKET";
type PredictionMarketType =
	| "FED_RATE"
	| "ECONOMIC_DATA"
	| "RECESSION"
	| "GEOPOLITICAL"
	| "REGULATORY"
	| "ELECTION"
	| "OTHER";

interface MarketSnapshotData {
	outcomes: Array<{
		outcome: string;
		probability: number;
		price: number;
		volume24h?: number;
	}>;
	liquidityScore?: number;
	volume24h?: number;
	openInterest?: number;
}

interface MarketSnapshot {
	id: string;
	platform: PredictionPlatform;
	marketTicker: string;
	marketType: PredictionMarketType;
	marketQuestion: string | null;
	snapshotTime: string;
	data: MarketSnapshotData;
}

export interface PredictionMarketsToolRepo {
	getLatestSnapshots(platform?: PredictionPlatform): Promise<MarketSnapshot[]>;
	findSnapshots(
		filters: {
			platform?: PredictionPlatform;
			marketType?: PredictionMarketType;
			fromTime?: string;
			toTime?: string;
		},
		limit?: number,
	): Promise<MarketSnapshot[]>;
}

let repoProvider: (() => Promise<PredictionMarketsToolRepo>) | null = null;

/**
 * Set the repository provider for prediction markets data.
 * Must be called before tools are used (typically at app startup).
 */
export function setPredictionMarketsRepositoryProvider(
	provider: () => Promise<PredictionMarketsToolRepo>,
): void {
	repoProvider = provider;
}

async function getRepo(): Promise<PredictionMarketsToolRepo> {
	if (!repoProvider) {
		throw new Error(
			"PredictionMarketsToolRepo provider not set. Call setPredictionMarketsRepositoryProvider() at startup.",
		);
	}
	return repoProvider();
}

const inputSchema = z.object({
	marketType: z
		.enum(["FED_RATE", "ECONOMIC_DATA", "RECESSION", "GEOPOLITICAL", "REGULATORY", "ELECTION"])
		.optional()
		.describe("Filter by market type (e.g., FED_RATE, RECESSION)"),
	platform: z
		.enum(["KALSHI", "POLYMARKET"])
		.optional()
		.describe("Filter by platform (KALSHI or POLYMARKET)"),
	limit: z.number().min(1).max(50).optional().describe("Maximum results (default: 20)"),
});

const marketOutcomeSchema = z.object({
	outcome: z.string().describe("Outcome name (e.g., 'Yes', 'No', '25-50 bps')"),
	probability: z.number().describe("Implied probability (0-1)"),
	price: z.number().describe("Current price in cents"),
});

const marketSnapshotSchema = z.object({
	platform: z.string().describe("Platform (KALSHI or POLYMARKET)"),
	marketTicker: z.string().describe("Market ticker/identifier"),
	marketType: z.string().describe("Market category"),
	marketQuestion: z.string().nullable().describe("Human-readable market question"),
	snapshotTime: z.string().describe("When the snapshot was taken"),
	outcomes: z.array(marketOutcomeSchema).describe("Available outcomes with probabilities"),
	liquidityScore: z.number().optional().describe("Liquidity score (0-1)"),
	volume24h: z.number().optional().describe("24-hour trading volume"),
});

const outputSchema = z.object({
	snapshots: z.array(marketSnapshotSchema),
	count: z.number(),
});

export const getMarketSnapshots = createTool({
	id: "get_market_snapshots",
	description: `Get latest prediction market snapshots with outcome probabilities. Use this tool to:
- See specific market pricing for Fed rate decisions
- Check individual outcome probabilities for macro events
- Compare probabilities across platforms (Kalshi vs Polymarket)
- Identify high-conviction macro views from market pricing

Markets include Fed rate decisions, economic data surprises, recession bets, and geopolitical events.
Updated every 15 minutes.`,
	inputSchema,
	outputSchema,
	execute: async (inputData, _context): Promise<z.infer<typeof outputSchema>> => {
		const ctx = createContext(requireEnv(), "scheduled");

		if (isTest(ctx)) {
			return {
				snapshots: [],
				count: 0,
			};
		}

		const repo = await getRepo();

		let snapshots: MarketSnapshot[];
		if (inputData.marketType) {
			snapshots = await repo.findSnapshots(
				{
					platform: inputData.platform,
					marketType: inputData.marketType,
				},
				inputData.limit ?? 20,
			);
		} else {
			snapshots = await repo.getLatestSnapshots(inputData.platform);
			if (inputData.limit && snapshots.length > inputData.limit) {
				snapshots = snapshots.slice(0, inputData.limit);
			}
		}

		return {
			snapshots: snapshots.map((s) => ({
				platform: s.platform,
				marketTicker: s.marketTicker,
				marketType: s.marketType,
				marketQuestion: s.marketQuestion,
				snapshotTime: s.snapshotTime,
				outcomes: s.data.outcomes.map((o) => ({
					outcome: o.outcome,
					probability: o.probability,
					price: o.price,
				})),
				liquidityScore: s.data.liquidityScore,
				volume24h: s.data.volume24h,
			})),
			count: snapshots.length,
		};
	},
});
