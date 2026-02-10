/**
 * Mastra v1 Configuration
 *
 * Central Mastra instance with registered agents and workflows.
 *
 * Agents: 9 trading agents (analysts, researchers, trader, approvers, grounding, routing)
 * Workflows: tradingCycle, predictionMarkets, macroWatch
 *
 * Observability: OpenObserve via OpenTelemetry for tracing agent runs,
 * LLM generations, tool calls, and workflow steps.
 *
 * @see docs/plans/53-mastra-v1-migration.md
 */

import { PredictionMarketsRepository } from "@cream/storage";
import { Mastra } from "@mastra/core";
import { Observability } from "@mastra/observability";
import { OtelBridge } from "@mastra/otel-bridge";
import { PostgresStore } from "@mastra/pg";

// Agents
import {
	bearishResearcher,
	bullishResearcher,
	critic,
	fundamentalsAnalyst,
	groundingAgent,
	newsAnalyst,
	riskManager,
	routingAgent,
	trader,
} from "./agents/index.js";
// Scorers
// Tools - prediction markets repository provider
import {
	type PredictionMarketsToolRepo,
	setPredictionMarketsRepositoryProvider,
} from "./tools/prediction-markets/get-market-snapshots.js";
// Workflows
import {
	macroWatchWorkflow,
	predictionMarketsWorkflow,
	tradingCycleWorkflow,
} from "./workflows/index.js";

// ============================================
// Repository Provider Initialization
// ============================================

// Type adapters for prediction markets (tool uses uppercase, storage uses lowercase)
type ToolPlatform = "KALSHI" | "POLYMARKET";
type StoragePlatform = "kalshi" | "polymarket";
type ToolMarketType =
	| "FED_RATE"
	| "ECONOMIC_DATA"
	| "RECESSION"
	| "GEOPOLITICAL"
	| "REGULATORY"
	| "ELECTION"
	| "OTHER";
type StorageMarketType = "rate" | "election" | "economic";

function toStoragePlatform(p?: ToolPlatform): StoragePlatform | undefined {
	if (!p) return undefined;
	return p.toLowerCase() as StoragePlatform;
}

function toToolPlatform(p: string): ToolPlatform {
	return p.toUpperCase() as ToolPlatform;
}

function toStorageMarketType(t?: ToolMarketType): StorageMarketType | undefined {
	if (!t) return undefined;
	const mapping: Record<ToolMarketType, StorageMarketType> = {
		FED_RATE: "rate",
		ECONOMIC_DATA: "economic",
		RECESSION: "economic",
		GEOPOLITICAL: "economic",
		REGULATORY: "economic",
		ELECTION: "election",
		OTHER: "economic",
	};
	return mapping[t];
}

function toToolMarketType(t: string): ToolMarketType {
	const mapping: Record<StorageMarketType, ToolMarketType> = {
		rate: "FED_RATE",
		election: "ELECTION",
		economic: "ECONOMIC_DATA",
	};
	return mapping[t as StorageMarketType] ?? "OTHER";
}

// Wire up prediction markets tools with storage repository
setPredictionMarketsRepositoryProvider(async (): Promise<PredictionMarketsToolRepo> => {
	const repo = new PredictionMarketsRepository();

	return {
		async getLatestSignals() {
			const signals = await repo.getLatestSignals();
			return signals.map((s) => ({
				id: s.id,
				signalType: s.signalType,
				signalValue: s.signalValue,
				confidence: s.confidence,
				computedAt: s.computedAt,
			}));
		},

		async getLatestSnapshots(platform) {
			const snapshots = await repo.getLatestSnapshots(toStoragePlatform(platform));
			return snapshots.map((s) => ({
				id: s.id,
				platform: toToolPlatform(s.platform),
				marketTicker: s.marketTicker,
				marketType: toToolMarketType(s.marketType),
				marketQuestion: s.marketQuestion,
				snapshotTime: s.snapshotTime,
				data: s.data,
			}));
		},

		async findSnapshots(filters, limit) {
			const snapshots = await repo.findSnapshots(
				{
					platform: toStoragePlatform(filters.platform as ToolPlatform | undefined),
					marketType: toStorageMarketType(filters.marketType as ToolMarketType | undefined),
					fromTime: filters.fromTime,
					toTime: filters.toTime,
				},
				limit,
			);
			return snapshots.map((s) => ({
				id: s.id,
				platform: toToolPlatform(s.platform),
				marketTicker: s.marketTicker,
				marketType: toToolMarketType(s.marketType),
				marketQuestion: s.marketQuestion,
				snapshotTime: s.snapshotTime,
				data: s.data,
			}));
		},
	};
});

// ============================================
// Database URL Resolution
// ============================================

const DATABASE_URLS: Record<string, string | undefined> = {
	PAPER: Bun.env.DATABASE_URL_PAPER ?? Bun.env.DATABASE_URL,
	LIVE: Bun.env.DATABASE_URL,
};

function getDatabaseUrl(): string {
	if (Bun.env.NODE_ENV === "test" && Bun.env.TEST_DATABASE_URL) {
		return Bun.env.TEST_DATABASE_URL;
	}

	const env = Bun.env.CREAM_ENV ?? "PAPER";
	const url = DATABASE_URLS[env];

	if (!url) {
		throw new Error(
			`DATABASE_URL not configured for environment: ${env}. ` +
				`Set DATABASE_URL_${env} or DATABASE_URL environment variable.`,
		);
	}

	return url;
}

// OTEL bridge configuration (SDK is initialized in instrumentation.ts)
const observabilityEnabled =
	Bun.env.OTEL_ENABLED !== "false" && Bun.env.OTEL_EXPORTER_OTLP_ENDPOINT !== undefined;

/**
 * Mastra v1 instance for the trading system.
 *
 * Registered agents (accessible via mastra.getAgent("agent_id")):
 * - grounding_agent: Real-time web search context via xAI Grok
 * - news_analyst: News & Sentiment analysis
 * - fundamentals_analyst: Fundamentals & Macro analysis
 * - bullish_researcher: Bull case construction
 * - bearish_researcher: Bear case construction
 * - trader: Decision plan synthesis
 * - risk_manager: Risk validation
 * - critic: Logical consistency check
 * - routing_agent: Multi-agent network coordinator
 *
 * Registered workflows:
 * - tradingCycleWorkflow: OODA loop trading cycle (8 steps)
 * - predictionMarketsWorkflow: Prediction market data fetching
 * - macroWatchWorkflow: Macro environment newspaper
 *
 * Observability:
 * - Traces: Agent runs, LLM generations, tool calls, workflow steps
 * - Metrics: Token usage, latency, error rates
 * - Export: OpenObserve via OTLP (configurable endpoint)
 */
export const mastra = new Mastra({
	storage: new PostgresStore({
		id: "cream-mastra",
		connectionString: getDatabaseUrl(),
	}),
	agents: {
		groundingAgent,
		newsAnalyst,
		fundamentalsAnalyst,
		bullishResearcher,
		bearishResearcher,
		trader,
		riskManager,
		critic,
		routingAgent,
	},
	workflows: {
		tradingCycleWorkflow,
		predictionMarketsWorkflow,
		macroWatchWorkflow,
	},
	observability: observabilityEnabled
		? new Observability({
				configs: {
					default: {
						serviceName: "cream-mastra",
						bridge: new OtelBridge(),
					},
				},
			})
		: undefined,
});
