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
  getEconomicCalendar as getFredEconomicCalendar,
  getMacroIndicators,
  type MacroIndicatorValue,
} from "../implementations/fred.js";
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
  indicator: z.string().describe("Indicator type that was calculated (RSI, SMA, etc.)"),
  symbol: z.string().describe("Symbol the indicator was calculated for"),
  values: z
    .array(z.number())
    .describe("Indicator values, most recent last. Length matches timestamps"),
  timestamps: z.array(z.string()).describe("ISO 8601 timestamps for each value, oldest to newest"),
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
  execute: async (inputData): Promise<IndicatorResult> => {
    const ctx = createToolContext();
    return recalcIndicator(ctx, inputData.indicator, inputData.symbol, inputData.params);
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
  id: z.string().describe("Unique event identifier"),
  name: z.string().describe("Event name (e.g., 'FOMC Rate Decision', 'Non-Farm Payrolls')"),
  date: z.string().describe("Event date in YYYY-MM-DD format"),
  time: z.string().describe("Event time in HH:MM format (usually Eastern)"),
  impact: z
    .enum(["high", "medium", "low"])
    .describe("Market impact level. High = major volatility expected"),
  forecast: z
    .string()
    .nullable()
    .describe("Consensus forecast value. Null if no forecast available"),
  previous: z.string().nullable().describe("Previous release value for comparison"),
  actual: z
    .string()
    .nullable()
    .describe("Actual released value. Null if event hasn't occurred yet"),
});

const EconomicCalendarOutputSchema = z.object({
  events: z
    .array(EconomicEventSchema)
    .describe("Economic events in the date range, sorted by date"),
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
  execute: async (inputData): Promise<{ events: EconomicEvent[] }> => {
    const ctx = createToolContext();
    const events = await getEconomicCalendar(ctx, inputData.startDate, inputData.endDate);
    return { events };
  },
});

// ============================================
// FRED Economic Calendar Tool
// ============================================

const FREDCalendarInputSchema = z.object({
  startDate: z.string().describe("Start date in YYYY-MM-DD format"),
  endDate: z.string().describe("End date in YYYY-MM-DD format"),
});

const FREDEventSchema = z.object({
  id: z.string().describe("Unique event identifier (fred-{release_id}-{date})"),
  name: z.string().describe("Event name (e.g., 'Consumer Price Index', 'Employment Situation')"),
  date: z.string().describe("Event date in YYYY-MM-DD format"),
  time: z.string().describe("Event time (08:30:00 for most, 14:00:00 for FOMC)"),
  impact: z
    .enum(["high", "medium", "low"])
    .describe("Market impact level based on historical volatility"),
  forecast: z.string().nullable().describe("Consensus forecast (always null for FRED releases)"),
  previous: z
    .string()
    .nullable()
    .describe("Previous release value (always null for FRED releases)"),
  actual: z.string().nullable().describe("Actual value (always null for upcoming releases)"),
});

const FREDCalendarOutputSchema = z.object({
  events: z.array(FREDEventSchema).describe("FRED economic calendar events in the date range"),
});

export const fredEconomicCalendarTool = createTool({
  id: "fred_economic_calendar",
  description: `Get economic calendar events from FRED (Federal Reserve Economic Data).

Use this tool to find upcoming Federal Reserve data releases including:
- CPI (Consumer Price Index) - HIGH impact, inflation data
- Employment Situation (NFP, unemployment) - HIGH impact
- GDP releases - HIGH impact
- FOMC rate decisions - HIGH impact
- Retail Sales - HIGH impact
- PPI (Producer Price Index) - MEDIUM impact
- Industrial Production - MEDIUM impact
- Housing Starts - MEDIUM impact
- Personal Income & Outlays - MEDIUM impact
- Durable Goods Orders - MEDIUM impact
- JOLTS (Job Openings) - MEDIUM impact

Events are filtered to tracked releases only (no minor data).
Impact levels reflect historical market reaction magnitude.

Requires FRED_API_KEY environment variable (free at fred.stlouisfed.org).`,
  inputSchema: FREDCalendarInputSchema,
  outputSchema: FREDCalendarOutputSchema,
  execute: async (inputData): Promise<{ events: EconomicEvent[] }> => {
    const ctx = createToolContext();
    const events = await getFredEconomicCalendar(ctx, inputData.startDate, inputData.endDate);
    return { events };
  },
});

