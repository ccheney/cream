/**
 * Sentiment Aggregation Batch Job
 *
 * Aggregates sentiment data from external-context package sources
 * and stores in the sentiment_indicators table via SentimentRepository.
 *
 * Runs nightly to calculate:
 * - Aggregate sentiment scores from news sources
 * - Sentiment momentum (7-day vs 30-day comparison)
 * - Sentiment strength (confidence-weighted)
 * - Event risk detection (earnings, guidance, M&A, etc.)
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

import type { CreateSentimentInput, SentimentRepository } from "@cream/storage";
import { log } from "../logger.js";
import type { BatchJobResult } from "./types.js";

// ============================================
// Types
// ============================================

/**
 * Raw sentiment classification from external-context extraction.
 * Note: Different from the 5-level SentimentClassification in types/ which is
 * used for final indicator output.
 */
export type RawSentimentClassification = "bullish" | "bearish" | "neutral";

/**
 * Event type for risk detection
 */
export type EventType =
	| "earnings"
	| "guidance"
	| "analyst_update"
	| "product_launch"
	| "merger_acquisition"
	| "leadership_change"
	| "regulatory"
	| "other";

/**
 * Individual extracted sentiment data point
 */
export interface ExtractedSentiment {
	/** Stock symbol */
	symbol: string;
	/** Source type */
	sourceType: "news" | "transcript" | "press_release" | "social";
	/** Sentiment classification */
	sentiment: RawSentimentClassification;
	/** Confidence in the classification (0-1) */
	confidence: number;
	/** Event type for risk detection */
	eventType?: EventType;
	/** Event timestamp */
	eventTime: Date;
	/** Importance score (1-5) */
	importance?: number;
}

/**
 * Aggregated sentiment data for a symbol on a specific date
 */
export interface AggregatedSentiment {
	/** Stock symbol */
	symbol: string;
	/** Date (YYYY-MM-DD) */
	date: string;
	/** Overall sentiment score (-1.0 to 1.0) */
	sentimentScore: number | null;
	/** Sentiment strength (0-1, based on confidence and volume) */
	sentimentStrength: number | null;
	/** Number of sentiment data points */
	newsVolume: number;
	/** Sentiment momentum (7d vs 30d) */
	sentimentMomentum: number | null;
	/** Event risk flag (upcoming earnings, M&A, etc.) */
	eventRiskFlag: boolean;
	/** News-specific sentiment */
	newsSentiment: number | null;
	/** Social media sentiment (if available) */
	socialSentiment: number | null;
	/** Analyst sentiment (if available) */
	analystSentiment: number | null;
}

/**
 * Sentiment data provider interface for dependency injection.
 * Abstracts the external-context package for testing.
 */
export interface SentimentDataProvider {
	/**
	 * Get extracted sentiment data for symbols within a date range.
	 * @param symbols Array of stock symbols
	 * @param startDate Start date (YYYY-MM-DD)
	 * @param endDate End date (YYYY-MM-DD)
	 * @returns Array of extracted sentiment data points
	 */
	getSentimentData(
		symbols: string[],
		startDate: string,
		endDate: string,
	): Promise<ExtractedSentiment[]>;

	/**
	 * Get historical sentiment for momentum calculation.
	 * @param symbol Stock symbol
	 * @param lookbackDays Number of days to look back
	 * @returns Array of daily sentiment scores
	 */
	getHistoricalSentiment(
		symbol: string,
		lookbackDays: number,
	): Promise<Array<{ date: string; score: number }>>;
}

/**
 * Batch job configuration
 */
export interface SentimentBatchJobConfig {
	/** Rate limit delay between API calls in ms (default: 100ms) */
	rateLimitDelayMs?: number;
	/** Max retries per API call (default: 3) */
	maxRetries?: number;
	/** Retry delay in ms (default: 1000) */
	retryDelayMs?: number;
	/** Continue on individual symbol errors (default: true) */
	continueOnError?: boolean;
	/** Short-term window for momentum (default: 7 days) */
	shortTermDays?: number;
	/** Long-term window for momentum (default: 30 days) */
	longTermDays?: number;
}

/**
 * Sentiment scoring configuration
 */
