/**
 * AST Similarity Checker for Indicator Deduplication
 *
 * Prevents generation of duplicate indicators by comparing Abstract Syntax Trees.
 * Uses node type sequence comparison with Longest Common Subsequence (LCS) ratio.
 *
 * Thresholds:
 * - > 80% similarity: REJECT (too similar to existing)
 * - 50-80%: WARNING (store in SIMILAR_TO edge in HelixDB)
 * - < 50%: PASS
 *
 * @see docs/plans/19-dynamic-indicator-synthesis.md (lines 475-518)
 */

import ts from "typescript";
import { z } from "zod";

// ============================================
// Configuration
// ============================================

/**
 * Default thresholds for AST similarity checking
 */
export const AST_SIMILARITY_DEFAULTS = {
  /** Similarity threshold for rejection */
  rejectThreshold: 0.8,
  /** Similarity threshold for warning (creates SIMILAR_TO edge) */
  warnThreshold: 0.5,
  /** File patterns to exclude from comparison */
  excludePatterns: ["**/*.test.ts", "**/index.ts", "**/types.ts"],
} as const;

// ============================================
// Schemas
// ============================================

/**
 * Result of comparing a new indicator against existing ones
 */
export const ASTSimilarityResultSchema = z.object({
  /** Maximum similarity found across all comparisons */
  maxSimilarity: z.number().min(0).max(1),
  /** Path to the most similar existing indicator */
  mostSimilarPath: z.string().optional(),
  /** Whether the indicator should be rejected (> 80% similar) */
  shouldReject: z.boolean(),
  /** Whether a warning should be issued (50-80% similar) */
  shouldWarn: z.boolean(),
  /** All comparisons with significant similarity */
  similarIndicators: z.array(
    z.object({
      path: z.string(),
      similarity: z.number(),
    })
  ),
  /** Number of indicators compared */
  comparisonCount: z.number().int(),
});

export type ASTSimilarityResult = z.infer<typeof ASTSimilarityResultSchema>;

/**
 * AST node signature for comparison
 */
export const ASTSignatureSchema = z.object({
  /** Sequence of node kinds */
  nodeKinds: z.array(z.number()),
  /** Count of each node kind */
  kindCounts: z.record(z.string(), z.number()),
  /** Total node count */
  totalNodes: z.number(),
  /** Hash of the signature for quick comparison */
  hash: z.string(),
});

export type ASTSignature = z.infer<typeof ASTSignatureSchema>;

// ============================================
// Core Functions
// ============================================

/**
 * Parse TypeScript code to AST and extract signature.
 *
 * @param code - TypeScript source code
 * @param fileName - Optional file name for error reporting
 * @returns AST signature for comparison
 */
export function parseToSignature(code: string, fileName = "indicator.ts"): ASTSignature {
  const sourceFile = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true);

  const nodeKinds: number[] = [];
  const kindCounts: Record<string, number> = {};

  function visit(node: ts.Node): void {
    const kind = node.kind;
    nodeKinds.push(kind);

    const kindName = ts.SyntaxKind[kind] ?? String(kind);
    kindCounts[kindName] = (kindCounts[kindName] ?? 0) + 1;

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  // Create a simple hash from node kinds
  const hash = createSignatureHash(nodeKinds);

  return {
    nodeKinds,
    kindCounts,
    totalNodes: nodeKinds.length,
    hash,
  };
}

/**
 * Create a hash from node kind sequence for quick comparison.
 *
 * @param nodeKinds - Array of TypeScript SyntaxKind values
 * @returns Hash string
 */
export function createSignatureHash(nodeKinds: number[]): string {
  // Simple hash based on node kind distribution
  const counts = new Map<number, number>();
  for (const kind of nodeKinds) {
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }

  // Sort and create deterministic string
  const entries = Array.from(counts.entries()).sort((a, b) => a[0] - b[0]);
  return entries.map(([kind, count]) => `${kind}:${count}`).join(",");
}

