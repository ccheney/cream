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
  AlpacaConnectionState,
  type AlpacaWebSocketClient,
  type AlpacaWsBarMessage,
  type AlpacaWsEvent,
  type AlpacaWsQuoteMessage,
  type AlpacaWsTradeMessage,
  createAlpacaOptionsClientFromEnv,
  isAlpacaConfigured,
} from "@cream/marketdata";
import log from "../logger.js";
import { broadcastOptionsQuote } from "../websocket/handler.js";

// ============================================
// State
// ============================================

let alpacaOptionsClient: AlpacaWebSocketClient | null = null;
let isInitialized = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

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
 * Sets up configuration but does NOT connect until first subscription.
 * This avoids idle connections that Alpaca will terminate.
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

  // Mark as initialized but don't connect yet - will connect on first subscription
  isInitialized = true;
  log.info("Options data streaming initialized (will connect on first subscription)");
}

/**
 * Ensure the options WebSocket is connected.
 * Called lazily when first subscription is requested.
 */
async function ensureConnected(): Promise<boolean> {
  if (!isAlpacaConfigured()) {
    return false;
  }

  if (alpacaOptionsClient?.isConnected()) {
    return true;
  }

  // Clean up any existing client
  if (alpacaOptionsClient) {
    alpacaOptionsClient.disconnect();
    alpacaOptionsClient = null;
  }

  try {
    alpacaOptionsClient = createAlpacaOptionsClientFromEnv();
    alpacaOptionsClient.on(handleOptionsEvent);
    await alpacaOptionsClient.connect();
    reconnectAttempts = 0;
    log.info("Options data streaming connected to Alpaca");
    return true;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.warn({ error: errorMsg }, "Failed to connect to Alpaca Options WebSocket");
    alpacaOptionsClient?.disconnect();
    alpacaOptionsClient = null;
    return false;
  }
}

/**
 * Shutdown the options data streaming service.
 */
export function shutdownOptionsDataStreaming(): void {
  log.info({ activeContracts: activeContracts.size }, "Shutting down options data streaming");
  if (alpacaOptionsClient) {
    alpacaOptionsClient.disconnect();
    alpacaOptionsClient = null;
  }
  isInitialized = false;
  activeContracts.clear();
  optionsCache.clear();
  log.info("Options data streaming shutdown complete");
}

// ============================================
// Event Handlers
// ============================================

/**
 * Handle events from Alpaca Options WebSocket.
 */
function handleOptionsEvent(event: AlpacaWsEvent): void {
  switch (event.type) {
    case "connected":
      log.debug("Alpaca Options WebSocket connected");
      break;

    case "authenticated":
      log.info({ activeContracts: activeContracts.size }, "Alpaca Options WebSocket authenticated");
      // Resubscribe to active contracts after reconnection
      if (activeContracts.size > 0) {
        const contracts = Array.from(activeContracts);
        alpacaOptionsClient?.subscribe("quotes", contracts);
        alpacaOptionsClient?.subscribe("trades", contracts);
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

    case "disconnected":
      log.warn({ reason: event.reason }, "Alpaca Options WebSocket disconnected");
      break;

    case "reconnecting":
      reconnectAttempts = event.attempt;
      log.info(
        { attempt: event.attempt, maxAttempts: MAX_RECONNECT_ATTEMPTS },
        "Reconnecting to Alpaca Options WebSocket"
      );
      break;

    case "error":
      // 101 status code error typically means missing Alpaca Options Data subscription
      if (event.message?.includes("101")) {
        if (reconnectAttempts === 0) {
          log.warn(
            { code: event.code, message: event.message },
            "Alpaca Options WebSocket rejected - Alpaca Options Data subscription may be required"
          );
        }
      } else {
        log.error(
          { code: event.code, message: event.message, reconnectAttempts },
          "Alpaca Options WebSocket error"
        );
      }
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        log.warn(
          "Max reconnect attempts reached, options streaming disabled (option chain API still available)"
        );
        isInitialized = false;
      }
      break;
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
 * Lazily connects to WebSocket on first subscription.
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

  // Connect lazily on first subscription
  const connected = await ensureConnected();
  if (connected && alpacaOptionsClient?.isConnected()) {
    // Subscribe to quotes and trades for this contract
    alpacaOptionsClient.subscribe("quotes", [normalizedContract]);
    alpacaOptionsClient.subscribe("trades", [normalizedContract]);
  }
}

/**
 * Subscribe to multiple contracts at once.
 * Lazily connects to WebSocket on first subscription.
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
    return;
  }

  for (const contract of newContracts) {
    activeContracts.add(contract);
  }

  // Connect lazily on first subscription
  const connected = await ensureConnected();
  if (connected && alpacaOptionsClient?.isConnected()) {
    // Subscribe to both quotes and trades
    alpacaOptionsClient.subscribe("quotes", newContracts);
    alpacaOptionsClient.subscribe("trades", newContracts);
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

  if (alpacaOptionsClient?.isConnected()) {
    alpacaOptionsClient.unsubscribe("quotes", [normalizedContract]);
    alpacaOptionsClient.unsubscribe("trades", [normalizedContract]);
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
  return isInitialized && alpacaOptionsClient?.getState() === AlpacaConnectionState.AUTHENTICATED;
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
