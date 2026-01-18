/**
 * Mastra Prediction Market Tool Definitions
 *
 * Tools for querying prediction market data from the database.
 * Data is populated every 15 minutes by the prediction-markets workflow.
 *
 * @see docs/plans/18-prediction-markets.md
 */

import { createContext, isTest, requireEnv } from "@cream/domain";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

/**
 * Create ExecutionContext for tool invocation.
 * Tools are invoked by the agent framework during scheduled runs.
 */
function createToolContext() {
	return createContext(requireEnv(), "scheduled");
}

// ============================================
// Types (mirror from @cream/storage)
// ============================================

type PredictionPlatform = "KALSHI" | "POLYMARKET";
type PredictionMarketType =
	| "FED_RATE"
	| "ECONOMIC_DATA"
	| "RECESSION"
	| "GEOPOLITICAL"
	| "REGULATORY"
	| "ELECTION"
	| "OTHER";
type SignalType =
	| "fed_cut_probability"
	| "fed_hike_probability"
	| "recession_12m"
	| "macro_uncertainty"
	| "policy_event_risk"
	| "cpi_surprise"
	| "gdp_surprise"
	| "shutdown_probability"
	| "tariff_escalation";

// ============================================
// Repository Provider (Dependency Injection)
// ============================================

interface PredictionMarketsRepo {
	getLatestSignals(): Promise<
		Array<{
			id: string;
			signalType: SignalType;
			signalValue: number;
			confidence: number | null;
			computedAt: string;
		}>
	>;
	getLatestSnapshots(platform?: PredictionPlatform): Promise<
		Array<{
			id: string;
			platform: PredictionPlatform;
			marketTicker: string;
			marketType: PredictionMarketType;
			marketQuestion: string | null;
			snapshotTime: string;
			data: {
				outcomes: Array<{
					outcome: string;
					probability: number;
					price: number;
					volume24h?: number;
				}>;
				liquidityScore?: number;
				volume24h?: number;
				openInterest?: number;
			};
		}>
	>;
	findSnapshots(
		filters: {
			platform?: PredictionPlatform;
			marketType?: PredictionMarketType;
			fromTime?: string;
			toTime?: string;
		},
		limit?: number
	): Promise<
		Array<{
			id: string;
			platform: PredictionPlatform;
			marketTicker: string;
			marketType: PredictionMarketType;
			marketQuestion: string | null;
			snapshotTime: string;
			data: {
				outcomes: Array<{
					outcome: string;
					probability: number;
					price: number;
					volume24h?: number;
				}>;
				liquidityScore?: number;
				volume24h?: number;
				openInterest?: number;
			};
		}>
	>;
}

let repoProvider: (() => Promise<PredictionMarketsRepo>) | null = null;

/**
 * Set the repository provider for prediction market tools.
 * Must be called before tools are used (typically at app startup).
 */
export function setPredictionMarketsRepoProvider(
	provider: () => Promise<PredictionMarketsRepo>
): void {
	repoProvider = provider;
}

async function getRepo(): Promise<PredictionMarketsRepo> {
	if (!repoProvider) {
		throw new Error(
			"PredictionMarketsRepo provider not set. Call setPredictionMarketsRepoProvider() at startup."
		);
	}
	return repoProvider();
}

// ============================================
// Get Latest Signals Tool
// ============================================

const GetPredictionSignalsInputSchema = z.object({});

const PredictionSignalSchema = z.object({
	signalType: z.string().describe("Type of signal (e.g., fed_cut_probability, recession_12m)"),
	signalValue: z.number().describe("Signal value (typically 0-1 for probabilities)"),
	confidence: z.number().nullable().describe("Confidence in the signal (0-1)"),
	computedAt: z.string().describe("When the signal was computed (ISO 8601)"),
});

const GetPredictionSignalsOutputSchema = z.object({
	signals: z.array(PredictionSignalSchema),
	summary: z.object({
		fedCutProbability: z.number().optional(),
		fedHikeProbability: z.number().optional(),
		recessionProbability12m: z.number().optional(),
		macroUncertaintyIndex: z.number().optional(),
		policyEventRisk: z.number().optional(),
	}),
	timestamp: z.string(),
});

