/**
 * Web Search Module
 *
 * Provides real-time web search capabilities for agents with time-bounded results,
 * domain filtering, and topic specialization.
 *
 * @see docs/plans/21-web-search-tool.md
 */

import { type ExecutionContext, isBacktest } from "@cream/domain";
import { log } from "../../logger.js";
import { createTavilyClientFromEnv, type TavilyClient } from "../providers/tavily.js";
import { getCached, getCacheKey, setCache } from "./cache.js";
import { buildDomainFilter } from "./domains.js";
import {
  calculateTimeRange,
  chunkArray,
  createEmptyResponse,
  logWebSearch,
  normalizeResults,
} from "./helpers.js";
import { metricsCollector } from "./metrics.js";
import { checkAndLogRateLimitAlerts, rateLimiter } from "./rateLimiter.js";
import { hashQueryForAudit, logAudit, sanitizeQuery } from "./security.js";
import type {
  BatchSearchParams,
  BatchSearchResponse,
  WebSearchParams,
  WebSearchResponse,
} from "./types.js";
import { WebSearchParamsSchema } from "./types.js";

export { clearWebSearchCache, getWebSearchCacheSize } from "./cache.js";
export type { RequestCount, RequestRecord, WebSearchMetrics } from "./metrics.js";
export { getWebSearchMetrics, metricsCollector } from "./metrics.js";
export type {
  AlertSeverity,
  RateLimitAlert,
  RateLimitAlertType,
} from "./rateLimiter.js";
export { checkAndLogRateLimitAlerts, rateLimitAlerter, rateLimiter } from "./rateLimiter.js";
export { sanitizeQuery, validateResultUrl } from "./security.js";
export type {
  BatchSearchParams,
  BatchSearchResponse,
  WebSearchLogEntry,
  WebSearchParams,
  WebSearchResponse,
  WebSearchResult,
  WebSearchSource,
} from "./types.js";
export { WebSearchParamsSchema } from "./types.js";

/** Default concurrency limit for batch searches */
const BATCH_CONCURRENCY = 3;

let tavilyClient: TavilyClient | null = null;

function getTavilyClient(): TavilyClient | null {
  if (tavilyClient === null) {
    tavilyClient = createTavilyClientFromEnv();
  }
  return tavilyClient;
}

/**
 * Reset the Tavily client (for testing)
 */
export function resetTavilyClient(): void {
  tavilyClient = null;
}

/**
 * Search the web for real-time information
 *
 * Provides web search with:
 * - Time-bounded results (1-168 hours)
 * - Source/domain filtering
 * - Topic specialization (general, news, finance)
 * - Graceful degradation on errors
 *
 * In backtest mode, returns empty results for consistent execution.
 * Never throws - always returns a valid response.
 */
