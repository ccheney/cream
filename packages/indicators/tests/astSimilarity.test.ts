/**
 * AST Similarity Checker Tests
 *
 * Tests for indicator deduplication via AST comparison.
 */

import { describe, expect, it } from "bun:test";
import {
  AST_SIMILARITY_DEFAULTS,
  compareComputationalCore,
  compareIndicator,
  computeSimilarity,
  evaluateSimilarityResult,
  extractComputationalCore,
  longestCommonSubsequence,
  normalizeCode,
  parseToSignature,
} from "../src/synthesis/astSimilarity.js";

// ============================================
// Test Fixtures
// ============================================

const SIMPLE_FUNCTION = `
function add(a: number, b: number): number {
  return a + b;
}
`;

const SIMILAR_FUNCTION = `
function sum(x: number, y: number): number {
  return x + y;
}
`;

const DIFFERENT_FUNCTION = `
function multiply(a: number, b: number): number {
  let result = 0;
  for (let i = 0; i < b; i++) {
    result += a;
  }
  return result;
}
`;

const RSI_INDICATOR = `
export function calculateRSI(prices: number[], period: number = 14): number[] {
  const changes = [];
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }

  const gains = changes.map(c => c > 0 ? c : 0);
  const losses = changes.map(c => c < 0 ? -c : 0);

  const avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  const rs = avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));

  return [rsi];
}
`;

const RSI_VARIANT = `
// Slightly different RSI with same logic
export function computeRelativeStrengthIndex(values: number[], lookback: number = 14): number[] {
  const deltas = [];
  for (let idx = 1; idx < values.length; idx++) {
    deltas.push(values[idx] - values[idx - 1]);
  }

  const up = deltas.map(d => d > 0 ? d : 0);
  const down = deltas.map(d => d < 0 ? -d : 0);

  const meanUp = up.slice(0, lookback).reduce((a, b) => a + b, 0) / lookback;
  const meanDown = down.slice(0, lookback).reduce((a, b) => a + b, 0) / lookback;

  const relativeStrength = meanUp / meanDown;
  const result = 100 - (100 / (1 + relativeStrength));

  return [result];
}
`;

const SMA_INDICATOR = `
export function calculateSMA(prices: number[], period: number): number {
  const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
  return sum / period;
}
`;

// ============================================
// parseToSignature Tests
// ============================================

describe("parseToSignature", () => {
  it("parses simple function", () => {
    const sig = parseToSignature(SIMPLE_FUNCTION);

    expect(sig.totalNodes).toBeGreaterThan(0);
    expect(sig.nodeKinds.length).toBe(sig.totalNodes);
    expect(sig.hash.length).toBeGreaterThan(0);
  });

  it("produces consistent signatures for same code", () => {
    const sig1 = parseToSignature(SIMPLE_FUNCTION);
    const sig2 = parseToSignature(SIMPLE_FUNCTION);

    expect(sig1.hash).toBe(sig2.hash);
    expect(sig1.totalNodes).toBe(sig2.totalNodes);
  });

  it("produces different signatures for different code", () => {
    const sig1 = parseToSignature(SIMPLE_FUNCTION);
    const sig2 = parseToSignature(DIFFERENT_FUNCTION);

    expect(sig1.hash).not.toBe(sig2.hash);
  });

  it("tracks node kind counts", () => {
    const sig = parseToSignature(SIMPLE_FUNCTION);

    // Should have function declaration, parameters, return statement, etc.
    expect(Object.keys(sig.kindCounts).length).toBeGreaterThan(3);
  });
});

// ============================================
// computeSimilarity Tests
// ============================================

describe("computeSimilarity", () => {
  it("returns 1.0 for identical code", () => {
    const sig1 = parseToSignature(SIMPLE_FUNCTION);
    const sig2 = parseToSignature(SIMPLE_FUNCTION);

    expect(computeSimilarity(sig1, sig2)).toBe(1.0);
  });

  it("returns high similarity for structurally similar code", () => {
    const sig1 = parseToSignature(SIMPLE_FUNCTION);
    const sig2 = parseToSignature(SIMILAR_FUNCTION);

    const similarity = computeSimilarity(sig1, sig2);
    expect(similarity).toBeGreaterThan(0.8);
  });

  it("returns lower similarity for different code", () => {
    const sig1 = parseToSignature(SIMPLE_FUNCTION);
    const sig2 = parseToSignature(DIFFERENT_FUNCTION);

    const similarity = computeSimilarity(sig1, sig2);
    expect(similarity).toBeLessThan(0.7);
  });

  it("returns 0 for empty signatures", () => {
    const empty = { nodeKinds: [], kindCounts: {}, totalNodes: 0, hash: "" };
    const sig = parseToSignature(SIMPLE_FUNCTION);

    expect(computeSimilarity(empty, sig)).toBe(0);
    expect(computeSimilarity(sig, empty)).toBe(0);
  });

  it("is symmetric", () => {
    const sig1 = parseToSignature(SIMPLE_FUNCTION);
    const sig2 = parseToSignature(DIFFERENT_FUNCTION);

    expect(computeSimilarity(sig1, sig2)).toBe(computeSimilarity(sig2, sig1));
  });
});

