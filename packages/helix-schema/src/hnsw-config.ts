/**
 * HNSW Vector Index Configuration for HelixDB
 *
 * HNSW (Hierarchical Navigable Small World) is the algorithm HelixDB uses
 * for approximate nearest neighbor search. This module provides configuration
 * schemas and tuning profiles optimized for different use cases.
 *
 * ## Parameter Trade-offs
 *
 * ### M (Max connections per node)
 * - Higher M → Better recall, more memory usage
 * - M=16: Industry standard, balanced performance
 * - M=24-32: +50-100% memory, improved recall
 * - M=8-12: Memory savings, -3-8% recall
 *
 * ### efConstruction (Build-time search width)
 * - Higher value → Better graph quality, longer build time
 * - Doubling efConstruction can quadruple build time
 * - Affects index quality permanently (reindex required to change)
 *
 * ### efSearch (Query-time search width)
 * - Higher value → Better recall, slower queries
 * - Can be adjusted per-query without reindexing
 * - efSearch=32: ~50% faster, -2-5% recall
 * - efSearch=128: +2-4% recall, 2x query time
 *
 * @see docs/plans/04-memory-helixdb.md for full specification
 * @see https://opensearch.org/blog/a-practical-guide-to-selecting-hnsw-hyperparameters/
 * @see https://www.pinecone.io/learn/series/faiss/hnsw/
 */

import { z } from "zod/v4";

// ============================================
// Distance Metric
// ============================================

/**
 * Supported distance metrics for vector similarity
 */
export const DistanceMetric = z.enum(["cosine", "euclidean", "dot_product"]);
export type DistanceMetric = z.infer<typeof DistanceMetric>;

/**
 * Distance metric recommendations:
 * - cosine: Standard for normalized text embeddings (recommended for Gemini)
 * - euclidean: L2 distance, good for image embeddings
 * - dot_product: Fast, requires pre-normalized vectors (equivalent to cosine if normalized)
 */
export const DISTANCE_METRIC_NOTES: Record<DistanceMetric, string> = {
  cosine: "Standard for text embeddings (Gemini, OpenAI). Range: [0, 2] where 0 = identical",
  euclidean: "L2 distance. Good for image embeddings. Range: [0, ∞) where 0 = identical",
  dot_product: "Inner product. Requires normalized vectors. Range: [-1, 1] where 1 = identical",
};

// ============================================
// HNSW Configuration Schema
// ============================================

/**
 * HNSW index configuration schema
 */
export const HnswConfigSchema = z.object({
  /**
   * Maximum number of connections per node (M parameter)
   *
   * - Default: 16 (industry standard)
   * - Valid range: 4-64
   * - Higher = better recall, more memory
   */
  m: z
    .number()
    .int()
    .min(4)
    .max(64)
    .default(16)
    .describe("Max connections per node. Higher = better recall, more memory"),

  /**
   * Build-time search width (efConstruction)
   *
   * - Default: 128
   * - Valid range: 16-512
   * - Higher = better graph quality, longer build time
   * - Affects index quality permanently (requires reindex to change)
   */
  efConstruction: z
    .number()
    .int()
    .min(16)
    .max(512)
    .default(128)
    .describe("Build-time search width. Higher = better quality, slower build"),

  /**
   * Query-time search width (efSearch)
   *
   * - Default: 64
   * - Valid range: 16-256
   * - Higher = better recall, slower queries
   * - Can be adjusted per-query without reindexing
   */
  efSearch: z
    .number()
    .int()
    .min(16)
    .max(256)
    .default(64)
    .describe("Query-time search width. Higher = better recall, slower queries"),

  /**
   * Distance metric for similarity computation
   *
   * - Default: cosine (standard for text embeddings)
   */
  metric: DistanceMetric.default("cosine").describe("Distance metric for similarity computation"),
});

export type HnswConfig = z.infer<typeof HnswConfigSchema>;

// ============================================
// Tuning Profile Names
// ============================================

/**
 * Available tuning profile names
 */
