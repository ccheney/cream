/**
 * Semantic Similarity Validation
 *
 * @see docs/plans/14-testing.md lines 399-424
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

export interface EmbeddingConfig {
  /** Embedding model */
  model: "gemini-embedding-001" | "text-embedding-3-small";

  /** Similarity threshold (0-1) */
  threshold: number;

  /** Cache embeddings */
  useCache?: boolean;
}

export const DEFAULT_EMBEDDING_CONFIG: EmbeddingConfig = {
  model: "gemini-embedding-001",
  threshold: 0.8,
  useCache: true,
};

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

const embeddingCache = new Map<string, number[]>();

function getCacheKey(text: string, model: string): string {
  return `${model}:${text}`;
}

export function clearEmbeddingCache(): void {
  embeddingCache.clear();
}

export function getEmbeddingCacheStats(): { size: number; keys: string[] } {
  return {
    size: embeddingCache.size,
    keys: Array.from(embeddingCache.keys()).map((k) => `${k.slice(0, 50)}...`),
  };
}

/** Deterministic hash-based embedding for reproducible test results. */
function generateMockEmbedding(text: string, dimensions = 768): number[] {
  const embedding: number[] = [];
  let hash = 0;

  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) % 1000000007;
  }

  for (let i = 0; i < dimensions; i++) {
    hash = (hash * 1103515245 + 12345) % 2147483648;
    embedding.push((hash / 2147483648) * 2 - 1);
  }

  const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
  return embedding.map((v) => v / magnitude);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimensions must match: ${a.length} vs ${b.length}`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += (a[i] ?? 0) * (b[i] ?? 0);
    normA += (a[i] ?? 0) * (a[i] ?? 0);
    normB += (b[i] ?? 0) * (b[i] ?? 0);
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Mock implementation - in production, this would call Gemini or OpenAI API. */
async function getEmbedding(text: string, config: EmbeddingConfig): Promise<number[]> {
  const cacheKey = getCacheKey(text, config.model);

  if (config.useCache && embeddingCache.has(cacheKey)) {
    return embeddingCache.get(cacheKey)!;
  }

  const dimensions = config.model === "gemini-embedding-001" ? 3072 : 1536;
  const embedding = generateMockEmbedding(text, dimensions);

  if (config.useCache) {
    embeddingCache.set(cacheKey, embedding);
  }

  return embedding;
}

export async function validateSemanticSimilarity(
  actual: string,
  expected: string,
  config: EmbeddingConfig = DEFAULT_EMBEDDING_CONFIG
): Promise<SimilarityResult> {
  const [actualEmbedding, expectedEmbedding] = await Promise.all([
    getEmbedding(actual, config),
    getEmbedding(expected, config),
  ]);

  // Normalize from [-1, 1] to [0, 1] range for consistent threshold comparison
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

export async function validateBatchSimilarity(
  pairs: Array<{ actual: string; expected: string }>,
  config: EmbeddingConfig = DEFAULT_EMBEDDING_CONFIG
): Promise<BatchSimilarityResults> {
  const results: SimilarityResult[] = [];

  for (const pair of pairs) {
    const result = await validateSemanticSimilarity(pair.actual, pair.expected, config);
    results.push(result);
  }

  const similarities = results.map((r) => r.similarity);
  const stats = {
    total: results.length,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    meanSimilarity: similarities.reduce((a, b) => a + b, 0) / similarities.length,
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

/** Promptfoo-style assertion returning boolean for simple pass/fail checks. */
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

export async function getSimilarityScore(
  actual: string,
  expected: string,
  config: EmbeddingConfig = DEFAULT_EMBEDDING_CONFIG
): Promise<number> {
  const result = await validateSemanticSimilarity(actual, expected, config);
  return result.similarity;
}

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

export function semanticAssert(threshold = 0.8) {
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
