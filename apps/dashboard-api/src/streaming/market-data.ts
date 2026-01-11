/**
 * Market Data Streaming Service
 *
 * Connects to Alpaca WebSocket for real-time market data
 * and broadcasts updates to connected dashboard clients.
 *
 * @see docs/plans/ui/06-websocket.md
 * @see docs/plans/31-alpaca-data-consolidation.md
 */

import {
  AlpacaConnectionState,
  type AlpacaMarketDataClient,
  type AlpacaWebSocketClient,
  type AlpacaWsBarMessage,
  type AlpacaWsEvent,
  type AlpacaWsQuoteMessage,
  type AlpacaWsTradeMessage,
  createAlpacaClientFromEnv,
  createAlpacaStocksClientFromEnv,
  isAlpacaConfigured,
} from "@cream/marketdata";
import log from "../logger.js";
import { broadcastAggregate, broadcastQuote, broadcastTrade } from "../websocket/handler.js";

// Alpaca REST client for fetching previous close
let alpacaClient: AlpacaMarketDataClient | null = null;

function getAlpacaClient(): AlpacaMarketDataClient | null {
  if (alpacaClient) {
    return alpacaClient;
  }
  if (!isAlpacaConfigured()) {
    return null;
  }
  alpacaClient = createAlpacaClientFromEnv();
  return alpacaClient;
}

// ============================================
// State
// ============================================

let alpacaWsClient: AlpacaWebSocketClient | null = null;
let isInitialized = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

/**
 * Active symbol subscriptions from dashboard clients.
 * When a client subscribes to a symbol, we add it here
 * and subscribe to Alpaca WebSocket.
 */
const activeSymbols = new Set<string>();

/**
 * Quote cache - stores latest quote data per symbol
 * for new clients that subscribe.
 */
const quoteCache = new Map<
  string,
  {
    bid: number;
    ask: number;
    last: number;
    volume: number;
    prevClose: number;
    timestamp: Date;
  }
>();

// ============================================
// Initialization
// ============================================

/**
 * Initialize the market data streaming service.
 * Connects to Alpaca WebSocket and sets up event handlers.
 */
export async function initMarketDataStreaming(): Promise<void> {
  if (isInitialized) {
    return;
  }

  // Check if Alpaca credentials are available
  if (!isAlpacaConfigured()) {
    log.warn("ALPACA_KEY/ALPACA_SECRET not set, market data streaming disabled");
    return;
  }

  log.info("Initializing market data streaming with Alpaca");

  try {
    // Use SIP feed for Algo Trader Plus full market data
    alpacaWsClient = createAlpacaStocksClientFromEnv("sip");

    // Set up event handlers
    alpacaWsClient.on(handleAlpacaEvent);

    // Connect
    await alpacaWsClient.connect();
    isInitialized = true;
    reconnectAttempts = 0;
    log.info("Market data streaming connected to Alpaca");
  } catch (error) {
    log.warn(
      { error: error instanceof Error ? error.message : String(error) },
      "Market data streaming initialization failed, server will start without streaming"
    );
  }
}

/**
 * Shutdown the market data streaming service.
 */
export function shutdownMarketDataStreaming(): void {
  log.info({ activeSymbols: activeSymbols.size }, "Shutting down market data streaming");
  if (alpacaWsClient) {
    alpacaWsClient.disconnect();
    alpacaWsClient = null;
  }
  isInitialized = false;
  activeSymbols.clear();
  quoteCache.clear();
  log.info("Market data streaming shutdown complete");
}

// ============================================
// Event Handlers
// ============================================

/**
 * Handle events from Alpaca WebSocket.
 */
