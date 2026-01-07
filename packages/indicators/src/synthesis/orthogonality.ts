/**
 * Orthogonality Checker Module
 *
 * Assesses indicator independence using correlation analysis and Variance Inflation Factor (VIF).
 * Ensures new indicators provide unique information not captured by existing factors.
 *
 * @see docs/research/indicator-validation-statistics.md Section 5
 */

import { z } from "zod/v4";

// ============================================
// Constants and Defaults
// ============================================

/**
 * Default configuration for orthogonality checks.
 */
export const ORTHOGONALITY_DEFAULTS = {
  /** Maximum acceptable correlation with any existing indicator */
  maxCorrelation: 0.7,
  /** Maximum acceptable VIF (Variance Inflation Factor) */
  maxVIF: 5.0,
  /** Minimum observations required for reliable correlation */
  minObservations: 30,
  /** Warning threshold for moderate correlation */
  correlationWarning: 0.5,
  /** Warning threshold for moderate VIF */
  vifWarning: 3.0,
} as const;

// ============================================
// Schemas
// ============================================

/**
 * Schema for correlation result between two indicators.
 */
export const CorrelationResultSchema = z.object({
  /** Name of the compared indicator */
  name: z.string(),
  /** Pearson correlation coefficient */
  correlation: z.number().min(-1).max(1),
  /** Number of overlapping observations */
  nObservations: z.number().int().nonnegative(),
  /** Whether this correlation is acceptable */
  isAcceptable: z.boolean(),
  /** Whether this triggers a warning */
  isWarning: z.boolean(),
});

export type CorrelationResult = z.infer<typeof CorrelationResultSchema>;

/**
 * Schema for VIF calculation result.
 */
export const VIFResultSchema = z.object({
  /** Calculated VIF value */
  vif: z.number().nonnegative(),
  /** R-squared from regression */
  rSquared: z.number().min(0).max(1),
  /** Number of observations used */
  nObservations: z.number().int().nonnegative(),
  /** Number of existing indicators */
  nIndicators: z.number().int().nonnegative(),
  /** Whether VIF is acceptable */
  isAcceptable: z.boolean(),
  /** Whether this triggers a warning */
  isWarning: z.boolean(),
});

export type VIFResult = z.infer<typeof VIFResultSchema>;

/**
 * Input schema for orthogonality check.
 */
export const OrthogonalityInputSchema = z.object({
  /** New indicator values to check */
  newIndicator: z.array(z.number()),
  /** Map of existing indicator names to their values */
  existingIndicators: z.record(z.string(), z.array(z.number())),
  /** Maximum acceptable correlation (default: 0.7) */
  maxCorrelation: z.number().min(0).max(1).optional().default(0.7),
  /** Maximum acceptable VIF (default: 5.0) */
  maxVIF: z.number().positive().optional().default(5.0),
  /** Minimum observations required (default: 30) */
  minObservations: z.number().int().positive().optional().default(30),
});

export type OrthogonalityInput = z.input<typeof OrthogonalityInputSchema>;

/**
 * Schema for orthogonality check result.
 */
export const OrthogonalityResultSchema = z.object({
  /** Is the new indicator sufficiently orthogonal? */
  isOrthogonal: z.boolean(),
  /** Maximum correlation found with any existing indicator */
  maxCorrelationFound: z.number().min(-1).max(1),
  /** Name of the most correlated indicator */
  mostCorrelatedWith: z.string().nullable(),
  /** VIF result if multiple indicators exist */
  vif: VIFResultSchema.nullable(),
  /** Individual correlation results */
  correlations: z.array(CorrelationResultSchema),
  /** Summary of orthogonality status */
  summary: z.string(),
  /** Detailed recommendations */
  recommendations: z.array(z.string()),
  /** Thresholds used for evaluation */
  thresholds: z.object({
    maxCorrelation: z.number(),
    maxVIF: z.number(),
    minObservations: z.number(),
  }),
});

