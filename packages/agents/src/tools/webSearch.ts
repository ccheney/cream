/**
 * Web Search Tool
 *
 * Provides real-time web search capabilities for agents with time-bounded results,
 * domain filtering, and topic specialization.
 *
 * This file re-exports from the modular webSearch directory for backwards compatibility.
 *
 * @see docs/plans/21-web-search-tool.md
 */

export {
  type AlertSeverity,
  type BatchSearchParams,
  type BatchSearchResponse,
  batchSearch,
  checkAndLogRateLimitAlerts,
  clearWebSearchCache,
  getWebSearchCacheSize,
  getWebSearchMetrics,
  metricsCollector,
  type RateLimitAlert,
  type RateLimitAlertType,
  type RequestCount,
  type RequestRecord,
  rateLimitAlerter,
  rateLimiter,
  resetTavilyClient,
  sanitizeQuery,
  validateResultUrl,
  type WebSearchLogEntry,
  type WebSearchMetrics,
  type WebSearchParams,
  WebSearchParamsSchema,
  type WebSearchResponse,
  type WebSearchResult,
  type WebSearchSource,
  webSearch,
} from "./webSearch/index.js";