// ============================================
// FRED Macro Indicators Tool
// ============================================

const MacroIndicatorsInputSchema = z.object({
  seriesIds: z
    .array(z.string())
    .optional()
    .describe("FRED series IDs to fetch. Defaults to key indicators if not specified."),
});

const MacroIndicatorValueSchema = z.object({
  value: z.number().describe("Latest value for the series"),
  date: z.string().describe("Date of the latest observation"),
  change: z.number().optional().describe("Percent change from previous observation"),
});

const MacroIndicatorsOutputSchema = z.object({
  indicators: z
    .record(z.string(), MacroIndicatorValueSchema)
    .describe("Map of series ID to latest value and change"),
});

export const fredMacroIndicatorsTool = createTool({
  id: "fred_macro_indicators",
  description: `Get latest macro economic indicators from FRED.

Use this tool to fetch the most recent values for key economic series:
- CPIAUCSL: Consumer Price Index (inflation)
- UNRATE: Unemployment Rate
- FEDFUNDS: Federal Funds Rate
- DGS10: 10-Year Treasury Yield
- DGS2: 2-Year Treasury Yield
- T10Y2Y: 10Y-2Y Spread (yield curve)
- GDPC1: Real GDP
- PCE: Personal Consumption Expenditures
- UMCSENT: Consumer Sentiment
- INDPRO: Industrial Production

Returns the latest value, date, and percent change from previous.
Use to assess current macro environment and regime.

Requires FRED_API_KEY environment variable (free at fred.stlouisfed.org).`,
  inputSchema: MacroIndicatorsInputSchema,
  outputSchema: MacroIndicatorsOutputSchema,
  execute: async (inputData): Promise<{ indicators: Record<string, MacroIndicatorValue> }> => {
    const ctx = createToolContext();
    const indicators = await getMacroIndicators(ctx, inputData.seriesIds);
    return { indicators };
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
  id: z.string().describe("Unique news article identifier"),
  headline: z.string().describe("Article headline/title. Key for quick scanning"),
  summary: z.string().describe("Article summary or first paragraph. May be truncated"),
  source: z.string().describe("News source name (e.g., 'Reuters', 'Bloomberg', 'SEC Filings')"),
  publishedAt: z.string().describe("Publication timestamp in ISO 8601 format"),
  symbols: z.array(z.string()).describe("Ticker symbols mentioned or tagged in the article"),
  sentiment: z
    .enum(["positive", "negative", "neutral"])
    .describe("Article sentiment based on keyword analysis"),
});

const NewsSearchOutputSchema = z.object({
  news: z.array(NewsItemSchema).describe("News articles matching the query, most recent first"),
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
  execute: async (inputData): Promise<{ news: NewsItem[] }> => {
    const ctx = createToolContext();
    const news = await searchNews(ctx, inputData.query, inputData.symbols, inputData.limit);
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
  nodes: z
    .array(z.unknown())
    .describe("Graph nodes returned by query. Structure depends on query type"),
  edges: z.array(z.unknown()).describe("Graph edges/relationships between nodes"),
  metadata: z
    .record(z.string(), z.unknown())
    .describe("Query metadata: timing, match count, similarity scores"),
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
  execute: async (inputData): Promise<HelixQueryResult> => {
    const ctx = createToolContext();
    return helixQuery(ctx, inputData.queryName, inputData.params as Record<string, unknown>);
  },
});

// Re-export schemas for testing
export {
  EconomicCalendarInputSchema,
  EconomicCalendarOutputSchema,
  FREDCalendarInputSchema,
  FREDCalendarOutputSchema,
  HelixQueryInputSchema,
  HelixQueryOutputSchema,
  MacroIndicatorsInputSchema,
  MacroIndicatorsOutputSchema,
  NewsSearchInputSchema,
  NewsSearchOutputSchema,
  RecalcIndicatorInputSchema,
  RecalcIndicatorOutputSchema,
};
