/**
 * Research Pipeline Metrics
 *
 * Prometheus metrics for monitoring the Research-to-Production Pipeline,
 * Factor Zoo health, and Mega-Alpha performance.
 *
 * Uses prom-client for Prometheus-compatible metrics exposition.
 *
 * @see docs/plans/20-research-to-production-pipeline.md - Observability section
 */

import { Counter, Gauge, Histogram, Registry } from "prom-client";

// ============================================
// Metrics Registry
// ============================================

/**
 * Custom registry for research metrics.
 * Keeps research metrics separate from default process metrics.
 */
export const researchRegistry = new Registry();

// ============================================
// Factor Zoo Metrics
// ============================================

/**
 * Total number of factors in the zoo by status
 */
export const factorZooFactorCount = new Gauge({
  name: "factor_zoo_factor_count",
  help: "Number of factors in the Factor Zoo by status",
  labelNames: ["status"] as const,
  registers: [researchRegistry],
});

/**
 * Current IC (Information Coefficient) for each factor
 */
export const factorZooFactorIC = new Gauge({
  name: "factor_zoo_factor_ic",
  help: "Current Information Coefficient for each factor",
  labelNames: ["factor_id", "factor_name", "status"] as const,
  registers: [researchRegistry],
});

/**
 * Current weight for each factor in Mega-Alpha
 */
export const factorZooFactorWeight = new Gauge({
  name: "factor_zoo_factor_weight",
  help: "Current weight assigned to each factor",
  labelNames: ["factor_id", "factor_name"] as const,
  registers: [researchRegistry],
});

/**
 * IC decay rate for each factor
 */
export const factorZooFactorDecayRate = new Gauge({
  name: "factor_zoo_factor_ic_decay_rate",
  help: "Rate of IC decay for each factor (IC units per day)",
  labelNames: ["factor_id", "factor_name"] as const,
  registers: [researchRegistry],
});

/**
 * Decay alerts counter by type and severity
 */
export const factorZooDecayAlerts = new Counter({
  name: "factor_zoo_decay_alerts_total",
  help: "Total decay alerts triggered",
  labelNames: ["factor_id", "alert_type", "severity"] as const,
  registers: [researchRegistry],
});

// ============================================
// Mega-Alpha Metrics
// ============================================

/**
 * Current Mega-Alpha signal value (-1 to 1)
 */
export const megaAlphaSignalValue = new Gauge({
  name: "mega_alpha_signal_value",
  help: "Current Mega-Alpha combined signal value",
  registers: [researchRegistry],
});

/**
 * Daily IC for Mega-Alpha
 */
export const megaAlphaDailyIC = new Gauge({
  name: "mega_alpha_daily_ic",
  help: "Daily Information Coefficient for Mega-Alpha signal",
  registers: [researchRegistry],
});

/**
 * Rolling Sharpe ratio for Mega-Alpha
 */
export const megaAlphaRollingSharpe = new Gauge({
  name: "mega_alpha_rolling_sharpe",
  help: "30-day rolling Sharpe ratio for Mega-Alpha",
  registers: [researchRegistry],
});

// ============================================
// Research Pipeline Metrics
// ============================================

/**
 * Current pipeline phase duration (seconds)
 */
export const researchPipelinePhaseDuration = new Gauge({
  name: "research_pipeline_phase_duration_seconds",
  help: "Duration of current pipeline phase",
  labelNames: ["phase"] as const,
  registers: [researchRegistry],
});

/**
 * Pipeline execution duration histogram
 */
export const researchPipelineDuration = new Histogram({
  name: "research_pipeline_duration_seconds",
  help: "Total duration of research pipeline execution",
  labelNames: ["phase"] as const,
  buckets: [60, 300, 600, 1800, 3600, 7200], // 1m, 5m, 10m, 30m, 1h, 2h
  registers: [researchRegistry],
});

/**
 * Pipeline completion counter by status
 */
export const researchPipelineCompleted = new Counter({
  name: "research_pipeline_completed_total",
  help: "Total pipeline executions by status",
  labelNames: ["status"] as const,
  registers: [researchRegistry],
});

