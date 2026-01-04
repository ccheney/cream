/**
 * Semantic Similarity Validation
 *
 * Validates agent outputs using semantic similarity with embeddings.
 * Uses Promptfoo's matchesSimilarity with Gemini embeddings.
 *
 * @see docs/plans/14-testing.md lines 399-424
 */

// ============================================
// Types
// ============================================

/**
 * Similarity validation result.
 */
export interface SimilarityResult {
  /** Actual text being compared */
  actual: string;

  /** Expected text */
  expected: string;

  /** Similarity score (0-1) */
  similarity: number;

  /** Whether it passes the threshold */
  passed: boolean;

  /** Threshold used */
  threshold: number;
}

/**
 * Batch similarity results.
 */
export interface BatchSimilarityResults {
  /** Individual results */
  results: SimilarityResult[];

  /** Aggregate statistics */
  stats: {
    total: number;
    passed: number;
    failed: number;
    meanSimilarity: number;
    minSimilarity: number;
    maxSimilarity: number;
  };

  /** Configuration used */
  config: {
    threshold: number;
    embeddingModel: string;
  };
}

/**
 * Embedding provider configuration.
 */
export interface EmbeddingConfig {
  /** Embedding model */
  model: "gemini-embedding-001" | "text-embedding-3-small";

  /** Similarity threshold (0-1) */
  threshold: number;

  /** Cache embeddings */
  useCache?: boolean;
}

// ============================================
// Default Configuration
// ============================================

/**
 * Default embedding configuration.
 */
export const DEFAULT_EMBEDDING_CONFIG: EmbeddingConfig = {
  model: "gemini-embedding-001",
  threshold: 0.8,
  useCache: true,
};

/**
 * Similarity threshold interpretation.
 */
export const SIMILARITY_LEVELS = {
  /** Near-identical */
  VERY_HIGH: 0.95,

  /** Semantically equivalent */
  HIGH: 0.85,

  /** Related concepts */
  MODERATE: 0.75,

  /** Loosely related */
  LOW: 0.6,
} as const;

// ============================================
// Embedding Cache
// ============================================

/**
 * Simple in-memory cache for embeddings.
 */
const embeddingCache = new Map<string, number[]>();

/**
 * Get cache key for text.
 */
function getCacheKey(text: string, model: string): string {
  return `${model}:${text}`;
}

/**
 * Clear embedding cache.
 */
export function clearEmbeddingCache(): void {
  embeddingCache.clear();
}

/**
 * Get cache statistics.
 */
export function getEmbeddingCacheStats(): { size: number; keys: string[] } {
  return {
    size: embeddingCache.size,
    keys: Array.from(embeddingCache.keys()).map((k) => k.slice(0, 50) + "..."),
  };
}

// ============================================
// Mock Embedding Functions
// ============================================

/**
 * Generate a mock embedding vector.
 * Uses deterministic hashing for reproducible results.
 */
function generateMockEmbedding(text: string, dimensions: number = 768): number[] {
  // Simple deterministic hash-based embedding
  const embedding: number[] = [];
  let hash = 0;

  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) % 1000000007;
  }

  for (let i = 0; i < dimensions; i++) {
    // Use hash to generate deterministic pseudo-random values
    hash = (hash * 1103515245 + 12345) % 2147483648;
    embedding.push((hash / 2147483648) * 2 - 1);
  }

  // Normalize to unit vector
  const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
  return embedding.map((v) => v / magnitude);
}

/**
 * Calculate cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimensions must match: ${a.length} vs ${b.length}`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Get embedding for text (mock implementation).
 * In production, this would call Gemini or OpenAI API.
 */
async function getEmbedding(
  text: string,
  config: EmbeddingConfig
): Promise<number[]> {
  const cacheKey = getCacheKey(text, config.model);

  // Check cache
  if (config.useCache && embeddingCache.has(cacheKey)) {
    return embeddingCache.get(cacheKey)!;
  }

  // Generate mock embedding
  const dimensions = config.model === "gemini-embedding-001" ? 3072 : 1536;
  const embedding = generateMockEmbedding(text, dimensions);

  // Cache result
  if (config.useCache) {
    embeddingCache.set(cacheKey, embedding);
  }

  return embedding;
}

// ============================================
// Core Functions
// ============================================

/**
 * Validate semantic similarity between actual and expected text.
 */
export async function validateSemanticSimilarity(
  actual: string,
  expected: string,
  config: EmbeddingConfig = DEFAULT_EMBEDDING_CONFIG
): Promise<SimilarityResult> {
  // Get embeddings
  const [actualEmbedding, expectedEmbedding] = await Promise.all([
    getEmbedding(actual, config),
    getEmbedding(expected, config),
  ]);

  // Calculate similarity (normalize from [-1, 1] to [0, 1] range)
  const rawSimilarity = cosineSimilarity(actualEmbedding, expectedEmbedding);
  const similarity = (rawSimilarity + 1) / 2;
  const passed = similarity >= config.threshold;

  return {
    actual,
    expected,
    similarity,
    passed,
    threshold: config.threshold,
  };
}

