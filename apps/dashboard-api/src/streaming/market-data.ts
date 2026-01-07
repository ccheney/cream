/**
 * Market Data Streaming Service
 *
 * Connects to Massive WebSocket for real-time market data
 * and broadcasts updates to connected dashboard clients.
 *
 * @see docs/plans/ui/06-websocket.md
 */

import {
  createMassiveStocksClientFromEnv,
  type MassiveAggregateMessage,
  MassiveConnectionState,
  type MassiveEvent,
  type MassiveQuoteMessage,
  type MassiveTradeMessage,
  type MassiveWebSocketClient,
} from "@cream/marketdata";
import { broadcastQuote, broadcastTrade } from "../websocket/handler.js";

// ============================================
// State
// ============================================

let massiveClient: MassiveWebSocketClient | null = null;
let isInitialized = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

/**
 * Active symbol subscriptions from dashboard clients.
 * When a client subscribes to a symbol, we add it here
 * and subscribe to Massive WebSocket.
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
    timestamp: Date;
  }
>();

// ============================================
// Initialization
// ============================================

/**
 * Initialize the market data streaming service.
 * Connects to Massive WebSocket and sets up event handlers.
 */
export async function initMarketDataStreaming(): Promise<void> {
  if (isInitialized) {
    return;
  }

  // Check if POLYGON_KEY is available
  const apiKey = process.env.POLYGON_KEY ?? Bun.env.POLYGON_KEY;
  if (!apiKey) {
    console.warn("[streaming] POLYGON_KEY not set, market data streaming disabled");
    return;
  }

  try {
    massiveClient = createMassiveStocksClientFromEnv("delayed");

    // Set up event handlers
    massiveClient.on(handleMassiveEvent);

    // Connect
    await massiveClient.connect();
    isInitialized = true;
    reconnectAttempts = 0;

    console.log("[streaming] Market data streaming initialized");
  } catch (error) {
    console.error("[streaming] Failed to initialize market data streaming:", error);
    // Don't throw - allow server to start without streaming
  }
}

/**
 * Shutdown the market data streaming service.
 */
export function shutdownMarketDataStreaming(): void {
  if (massiveClient) {
    massiveClient.disconnect();
    massiveClient = null;
  }
  isInitialized = false;
  activeSymbols.clear();
  quoteCache.clear();
  console.log("[streaming] Market data streaming shutdown");
}

// ============================================
// Event Handlers
// ============================================

/**
 * Handle events from Massive WebSocket.
 */
function handleMassiveEvent(event: MassiveEvent): void {
  switch (event.type) {
    case "connected":
      console.log("[streaming] Connected to Massive WebSocket");
      break;

    case "authenticated":
      console.log("[streaming] Authenticated with Massive");
      // Resubscribe to active symbols after reconnection
      if (activeSymbols.size > 0) {
        // Subscribe to both aggregates (AM) and trades (T)
        const subscriptions = Array.from(activeSymbols).flatMap((s) => [`AM.${s}`, `T.${s}`]);
        massiveClient?.subscribe(subscriptions).catch(console.error);
      }
      break;

    case "subscribed":
      console.log("[streaming] Subscribed:", event.params);
      break;

    case "aggregate":
      handleAggregateMessage(event.message);
      break;

    case "quote":
      handleQuoteMessage(event.message);
      break;

    case "trade":
      handleTradeMessage(event.message);
      break;

    case "disconnected":
      console.warn("[streaming] Disconnected from Massive:", event.reason);
      break;

    case "reconnecting":
      console.log(`[streaming] Reconnecting to Massive (attempt ${event.attempt})`);
      reconnectAttempts = event.attempt;
      break;

    case "error":
      console.error("[streaming] Massive error:", event.error.message);
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error("[streaming] Max reconnection attempts reached, streaming disabled");
        isInitialized = false;
      }
      break;
  }
}

/**
 * Handle aggregate (OHLCV) messages from Massive.
 * These are per-minute candle updates.
 */
