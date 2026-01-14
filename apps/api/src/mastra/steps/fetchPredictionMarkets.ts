/**
 * Fetch Prediction Markets Step
 *
 * Fetches prediction market data from Kalshi and Polymarket,
 * computes macro risk signals, and stores to the database.
 *
 * Runs on a 15-minute schedule (separate from hourly OODA loop).
 */

import { createDefaultPredictionMarketsConfig, type PredictionMarketsConfig } from "@cream/config";
import {
	createContext,
	type ExecutionContext,
	isBacktest,
	type PredictionMarketScores,
	requireEnv,
} from "@cream/domain";
import { createNodeLogger } from "@cream/logger";
import {
	createUnifiedClient,
	type MacroRiskSignals,
	type PredictionMarketEvent,
	toNumericScores,
	type UnifiedPredictionMarketClient,
} from "@cream/prediction-markets";
import type { CreateSignalInput, CreateSnapshotInput, SignalType } from "@cream/storage";
import { createStep } from "@mastra/core/workflows";
import { z } from "zod";

import { getPredictionMarketsRepo } from "../../db.js";

const log = createNodeLogger({ service: "prediction-markets", level: "info" });

/**
 * Create ExecutionContext for step invocation.
 * Steps are invoked by the Mastra workflow during scheduled runs.
 */
function createStepContext(): ExecutionContext {
	return createContext(requireEnv(), "scheduled");
}

// ============================================
// Types
// ============================================

export interface PredictionMarketContext {
	signals: MacroRiskSignals;
	scores: PredictionMarketScores;
	numericScores: Record<string, number>;
	events: PredictionMarketEvent[];
	arbitrageAlerts: number;
	fetchedAt: string;
}

// ============================================
// Output Schema
// ============================================

export const PredictionMarketOutputSchema = z.object({
	signals: z.object({
		fedCutProbability: z.number().optional(),
		fedHikeProbability: z.number().optional(),
		recessionProbability12m: z.number().optional(),
		macroUncertaintyIndex: z.number().optional(),
		policyEventRisk: z.number().optional(),
		marketConfidence: z.number().optional(),
		marketCount: z.number().optional(),
		platforms: z.array(z.string()),
		timestamp: z.string(),
	}),
	scores: z.record(z.string(), z.number().optional()),
	numericScores: z.record(z.string(), z.number()),
	eventCount: z.number(),
	arbitrageAlertCount: z.number(),
	fetchedAt: z.string(),
});

export type PredictionMarketOutput = z.infer<typeof PredictionMarketOutputSchema>;

// ============================================
// Singleton Client
// ============================================

let unifiedClient: UnifiedPredictionMarketClient | null = null;

/**
 * Build PredictionMarketsConfig from environment variables
 */
function buildConfigFromEnv(): PredictionMarketsConfig {
	const config = createDefaultPredictionMarketsConfig();

	// Check for Kalshi credentials
	const hasKalshi = Boolean(process.env.KALSHI_API_KEY_ID && process.env.KALSHI_PRIVATE_KEY_PATH);
	if (hasKalshi) {
		config.kalshi.enabled = true;
		config.kalshi.api_key_id = process.env.KALSHI_API_KEY_ID;
		// Resolve relative paths from project root
		const keyPath = process.env.KALSHI_PRIVATE_KEY_PATH ?? "";
		config.kalshi.private_key_path = keyPath.startsWith("/")
			? keyPath
			: `${process.cwd()}/${keyPath}`;
	} else {
		config.kalshi.enabled = false;
	}

	// Check for Polymarket (REST-based, no auth required for read-only)
	// Polymarket is enabled by default if we want public data
	config.polymarket.enabled = true;

	return config;
}

function getUnifiedClient(): UnifiedPredictionMarketClient | null {
	if (unifiedClient) {
		return unifiedClient;
	}

	const config = buildConfigFromEnv();

	// Check if any provider is enabled
	if (!config.kalshi.enabled && !config.polymarket.enabled) {
		return null;
	}

	try {
		unifiedClient = createUnifiedClient(config);
		return unifiedClient;
	} catch {
		return null;
	}
}