/**
 * Hypothesis outcomes counter
 */
export const researchHypotheses = new Counter({
  name: "research_hypotheses_total",
  help: "Total hypotheses by outcome",
  labelNames: ["outcome"] as const,
  registers: [researchRegistry],
});

// ============================================
// Cost Tracking Metrics
// ============================================

/**
 * LLM tokens used
 */
export const researchLLMTokens = new Counter({
  name: "research_llm_tokens_total",
  help: "Total LLM tokens consumed by research",
  labelNames: ["model", "operation"] as const,
  registers: [researchRegistry],
});

/**
 * Compute seconds used
 */
export const researchComputeSeconds = new Counter({
  name: "research_compute_seconds_total",
  help: "Total compute seconds used by research operations",
  labelNames: ["operation"] as const,
  registers: [researchRegistry],
});

// ============================================
// Helper Functions
// ============================================

/**
 * Update Factor Zoo metrics from service state
 */
export function updateFactorZooMetrics(stats: {
  totalFactors: number;
  activeCount: number;
  decayingCount: number;
  factors: Array<{
    factorId: string;
    name: string;
    status: string;
    weight: number;
    recentIC: number;
    decayRate?: number;
  }>;
}): void {
  // Reset and update factor counts
  factorZooFactorCount.reset();
  factorZooFactorCount.set({ status: "active" }, stats.activeCount);
  factorZooFactorCount.set({ status: "decaying" }, stats.decayingCount);
  factorZooFactorCount.set(
    { status: "inactive" },
    stats.totalFactors - stats.activeCount - stats.decayingCount
  );

  // Update per-factor metrics
  for (const factor of stats.factors) {
    const labels = { factor_id: factor.factorId, factor_name: factor.name };

    factorZooFactorIC.set({ ...labels, status: factor.status }, factor.recentIC);
    factorZooFactorWeight.set(labels, factor.weight);

    if (factor.decayRate !== undefined) {
      factorZooFactorDecayRate.set(labels, factor.decayRate);
    }
  }
}

/**
 * Update Mega-Alpha metrics from service state
 */
export function updateMegaAlphaMetrics(stats: {
  signalValue: number;
  dailyIC: number;
  rollingSharpe: number;
}): void {
  megaAlphaSignalValue.set(stats.signalValue);
  megaAlphaDailyIC.set(stats.dailyIC);
  megaAlphaRollingSharpe.set(stats.rollingSharpe);
}

/**
 * Record a decay alert
 */
export function recordDecayAlert(factorId: string, alertType: string, severity: string): void {
  factorZooDecayAlerts.inc({ factor_id: factorId, alert_type: alertType, severity });
}

/**
 * Start timing a pipeline phase
 */
export function startPipelinePhase(phase: string): () => void {
  const startTime = Date.now();
  researchPipelinePhaseDuration.set({ phase }, 0);

  return () => {
    const duration = (Date.now() - startTime) / 1000;
    researchPipelinePhaseDuration.set({ phase }, duration);
    researchPipelineDuration.observe({ phase }, duration);
  };
}

/**
 * Record pipeline completion
 */
export function recordPipelineCompletion(status: "success" | "failure"): void {
  researchPipelineCompleted.inc({ status });
}

/**
 * Record hypothesis outcome
 */
export function recordHypothesisOutcome(outcome: "passed" | "failed" | "discarded"): void {
  researchHypotheses.inc({ outcome });
}

/**
 * Record LLM token usage
 */
export function recordLLMTokens(tokens: number, model: string, operation: string): void {
  researchLLMTokens.inc({ model, operation }, tokens);
}

/**
 * Record compute time
 */
export function recordComputeTime(seconds: number, operation: string): void {
  researchComputeSeconds.inc({ operation }, seconds);
}

/**
 * Get all metrics as Prometheus text format
 */
export async function getMetrics(): Promise<string> {
  return researchRegistry.metrics();
}

/**
 * Get content type for metrics endpoint
 */
export function getMetricsContentType(): string {
  return researchRegistry.contentType;
}
