/**
 * Orient Phase
 *
 * Memory context loading and regime classification for the trading cycle workflow.
 */

import {
	type CheckIndicatorTriggerInput,
	type CheckIndicatorTriggerOutput,
	checkIndicatorTrigger as evaluateIndicatorTrigger,
} from "@cream/agents";
import type { ExecutionContext } from "@cream/domain";
import { isBacktest } from "@cream/domain";
import { generateSituationBrief, type MarketSnapshot as HelixMarketSnapshot } from "@cream/helix";
import { classifyRegime, type RegimeClassification } from "@cream/regime";

import { getIndicatorsRepo, getRegimeLabelsRepo } from "../../../../db.js";
import {
	type IndicatorSynthesisInput,
	indicatorSynthesisWorkflow,
} from "../../indicator-synthesis/index.js";
import { getEmbeddingClient, getHelixOrchestrator } from "./helix.js";
import { log } from "./logger.js";
import type { IndicatorTriggerResult, MarketSnapshot, MemoryContext, RegimeData } from "./types.js";

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
 * @returns Memory context with relevant cases and initial regime labels
 */
export async function loadMemoryContext(
	snapshot: MarketSnapshot,
	ctx?: ExecutionContext
): Promise<MemoryContext> {
	const regimeLabels: Record<string, RegimeData> = {};
	for (const symbol of snapshot.instruments) {
		regimeLabels[symbol] = {
			regime: "RANGE",
			confidence: 0.3,
			reasoning: "Initial default - pending classification",
		};
	}

	if (ctx && isBacktest(ctx)) {
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

	return {
		relevantCases,
		regimeLabels,
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

	const repoPromise = getRegimeLabelsRepo().catch(() => null);

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

	repoPromise.then(async (repo) => {
		if (!repo) {
			return;
		}

		const timestamp = new Date().toISOString();
		for (const [symbol, data] of Object.entries(regimeLabels)) {
			try {
				await repo.upsert({
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
	});

	return regimeLabels;
}

// ============================================
// Indicator Trigger Detection
// ============================================

/**
 * Covered regimes for indicator synthesis gap detection.
 * These are the regimes that existing indicators are designed for.
 */
const COVERED_REGIMES = new Set(["BULL_TREND", "BEAR_TREND", "RANGE"]);

/**
 * Check if indicator synthesis should be triggered during the Orient phase.
 *
 * Evaluates trigger conditions:
 * - Regime gap: Current regime lacks indicator coverage
 * - IC decay: Existing indicators underperforming (IC < 0.02 for 5+ days)
 *
 * Blocking conditions:
 * - 30-day cooldown since last generation attempt
 * - Similarity threshold: Closest indicator > 0.7 similarity
 * - Capacity: At or above max indicator limit (default 20)
 *
 * @param regimeLabels - Current regime classifications keyed by symbol
 * @param ctx - Execution context for environment detection
 * @returns Indicator trigger result or null for BACKTEST
 *
 * @see docs/plans/36-dynamic-indicator-synthesis-workflow.md
 */
export async function checkIndicatorTrigger(
	regimeLabels: Record<string, RegimeData>,
	ctx?: ExecutionContext
): Promise<IndicatorTriggerResult | null> {
	// Skip in BACKTEST mode
	if (ctx && isBacktest(ctx)) {
		return null;
	}

	try {
		const indicatorsRepo = await getIndicatorsRepo();

		// Get active indicators (paper + production)
		const activeIndicators = await indicatorsRepo.findActive();
		const activeIndicatorCount = activeIndicators.length;

		// Determine primary regime from classified regimes
		const regimes = Object.values(regimeLabels).map((r) => r.regime.toUpperCase());
		const primaryRegime = regimes[0] ?? "RANGE";

		// Detect regime gap - check if primary regime is covered by existing indicators
		const regimeGapDetected = !COVERED_REGIMES.has(primaryRegime);
		const regimeGapDetails = regimeGapDetected
			? `No indicators designed for ${primaryRegime} regime`
			: undefined;

		// Get IC history from last 30 days for all active indicators
		// We aggregate across all indicators to detect portfolio-wide underperformance
		const thirtyDaysAgo = new Date();
		thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
		const startDate = thirtyDaysAgo.toISOString().split("T")[0];

		const icHistory: { date: string; icValue: number }[] = [];

		for (const indicator of activeIndicators) {
			const history = await indicatorsRepo.findICHistoryByIndicatorId(indicator.id, {
				startDate,
				limit: 30,
			});

			for (const entry of history) {
				icHistory.push({
					date: entry.date,
					icValue: entry.icValue,
				});
			}
		}

		// Sort IC history by date (newest first)
		icHistory.sort((a, b) => b.date.localeCompare(a.date));

		// Find last generation attempt timestamp
		// Use the most recent generatedAt from any active indicator
		let lastAttemptAt: string | null = null;
		for (const indicator of activeIndicators) {
			if (indicator.generatedAt && (!lastAttemptAt || indicator.generatedAt > lastAttemptAt)) {
				lastAttemptAt = indicator.generatedAt;
			}
		}

		// Build tool input
		const toolInput: CheckIndicatorTriggerInput = {
			regimeGapDetected,
			currentRegime: primaryRegime,
			regimeGapDetails,
			// Default to 1.0 (high similarity) if no similarity check available
			// TODO: Implement AST similarity check for actual value
			closestIndicatorSimilarity: 1.0,
			icHistory,
			lastAttemptAt,
			activeIndicatorCount,
			maxIndicatorCapacity: 20,
		};

		// Execute the evaluation
		const result: CheckIndicatorTriggerOutput = await evaluateIndicatorTrigger(toolInput);

		log.info(
			{
				shouldTrigger: result.shouldTrigger,
				recommendation: result.recommendation,
				currentRegime: primaryRegime,
				activeIndicatorCount,
				regimeGapDetected,
			},
			"Indicator trigger check completed"
		);

		// Map to IndicatorTriggerResult
		return {
			shouldTrigger: result.shouldTrigger,
			triggerReason: result.evaluation.shouldTrigger ? result.evaluation.summary : null,
			conditions: result.evaluation.conditions,
			summary: result.evaluation.summary,
			recommendation: result.recommendation,
		};
	} catch (error) {
		log.warn(
			{ error: error instanceof Error ? error.message : String(error) },
			"Failed to check indicator trigger"
		);
		return null;
	}
}

// ============================================
// Async Workflow Launch
// ============================================

/**
 * Spawn the indicator synthesis workflow asynchronously (fire-and-forget).
 *
 * This function does NOT block the trading cycle. The synthesis workflow
 * runs in the background while the hourly OODA loop continues.
 *
 * @param triggerResult - Result from checkIndicatorTrigger
 * @param cycleId - Current trading cycle ID
 * @returns void (non-blocking)
 *
 * @see docs/plans/36-dynamic-indicator-synthesis-workflow.md Phase 3, Step 3.1
 */
export function maybeSpawnIndicatorSynthesis(
	triggerResult: IndicatorTriggerResult | null,
	cycleId: string
): void {
	if (!triggerResult?.shouldTrigger) {
		return;
	}

	log.info(
		{
			cycleId,
			triggerReason: triggerResult.triggerReason,
			currentRegime: triggerResult.conditions.currentRegime,
			regimeGapDetected: triggerResult.conditions.regimeGapDetected,
			rollingIC30Day: triggerResult.conditions.rollingIC30Day,
			icDecayDays: triggerResult.conditions.icDecayDays,
			activeIndicatorCount: triggerResult.conditions.activeIndicatorCount,
			recommendation: triggerResult.recommendation,
		},
		"Spawning indicator synthesis workflow"
	);

	const workflowInput: IndicatorSynthesisInput = {
		triggerReason: triggerResult.triggerReason ?? "Unknown trigger",
		currentRegime: triggerResult.conditions.currentRegime,
		regimeGapDetails: triggerResult.conditions.regimeGapDetails,
		rollingIC30Day: triggerResult.conditions.rollingIC30Day,
		icDecayDays: triggerResult.conditions.icDecayDays,
		cycleId,
	};

	indicatorSynthesisWorkflow
		.createRun()
		.then((run) => run.start({ inputData: workflowInput }))
		.then((workflowResult) => {
			if (workflowResult.status === "success") {
				// Access result from successful workflow
				const output = (workflowResult as { result?: Record<string, unknown> }).result as
					| {
							success?: boolean;
							status?: string;
							indicatorName?: string;
					  }
					| undefined;

				log.info(
					{
						cycleId,
						success: output?.success,
						status: output?.status,
						indicatorName: output?.indicatorName,
					},
					"Indicator synthesis workflow completed"
				);
			} else {
				log.warn(
					{
						cycleId,
						status: workflowResult.status,
					},
					"Indicator synthesis workflow ended with non-success status"
				);
			}
		})
		.catch((error) => {
			log.error(
				{
					cycleId,
					error: error instanceof Error ? error.message : String(error),
				},
				"Indicator synthesis workflow failed"
			);
		});
}
