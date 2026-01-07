/**
 * Web Search Tool
 *
 * Provides real-time web search capabilities for agents with time-bounded results,
 * domain filtering, and topic specialization.
 *
 * @see docs/plans/21-web-search-tool.md
 */

import { isBacktest } from "@cream/domain";
import { z } from "zod";
import { createTavilyClientFromEnv, type TavilyClient } from "./providers/tavily.js";

// ============================================
// Types and Schemas
// ============================================

/**
 * Available web search source filters
 */
export type WebSearchSource = "all" | "reddit" | "x" | "substack" | "blogs" | "news" | "financial";

/**
 * Search parameters schema
 */
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

/**
 * Individual search result
 */
export interface WebSearchResult {
  title: string;
  snippet: string;
  url: string;
  source: string;
  publishedAt: string;
  relevanceScore?: number;
  rawContent?: string;
}

/**
 * Search response with metadata
 */
export interface WebSearchResponse {
  results: WebSearchResult[];
  metadata: {
    query: string;
    provider: "tavily";
    executionTimeMs: number;
    resultsFiltered: number;
  };
}

// ============================================
// Domain Mapping
// ============================================

/**
 * Maps source types to domain arrays
 */
const DOMAIN_MAP: Record<WebSearchSource, string[]> = {
  all: [],
  reddit: ["reddit.com"],
  x: ["x.com"],
  substack: ["substack.com"],
  blogs: ["medium.com", "seekingalpha.com", "zerohedge.com", "thestreet.com"],
  news: ["reuters.com", "bloomberg.com", "cnbc.com", "wsj.com", "ft.com", "marketwatch.com"],
  financial: ["seekingalpha.com", "investopedia.com", "fool.com", "barrons.com", "tradingview.com"],
};

// ============================================
// Helper Functions
// ============================================

/**
 * Build domain filter array from source types
 */
function buildDomainFilter(sources: WebSearchSource[]): string[] {
  // If "all" is included or no sources, don't filter domains
  if (sources.length === 0 || sources.includes("all")) {
    return [];
  }

  // Combine domains from all specified sources (deduplicated)
  const domains = new Set<string>();
  for (const source of sources) {
    for (const domain of DOMAIN_MAP[source]) {
      domains.add(domain);
    }
  }

  return Array.from(domains);
}

/**
 * Extract hostname from URL
 */
function extractDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    // Remove www. prefix if present
    return hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Normalize Tavily results to WebSearchResult format
 * and filter by time cutoff
 */
function normalizeResults(
  results: Array<{
    title: string;
    content: string;
    url: string;
    score: number;
    published_date?: string;
    raw_content?: string | null;
  }>,
  cutoffTime: Date
): WebSearchResult[] {
  const normalized: WebSearchResult[] = [];

  for (const result of results) {
    // Parse published date
    let publishedAt: Date | null = null;
    if (result.published_date) {
      publishedAt = new Date(result.published_date);
      // Skip if published before cutoff
      if (publishedAt < cutoffTime) {
        continue;
      }
    }

    normalized.push({
      title: result.title,
      snippet: result.content,
      url: result.url,
      source: extractDomain(result.url),
      publishedAt: publishedAt?.toISOString() ?? new Date().toISOString(),
      relevanceScore: result.score,
      rawContent: result.raw_content ?? undefined,
    });
  }

  return normalized;
}

/**
 * Create an empty response (for backtest mode or errors)
 */
function createEmptyResponse(query: string, startTime: number): WebSearchResponse {
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
function calculateTimeRange(maxAgeHours: number): "day" | "week" | "month" {
  if (maxAgeHours <= 24) {
    return "day";
  }
  if (maxAgeHours <= 168) {
    return "week";
  }
  return "month";
}

// ============================================
// Client Management
// ============================================

let tavilyClient: TavilyClient | null = null;

/**
 * Get or create Tavily client from environment
 */
function getTavilyClient(): TavilyClient | null {
  if (tavilyClient === null) {
    tavilyClient = createTavilyClientFromEnv();
  }
  return tavilyClient;
}

// ============================================
// Main Function
// ============================================

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
 *
 * @param params - Search parameters
 * @returns Search results with metadata
 */
export async function webSearch(params: WebSearchParams): Promise<WebSearchResponse> {
  const startTime = Date.now();

  // 1. Validate and parse params
  const parsed = WebSearchParamsSchema.safeParse(params);
  if (!parsed.success) {
    console.warn("[webSearch] Invalid params:", parsed.error.message);
    return createEmptyResponse(params.query ?? "", startTime);
  }
  const { query, maxAgeHours, sources, topic, maxResults, symbols } = parsed.data;

  // 2. Backtest mode → empty results
  if (isBacktest()) {
    return createEmptyResponse(query, startTime);
  }

  // 3. Check for Tavily client
  const client = getTavilyClient();
  if (!client) {
    console.warn("[webSearch] TAVILY_API_KEY not configured");
    return createEmptyResponse(query, startTime);
  }

  // 4. Build domain filters from sources
  const includeDomains = buildDomainFilter(sources);

  // 5. Calculate time bounds (hybrid filtering strategy)
  const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
  const timeRange = calculateTimeRange(maxAgeHours);

  // 6. Build enhanced query with symbols if provided
  let enhancedQuery = query;
  if (symbols && symbols.length > 0) {
    enhancedQuery = `${query} ${symbols.map((s) => `$${s}`).join(" ")}`;
  }

  try {
    // 7. Execute Tavily search
    const result = await client.search({
      query: enhancedQuery,
      topic,
      timeRange,
      includeDomains: includeDomains.length > 0 ? includeDomains : undefined,
      maxResults: Math.min(maxResults * 2, 20), // Request 2x for filtering
      includeRawContent: true,
    });

    // Handle search failure
    if (!result.success) {
      console.warn("[webSearch] Search failed:", result.error);
      return createEmptyResponse(query, startTime);
    }

    // 8. Client-side time filtering for precise hour-level window
    const filteredResults = normalizeResults(result.data.results, cutoffTime);
    const resultsFiltered = result.data.results.length - filteredResults.length;

    return {
      results: filteredResults.slice(0, maxResults),
      metadata: {
        query,
        provider: "tavily",
        executionTimeMs: Date.now() - startTime,
        resultsFiltered,
      },
    };
  } catch (error) {
    console.warn("[webSearch] Search failed:", error);
    return createEmptyResponse(query, startTime);
  }
}

/**
 * Reset the Tavily client (for testing)
 */
export function resetTavilyClient(): void {
  tavilyClient = null;
}