export type OrthogonalityResult = z.infer<typeof OrthogonalityResultSchema>;

// ============================================
// Statistical Utilities
// ============================================

/**
 * Compute Pearson correlation coefficient between two arrays.
 * Handles NaN values by excluding them from calculation.
 */
export function pearsonCorrelation(x: number[], y: number[]): { correlation: number; n: number } {
  if (x.length !== y.length) {
    throw new Error("Arrays must have same length");
  }

  // Filter out NaN values (both must be valid)
  const validPairs: Array<[number, number]> = [];
  for (let i = 0; i < x.length; i++) {
    const xi = x[i];
    const yi = y[i];
    if (
      xi !== undefined &&
      yi !== undefined &&
      !Number.isNaN(xi) &&
      !Number.isNaN(yi) &&
      Number.isFinite(xi) &&
      Number.isFinite(yi)
    ) {
      validPairs.push([xi, yi]);
    }
  }

  const n = validPairs.length;
  if (n < 2) {
    return { correlation: 0, n };
  }

  // Calculate means
  let sumX = 0;
  let sumY = 0;
  for (const [xi, yi] of validPairs) {
    sumX += xi;
    sumY += yi;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  // Calculate correlation
  let numerator = 0;
  let denomX = 0;
  let denomY = 0;

  for (const [xi, yi] of validPairs) {
    const dx = xi - meanX;
    const dy = yi - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  const denominator = Math.sqrt(denomX * denomY);
  if (denominator < 1e-15) {
    return { correlation: 0, n };
  }

  return { correlation: numerator / denominator, n };
}

/**
 * Compute pairwise correlations between a new indicator and existing ones.
 */
export function computePairwiseCorrelations(
  newIndicator: number[],
  existingIndicators: Record<string, number[]>,
  options: {
    maxCorrelation?: number;
    correlationWarning?: number;
    minObservations?: number;
  } = {}
): CorrelationResult[] {
  const maxCorr = options.maxCorrelation ?? ORTHOGONALITY_DEFAULTS.maxCorrelation;
  const warnCorr = options.correlationWarning ?? ORTHOGONALITY_DEFAULTS.correlationWarning;
  const minObs = options.minObservations ?? ORTHOGONALITY_DEFAULTS.minObservations;

  const results: CorrelationResult[] = [];

  for (const [name, existing] of Object.entries(existingIndicators)) {
    // Ensure arrays have same length
    const minLen = Math.min(newIndicator.length, existing.length);
    const newSlice = newIndicator.slice(0, minLen);
    const existingSlice = existing.slice(0, minLen);

    const { correlation, n } = pearsonCorrelation(newSlice, existingSlice);

    const absCorr = Math.abs(correlation);
    const isAcceptable = n >= minObs && absCorr < maxCorr;
    const isWarning = absCorr >= warnCorr && absCorr < maxCorr;

    results.push({
      name,
      correlation,
      nObservations: n,
      isAcceptable,
      isWarning,
    });
  }

  // Sort by absolute correlation descending
  results.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));

  return results;
}

/**
 * Solve linear regression using normal equations: (X'X)^-1 X'y
 * Returns coefficients and R-squared.
 */