export const TuningProfileName = z.enum([
  "balanced",
  "max_recall",
  "low_latency",
  "memory_constrained",
]);
export type TuningProfileName = z.infer<typeof TuningProfileName>;

// ============================================
// Tuning Profile Schema
// ============================================

/**
 * Tuning profile with description and expected performance
 */
export const TuningProfileSchema = z.object({
  name: TuningProfileName,
  description: z.string(),
  config: HnswConfigSchema,
  expectedRecall: z
    .object({
      min: z.number().min(0).max(100),
      max: z.number().min(0).max(100),
    })
    .describe("Expected recall percentage at k=10"),
  expectedLatencyMs: z
    .object({
      p50: z.number().positive().optional(),
      p99: z.number().positive().optional(),
    })
    .describe("Expected query latency in milliseconds"),
  memoryMultiplier: z.number().positive().describe("Memory usage relative to balanced profile"),
  buildTimeMultiplier: z.number().positive().describe("Build time relative to balanced profile"),
});

export type TuningProfile = z.infer<typeof TuningProfileSchema>;

// ============================================
// Default Configuration
// ============================================

/**
 * Default HNSW configuration (balanced profile)
 *
 * Industry-standard values providing good balance of:
 * - ~90-95% recall at k=10
 * - ~2ms query latency
 * - Reasonable memory usage
 */
export const DEFAULT_HNSW_CONFIG: HnswConfig = {
  m: 16,
  efConstruction: 128,
  efSearch: 64,
  metric: "cosine",
};

// ============================================
// Tuning Profiles
// ============================================

/**
 * Pre-defined tuning profiles for different use cases
 */
export const TUNING_PROFILES: Record<TuningProfileName, TuningProfile> = {
  /**
   * Balanced profile (default)
   *
   * Good for most production use cases. Provides solid recall
   * with acceptable latency and memory usage.
   */
  balanced: {
    name: "balanced",
    description: "Industry-standard balanced configuration for general use",
    config: {
      m: 16,
      efConstruction: 128,
      efSearch: 64,
      metric: "cosine",
    },
    expectedRecall: { min: 90, max: 95 },
    expectedLatencyMs: { p50: 2, p99: 5 },
    memoryMultiplier: 1.0,
    buildTimeMultiplier: 1.0,
  },

  /**
   * Maximum recall profile
   *
   * Use for research, analysis, or when accuracy is critical.
   * Trades latency and memory for highest possible recall.
   */
  max_recall: {
    name: "max_recall",
    description: "Optimized for maximum accuracy (research/analysis)",
    config: {
      m: 24,
      efConstruction: 256,
      efSearch: 128,
      metric: "cosine",
    },
    expectedRecall: { min: 95, max: 98 },
    expectedLatencyMs: { p50: 4, p99: 10 },
    memoryMultiplier: 1.5, // +50% memory
    buildTimeMultiplier: 4.0, // 4x build time
  },

  /**
   * Low latency profile
   *
   * Use for real-time trading decisions where speed is critical.
   * Sacrifices some recall for sub-millisecond queries.
   */
  low_latency: {
    name: "low_latency",
    description: "Optimized for speed (real-time trading)",
    config: {
      m: 12,
      efConstruction: 100,
      efSearch: 32,
      metric: "cosine",
    },
    expectedRecall: { min: 85, max: 92 },
    expectedLatencyMs: { p50: 0.5, p99: 1 },
    memoryMultiplier: 0.75, // -25% memory
    buildTimeMultiplier: 0.6, // faster build
  },

  /**
   * Memory-constrained profile
   *
   * Use when memory is limited. Significant reduction in memory
   * usage with acceptable recall for most use cases.
   */
  memory_constrained: {
    name: "memory_constrained",
    description: "Minimizes memory usage (resource-limited environments)",
    config: {
      m: 8,
      efConstruction: 64,
      efSearch: 32,
      metric: "cosine",
    },
    expectedRecall: { min: 80, max: 88 },
    expectedLatencyMs: { p50: 1, p99: 3 },
    memoryMultiplier: 0.3, // 70-80% reduction
    buildTimeMultiplier: 0.25, // much faster build
  },
};

