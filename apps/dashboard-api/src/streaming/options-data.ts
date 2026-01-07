/**
 * Options Data Streaming Service
 *
 * Connects to Massive WebSocket for real-time options data
 * and broadcasts updates to connected dashboard clients.
 *
 * Options symbols use OCC format: O:{underlying}{YYMMDD}{C|P}{strike}
 * Example: O:AAPL250117C00100000 = AAPL Jan 17, 2025 $100 Call
 *
 * @see docs/plans/ui/06-websocket.md
 */

import {
  createMassiveOptionsClientFromEnv,
  type MassiveAggregateMessage,
  MassiveConnectionState,
  type MassiveEvent,
  type MassiveQuoteMessage,
  type MassiveTradeMessage,
  type MassiveWebSocketClient,
} from "@cream/marketdata";
import { broadcastOptionsQuote } from "../websocket/handler.js";

// ============================================
// State
// ============================================

let massiveOptionsClient: MassiveWebSocketClient | null = null;
let isInitialized = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

/**
 * Active options contract subscriptions from dashboard clients.
 * Format: O:AAPL250117C00100000
 */
const activeContracts = new Set<string>();

/**
 * Options quote cache - stores latest quote data per contract.
 */
const optionsCache = new Map<
  string,
  {
    underlying: string;
    bid: number;
    ask: number;
    last: number;
    volume: number;
    openInterest?: number;
    impliedVol?: number;
    delta?: number;
    gamma?: number;
    theta?: number;
    vega?: number;
    timestamp: Date;
  }
>();

/**
 * Extract underlying symbol from OCC options symbol.
 * Format: O:{underlying}{YYMMDD}{C|P}{strike}
 * Example: O:AAPL250117C00100000 -> AAPL
 */
function extractUnderlying(contract: string): string {
  // Remove O: prefix if present
  const symbol = contract.startsWith("O:") ? contract.slice(2) : contract;
  // Find first digit (start of date portion) and extract underlying
  const dateStart = symbol.search(/\d/);
  if (dateStart > 0) {
    return symbol.slice(0, dateStart);
  }
  return symbol;
}

// ============================================
// Initialization
// ============================================

/**
 * Initialize the options data streaming service.
 * Connects to Massive Options WebSocket and sets up event handlers.
 */
export async function initOptionsDataStreaming(): Promise<void> {
  if (isInitialized) {
    return;
  }

  // Check if POLYGON_KEY is available
  const apiKey = process.env.POLYGON_KEY ?? Bun.env.POLYGON_KEY;
  if (!apiKey) {
    return;
  }

  try {
    massiveOptionsClient = createMassiveOptionsClientFromEnv("delayed");

    // Set up event handlers
    massiveOptionsClient.on(handleOptionsEvent);

    // Connect
    await massiveOptionsClient.connect();
    isInitialized = true;
    reconnectAttempts = 0;
  } catch (_error) {
    // Don't throw - allow server to start without streaming
  }
}

/**
 * Shutdown the options data streaming service.
 */
export function shutdownOptionsDataStreaming(): void {
  if (massiveOptionsClient) {
    massiveOptionsClient.disconnect();
    massiveOptionsClient = null;
  }
  isInitialized = false;
  activeContracts.clear();
  optionsCache.clear();
}

// ============================================
// Event Handlers
// ============================================

/**
 * Handle events from Massive Options WebSocket.
 */