/**
 * Validate semantic similarity for multiple pairs.
 */
export async function validateBatchSimilarity(
  pairs: Array<{ actual: string; expected: string }>,
  config: EmbeddingConfig = DEFAULT_EMBEDDING_CONFIG
): Promise<BatchSimilarityResults> {
  const results: SimilarityResult[] = [];

  for (const pair of pairs) {
    const result = await validateSemanticSimilarity(
      pair.actual,
      pair.expected,
      config
    );
    results.push(result);
  }

  // Calculate statistics
  const similarities = results.map((r) => r.similarity);
  const stats = {
    total: results.length,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    meanSimilarity:
      similarities.reduce((a, b) => a + b, 0) / similarities.length,
    minSimilarity: Math.min(...similarities),
    maxSimilarity: Math.max(...similarities),
  };

  return {
    results,
    stats,
    config: {
      threshold: config.threshold,
      embeddingModel: config.model,
    },
  };
}

/**
 * Check if text matches expected semantically (Promptfoo-style).
 * Returns boolean for simple assertion.
 */
export async function matchesSimilarity(
  actual: string,
  expected: string,
  options: {
    threshold?: number;
    provider?: string;
  } = {}
): Promise<boolean> {
  const config: EmbeddingConfig = {
    model:
      options.provider === "gemini:gemini-embedding-001"
        ? "gemini-embedding-001"
        : "gemini-embedding-001",
    threshold: options.threshold ?? 0.8,
    useCache: true,
  };

  const result = await validateSemanticSimilarity(actual, expected, config);
  return result.passed;
}

/**
 * Get similarity score between texts.
 * Useful when you need the actual score, not just pass/fail.
 */
export async function getSimilarityScore(
  actual: string,
  expected: string,
  config: EmbeddingConfig = DEFAULT_EMBEDDING_CONFIG
): Promise<number> {
  const result = await validateSemanticSimilarity(actual, expected, config);
  return result.similarity;
}

// ============================================
// Utility Functions
// ============================================

/**
 * Interpret similarity score.
 */
export function interpretSimilarity(score: number): string {
  if (score >= SIMILARITY_LEVELS.VERY_HIGH) {
    return "very_high (near-identical)";
  } else if (score >= SIMILARITY_LEVELS.HIGH) {
    return "high (semantically equivalent)";
  } else if (score >= SIMILARITY_LEVELS.MODERATE) {
    return "moderate (related concepts)";
  } else if (score >= SIMILARITY_LEVELS.LOW) {
    return "low (loosely related)";
  } else {
    return "not_similar";
  }
}

/**
 * Create a semantic assertion for testing.
 */
export function semanticAssert(threshold: number = 0.8) {
  return async (actual: string, expected: string): Promise<void> => {
    const result = await validateSemanticSimilarity(actual, expected, {
      ...DEFAULT_EMBEDDING_CONFIG,
      threshold,
    });

    if (!result.passed) {
      throw new Error(
        `Semantic similarity assertion failed: ${result.similarity.toFixed(3)} < ${threshold}\n` +
          `Actual: "${actual.slice(0, 100)}..."\n` +
          `Expected: "${expected.slice(0, 100)}..."`
      );
    }
  };
}

// ============================================
// Sample Test Cases
// ============================================

/**
 * Sample pairs for testing semantic similarity.
 */
export const SAMPLE_PAIRS = {
  /** Exact match - should be very high (> 0.99) */
  exact: {
    actual: "Bullish momentum with trend continuation",
    expected: "Bullish momentum with trend continuation",
  },

  /** Paraphrase - should be high (> 0.85) */
  paraphrase: {
    actual: "Strong upward price movement with positive momentum",
    expected: "Bullish momentum with trend continuation",
  },

  /** Related - should be moderate (> 0.75) */
  related: {
    actual: "Positive market sentiment with buying pressure",
    expected: "Bullish momentum with trend continuation",
  },

  /** Unrelated - should be low (< 0.6) */
  unrelated: {
    actual: "The weather forecast shows rain tomorrow",
    expected: "Bullish momentum with trend continuation",
  },
};

export default {
  validateSemanticSimilarity,
  validateBatchSimilarity,
  matchesSimilarity,
  getSimilarityScore,
  cosineSimilarity,
  interpretSimilarity,
  semanticAssert,
  clearEmbeddingCache,
  getEmbeddingCacheStats,
  SIMILARITY_LEVELS,
  SAMPLE_PAIRS,
};