function linearRegression(
  X: number[][],
  y: number[]
): { coefficients: number[]; rSquared: number } {
  const n = y.length;
  const firstRow = X[0];
  if (!firstRow) {
    return { coefficients: [0], rSquared: 0 };
  }
  const p = firstRow.length;

  // Add intercept column
  const XWithIntercept: number[][] = X.map((row) => [1, ...row]);
  const pWithIntercept = p + 1;

  // Compute X'X
  const XtX: number[][] = Array.from(
    { length: pWithIntercept },
    () => Array(pWithIntercept).fill(0) as number[]
  );
  for (let i = 0; i < pWithIntercept; i++) {
    for (let j = 0; j < pWithIntercept; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        const row = XWithIntercept[k];
        if (row) {
          const vi = row[i] ?? 0;
          const vj = row[j] ?? 0;
          sum += vi * vj;
        }
      }
      const xtxRow = XtX[i];
      if (xtxRow) {
        xtxRow[j] = sum;
      }
    }
  }

  // Compute X'y
  const Xty: number[] = Array(pWithIntercept).fill(0) as number[];
  for (let i = 0; i < pWithIntercept; i++) {
    for (let k = 0; k < n; k++) {
      const row = XWithIntercept[k];
      const yk = y[k] ?? 0;
      if (row) {
        Xty[i] = (Xty[i] ?? 0) + (row[i] ?? 0) * yk;
      }
    }
  }

  // Invert X'X using Gaussian elimination
  const invXtX = invertMatrix(XtX);
  if (!invXtX) {
    // Singular matrix, return zero coefficients
    return { coefficients: Array(pWithIntercept).fill(0), rSquared: 0 };
  }

  // Compute coefficients: (X'X)^-1 X'y
  const coefficients: number[] = Array(pWithIntercept).fill(0) as number[];
  for (let i = 0; i < pWithIntercept; i++) {
    const invRow = invXtX[i];
    if (invRow) {
      for (let j = 0; j < pWithIntercept; j++) {
        coefficients[i] = (coefficients[i] ?? 0) + (invRow[j] ?? 0) * (Xty[j] ?? 0);
      }
    }
  }

  // Compute predictions
  const predictions: number[] = [];
  for (let k = 0; k < n; k++) {
    const row = XWithIntercept[k];
    let pred = 0;
    if (row) {
      for (let i = 0; i < pWithIntercept; i++) {
        pred += (row[i] ?? 0) * (coefficients[i] ?? 0);
      }
    }
    predictions.push(pred);
  }

  // Compute R-squared
  const yMean = y.reduce((a, b) => a + b, 0) / n;
  let ssRes = 0;
  let ssTot = 0;
  for (let k = 0; k < n; k++) {
    const yk = y[k] ?? 0;
    const pk = predictions[k] ?? 0;
    ssRes += (yk - pk) ** 2;
    ssTot += (yk - yMean) ** 2;
  }

  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  return { coefficients, rSquared: Math.max(0, Math.min(1, rSquared)) };
}

/**
 * Invert a matrix using Gauss-Jordan elimination.
 */
function invertMatrix(matrix: number[][]): number[][] | null {
  const n = matrix.length;
  const augmented: number[][] = matrix.map((row, i) => {
    const identity = Array(n).fill(0) as number[];
    identity[i] = 1;
    return [...row, ...identity];
  });

  // Forward elimination
  for (let col = 0; col < n; col++) {
    // Find pivot
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      const augRow = augmented[row];
      const augMaxRow = augmented[maxRow];
      if (augRow && augMaxRow) {
        if (Math.abs(augRow[col] ?? 0) > Math.abs(augMaxRow[col] ?? 0)) {
          maxRow = row;
        }
      }
    }

    // Swap rows
    const tempRow = augmented[col];
    const maxRowData = augmented[maxRow];
    if (tempRow && maxRowData) {
      augmented[col] = maxRowData;
      augmented[maxRow] = tempRow;
    }

    // Check for singularity
    const currentRow = augmented[col];
    if (!currentRow || Math.abs(currentRow[col] ?? 0) < 1e-12) {
      return null;
    }

    // Scale pivot row
    const scale = currentRow[col] ?? 1;
    for (let j = 0; j < 2 * n; j++) {
      currentRow[j] = (currentRow[j] ?? 0) / scale;
    }

    // Eliminate column
    for (let row = 0; row < n; row++) {
      if (row !== col) {
        const targetRow = augmented[row];
        if (targetRow) {
          const factor = targetRow[col] ?? 0;
          for (let j = 0; j < 2 * n; j++) {
            targetRow[j] = (targetRow[j] ?? 0) - factor * (currentRow[j] ?? 0);
          }
        }
      }
    }
  }

  // Extract inverse
  return augmented.map((row) => row.slice(n));
}

