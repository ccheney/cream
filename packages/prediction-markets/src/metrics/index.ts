/**
 * Prediction Markets Monitoring & Observability
 *
 * Prometheus metrics for API latency, cache performance, signal freshness,
 * and WebSocket connection state.
 *
 * @see docs/plans/18-prediction-markets.md (Monitoring & Observability)
 */

import { Counter, Gauge, Histogram, Registry } from "prom-client";

// ============================================
// Constants
// ============================================

/**
 * Default histogram buckets for API latency (in seconds)
 */
export const LATENCY_BUCKETS = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

/**
 * Platform labels for metrics
 */
export type PlatformLabel = "kalshi" | "polymarket";

/**
 * Cache status labels
 */
export type CacheStatusLabel = "hit" | "miss";

/**
 * Error type labels
 */
export type ErrorTypeLabel = "auth" | "rate_limit" | "network" | "timeout" | "unknown";

// ============================================
// Types
// ============================================

/**
 * Metrics configuration
 */
export interface MetricsConfig {
  /** Custom metric prefix (default: "prediction_market") */
  prefix?: string;
  /** Enable default metrics (default: false) */
  defaultMetrics?: boolean;
  /** Custom registry (default: global) */
  registry?: Registry;
}

/**
 * Metrics instance containing all prediction market metrics
 */
export interface PredictionMarketMetrics {
  /** API latency histogram by platform and endpoint */
  apiLatency: Histogram<"platform" | "endpoint">;
  /** Age of most recent signal by type */
  signalFreshness: Gauge<"signal_type">;
  /** Cache hit/miss counter */
  cacheHits: Counter<"status">;
  /** Active markets gauge by platform and type */
  marketCount: Gauge<"platform" | "market_type">;
  /** API error counter by platform and error type */
  apiErrors: Counter<"platform" | "error_type">;
  /** WebSocket connection state (1=connected, 0=disconnected) */
  websocketConnected: Gauge<"platform">;
  /** Request count by platform and endpoint */
  requestCount: Counter<"platform" | "endpoint">;
  /** The registry containing all metrics */
  registry: Registry;
}

// ============================================
// Factory
// ============================================

/**
 * Create prediction market metrics instance
 *
 * @example
 * ```typescript
 * const metrics = createPredictionMarketMetrics();
 *
 * // Track API latency
 * const end = metrics.apiLatency.startTimer({ platform: "kalshi", endpoint: "getMarkets" });
 * await fetchMarkets();
 * end();
 *
 * // Track cache hits
 * metrics.cacheHits.inc({ status: "hit" });
 *
 * // Update signal freshness
 * metrics.signalFreshness.set({ signal_type: "fed_rate" }, Date.now() / 1000);
 *
 * // Get metrics output
 * const output = await metrics.registry.metrics();
 * ```
 */
export function createPredictionMarketMetrics(config: MetricsConfig = {}): PredictionMarketMetrics {
  const { prefix = "prediction_market", registry = new Registry() } = config;

  const apiLatency = new Histogram({
    name: `${prefix}_api_latency_seconds`,
    help: "API call latency by platform and endpoint",
    labelNames: ["platform", "endpoint"] as const,
    buckets: LATENCY_BUCKETS,
    registers: [registry],
  });

  const signalFreshness = new Gauge({
    name: `${prefix}_signal_age_seconds`,
    help: "Age of most recent signal by type (Unix timestamp when last updated)",
    labelNames: ["signal_type"] as const,
    registers: [registry],
  });

  const cacheHits = new Counter({
    name: `${prefix}_cache_hits_total`,
    help: "Cache hit/miss counts",
    labelNames: ["status"] as const,
    registers: [registry],
  });

  const marketCount = new Gauge({
    name: `${prefix}_active_markets`,
    help: "Number of active markets by platform and type",
    labelNames: ["platform", "market_type"] as const,
    registers: [registry],
  });

  const apiErrors = new Counter({
    name: `${prefix}_api_errors_total`,
    help: "API error counts by platform and error type",
    labelNames: ["platform", "error_type"] as const,
    registers: [registry],
  });

  const websocketConnected = new Gauge({
    name: `${prefix}_websocket_connected`,
    help: "WebSocket connection state (1=connected, 0=disconnected)",
    labelNames: ["platform"] as const,
    registers: [registry],
  });

  const requestCount = new Counter({
    name: `${prefix}_requests_total`,
    help: "Total API requests by platform and endpoint",
    labelNames: ["platform", "endpoint"] as const,
    registers: [registry],
  });

  return {
    apiLatency,
    signalFreshness,
    cacheHits,
    marketCount,
    apiErrors,
    websocketConnected,
    requestCount,
    registry,
  };
}

// ============================================
// Helper Functions
// ============================================

/**
 * Record API call with timing
 */
export function recordApiCall(
  metrics: PredictionMarketMetrics,
  platform: PlatformLabel,
  endpoint: string,
  durationMs: number
): void {
  metrics.apiLatency.observe({ platform, endpoint }, durationMs / 1000);
  metrics.requestCount.inc({ platform, endpoint });
}

/**
 * Record API error
 */
export function recordApiError(
  metrics: PredictionMarketMetrics,
  platform: PlatformLabel,
  errorType: ErrorTypeLabel
): void {
  metrics.apiErrors.inc({ platform, error_type: errorType });
}

/**
 * Record cache access
 */
export function recordCacheAccess(metrics: PredictionMarketMetrics, hit: boolean): void {
  metrics.cacheHits.inc({ status: hit ? "hit" : "miss" });
}

/**
 * Update signal freshness timestamp
 */
export function updateSignalFreshness(metrics: PredictionMarketMetrics, signalType: string): void {
  metrics.signalFreshness.set({ signal_type: signalType }, Date.now() / 1000);
}

/**
 * Update WebSocket connection state
 */
export function setWebsocketState(
  metrics: PredictionMarketMetrics,
  platform: PlatformLabel,
  connected: boolean
): void {
  metrics.websocketConnected.set({ platform }, connected ? 1 : 0);
}

/**
 * Update active market count
 */
export function setMarketCount(
  metrics: PredictionMarketMetrics,
  platform: PlatformLabel,
  marketType: string,
  count: number
): void {
  metrics.marketCount.set({ platform, market_type: marketType }, count);
}

// ============================================
// Singleton Instance
// ============================================

let defaultMetrics: PredictionMarketMetrics | null = null;

/**
 * Get or create the default metrics instance
 */
export function getDefaultMetrics(): PredictionMarketMetrics {
  if (!defaultMetrics) {
    defaultMetrics = createPredictionMarketMetrics();
  }
  return defaultMetrics;
}

/**
 * Reset the default metrics instance (for testing)
 */
export function resetDefaultMetrics(): void {
  if (defaultMetrics) {
    defaultMetrics.registry.clear();
  }
  defaultMetrics = null;
}
