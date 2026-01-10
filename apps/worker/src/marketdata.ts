/**
 * Market Data Subscription
 *
 * Subscribes to real-time market data from the execution engine's gRPC service.
 * This triggers the Rust side to start the Databento feed with the configured symbols.
 */

import { createMarketDataClient, type MarketDataServiceClient, type Quote } from "@cream/domain/grpc";

// ============================================
// Configuration
// ============================================

const GRPC_BASE_URL = process.env.EXECUTION_ENGINE_GRPC_URL ?? "http://localhost:50051";

// ============================================
// Client Singleton
// ============================================

let marketDataClient: MarketDataServiceClient | null = null;

/**
 * Get or create the market data gRPC client
 */
function getMarketDataClient(): MarketDataServiceClient {
  if (!marketDataClient) {
    marketDataClient = createMarketDataClient(GRPC_BASE_URL, {
      enableLogging: process.env.GRPC_LOGGING === "true",
    });
  }
  return marketDataClient;
}

// ============================================
// Subscription State
// ============================================

interface SubscriptionState {
  active: boolean;
  symbols: string[];
  abortController: AbortController | null;
  lastUpdate: Date | null;
  updateCount: number;
}

const subscriptionState: SubscriptionState = {
  active: false,
  symbols: [],
  abortController: null,
  lastUpdate: null,
  updateCount: 0,
};

// ============================================
// Subscription Functions
// ============================================

/**
 * Start market data subscription for the given symbols.
 *
 * This initiates a streaming gRPC call to the execution engine, which triggers
 * the Rust side to start the Databento feed with these symbols.
 *
 * @param symbols - Symbols to subscribe to (from runtime config)
 * @param onUpdate - Optional callback for quote updates
 */
export async function startMarketDataSubscription(
  symbols: string[],
  onUpdate?: (quote: Quote) => void
): Promise<void> {
  if (subscriptionState.active) {
    // biome-ignore lint/suspicious/noConsole: Intentional logging
    console.log("[MarketData] Subscription already active, updating symbols...");
    await stopMarketDataSubscription();
  }

  if (symbols.length === 0) {
    // biome-ignore lint/suspicious/noConsole: Intentional logging
    console.warn("[MarketData] No symbols provided, skipping subscription");
    return;
  }

  subscriptionState.active = true;
  subscriptionState.symbols = symbols;
  subscriptionState.abortController = new AbortController();
  subscriptionState.updateCount = 0;

  // biome-ignore lint/suspicious/noConsole: Intentional logging
  console.log(`[MarketData] Starting subscription for ${symbols.length} symbols: ${symbols.join(", ")}`);

  const client = getMarketDataClient();

  // Start the subscription in a background task
  // The connection stays open and streams market data updates
  runSubscriptionLoop(client, symbols, onUpdate).catch((error) => {
    // biome-ignore lint/suspicious/noConsole: Error logging
    console.error("[MarketData] Subscription error:", error);
    subscriptionState.active = false;
  });
}

/**
 * Run the subscription loop, receiving market data updates
 */
async function runSubscriptionLoop(
  client: MarketDataServiceClient,
  symbols: string[],
  onUpdate?: (quote: Quote) => void
): Promise<void> {
  try {
    for await (const result of client.subscribeMarketData({ symbols })) {
      subscriptionState.lastUpdate = new Date();
      subscriptionState.updateCount++;

      // Extract quote from the update
      const response = result.data;
      if (response.update?.case === "quote" && onUpdate) {
        onUpdate(response.update.value);
      }

      // Log periodic updates (every 100 updates)
      if (subscriptionState.updateCount % 100 === 0) {
        // biome-ignore lint/suspicious/noConsole: Intentional logging
        console.log(`[MarketData] Received ${subscriptionState.updateCount} updates`);
      }

      // Check if we should stop
      if (!subscriptionState.active) {
        break;
      }
    }
  } catch (error) {
    if (!subscriptionState.active) {
      // Expected - subscription was stopped
      return;
    }
    throw error;
  }
}

/**
 * Stop the market data subscription
 */
export async function stopMarketDataSubscription(): Promise<void> {
  if (!subscriptionState.active) {
    return;
  }

  // biome-ignore lint/suspicious/noConsole: Intentional logging
  console.log("[MarketData] Stopping subscription...");

  subscriptionState.active = false;

  if (subscriptionState.abortController) {
    subscriptionState.abortController.abort();
    subscriptionState.abortController = null;
  }

  // Give the loop time to exit cleanly
  await new Promise((resolve) => setTimeout(resolve, 100));

  // biome-ignore lint/suspicious/noConsole: Intentional logging
  console.log(
    `[MarketData] Subscription stopped (received ${subscriptionState.updateCount} updates)`
  );
}

/**
 * Get current subscription status
 */
export function getSubscriptionStatus(): {
  active: boolean;
  symbols: string[];
  lastUpdate: Date | null;
  updateCount: number;
} {
  return {
    active: subscriptionState.active,
    symbols: subscriptionState.symbols,
    lastUpdate: subscriptionState.lastUpdate,
    updateCount: subscriptionState.updateCount,
  };
}