// ============================================
// Configuration Selection
// ============================================

/**
 * Environment-to-profile mapping
 */
export const ENVIRONMENT_PROFILE_MAP: Record<string, TuningProfileName> = {
  development: "balanced",
  test: "memory_constrained",
  staging: "balanced",
  production: "balanced",
  research: "max_recall",
  trading: "low_latency",
};

/**
 * Get HNSW config for an environment
 *
 * @param environment - Environment name (development, production, etc.)
 * @returns HNSW configuration
 */
export function getConfigForEnvironment(environment: string): HnswConfig {
  const profileName = ENVIRONMENT_PROFILE_MAP[environment.toLowerCase()] ?? "balanced";
  return TUNING_PROFILES[profileName].config;
}

/**
 * Get tuning profile by name
 *
 * @param name - Profile name
 * @returns Tuning profile or undefined if not found
 */
export function getTuningProfile(name: TuningProfileName): TuningProfile {
  return TUNING_PROFILES[name];
}

/**
 * List all available tuning profiles
 */
export function listTuningProfiles(): TuningProfile[] {
  return Object.values(TUNING_PROFILES);
}

// ============================================
// Validation
// ============================================

/**
 * Validate HNSW configuration
 *
 * @param config - Configuration to validate
 * @returns Validation result with warnings
 */
export function validateHnswConfig(config: HnswConfig): {
  valid: boolean;
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Validate M parameter
  if (config.m < 4) {
    errors.push("M must be at least 4 for reasonable graph connectivity");
  } else if (config.m < 8) {
    warnings.push("M < 8 may result in poor recall. Consider using M >= 8");
  } else if (config.m > 32) {
    warnings.push("M > 32 significantly increases memory usage with diminishing returns");
  }

  // Validate efConstruction
  if (config.efConstruction < config.m) {
    errors.push("efConstruction should be >= M for proper graph construction");
  }
  if (config.efConstruction < 64) {
    warnings.push("efConstruction < 64 may result in suboptimal graph quality");
  }

  // Validate efSearch
  if (config.efSearch < 16) {
    warnings.push("efSearch < 16 may result in very poor recall");
  }
  if (config.efSearch > config.efConstruction) {
    warnings.push(
      "efSearch > efConstruction provides diminishing returns (graph quality limits recall)"
    );
  }

  // Validate metric
  if (config.metric === "dot_product") {
    warnings.push("dot_product requires pre-normalized vectors. Verify embeddings are normalized");
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

// ============================================
// Query-time efSearch adjustment
// ============================================

/**
 * Adjust efSearch for a specific query based on required recall
 *
 * This allows per-query tuning without reindexing.
 *
 * @param baseEfSearch - Base efSearch value from config
 * @param requiredRecall - Required recall percentage (0-100)
 * @returns Adjusted efSearch value
 */
export function adjustEfSearchForRecall(baseEfSearch: number, requiredRecall: number): number {
  if (requiredRecall <= 85) {
    return Math.max(16, Math.floor(baseEfSearch * 0.5)); // Faster queries
  }
  if (requiredRecall <= 90) {
    return baseEfSearch; // Use base value
  }
  if (requiredRecall <= 95) {
    return Math.min(256, Math.floor(baseEfSearch * 1.5)); // Improved recall
  }
  // requiredRecall > 95
  return Math.min(256, baseEfSearch * 2); // Maximum recall
}

// ============================================
// Exports for config.hx.json generation
// ============================================

/**
 * Generate config.hx.json vector_index section
 *
 * @param config - HNSW configuration
 * @returns JSON object for config file
 */
export function generateVectorIndexConfig(config: HnswConfig = DEFAULT_HNSW_CONFIG): object {
  return {
    vector_index: {
      algorithm: "hnsw",
      parameters: {
        m: config.m,
        ef_construction: config.efConstruction,
        ef_search: config.efSearch,
      },
      distance_metric: config.metric,
    },
  };
}
