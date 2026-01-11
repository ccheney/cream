/**
 * CBR Configuration
 *
 * Default options and weights for Case-Based Reasoning operations.
 *
 * @module
 */

import type { CBRRetrievalOptions } from "./types.js";

/**
 * Default options for CBR retrieval.
 */
export const DEFAULT_CBR_OPTIONS: Required<CBRRetrievalOptions> = {
  topK: 10,
  minSimilarity: 0.5,
  includeEvents: false,
  filterRegime: "",
  filterSector: "",
  maxAgeDays: 365,
  environment: "PAPER",
};

/**
 * Feature weights for case similarity calculation.
 * Higher weight = more important for similarity.
 */
export const SIMILARITY_WEIGHTS = {
  regime: 0.3,
  indicators: 0.25,
  sector: 0.15,
  instrument: 0.2,
  recency: 0.1,
} as const;
