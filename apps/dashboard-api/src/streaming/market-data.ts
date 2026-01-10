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
  PolygonClient,
} from "@cream/marketdata";
import { broadcastAggregate, broadcastQuote, broadcastTrade } from "../websocket/handler.js";

// Polygon client for fetching previous close
let polygonClient: PolygonClient | null = null;

function getPolygonClient(): PolygonClient | null {
  if (polygonClient) {
    return polygonClient;
  }
  const apiKey = process.env.POLYGON_KEY ?? Bun.env.POLYGON_KEY;
  if (!apiKey) {
    return null;
  }
  const tier =
    (process.env.POLYGON_TIER as "free" | "starter" | "developer" | "advanced") ?? "starter";
  polygonClient = new PolygonClient({ apiKey, tier });
  return polygonClient;
}

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
    prevClose: number;
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
  } catch (_error) {
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
      break;

    case "authenticated":
      // Resubscribe to active symbols after reconnection
      if (activeSymbols.size > 0) {
        // Subscribe to aggregates (AM), trades (T), and quotes (Q)
        // Q channel provides extended hours (pre-market/after-hours) bid/ask updates
        const subscriptions = Array.from(activeSymbols).flatMap((s) => [
          `AM.${s}`,
          `T.${s}`,
          `Q.${s}`,
        ]);
        // biome-ignore lint/suspicious/noConsole: Error logging for subscribe failure
        massiveClient?.subscribe(subscriptions).catch(console.error);
      }
      break;

    case "subscribed":
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
      break;

    case "reconnecting":
      reconnectAttempts = event.attempt;
      break;

    case "error":
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
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

  // Update cache - preserve prevClose if we have it, otherwise use open price
  const cached = quoteCache.get(symbol);
  const prevClose = cached?.prevClose ?? msg.o; // Use cached prevClose or open price as fallback

  quoteCache.set(symbol, {
    bid: msg.c, // Use close as proxy for bid (no bid in aggregates)
    ask: msg.c, // Use close as proxy for ask
    last: msg.c,
    volume: msg.v,
    prevClose,
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
      vwap: msg.vw,
      timestamp: new Date(msg.s).toISOString(), // Start time
      endTimestamp: new Date(msg.e).toISOString(), // End time
    },
  });
}

/**
 * Handle quote (bid/ask) messages from Massive.
 * These provide real-time bid/ask updates.
 */
function handleQuoteMessage(msg: MassiveQuoteMessage): void {
  const symbol = msg.sym.toUpperCase();

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
    timestamp: new Date(msg.t / 1e6), // Nanoseconds to milliseconds
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
 * Fetches previous close to enable accurate change percent calculation.
 */
export async function subscribeSymbol(symbol: string): Promise<void> {
  const upperSymbol = symbol.toUpperCase();

  if (activeSymbols.has(upperSymbol)) {
    return; // Already subscribed
  }

  activeSymbols.add(upperSymbol);

  // Fetch recent daily bars to seed the cache with proper prevClose
  const client = getPolygonClient();
  if (client && !quoteCache.has(upperSymbol)) {
    const recentFrom = new Date();
    recentFrom.setDate(recentFrom.getDate() - 7);
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const todayNY = formatter.format(new Date());

    client
      .getAggregates(upperSymbol, 1, "day", recentFrom.toISOString().slice(0, 10), todayNY, {
        limit: 5,
        sort: "desc",
      })
      .then((response) => {
        const bars = response.results ?? [];
        if (bars.length >= 1 && !quoteCache.has(upperSymbol)) {
          const latestBar = bars[0];
          const prevBar = bars[1];
          quoteCache.set(upperSymbol, {
            bid: latestBar?.c ?? 0,
            ask: latestBar?.c ?? 0,
            last: latestBar?.c ?? 0,
            volume: latestBar?.v ?? 0,
            prevClose: prevBar?.c ?? latestBar?.c ?? 0,
            timestamp: latestBar ? new Date(latestBar.t) : new Date(),
          });
        }
      })
      .catch(() => {});
  }

  if (massiveClient?.isConnected()) {
    // Subscribe to aggregates (AM), trades (T), and quotes (Q)
    // Q channel provides extended hours (pre-market/after-hours) bid/ask updates
    await massiveClient.subscribe([`AM.${upperSymbol}`, `T.${upperSymbol}`, `Q.${upperSymbol}`]);
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

  // Fetch recent daily bars for new symbols to seed the cache with proper prevClose
  const client = getPolygonClient();
  if (client) {
    const recentFrom = new Date();
    recentFrom.setDate(recentFrom.getDate() - 7);
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const todayNY = formatter.format(new Date());

    // Fetch in parallel but don't block subscription
    Promise.all(
      newSymbols.map(async (symbol) => {
        try {
          const response = await client.getAggregates(
            symbol,
            1,
            "day",
            recentFrom.toISOString().slice(0, 10),
            todayNY,
            { limit: 5, sort: "desc" }
          );
          const bars = response.results ?? [];
          if (bars.length >= 1 && !quoteCache.has(symbol)) {
            const latestBar = bars[0];
            const prevBar = bars[1];
            quoteCache.set(symbol, {
              bid: latestBar?.c ?? 0,
              ask: latestBar?.c ?? 0,
              last: latestBar?.c ?? 0,
              volume: latestBar?.v ?? 0,
              prevClose: prevBar?.c ?? latestBar?.c ?? 0,
              timestamp: latestBar ? new Date(latestBar.t) : new Date(),
            });
          }
        } catch {
          // Ignore errors - streaming will provide data
        }
      })
    ).catch(() => {});
  }

  if (massiveClient?.isConnected()) {
    // Subscribe to aggregates (AM), trades (T), and quotes (Q) for each symbol
    // Q channel provides extended hours (pre-market/after-hours) bid/ask updates
    const subscriptions = newSymbols.flatMap((s) => [`AM.${s}`, `T.${s}`, `Q.${s}`]);
    await massiveClient.subscribe(subscriptions);
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
    // Unsubscribe from aggregates (AM), trades (T), and quotes (Q)
    await massiveClient.unsubscribe([`AM.${upperSymbol}`, `T.${upperSymbol}`, `Q.${upperSymbol}`]);
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
