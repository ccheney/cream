/**
 * Semantic Similarity Validation Tests
 *
 * Tests the semantic similarity validation framework.
 *
 * @see docs/plans/14-testing.md lines 399-424
 */

import { beforeEach, describe, expect, it } from "bun:test";
import {
  clearEmbeddingCache,
  cosineSimilarity,
  DEFAULT_EMBEDDING_CONFIG,
  getEmbeddingCacheStats,
  getSimilarityScore,
  interpretSimilarity,
  matchesSimilarity,
  SAMPLE_PAIRS,
  SIMILARITY_LEVELS,
  semanticAssert,
  validateBatchSimilarity,
  validateSemanticSimilarity,
} from "./semantic.js";

// ============================================
// Setup
// ============================================

beforeEach(() => {
  clearEmbeddingCache();
});

// ============================================
// Cosine Similarity Tests
// ============================================

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    const v = [1, 0, 0, 1];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
  });

  it("returns 0 for orthogonal vectors", () => {
    const v1 = [1, 0];
    const v2 = [0, 1];
    expect(cosineSimilarity(v1, v2)).toBeCloseTo(0, 5);
  });

  it("returns -1 for opposite vectors", () => {
    const v1 = [1, 0];
    const v2 = [-1, 0];
    expect(cosineSimilarity(v1, v2)).toBeCloseTo(-1, 5);
  });

  it("throws for mismatched dimensions", () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow();
  });
});

// ============================================
// Similarity Validation Tests
// ============================================

describe("validateSemanticSimilarity", () => {
  it("returns high similarity for identical text", async () => {
    const text = "Bullish momentum with strong trend";
    const result = await validateSemanticSimilarity(text, text);

    expect(result.similarity).toBeCloseTo(1, 3);
    expect(result.passed).toBe(true);
  });

  it("returns similarity score between 0 and 1", async () => {
    const result = await validateSemanticSimilarity(
      "The market is rising",
      "Stock prices are going up"
    );

    expect(result.similarity).toBeGreaterThanOrEqual(0);
    expect(result.similarity).toBeLessThanOrEqual(1);
  });

  it("respects threshold configuration", async () => {
    const result = await validateSemanticSimilarity("Different text A", "Different text B", {
      ...DEFAULT_EMBEDDING_CONFIG,
      threshold: 0.99,
    });

    // With high threshold, should likely fail
    expect(result.threshold).toBe(0.99);
  });

  it("includes all required fields in result", async () => {
    const result = await validateSemanticSimilarity("Text A", "Text B");

    expect(result.actual).toBe("Text A");
    expect(result.expected).toBe("Text B");
    expect(typeof result.similarity).toBe("number");
    expect(typeof result.passed).toBe("boolean");
    expect(typeof result.threshold).toBe("number");
  });
});

// ============================================
// Batch Validation Tests
// ============================================

describe("validateBatchSimilarity", () => {
  it("validates multiple pairs", async () => {
    const pairs = [
      { actual: "Text 1", expected: "Text 1" },
      { actual: "Text 2", expected: "Text 2" },
      { actual: "Text 3", expected: "Different" },
    ];

    const results = await validateBatchSimilarity(pairs);

    expect(results.results).toHaveLength(3);
    expect(results.stats.total).toBe(3);
  });

  it("calculates correct statistics", async () => {
    const pairs = [
      { actual: "Same", expected: "Same" },
      { actual: "Also same", expected: "Also same" },
    ];

    const results = await validateBatchSimilarity(pairs);

    expect(results.stats.meanSimilarity).toBeCloseTo(1, 2);
    expect(results.stats.minSimilarity).toBe(results.stats.maxSimilarity);
    expect(results.stats.passed).toBe(2);
    expect(results.stats.failed).toBe(0);
  });

  it("includes configuration in results", async () => {
    const results = await validateBatchSimilarity([{ actual: "A", expected: "B" }], {
      ...DEFAULT_EMBEDDING_CONFIG,
      threshold: 0.9,
    });

    expect(results.config.threshold).toBe(0.9);
    expect(results.config.embeddingModel).toBe("gemini-embedding-001");
  });
});

// ============================================
// matchesSimilarity Tests
// ============================================

describe("matchesSimilarity", () => {
  it("returns true for identical text", async () => {
    const result = await matchesSimilarity("Bullish momentum", "Bullish momentum");
    expect(result).toBe(true);
  });

  it("respects threshold option", async () => {
    const result = await matchesSimilarity("Text A", "Text B", {
      threshold: 0.999,
    });
    // With very high threshold, different texts should fail
    expect(result).toBe(false);
  });

  it("accepts provider option", async () => {
    const result = await matchesSimilarity("Test", "Test", {
      provider: "gemini:gemini-embedding-001",
    });
    expect(result).toBe(true);
  });
});

