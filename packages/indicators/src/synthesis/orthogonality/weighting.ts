/**
 * Weight Assignment for Indicators
 *
 * VIF computation and orthogonalization functions.
 */

import { linearRegression } from "./clustering.js";
import { ORTHOGONALITY_DEFAULTS, type VIFResult } from "./types.js";

/**
 * Compute Variance Inflation Factor for a new indicator.
 * VIF = 1 / (1 - R^2) where R^2 is from regressing the new indicator on all existing ones.
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

  const X: number[][] = validIndices.map((i) =>
    indicatorNames.map((name) => existingIndicators[name]?.[i] ?? 0)
  );
  const y: number[] = validIndices.map((i) => newIndicator[i] ?? 0);

  const { rSquared } = linearRegression(X, y);

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

/**
 * Orthogonalize a new indicator by removing correlation with existing ones.
 * Returns the residuals from regressing the new indicator on the correlated one.
 */
export function orthogonalize(newIndicator: number[], correlatedIndicator: number[]): number[] {
  const n = Math.min(newIndicator.length, correlatedIndicator.length);
  const result = [...newIndicator];

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

  const X = validIndices.map((i) => [correlatedIndicator[i] ?? 0]);
  const y = validIndices.map((i) => newIndicator[i] ?? 0);

  const { coefficients } = linearRegression(X, y);
  const intercept = coefficients[0] ?? 0;
  const slope = coefficients[1] ?? 0;

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

  const X = validIndices.map((i) =>
    indicatorNames.map((name) => existingIndicators[name]?.[i] ?? 0)
  );
  const y = validIndices.map((i) => newIndicator[i] ?? 0);

  const { coefficients } = linearRegression(X, y);

  const result = [...newIndicator];
  for (let idx = 0; idx < validIndices.length; idx++) {
    const i = validIndices[idx];
    if (i === undefined) {
      continue;
    }
    let predicted = coefficients[0] ?? 0;
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
