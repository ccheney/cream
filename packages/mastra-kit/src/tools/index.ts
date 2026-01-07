/**
 * Agent Tools
 *
 * Tools that agents can invoke during execution to access
 * real-time data and perform calculations.
 *
 * Implementation status:
 * - getQuotes: Uses gRPC MarketDataService (falls back to mock if unavailable)
 * - Other tools: Stubbed with mock implementations
 *
 * @see docs/plans/05-agents.md
 */

import { isBacktest } from "@cream/domain";
import {
  createMarketDataClient,
  GrpcError,
  type MarketDataServiceClient,
} from "@cream/domain/grpc";

// ============================================
// Tool Types
// ============================================

export interface Quote {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  volume: number;
  timestamp: string;
}

export interface PortfolioStateResponse {
  positions: PortfolioPosition[];
  buyingPower: number;
  totalEquity: number;
  dayPnL: number;
  totalPnL: number;
}

export interface PortfolioPosition {
  symbol: string;
  quantity: number;
  averageCost: number;
  marketValue: number;
  unrealizedPnL: number;
}

export interface OptionChainResponse {
  underlying: string;
  expirations: OptionExpiration[];
}

export interface OptionExpiration {
  expiration: string;
  calls: OptionContract[];
  puts: OptionContract[];
}

export interface OptionContract {
  symbol: string;
  strike: number;
  expiration: string;
  type: "call" | "put";
  bid: number;
  ask: number;
  last: number;
  volume: number;
  openInterest: number;
}

export interface Greeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
  iv: number;
}

export interface IndicatorResult {
  indicator: string;
  symbol: string;
  values: number[];
  timestamps: string[];
}

export interface EconomicEvent {
  id: string;
  name: string;
  date: string;
  time: string;
  impact: "high" | "medium" | "low";
  forecast: string | null;
  previous: string | null;
  actual: string | null;
}

export interface NewsItem {
  id: string;
  headline: string;
  summary: string;
  source: string;
  publishedAt: string;
  symbols: string[];
  sentiment: "positive" | "negative" | "neutral";
}

export interface HelixQueryResult {
  nodes: unknown[];
  edges: unknown[];
  metadata: Record<string, unknown>;
}

// ============================================
// gRPC Client Singleton
// ============================================

const DEFAULT_MARKET_DATA_URL = process.env.MARKET_DATA_SERVICE_URL ?? "http://localhost:50052";

let marketDataClient: MarketDataServiceClient | null = null;

function getMarketDataClient(): MarketDataServiceClient {
  if (!marketDataClient) {
    marketDataClient = createMarketDataClient(DEFAULT_MARKET_DATA_URL);
  }
  return marketDataClient;
}

/**
 * Generate mock quote for a symbol
 */
function createMockQuote(symbol: string): Quote {
  const basePrice = 100 + Math.random() * 100;
  return {
    symbol,
    bid: basePrice - 0.02,
    ask: basePrice + 0.03,
    last: basePrice,
    volume: Math.floor(Math.random() * 1000000),
    timestamp: new Date().toISOString(),
  };
}

// ============================================
// Tool Implementations
// ============================================

/**
 * Get real-time quotes for instruments
 *
 * Uses gRPC MarketDataService when available, falls back to mock data.
 *
 * @param instruments - Array of instrument symbols
 * @returns Array of quotes
 */
export async function getQuotes(instruments: string[]): Promise<Quote[]> {
  // In backtest mode, always return mock data for performance
  if (isBacktest()) {
    return instruments.map(createMockQuote);
  }

  try {
    const client = getMarketDataClient();
    const response = await client.getSnapshot({
      symbols: instruments,
      includeBars: false,
      barTimeframes: [],
    });

    // Map protobuf quotes to tool Quote format
    const quotes: Quote[] = [];
    for (const symbolSnapshot of response.data.snapshot?.symbols ?? []) {
      const quote = symbolSnapshot.quote;
      if (quote) {
        quotes.push({
          symbol: quote.symbol,
          bid: quote.bid,
          ask: quote.ask,
          last: quote.last,
          volume: Number(quote.volume),
          timestamp: quote.timestamp?.toDate?.().toISOString() ?? new Date().toISOString(),
        });
      }
    }

    // Return mock for any missing symbols
    const foundSymbols = new Set(quotes.map((q) => q.symbol));
    for (const symbol of instruments) {
      if (!foundSymbols.has(symbol)) {
        quotes.push(createMockQuote(symbol));
      }
    }

    return quotes;
  } catch (error) {
    // Fall back to mock data if gRPC fails
    if (error instanceof GrpcError && error.code === "UNIMPLEMENTED") {
      // Expected during development - silently fall back
      return instruments.map(createMockQuote);
    }
    // Unexpected errors - silently fall back to mock data
    return instruments.map(createMockQuote);
  }
}

