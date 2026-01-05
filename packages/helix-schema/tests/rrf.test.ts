/**
 * Reciprocal Rank Fusion (RRF) Tests
 */

import { describe, expect, it } from "bun:test";
import {
  assignRanks,
  calculateCombinedRRFScore,
  calculateMultiMethodBoost,
  calculateRRFScore,
  DEFAULT_RRF_K,
  DEFAULT_TOP_K,
  fuseMultipleWithRRF,
  fuseWithRRF,
  getMaxRRFScore,
  normalizeRRFScores,
  type RetrievalResult,
} from "../src/retrieval";

// ============================================
// Test Data
// ============================================

interface TestNode {
  id: string;
  content: string;
}

function createResult(id: string, score: number): RetrievalResult<TestNode> {
  return {
    node: { id, content: `Content for ${id}` },
    nodeId: id,
    score,
  };
}

// ============================================
// RRF Score Calculation Tests
// ============================================

describe("calculateRRFScore", () => {
  it("calculates correct score for rank 1", () => {
    const score = calculateRRFScore(1, 60);
    expect(score).toBeCloseTo(1 / 61, 10);
  });

  it("calculates correct score for rank 10", () => {
    const score = calculateRRFScore(10, 60);
    expect(score).toBeCloseTo(1 / 70, 10);
  });

  it("uses default k=60", () => {
    const score = calculateRRFScore(1);
    expect(score).toBeCloseTo(1 / 61, 10);
  });

  it("respects custom k value", () => {
    const score = calculateRRFScore(1, 100);
    expect(score).toBeCloseTo(1 / 101, 10);
  });

  it("throws for rank < 1", () => {
    expect(() => calculateRRFScore(0)).toThrow();
    expect(() => calculateRRFScore(-1)).toThrow();
  });

  it("higher rank produces lower score", () => {
    const score1 = calculateRRFScore(1);
    const score2 = calculateRRFScore(2);
    const score3 = calculateRRFScore(10);
    expect(score1).toBeGreaterThan(score2);
    expect(score2).toBeGreaterThan(score3);
  });
});

// ============================================
// Rank Assignment Tests
// ============================================

describe("assignRanks", () => {
  it("assigns ranks in score order", () => {
    const results = [createResult("a", 0.9), createResult("b", 0.7), createResult("c", 0.5)];

    const ranked = assignRanks(results, "vector");

    expect(ranked[0].nodeId).toBe("a");
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].nodeId).toBe("b");
    expect(ranked[1].rank).toBe(2);
    expect(ranked[2].nodeId).toBe("c");
    expect(ranked[2].rank).toBe(3);
  });

  it("handles ties with same rank", () => {
    const results = [
      createResult("a", 0.9),
      createResult("b", 0.9), // Tie with a
      createResult("c", 0.5),
    ];

    const ranked = assignRanks(results, "vector");

    // Both a and b should have rank 1
    const rankA = ranked.find((r) => r.nodeId === "a")!.rank;
    const rankB = ranked.find((r) => r.nodeId === "b")!.rank;
    const rankC = ranked.find((r) => r.nodeId === "c")!.rank;

    expect(rankA).toBe(1);
    expect(rankB).toBe(1);
    expect(rankC).toBe(3); // Skips rank 2
  });

  it("handles empty results", () => {
    const ranked = assignRanks([], "vector");
    expect(ranked).toEqual([]);
  });

  it("handles single result", () => {
    const results = [createResult("a", 0.9)];
    const ranked = assignRanks(results, "vector");

    expect(ranked.length).toBe(1);
    expect(ranked[0].rank).toBe(1);
    expect(ranked[0].source).toBe("vector");
  });

  it("preserves source label", () => {
    const results = [createResult("a", 0.9)];

    const vectorRanked = assignRanks(results, "vector");
    const graphRanked = assignRanks(results, "graph");

    expect(vectorRanked[0].source).toBe("vector");
    expect(graphRanked[0].source).toBe("graph");
  });
});

// ============================================
// RRF Fusion Tests
// ============================================

