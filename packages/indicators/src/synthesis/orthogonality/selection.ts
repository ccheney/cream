/**
 * Orthogonal Indicator Selection
 *
 * Functions for checking orthogonality, evaluating results, and ranking indicators.
 */

import { computePairwiseCorrelations } from "./correlation.js";
import {
  type OrthogonalityInput,
  OrthogonalityInputSchema,
  type OrthogonalityResult,
  type VIFResult,
} from "./types.js";
import { computeVIF } from "./weighting.js";

/**
 * Perform comprehensive orthogonality check for a new indicator.
 */
export function checkOrthogonality(input: OrthogonalityInput): OrthogonalityResult {
  const parsed = OrthogonalityInputSchema.parse(input);
  const { newIndicator, existingIndicators, maxCorrelation, maxVIF, minObservations } = parsed;

  const recommendations: string[] = [];

  const correlations = computePairwiseCorrelations(newIndicator, existingIndicators, {
    maxCorrelation,
    minObservations,
  });

  let maxCorrelationFound = 0;
  let mostCorrelatedWith: string | null = null;

  for (const result of correlations) {
    const absCorr = Math.abs(result.correlation);
    if (absCorr > Math.abs(maxCorrelationFound)) {
      maxCorrelationFound = result.correlation;
      mostCorrelatedWith = result.name;
    }
  }

  let vifResult: VIFResult | null = null;
  const indicatorNames = Object.keys(existingIndicators);

  if (indicatorNames.length >= 2) {
    vifResult = computeVIF(newIndicator, existingIndicators, {
      maxVIF,
      minObservations,
    });
  }

  const correlationsAcceptable = correlations.every((c) => c.isAcceptable);
  const vifAcceptable = vifResult === null || vifResult.isAcceptable;
  const isOrthogonal = correlationsAcceptable && vifAcceptable;

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

  let summary: string;
  if (isOrthogonal) {
    if (warningCorrelations.length > 0 || vifResult?.isWarning) {
      summary = "Orthogonal with warnings";
    } else {
      summary = "Fully orthogonal";
    }
  } else if (!correlationsAcceptable && !vifAcceptable) {
    summary = "Fails both correlation and VIF checks";
  } else if (!correlationsAcceptable) {
    summary = "Fails correlation check";
  } else {
    summary = "Fails VIF check";
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

    const corrScore = 1 - Math.abs(result.maxCorrelationFound);
    const vifScore = result.vif ? Math.min(1, 1 / result.vif.vif) : 1;
    const score = (corrScore + vifScore) / 2;

    results.push({ name, result, score });
  }

  results.sort((a, b) => b.score - a.score);

  return results;
}