/**
 * Compute Variance Inflation Factor for a new indicator.
 * VIF = 1 / (1 - R²) where R² is from regressing the new indicator on all existing ones.
 */
export function computeVIF(
  newIndicator: number[],
  existingIndicators: Record<string, number[]>,
  options: {
    maxVIF?: number;
    vifWarning?: number;
    minObservations?: number;
  } = {}
): VIFResult {
  const maxVIF = options.maxVIF ?? ORTHOGONALITY_DEFAULTS.maxVIF;
  const warnVIF = options.vifWarning ?? ORTHOGONALITY_DEFAULTS.vifWarning;
  const minObs = options.minObservations ?? ORTHOGONALITY_DEFAULTS.minObservations;

  const indicatorNames = Object.keys(existingIndicators);
  const nIndicators = indicatorNames.length;

  // Need at least one existing indicator
  if (nIndicators === 0) {
    return {
      vif: 1.0,
      rSquared: 0,
      nObservations: newIndicator.filter((v) => !Number.isNaN(v)).length,
      nIndicators: 0,
      isAcceptable: true,
      isWarning: false,
    };
  }

  // Find valid observations (all values must be present)
  const validIndices: number[] = [];
  const lengths = indicatorNames.map((name) => existingIndicators[name]?.length ?? 0);
  const minLen = Math.min(newIndicator.length, ...lengths);

  for (let i = 0; i < minLen; i++) {
    const newVal = newIndicator[i];
    if (newVal === undefined || Number.isNaN(newVal) || !Number.isFinite(newVal)) {
      continue;
    }

    let allValid = true;
    for (const name of indicatorNames) {
      const indicator = existingIndicators[name];
      const val = indicator?.[i];
      if (val === undefined || Number.isNaN(val) || !Number.isFinite(val)) {
        allValid = false;
        break;
      }
    }

    if (allValid) {
      validIndices.push(i);
    }
  }

  const n = validIndices.length;

  // Need minimum observations (more than number of predictors)
  if (n < nIndicators + 10 || n < minObs) {
    return {
      vif: Number.POSITIVE_INFINITY,
      rSquared: 0,
      nObservations: n,
      nIndicators,
      isAcceptable: false,
      isWarning: true,
    };
  }

  // Build X matrix and y vector
  const X: number[][] = validIndices.map((i) =>
    indicatorNames.map((name) => existingIndicators[name]?.[i] ?? 0)
  );
  const y: number[] = validIndices.map((i) => newIndicator[i] ?? 0);

  // Run regression
  const { rSquared } = linearRegression(X, y);

  // Calculate VIF
  let vif: number;
  if (rSquared >= 1 - 1e-10) {
    vif = Number.POSITIVE_INFINITY;
  } else {
    vif = 1 / (1 - rSquared);
  }

  const isAcceptable = vif < maxVIF;
  const isWarning = vif >= warnVIF && vif < maxVIF;

  return {
    vif,
    rSquared,
    nObservations: n,
    nIndicators,
    isAcceptable,
    isWarning,
  };
}

/**
 * Orthogonalize a new indicator by removing correlation with existing ones.
 * Returns the residuals from regressing the new indicator on the correlated one.
 */
export function orthogonalize(newIndicator: number[], correlatedIndicator: number[]): number[] {
  const n = Math.min(newIndicator.length, correlatedIndicator.length);
  const result = [...newIndicator];

  // Find valid pairs
  const validIndices: number[] = [];
  for (let i = 0; i < n; i++) {
    const newVal = newIndicator[i];
    const corrVal = correlatedIndicator[i];
    if (
      newVal !== undefined &&
      corrVal !== undefined &&
      !Number.isNaN(newVal) &&
      !Number.isNaN(corrVal) &&
      Number.isFinite(newVal) &&
      Number.isFinite(corrVal)
    ) {
      validIndices.push(i);
    }
  }

  if (validIndices.length < 3) {
    return result;
  }

  // Simple linear regression: newIndicator = a + b * correlatedIndicator
  const X = validIndices.map((i) => [correlatedIndicator[i] ?? 0]);
  const y = validIndices.map((i) => newIndicator[i] ?? 0);

  const { coefficients } = linearRegression(X, y);
  const intercept = coefficients[0] ?? 0;
  const slope = coefficients[1] ?? 0;

  // Compute residuals
  for (const i of validIndices) {
    const predicted = intercept + slope * (correlatedIndicator[i] ?? 0);
    result[i] = (newIndicator[i] ?? 0) - predicted;
  }

  return result;
}