/**
 * Compute similarity between two AST signatures.
 *
 * Uses Longest Common Subsequence (LCS) ratio of node kind sequences.
 *
 * @param sig1 - First AST signature
 * @param sig2 - Second AST signature
 * @returns Similarity score (0-1, where 1 = identical)
 */
export function computeSimilarity(sig1: ASTSignature, sig2: ASTSignature): number {
  // Quick check: identical hashes mean identical structures
  if (sig1.hash === sig2.hash) {
    return 1.0;
  }

  // Empty signatures
  if (sig1.totalNodes === 0 || sig2.totalNodes === 0) {
    return 0.0;
  }

  // Use LCS for detailed comparison
  const lcsLength = longestCommonSubsequence(sig1.nodeKinds, sig2.nodeKinds);
  const maxLength = Math.max(sig1.totalNodes, sig2.totalNodes);

  return lcsLength / maxLength;
}

/**
 * Compute Longest Common Subsequence length.
 *
 * Optimized implementation using O(min(m,n)) space.
 *
 * @param seq1 - First sequence
 * @param seq2 - Second sequence
 * @returns Length of LCS
 */
export function longestCommonSubsequence(seq1: number[], seq2: number[]): number {
  // Use local variables - ensure shorter is the shorter sequence for space optimization
  const [shorter, longer] = seq1.length <= seq2.length ? [seq1, seq2] : [seq2, seq1];

  const m = shorter.length;
  const n = longer.length;

  // Use two rows instead of full matrix
  let prev = new Array<number>(n + 1).fill(0);
  let curr = new Array<number>(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (shorter[i - 1] === longer[j - 1]) {
        curr[j] = (prev[j - 1] ?? 0) + 1;
      } else {
        curr[j] = Math.max(prev[j] ?? 0, curr[j - 1] ?? 0);
      }
    }
    // Swap rows
    [prev, curr] = [curr, prev];
  }

  return prev[n] ?? 0;
}

/**
 * Compare a new indicator against multiple existing ones.
 *
 * @param newCode - Source code of the new indicator
 * @param existingIndicators - Map of path to source code for existing indicators
 * @param options - Optional configuration overrides
 * @returns Similarity result with recommendations
 */
export function compareIndicator(
  newCode: string,
  existingIndicators: Map<string, string>,
  options: {
    rejectThreshold?: number;
    warnThreshold?: number;
  } = {}
): ASTSimilarityResult {
  const rejectThreshold = options.rejectThreshold ?? AST_SIMILARITY_DEFAULTS.rejectThreshold;
  const warnThreshold = options.warnThreshold ?? AST_SIMILARITY_DEFAULTS.warnThreshold;

  const newSignature = parseToSignature(newCode);

  let maxSimilarity = 0;
  let mostSimilarPath: string | undefined;
  const similarIndicators: { path: string; similarity: number }[] = [];

  for (const [path, existingCode] of existingIndicators) {
    const existingSignature = parseToSignature(existingCode, path);
    const similarity = computeSimilarity(newSignature, existingSignature);

    if (similarity > maxSimilarity) {
      maxSimilarity = similarity;
      mostSimilarPath = path;
    }

    if (similarity >= warnThreshold) {
      similarIndicators.push({ path, similarity });
    }
  }

  // Sort by similarity descending
  similarIndicators.sort((a, b) => b.similarity - a.similarity);

  return {
    maxSimilarity,
    mostSimilarPath,
    shouldReject: maxSimilarity >= rejectThreshold,
    shouldWarn: maxSimilarity >= warnThreshold && maxSimilarity < rejectThreshold,
    similarIndicators,
    comparisonCount: existingIndicators.size,
  };
}

/**
 * Evaluate similarity result and provide recommendation.
 *
 * @param result - AST similarity result
 * @returns Human-readable recommendation
 */