describe("fuseWithRRF", () => {
  it("fuses vector-only results", () => {
    const vectorResults = [createResult("a", 0.9), createResult("b", 0.7)];

    const fused = fuseWithRRF(vectorResults, []);

    expect(fused.length).toBe(2);
    expect(fused[0].nodeId).toBe("a");
    expect(fused[0].sources).toEqual(["vector"]);
    expect(fused[0].ranks.vector).toBe(1);
    expect(fused[0].ranks.graph).toBeUndefined();
  });

  it("fuses graph-only results", () => {
    const graphResults = [createResult("a", 0.9), createResult("b", 0.7)];

    const fused = fuseWithRRF([], graphResults);

    expect(fused.length).toBe(2);
    expect(fused[0].nodeId).toBe("a");
    expect(fused[0].sources).toEqual(["graph"]);
    expect(fused[0].ranks.graph).toBe(1);
    expect(fused[0].ranks.vector).toBeUndefined();
  });

  it("combines scores for nodes in both result sets", () => {
    const vectorResults = [createResult("a", 0.9)];
    const graphResults = [createResult("a", 0.8)];

    const fused = fuseWithRRF(vectorResults, graphResults);

    expect(fused.length).toBe(1);
    expect(fused[0].nodeId).toBe("a");
    expect(fused[0].sources).toContain("vector");
    expect(fused[0].sources).toContain("graph");
    expect(fused[0].ranks.vector).toBe(1);
    expect(fused[0].ranks.graph).toBe(1);

    // Score should be sum of both RRF scores
    const expectedScore = calculateRRFScore(1) + calculateRRFScore(1);
    expect(fused[0].rrfScore).toBeCloseTo(expectedScore, 10);
  });

  it("boosts nodes appearing in both methods", () => {
    const vectorResults = [
      createResult("a", 0.9), // Rank 1 in vector
      createResult("b", 0.7), // Rank 2 in vector
    ];
    const graphResults = [
      createResult("a", 0.8), // Rank 1 in graph
      createResult("c", 0.6), // Rank 2 in graph (not in vector)
    ];

    const fused = fuseWithRRF(vectorResults, graphResults);

    // 'a' should be first (appears in both)
    expect(fused[0].nodeId).toBe("a");

    // 'a' should have higher score than 'b' or 'c' alone
    const scoreA = fused.find((r) => r.nodeId === "a")!.rrfScore;
    const scoreB = fused.find((r) => r.nodeId === "b")!.rrfScore;
    const scoreC = fused.find((r) => r.nodeId === "c")!.rrfScore;

    expect(scoreA).toBeGreaterThan(scoreB);
    expect(scoreA).toBeGreaterThan(scoreC);
  });

  it("respects topK limit", () => {
    const vectorResults = [
      createResult("a", 0.9),
      createResult("b", 0.8),
      createResult("c", 0.7),
      createResult("d", 0.6),
      createResult("e", 0.5),
    ];

    const fused = fuseWithRRF(vectorResults, [], { topK: 3 });

    expect(fused.length).toBe(3);
    expect(fused[0].nodeId).toBe("a");
    expect(fused[2].nodeId).toBe("c");
  });

  it("respects minScore threshold", () => {
    const vectorResults = [
      createResult("a", 0.9), // Rank 1 → high RRF score
      createResult("b", 0.3), // Rank 2 → lower RRF score
    ];

    const rank1Score = calculateRRFScore(1);
    const rank2Score = calculateRRFScore(2);

    // Set threshold between rank 1 and rank 2 scores
    const threshold = (rank1Score + rank2Score) / 2;

    const fused = fuseWithRRF(vectorResults, [], { minScore: threshold });

    expect(fused.length).toBe(1);
    expect(fused[0].nodeId).toBe("a");
  });

  it("uses default k=60", () => {
    const vectorResults = [createResult("a", 0.9)];
    const fused = fuseWithRRF(vectorResults, []);

    expect(fused[0].rrfScore).toBeCloseTo(calculateRRFScore(1, DEFAULT_RRF_K), 10);
  });

  it("respects custom k value", () => {
    const vectorResults = [createResult("a", 0.9)];
    const fused = fuseWithRRF(vectorResults, [], { k: 100 });

    expect(fused[0].rrfScore).toBeCloseTo(calculateRRFScore(1, 100), 10);
  });

  it("preserves original scores", () => {
    const vectorResults = [createResult("a", 0.9)];
    const graphResults = [createResult("a", 0.75)];

    const fused = fuseWithRRF(vectorResults, graphResults);

    expect(fused[0].originalScores.vector).toBe(0.9);
    expect(fused[0].originalScores.graph).toBe(0.75);
  });

  it("handles empty inputs", () => {
    const fused = fuseWithRRF([], []);
    expect(fused).toEqual([]);
  });
});

// ============================================
// Multiple Method Fusion Tests
// ============================================

describe("fuseMultipleWithRRF", () => {
  it("fuses three result sets", () => {
    const resultSets = [
      { method: "vector", results: [createResult("a", 0.9), createResult("b", 0.7)] },
      { method: "graph", results: [createResult("a", 0.8), createResult("c", 0.6)] },
      { method: "keyword", results: [createResult("a", 0.7), createResult("d", 0.5)] },
    ];

    const fused = fuseMultipleWithRRF(resultSets);

    // 'a' appears in all three methods
    expect(fused[0].nodeId).toBe("a");
    expect(Object.keys(fused[0].sourcesByMethod)).toContain("vector");
    expect(Object.keys(fused[0].sourcesByMethod)).toContain("graph");
    expect(Object.keys(fused[0].sourcesByMethod)).toContain("keyword");

    // Score should be sum of all three RRF scores (all rank 1)
    const expectedScore = 3 * calculateRRFScore(1);
    expect(fused[0].rrfScore).toBeCloseTo(expectedScore, 10);
  });

  it("handles single method", () => {
    const resultSets = [{ method: "vector", results: [createResult("a", 0.9)] }];

    const fused = fuseMultipleWithRRF(resultSets);

    expect(fused.length).toBe(1);
    expect(fused[0].nodeId).toBe("a");
  });
});