function handleAggregateMessage(msg: MassiveAggregateMessage): void {
  const symbol = msg.sym.toUpperCase();

  // Update cache
  const cached = quoteCache.get(symbol);
  const prevClose = cached?.last ?? msg.o; // Use previous close or open price

  quoteCache.set(symbol, {
    bid: msg.c, // Use close as proxy for bid (no bid in aggregates)
    ask: msg.c, // Use close as proxy for ask
    last: msg.c,
    volume: msg.v,
    timestamp: new Date(msg.e),
  });

  // Calculate change percent
  const changePercent = prevClose > 0 ? ((msg.c - prevClose) / prevClose) * 100 : 0;

  // Broadcast to subscribed clients
  broadcastQuote(symbol, {
    type: "quote",
    data: {
      symbol,
      bid: msg.c, // Aggregates don't have bid/ask, use close
      ask: msg.c,
      last: msg.c,
      volume: msg.v,
      prevClose,
      changePercent,
      timestamp: new Date(msg.e).toISOString(),
    },
  });
}

/**
 * Handle quote (bid/ask) messages from Massive.
 * These provide real-time bid/ask updates.
 */
function handleQuoteMessage(msg: MassiveQuoteMessage): void {
  const symbol = msg.sym.toUpperCase();

  // Get cached data for last price and volume
  const cached = quoteCache.get(symbol);

  // Update cache
  quoteCache.set(symbol, {
    bid: msg.bp,
    ask: msg.ap,
    last: cached?.last ?? (msg.bp + msg.ap) / 2, // Use mid if no last
    volume: cached?.volume ?? 0,
    timestamp: new Date(msg.t / 1e6), // Nanoseconds to milliseconds
  });

  // Calculate change percent from previous close
  const prevClose = cached?.last ?? (msg.bp + msg.ap) / 2;
  const last = cached?.last ?? (msg.bp + msg.ap) / 2;
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
      timestamp: new Date(msg.t / 1e6).toISOString(),
    },
  });
}

/**
 * Handle trade messages from Massive.
 * These provide real-time trade executions for Time & Sales.
 */
function handleTradeMessage(msg: MassiveTradeMessage): void {
  const symbol = msg.sym.toUpperCase();

  // Broadcast to subscribed clients
  broadcastTrade(symbol, {
    type: "trade",
    data: {
      ev: msg.ev,
      sym: symbol,
      p: msg.p, // Price
      s: msg.s, // Size
      x: msg.x ?? 0, // Exchange ID (default to 0 if not provided)
      c: msg.c, // Trade conditions
      t: msg.t, // Timestamp (nanoseconds)
      i: msg.i ?? `${symbol}-${msg.t}`, // Trade ID (generate if not provided)
    },
  });
}

// ============================================
// Symbol Management
// ============================================

/**
 * Subscribe to market data for a symbol.
 * Called when a dashboard client subscribes to quotes for a symbol.
 */
export async function subscribeSymbol(symbol: string): Promise<void> {
  const upperSymbol = symbol.toUpperCase();

  if (activeSymbols.has(upperSymbol)) {
    return; // Already subscribed
  }

  activeSymbols.add(upperSymbol);

  if (massiveClient?.isConnected()) {
    // Subscribe to both aggregates (AM) and trades (T)
    await massiveClient.subscribe([`AM.${upperSymbol}`, `T.${upperSymbol}`]);
    console.log(`[streaming] Subscribed to ${upperSymbol}`);
  }
}

/**
 * Subscribe to multiple symbols at once.
 */
export async function subscribeSymbols(symbols: string[]): Promise<void> {
  const newSymbols = symbols.map((s) => s.toUpperCase()).filter((s) => !activeSymbols.has(s));

  if (newSymbols.length === 0) {
    return;
  }

  for (const symbol of newSymbols) {
    activeSymbols.add(symbol);
  }

  if (massiveClient?.isConnected()) {
    // Subscribe to both aggregates (AM) and trades (T) for each symbol
    const subscriptions = newSymbols.flatMap((s) => [`AM.${s}`, `T.${s}`]);
    await massiveClient.subscribe(subscriptions);
    console.log(`[streaming] Subscribed to ${newSymbols.length} symbols`);
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

  if (massiveClient?.isConnected()) {
    // Unsubscribe from both aggregates (AM) and trades (T)
    await massiveClient.unsubscribe([`AM.${upperSymbol}`, `T.${upperSymbol}`]);
    console.log(`[streaming] Unsubscribed from ${upperSymbol}`);
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
  return isInitialized && massiveClient?.getState() === MassiveConnectionState.AUTHENTICATED;
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
