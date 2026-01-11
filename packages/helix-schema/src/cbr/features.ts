/**
 * CBR Similarity Feature Extraction
 *
 * Extracts structured features from market snapshots for hybrid retrieval.
 *
 * @module
 */

import type { CBRMarketSnapshot, SimilarityFeatures } from "./types.js";

/**
 * Extract similarity features from a snapshot.
 *
 * These features are used for hybrid retrieval (combining vector
 * similarity with structured matching).
 */
export function extractSimilarityFeatures(snapshot: CBRMarketSnapshot): SimilarityFeatures {
  let rsiBucket: SimilarityFeatures["rsiBucket"] = "neutral";
  if (snapshot.indicators?.rsi !== undefined) {
    if (snapshot.indicators.rsi < 30) {
      rsiBucket = "oversold";
    } else if (snapshot.indicators.rsi > 70) {
      rsiBucket = "overbought";
    }
  }

  let volatilityBucket: SimilarityFeatures["volatilityBucket"] = "medium";
  if (snapshot.indicators?.volatility !== undefined) {
    if (snapshot.indicators.volatility < 0.15) {
      volatilityBucket = "low";
    } else if (snapshot.indicators.volatility > 0.35) {
      volatilityBucket = "high";
    }
  }

  return {
    regime: snapshot.regimeLabel,
    rsiBucket,
    volatilityBucket,
    sector: snapshot.sector,
    symbol: snapshot.underlyingSymbol ?? snapshot.instrumentId,
  };
}
