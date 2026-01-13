/**
 * Options Data Streaming Service
 *
 * Connects to Alpaca WebSocket for real-time options data
 * and broadcasts updates to connected dashboard clients.
 *
 * Options symbols use OCC format: {underlying}{YYMMDD}{C|P}{strike}
 * Example: AAPL250117C00100000 = AAPL Jan 17, 2025 $100 Call
 *
 * @see docs/plans/ui/06-websocket.md
 * @see docs/plans/31-alpaca-data-consolidation.md
 */

import {
  type AlpacaWsBarMessage,
  type AlpacaWsEvent,
  type AlpacaWsQuoteMessage,
  type AlpacaWsTradeMessage,
  isAlpacaConfigured,
} from "@cream/marketdata";
import log from "../logger.js";
import { broadcastOptionsQuote } from "../websocket/handler.js";
import {
  getSharedOptionsWebSocket,
  isOptionsWebSocketConnected,
  onOptionsEvent,
  offOptionsEvent,
} from "./shared-options-ws.js";

// ============================================
// State
// ============================================

let isInitialized = false;

/**
 * Active options contract subscriptions from dashboard clients.
 * Format: AAPL250117C00100000
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
 * Format: {underlying}{YYMMDD}{C|P}{strike}
 * Example: AAPL250117C00100000 -> AAPL
 */
function extractUnderlying(contract: string): string {
  // Remove O: prefix if present (legacy format)
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
 * Registers event handler with the shared WebSocket connection.
 */
export async function initOptionsDataStreaming(): Promise<void> {
  if (isInitialized) {
    return;
  }

  // Check if Alpaca credentials are available
  if (!isAlpacaConfigured()) {
    log.warn("ALPACA_KEY/ALPACA_SECRET not set, options data streaming disabled");
    return;
  }

  // Register our event handler with the shared connection
  onOptionsEvent(handleOptionsEvent);
  isInitialized = true;
  log.info("Options data streaming initialized (using shared WebSocket)");
}

/**
 * Ensure the shared options WebSocket is connected.
 */
async function ensureConnected(): Promise<boolean> {
  const client = await getSharedOptionsWebSocket();
  return client !== null && client.isConnected();
}

/**
 * Shutdown the options data streaming service.
 */
export function shutdownOptionsDataStreaming(): void {
  log.info({ activeContracts: activeContracts.size }, "Shutting down options data streaming");
  offOptionsEvent(handleOptionsEvent);
  isInitialized = false;
  activeContracts.clear();
  optionsCache.clear();
  log.info("Options data streaming shutdown complete");
}

// ============================================
// Event Handlers
// ============================================

/**
 * Handle events from shared Alpaca Options WebSocket.
 */
function handleOptionsEvent(event: AlpacaWsEvent): void {
  switch (event.type) {
    case "authenticated":
      // Resubscribe to active contracts after reconnection
      if (activeContracts.size > 0) {
        resubscribeActiveContracts();
      }
      break;

    case "subscribed":
      log.debug({ subscriptions: event.subscriptions }, "Subscribed to options symbols");
      break;

    case "bar":
      handleOptionsBarMessage(event.message);
      break;

    case "quote":
      handleOptionsQuoteMessage(event.message);
      break;

    case "trade":
      handleOptionsTradeMessage(event.message);
      break;

    // Other events (connected, disconnected, error) are logged by shared-options-ws.ts
  }
}

/**
 * Resubscribe to all active contracts after reconnection.
 */
async function resubscribeActiveContracts(): Promise<void> {
  const client = await getSharedOptionsWebSocket();
  if (!client?.isConnected()) {
    return;
  }

  const contracts = Array.from(activeContracts);
  if (contracts.length > 0) {
    log.info({ count: contracts.length }, "Resubscribing to options contracts");
    client.subscribe("quotes", contracts);
    client.subscribe("trades", contracts);
  }
}

/**
 * Handle options bar messages.
 */
function handleOptionsBarMessage(msg: AlpacaWsBarMessage): void {
  const contract = msg.S; // OCC format
  const underlying = extractUnderlying(contract);

  // Update cache
  const cached = optionsCache.get(contract);

  optionsCache.set(contract, {
    underlying,
    bid: cached?.bid ?? 0,
    ask: cached?.ask ?? 0,
    last: msg.c,
    volume: msg.v,
    timestamp: new Date(msg.t),
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
      timestamp: new Date(msg.t).toISOString(),
    },
  });
}

