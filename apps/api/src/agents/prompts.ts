/**
 * Prompt building functions for Mastra agents.
 *
 * Contains utilities for building context sections injected into agent prompts.
 */

import type { AgentContext } from "./types.js";

/**
 * Build regime context section for prompts.
 */
export function buildRegimeContext(regimeLabels?: AgentContext["regimeLabels"]): string {
  if (!regimeLabels || Object.keys(regimeLabels).length === 0) {
    return "";
  }

  const lines = Object.entries(regimeLabels).map(([symbol, data]) => {
    const confidence = (data.confidence * 100).toFixed(0);
    return `- ${symbol}: ${data.regime} (${confidence}% confidence)${data.reasoning ? ` - ${data.reasoning}` : ""}`;
  });

  return `\nMarket Regime Classifications:
${lines.join("\n")}
`;
}

/**
 * Build Factor Zoo context section for prompts.
 * Includes Mega-Alpha signal, active factors with weights, and decay alerts.
 */
export function buildFactorZooContext(factorZoo?: AgentContext["factorZoo"]): string {
  if (!factorZoo) {
    return "";
  }

  const megaAlphaSignal = factorZoo.megaAlpha >= 0 ? "BULLISH" : "BEARISH";
  const megaAlphaStrength = Math.abs(factorZoo.megaAlpha);

  const factorLines = factorZoo.activeFactors
    .filter((f) => f.weight > 0.01)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 10)
    .map((f) => {
      const decayFlag = f.isDecaying ? " [DECAYING]" : "";
      return `  - ${f.name}: ${(f.weight * 100).toFixed(1)}% weight, IC=${f.recentIC.toFixed(3)}${decayFlag}`;
    });

  const alertLines = factorZoo.decayAlerts
    .filter((a) => a.severity === "CRITICAL")
    .slice(0, 5)
    .map((a) => `  - ${a.factorId}: ${a.alertType} (${a.recommendation})`);

  let output = `
Factor Zoo Quantitative Signals:
- Mega-Alpha: ${factorZoo.megaAlpha.toFixed(3)} (${megaAlphaSignal}, strength: ${(megaAlphaStrength * 100).toFixed(0)}%)
- Active Factors: ${factorZoo.stats.activeCount}/${factorZoo.stats.totalFactors} (avg IC: ${factorZoo.stats.averageIC.toFixed(3)})
- Decaying Factors: ${factorZoo.stats.decayingCount}

Top Weighted Factors:
${factorLines.join("\n")}`;

  if (alertLines.length > 0) {
    output += `

Critical Decay Alerts:
${alertLines.join("\n")}`;
  }

  return output;
}

/**
 * Build prediction market context section for prompts.
 * Includes Fed rate probabilities, recession risk, and policy event risk.
 */
export function buildPredictionMarketContext(
  predictionMarketSignals?: AgentContext["predictionMarketSignals"]
): string {
  if (!predictionMarketSignals) {
    return "";
  }

  const lines: string[] = [];

  if (
    predictionMarketSignals.fedCutProbability !== undefined ||
    predictionMarketSignals.fedHikeProbability !== undefined
  ) {
    const cutProb = predictionMarketSignals.fedCutProbability;
    const hikeProb = predictionMarketSignals.fedHikeProbability;
    if (cutProb !== undefined) {
      lines.push(`- Fed Rate Cut Probability: ${(cutProb * 100).toFixed(1)}%`);
    }
    if (hikeProb !== undefined) {
      lines.push(`- Fed Rate Hike Probability: ${(hikeProb * 100).toFixed(1)}%`);
    }
  }

  if (predictionMarketSignals.recessionProbability12m !== undefined) {
    lines.push(
      `- 12-Month Recession Probability: ${(predictionMarketSignals.recessionProbability12m * 100).toFixed(1)}%`
    );
  }

  if (predictionMarketSignals.macroUncertaintyIndex !== undefined) {
    const uncertainty = predictionMarketSignals.macroUncertaintyIndex;
    let level: string;
    if (uncertainty > 0.7) {
      level = "HIGH";
    } else if (uncertainty > 0.4) {
      level = "MODERATE";
    } else {
      level = "LOW";
    }
    lines.push(`- Macro Uncertainty Index: ${(uncertainty * 100).toFixed(1)}% (${level})`);
  }

  if (predictionMarketSignals.policyEventRisk !== undefined) {
    lines.push(
      `- Policy Event Risk: ${(predictionMarketSignals.policyEventRisk * 100).toFixed(1)}%`
    );
  }

  if (predictionMarketSignals.cpiSurpriseDirection !== undefined) {
    const cpiDir = predictionMarketSignals.cpiSurpriseDirection > 0 ? "HIGHER" : "LOWER";
    lines.push(
      `- CPI Surprise Direction: ${cpiDir} (${Math.abs(predictionMarketSignals.cpiSurpriseDirection * 100).toFixed(1)}%)`
    );
  }

  if (predictionMarketSignals.gdpSurpriseDirection !== undefined) {
    const gdpDir = predictionMarketSignals.gdpSurpriseDirection > 0 ? "HIGHER" : "LOWER";
    lines.push(
      `- GDP Surprise Direction: ${gdpDir} (${Math.abs(predictionMarketSignals.gdpSurpriseDirection * 100).toFixed(1)}%)`
    );
  }

  if (predictionMarketSignals.marketConfidence !== undefined) {
    lines.push(
      `- Market Confidence: ${(predictionMarketSignals.marketConfidence * 100).toFixed(1)}%`
    );
  }

  if (lines.length === 0) {
    return "";
  }

  const platforms = predictionMarketSignals.platforms?.join(", ") || "Unknown";
  const timestamp = predictionMarketSignals.timestamp || "Unknown";

  return `
Prediction Market Signals (from ${platforms}, updated ${timestamp}):
${lines.join("\n")}
`;
}