export async function webSearch(
  ctx: ExecutionContext,
  params: WebSearchParams
): Promise<WebSearchResponse> {
  const startTime = Date.now();

  const parsed = WebSearchParamsSchema.safeParse(params);
  if (!parsed.success) {
    log.warn({ error: parsed.error.message }, "Invalid web search params");
    return createEmptyResponse(params.query ?? "", startTime);
  }
  const { maxAgeHours, sources, topic, maxResults, symbols } = parsed.data;

  const query = sanitizeQuery(parsed.data.query);
  const queryHash = hashQueryForAudit(query);

  if (isBacktest(ctx)) {
    const executionTimeMs = Date.now() - startTime;
    logWebSearch({
      event: "backtest",
      queryHash,
      executionTimeMs,
      resultCount: 0,
      sources,
      topic,
      maxAgeHours,
    });
    metricsCollector.record({
      timestamp: Date.now(),
      type: "backtest",
      latencyMs: executionTimeMs,
      resultCount: 0,
    });
    return createEmptyResponse(query, startTime);
  }

  const cacheKey = getCacheKey({ ...parsed.data, query });
  const cached = getCached(cacheKey);
  if (cached) {
    const executionTimeMs = Date.now() - startTime;
    const resultCount = Math.min(cached.results.length, maxResults);

    logWebSearch({
      event: "cache_hit",
      queryHash,
      executionTimeMs,
      resultCount,
      sources,
      topic,
      maxAgeHours,
      cached: true,
    });

    metricsCollector.record({
      timestamp: Date.now(),
      type: "cache_hit",
      latencyMs: executionTimeMs,
      resultCount,
    });

    return {
      results: cached.results.slice(0, maxResults),
      metadata: {
        ...cached.metadata,
        executionTimeMs,
      },
    };
  }

  if (!rateLimiter.canProceed("tavily")) {
    const executionTimeMs = Date.now() - startTime;

    logWebSearch({
      level: "warn",
      event: "rate_limited",
      queryHash,
      executionTimeMs,
      resultCount: 0,
      sources,
      topic,
      maxAgeHours,
    });

    metricsCollector.record({
      timestamp: Date.now(),
      type: "rate_limited",
      latencyMs: executionTimeMs,
      resultCount: 0,
    });

    return createEmptyResponse(query, startTime);
  }

  const client = getTavilyClient();
  if (!client) {
    log.warn({}, "TAVILY_API_KEY not configured");
    return createEmptyResponse(query, startTime);
  }

  const includeDomains = buildDomainFilter(sources);
  const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
  const timeRange = calculateTimeRange(maxAgeHours);

  let enhancedQuery = query;
  if (symbols && symbols.length > 0) {
    enhancedQuery = `${query} ${symbols.map((s) => `$${s}`).join(" ")}`;
  }

  logAudit({
    action: "query",
    queryHash,
    details: {
      topic,
      sources,
      maxAgeHours,
      hasSymbols: symbols && symbols.length > 0,
    },
  });

  try {
    const result = await client.search({
      query: enhancedQuery,
      topic,
      timeRange,
      includeDomains: includeDomains.length > 0 ? includeDomains : undefined,
      maxResults: Math.min(maxResults * 2, 20),
      includeRawContent: true,
    });

    if (!result.success) {
      const executionTimeMs = Date.now() - startTime;

      logWebSearch({
        level: "error",
        event: "api_error",
        queryHash,
        executionTimeMs,
        resultCount: 0,
        sources,
        topic,
        maxAgeHours,
        error: result.error,
      });

      metricsCollector.record({
        timestamp: Date.now(),
        type: "error",
        latencyMs: executionTimeMs,
        resultCount: 0,
      });

      return createEmptyResponse(query, startTime);
    }

    rateLimiter.record("tavily");
    checkAndLogRateLimitAlerts("tavily");

    const filteredResults = normalizeResults(result.data.results, cutoffTime, queryHash);
    const resultsFiltered = result.data.results.length - filteredResults.length;
    const executionTimeMs = Date.now() - startTime;
    const resultCount = Math.min(filteredResults.length, maxResults);

    logWebSearch({
      event: "success",
      queryHash,
      executionTimeMs,
      resultCount,
      sources,
      topic,
      maxAgeHours,
    });

    metricsCollector.record({
      timestamp: Date.now(),
      type: "success",
      latencyMs: executionTimeMs,
      resultCount,
    });

    const response: WebSearchResponse = {
      results: filteredResults.slice(0, maxResults),
      metadata: {
        query,
        provider: "tavily",
        executionTimeMs,
        resultsFiltered,
      },
    };

    const responseToCache: WebSearchResponse = {
      results: filteredResults,
      metadata: response.metadata,
    };
    setCache(cacheKey, responseToCache);

    return response;
  } catch (error) {
    const executionTimeMs = Date.now() - startTime;

    logWebSearch({
      level: "error",
      event: "api_error",
      queryHash,
      executionTimeMs,
      resultCount: 0,
      sources,
      topic,
      maxAgeHours,
      error: String(error),
    });

    metricsCollector.record({
      timestamp: Date.now(),
      type: "error",
      latencyMs: executionTimeMs,
      resultCount: 0,
    });

    return createEmptyResponse(query, startTime);
  }
}

/**
 * Batch search for multiple symbols with concurrency control
 *
 * Executes searches for multiple symbols in parallel with a concurrency limit,
 * tracking cache hits separately from API calls. Each symbol gets its own
 * search query generated from the template.
 *
 * @example
 * ```typescript
 * const batch = await batchSearch(ctx, {
 *   queryTemplate: "{SYMBOL} stock sentiment Reddit",
 *   symbols: ["NVDA", "AAPL", "MSFT"],
 *   commonParams: {
 *     sources: ["reddit"],
 *     maxAgeHours: 24,
 *     topic: "finance",
 *   },
 * });
 *
 * // Access results per symbol
 * const nvdaResults = batch.results["NVDA"];
 * ```
 */
export async function batchSearch(
  ctx: ExecutionContext,
  params: BatchSearchParams
): Promise<BatchSearchResponse> {
  const startTime = Date.now();
  const results: Record<string, WebSearchResponse["results"]> = {};
  let cachedCount = 0;
  let queriesExecuted = 0;

  if (params.symbols.length === 0) {
    return {
      results: {},
      metadata: {
        symbolsSearched: 0,
        totalResults: 0,
        queriesExecuted: 0,
        cachedCount: 0,
        executionTimeMs: Date.now() - startTime,
      },
    };
  }

  const chunks = chunkArray(params.symbols, BATCH_CONCURRENCY);

  for (const chunk of chunks) {
    const chunkPromises = chunk.map(async (symbol) => {
      const query = params.queryTemplate.replace(/\{SYMBOL\}/g, symbol);

      try {
        const response = await webSearch(ctx, {
          query,
          symbols: [symbol],
          ...params.commonParams,
        });

        results[symbol] = response.results;

        if (response.metadata.executionTimeMs < 50) {
          cachedCount++;
        } else {
          queriesExecuted++;
        }
      } catch {
        results[symbol] = [];
        queriesExecuted++;
      }
    });

    await Promise.all(chunkPromises);
  }

  return {
    results,
    metadata: {
      symbolsSearched: params.symbols.length,
      totalResults: Object.values(results).flat().length,
      queriesExecuted,
      cachedCount,
      executionTimeMs: Date.now() - startTime,
    },
  };
}