// ============================================
// Utility Function Tests
// ============================================

describe("calculateCombinedRRFScore", () => {
  it("calculates combined score correctly", () => {
    const combined = calculateCombinedRRFScore(1, 1);
    const expected = 2 * calculateRRFScore(1);
    expect(combined).toBeCloseTo(expected, 10);
  });

  it("handles different ranks", () => {
    const combined = calculateCombinedRRFScore(1, 5);
    const expected = calculateRRFScore(1) + calculateRRFScore(5);
    expect(combined).toBeCloseTo(expected, 10);
  });
});

describe("getMaxRRFScore", () => {
  it("calculates max score for 2 methods", () => {
    const maxScore = getMaxRRFScore(2);
    const expected = 2 * calculateRRFScore(1);
    expect(maxScore).toBeCloseTo(expected, 10);
  });

  it("calculates max score for 3 methods", () => {
    const maxScore = getMaxRRFScore(3);
    const expected = 3 * calculateRRFScore(1);
    expect(maxScore).toBeCloseTo(expected, 10);
  });
});

describe("normalizeRRFScores", () => {
  it("normalizes scores to [0, 1]", () => {
    const vectorResults = [createResult("a", 0.9)];
    const graphResults = [createResult("a", 0.8)];

    const fused = fuseWithRRF(vectorResults, graphResults);
    const normalized = normalizeRRFScores(fused, 2);

    // 'a' is rank 1 in both methods, so normalized score should be 1.0
    expect(normalized[0].normalizedScore).toBeCloseTo(1.0, 10);
  });

  it("lower scores normalize appropriately", () => {
    const vectorResults = [
      createResult("a", 0.9), // Rank 1
      createResult("b", 0.7), // Rank 2
    ];

    const fused = fuseWithRRF(vectorResults, []);
    const normalized = normalizeRRFScores(fused, 2);

    // 'a' only appears in vector (rank 1), so max is 1/(61) out of 2/(61)
    expect(normalized[0].normalizedScore).toBeCloseTo(0.5, 2);
  });
});

describe("calculateMultiMethodBoost", () => {
  it("calculates boost for dual-method node", () => {
    const singleScore = calculateRRFScore(1);
    const dualScore = 2 * calculateRRFScore(1);

    const boost = calculateMultiMethodBoost(singleScore, dualScore);

    expect(boost).toBeCloseTo(1.0, 10); // 100% boost (doubled)
  });

  it("returns 0 for no boost", () => {
    const score = calculateRRFScore(1);
    const boost = calculateMultiMethodBoost(score, score);

    expect(boost).toBeCloseTo(0, 10);
  });

  it("handles zero single score", () => {
    const boost = calculateMultiMethodBoost(0, 0.5);
    expect(boost).toBe(0);
  });
});

// ============================================
// Constants Tests
// ============================================

describe("Constants", () => {
  it("DEFAULT_RRF_K is 60", () => {
    expect(DEFAULT_RRF_K).toBe(60);
  });

  it("DEFAULT_TOP_K is 10", () => {
    expect(DEFAULT_TOP_K).toBe(10);
  });
});

// ============================================
// Edge Case Tests
// ============================================

describe("Edge Cases", () => {
  it("handles many tied scores", () => {
    const results = [
      createResult("a", 0.5),
      createResult("b", 0.5),
      createResult("c", 0.5),
      createResult("d", 0.3),
    ];

    const ranked = assignRanks(results, "vector");

    // All 0.5 scores should be rank 1
    const rank05 = ranked.filter((r) => r.score === 0.5);
    for (const r of rank05) {
      expect(r.rank).toBe(1);
    }

    // 0.3 should be rank 4 (skipping 2 and 3)
    const rankD = ranked.find((r) => r.nodeId === "d")!;
    expect(rankD.rank).toBe(4);
  });

  it("handles very large result sets", () => {
    const vectorResults: RetrievalResult<TestNode>[] = [];
    for (let i = 0; i < 1000; i++) {
      vectorResults.push(createResult(`node-${i}`, 1 - i / 1000));
    }

    const start = performance.now();
    const fused = fuseWithRRF(vectorResults, [], { topK: 10 });
    const elapsed = performance.now() - start;

    expect(fused.length).toBe(10);
    expect(elapsed).toBeLessThan(100); // Should be fast
  });
});