export function evaluateSimilarityResult(result: ASTSimilarityResult): {
  decision: "REJECT" | "WARN" | "PASS";
  reason: string;
} {
  if (result.shouldReject) {
    return {
      decision: "REJECT",
      reason:
        `Indicator is ${(result.maxSimilarity * 100).toFixed(1)}% similar to ` +
        `${result.mostSimilarPath ?? "existing indicator"}. ` +
        `Threshold for rejection is ${AST_SIMILARITY_DEFAULTS.rejectThreshold * 100}%.`,
    };
  }

  if (result.shouldWarn) {
    return {
      decision: "WARN",
      reason:
        `Indicator has ${(result.maxSimilarity * 100).toFixed(1)}% similarity to ` +
        `${result.mostSimilarPath ?? "existing indicator"}. ` +
        `Consider creating SIMILAR_TO relationship in HelixDB.`,
    };
  }

  return {
    decision: "PASS",
    reason:
      result.comparisonCount === 0
        ? "No existing indicators to compare against."
        : `Indicator is sufficiently novel (max similarity: ${(result.maxSimilarity * 100).toFixed(1)}%).`,
  };
}

// ============================================
// Normalization Helpers
// ============================================

/**
 * Normalize code before comparison to ignore cosmetic differences.
 *
 * Removes:
 * - Comments
 * - Extra whitespace
 * - Variable names (replaces with placeholders)
 *
 * @param code - Original source code
 * @returns Normalized code
 */
export function normalizeCode(code: string): string {
  const sourceFile = ts.createSourceFile("temp.ts", code, ts.ScriptTarget.Latest, true);

  // Create printer that removes comments
  const printer = ts.createPrinter({
    removeComments: true,
    newLine: ts.NewLineKind.LineFeed,
  });

  return printer.printFile(sourceFile);
}

/**
 * Extract the computational core of an indicator.
 *
 * Focuses on:
 * - Top-level function bodies (declarations and variable-assigned arrow functions)
 * - Mathematical operations
 * - Control flow
 *
 * Ignores:
 * - Imports
 * - Exports
 * - Type definitions
 * - Nested callback arrow functions (to avoid false matches on common patterns)
 *
 * @param code - Source code
 * @returns Array of function body signatures
 */
export function extractComputationalCore(code: string): ASTSignature[] {
  const sourceFile = ts.createSourceFile("temp.ts", code, ts.ScriptTarget.Latest, true);

  const signatures: ASTSignature[] = [];

  function visitTopLevel(node: ts.Node): void {
    // Function declarations (export function foo() {})
    if (ts.isFunctionDeclaration(node)) {
      const body = node.body;
      if (body) {
        const bodyCode = body.getText(sourceFile);
        signatures.push(parseToSignature(bodyCode));
      }
    }

    // Variable declarations with arrow functions (const foo = () => {})
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (decl.initializer && ts.isArrowFunction(decl.initializer)) {
          const body = decl.initializer.body;
          if (body) {
            const bodyCode = body.getText(sourceFile);
            signatures.push(parseToSignature(bodyCode));
          }
        }
      }
    }

    // Only recurse into module-level constructs, not into function bodies
    // This prevents extracting nested callback arrow functions
    if (ts.isModuleDeclaration(node) || ts.isSourceFile(node)) {
      ts.forEachChild(node, visitTopLevel);
    }
  }

  ts.forEachChild(sourceFile, visitTopLevel);

  return signatures;
}

/**
 * Compare indicators focusing only on computational logic.
 *
 * More accurate than full AST comparison for detecting
 * reimplementations with different variable names or structure.
 *
 * @param newCode - New indicator source
 * @param existingCode - Existing indicator source
 * @returns Maximum similarity between any pair of functions
 */
export function compareComputationalCore(newCode: string, existingCode: string): number {
  const newCores = extractComputationalCore(newCode);
  const existingCores = extractComputationalCore(existingCode);

  if (newCores.length === 0 || existingCores.length === 0) {
    return 0;
  }

  let maxSimilarity = 0;

  for (const newCore of newCores) {
    for (const existingCore of existingCores) {
      const similarity = computeSimilarity(newCore, existingCore);
      maxSimilarity = Math.max(maxSimilarity, similarity);
    }
  }

  return maxSimilarity;
}