function handleOptionsEvent(event: MassiveEvent): void {
  switch (event.type) {
    case "connected":
      break;

    case "authenticated":
      // Resubscribe to active contracts after reconnection
      if (activeContracts.size > 0) {
        const subscriptions = Array.from(activeContracts).map((c) => `Q.${c}`);
        massiveOptionsClient?.subscribe(subscriptions).catch(() => {
          // Silently handle subscription failures
        });
      }
      break;

    case "subscribed":
      break;

    case "aggregate":
      handleOptionsAggregateMessage(event.message);
      break;

    case "quote":
      handleOptionsQuoteMessage(event.message);
      break;

    case "trade":
      handleOptionsTradeMessage(event.message);
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
 * Handle options aggregate messages.
 */
function handleOptionsAggregateMessage(msg: MassiveAggregateMessage): void {
  const contract = msg.sym; // OCC format
  const underlying = extractUnderlying(contract);

  // Update cache
  const cached = optionsCache.get(contract);

  optionsCache.set(contract, {
    underlying,
    bid: cached?.bid ?? 0,
    ask: cached?.ask ?? 0,
    last: msg.c,
    volume: msg.v,
    timestamp: new Date(msg.e),
  });

  // Broadcast to subscribed clients for this contract
  broadcastOptionsQuote(contract, {
    type: "options_aggregate",
    data: {
      contract,
      underlying,
      open: msg.o,
      high: msg.h,
      low: msg.l,
      close: msg.c,
      volume: msg.v,
      timestamp: new Date(msg.e).toISOString(),
    },
  });
}

/**
 * Handle options quote messages with bid/ask updates.
 */
function handleOptionsQuoteMessage(msg: MassiveQuoteMessage): void {
  const contract = msg.sym;
  const underlying = extractUnderlying(contract);

  // Get cached data
  const cached = optionsCache.get(contract);

  // Update cache with new bid/ask
  optionsCache.set(contract, {
    underlying,
    bid: msg.bp,
    ask: msg.ap,
    last: cached?.last ?? (msg.bp + msg.ap) / 2,
    volume: cached?.volume ?? 0,
    timestamp: new Date(msg.t / 1e6), // Nanoseconds to milliseconds
  });

  // Broadcast to subscribed clients for this contract
  broadcastOptionsQuote(contract, {
    type: "options_quote",
    data: {
      contract,
      underlying,
      bid: msg.bp,
      ask: msg.ap,
      bidSize: msg.bs,
      askSize: msg.as,
      last: cached?.last ?? (msg.bp + msg.ap) / 2,
      timestamp: new Date(msg.t / 1e6).toISOString(),
    },
  });
}

/**
 * Handle options trade messages.
 */
function handleOptionsTradeMessage(msg: MassiveTradeMessage): void {
  const contract = msg.sym;
  const underlying = extractUnderlying(contract);

  // Update cache with last trade price
  const cached = optionsCache.get(contract);
  optionsCache.set(contract, {
    underlying,
    bid: cached?.bid ?? msg.p,
    ask: cached?.ask ?? msg.p,
    last: msg.p,
    volume: (cached?.volume ?? 0) + msg.s,
    timestamp: new Date(msg.t / 1e6),
  });

  // Broadcast to subscribed clients for this contract
  broadcastOptionsQuote(contract, {
    type: "options_trade",
    data: {
      contract,
      underlying,
      price: msg.p,
      size: msg.s,
      timestamp: new Date(msg.t / 1e6).toISOString(),
    },
  });
}

// ============================================
// Contract Management
// ============================================

/**
 * Subscribe to options data for a contract.
 * Called when a dashboard client subscribes to an options contract.
 *
 * @param contract OCC format contract symbol (e.g., O:AAPL250117C00100000)
 */
export async function subscribeContract(contract: string): Promise<void> {
  const upperContract = contract.toUpperCase();

  if (activeContracts.has(upperContract)) {
    return; // Already subscribed
  }

  activeContracts.add(upperContract);

  if (massiveOptionsClient?.isConnected()) {
    // Subscribe to quotes and trades for this contract
    await massiveOptionsClient.subscribe([`Q.${upperContract}`, `T.${upperContract}`]);
  }
}

/**
 * Subscribe to multiple contracts at once.
 */
export async function subscribeContracts(contracts: string[]): Promise<void> {
  const newContracts = contracts.map((c) => c.toUpperCase()).filter((c) => !activeContracts.has(c));

  if (newContracts.length === 0) {
    return;
  }

  for (const contract of newContracts) {
    activeContracts.add(contract);
  }

  if (massiveOptionsClient?.isConnected()) {
    // Subscribe to both quotes and trades
    const subscriptions = newContracts.flatMap((c) => [`Q.${c}`, `T.${c}`]);
    await massiveOptionsClient.subscribe(subscriptions);
  }
}

/**
 * Unsubscribe from options data for a contract.
 */
export async function unsubscribeContract(contract: string): Promise<void> {
  const upperContract = contract.toUpperCase();

  if (!activeContracts.has(upperContract)) {
    return; // Not subscribed
  }

  activeContracts.delete(upperContract);
  optionsCache.delete(upperContract);

  if (massiveOptionsClient?.isConnected()) {
    await massiveOptionsClient.unsubscribe([`Q.${upperContract}`, `T.${upperContract}`]);
  }
}

/**
 * Get the cached options data for a contract.
 */
export function getCachedOptionsQuote(contract: string): {
  underlying: string;
  bid: number;
  ask: number;
  last: number;
  volume: number;
  openInterest?: number;
  impliedVol?: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  timestamp: Date;
} | null {
  return optionsCache.get(contract.toUpperCase()) ?? null;
}

/**
 * Get all actively subscribed contracts.
 */
export function getActiveContracts(): string[] {
  return Array.from(activeContracts);
}

/**
 * Check if options streaming is initialized and connected.
 */
export function isOptionsStreamingConnected(): boolean {
  return isInitialized && massiveOptionsClient?.getState() === MassiveConnectionState.AUTHENTICATED;
}

// ============================================
// Default Export
// ============================================

export default {
  initOptionsDataStreaming,
  shutdownOptionsDataStreaming,
  subscribeContract,
  subscribeContracts,
  unsubscribeContract,
  getCachedOptionsQuote,
  getActiveContracts,
  isOptionsStreamingConnected,
};
