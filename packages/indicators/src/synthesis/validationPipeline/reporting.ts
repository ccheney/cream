/**
 * Validation Report Generation
 *
 * Functions for generating summaries, recommendations, and evaluation results
 * from validation pipeline outputs.
 */

import type { GateResults, ValidationResult } from "./types.js";

/**
 * Generate summary of validation results.
 */
export function generateSummary(
  gatesPassed: number,
  totalGates: number,
  results: GateResults
): string {
  if (gatesPassed === totalGates) {
    return "All validation gates passed. Indicator ready for paper trading.";
  }

  const failures: string[] = [];
  if (!results.dsr.passed) {
    failures.push("DSR");
  }
  if (!results.pbo.passed) {
    failures.push("PBO");
  }
  if (!results.ic.passed) {
    failures.push("IC");
  }
  if (!results.walkForward.passed) {
    failures.push("Walk-Forward");
  }
  if (!results.orthogonality.passed) {
    failures.push("Orthogonality");
  }

  return `Failed ${failures.length} gate(s): ${failures.join(", ")}. Indicator not ready for deployment.`;
}

/**
 * Generate recommendations based on validation results.
 */
export function generateRecommendations(results: GateResults): string[] {
  const recommendations: string[] = [];

  if (!results.dsr.passed) {
    if (results.dsr.pValue < 0.5) {
      recommendations.push(
        "DSR failure: Strategy performance likely due to chance. Consider fundamental redesign."
      );
    } else {
      recommendations.push(
        "DSR marginal: Collect more data or reduce number of trials to improve significance."
      );
    }
  }

  if (!results.pbo.passed) {
    if (results.pbo.value > 0.7) {
      recommendations.push(
        "High overfitting risk: Strategy heavily optimized on in-sample data. Simplify parameters."
      );
    } else {
      recommendations.push(
        "Moderate overfitting: Consider reducing complexity or increasing validation period."
      );
    }
  }

  if (!results.ic.passed) {
    if (results.ic.mean < 0) {
      recommendations.push(
        "Negative IC: Signal is counterproductive. Investigate signal logic or reverse direction."
      );
    } else if (results.ic.std > 0.05) {
      recommendations.push(
        "Unstable IC: Signal predictive power varies too much. Consider regime-specific models."
      );
    } else {
      recommendations.push(
        "Weak IC: Signal has insufficient predictive power. Enhance feature engineering."
      );
    }
  }

  if (!results.walkForward.passed) {
    if (results.walkForward.efficiency < 0.3) {
      recommendations.push(
        "Severe degradation: OOS performance significantly worse than IS. Strategy is overfit."
      );
    } else {
      recommendations.push(
        "Walk-forward degradation: Consider anchored windows or longer training periods."
      );
    }
  }

  if (!results.orthogonality.passed) {
    if (results.orthogonality.maxCorrelation > 0.8) {
      recommendations.push(
        `High correlation with ${results.orthogonality.correlatedWith}. Consider orthogonalization or removing redundant indicator.`
      );
    } else if (results.orthogonality.vif && results.orthogonality.vif > 10) {
      recommendations.push(
        "Severe multicollinearity detected. Reduce factor set or use regularization."
      );
    } else {
      recommendations.push("Moderate overlap with existing indicators. Monitor for redundancy.");
    }
  }

  if (recommendations.length === 0) {
    recommendations.push("All gates passed. Proceed to paper trading phase.");
  }

  return recommendations;
}

/**
 * Calculate expected survival rate given validation thresholds.
 * Based on plan: approximately 4% of generated indicators should pass all gates.
 */
export function estimateSurvivalRate(
  dsrPValue = 0.95,
  pboThreshold = 0.5,
  icMeanThreshold = 0.02,
  wfEfficiencyThreshold = 0.5,
  orthThreshold = 0.7
): number {
  // Rough estimates for each gate's pass rate under random signals
  const dsrPassRate = 1 - dsrPValue;
  const pboPassRate = pboThreshold;
  const icPassRate = Math.max(0.05, 0.3 - icMeanThreshold * 5);
  const wfPassRate = Math.max(0.1, 0.8 - wfEfficiencyThreshold);
  const orthPassRate = 1 - orthThreshold;

  return dsrPassRate * pboPassRate * icPassRate * wfPassRate * orthPassRate;
}

/**
 * Evaluate a validation result and determine next action.
 */
export function evaluateValidation(result: ValidationResult): {
  action: "deploy" | "retry" | "retire";
  confidence: "high" | "medium" | "low";
  explanation: string;
} {
  if (result.overallPassed) {
    return {
      action: "deploy",
      confidence: result.passRate >= 0.8 ? "high" : "medium",
      explanation: "All validation gates passed. Indicator ready for paper trading.",
    };
  }

  const closeToPass = result.passRate >= 0.6;

  if (closeToPass) {
    const minorFailures =
      (!result.dsr.passed && result.dsr.pValue > 0.9) ||
      (!result.pbo.passed && result.pbo.value < 0.55) ||
      (!result.walkForward.passed && result.walkForward.efficiency > 0.45);

    if (minorFailures) {
      return {
        action: "retry",
        confidence: "medium",
        explanation:
          "Close to validation threshold. Consider parameter tuning or collecting more data.",
      };
    }
  }

  const criticalFailure =
    result.dsr.pValue < 0.5 ||
    result.pbo.value > 0.7 ||
    result.ic.mean < 0 ||
    result.walkForward.efficiency < 0.3;

  if (criticalFailure) {
    return {
      action: "retire",
      confidence: "high",
      explanation:
        "Critical validation failure. Indicator unlikely to perform well in live trading.",
    };
  }

  return {
    action: "retry",
    confidence: "low",
    explanation: "Multiple validation failures. Consider significant redesign before retry.",
  };
}
