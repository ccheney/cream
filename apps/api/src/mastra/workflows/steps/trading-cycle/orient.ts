/**
 * Orient Phase
 *
 * Memory context loading and regime classification for the trading cycle workflow.
 */

import type { ExecutionContext } from "@cream/domain";
import { isTest } from "@cream/domain";
import { generateSituationBrief, type MarketSnapshot as HelixMarketSnapshot } from "@cream/helix";
import { classifyRegime, type RegimeClassification } from "@cream/regime";

import { getRegimeLabelsRepo } from "../../../../db.js";
import { getEmbeddingClient, getHelixOrchestrator } from "./helix.js";
import { log } from "./logger.js";
import type {
	MarketSnapshot,
	MemoryContext,
	MorningNewspaperContext,
	RegimeData,
} from "./types.js";

// ============================================
// Memory Context Loading
// ============================================

/**
 * Load memory context including relevant historical cases from HelixDB.
 *
 * Uses the HelixDB orchestrator for GraphRAG retrieval (vector + graph search).
 * Falls back to empty context if HelixDB is unavailable.
 *
 * @param snapshot - Market snapshot with instrument data
 * @param ctx - Execution context for environment detection
 * @param morningNewspaper - Optional morning newspaper from overnight MacroWatch
 * @returns Memory context with relevant cases, regime labels, and newspaper
 */
export async function loadMemoryContext(
	snapshot: MarketSnapshot,
	ctx?: ExecutionContext,
	morningNewspaper?: MorningNewspaperContext
): Promise<MemoryContext> {
	const regimeLabels: Record<string, RegimeData> = {};
	for (const symbol of snapshot.instruments) {
		regimeLabels[symbol] = {
			regime: "RANGE",
			confidence: 0.3,
			reasoning: "Initial default - pending classification",
		};
	}

	if (ctx && isTest(ctx)) {
		return {
			relevantCases: [],
			regimeLabels,
		};
	}

	const orchestrator = getHelixOrchestrator();
	const embedder = getEmbeddingClient();

	if (!orchestrator || !embedder) {
		log.debug("HelixDB orchestrator or embedding client unavailable, using empty memory context");
		return {
			relevantCases: [],
			regimeLabels,
		};
	}

	const relevantCases: unknown[] = [];

	for (const symbol of snapshot.instruments) {
		try {
			const candles = snapshot.candles[symbol];
			const lastCandle = candles?.[candles.length - 1];
			const helixSnapshot: HelixMarketSnapshot = {
				instrumentId: symbol,
				regimeLabel: regimeLabels[symbol]?.regime ?? "RANGE",
				indicators: lastCandle
					? {
							close: lastCandle.close,
							open: lastCandle.open,
							high: lastCandle.high,
							low: lastCandle.low,
							volume: lastCandle.volume,
						}
					: undefined,
			};

			const situationBrief = generateSituationBrief(helixSnapshot);
			const embeddingResult = await embedder.generateEmbedding(situationBrief);

			const result = await orchestrator.orient({
				queryEmbedding: embeddingResult.values,
				instrumentId: symbol,
				underlyingSymbol: symbol,
				regime: regimeLabels[symbol]?.regime,
				topK: 5,
			});

			if (result.success && result.data) {
				log.debug(
					{
						symbol,
						decisionsFound: result.data.decisions.length,
						executionMs: result.executionMs,
						usedFallback: result.usedFallback,
						exceededTarget: result.exceededTarget,
					},
					"HelixDB retrieval completed"
				);

				for (const decision of result.data.decisions) {
					relevantCases.push({
						caseId: decision.decisionId,
						symbol: decision.instrumentId,
						action: decision.action,
						regime: decision.regime,
						rationale: decision.rationaleSummary,
						similarity: decision.relevanceScore,
					});
				}
			}
		} catch (error) {
			log.warn(
				{ symbol, error: error instanceof Error ? error.message : String(error) },
				"Failed to retrieve memories for symbol"
			);
		}
	}

	// Log newspaper injection if present
	if (morningNewspaper) {
		log.info(
			{
				date: morningNewspaper.date,
				entryCount: morningNewspaper.entryCount,
				compiledAt: morningNewspaper.compiledAt,
			},
			"Morning newspaper injected into memory context"
		);
	}

	return {
		relevantCases,
		regimeLabels,
		morningNewspaper,
	};
}

// ============================================
// Regime Classification
// ============================================

/**
 * Compute regime classifications for instruments and store to database.
 * Uses the rule-based classifier from @cream/regime.
 */
export async function computeAndStoreRegimes(
	snapshot: MarketSnapshot
): Promise<Record<string, RegimeData>> {
	const regimeLabels: Record<string, RegimeData> = {};

	let repo: ReturnType<typeof getRegimeLabelsRepo> | null = null;
	try {
		repo = getRegimeLabelsRepo();
	} catch {
		repo = null;
	}

	for (const instrument of snapshot.instruments) {
		const candles = snapshot.candles[instrument];

		if (!candles || !Array.isArray(candles) || candles.length < 51) {
			regimeLabels[instrument] = {
				regime: "RANGE",
				confidence: 0.3,
				reasoning: "Insufficient data for classification",
			};
			continue;
		}

		try {
			const classification: RegimeClassification = classifyRegime({
				candles: candles as Array<{
					open: number;
					high: number;
					low: number;
					close: number;
					volume: number;
					timestamp: number;
				}>,
			});

			regimeLabels[instrument] = {
				regime: classification.regime,
				confidence: classification.confidence,
				reasoning: classification.reasoning,
			};
		} catch {
			regimeLabels[instrument] = {
				regime: "RANGE",
				confidence: 0.3,
				reasoning: "Classification error",
			};
		}
	}

	if (repo) {
		const timestamp = new Date().toISOString();
		const repoRef = repo;
		(async () => {
			for (const [symbol, data] of Object.entries(regimeLabels)) {
				try {
					await repoRef.upsert({
						symbol,
						timestamp,
						timeframe: "1h",
						regime: data.regime.toLowerCase().replace("_", "_") as
							| "bull_trend"
							| "bear_trend"
							| "range_bound"
							| "high_volatility"
							| "low_volatility"
							| "crisis",
						confidence: data.confidence,
						trendStrength: null,
						volatilityPercentile: null,
						correlationToMarket: null,
						modelName: "rule_based",
						modelVersion: "1.0.0",
					});
				} catch {
					// Storage failed - continue without blocking
				}
			}
		})();
	}

	return regimeLabels;
}
