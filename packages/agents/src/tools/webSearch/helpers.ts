/**
 * Web Search Helpers
 *
 * Result processing, normalization, and utility functions.
 */

import { log } from "../../logger.js";
import {
  logAudit,
  MAX_RAW_CONTENT_LENGTH,
  MAX_SNIPPET_LENGTH,
  MAX_TITLE_LENGTH,
  sanitizeHtml,
  validateResultUrl,
} from "./security.js";
import type { WebSearchLogEntry, WebSearchResponse, WebSearchResult } from "./types.js";

/**
 * Extract hostname from URL
 */
export function extractDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Normalize Tavily results to WebSearchResult format
 * with security sanitization, URL validation, and time filtering
 */
export function normalizeResults(
  results: Array<{
    title: string;
    content: string;
    url: string;
    score: number;
    published_date?: string;
    raw_content?: string | null;
  }>,
  cutoffTime: Date,
  queryHash: string
): WebSearchResult[] {
  const normalized: WebSearchResult[] = [];
  let urlsBlocked = 0;

  for (const result of results) {
    if (!validateResultUrl(result.url)) {
      urlsBlocked++;
      continue;
    }

    let publishedAt: Date | null = null;
    if (result.published_date) {
      publishedAt = new Date(result.published_date);
      if (publishedAt < cutoffTime) {
        continue;
      }
    }

    normalized.push({
      title: sanitizeHtml(result.title).slice(0, MAX_TITLE_LENGTH),
      snippet: sanitizeHtml(result.content).slice(0, MAX_SNIPPET_LENGTH),
      url: result.url,
      source: extractDomain(result.url),
      publishedAt: publishedAt?.toISOString() ?? new Date().toISOString(),
      relevanceScore: result.score,
      rawContent: result.raw_content
        ? sanitizeHtml(result.raw_content).slice(0, MAX_RAW_CONTENT_LENGTH)
        : undefined,
    });
  }

  if (urlsBlocked > 0) {
    logAudit({
      action: "url_blocked",
      queryHash,
      details: { count: urlsBlocked },
    });
  }

  return normalized;
}

/**
 * Create an empty response (for backtest mode or errors)
 */
export function createEmptyResponse(query: string, startTime: number): WebSearchResponse {
  return {
    results: [],
    metadata: {
      query,
      provider: "tavily",
      executionTimeMs: Date.now() - startTime,
      resultsFiltered: 0,
    },
  };
}

/**
 * Calculate time range for Tavily API based on max age hours
 */
export function calculateTimeRange(maxAgeHours: number): "day" | "week" | "month" {
  if (maxAgeHours <= 24) {
    return "day";
  }
  if (maxAgeHours <= 168) {
    return "week";
  }
  return "month";
}

/**
 * Log a web search event
 */
export function logWebSearch(
  entry: Partial<WebSearchLogEntry> & { event: WebSearchLogEntry["event"] }
): void {
  const { level = "info", ...data } = entry;
  const message = "Web search event";

  if (level === "error") {
    log.error(data, message);
  } else if (level === "warn") {
    log.warn(data, message);
  } else {
    log.info(data, message);
  }
}

/**
 * Chunk an array into smaller arrays of specified size
 */
export function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
