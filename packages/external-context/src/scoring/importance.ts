/**
 * Importance Scoring
 *
 * Computes importance score based on source credibility, recency, and relevance.
 */

import type { ContentSourceType, ExtractionResult } from "../types.js";

/**
 * Importance scoring configuration
 */
export interface ImportanceScoringConfig {
	/** Weight for source credibility (default: 0.3) */
	credibilityWeight?: number;
	/** Weight for recency (default: 0.3) */
	recencyWeight?: number;
	/** Weight for entity relevance (default: 0.2) */
	relevanceWeight?: number;
	/** Weight for LLM importance rating (default: 0.2) */
	llmWeight?: number;
	/** Recency half-life in hours (default: 24) */
	recencyHalfLife?: number;
}

const DEFAULT_CONFIG: Required<ImportanceScoringConfig> = {
	credibilityWeight: 0.3,
	recencyWeight: 0.3,
	relevanceWeight: 0.2,
	llmWeight: 0.2,
	recencyHalfLife: 24,
};

/**
 * Source credibility scores by source type and specific sources
 */
const SOURCE_CREDIBILITY: Record<string, number> = {
	// Source types
	press_release: 0.9, // Official company sources
	transcript: 0.95, // Official earnings calls
	macro: 0.9, // Government/central bank data

	// News sources (specific)
	"reuters.com": 0.85,
	"bloomberg.com": 0.85,
	"wsj.com": 0.8,
	"cnbc.com": 0.75,
	"marketwatch.com": 0.7,
	"seekingalpha.com": 0.6,
	"benzinga.com": 0.55,
	"prnewswire.com": 0.7, // Press releases
	"businesswire.com": 0.7,
	"globenewswire.com": 0.7,

	// Default for unknown sources
	default: 0.5,
};

/**
 * Compute importance score from multiple factors
 */
export function computeImportanceScore(
	extraction: ExtractionResult,
	sourceType: ContentSourceType,
	source: string,
	eventTime: Date,
	targetSymbols: string[] = [],
	config: ImportanceScoringConfig = {}
): number {
	const cfg = { ...DEFAULT_CONFIG, ...config };

	// 1. Source credibility score
	const credibilityScore = getSourceCredibility(sourceType, source);

	// 2. Recency score (exponential decay)
	const recencyScore = computeRecencyScore(eventTime, cfg.recencyHalfLife);

	// 3. Entity relevance score
	const relevanceScore = computeEntityRelevance(extraction, targetSymbols);

	// 4. LLM importance score (normalized from 1-5 to 0-1)
	const llmScore = extraction.importance !== undefined ? (extraction.importance - 1) / 4 : 0.5;

	// Weighted combination
	const score =
		cfg.credibilityWeight * credibilityScore +
		cfg.recencyWeight * recencyScore +
		cfg.relevanceWeight * relevanceScore +
		cfg.llmWeight * llmScore;

	// Clamp to [0, 1]
	return Math.max(0, Math.min(1, score));
}

/**
 * Get source credibility score
 */
export function getSourceCredibility(sourceType: ContentSourceType, source: string): number {
	const defaultScore = SOURCE_CREDIBILITY.default ?? 0.5;

	// Check source type first
	if (sourceType !== "news") {
		const score = SOURCE_CREDIBILITY[sourceType];
		return score !== undefined ? score : defaultScore;
	}

	// For news, check specific source
	const normalizedSource = source.toLowerCase();

	// Check known sources
	for (const [key, score] of Object.entries(SOURCE_CREDIBILITY)) {
		if (normalizedSource.includes(key)) {
			return score;
		}
	}

	return defaultScore;
}

/**
 * Compute recency score using exponential decay
 */
export function computeRecencyScore(eventTime: Date, halfLifeHours: number): number {
	const now = Date.now();
	const ageHours = (now - eventTime.getTime()) / (1000 * 60 * 60);

	if (ageHours < 0) {
		// Future event - full score
		return 1.0;
	}

	// Exponential decay: score = 0.5^(age/halfLife)
	return 0.5 ** (ageHours / halfLifeHours);
}

/**
 * Compute entity relevance score
 */
export function computeEntityRelevance(
	extraction: ExtractionResult,
	targetSymbols: string[]
): number {
	if (targetSymbols.length === 0) {
		// No target symbols specified, use entity count as proxy
		return Math.min(1, extraction.entities.length / 5);
	}

	// Count how many target symbols are mentioned
	const targetSet = new Set(targetSymbols.map((s) => s.toUpperCase()));
	let matches = 0;

	for (const entity of extraction.entities) {
		if (entity.ticker && targetSet.has(entity.ticker.toUpperCase())) {
			matches++;
		}
		// Also check if entity name matches any symbol
		if (targetSet.has(entity.name.toUpperCase())) {
			matches++;
		}
	}

	return Math.min(1, matches / targetSymbols.length);
}

/**
 * Boost importance based on event type
 */
export function applyEventTypeBoost(baseScore: number, eventType: string): number {
	const boosts: Record<string, number> = {
		earnings: 0.1,
		guidance: 0.15,
		merger_acquisition: 0.2,
		regulatory: 0.1,
		macro_release: 0.1,
		executive_change: 0.05,
		dividend: 0.05,
	};

	const boost = boosts[eventType] ?? 0;
	return Math.min(1, baseScore + boost);
}

/**
 * Classify importance score
 */
export function classifyImportance(
	score: number
): "critical" | "high" | "medium" | "low" | "minimal" {
	if (score >= 0.9) {
		return "critical";
	}
	if (score >= 0.7) {
		return "high";
	}
	if (score >= 0.4) {
		return "medium";
	}
	if (score >= 0.2) {
		return "low";
	}
	return "minimal";
}
