/**
 * CBR Retrieval
 *
 * Core Case-Based Reasoning retrieval functionality including vector search
 * and case retrieval from HelixDB.
 *
 * @module
 */

import { calculateCaseStatistics } from "@cream/domain";
import type { EmbeddingClient } from "../embeddings.js";
import type { TradeDecision } from "../node-types.js";
import { DEFAULT_CBR_OPTIONS } from "./config.js";
import { convertToRetrievedCase } from "./conversion.js";
import { generateCBRSituationBrief } from "./situation-brief.js";
import type {
	CBRMarketSnapshot,
	CBRRetrievalOptions,
	CBRRetrievalResult,
	HelixClient,
	SearchSimilarDecisionsResult,
} from "./types.js";

/**
 * Retrieve similar cases using Case-Based Reasoning.
 *
 * This is the main entry point for CBR retrieval. It:
 * 1. Generates a situation brief from the snapshot
 * 2. Creates an embedding using Gemini
 * 3. Performs vector similarity search in HelixDB
 * 4. Converts results to domain RetrievedCase format
 * 5. Calculates aggregate statistics
 *
 * @param client - HelixDB client
 * @param embeddingClient - Embedding client for generating embeddings
 * @param snapshot - Current market context
 * @param options - Retrieval options
 * @returns CBR retrieval result with cases and statistics
 *
 * @example
 * ```typescript
 * const client = createHelixClient();
 * const embedder = createEmbeddingClient();
 *
 * const result = await retrieveSimilarCases(client, embedder, {
 *   instrumentId: "AAPL",
 *   regimeLabel: "BULL_TREND",
 *   indicators: { rsi: 65, volatility: 0.25 },
 * });
 *
 * console.log(`Found ${result.cases.length} similar cases`);
 * console.log(`Win rate: ${result.statistics.winRate}`);
 * ```
 */
export async function retrieveSimilarCases(
	client: HelixClient,
	embeddingClient: EmbeddingClient,
	snapshot: CBRMarketSnapshot,
	options: CBRRetrievalOptions = {}
): Promise<CBRRetrievalResult> {
	const opts = { ...DEFAULT_CBR_OPTIONS, ...options };
	const startTime = performance.now();

	const situationBrief = generateCBRSituationBrief(snapshot);

	const embeddingResult = await embeddingClient.generateEmbedding(situationBrief);
	const queryEmbedding = embeddingResult.values;

	const filters: Record<string, unknown> = {};

	if (opts.filterRegime) {
		filters.regime_label = opts.filterRegime;
	} else {
		filters.regime_label = snapshot.regimeLabel;
	}

	filters.environment = opts.environment;

	if (snapshot.underlyingSymbol) {
		filters.underlying_symbol = snapshot.underlyingSymbol;
	}

	const vectorResults = await executeVectorSearch(
		client,
		situationBrief,
		opts.topK,
		opts.minSimilarity,
		filters
	);

	const cases = vectorResults.map((result) =>
		convertToRetrievedCase(result.decision, result.similarity)
	);

	let filteredCases = cases;

	if (opts.maxAgeDays > 0) {
		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - opts.maxAgeDays);
		filteredCases = filteredCases.filter((c) => new Date(c.asOfTimestamp) >= cutoffDate);
	}

	const statistics = calculateCaseStatistics(filteredCases);

	const executionTimeMs = performance.now() - startTime;

	return {
		cases: filteredCases,
		statistics,
		executionTimeMs,
		queryEmbedding,
		correctionApplied: false,
	};
}

/**
 * Execute vector search against HelixDB using SearchSimilarDecisions query.
 *
 * Note: HelixDB generates embeddings internally using the query text,
 * so we use the situation brief text for similarity search rather than
 * pre-computed embeddings.
 *
 * @param client - HelixDB client
 * @param queryText - Text to search for (situation brief)
 * @param topK - Maximum results to return
 * @param minSimilarity - Minimum similarity threshold
 * @param filters - Optional filters (regime_label, instrument_id, environment)
 * @returns Array of decisions with similarity scores
 */
export async function executeVectorSearch(
	client: HelixClient,
	queryText: string,
	topK: number,
	minSimilarity: number,
	filters: Record<string, unknown>
): Promise<Array<{ decision: TradeDecision; similarity: number }>> {
	try {
		const result = await client.query<SearchSimilarDecisionsResult[]>("SearchSimilarDecisions", {
			query_text: queryText,
			instrument_id: filters.underlying_symbol ?? filters.instrument_id ?? null,
			regime_label: filters.regime_label ?? null,
			limit: topK,
		});

		return result.data
			.filter((r) => r.similarity_score >= minSimilarity)
			.map((r) => ({
				decision: {
					decision_id: r.decision_id,
					cycle_id: r.cycle_id ?? "",
					instrument_id: r.instrument_id,
					underlying_symbol: r.underlying_symbol,
					regime_label: r.regime_label,
					action: r.action as TradeDecision["action"],
					decision_json: r.decision_json ?? "{}",
					rationale_text: r.rationale_text,
					snapshot_reference: r.snapshot_reference ?? "",
					realized_outcome: r.realized_outcome,
					created_at: r.created_at ?? new Date().toISOString(),
					closed_at: r.closed_at,
					environment: r.environment as TradeDecision["environment"],
				},
				similarity: r.similarity_score,
			}));
	} catch (_error) {
		return [];
	}
}
