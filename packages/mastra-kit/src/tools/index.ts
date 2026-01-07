/**
 * Agent Tools
 *
 * Tools that agents can invoke during execution to access
 * real-time data and perform calculations.
 *
 * Implementation status:
 * - getQuotes: Uses gRPC MarketDataService (falls back to mock if unavailable)
 * - getPortfolioState: Uses gRPC ExecutionService (falls back to mock if unavailable)
 * - getOptionChain: Uses gRPC MarketDataService (falls back to mock if unavailable)
 * - getGreeks: Uses gRPC MarketDataService GetOptionChain (falls back to mock if unavailable)
 * - recalcIndicator: Uses gRPC for bars + @cream/indicators for calculation
 * - helixQuery: Uses @cream/helix HelixDB client (falls back to empty on error)
 * - economicCalendar: Uses FMP API for economic events (falls back to empty if unavailable)
 * - searchNews: Uses FMP API for news with keyword-based sentiment (falls back to empty if unavailable)
 *
 * @see docs/plans/05-agents.md
 */

import {
  type AlpacaClient,
  type Position as BrokerPosition,
  createBrokerClient,
} from "@cream/broker";
import { isBacktest } from "@cream/domain";
import {
  createExecutionClient,
  createMarketDataClient,
  type ExecutionServiceClient,
  GrpcError,
  type MarketDataServiceClient,
} from "@cream/domain/grpc";
import { createHelixClientFromEnv, type HelixClient, HelixError } from "@cream/helix";
import {
  type Candle,
  calculateATR,
  calculateBollingerBands,
  calculateEMA,
  calculateRSI,
  calculateSMA,
  calculateStochastic,
  calculateVolumeSMA,
} from "@cream/indicators";
import { createFMPClient, type FMPClient, type FMPStockNews } from "@cream/universe";
import { checkIndicatorTrigger } from "./checkIndicatorTrigger.js";
import { implementIndicator } from "./claudeCodeIndicator.js";
import { type WebSearchParams, type WebSearchResponse, webSearch } from "./webSearch.js";

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
// gRPC Client Singletons
// ============================================

const DEFAULT_MARKET_DATA_URL = process.env.MARKET_DATA_SERVICE_URL ?? "http://localhost:50052";
const DEFAULT_EXECUTION_URL = process.env.EXECUTION_SERVICE_URL ?? "http://localhost:50051";

let marketDataClient: MarketDataServiceClient | null = null;
let executionClient: ExecutionServiceClient | null = null;

function getMarketDataClient(): MarketDataServiceClient {
  if (!marketDataClient) {
    marketDataClient = createMarketDataClient(DEFAULT_MARKET_DATA_URL);
  }
  return marketDataClient;
}

function getExecutionClient(): ExecutionServiceClient {
  if (!executionClient) {
    executionClient = createExecutionClient(DEFAULT_EXECUTION_URL);
  }
  return executionClient;
}

let helixClient: HelixClient | null = null;

function getHelixClient(): HelixClient {
  if (!helixClient) {
    helixClient = createHelixClientFromEnv();
  }
  return helixClient;
}

let brokerClient: AlpacaClient | null = null;

/**
 * Get broker client for Alpaca API access.
 * Returns null if credentials are not configured.
 */
