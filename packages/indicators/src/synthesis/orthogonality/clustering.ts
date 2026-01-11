/**
 * Linear Algebra Utilities for Indicator Clustering
 *
 * Matrix operations used for VIF computation and regression analysis.
 */

/**
 * Invert a matrix using Gauss-Jordan elimination.
 */
export function invertMatrix(matrix: number[][]): number[][] | null {
  const n = matrix.length;
  const augmented: number[][] = matrix.map((row, i) => {
    const identity = Array(n).fill(0) as number[];
    identity[i] = 1;
    return [...row, ...identity];
  });

  for (let col = 0; col < n; col++) {
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

    const tempRow = augmented[col];
    const maxRowData = augmented[maxRow];
    if (tempRow && maxRowData) {
      augmented[col] = maxRowData;
      augmented[maxRow] = tempRow;
    }

    const currentRow = augmented[col];
    if (!currentRow || Math.abs(currentRow[col] ?? 0) < 1e-12) {
      return null;
    }

    const scale = currentRow[col] ?? 1;
    for (let j = 0; j < 2 * n; j++) {
      currentRow[j] = (currentRow[j] ?? 0) / scale;
    }

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

  return augmented.map((row) => row.slice(n));
}

/**
 * Solve linear regression using normal equations: (X'X)^-1 X'y
 * Returns coefficients and R-squared.
 */
export function linearRegression(
  X: number[][],
  y: number[]
): { coefficients: number[]; rSquared: number } {
  const n = y.length;
  const firstRow = X[0];
  if (!firstRow) {
    return { coefficients: [0], rSquared: 0 };
  }
  const p = firstRow.length;

  const XWithIntercept: number[][] = X.map((row) => [1, ...row]);
  const pWithIntercept = p + 1;

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

  const invXtX = invertMatrix(XtX);
  if (!invXtX) {
    return { coefficients: Array(pWithIntercept).fill(0), rSquared: 0 };
  }

  const coefficients: number[] = Array(pWithIntercept).fill(0) as number[];
  for (let i = 0; i < pWithIntercept; i++) {
    const invRow = invXtX[i];
    if (invRow) {
      for (let j = 0; j < pWithIntercept; j++) {
        coefficients[i] = (coefficients[i] ?? 0) + (invRow[j] ?? 0) * (Xty[j] ?? 0);
      }
    }
  }

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