export interface SentimentScoringConfig {
	/** Base score for bullish sentiment (default: 0.8) */
	bullishBase?: number;
	/** Base score for bearish sentiment (default: -0.8) */
	bearishBase?: number;
	/** Base score for neutral sentiment (default: 0.0) */
	neutralBase?: number;
	/** Whether to apply confidence weighting (default: true) */
	applyConfidence?: boolean;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Convert sentiment classification to numeric score.
 *
 * @param sentiment Sentiment classification
 * @param confidence Confidence level (0-1)
 * @param config Scoring configuration
 * @returns Numeric score (-1.0 to 1.0)
 */
export function computeSentimentScore(
	sentiment: RawSentimentClassification,
	confidence: number,
	config: SentimentScoringConfig = {},
): number {
	const {
		bullishBase = 0.8,
		bearishBase = -0.8,
		neutralBase = 0.0,
		applyConfidence = true,
	} = config;

	let baseScore: number;
	switch (sentiment) {
		case "bullish":
			baseScore = bullishBase;
			break;
		case "bearish":
			baseScore = bearishBase;
			break;
		default:
			baseScore = neutralBase;
	}

	if (applyConfidence) {
		return baseScore * confidence;
	}
	return baseScore;
}

/**
 * Calculate recency weight for a sentiment data point.
 * Uses exponential decay with configurable half-life.
 *
 * @param eventTime Event timestamp
 * @param referenceTime Reference time (usually now)
 * @param halfLifeHours Half-life in hours (default: 24)
 * @returns Weight between 0 and 1
 */
export function calculateRecencyWeight(
	eventTime: Date,
	referenceTime: Date,
	halfLifeHours = 24,
): number {
	const ageMs = referenceTime.getTime() - eventTime.getTime();
	const ageHours = ageMs / (1000 * 60 * 60);
	return 0.5 ** (ageHours / halfLifeHours);
}

/**
 * Aggregate multiple sentiment scores using weighted average.
 *
 * @param scores Array of scores with weights
 * @returns Weighted average score or null if no scores
 */
export function aggregateSentimentScores(
	scores: Array<{ score: number; weight: number }>,
): number | null {
	if (scores.length === 0) {
		return null;
	}

	const totalWeight = scores.reduce((sum, s) => sum + s.weight, 0);
	if (totalWeight === 0) {
		return null;
	}

	const weightedSum = scores.reduce((sum, s) => sum + s.score * s.weight, 0);
	return weightedSum / totalWeight;
}

/**
 * Calculate sentiment strength based on confidence and volume.
 *
 * @param scores Array of sentiment data points
 * @returns Strength score (0-1) or null if no data
 */
export function calculateSentimentStrength(
	scores: Array<{ confidence: number; weight: number }>,
): number | null {
	if (scores.length === 0) {
		return null;
	}

	// Weighted average of confidences
	const totalWeight = scores.reduce((sum, s) => sum + s.weight, 0);
	if (totalWeight === 0) {
		return null;
	}

	const weightedConfidence = scores.reduce((sum, s) => sum + s.confidence * s.weight, 0);
	const avgConfidence = weightedConfidence / totalWeight;

	// Volume factor: diminishing returns after 10 data points
	const volumeFactor = Math.min(1, Math.log10(scores.length + 1) / Math.log10(11));

	return avgConfidence * (0.5 + 0.5 * volumeFactor);
}

/**
 * Calculate sentiment momentum (short-term vs long-term).
 *
 * @param shortTermScores Recent scores (e.g., 7 days)
 * @param longTermScores Longer-term scores (e.g., 30 days)
 * @returns Momentum value (positive = improving, negative = declining)
 */
export function calculateSentimentMomentum(
	shortTermScores: number[],
	longTermScores: number[],
): number | null {
	if (shortTermScores.length === 0 || longTermScores.length === 0) {
		return null;
	}

	const shortTermAvg = shortTermScores.reduce((a, b) => a + b, 0) / shortTermScores.length;
	const longTermAvg = longTermScores.reduce((a, b) => a + b, 0) / longTermScores.length;

	return shortTermAvg - longTermAvg;
}

/**
 * Detect event risk from extracted sentiments.
 * Returns true if there are high-importance events that could cause volatility.
 *
 * @param sentiments Array of extracted sentiment data
 * @returns Whether event risk is detected
 */
export function detectEventRisk(sentiments: ExtractedSentiment[]): boolean {
	const riskEventTypes: EventType[] = [
		"earnings",
		"guidance",
		"merger_acquisition",
		"leadership_change",
		"regulatory",
	];

	return sentiments.some(
		(s) => s.eventType && riskEventTypes.includes(s.eventType) && (s.importance ?? 0) >= 3,
	);
}

// ============================================
// Batch Job Class
// ============================================

/**
 * Batch job for aggregating and storing sentiment data.
 *
 * @example
 * ```typescript
 * const job = new SentimentAggregationJob(dataProvider, repository);
 * const result = await job.run(symbols, "2024-01-15");
 * console.log(`Processed ${result.processed}, Failed ${result.failed}`);
 * ```
 */
export class SentimentAggregationJob {
	private readonly provider: SentimentDataProvider;
	private readonly repo: SentimentRepository;
	private readonly config: Required<SentimentBatchJobConfig>;
	private readonly scoringConfig: SentimentScoringConfig;

