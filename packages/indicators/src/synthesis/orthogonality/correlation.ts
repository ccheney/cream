/**
 * Correlation Matrix Calculations
 *
 * Functions for computing Pearson correlation between indicators.
 */

import { type CorrelationResult, ORTHOGONALITY_DEFAULTS } from "./types.js";

/**
 * Compute Pearson correlation coefficient between two arrays.
 * Handles NaN values by excluding them from calculation.
 */
export function pearsonCorrelation(x: number[], y: number[]): { correlation: number; n: number } {
  if (x.length !== y.length) {
    throw new Error("Arrays must have same length");
  }

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

  let sumX = 0;
  let sumY = 0;
  for (const [xi, yi] of validPairs) {
    sumX += xi;
    sumY += yi;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

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

  results.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));

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
