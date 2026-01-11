/**
 * Statistical Functions for IC Calculation
 *
 * Core statistical functions including correlation calculations and rank computation.
 */

/**
 * Calculate Spearman rank correlation between two arrays.
 */
export function spearmanCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length) {
    throw new Error(`Arrays must have same length: ${x.length} vs ${y.length}`);
  }

  const n = x.length;
  if (n < 2) {
    return 0;
  }

  const rankX = computeRanks(x);
  const rankY = computeRanks(y);

  return pearsonCorrelation(rankX, rankY);
}

/**
 * Calculate Pearson correlation coefficient.
 */
export function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 2) {
    return 0;
  }

  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;

  for (let i = 0; i < n; i++) {
    const dx = (x[i] ?? 0) - meanX;
    const dy = (y[i] ?? 0) - meanY;
    sumXY += dx * dy;
    sumX2 += dx * dx;
    sumY2 += dy * dy;
  }

  const denominator = Math.sqrt(sumX2 * sumY2);
  if (denominator < 1e-15) {
    return 0;
  }

  return sumXY / denominator;
}

/**
 * Compute ranks for an array (handling ties with average rank).
 */
export function computeRanks(arr: number[]): number[] {
  const n = arr.length;
  const indexed = arr.map((v, i) => ({ value: v, index: i }));
  indexed.sort((a, b) => a.value - b.value);

  const ranks = new Array<number>(n);
  let i = 0;

  while (i < n) {
    let j = i;
    // Find all tied values
    while (j < n - 1 && indexed[j]?.value === indexed[j + 1]?.value) {
      j++;
    }

    // Average rank for tied values
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) {
      const idx = indexed[k]?.index;
      if (idx !== undefined) {
        ranks[idx] = avgRank;
      }
    }

    i = j + 1;
  }

  return ranks;
}
