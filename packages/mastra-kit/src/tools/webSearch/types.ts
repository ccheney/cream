/**
 * Web Search Types and Schemas
 *
 * Zod schemas and TypeScript interfaces for web search functionality.
 */

import { z } from "zod";

export type WebSearchSource = "all" | "reddit" | "x" | "substack" | "blogs" | "news" | "financial";

export const WebSearchParamsSchema = z.object({
  query: z.string().min(1),
  maxAgeHours: z.number().min(1).max(168).optional().default(24),
  sources: z
    .array(z.enum(["all", "reddit", "x", "substack", "blogs", "news", "financial"]))
    .optional()
    .default(["all"]),
  topic: z.enum(["general", "news", "finance"]).optional().default("general"),
  maxResults: z.number().min(1).max(20).optional().default(10),
  symbols: z.array(z.string()).optional(),
});

export type WebSearchParams = z.input<typeof WebSearchParamsSchema>;

export interface WebSearchResult {
  title: string;
  snippet: string;
  url: string;
  source: string;
  publishedAt: string;
  relevanceScore?: number;
  rawContent?: string;
}

export interface WebSearchResponse {
  results: WebSearchResult[];
  metadata: {
    query: string;
    provider: "tavily";
    executionTimeMs: number;
    resultsFiltered: number;
  };
}

export interface BatchSearchParams {
  /** Base query template - {SYMBOL} will be replaced with each symbol */
  queryTemplate: string;
  /** Symbols to search for */
  symbols: string[];
  /** Common parameters for all searches */
  commonParams?: Omit<WebSearchParams, "query" | "symbols">;
}

export interface BatchSearchResponse {
  /** Results keyed by symbol */
  results: Record<string, WebSearchResult[]>;
  /** Aggregate metadata */
  metadata: {
    symbolsSearched: number;
    totalResults: number;
    queriesExecuted: number;
    cachedCount: number;
    executionTimeMs: number;
  };
}

export interface WebSearchLogEntry {
  timestamp: string;
  level: "info" | "warn" | "error";
  event: "request" | "cache_hit" | "rate_limited" | "api_error" | "success" | "backtest";
  queryHash: string;
  provider: "tavily";
  cached: boolean;
  executionTimeMs: number;
  resultCount?: number;
  sources?: string[];
  topic?: string;
  maxAgeHours?: number;
  error?: string;
}