	constructor(
		provider: SentimentDataProvider,
		repo: SentimentRepository,
		config?: SentimentBatchJobConfig,
		scoringConfig?: SentimentScoringConfig,
	) {
		this.provider = provider;
		this.repo = repo;
		this.config = {
			rateLimitDelayMs: config?.rateLimitDelayMs ?? 100,
			maxRetries: config?.maxRetries ?? 3,
			retryDelayMs: config?.retryDelayMs ?? 1000,
			continueOnError: config?.continueOnError ?? true,
			shortTermDays: config?.shortTermDays ?? 7,
			longTermDays: config?.longTermDays ?? 30,
		};
		this.scoringConfig = scoringConfig ?? {};
	}

	/**
	 * Run batch job for a list of symbols on a specific date.
	 *
	 * @param symbols List of stock symbols to process
	 * @param date Target date (YYYY-MM-DD)
	 * @returns Batch job result with processed/failed counts
	 */
	async run(symbols: string[], date: string): Promise<BatchJobResult> {
		const startTime = Date.now();
		let processed = 0;
		let failed = 0;
		const errors: Array<{ symbol: string; error: string }> = [];

		log.info({ symbolCount: symbols.length, date }, "Starting sentiment aggregation batch job");

		for (let i = 0; i < symbols.length; i++) {
			const symbol = symbols[i];
			if (!symbol) {
				continue;
			}

			const upperSymbol = symbol.toUpperCase();

			try {
				await this.processSymbol(upperSymbol, date);
				processed++;
				log.debug({ symbol: upperSymbol, processed, total: symbols.length }, "Processed symbol");
			} catch (error) {
				failed++;
				const errorMessage = error instanceof Error ? error.message : String(error);
				errors.push({ symbol: upperSymbol, error: errorMessage });
				log.warn({ symbol: upperSymbol, error: errorMessage }, "Failed to process symbol");

				if (!this.config.continueOnError) {
					throw error;
				}
			}

			// Rate limiting
			if (i < symbols.length - 1) {
				await sleep(this.config.rateLimitDelayMs);
			}
		}

		const durationMs = Date.now() - startTime;
		log.info({ processed, failed, durationMs }, "Completed sentiment aggregation batch job");

		return { processed, failed, errors, durationMs };
	}

	/**
	 * Process a single symbol and store aggregated sentiment.
	 */
	private async processSymbol(symbol: string, date: string): Promise<void> {
		// Look back 3 days to capture recent news (not every symbol has news daily)
		const startDate = new Date(date);
		startDate.setDate(startDate.getDate() - 3);
		const startDateStr = startDate.toISOString().split("T")[0] ?? date;

		// Fetch sentiment data for the lookback window
		const sentimentData = await this.fetchSentimentWithRetry([symbol], startDateStr, date);

		// Filter to only this symbol
		const symbolData = sentimentData.filter((s) => s.symbol.toUpperCase() === symbol);

		// Aggregate sentiment
		const aggregated = await this.aggregateSentiment(symbol, date, symbolData);

		// Build input for repository
		const input: CreateSentimentInput = {
			symbol,
			date,
			sentimentScore: aggregated.sentimentScore,
			sentimentStrength: aggregated.sentimentStrength,
			newsVolume: aggregated.newsVolume,
			sentimentMomentum: aggregated.sentimentMomentum,
			eventRiskFlag: aggregated.eventRiskFlag,
			newsSentiment: aggregated.newsSentiment,
			socialSentiment: aggregated.socialSentiment,
			analystSentiment: aggregated.analystSentiment,
		};

		// Upsert to handle duplicate dates
		await this.repo.upsert(input);
	}