// ============================================
// longestCommonSubsequence Tests
// ============================================

describe("longestCommonSubsequence", () => {
  it("returns 0 for empty sequences", () => {
    expect(longestCommonSubsequence([], [])).toBe(0);
    expect(longestCommonSubsequence([1, 2, 3], [])).toBe(0);
    expect(longestCommonSubsequence([], [1, 2, 3])).toBe(0);
  });

  it("returns length for identical sequences", () => {
    const seq = [1, 2, 3, 4, 5];
    expect(longestCommonSubsequence(seq, seq)).toBe(5);
  });

  it("finds common subsequence", () => {
    const seq1 = [1, 2, 3, 4, 5];
    const seq2 = [1, 3, 5, 7, 9];
    expect(longestCommonSubsequence(seq1, seq2)).toBe(3); // [1, 3, 5]
  });

  it("handles no common elements", () => {
    const seq1 = [1, 2, 3];
    const seq2 = [4, 5, 6];
    expect(longestCommonSubsequence(seq1, seq2)).toBe(0);
  });

  it("handles single common element", () => {
    const seq1 = [1, 2, 3];
    const seq2 = [4, 2, 6];
    expect(longestCommonSubsequence(seq1, seq2)).toBe(1);
  });
});

// ============================================
// compareIndicator Tests
// ============================================

describe("compareIndicator", () => {
  it("returns empty result for no existing indicators", () => {
    const result = compareIndicator(SIMPLE_FUNCTION, new Map());

    expect(result.maxSimilarity).toBe(0);
    expect(result.shouldReject).toBe(false);
    expect(result.shouldWarn).toBe(false);
    expect(result.comparisonCount).toBe(0);
  });

  it("detects identical indicator", () => {
    const existing = new Map([["existing.ts", SIMPLE_FUNCTION]]);
    const result = compareIndicator(SIMPLE_FUNCTION, existing);

    expect(result.maxSimilarity).toBe(1.0);
    expect(result.shouldReject).toBe(true);
    expect(result.mostSimilarPath).toBe("existing.ts");
  });

  it("detects similar indicator", () => {
    const existing = new Map([["existing.ts", SIMPLE_FUNCTION]]);
    const result = compareIndicator(SIMILAR_FUNCTION, existing);

    expect(result.maxSimilarity).toBeGreaterThan(0.8);
    expect(result.shouldReject).toBe(true);
  });

  it("passes different indicator", () => {
    const existing = new Map([["existing.ts", SIMPLE_FUNCTION]]);
    const result = compareIndicator(DIFFERENT_FUNCTION, existing);

    expect(result.shouldReject).toBe(false);
  });

  it("compares against multiple indicators", () => {
    const existing = new Map([
      ["add.ts", SIMPLE_FUNCTION],
      ["multiply.ts", DIFFERENT_FUNCTION],
      ["rsi.ts", RSI_INDICATOR],
    ]);
    const result = compareIndicator(SIMILAR_FUNCTION, existing);

    expect(result.comparisonCount).toBe(3);
    expect(result.mostSimilarPath).toBe("add.ts");
  });

  it("respects custom thresholds", () => {
    const existing = new Map([["existing.ts", SIMPLE_FUNCTION]]);
    const result = compareIndicator(DIFFERENT_FUNCTION, existing, {
      warnThreshold: 0.1,
      rejectThreshold: 0.2,
    });

    // With low thresholds, even different code might trigger
    expect(result.similarIndicators.length).toBeGreaterThan(0);
  });

  it("tracks all similar indicators above warn threshold", () => {
    const existing = new Map([
      ["add.ts", SIMPLE_FUNCTION],
      ["sum.ts", SIMILAR_FUNCTION],
    ]);
    const result = compareIndicator(SIMPLE_FUNCTION, existing);

    expect(result.similarIndicators.length).toBe(2);
    const topSimilar = result.similarIndicators[0];
    expect(topSimilar).toBeDefined();
    expect(topSimilar?.similarity).toBe(1.0);
  });
});

// ============================================
// evaluateSimilarityResult Tests
// ============================================