function handleAlpacaEvent(event: AlpacaWsEvent): void {
  switch (event.type) {
    case "connected":
      log.debug("Alpaca WebSocket connected");
      break;

    case "authenticated":
      log.info({ activeSymbols: activeSymbols.size }, "Alpaca WebSocket authenticated");
      // Resubscribe to active symbols after reconnection
      if (activeSymbols.size > 0) {
        const symbols = Array.from(activeSymbols);
        alpacaWsClient?.subscribe("quotes", symbols);
        alpacaWsClient?.subscribe("trades", symbols);
        alpacaWsClient?.subscribe("bars", symbols);
      }
      break;

    case "subscribed":
      log.debug({ subscriptions: event.subscriptions }, "Subscribed to market data symbols");
      break;

    case "bar":
      handleBarMessage(event.message);
      break;

    case "quote":
      handleQuoteMessage(event.message);
      break;

    case "trade":
      handleTradeMessage(event.message);
      break;

    case "disconnected":
      log.warn({ reason: event.reason }, "Alpaca WebSocket disconnected");
      break;

    case "reconnecting":
      reconnectAttempts = event.attempt;
      log.info(
        { attempt: event.attempt, maxAttempts: MAX_RECONNECT_ATTEMPTS },
        "Reconnecting to Alpaca WebSocket"
      );
      break;

    case "error":
      log.error(
        { code: event.code, message: event.message, reconnectAttempts },
        "Alpaca WebSocket error"
      );
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        log.error("Max reconnect attempts reached, market data streaming disabled");
        isInitialized = false;
      }
      break;
  }
}

/**
 * Handle bar (OHLCV) messages from Alpaca.
 * These are per-minute candle updates.
 */
function handleBarMessage(msg: AlpacaWsBarMessage): void {
  const symbol = msg.S.toUpperCase();

  // Update cache - preserve prevClose if we have it, otherwise use open price
  const cached = quoteCache.get(symbol);
  const prevClose = cached?.prevClose ?? msg.o; // Use cached prevClose or open price as fallback

  quoteCache.set(symbol, {
    bid: msg.c, // Use close as proxy for bid (no bid in bars)
    ask: msg.c, // Use close as proxy for ask
    last: msg.c,
    volume: msg.v,
    prevClose,
    timestamp: new Date(msg.t),
  });

  // Calculate change percent
  const changePercent = prevClose > 0 ? ((msg.c - prevClose) / prevClose) * 100 : 0;

  // Broadcast to subscribed clients
  broadcastQuote(symbol, {
    type: "quote",
    data: {
      symbol,
      bid: msg.c, // Bars don't have bid/ask, use close
      ask: msg.c,
      last: msg.c,
      volume: msg.v,
      prevClose,
      changePercent,
      timestamp: new Date(msg.t).toISOString(),
    },
  });

  // Broadcast aggregate candle
  broadcastAggregate(symbol, {
    type: "aggregate",
    data: {
      symbol,
      open: msg.o,
      high: msg.h,
      low: msg.l,
      close: msg.c,
      volume: msg.v,
      vwap: msg.vw ?? 0,
      timestamp: new Date(msg.t).toISOString(), // Bar timestamp
      endTimestamp: new Date(msg.t).toISOString(), // Same as timestamp for minute bars
    },
  });
}

/**
 * Handle quote (bid/ask) messages from Alpaca.
 * These provide real-time bid/ask updates.
 */
function handleQuoteMessage(msg: AlpacaWsQuoteMessage): void {
  const symbol = msg.S.toUpperCase();

  // Get cached data for last price, volume, and prevClose
  const cached = quoteCache.get(symbol);
  const last = cached?.last ?? (msg.bp + msg.ap) / 2; // Use mid if no last
  const prevClose = cached?.prevClose ?? last; // Use cached prevClose or current price as fallback

  // Update cache
  quoteCache.set(symbol, {
    bid: msg.bp,
    ask: msg.ap,
    last,
    volume: cached?.volume ?? 0,
    prevClose,
    timestamp: new Date(msg.t), // RFC-3339 timestamp string
  });

  // Calculate change percent from previous day's close
  const changePercent = prevClose > 0 ? ((last - prevClose) / prevClose) * 100 : 0;

  // Broadcast to subscribed clients
  broadcastQuote(symbol, {
    type: "quote",
    data: {
      symbol,
      bid: msg.bp,
      ask: msg.ap,
      last,
      bidSize: msg.bs,
      askSize: msg.as,
      volume: cached?.volume ?? 0,
      prevClose,
      changePercent,
      timestamp: new Date(msg.t).toISOString(),
    },
  });
}