/**
 * Get current portfolio state
 *
 * @returns Portfolio state including positions and buying power
 *
 * @stub Returns mock data until gRPC ready
 */
export async function getPortfolioState(): Promise<PortfolioStateResponse> {
  // TODO: Replace with gRPC call to execution engine
  return {
    positions: [],
    buyingPower: 100000,
    totalEquity: 100000,
    dayPnL: 0,
    totalPnL: 0,
  };
}

/**
 * Get option chain for an underlying
 *
 * @param underlying - Underlying symbol
 * @returns Option chain with expirations and strikes
 *
 * @stub Returns mock data until gRPC ready
 */
export async function getOptionChain(underlying: string): Promise<OptionChainResponse> {
  // TODO: Replace with gRPC call to execution engine
  return {
    underlying,
    expirations: [],
  };
}

/**
 * Get Greeks for an option contract
 *
 * @param contract - Option contract symbol
 * @returns Greeks (delta, gamma, theta, vega, rho, IV)
 *
 * @stub Returns mock data until gRPC ready
 */
export async function getGreeks(contract: string): Promise<Greeks> {
  // TODO: Replace with gRPC call to execution engine
  void contract; // Suppress unused parameter warning
  return {
    delta: 0.5,
    gamma: 0.05,
    theta: -0.02,
    vega: 0.15,
    rho: 0.01,
    iv: 0.25,
  };
}

/**
 * Recalculate a technical indicator
 *
 * @param indicator - Indicator name (RSI, ATR, SMA, etc.)
 * @param symbol - Instrument symbol
 * @param params - Indicator parameters
 * @returns Indicator values
 *
 * @stub Returns mock data until gRPC ready
 */
export async function recalcIndicator(
  indicator: string,
  symbol: string,
  params: Record<string, number> = {}
): Promise<IndicatorResult> {
  // TODO: Replace with gRPC call to execution engine
  void params; // Suppress unused parameter warning
  return {
    indicator,
    symbol,
    values: [50, 51, 52, 53, 54],
    timestamps: [
      new Date(Date.now() - 4 * 3600000).toISOString(),
      new Date(Date.now() - 3 * 3600000).toISOString(),
      new Date(Date.now() - 2 * 3600000).toISOString(),
      new Date(Date.now() - 1 * 3600000).toISOString(),
      new Date().toISOString(),
    ],
  };
}

/**
 * Get economic calendar events
 *
 * @param startDate - Start date (ISO 8601)
 * @param endDate - End date (ISO 8601)
 * @returns Array of economic events
 *
 * @stub Returns mock data until gRPC ready
 */
export async function getEconomicCalendar(
  startDate: string,
  endDate: string
): Promise<EconomicEvent[]> {
  // TODO: Replace with external API call
  void startDate;
  void endDate;
  return [];
}

/**
 * Search news for symbols or keywords
 *
 * @param query - Search query
 * @param symbols - Optional symbol filter
 * @returns Array of news items
 *
 * @stub Returns mock data until gRPC ready
 */
export async function searchNews(query: string, symbols: string[] = []): Promise<NewsItem[]> {
  // TODO: Replace with external API call
  void query;
  void symbols;
  return [];
}

/**
 * Query HelixDB for memory/graph data
 *
 * @param query - HelixQL query string
 * @param filters - Optional filters
 * @returns Query result with nodes and edges
 *
 * @stub Returns mock data until gRPC ready
 */
export async function helixQuery(
  query: string,
  filters: Record<string, unknown> = {}
): Promise<HelixQueryResult> {
  // TODO: Replace with HelixDB client call
  void query;
  void filters;
  return {
    nodes: [],
    edges: [],
    metadata: {},
  };
}

// ============================================
// Tool Registry
// ============================================

export const TOOL_REGISTRY = {
  get_quotes: getQuotes,
  get_portfolio_state: getPortfolioState,
  option_chain: getOptionChain,
  get_greeks: getGreeks,
  recalc_indicator: recalcIndicator,
  economic_calendar: getEconomicCalendar,
  news_search: searchNews,
  helix_query: helixQuery,
} as const;

export type ToolName = keyof typeof TOOL_REGISTRY;

/**
 * Get a tool function by name
 */
export function getTool(name: ToolName): (typeof TOOL_REGISTRY)[ToolName] {
  const tool = TOOL_REGISTRY[name];
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }
  return tool;
}

/**
 * Get all available tool names
 */
export function getAvailableTools(): ToolName[] {
  return Object.keys(TOOL_REGISTRY) as ToolName[];
}