// ============================================
// Storage Helpers
// ============================================

async function storeMarketSnapshots(events: PredictionMarketEvent[]): Promise<void> {
	const repo = await getPredictionMarketsRepo();

	for (const event of events) {
		const snapshot: CreateSnapshotInput = {
			id: `${event.payload.platform}-${event.payload.marketTicker}-${Date.now()}`,
			platform: event.payload.platform,
			marketTicker: event.payload.marketTicker,
			marketType: event.payload.marketType,
			marketQuestion: event.payload.marketQuestion,
			snapshotTime: new Date().toISOString(),
			data: {
				outcomes: event.payload.outcomes,
				liquidityScore: event.payload.liquidityScore,
				volume24h: event.payload.volume24h,
				openInterest: event.payload.openInterest,
			},
		};
		await repo.saveSnapshot(snapshot);
	}
}

async function storeComputedSignals(
	signals: MacroRiskSignals,
	scores: PredictionMarketScores
): Promise<void> {
	const repo = await getPredictionMarketsRepo();

	const timestamp = new Date().toISOString();

	// Map signals to storage format
	const signalMappings: Array<{
		type: SignalType;
		value: number | undefined;
	}> = [
		{ type: "fed_cut_probability", value: signals.fedCutProbability },
		{ type: "fed_hike_probability", value: signals.fedHikeProbability },
		{ type: "recession_12m", value: signals.recessionProbability12m },
		{ type: "macro_uncertainty", value: signals.macroUncertaintyIndex },
		{ type: "policy_event_risk", value: signals.policyEventRisk },
		{ type: "cpi_surprise", value: scores.cpiSurpriseDirection },
		{ type: "gdp_surprise", value: scores.gdpSurpriseDirection },
		{ type: "shutdown_probability", value: scores.shutdownProbability },
		{ type: "tariff_escalation", value: scores.tariffEscalationProbability },
	];

	for (const { type, value } of signalMappings) {
		if (value !== undefined) {
			const input: CreateSignalInput = {
				id: `${type}-${Date.now()}`,
				signalType: type,
				signalValue: value,
				confidence: signals.marketConfidence,
				computedAt: timestamp,
				inputs: {
					sources: signals.platforms.map((p) => ({
						platform: p as "KALSHI" | "POLYMARKET",
						ticker: "",
						price: 0,
						weight: 1,
					})),
					method: "unified_aggregation",
				},
			};
			await repo.saveSignal(input);
		}
	}
}

// ============================================
// Step Definition
// ============================================

export const fetchPredictionMarketsStep = createStep({
	id: "fetch-prediction-markets",
	description: "Fetch prediction market data and compute macro signals",
	inputSchema: z.object({
		marketTypes: z
			.array(
				z.enum(["FED_RATE", "ECONOMIC_DATA", "RECESSION", "GEOPOLITICAL", "REGULATORY", "ELECTION"])
			)
			.optional()
			.default(["FED_RATE", "ECONOMIC_DATA", "RECESSION"]),
	}),
	outputSchema: PredictionMarketOutputSchema,
	retries: 2,
	execute: async ({ inputData }) => {
		const fetchedAt = new Date().toISOString();

		// Create context at step boundary
		const ctx = createStepContext();

		// In backtest mode, return empty context
		if (isBacktest(ctx)) {
			return {
				signals: {
					platforms: [],
					timestamp: fetchedAt,
				},
				scores: {},
				numericScores: {},
				eventCount: 0,
				arbitrageAlertCount: 0,
				fetchedAt,
			};
		}

		// Check if client is available
		const client = getUnifiedClient();
		if (!client) {
			return {
				signals: {
					platforms: [],
					timestamp: fetchedAt,
				},
				scores: {},
				numericScores: {},
				eventCount: 0,
				arbitrageAlertCount: 0,
				fetchedAt,
			};
		}

		try {
			// Fetch all market data
			const marketData = await client.getAllMarketData(inputData.marketTypes);

			// Store data to database (non-blocking)
			Promise.all([
				storeMarketSnapshots(marketData.events).catch((err) => {
					log.warn(
						{ error: err instanceof Error ? err.message : String(err) },
						"Failed to store prediction market snapshots"
					);
				}),
				storeComputedSignals(marketData.signals, marketData.scores).catch((err) => {
					log.warn(
						{ error: err instanceof Error ? err.message : String(err) },
						"Failed to store prediction market signals"
					);
				}),
			]);

			// Compute numeric scores for agent context
			const numericScores = toNumericScores(marketData.scores);

			return {
				signals: marketData.signals,
				scores: marketData.scores,
				numericScores,
				eventCount: marketData.events.length,
				arbitrageAlertCount: marketData.arbitrageAlerts.length,
				fetchedAt,
			};
		} catch (error) {
			log.warn(
				{ error: error instanceof Error ? error.message : String(error) },
				"Failed to fetch prediction market data"
			);
			return {
				signals: {
					platforms: [],
					timestamp: fetchedAt,
				},
				scores: {},
				numericScores: {},
				eventCount: 0,
				arbitrageAlertCount: 0,
				fetchedAt,
			};
		}
	},
});