/**
 * Handle options quote messages with bid/ask updates.
 */
function handleOptionsQuoteMessage(msg: AlpacaWsQuoteMessage): void {
  const contract = msg.S;
  const underlying = extractUnderlying(contract);

  // Debug: Log first few quotes to verify data flow
  console.log(`[Options Data] Quote received: ${contract} bid=${msg.bp} ask=${msg.ap}`);

  // Get cached data
  const cached = optionsCache.get(contract);

  // Update cache with new bid/ask
  optionsCache.set(contract, {
    underlying,
    bid: msg.bp,
    ask: msg.ap,
    last: cached?.last ?? (msg.bp + msg.ap) / 2,
    volume: cached?.volume ?? 0,
    timestamp: new Date(msg.t), // RFC-3339 timestamp
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
      timestamp: new Date(msg.t).toISOString(),
    },
  });
}

/**
 * Handle options trade messages.
 */
function handleOptionsTradeMessage(msg: AlpacaWsTradeMessage): void {
  const contract = msg.S;
  const underlying = extractUnderlying(contract);

  // Update cache with last trade price
  const cached = optionsCache.get(contract);
  optionsCache.set(contract, {
    underlying,
    bid: cached?.bid ?? msg.p,
    ask: cached?.ask ?? msg.p,
    last: msg.p,
    volume: (cached?.volume ?? 0) + msg.s,
    timestamp: new Date(msg.t),
  });

  // Broadcast to subscribed clients for this contract
  broadcastOptionsQuote(contract, {
    type: "options_trade",
    data: {
      contract,
      underlying,
      price: msg.p,
      size: msg.s,
      timestamp: new Date(msg.t).toISOString(),
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
 * @param contract OCC format contract symbol (e.g., AAPL250117C00100000)
 */
export async function subscribeContract(contract: string): Promise<void> {
  // Normalize: remove O: prefix if present, convert to uppercase
  let normalizedContract = contract.toUpperCase();
  if (normalizedContract.startsWith("O:")) {
    normalizedContract = normalizedContract.slice(2);
  }

  if (activeContracts.has(normalizedContract)) {
    return; // Already subscribed
  }

  activeContracts.add(normalizedContract);

  const client = await getSharedOptionsWebSocket();
  if (client?.isConnected()) {
    client.subscribe("quotes", [normalizedContract]);
    client.subscribe("trades", [normalizedContract]);
  }
}

/**
 * Subscribe to multiple contracts at once.
 */
export async function subscribeContracts(contracts: string[]): Promise<void> {
  const newContracts = contracts
    .map((c) => {
      let normalized = c.toUpperCase();
      if (normalized.startsWith("O:")) {
        normalized = normalized.slice(2);
      }
      return normalized;
    })
    .filter((c) => !activeContracts.has(c));

  if (newContracts.length === 0) {
    console.log("[Options Data] No new contracts to subscribe (all already subscribed)");
    return;
  }

  for (const contract of newContracts) {
    activeContracts.add(contract);
  }

  const client = await getSharedOptionsWebSocket();
  if (client?.isConnected()) {
    console.log(`[Options Data] Subscribing ${newContracts.length} contracts to Alpaca OPRA:`, newContracts.slice(0, 3).join(", "), newContracts.length > 3 ? "..." : "");
    client.subscribe("quotes", newContracts);
    client.subscribe("trades", newContracts);
  } else {
    console.log("[Options Data] Cannot subscribe - Alpaca OPRA WebSocket not connected");
  }
}

/**
 * Unsubscribe from options data for a contract.
 */
export async function unsubscribeContract(contract: string): Promise<void> {
  let normalizedContract = contract.toUpperCase();
  if (normalizedContract.startsWith("O:")) {
    normalizedContract = normalizedContract.slice(2);
  }

  if (!activeContracts.has(normalizedContract)) {
    return; // Not subscribed
  }

  activeContracts.delete(normalizedContract);
  optionsCache.delete(normalizedContract);

  const client = await getSharedOptionsWebSocket();
  if (client?.isConnected()) {
    client.unsubscribe("quotes", [normalizedContract]);
    client.unsubscribe("trades", [normalizedContract]);
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
  let normalizedContract = contract.toUpperCase();
  if (normalizedContract.startsWith("O:")) {
    normalizedContract = normalizedContract.slice(2);
  }
  return optionsCache.get(normalizedContract) ?? null;
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
  return isInitialized && isOptionsWebSocketConnected();
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