/**
 * Orthogonalize against multiple indicators using multivariate regression.
 */
export function orthogonalizeMultiple(
  newIndicator: number[],
  existingIndicators: Record<string, number[]>
): number[] {
  const indicatorNames = Object.keys(existingIndicators);

  if (indicatorNames.length === 0) {
    return [...newIndicator];
  }

  const lengths = indicatorNames.map((name) => existingIndicators[name]?.length ?? 0);
  const minLen = Math.min(newIndicator.length, ...lengths);

  // Find valid observations
  const validIndices: number[] = [];
  for (let i = 0; i < minLen; i++) {
    const newVal = newIndicator[i];
    if (newVal === undefined || Number.isNaN(newVal) || !Number.isFinite(newVal)) {
      continue;
    }

    let allValid = true;
    for (const name of indicatorNames) {
      const indicator = existingIndicators[name];
      const val = indicator?.[i];
      if (val === undefined || Number.isNaN(val) || !Number.isFinite(val)) {
        allValid = false;
        break;
      }
    }

    if (allValid) {
      validIndices.push(i);
    }
  }

  if (validIndices.length < indicatorNames.length + 3) {
    return [...newIndicator];
  }

  // Build regression
  const X = validIndices.map((i) =>
    indicatorNames.map((name) => existingIndicators[name]?.[i] ?? 0)
  );
  const y = validIndices.map((i) => newIndicator[i] ?? 0);

  const { coefficients } = linearRegression(X, y);

  // Compute residuals
  const result = [...newIndicator];
  for (let idx = 0; idx < validIndices.length; idx++) {
    const i = validIndices[idx];
    if (i === undefined) {
      continue;
    }
    let predicted = coefficients[0] ?? 0; // intercept
    for (let j = 0; j < indicatorNames.length; j++) {
      const name = indicatorNames[j];
      if (name) {
        predicted += (coefficients[j + 1] ?? 0) * (existingIndicators[name]?.[i] ?? 0);
      }
    }
    result[i] = (newIndicator[i] ?? 0) - predicted;
  }

  return result;
}

// ============================================
// Main Orthogonality Check
// ============================================

/**
 * Perform comprehensive orthogonality check for a new indicator.
 */