// ============================================
// getSimilarityScore Tests
// ============================================

describe("getSimilarityScore", () => {
  it("returns numeric score", async () => {
    const score = await getSimilarityScore("Hello world", "Hello world");
    expect(typeof score).toBe("number");
    expect(score).toBeCloseTo(1, 3);
  });

  it("returns different scores for different texts", async () => {
    const score1 = await getSimilarityScore("Same text", "Same text");
    const score2 = await getSimilarityScore("Text A", "Completely different B");

    expect(score1).toBeGreaterThan(score2);
  });
});

// ============================================
// Cache Tests
// ============================================

describe("Embedding Cache", () => {
  it("caches embeddings", async () => {
    // First call
    await validateSemanticSimilarity("Cached text", "Other text");

    const stats = getEmbeddingCacheStats();
    expect(stats.size).toBeGreaterThan(0);
  });

  it("clears cache", async () => {
    await validateSemanticSimilarity("Some text", "Other text");
    clearEmbeddingCache();

    const stats = getEmbeddingCacheStats();
    expect(stats.size).toBe(0);
  });

  it("reuses cached embeddings", async () => {
    const text = "Reusable text";

    // First call caches
    await validateSemanticSimilarity(text, "Expected");
    const statsAfterFirst = getEmbeddingCacheStats();

    // Second call should reuse
    await validateSemanticSimilarity(text, "Different expected");
    const statsAfterSecond = getEmbeddingCacheStats();

    // Cache should grow for "Expected" and "Different expected" but not for "text"
    expect(statsAfterSecond.size).toBe(statsAfterFirst.size + 1);
  });
});

// ============================================
// interpretSimilarity Tests
// ============================================

describe("interpretSimilarity", () => {
  it("returns correct interpretation for very high", () => {
    expect(interpretSimilarity(0.98)).toContain("very_high");
  });

  it("returns correct interpretation for high", () => {
    expect(interpretSimilarity(0.88)).toContain("high");
  });

  it("returns correct interpretation for moderate", () => {
    expect(interpretSimilarity(0.78)).toContain("moderate");
  });

  it("returns correct interpretation for low", () => {
    expect(interpretSimilarity(0.65)).toContain("low");
  });

  it("returns not_similar for very low", () => {
    expect(interpretSimilarity(0.3)).toBe("not_similar");
  });
});

// ============================================
// semanticAssert Tests
// ============================================

describe("semanticAssert", () => {
  it("passes for identical text", async () => {
    const assert = semanticAssert(0.8);
    await expect(assert("Same text", "Same text")).resolves.toBeUndefined();
  });

  it("throws for very different text with high threshold", async () => {
    const assert = semanticAssert(0.999);
    await expect(assert("Text A", "Completely different B")).rejects.toThrow(
      "Semantic similarity assertion failed"
    );
  });
});

// ============================================
// SIMILARITY_LEVELS Tests
// ============================================

describe("SIMILARITY_LEVELS", () => {
  it("has correct threshold values", () => {
    expect(SIMILARITY_LEVELS.VERY_HIGH).toBe(0.95);
    expect(SIMILARITY_LEVELS.HIGH).toBe(0.85);
    expect(SIMILARITY_LEVELS.MODERATE).toBe(0.75);
    expect(SIMILARITY_LEVELS.LOW).toBe(0.6);
  });

  it("thresholds are in descending order", () => {
    expect(SIMILARITY_LEVELS.VERY_HIGH).toBeGreaterThan(SIMILARITY_LEVELS.HIGH);
    expect(SIMILARITY_LEVELS.HIGH).toBeGreaterThan(SIMILARITY_LEVELS.MODERATE);
    expect(SIMILARITY_LEVELS.MODERATE).toBeGreaterThan(SIMILARITY_LEVELS.LOW);
  });
});

// ============================================
// Sample Pairs Tests
// ============================================

describe("SAMPLE_PAIRS", () => {
  it("exact match has very high similarity", async () => {
    const { actual, expected } = SAMPLE_PAIRS.exact;
    const score = await getSimilarityScore(actual, expected);
    expect(score).toBeGreaterThan(0.99);
  });

  it("has all required sample types", () => {
    expect(SAMPLE_PAIRS.exact).toBeDefined();
    expect(SAMPLE_PAIRS.paraphrase).toBeDefined();
    expect(SAMPLE_PAIRS.related).toBeDefined();
    expect(SAMPLE_PAIRS.unrelated).toBeDefined();
  });
});