describe("evaluateSimilarityResult", () => {
  it("returns REJECT for high similarity", () => {
    const result = {
      maxSimilarity: 0.9,
      mostSimilarPath: "existing.ts",
      shouldReject: true,
      shouldWarn: false,
      similarIndicators: [{ path: "existing.ts", similarity: 0.9 }],
      comparisonCount: 1,
    };

    const evaluation = evaluateSimilarityResult(result);
    expect(evaluation.decision).toBe("REJECT");
    expect(evaluation.reason).toContain("90.0%");
  });

  it("returns WARN for moderate similarity", () => {
    const result = {
      maxSimilarity: 0.65,
      mostSimilarPath: "existing.ts",
      shouldReject: false,
      shouldWarn: true,
      similarIndicators: [{ path: "existing.ts", similarity: 0.65 }],
      comparisonCount: 1,
    };

    const evaluation = evaluateSimilarityResult(result);
    expect(evaluation.decision).toBe("WARN");
    expect(evaluation.reason).toContain("SIMILAR_TO");
  });

  it("returns PASS for low similarity", () => {
    const result = {
      maxSimilarity: 0.3,
      mostSimilarPath: "existing.ts",
      shouldReject: false,
      shouldWarn: false,
      similarIndicators: [],
      comparisonCount: 1,
    };

    const evaluation = evaluateSimilarityResult(result);
    expect(evaluation.decision).toBe("PASS");
    expect(evaluation.reason).toContain("novel");
  });

  it("returns PASS for no comparisons", () => {
    const result = {
      maxSimilarity: 0,
      shouldReject: false,
      shouldWarn: false,
      similarIndicators: [],
      comparisonCount: 0,
    };

    const evaluation = evaluateSimilarityResult(result);
    expect(evaluation.decision).toBe("PASS");
    expect(evaluation.reason).toContain("No existing");
  });
});

// ============================================
// normalizeCode Tests
// ============================================

describe("normalizeCode", () => {
  it("removes comments", () => {
    const codeWithComments = `
      // This is a comment
      function add(a: number, b: number): number {
        /* Multi-line
           comment */
        return a + b; // inline comment
      }
    `;

    const normalized = normalizeCode(codeWithComments);
    expect(normalized).not.toContain("This is a comment");
    expect(normalized).not.toContain("Multi-line");
  });

  it("preserves code structure", () => {
    const code = `function add(a: number, b: number): number { return a + b; }`;
    const normalized = normalizeCode(code);

    expect(normalized).toContain("function");
    expect(normalized).toContain("return");
  });
});

// ============================================
// extractComputationalCore Tests
// ============================================

describe("extractComputationalCore", () => {
  it("extracts function bodies", () => {
    const cores = extractComputationalCore(SIMPLE_FUNCTION);
    expect(cores.length).toBeGreaterThan(0);
  });

  it("extracts multiple functions", () => {
    const multiFunction = `
      function add(a: number, b: number): number { return a + b; }
      function sub(a: number, b: number): number { return a - b; }
    `;

    const cores = extractComputationalCore(multiFunction);
    expect(cores.length).toBe(2);
  });

  it("handles arrow functions", () => {
    const arrowFn = `const add = (a: number, b: number): number => a + b;`;
    const cores = extractComputationalCore(arrowFn);
    expect(cores.length).toBeGreaterThan(0);
  });

  it("returns empty for code without functions", () => {
    const noFunctions = `const x = 1; const y = 2;`;
    const cores = extractComputationalCore(noFunctions);
    expect(cores.length).toBe(0);
  });
});

// ============================================
// compareComputationalCore Tests
// ============================================

describe("compareComputationalCore", () => {
  it("returns high similarity for same logic different names", () => {
    const similarity = compareComputationalCore(RSI_INDICATOR, RSI_VARIANT);
    expect(similarity).toBeGreaterThan(0.7);
  });

  it("returns low similarity for different logic", () => {
    const similarity = compareComputationalCore(RSI_INDICATOR, SMA_INDICATOR);
    expect(similarity).toBeLessThan(0.6);
  });

  it("returns 0 for code without functions", () => {
    const noFunctions = `const x = 1;`;
    const similarity = compareComputationalCore(noFunctions, SIMPLE_FUNCTION);
    expect(similarity).toBe(0);
  });
});

// ============================================
// Real Indicator Tests
// ============================================

describe("Real Indicator Scenarios", () => {
  it("detects RSI reimplementation", () => {
    const existing = new Map([["rsi.ts", RSI_INDICATOR]]);
    const result = compareIndicator(RSI_VARIANT, existing);

    // Should detect these are similar
    expect(result.maxSimilarity).toBeGreaterThan(0.5);
  });

  it("distinguishes RSI from SMA", () => {
    const existing = new Map([["rsi.ts", RSI_INDICATOR]]);
    const result = compareIndicator(SMA_INDICATOR, existing);

    // Should not flag as too similar
    expect(result.shouldReject).toBe(false);
  });

  it("uses correct default thresholds", () => {
    expect(AST_SIMILARITY_DEFAULTS.rejectThreshold).toBe(0.8);
    expect(AST_SIMILARITY_DEFAULTS.warnThreshold).toBe(0.5);
  });
});