/**
 * Handle trade messages from Alpaca.
 * These provide real-time trade executions for Time & Sales.
 */
function handleTradeMessage(msg: AlpacaWsTradeMessage): void {
  const symbol = msg.S.toUpperCase();

  // Broadcast to subscribed clients
  // Note: Alpaca uses string trade conditions, but the dashboard expects numeric.
  // We omit conditions for simplicity as they're rarely used in the UI.
  broadcastTrade(symbol, {
    type: "trade",
    data: {
      ev: "T",
      sym: symbol,
      p: msg.p, // Price
      s: msg.s, // Size
      x: msg.x ? exchangeCodeToId(msg.x) : 0, // Exchange ID
      c: [], // Trade conditions (omitted - Alpaca uses strings, dashboard expects numbers)
      t: new Date(msg.t).getTime() * 1e6, // Convert to nanoseconds for compatibility
      i: msg.i?.toString() ?? `${symbol}-${msg.t}`, // Trade ID
    },
  });
}

/**
 * Convert exchange code to numeric ID for backwards compatibility.
 */
function exchangeCodeToId(exchange: string): number {
  const exchangeMap: Record<string, number> = {
    A: 1, // NYSE American
    B: 2, // NASDAQ OMX BX
    C: 3, // NYSE National
    D: 4, // FINRA ADF
    H: 5, // MIAX
    I: 6, // ISE
    J: 7, // Cboe EDGA
    K: 8, // Cboe EDGX
    L: 9, // LTSE
    M: 10, // NYSE Chicago
    N: 11, // NYSE
    P: 12, // NYSE Arca
    Q: 13, // NASDAQ
    S: 14, // NASDAQ TRF
    T: 15, // NASDAQ TRF
    U: 16, // MEMX
    V: 17, // IEX
    W: 18, // CBSX
    X: 19, // NASDAQ PSX
    Y: 20, // Cboe BYX
    Z: 21, // Cboe BZX
  };
  return exchangeMap[exchange] ?? 0;
}

// ============================================
// Symbol Management
// ============================================

/**
 * Subscribe to market data for a symbol.
 * Called when a dashboard client subscribes to quotes for a symbol.
 * Fetches previous close to enable accurate change percent calculation.
 */
export async function subscribeSymbol(symbol: string): Promise<void> {
  const upperSymbol = symbol.toUpperCase();

  if (activeSymbols.has(upperSymbol)) {
    return; // Already subscribed
  }

  activeSymbols.add(upperSymbol);

  // Fetch snapshot to seed the cache with proper prevClose
  const client = getAlpacaClient();
  if (client && !quoteCache.has(upperSymbol)) {
    client
      .getSnapshots([upperSymbol])
      .then((snapshots) => {
        const snapshot = snapshots.get(upperSymbol);
        if (snapshot && !quoteCache.has(upperSymbol)) {
          const dailyBar = snapshot.dailyBar;
          const prevBar = snapshot.prevDailyBar;
          const latestTrade = snapshot.latestTrade;
          const latestQuote = snapshot.latestQuote;

          quoteCache.set(upperSymbol, {
            bid: latestQuote?.bidPrice ?? dailyBar?.close ?? 0,
            ask: latestQuote?.askPrice ?? dailyBar?.close ?? 0,
            last: latestTrade?.price ?? dailyBar?.close ?? 0,
            volume: dailyBar?.volume ?? 0,
            prevClose: prevBar?.close ?? dailyBar?.close ?? 0,
            timestamp: dailyBar?.timestamp ? new Date(dailyBar.timestamp) : new Date(),
          });
        }
      })
      .catch(() => {});
  }

  if (alpacaWsClient?.isConnected()) {
    // Subscribe to quotes, trades, and bars for the symbol
    alpacaWsClient.subscribe("quotes", [upperSymbol]);
    alpacaWsClient.subscribe("trades", [upperSymbol]);
    alpacaWsClient.subscribe("bars", [upperSymbol]);
  }
}