export function checkOrthogonality(input: OrthogonalityInput): OrthogonalityResult {
  const parsed = OrthogonalityInputSchema.parse(input);
  const { newIndicator, existingIndicators, maxCorrelation, maxVIF, minObservations } = parsed;

  const recommendations: string[] = [];

  // Compute pairwise correlations
  const correlations = computePairwiseCorrelations(newIndicator, existingIndicators, {
    maxCorrelation,
    minObservations,
  });

  // Find maximum correlation
  let maxCorrelationFound = 0;
  let mostCorrelatedWith: string | null = null;

  for (const result of correlations) {
    const absCorr = Math.abs(result.correlation);
    if (absCorr > Math.abs(maxCorrelationFound)) {
      maxCorrelationFound = result.correlation;
      mostCorrelatedWith = result.name;
    }
  }

  // Check VIF if we have 2+ existing indicators
  let vifResult: VIFResult | null = null;
  const indicatorNames = Object.keys(existingIndicators);

  if (indicatorNames.length >= 2) {
    vifResult = computeVIF(newIndicator, existingIndicators, {
      maxVIF,
      minObservations,
    });
  }

  // Determine overall orthogonality
  const correlationsAcceptable = correlations.every((c) => c.isAcceptable);
  const vifAcceptable = vifResult === null || vifResult.isAcceptable;
  const isOrthogonal = correlationsAcceptable && vifAcceptable;

  // Generate recommendations
  if (!correlationsAcceptable) {
    const problematic = correlations.filter((c) => !c.isAcceptable);
    for (const p of problematic) {
      recommendations.push(
        `High correlation (${p.correlation.toFixed(3)}) with ${p.name}. Consider orthogonalizing or rejecting.`
      );
    }
  }

  const warningCorrelations = correlations.filter((c) => c.isWarning);
  for (const w of warningCorrelations) {
    recommendations.push(
      `Moderate correlation (${w.correlation.toFixed(3)}) with ${w.name}. Monitor for redundancy.`
    );
  }

  if (vifResult && !vifResult.isAcceptable) {
    recommendations.push(
      `VIF (${vifResult.vif.toFixed(2)}) exceeds threshold. High multicollinearity detected.`
    );
  } else if (vifResult?.isWarning) {
    recommendations.push(
      `VIF (${vifResult.vif.toFixed(2)}) is elevated. Some multicollinearity present.`
    );
  }

  if (isOrthogonal && recommendations.length === 0) {
    recommendations.push("Indicator provides independent information. Safe to add.");
  }

  // Generate summary
  let summary: string;
  if (isOrthogonal) {
    if (warningCorrelations.length > 0 || vifResult?.isWarning) {
      summary = "Orthogonal with warnings";
    } else {
      summary = "Fully orthogonal";
    }
  } else {
    if (!correlationsAcceptable && !vifAcceptable) {
      summary = "Fails both correlation and VIF checks";
    } else if (!correlationsAcceptable) {
      summary = "Fails correlation check";
    } else {
      summary = "Fails VIF check";
    }
  }

  return {
    isOrthogonal,
    maxCorrelationFound,
    mostCorrelatedWith,
    vif: vifResult,
    correlations,
    summary,
    recommendations,
    thresholds: {
      maxCorrelation,
      maxVIF,
      minObservations,
    },
  };
}

/**
 * Check if an indicator is sufficiently orthogonal using default thresholds.
 */
export function isIndicatorOrthogonal(
  newIndicator: number[],
  existingIndicators: Record<string, number[]>,
  options?: Partial<OrthogonalityInput>
): boolean {
  const result = checkOrthogonality({
    newIndicator,
    existingIndicators,
    ...options,
  });
  return result.isOrthogonal;
}

/**
 * Evaluate orthogonality result and provide a recommendation.
 */
export function evaluateOrthogonality(result: OrthogonalityResult): {
  recommendation: "accept" | "warn" | "reject";
  explanation: string;
} {
  if (!result.isOrthogonal) {
    let explanation = "Reject: ";
    const issues: string[] = [];

    const unacceptableCorrs = result.correlations.filter((c) => !c.isAcceptable);
    if (unacceptableCorrs.length > 0) {
      const maxCorr = unacceptableCorrs[0];
      if (maxCorr) {
        issues.push(
          `correlation with ${maxCorr.name} is ${Math.abs(maxCorr.correlation).toFixed(3)} (max: ${result.thresholds.maxCorrelation})`
        );
      }
    }

    if (result.vif && !result.vif.isAcceptable) {
      issues.push(`VIF is ${result.vif.vif.toFixed(2)} (max: ${result.thresholds.maxVIF})`);
    }

    explanation += issues.join("; ");

    return { recommendation: "reject", explanation };
  }

  const hasWarnings = result.correlations.some((c) => c.isWarning) || result.vif?.isWarning;

  if (hasWarnings) {
    const warnings: string[] = [];

    const warningCorrs = result.correlations.filter((c) => c.isWarning);
    if (warningCorrs.length > 0) {
      const firstWarning = warningCorrs[0];
      if (firstWarning) {
        warnings.push(
          `moderate correlation (${Math.abs(firstWarning.correlation).toFixed(3)}) with ${firstWarning.name}`
        );
      }
    }

    if (result.vif?.isWarning) {
      warnings.push(`elevated VIF (${result.vif.vif.toFixed(2)})`);
    }

    return {
      recommendation: "warn",
      explanation: `Accept with caution: ${warnings.join("; ")}`,
    };
  }

  return {
    recommendation: "accept",
    explanation: "Indicator is sufficiently independent from existing indicators",
  };
}

