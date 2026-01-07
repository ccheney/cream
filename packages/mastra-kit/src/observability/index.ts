/**
 * Observability Module
 *
 * Prometheus metrics and monitoring utilities for the Research Pipeline,
 * Factor Zoo, and Mega-Alpha performance tracking.
 */

export {
  // Factor Zoo metrics
  factorZooDecayAlerts,
  factorZooFactorCount,
  factorZooFactorDecayRate,
  factorZooFactorIC,
  factorZooFactorWeight,
  // Helper functions
  getMetrics,
  getMetricsContentType,
  // Mega-Alpha metrics
  megaAlphaDailyIC,
  megaAlphaRollingSharpe,
  megaAlphaSignalValue,
  recordComputeTime,
  recordDecayAlert,
  recordHypothesisOutcome,
  recordLLMTokens,
  recordPipelineCompletion,
  // Cost metrics
  researchComputeSeconds,
  // Pipeline metrics
  researchHypotheses,
  researchLLMTokens,
  researchPipelineCompleted,
  researchPipelineDuration,
  researchPipelinePhaseDuration,
  // Metrics registry
  researchRegistry,
  startPipelinePhase,
  updateFactorZooMetrics,
  updateMegaAlphaMetrics,
} from "./research-metrics.js";