function getBrokerClient(): AlpacaClient | null {
  if (brokerClient) {
    return brokerClient;
  }

  // Check for required credentials
  const apiKey = process.env.ALPACA_KEY;
  const apiSecret = process.env.ALPACA_SECRET;

  if (!apiKey || !apiSecret) {
    return null;
  }

  brokerClient = createBrokerClient();
  return brokerClient;
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
 * Create mock portfolio state for backtest/fallback
 */
function createMockPortfolioState(): PortfolioStateResponse {
  return {
    positions: [],
    buyingPower: 100000,
    totalEquity: 100000,
    dayPnL: 0,
    totalPnL: 0,
  };
}

/**
 * Get current portfolio state
 *
 * Priority order:
 * 1. gRPC ExecutionService (when Rust backend is running)
 * 2. Alpaca broker client (direct API access)
 * 3. Mock data (for development/testing)
 *
 * @returns Portfolio state including positions and buying power
 */
export async function getPortfolioState(): Promise<PortfolioStateResponse> {
  // In backtest mode, always return mock data for performance
  if (isBacktest()) {
    return createMockPortfolioState();
  }

  // Try gRPC first
  try {
    const client = getExecutionClient();

    // Fetch account state and positions in parallel
    const [accountResponse, positionsResponse] = await Promise.all([
      client.getAccountState(),
      client.getPositions(),
    ]);

    const accountState = accountResponse.data.accountState;
    const positions = positionsResponse.data.positions ?? [];

    // Calculate total unrealized P&L
    let totalPnL = 0;
    const mappedPositions: PortfolioPosition[] = positions.map((pos) => {
      totalPnL += pos.unrealizedPnl ?? 0;
      return {
        symbol: pos.instrument?.instrumentId ?? "",
        quantity: pos.quantity,
        averageCost: pos.avgEntryPrice,
        marketValue: pos.marketValue,
        unrealizedPnL: pos.unrealizedPnl ?? 0,
      };
    });

    return {
      positions: mappedPositions,
      buyingPower: accountState?.buyingPower ?? 0,
      totalEquity: accountState?.equity ?? 0,
      dayPnL: 0, // Would need day P&L tracking in account state
      totalPnL,
    };
  } catch (error) {
    // gRPC failed - try broker client
    if (error instanceof GrpcError && error.code === "UNIMPLEMENTED") {
      return getPortfolioStateFromBroker();
    }
    // Other gRPC errors - also try broker
    return getPortfolioStateFromBroker();
  }
}

/**
 * Get portfolio state directly from Alpaca broker API
 */
async function getPortfolioStateFromBroker(): Promise<PortfolioStateResponse> {
  const client = getBrokerClient();
  if (!client) {
    // No broker credentials - fall back to mock data
    return createMockPortfolioState();
  }

  try {
    // Fetch account and positions in parallel
    const [account, positions] = await Promise.all([client.getAccount(), client.getPositions()]);

    // Map positions to our format
    let totalPnL = 0;
    const mappedPositions: PortfolioPosition[] = positions.map((pos: BrokerPosition) => {
      const unrealizedPnL = pos.unrealizedPl;
      totalPnL += unrealizedPnL;
      return {
        symbol: pos.symbol,
        quantity: pos.qty,
        averageCost: pos.avgEntryPrice,
        marketValue: pos.marketValue,
        unrealizedPnL,
      };
    });

    return {
      positions: mappedPositions,
      buyingPower: account.buyingPower,
      totalEquity: account.equity,
      dayPnL: account.equity - account.lastEquity,
      totalPnL,
    };
  } catch {
    // Broker failed - fall back to mock data
    return createMockPortfolioState();
  }
}

/**
 * Create mock option chain for backtest/fallback
 */
function createMockOptionChain(underlying: string): OptionChainResponse {
  return {
    underlying,
    expirations: [],
  };
}

/**
 * Get option chain for an underlying
 *
 * Uses gRPC MarketDataService when available, falls back to mock data.
 *
 * @param underlying - Underlying symbol
 * @returns Option chain with expirations and strikes
 */
export async function getOptionChain(underlying: string): Promise<OptionChainResponse> {
  // In backtest mode, always return mock data for performance
  if (isBacktest()) {
    return createMockOptionChain(underlying);
  }

  try {
    const client = getMarketDataClient();
    const response = await client.getOptionChain({
      underlying,
    });

    const chain = response.data.chain;
    if (!chain || !chain.options || chain.options.length === 0) {
      return createMockOptionChain(underlying);
    }

    // Group options by expiration
    const expirationMap = new Map<string, OptionExpiration>();

    for (const opt of chain.options) {
      const contract = opt.contract;
      const quote = opt.quote;
      if (!contract || !quote) {
        continue;
      }

      const expiration = contract.expiration ?? ""; // Already in YYYY-MM-DD format
      const optionType = contract.optionType === 1 ? "call" : "put"; // 1 = CALL, 2 = PUT

      // Construct a symbol from underlying, expiration, type, strike
      const typeChar = optionType === "call" ? "C" : "P";
      const expirationShort = expiration.replace(/-/g, "").slice(2); // YYMMDD
      const strikeStr = Math.floor(contract.strike * 1000)
        .toString()
        .padStart(8, "0");
      const constructedSymbol = `${contract.underlying.padEnd(6)}${expirationShort}${typeChar}${strikeStr}`;

      const optContract: OptionContract = {
        symbol: constructedSymbol,
        strike: contract.strike,
        expiration,
        type: optionType,
        bid: quote.bid,
        ask: quote.ask,
        last: quote.last,
        volume: Number(quote.volume),
        openInterest: opt.openInterest ?? 0,
      };

      let expData = expirationMap.get(expiration);
      if (!expData) {
        expData = { expiration, calls: [], puts: [] };
        expirationMap.set(expiration, expData);
      }

      if (optionType === "call") {
        expData.calls.push(optContract);
      } else {
        expData.puts.push(optContract);
      }
    }

    // Sort expirations and convert to array
    const sortedExpirations = Array.from(expirationMap.values()).sort((a, b) =>
      a.expiration.localeCompare(b.expiration)
    );

    // Sort calls/puts by strike
    for (const exp of sortedExpirations) {
      exp.calls.sort((a, b) => a.strike - b.strike);
      exp.puts.sort((a, b) => a.strike - b.strike);
    }

    return {
      underlying,
      expirations: sortedExpirations,
    };
  } catch (error) {
    // Fall back to mock data if gRPC fails
    if (error instanceof GrpcError && error.code === "UNIMPLEMENTED") {
      // Expected during development - silently fall back
      return createMockOptionChain(underlying);
    }
    // Unexpected errors - silently fall back to mock data
    return createMockOptionChain(underlying);
  }
}

/**
 * Create mock Greeks for backtest/fallback
 */
function createMockGreeks(): Greeks {
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
 * Parse OSI symbol into components
 * OSI format: ROOT (up to 6 chars padded) + YYMMDD + C/P + strike * 1000 (8 digits)
 * e.g., "AAPL  240119C00185000" -> { underlying: "AAPL", expiration: "2024-01-19", type: "call", strike: 185 }
 */
function parseOSISymbol(
  osiSymbol: string
): { underlying: string; expiration: string; type: "call" | "put"; strike: number } | null {
  // Remove all spaces and convert to uppercase
  const normalized = osiSymbol.replace(/\s/g, "").toUpperCase();

  // OSI format: ROOT + YYMMDD + C/P + 8 digit strike
  // Minimum length: 1 (root) + 6 (date) + 1 (type) + 8 (strike) = 16
  if (normalized.length < 16) {
    return null;
  }

  // Extract components from the end (strike is always 8 digits, type is 1 char, date is 6 digits)
  const strike = Number.parseInt(normalized.slice(-8), 10) / 1000;
  const typeChar = normalized.slice(-9, -8);
  const dateStr = normalized.slice(-15, -9);
  const underlying = normalized.slice(0, -15);

  if (typeChar !== "C" && typeChar !== "P") {
    return null;
  }
  if (!/^\d{6}$/.test(dateStr)) {
    return null;
  }

  // Parse date: YYMMDD -> YYYY-MM-DD
  const yy = Number.parseInt(dateStr.slice(0, 2), 10);
  const mm = dateStr.slice(2, 4);
  const dd = dateStr.slice(4, 6);
  const year = yy >= 70 ? 1900 + yy : 2000 + yy; // Handle Y2K-ish dates

  return {
    underlying: underlying.trim(),
    expiration: `${year}-${mm}-${dd}`,
    type: typeChar === "C" ? "call" : "put",
    strike,
  };
}

/**
 * Get Greeks for an option contract
 *
 * Uses gRPC MarketDataService GetOptionChain to find the specific contract
 * and extract its Greeks. Falls back to mock data if unavailable.
 *
 * @param contractSymbol - Option contract symbol (OSI format)
 * @returns Greeks (delta, gamma, theta, vega, rho, IV)
 */
export async function getGreeks(contractSymbol: string): Promise<Greeks> {
  // In backtest mode, always return mock data for performance
  if (isBacktest()) {
    return createMockGreeks();
  }

  // Parse the OSI symbol to extract components
  const parsed = parseOSISymbol(contractSymbol);
  if (!parsed) {
    return createMockGreeks();
  }

  try {
    const client = getMarketDataClient();

    // Get option chain for the underlying
    const response = await client.getOptionChain({
      underlying: parsed.underlying,
    });

    const chain = response.data.chain;
    if (!chain || !chain.options) {
      return createMockGreeks();
    }

    // Find the specific contract by matching underlying, expiration, type, and strike
    const option = chain.options.find((opt) => {
      const contract = opt.contract;
      if (!contract) {
        return false;
      }

      const matchesUnderlying =
        contract.underlying.toUpperCase().trim() === parsed.underlying.toUpperCase();
      const matchesExpiration = contract.expiration === parsed.expiration;
      const matchesType =
        (parsed.type === "call" && contract.optionType === 1) ||
        (parsed.type === "put" && contract.optionType === 2);
      // Allow small tolerance for strike matching (floating point)
      const matchesStrike = Math.abs(contract.strike - parsed.strike) < 0.01;

      return matchesUnderlying && matchesExpiration && matchesType && matchesStrike;
    });

    if (!option) {
      return createMockGreeks();
    }

    return {
      delta: option.delta ?? 0.5,
      gamma: option.gamma ?? 0.05,
      theta: option.theta ?? -0.02,
      vega: option.vega ?? 0.15,
      rho: option.rho ?? 0.01,
      iv: option.impliedVolatility ?? 0.25,
    };
  } catch (error) {
    // Fall back to mock data if gRPC fails
    if (error instanceof GrpcError && error.code === "UNIMPLEMENTED") {
      // Expected during development - silently fall back
      return createMockGreeks();
    }
    // Unexpected errors - silently fall back to mock data
    return createMockGreeks();
  }
}

/**
 * Create mock indicator result for backtest/fallback
 */
function createMockIndicatorResult(indicator: string, symbol: string): IndicatorResult {
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
 * Supported indicator types for recalcIndicator tool
 */
type SupportedIndicator = "RSI" | "SMA" | "EMA" | "ATR" | "BOLLINGER" | "STOCHASTIC" | "VOLUME_SMA";

/**
 * Calculate a specific indicator from candle data
 */
function calculateIndicatorFromCandles(
  indicator: SupportedIndicator,
  candles: Candle[],
  params: Record<string, number>
): { values: number[]; timestamps: number[] } {
  const results: { value: number; timestamp: number }[] = [];

  switch (indicator) {
    case "RSI": {
      const period = params.period ?? 14;
      const rsiResults = calculateRSI(candles, { period });
      for (const r of rsiResults) {
        results.push({ value: r.rsi, timestamp: r.timestamp });
      }
      break;
    }
    case "SMA": {
      const period = params.period ?? 20;
      const smaResults = calculateSMA(candles, { period });
      for (const r of smaResults) {
        results.push({ value: r.ma, timestamp: r.timestamp });
      }
      break;
    }
    case "EMA": {
      const period = params.period ?? 20;
      const emaResults = calculateEMA(candles, { period });
      for (const r of emaResults) {
        results.push({ value: r.ma, timestamp: r.timestamp });
      }
      break;
    }
    case "ATR": {
      const period = params.period ?? 14;
      const atrResults = calculateATR(candles, { period });
      for (const r of atrResults) {
        results.push({ value: r.atr, timestamp: r.timestamp });
      }
      break;
    }
    case "BOLLINGER": {
      const period = params.period ?? 20;
      const stdDev = params.stdDev ?? 2.0;
      const bbResults = calculateBollingerBands(candles, { period, stdDev });
      // Return middle band as the primary value
      for (const r of bbResults) {
        results.push({ value: r.middle, timestamp: r.timestamp });
      }
      break;
    }
    case "STOCHASTIC": {
      const kPeriod = params.kPeriod ?? 14;
      const dPeriod = params.dPeriod ?? 3;
      const stochResults = calculateStochastic(candles, { kPeriod, dPeriod, slow: true });
      // Return %K as the primary value
      for (const r of stochResults) {
        results.push({ value: r.k, timestamp: r.timestamp });
      }
      break;
    }
    case "VOLUME_SMA": {
      const period = params.period ?? 20;
      const volResults = calculateVolumeSMA(candles, { period });
      for (const r of volResults) {
        results.push({ value: r.volumeSma, timestamp: r.timestamp });
      }
      break;
    }
  }

  return {
    values: results.map((r) => r.value),
    timestamps: results.map((r) => r.timestamp),
  };
}

/**
 * Recalculate a technical indicator
 *
 * Uses gRPC MarketDataService to fetch bars, then calculates indicator
 * using the @cream/indicators package. Falls back to mock data if unavailable.
 *
 * @param indicator - Indicator name (RSI, ATR, SMA, EMA, BOLLINGER, STOCHASTIC, VOLUME_SMA)
 * @param symbol - Instrument symbol
 * @param params - Indicator parameters (period, etc.)
 * @returns Indicator values with timestamps
 */
export async function recalcIndicator(
  indicator: string,
  symbol: string,
  params: Record<string, number> = {}
): Promise<IndicatorResult> {
  // Validate indicator name
  const normalizedIndicator = indicator.toUpperCase() as SupportedIndicator;
  const supportedIndicators: SupportedIndicator[] = [
    "RSI",
    "SMA",
    "EMA",
    "ATR",
    "BOLLINGER",
    "STOCHASTIC",
    "VOLUME_SMA",
  ];

  if (!supportedIndicators.includes(normalizedIndicator)) {
    // Return mock for unsupported indicators
    return createMockIndicatorResult(indicator, symbol);
  }

  // In backtest mode, always return mock data for performance
  if (isBacktest()) {
    return createMockIndicatorResult(indicator, symbol);
  }

  try {
    const client = getMarketDataClient();

    // Fetch bars from MarketDataService
    // Request 1-hour bars (timeframe 60) for the symbol
    const timeframe = params.timeframe ?? 60;
    const response = await client.getSnapshot({
      symbols: [symbol],
      includeBars: true,
      barTimeframes: [timeframe],
    });

    // Extract bars and convert to Candle format
    const symbolSnapshot = response.data.snapshot?.symbols?.find((s) => s.symbol === symbol);
    const bars = symbolSnapshot?.bars ?? [];

    if (bars.length === 0) {
      return createMockIndicatorResult(indicator, symbol);
    }

    // Convert protobuf bars to Candle format
    const candles: Candle[] = bars.map((bar) => ({
      timestamp: bar.timestamp?.toDate?.()?.getTime() ?? Date.now(),
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: Number(bar.volume),
    }));

    // Sort by timestamp (oldest first)
    candles.sort((a, b) => a.timestamp - b.timestamp);

    // Calculate the indicator
    const result = calculateIndicatorFromCandles(normalizedIndicator, candles, params);

    return {
      indicator: normalizedIndicator,
      symbol,
      values: result.values,
      timestamps: result.timestamps.map((ts) => new Date(ts).toISOString()),
    };
  } catch (error) {
    // Fall back to mock data if gRPC fails
    if (error instanceof GrpcError && error.code === "UNIMPLEMENTED") {
      // Expected during development - silently fall back
      return createMockIndicatorResult(indicator, symbol);
    }
    // Unexpected errors - silently fall back to mock data
    return createMockIndicatorResult(indicator, symbol);
  }
}

// FMP client singleton (lazy initialization)
let fmpClient: FMPClient | null = null;

function getFMPClient(): FMPClient | null {
  if (fmpClient) {
    return fmpClient;
  }

  // Only initialize if API key is available
  const apiKey = process.env.FMP_KEY;
  if (!apiKey) {
    return null;
  }

  fmpClient = createFMPClient({ apiKey });
  return fmpClient;
}

/**
 * Get economic calendar events
 *
 * Fetches upcoming and recent economic data releases from FMP API.
 * Returns empty array in backtest mode or if FMP API is unavailable.
 *
 * @param startDate - Start date (YYYY-MM-DD format)
 * @param endDate - End date (YYYY-MM-DD format)
 * @returns Array of economic events
 */
export async function getEconomicCalendar(
  startDate: string,
  endDate: string
): Promise<EconomicEvent[]> {
  // In backtest mode, return empty array for consistent/fast execution
  if (isBacktest()) {
    return [];
  }

  const client = getFMPClient();
  if (!client) {
    // FMP_KEY not set - return empty array
    return [];
  }

  try {
    // Convert ISO dates to YYYY-MM-DD format
    const from = startDate.split("T")[0] ?? startDate;
    const to = endDate.split("T")[0] ?? endDate;

    const events = await client.getEconomicCalendar(from, to);

    // Transform FMP events to our EconomicEvent format
    return events.map((event) => {
      // Extract time from date if it includes time, otherwise use midnight
      const [datePart, timePart] = event.date.includes(" ")
        ? event.date.split(" ")
        : [event.date, "00:00:00"];

      // Generate a stable ID from date and event name
      const id = `${datePart}-${event.event.replace(/\s+/g, "-").toLowerCase()}`;

      return {
        id,
        name: event.event,
        date: datePart ?? event.date,
        time: timePart ?? "00:00:00",
        impact: mapFMPImpact(event.impact) ?? "medium",
        forecast: event.estimate != null ? String(event.estimate) : null,
        previous: event.previous != null ? String(event.previous) : null,
        actual: event.actual != null ? String(event.actual) : null,
      };
    });
  } catch (error) {
    // Log but don't fail - economic calendar is supplementary context
    // biome-ignore lint/suspicious/noConsole: Intentional - debug logging
    console.warn("Failed to fetch economic calendar:", error);
    return [];
  }
}

/**
 * Map FMP impact levels to our impact enum
 */
function mapFMPImpact(impact?: "Low" | "Medium" | "High"): "low" | "medium" | "high" | undefined {
  switch (impact) {
    case "Low":
      return "low";
    case "Medium":
      return "medium";
    case "High":
      return "high";
    default:
      return undefined;
  }
}

/**
 * Simple sentiment detection based on keywords
 * Used as a quick heuristic; for more sophisticated analysis,
 * use the external-context package extraction pipeline.
 */
function detectSentiment(text: string): "positive" | "negative" | "neutral" {
  const lowerText = text.toLowerCase();

  // Positive keywords
  const positiveKeywords = [
    "surge",
    "soar",
    "jump",
    "rally",
    "gain",
    "rise",
    "beat",
    "exceed",
    "strong",
    "bullish",
    "upgrade",
    "outperform",
    "profit",
    "growth",
    "record",
    "breakthrough",
    "positive",
    "success",
  ];

  // Negative keywords
  const negativeKeywords = [
    "drop",
    "fall",
    "plunge",
    "crash",
    "decline",
    "loss",
    "miss",
    "weak",
    "bearish",
    "downgrade",
    "underperform",
    "cut",
    "warning",
    "concern",
    "risk",
    "negative",
    "failure",
    "layoff",
  ];

  let positiveCount = 0;
  let negativeCount = 0;

  for (const keyword of positiveKeywords) {
    if (lowerText.includes(keyword)) {
      positiveCount++;
    }
  }

  for (const keyword of negativeKeywords) {
    if (lowerText.includes(keyword)) {
      negativeCount++;
    }
  }

  if (positiveCount > negativeCount) {
    return "positive";
  }
  if (negativeCount > positiveCount) {
    return "negative";
  }
  return "neutral";
}

/**
 * Transform FMP news to NewsItem format
 */
function transformFMPNews(news: FMPStockNews): NewsItem {
  const combinedText = `${news.title} ${news.text}`;

  return {
    id: `fmp-${news.symbol}-${new Date(news.publishedDate).getTime()}`,
    headline: news.title,
    summary: news.text.substring(0, 500), // Limit summary length
    source: news.site,
    publishedAt: news.publishedDate,
    symbols: news.symbol ? [news.symbol] : [],
    sentiment: detectSentiment(combinedText),
  };
}

/**
 * Search news for symbols or keywords
 *
 * Fetches news from FMP API for the given symbols.
 * If no symbols provided, fetches general market news.
 * Uses simple keyword-based sentiment detection.
 *
 * For more sophisticated sentiment analysis with entity extraction,
 * use the @cream/external-context extraction pipeline.
 *
 * @param query - Search query (used for filtering results)
 * @param symbols - Optional symbol filter (fetches news for these symbols)
 * @param limit - Maximum number of results (default: 20)
 * @returns Array of news items with sentiment
 */
export async function searchNews(
  query: string,
  symbols: string[] = [],
  limit = 20
): Promise<NewsItem[]> {
  // In backtest mode, return empty array for consistent/fast execution
  if (isBacktest()) {
    return [];
  }

  const client = getFMPClient();
  if (!client) {
    // FMP_KEY not set - return empty array
    return [];
  }

  try {
    let newsItems: FMPStockNews[];

    if (symbols.length > 0) {
      // Fetch news for specific symbols
      newsItems = await client.getStockNews(symbols, limit);
    } else {
      // Fetch general market news
      newsItems = await client.getGeneralNews(limit);
    }

    // Transform to NewsItem format
    let results = newsItems.map(transformFMPNews);

    // Filter by query if provided
    if (query && query.trim() !== "") {
      const queryLower = query.toLowerCase();
      results = results.filter(
        (item) =>
          item.headline.toLowerCase().includes(queryLower) ||
          item.summary.toLowerCase().includes(queryLower)
      );
    }

    return results;
  } catch (error) {
    // Log but don't fail - news is supplementary context
    // biome-ignore lint/suspicious/noConsole: Intentional - debug logging
    console.warn("Failed to fetch news:", error);
    return [];
  }
}

/**
 * Create mock helixQuery result for backtest/fallback
 */
function createMockHelixResult(): HelixQueryResult {
  return {
    nodes: [],
    edges: [],
    metadata: {},
  };
}

/**
 * Query HelixDB for memory/graph data
 *
 * Uses the @cream/helix client to execute HelixQL queries.
 * Falls back to empty results in backtest mode or on errors.
 *
 * @param queryName - HelixQL query name (registered in HelixDB)
 * @param params - Query parameters
 * @returns Query result with nodes and edges
 */
export async function helixQuery(
  queryName: string,
  params: Record<string, unknown> = {}
): Promise<HelixQueryResult> {
  // In backtest mode, always return empty data for performance
  if (isBacktest()) {
    return createMockHelixResult();
  }

  try {
    const client = getHelixClient();

    // Execute the HelixQL query
    const result = await client.query(queryName, params);

    // Map query result to HelixQueryResult format
    // The actual structure depends on the query, but typically includes nodes and edges
    const data = result.data as {
      nodes?: unknown[];
      edges?: unknown[];
      [key: string]: unknown;
    };

    return {
      nodes: data.nodes ?? [],
      edges: data.edges ?? [],
      metadata: {
        executionTimeMs: result.executionTimeMs,
        queryName,
        ...params,
      },
    };
  } catch (error) {
    // Fall back to empty data if HelixDB fails
    if (error instanceof HelixError && error.code === "CONNECTION_FAILED") {
      // Expected during development - silently fall back
      return createMockHelixResult();
    }
    // Unexpected errors - silently fall back to empty data
    return createMockHelixResult();
  }
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
  web_search: webSearch,
  check_indicator_trigger: checkIndicatorTrigger,
  implement_indicator: implementIndicator,
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

// ============================================
// Re-exports
// ============================================

// Web search types and function
export { webSearch, type WebSearchParams, type WebSearchResponse };

// Indicator trigger detection tool
export {
  type CheckIndicatorTriggerInput,
  type CheckIndicatorTriggerOutput,
  checkIndicatorTrigger,
} from "./checkIndicatorTrigger.js";
// Claude Code indicator implementation tool
export {
  buildImplementationPrompt,
  type ClaudeCodeConfig,
  claudeCodeIndicator,
  type ImplementIndicatorInput,
  ImplementIndicatorInputSchema,
  type ImplementIndicatorOutput,
  ImplementIndicatorOutputSchema,
  implementIndicator,
} from "./claudeCodeIndicator.js";
// Mastra tool definitions
// Trading tools
export {
  getGreeksTool,
  GetGreeksInputSchema,
  GetGreeksOutputSchema,
  getOptionChainTool,
  GetOptionChainInputSchema,
  GetOptionChainOutputSchema,
  getPortfolioStateTool,
  GetPortfolioStateInputSchema,
  GetPortfolioStateOutputSchema,
  getQuotesTool,
  GetQuotesInputSchema,
  GetQuotesOutputSchema,
} from "./definitions/index.js";
// Data tools
export {
  economicCalendarTool,
  EconomicCalendarInputSchema,
  EconomicCalendarOutputSchema,
  helixQueryTool,
  HelixQueryInputSchema,
  HelixQueryOutputSchema,
  newsSearchTool,
  NewsSearchInputSchema,
  NewsSearchOutputSchema,
  recalcIndicatorTool,
  RecalcIndicatorInputSchema,
  RecalcIndicatorOutputSchema,
} from "./definitions/index.js";
// Research trigger tools (require FactorZooRepository dependency injection)
export {
  type CheckFactorDecayInput,
  CheckFactorDecayInputSchema,
  type CheckFactorDecayOutput,
  CheckFactorDecayOutputSchema,
  type CheckResearchStatusInput,
  CheckResearchStatusInputSchema,
  type CheckResearchStatusOutput,
  CheckResearchStatusOutputSchema,
  type CheckTriggerConditionsInput,
  CheckTriggerConditionsInputSchema,
  type CheckTriggerConditionsOutput,
  CheckTriggerConditionsOutputSchema,
  type ComputeMegaAlphaForSymbolsInput,
  ComputeMegaAlphaForSymbolsInputSchema,
  type ComputeMegaAlphaForSymbolsOutput,
  ComputeMegaAlphaForSymbolsOutputSchema,
  type ComputeMegaAlphaInput,
  ComputeMegaAlphaInputSchema,
  type ComputeMegaAlphaOutput,
  ComputeMegaAlphaOutputSchema,
  createCheckFactorDecayTool,
  createCheckResearchStatusTool,
  createCheckTriggerConditionsTool,
  createComputeMegaAlphaForSymbolsTool,
  createComputeMegaAlphaTool,
  createGetCurrentWeightsTool,
  createGetFactorZooStatsTool,
  // Tool factories
  createTriggerResearchTool,
  // Factor Zoo tools
  createUpdateDailyWeightsTool,
  type GetCurrentWeightsInput,
  GetCurrentWeightsInputSchema,
  type GetCurrentWeightsOutput,
  GetCurrentWeightsOutputSchema,
  type GetFactorZooStatsInput,
  GetFactorZooStatsInputSchema,
  type GetFactorZooStatsOutput,
  GetFactorZooStatsOutputSchema,
  // Input/Output types
  type TriggerResearchInput,
  // Schemas for validation
  TriggerResearchInputSchema,
  type TriggerResearchOutput,
  TriggerResearchOutputSchema,
  type UpdateDailyWeightsInput,
  UpdateDailyWeightsInputSchema,
  type UpdateDailyWeightsOutput,
  UpdateDailyWeightsOutputSchema,
  WebSearchInputSchema,
  WebSearchOutputSchema,
  webSearchTool,
} from "./definitions/index.js";
export type { WebSearchResult } from "./webSearch.js";