/**
 * Find the best candidate from multiple indicators based on orthogonality.
 */
export function rankByOrthogonality(
  candidates: Record<string, number[]>,
  existingIndicators: Record<string, number[]>,
  options?: Partial<OrthogonalityInput>
): Array<{
  name: string;
  result: OrthogonalityResult;
  score: number;
}> {
  const results: Array<{
    name: string;
    result: OrthogonalityResult;
    score: number;
  }> = [];

  for (const [name, indicator] of Object.entries(candidates)) {
    const result = checkOrthogonality({
      newIndicator: indicator,
      existingIndicators,
      ...options,
    });

    // Score: lower correlation and VIF = higher score
    // Base score from correlation (0 to 1, higher is better)
    const corrScore = 1 - Math.abs(result.maxCorrelationFound);

    // VIF score (1/VIF, capped at 1)
    const vifScore = result.vif ? Math.min(1, 1 / result.vif.vif) : 1;

    // Combined score
    const score = (corrScore + vifScore) / 2;

    results.push({ name, result, score });
  }

  // Sort by score descending (higher = more orthogonal)
  results.sort((a, b) => b.score - a.score);

  return results;
}

/**
 * Compute correlation matrix for a set of indicators.
 */
export function computeCorrelationMatrix(indicators: Record<string, number[]>): {
  names: string[];
  matrix: number[][];
  maxOffDiagonal: number;
  maxPair: [string, string] | null;
} {
  const names = Object.keys(indicators);
  const n = names.length;

  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0) as number[]);

  let maxOffDiagonal = 0;
  let maxPair: [string, string] | null = null;

  for (let i = 0; i < n; i++) {
    const matrixRow = matrix[i];
    if (matrixRow) {
      matrixRow[i] = 1.0;
    }

    for (let j = i + 1; j < n; j++) {
      const nameI = names[i];
      const nameJ = names[j];
      if (!nameI || !nameJ) {
        continue;
      }

      const indI = indicators[nameI];
      const indJ = indicators[nameJ];
      if (!indI || !indJ) {
        continue;
      }

      const { correlation } = pearsonCorrelation(indI, indJ);

      if (matrixRow) {
        matrixRow[j] = correlation;
      }
      const matrixRowJ = matrix[j];
      if (matrixRowJ) {
        matrixRowJ[i] = correlation;
      }

      if (Math.abs(correlation) > maxOffDiagonal) {
        maxOffDiagonal = Math.abs(correlation);
        maxPair = [nameI, nameJ];
      }
    }
  }

  return { names, matrix, maxOffDiagonal, maxPair };
}

/**
 * Compute VIF for all indicators in a set.
 */
export function computeAllVIFs(
  indicators: Record<string, number[]>,
  options?: {
    maxVIF?: number;
    minObservations?: number;
  }
): Record<string, VIFResult> {
  const names = Object.keys(indicators);
  const results: Record<string, VIFResult> = {};

  for (const name of names) {
    const indicator = indicators[name];
    if (!indicator) {
      continue;
    }

    // Create existing indicators map without the current one
    const others: Record<string, number[]> = {};
    for (const otherName of names) {
      if (otherName !== name) {
        const otherInd = indicators[otherName];
        if (otherInd) {
          others[otherName] = otherInd;
        }
      }
    }

    results[name] = computeVIF(indicator, others, options);
  }

  return results;
}
