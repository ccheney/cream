/**
 * Sentiment Scoring
 *
 * Converts sentiment classifications to numeric scores.
 */

import type { ExtractionResult, Sentiment } from "../types.js";

/**
 * Sentiment score configuration
 */
export interface SentimentScoringConfig {
	/** Base score for bullish sentiment (default: 0.8) */
	bullishBase?: number;
	/** Base score for bearish sentiment (default: -0.8) */
	bearishBase?: number;
	/** Score for neutral sentiment (default: 0.0) */
	neutralBase?: number;
	/** Whether to apply confidence weighting (default: true) */
	applyConfidence?: boolean;
}

const DEFAULT_CONFIG: Required<SentimentScoringConfig> = {
	bullishBase: 0.8,
	bearishBase: -0.8,
	neutralBase: 0.0,
	applyConfidence: true,
};

/**
 * Convert sentiment classification to numeric score
 *
 * @param sentiment - Sentiment classification
 * @param confidence - Confidence level (0-1)
 * @param config - Scoring configuration
 * @returns Sentiment score from -1.0 to 1.0
 */
export function computeSentimentScore(
	sentiment: Sentiment,
	confidence = 1.0,
	config: SentimentScoringConfig = {},
): number {
	const cfg = { ...DEFAULT_CONFIG, ...config };

	// Get base score
	let score: number;
	switch (sentiment) {
		case "bullish":
			score = cfg.bullishBase;
			break;
		case "bearish":
			score = cfg.bearishBase;
			break;
		case "neutral":
			score = cfg.neutralBase;
			break;
		default:
			score = cfg.neutralBase;
	}

	// Apply confidence weighting if enabled
	if (cfg.applyConfidence) {
		// Scale score toward neutral based on confidence
		// At confidence=1.0, full score; at confidence=0.5, half score
		score = score * confidence;
	}

	// Clamp to [-1, 1] range
	return Math.max(-1, Math.min(1, score));
}

/**
 * Compute sentiment score from extraction result
 */
export function computeSentimentFromExtraction(
	extraction: ExtractionResult,
	config?: SentimentScoringConfig,
): number {
	return computeSentimentScore(extraction.sentiment, extraction.confidence, config);
}

/**
 * Aggregate sentiment scores from multiple extractions
 */
export function aggregateSentimentScores(
	scores: number[],
	method: "mean" | "median" | "weighted" = "mean",
	weights?: number[],
): number {
	if (scores.length === 0) {
		return 0;
	}
	if (scores.length === 1) {
		const firstScore = scores[0];
		return firstScore !== undefined ? firstScore : 0;
	}

	const aggregateByMethod: Record<"mean" | "median" | "weighted", (values: number[]) => number> = {
		mean: meanSentimentScores,
		median: medianSentimentScores,
		weighted: (values) => weightedSentimentScores(values, weights),
	};

	return aggregateByMethod[method](scores);
}

function meanSentimentScores(scores: number[]): number {
	return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

function medianSentimentScores(scores: number[]): number {
	const sorted = scores.toSorted((a, b) => a - b);
	const middleIndex = Math.floor(sorted.length / 2);

	if (sorted.length % 2 !== 0) {
		const middleValue = sorted[middleIndex];
		return middleValue !== undefined ? middleValue : 0;
	}

	const middleLeft = sorted[middleIndex - 1];
	const middleRight = sorted[middleIndex];
	if (middleLeft === undefined || middleRight === undefined) {
		return 0;
	}

	return (middleLeft + middleRight) / 2;
}

function weightedSentimentScores(scores: number[], weights?: number[]): number {
	if (!weights || weights.length !== scores.length) {
		return meanSentimentScores(scores);
	}

	const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
	if (totalWeight === 0) {
		return 0;
	}

	return (
		scores.reduce((sum, score, index) => {
			const weight = weights[index];
			return sum + score * (weight !== undefined ? weight : 0);
		}, 0) / totalWeight
	);
}

/**
 * Classify sentiment score into category
 */
export function classifySentimentScore(
	score: number,
): "strong_bullish" | "bullish" | "neutral" | "bearish" | "strong_bearish" {
	if (score >= 0.6) {
		return "strong_bullish";
	}
	if (score >= 0.2) {
		return "bullish";
	}
	if (score > -0.2) {
		return "neutral";
	}
	if (score > -0.6) {
		return "bearish";
	}
	return "strong_bearish";
}

/**
 * Compute sentiment momentum (change over time)
 */
export function computeSentimentMomentum(recentScores: number[], olderScores: number[]): number {
	if (recentScores.length === 0 || olderScores.length === 0) {
		return 0;
	}

	const recentAvg = recentScores.reduce((sum, s) => sum + s, 0) / recentScores.length;
	const olderAvg = olderScores.reduce((sum, s) => sum + s, 0) / olderScores.length;

	return recentAvg - olderAvg;
}
