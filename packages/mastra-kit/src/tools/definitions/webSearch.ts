/**
 * Mastra Web Search Tool Definition
 *
 * Provides web search capability for agents using the Tavily API.
 * Supports time-bounded results, domain filtering, and topic specialization.
 *
 * @see docs/plans/21-web-search-tool.md
 */

import { type CreamEnvironment, createContext } from "@cream/domain";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { webSearch } from "../webSearch.js";

/**
 * Create ExecutionContext for tool invocation.
 * Tools are invoked by the agent framework during scheduled runs.
 */
function createToolContext() {
  const envValue = process.env.CREAM_ENV || "BACKTEST";
  return createContext(envValue as CreamEnvironment, "scheduled");
}

// ============================================
// Input Schema
// ============================================

const WebSearchInputSchema = z.object({
  query: z.string().min(1).describe("Search query - natural language or keywords"),
  maxAgeHours: z
    .number()
    .min(1)
    .max(168)
    .optional()
    .describe("Maximum age of results in hours (default: 24, max: 168/1 week)"),
  sources: z
    .array(z.enum(["all", "reddit", "x", "substack", "blogs", "news", "financial"]))
    .optional()
    .describe("Source categories to search (default: all)"),
  topic: z
    .enum(["general", "news", "finance"])
    .optional()
    .describe("Search topic for relevance tuning (default: general)"),
  maxResults: z
    .number()
    .min(1)
    .max(20)
    .optional()
    .describe("Maximum number of results to return (default: 10, max: 20)"),
  symbols: z
    .array(z.string())
    .optional()
    .describe("Stock symbols to include in query for financial relevance (e.g., ['AAPL', 'MSFT'])"),
});

// ============================================
// Output Schema
// ============================================

const WebSearchOutputSchema = z.object({
  results: z.array(
    z.object({
      title: z.string().describe("Article or page title"),
      snippet: z.string().describe("Content snippet/summary"),
      url: z.string().describe("Source URL"),
      source: z.string().describe("Domain name (e.g., reuters.com)"),
      publishedAt: z.string().describe("Publication timestamp (ISO 8601)"),
      relevanceScore: z.number().optional().describe("Relevance score from search provider (0-1)"),
      rawContent: z.string().optional().describe("Full article content if available"),
    })
  ),
  metadata: z.object({
    query: z.string().describe("Original search query"),
    provider: z.literal("tavily").describe("Search provider used"),
    executionTimeMs: z.number().describe("Search execution time in milliseconds"),
    resultsFiltered: z.number().describe("Number of results filtered out by time constraints"),
  }),
});

// ============================================
// Tool Definition
// ============================================

/**
 * Web Search Tool for Mastra agents
 *
 * Enables agents to search the web for real-time information with
 * time-bounded results and source filtering.
 */
export const webSearchTool = createTool({
  id: "web_search",
  description: `Search the web for real-time information. Use this tool to:
- Find recent news and commentary about stocks, markets, or companies
- Search Reddit, X (Twitter), Substack for retail sentiment and discussions
- Look up current events or breaking news affecting the market
- Research topics that require up-to-date information beyond training data

The tool supports:
- Time-bounded searches (e.g., last 4 hours, last 24 hours, up to 1 week)
- Source filtering (news sites, social media, financial blogs)
- Topic specialization (general, news, finance)
- Symbol enrichment for financial queries

Returns empty results in backtest mode for consistent execution.`,
  inputSchema: WebSearchInputSchema,
  outputSchema: WebSearchOutputSchema,
  execute: async ({ context }) => {
    const ctx = createToolContext();
    return webSearch(ctx, context);
  },
});

// Re-export schemas for testing
export { WebSearchInputSchema, WebSearchOutputSchema };
