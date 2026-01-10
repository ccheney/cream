/**
 * Mastra Data Tool Definitions
 *
 * Tools for indicators, news, economic calendar, and HelixDB.
 * These tools wrap the core implementations from tools/index.ts.
 */

import { createContext, requireEnv } from "@cream/domain";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  type EconomicEvent,
  getEconomicCalendar,
  type HelixQueryResult,
  helixQuery,
  type IndicatorResult,
  type NewsItem,
  recalcIndicator,
  searchNews,
} from "../index.js";

/**
 * Create ExecutionContext for tool invocation.
 * Tools are invoked by the agent framework during scheduled runs.
 */
function createToolContext() {
  return createContext(requireEnv(), "scheduled");
}

// ============================================
// Recalc Indicator Tool
// ============================================

const RecalcIndicatorInputSchema = z.object({
  indicator: z
    .enum(["RSI", "SMA", "EMA", "ATR", "BOLLINGER", "STOCHASTIC", "VOLUME_SMA"])
    .describe("Indicator type to calculate"),
  symbol: z.string().describe("Instrument symbol"),
  params: z
    .record(z.string(), z.number())
    .optional()
    .describe(
      "Indicator parameters (e.g., { period: 14 } for RSI, { period: 20, stdDev: 2 } for Bollinger)"
    ),
});

const RecalcIndicatorOutputSchema = z.object({
  indicator: z.string(),
  symbol: z.string(),
  values: z.array(z.number()),
  timestamps: z.array(z.string()),
});

export const recalcIndicatorTool = createTool({
  id: "recalc_indicator",
  description: `Recalculate a technical indicator for a symbol. Use this tool to:
- Get fresh RSI readings for momentum assessment
- Calculate moving averages (SMA, EMA) for trend analysis
- Compute ATR for volatility-based position sizing
- Generate Bollinger Bands for mean reversion setups
- Calculate Stochastic for overbought/oversold conditions
- Assess volume trends via Volume SMA

Supported indicators:
- RSI: Relative Strength Index (params: period, default 14)
- SMA: Simple Moving Average (params: period, default 20)
- EMA: Exponential Moving Average (params: period, default 20)
- ATR: Average True Range (params: period, default 14)
- BOLLINGER: Bollinger Bands (params: period, stdDev, defaults 20, 2)
- STOCHASTIC: Stochastic Oscillator (params: kPeriod, dPeriod, defaults 14, 3)
- VOLUME_SMA: Volume Simple Moving Average (params: period, default 20)`,
  inputSchema: RecalcIndicatorInputSchema,
  outputSchema: RecalcIndicatorOutputSchema,
  execute: async ({ context }): Promise<IndicatorResult> => {
    const ctx = createToolContext();
    return recalcIndicator(ctx, context.indicator, context.symbol, context.params);
  },
});

// ============================================
// Economic Calendar Tool
// ============================================

const EconomicCalendarInputSchema = z.object({
  startDate: z.string().describe("Start date in YYYY-MM-DD or ISO 8601 format"),
  endDate: z.string().describe("End date in YYYY-MM-DD or ISO 8601 format"),
});

const EconomicEventSchema = z.object({
  id: z.string(),
  name: z.string(),
  date: z.string(),
  time: z.string(),
  impact: z.enum(["high", "medium", "low"]),
  forecast: z.string().nullable(),
  previous: z.string().nullable(),
  actual: z.string().nullable(),
});

const EconomicCalendarOutputSchema = z.object({
  events: z.array(EconomicEventSchema),
});

export const economicCalendarTool = createTool({
  id: "economic_calendar",
  description: `Get economic calendar events for a date range. Use this tool to:
- Identify upcoming high-impact macro events (FOMC, NFP, CPI)
- Check for earnings releases that may affect positions
- Plan around known volatility catalysts
- Assess event risk for trading decisions

Events include impact rating (high/medium/low) and actual vs forecast data.
Requires FMP_KEY environment variable.`,
  inputSchema: EconomicCalendarInputSchema,
  outputSchema: EconomicCalendarOutputSchema,
  execute: async ({ context }): Promise<{ events: EconomicEvent[] }> => {
    const ctx = createToolContext();
    const events = await getEconomicCalendar(ctx, context.startDate, context.endDate);
    return { events };
  },
});

// ============================================
// News Search Tool
// ============================================

const NewsSearchInputSchema = z.object({
  query: z.string().describe("Search query for filtering results"),
  symbols: z.array(z.string()).optional().describe("Stock symbols to fetch news for"),
  limit: z.number().min(1).max(50).optional().describe("Maximum results (default: 20)"),
});

const NewsItemSchema = z.object({
  id: z.string(),
  headline: z.string(),
  summary: z.string(),
  source: z.string(),
  publishedAt: z.string(),
  symbols: z.array(z.string()),
  sentiment: z.enum(["positive", "negative", "neutral"]),
});

const NewsSearchOutputSchema = z.object({
  news: z.array(NewsItemSchema),
});

export const newsSearchTool = createTool({
  id: "news_search",
  description: `Search news for symbols or keywords. Use this tool to:
- Find recent news affecting specific stocks
- Search for market-moving headlines by keyword
- Assess sentiment around positions or watchlist
- Research breaking news and announcements

Sentiment is determined via keyword-based analysis (positive/negative/neutral).
For more sophisticated sentiment, use the external-context extraction pipeline.
Requires FMP_KEY environment variable.`,
  inputSchema: NewsSearchInputSchema,
  outputSchema: NewsSearchOutputSchema,
  execute: async ({ context }): Promise<{ news: NewsItem[] }> => {
    const ctx = createToolContext();
    const news = await searchNews(ctx, context.query, context.symbols, context.limit);
    return { news };
  },
});

// ============================================
// Helix Query Tool
// ============================================

const HelixQueryInputSchema = z.object({
  queryName: z.string().describe("Registered HelixQL query name"),
  params: z.record(z.string(), z.unknown()).optional().describe("Query parameters"),
});

const HelixQueryOutputSchema = z.object({
  nodes: z.array(z.unknown()),
  edges: z.array(z.unknown()),
  metadata: z.record(z.string(), z.unknown()),
});

export const helixQueryTool = createTool({
  id: "helix_query",
  description: `Query HelixDB for memory/graph data. Use this tool to:
- Retrieve similar historical cases from memory
- Query knowledge graph relationships
- Access vector similarity search results
- Fetch agent memory and learned patterns

HelixDB stores the system's learned memory including:
- Historical trade outcomes and their contexts
- Market pattern embeddings for similarity search
- Cross-session learning and pattern recognition`,
  inputSchema: HelixQueryInputSchema,
  outputSchema: HelixQueryOutputSchema,
  execute: async ({ context }): Promise<HelixQueryResult> => {
    const ctx = createToolContext();
    return helixQuery(ctx, context.queryName, context.params as Record<string, unknown>);
  },
});

// Re-export schemas for testing
export {
  EconomicCalendarInputSchema,
  EconomicCalendarOutputSchema,
  HelixQueryInputSchema,
  HelixQueryOutputSchema,
  NewsSearchInputSchema,
  NewsSearchOutputSchema,
  RecalcIndicatorInputSchema,
  RecalcIndicatorOutputSchema,
};