export const getPredictionSignalsTool = createTool({
	id: "get_prediction_signals",
	description: `Get latest prediction market signals for macro indicators. Use this tool to:
- Check current Fed rate cut/hike probabilities from prediction markets
- Assess recession probability over the next 12 months
- Gauge macro uncertainty and policy event risk
- Inform position sizing and risk management based on market-implied probabilities

These signals are derived from real-money bets on Kalshi and Polymarket.
Updated every 15 minutes.`,
	inputSchema: GetPredictionSignalsInputSchema,
	outputSchema: GetPredictionSignalsOutputSchema,
	execute: async (): Promise<z.infer<typeof GetPredictionSignalsOutputSchema>> => {
		const ctx = createToolContext();

		// In test mode, return empty results
		if (isTest(ctx)) {
			return {
				signals: [],
				summary: {},
				timestamp: new Date().toISOString(),
			};
		}

		const repo = await getRepo();
		const signals = await repo.getLatestSignals();

		// Build summary from signals
		const summary: z.infer<typeof GetPredictionSignalsOutputSchema>["summary"] = {};
		for (const signal of signals) {
			switch (signal.signalType) {
				case "fed_cut_probability":
					summary.fedCutProbability = signal.signalValue;
					break;
				case "fed_hike_probability":
					summary.fedHikeProbability = signal.signalValue;
					break;
				case "recession_12m":
					summary.recessionProbability12m = signal.signalValue;
					break;
				case "macro_uncertainty":
					summary.macroUncertaintyIndex = signal.signalValue;
					break;
				case "policy_event_risk":
					summary.policyEventRisk = signal.signalValue;
					break;
			}
		}

		return {
			signals: signals.map((s) => ({
				signalType: s.signalType,
				signalValue: s.signalValue,
				confidence: s.confidence,
				computedAt: s.computedAt,
			})),
			summary,
			timestamp: new Date().toISOString(),
		};
	},
});

// ============================================
// Get Market Snapshots Tool
// ============================================

const GetMarketSnapshotsInputSchema = z.object({
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

const MarketOutcomeSchema = z.object({
	outcome: z.string().describe("Outcome name (e.g., 'Yes', 'No', '25-50 bps')"),
	probability: z.number().describe("Implied probability (0-1)"),
	price: z.number().describe("Current price in cents"),
});

const MarketSnapshotSchema = z.object({
	platform: z.string().describe("Platform (KALSHI or POLYMARKET)"),
	marketTicker: z.string().describe("Market ticker/identifier"),
	marketType: z.string().describe("Market category"),
	marketQuestion: z.string().nullable().describe("Human-readable market question"),
	snapshotTime: z.string().describe("When the snapshot was taken"),
	outcomes: z.array(MarketOutcomeSchema).describe("Available outcomes with probabilities"),
	liquidityScore: z.number().optional().describe("Liquidity score (0-1)"),
	volume24h: z.number().optional().describe("24-hour trading volume"),
});

const GetMarketSnapshotsOutputSchema = z.object({
	snapshots: z.array(MarketSnapshotSchema),
	count: z.number(),
});

export const getMarketSnapshotsTool = createTool({
	id: "get_market_snapshots",
	description: `Get latest prediction market snapshots with outcome probabilities. Use this tool to:
- See specific market pricing for Fed rate decisions
- Check individual outcome probabilities for macro events
- Compare probabilities across platforms (Kalshi vs Polymarket)
- Identify high-conviction macro views from market pricing

Markets include Fed rate decisions, economic data surprises, recession bets, and geopolitical events.
Updated every 15 minutes.`,
	inputSchema: GetMarketSnapshotsInputSchema,
	outputSchema: GetMarketSnapshotsOutputSchema,
	execute: async (inputData): Promise<z.infer<typeof GetMarketSnapshotsOutputSchema>> => {
		const ctx = createToolContext();

		// In test mode, return empty results
		if (isTest(ctx)) {
			return {
				snapshots: [],
				count: 0,
			};
		}

		const repo = await getRepo();

		// Use findSnapshots with filters if provided, otherwise getLatestSnapshots
		let snapshots: Awaited<ReturnType<typeof repo.getLatestSnapshots>>;
		if (inputData.marketType) {
			snapshots = await repo.findSnapshots(
				{
					platform: inputData.platform,
					marketType: inputData.marketType,
				},
				inputData.limit ?? 20
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

// Re-export schemas for testing
export {
	GetMarketSnapshotsInputSchema,
	GetMarketSnapshotsOutputSchema,
	GetPredictionSignalsInputSchema,
	GetPredictionSignalsOutputSchema,
};
