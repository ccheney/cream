/**
 * Market Matcher
 *
 * Matches equivalent markets across prediction market platforms.
 * Uses question similarity and outcome matching to identify the same market
 * on different platforms.
 */

import type { PredictionMarketEvent } from "@cream/domain";

/**
 * Configuration for market matching thresholds
 */
export interface MarketMatcherConfig {
  /** Minimum similarity score to consider markets as potential matches (0-1) */
  minSimilarity: number;
  /** Weight for question text similarity */
  questionWeight: number;
  /** Weight for outcome similarity */
  outcomeWeight: number;
  /** Weight for temporal proximity (same expiration) */
  temporalWeight: number;
}

export const DEFAULT_MATCHER_CONFIG: MarketMatcherConfig = {
  minSimilarity: 0.7,
  questionWeight: 0.5,
  outcomeWeight: 0.3,
  temporalWeight: 0.2,
};

/**
 * Represents a matched market pair across platforms
 */
export interface MatchedMarket {
  marketA: PredictionMarketEvent;
  marketB: PredictionMarketEvent;
  similarity: number;
  priceDivergence: number;
}

/**
 * Market Matcher for finding equivalent markets across platforms
 */
export class MarketMatcher {
  private readonly config: MarketMatcherConfig;

  constructor(config: Partial<MarketMatcherConfig> = {}) {
    this.config = { ...DEFAULT_MATCHER_CONFIG, ...config };
  }

  /**
   * Find matching markets between two sets of market events
   */
  findMatches(
    marketsA: PredictionMarketEvent[],
    marketsB: PredictionMarketEvent[]
  ): MatchedMarket[] {
    const matches: MatchedMarket[] = [];

    for (const marketA of marketsA) {
      for (const marketB of marketsB) {
        // Skip if same platform
        if (marketA.payload.platform === marketB.payload.platform) {
          continue;
        }

        const similarity = this.calculateSimilarity(marketA, marketB);
        if (similarity >= this.config.minSimilarity) {
          const priceDivergence = this.calculatePriceDivergence(marketA, marketB);
          matches.push({
            marketA,
            marketB,
            similarity,
            priceDivergence,
          });
        }
      }
    }

    // Sort by similarity descending
    return matches.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Calculate overall similarity between two markets
   */
  private calculateSimilarity(
    marketA: PredictionMarketEvent,
    marketB: PredictionMarketEvent
  ): number {
    const questionSim = this.questionSimilarity(
      marketA.payload.marketQuestion,
      marketB.payload.marketQuestion
    );
    const outcomeSim = this.outcomeSimilarity(marketA.payload.outcomes, marketB.payload.outcomes);
    const temporalSim = this.temporalSimilarity(marketA.eventTime, marketB.eventTime);

    return (
      questionSim * this.config.questionWeight +
      outcomeSim * this.config.outcomeWeight +
      temporalSim * this.config.temporalWeight
    );
  }

  /**
   * Calculate question text similarity using word overlap
   */
  private questionSimilarity(questionA: string, questionB: string): number {
    const wordsA = this.normalizeText(questionA);
    const wordsB = this.normalizeText(questionB);

    if (wordsA.size === 0 || wordsB.size === 0) {
      return 0;
    }

    // Jaccard similarity using ES2024 Set methods
    return wordsA.intersection(wordsB).size / wordsA.union(wordsB).size;
  }

  /**
   * Normalize text to a set of lowercase words without stopwords
   */
  private normalizeText(text: string): Set<string> {
    const stopwords = new Set([
      "the",
      "a",
      "an",
      "is",
      "are",
      "will",
      "be",
      "in",
      "on",
      "at",
      "to",
      "of",
      "for",
      "by",
      "?",
    ]);

    return new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 1 && !stopwords.has(w))
    );
  }

  /**
   * Calculate outcome similarity based on outcome names
   */
  private outcomeSimilarity(
    outcomesA: PredictionMarketEvent["payload"]["outcomes"],
    outcomesB: PredictionMarketEvent["payload"]["outcomes"]
  ): number {
    if (outcomesA.length === 0 || outcomesB.length === 0) {
      return 0;
    }

    // For binary Yes/No markets, high similarity
    const isBinaryA =
      outcomesA.length === 2 && outcomesA.some((o) => o.outcome.toLowerCase() === "yes");
    const isBinaryB =
      outcomesB.length === 2 && outcomesB.some((o) => o.outcome.toLowerCase() === "yes");

    if (isBinaryA && isBinaryB) {
      return 1.0;
    }

    // For non-binary, compare outcome names
    const namesA = new Set(outcomesA.map((o) => o.outcome.toLowerCase()));
    const namesB = new Set(outcomesB.map((o) => o.outcome.toLowerCase()));

    return namesA.intersection(namesB).size / namesA.union(namesB).size;
  }

  /**
   * Calculate temporal similarity based on expiration dates
   */
  private temporalSimilarity(timeA: string, timeB: string): number {
    try {
      const dateA = new Date(timeA);
      const dateB = new Date(timeB);

      // Difference in days
      const diffDays = Math.abs(dateA.getTime() - dateB.getTime()) / (1000 * 60 * 60 * 24);

      // Same day = 1.0, same week = 0.7, same month = 0.4, otherwise 0
      if (diffDays <= 1) {
        return 1.0;
      }
      if (diffDays <= 7) {
        return 0.7;
      }
      if (diffDays <= 30) {
        return 0.4;
      }
      return 0;
    } catch {
      return 0;
    }
  }

  /**
   * Calculate price divergence between two markets
   * Returns the maximum probability difference across outcomes
   */
  private calculatePriceDivergence(
    marketA: PredictionMarketEvent,
    marketB: PredictionMarketEvent
  ): number {
    // For binary markets, compare Yes probabilities
    const yesA = marketA.payload.outcomes.find(
      (o) => o.outcome.toLowerCase() === "yes"
    )?.probability;
    const yesB = marketB.payload.outcomes.find(
      (o) => o.outcome.toLowerCase() === "yes"
    )?.probability;

    if (yesA !== undefined && yesB !== undefined) {
      return Math.abs(yesA - yesB);
    }

    // For non-binary, compute average divergence across matched outcomes
    let totalDiff = 0;
    let matchCount = 0;

    for (const outcomeA of marketA.payload.outcomes) {
      const outcomeB = marketB.payload.outcomes.find(
        (o) => o.outcome.toLowerCase() === outcomeA.outcome.toLowerCase()
      );
      if (outcomeB) {
        totalDiff += Math.abs(outcomeA.probability - outcomeB.probability);
        matchCount++;
      }
    }

    return matchCount > 0 ? totalDiff / matchCount : 0;
  }
}
