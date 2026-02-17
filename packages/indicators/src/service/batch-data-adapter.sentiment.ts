/**
 * Sentiment Repository Adapter
 */

import type { SentimentIndicators } from "../types";
import type { StorageSentimentRepository } from "./batch-data-adapter.types";
import type { SentimentRepository } from "./indicator-service";

type SentimentClassification =
	| "STRONG_BULLISH"
	| "BULLISH"
	| "NEUTRAL"
	| "BEARISH"
	| "STRONG_BEARISH";

/**
 * Adapts StorageSentimentRepository to SentimentRepository interface.
 * Transforms storage row format to SentimentIndicators.
 */
export class SentimentRepositoryAdapter implements SentimentRepository {
	constructor(private repo: StorageSentimentRepository) {}

	async getLatest(symbol: string): Promise<SentimentIndicators | null> {
		const row = await this.repo.findLatestBySymbol(symbol);
		if (!row) {
			return null;
		}

		return {
			overall_score: row.sentimentScore,
			sentiment_strength: row.sentimentStrength,
			news_volume: row.newsVolume,
			sentiment_momentum: row.sentimentMomentum,
			event_risk: row.eventRiskFlag,
			classification: this.classifySentiment(row.sentimentScore),
		};
	}

	private classifySentiment(score: number | null): SentimentClassification | null {
		if (score === null) {
			return null;
		}
		if (score >= 0.6) {
			return "STRONG_BULLISH";
		}
		if (score >= 0.2) {
			return "BULLISH";
		}
		if (score >= -0.2) {
			return "NEUTRAL";
		}
		if (score >= -0.6) {
			return "BEARISH";
		}
		return "STRONG_BEARISH";
	}
}

/**
 * Create a SentimentRepository adapter from a storage repository.
 */
export function createSentimentRepositoryAdapter(
	repo: StorageSentimentRepository,
): SentimentRepository {
	return new SentimentRepositoryAdapter(repo);
}