/**
 * Subscribe to multiple symbols at once.
 * Fetches previous close for new symbols to enable accurate change percent calculation.
 */
export async function subscribeSymbols(symbols: string[]): Promise<void> {
  const newSymbols = symbols.map((s) => s.toUpperCase()).filter((s) => !activeSymbols.has(s));

  if (newSymbols.length === 0) {
    return;
  }

  for (const symbol of newSymbols) {
    activeSymbols.add(symbol);
  }

  // Fetch snapshots for new symbols to seed the cache with proper prevClose
  const client = getAlpacaClient();
  if (client) {
    // Fetch in parallel but don't block subscription
    client
      .getSnapshots(newSymbols)
      .then((snapshots) => {
        for (const [symbol, snapshot] of snapshots) {
          if (!quoteCache.has(symbol)) {
            const dailyBar = snapshot.dailyBar;
            const prevBar = snapshot.prevDailyBar;
            const latestTrade = snapshot.latestTrade;
            const latestQuote = snapshot.latestQuote;

            quoteCache.set(symbol, {
              bid: latestQuote?.bidPrice ?? dailyBar?.close ?? 0,
              ask: latestQuote?.askPrice ?? dailyBar?.close ?? 0,
              last: latestTrade?.price ?? dailyBar?.close ?? 0,
              volume: dailyBar?.volume ?? 0,
              prevClose: prevBar?.close ?? dailyBar?.close ?? 0,
              timestamp: dailyBar?.timestamp ? new Date(dailyBar.timestamp) : new Date(),
            });
          }
        }
      })
      .catch(() => {});
  }

  if (alpacaWsClient?.isConnected()) {
    // Subscribe to quotes, trades, and bars for each symbol
    alpacaWsClient.subscribe("quotes", newSymbols);
    alpacaWsClient.subscribe("trades", newSymbols);
    alpacaWsClient.subscribe("bars", newSymbols);
  }
}

/**
 * Unsubscribe from market data for a symbol.
 * Called when no dashboard clients are subscribed to a symbol anymore.
 */
export async function unsubscribeSymbol(symbol: string): Promise<void> {
  const upperSymbol = symbol.toUpperCase();

  if (!activeSymbols.has(upperSymbol)) {
    return; // Not subscribed
  }

  activeSymbols.delete(upperSymbol);
  quoteCache.delete(upperSymbol);

  if (alpacaWsClient?.isConnected()) {
    // Unsubscribe from quotes, trades, and bars
    alpacaWsClient.unsubscribe("quotes", [upperSymbol]);
    alpacaWsClient.unsubscribe("trades", [upperSymbol]);
    alpacaWsClient.unsubscribe("bars", [upperSymbol]);
  }
}

/**
 * Get the cached quote for a symbol.
 */
export function getCachedQuote(symbol: string): {
  bid: number;
  ask: number;
  last: number;
  volume: number;
  prevClose: number;
  timestamp: Date;
} | null {
  return quoteCache.get(symbol.toUpperCase()) ?? null;
}

/**
 * Get all actively subscribed symbols.
 */
export function getActiveSymbols(): string[] {
  return Array.from(activeSymbols);
}

/**
 * Check if streaming is initialized and connected.
 */
export function isStreamingConnected(): boolean {
  return isInitialized && alpacaWsClient?.getState() === AlpacaConnectionState.AUTHENTICATED;
}

// ============================================
// Default Export
// ============================================

export default {
  initMarketDataStreaming,
  shutdownMarketDataStreaming,
  subscribeSymbol,
  subscribeSymbols,
  unsubscribeSymbol,
  getCachedQuote,
  getActiveSymbols,
  isStreamingConnected,
};