// ============================================
// Latest Signals Retrieval (for OODA loop)
// ============================================

/**
 * Get the latest computed signals from the database.
 * Used by gatherExternalContext to include PM signals without re-fetching.
 */
export async function getLatestPredictionMarketSignals(): Promise<PredictionMarketContext | null> {
	// Create context to check environment
	const ctx = createStepContext();

	if (isBacktest(ctx)) {
		return null;
	}

	try {
		const repo = await getPredictionMarketsRepo();

		// Get latest signals
		const signals = await repo.getLatestSignals();
		if (signals.length === 0) {
			return null;
		}

		// Build signal object from latest values
		const latestSignals: MacroRiskSignals = {
			platforms: [],
			marketCount: 0,
			timestamp: new Date().toISOString(),
		};
		const scores: PredictionMarketScores = {};

		for (const signal of signals) {
			switch (signal.signalType) {
				case "fed_cut_probability":
					latestSignals.fedCutProbability = signal.signalValue;
					scores.fedCutProbability = signal.signalValue;
					break;
				case "fed_hike_probability":
					latestSignals.fedHikeProbability = signal.signalValue;
					scores.fedHikeProbability = signal.signalValue;
					break;
				case "recession_12m":
					latestSignals.recessionProbability12m = signal.signalValue;
					scores.recessionProbability12m = signal.signalValue;
					break;
				case "macro_uncertainty":
					latestSignals.macroUncertaintyIndex = signal.signalValue;
					scores.macroUncertaintyIndex = signal.signalValue;
					break;
				case "policy_event_risk":
					latestSignals.policyEventRisk = signal.signalValue;
					scores.policyEventRisk = signal.signalValue;
					break;
				case "cpi_surprise":
					scores.cpiSurpriseDirection = signal.signalValue;
					break;
				case "gdp_surprise":
					scores.gdpSurpriseDirection = signal.signalValue;
					break;
				case "shutdown_probability":
					scores.shutdownProbability = signal.signalValue;
					break;
				case "tariff_escalation":
					scores.tariffEscalationProbability = signal.signalValue;
					break;
			}
			latestSignals.marketConfidence = signal.confidence ?? undefined;
			// Extract platforms from inputs
			if (signal.inputs?.sources) {
				for (const source of signal.inputs.sources) {
					if (source.platform && !latestSignals.platforms.includes(source.platform)) {
						latestSignals.platforms.push(source.platform);
					}
				}
			}
		}

		return {
			signals: latestSignals,
			scores,
			numericScores: toNumericScores(scores),
			events: [], // Events are stored separately
			arbitrageAlerts: 0,
			fetchedAt: latestSignals.timestamp,
		};
	} catch (error) {
		log.warn(
			{ error: error instanceof Error ? error.message : String(error) },
			"Failed to get latest prediction market signals"
		);
		return null;
	}
}