	/**
	 * Aggregate sentiment data for a symbol.
	 */
	private async aggregateSentiment(
		symbol: string,
		date: string,
		sentimentData: ExtractedSentiment[],
	): Promise<AggregatedSentiment> {
		const referenceTime = new Date(date);
		referenceTime.setHours(23, 59, 59, 999); // End of day

		// Calculate scores with recency weights
		const newsScores: Array<{ score: number; weight: number; confidence: number }> = [];
		const socialScores: Array<{ score: number; weight: number; confidence: number }> = [];
		const analystScores: Array<{ score: number; weight: number; confidence: number }> = [];

		for (const sentiment of sentimentData) {
			const score = computeSentimentScore(
				sentiment.sentiment,
				sentiment.confidence,
				this.scoringConfig,
			);
			const weight = calculateRecencyWeight(sentiment.eventTime, referenceTime);

			const entry = { score, weight, confidence: sentiment.confidence };

			switch (sentiment.sourceType) {
				case "news":
				case "press_release":
				case "transcript":
					newsScores.push(entry);
					break;
				case "social":
					socialScores.push(entry);
					break;
			}

			// Analyst updates are also tracked separately
			if (sentiment.eventType === "analyst_update") {
				analystScores.push(entry);
			}
		}

		// Combine all scores for overall sentiment
		const allScores = [...newsScores, ...socialScores, ...analystScores];

		// Calculate aggregate values
		const sentimentScore = aggregateSentimentScores(allScores);
		const sentimentStrength = calculateSentimentStrength(allScores);

		// Calculate sentiment momentum
		const sentimentMomentum = await this.calculateMomentum(symbol, date);

		// Detect event risk
		const eventRiskFlag = detectEventRisk(sentimentData);

		return {
			symbol,
			date,
			sentimentScore,
			sentimentStrength,
			newsVolume: sentimentData.length,
			sentimentMomentum,
			eventRiskFlag,
			newsSentiment: aggregateSentimentScores(newsScores),
			socialSentiment: aggregateSentimentScores(socialScores),
			analystSentiment: aggregateSentimentScores(analystScores),
		};
	}

	/**
	 * Calculate sentiment momentum for a symbol.
	 */
	private async calculateMomentum(symbol: string, date: string): Promise<number | null> {
		try {
			const historical = await this.provider.getHistoricalSentiment(
				symbol,
				this.config.longTermDays,
			);

			if (historical.length < this.config.shortTermDays) {
				return null;
			}

			const dateObj = new Date(date);
			const shortTermCutoff = new Date(dateObj);
			shortTermCutoff.setDate(shortTermCutoff.getDate() - this.config.shortTermDays);

			const shortTermScores: number[] = [];
			const longTermScores: number[] = [];

			for (const entry of historical) {
				const entryDate = new Date(entry.date);
				longTermScores.push(entry.score);

				if (entryDate >= shortTermCutoff) {
					shortTermScores.push(entry.score);
				}
			}

			return calculateSentimentMomentum(shortTermScores, longTermScores);
		} catch {
			// If historical data is unavailable, return null
			return null;
		}
	}

	/**
	 * Fetch sentiment data with retry logic.
	 */
	private async fetchSentimentWithRetry(
		symbols: string[],
		startDate: string,
		endDate: string,
	): Promise<ExtractedSentiment[]> {
		let lastError: Error | null = null;

		for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
			try {
				return await this.provider.getSentimentData(symbols, startDate, endDate);
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));
				if (attempt < this.config.maxRetries) {
					const delay = this.config.retryDelayMs * (attempt + 1);
					log.warn({ attempt, delay, error: lastError.message }, "Retrying sentiment fetch");
					await sleep(delay);
				}
			}
		}

		throw lastError ?? new Error("Failed to fetch sentiment data");
	}
}
