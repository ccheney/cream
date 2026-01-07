/**
 * Options Subscription Manager
 *
 * Manages WebSocket subscription limits for Massive options API.
 * Handles connection pooling (1000 contracts per connection) with
 * priority-based subscription management.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 6
 */

import {
  createMassiveOptionsClientFromEnv,
  type MassiveEvent,
  type MassiveQuoteMessage,
  type MassiveTradeMessage,
  type MassiveWebSocketClient,
} from "@cream/marketdata";
import { broadcastOptionsQuote } from "../websocket/handler.js";

// ============================================
// Constants
// ============================================

/** Maximum contracts per Massive WebSocket connection */
const MAX_CONTRACTS_PER_CONNECTION = 1000;

/** Threshold to spawn new connection (90% of limit) */
const CONNECTION_SPAWN_THRESHOLD = 900;

/** Maximum number of connection pools */
const MAX_CONNECTION_POOLS = 5;

/** Debounce delay for unsubscribe (ms) */
const UNSUBSCRIBE_DEBOUNCE_MS = 1000;

/** Cache TTL for options quotes (ms) */
const CACHE_TTL_MS = 30_000;

/** Significant price move threshold for cache invalidation */
const SIGNIFICANT_MOVE_THRESHOLD = 0.01; // 1%

// ============================================
// Types
// ============================================

/**
 * Subscription priority levels.
 * Higher priority subscriptions are maintained when at capacity.
 */
export enum SubscriptionPriority {
  /** Current positions - must always be subscribed */
  CRITICAL = 0,
  /** Active watchlist contracts */
  HIGH = 1,
  /** Visible options chain contracts */
  MEDIUM = 2,
  /** Browsing/exploratory subscriptions */
  LOW = 3,
}

interface SubscriptionEntry {
  contract: string;
  priority: SubscriptionPriority;
  subscribers: Set<string>; // Connection IDs that want this contract
  connectionPoolIndex: number | null; // Which pool is handling this
  lastRequestedAt: Date;
}

interface CachedQuote {
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
  cachedAt: Date;
}

interface ConnectionPool {
  client: MassiveWebSocketClient;
  contracts: Set<string>;
  isConnected: boolean;
  reconnectAttempts: number;
}

interface PendingUnsubscribe {
  contract: string;
  timeoutId: Timer;
}

// ============================================
// State
// ============================================

/** Connection pools for options WebSocket */
const connectionPools: ConnectionPool[] = [];

/** All subscription entries indexed by contract */
const subscriptions = new Map<string, SubscriptionEntry>();

/** Priority queue for pending subscriptions */
const pendingQueue: SubscriptionEntry[] = [];

/** Quote cache with TTL */
const quoteCache = new Map<string, CachedQuote>();

/** Pending unsubscribe operations (debounced) */
const pendingUnsubscribes = new Map<string, PendingUnsubscribe>();

/** Manager state */
let isInitialized = false;

// ============================================
// Initialization
// ============================================

/**
 * Initialize the subscription manager.
 * Creates the first connection pool.
 */
export async function initSubscriptionManager(): Promise<void> {
  if (isInitialized) {
    return;
  }

  const apiKey = process.env.POLYGON_KEY ?? Bun.env.POLYGON_KEY;
  if (!apiKey) {
    return;
  }

  try {
    const pool = await createConnectionPool(0);
    connectionPools.push(pool);
    isInitialized = true;
  } catch (_error) {}
}

/**
 * Shutdown the subscription manager.
 */
export function shutdownSubscriptionManager(): void {
  // Clear pending unsubscribes
  for (const pending of pendingUnsubscribes.values()) {
    clearTimeout(pending.timeoutId);
  }
  pendingUnsubscribes.clear();

  // Disconnect all pools
  for (const pool of connectionPools) {
    pool.client.disconnect();
  }
  connectionPools.length = 0;

  // Clear state
  subscriptions.clear();
  pendingQueue.length = 0;
  quoteCache.clear();
  isInitialized = false;
}

// ============================================
// Connection Pool Management
// ============================================

/**
 * Create a new connection pool.
 */
async function createConnectionPool(index: number): Promise<ConnectionPool> {
  const client = createMassiveOptionsClientFromEnv("delayed");
  const pool: ConnectionPool = {
    client,
    contracts: new Set(),
    isConnected: false,
    reconnectAttempts: 0,
  };

  // Set up event handlers
  client.on((event: MassiveEvent) => handlePoolEvent(index, event));

  await client.connect();
  return pool;
}

/**
 * Handle events from a connection pool.
 */
function handlePoolEvent(poolIndex: number, event: MassiveEvent): void {
  const pool = connectionPools[poolIndex];
  if (!pool) {
    return;
  }

  switch (event.type) {
    case "connected":
      break;

    case "authenticated":
      pool.isConnected = true;
      pool.reconnectAttempts = 0;
      // Resubscribe to contracts
      if (pool.contracts.size > 0) {
        const subs = Array.from(pool.contracts).flatMap((c) => [`Q.${c}`, `T.${c}`]);
        pool.client.subscribe(subs).catch(() => {});
      }
      // Process pending queue
      processPendingQueue();
      break;

    case "quote":
      handleQuoteMessage(event.message);
      break;

    case "trade":
      handleTradeMessage(event.message);
      break;

    case "disconnected":
      pool.isConnected = false;
      break;

    case "reconnecting":
      pool.reconnectAttempts = event.attempt;
      break;

    case "error":
      break;
  }
}

/**
 * Find or create a connection pool with capacity.
 */
async function getAvailablePool(): Promise<ConnectionPool | null> {
  // Find pool with capacity
  for (const pool of connectionPools) {
    if (pool.isConnected && pool.contracts.size < MAX_CONTRACTS_PER_CONNECTION) {
      return pool;
    }
  }

  // Check if we should spawn a new pool
  const lastPool = connectionPools[connectionPools.length - 1];
  if (
    lastPool &&
    lastPool.contracts.size >= CONNECTION_SPAWN_THRESHOLD &&
    connectionPools.length < MAX_CONNECTION_POOLS
  ) {
    try {
      const newPool = await createConnectionPool(connectionPools.length);
      connectionPools.push(newPool);
      return newPool;
    } catch (_error) {}
  }

  // Return first connected pool or null
  return connectionPools.find((p) => p.isConnected) ?? null;
}

/**
 * Get the pool index for a connection pool.
 */
function getPoolIndex(pool: ConnectionPool): number {
  return connectionPools.indexOf(pool);
}

// ============================================
// Subscription Management
// ============================================

/**
 * Request a subscription to a contract.
 *
 * @param contract OCC format contract (e.g., O:AAPL250117C00100000)
 * @param priority Subscription priority
 * @param subscriberId Connection ID of the subscriber
 */
export async function requestSubscription(
  contract: string,
  priority: SubscriptionPriority,
  subscriberId: string
): Promise<void> {
  const upperContract = contract.toUpperCase();

  // Cancel any pending unsubscribe
  const pending = pendingUnsubscribes.get(upperContract);
  if (pending) {
    clearTimeout(pending.timeoutId);
    pendingUnsubscribes.delete(upperContract);
  }

  // Check existing subscription
  let entry = subscriptions.get(upperContract);
  if (entry) {
    entry.subscribers.add(subscriberId);
    // Upgrade priority if needed
    if (priority < entry.priority) {
      entry.priority = priority;
    }
    entry.lastRequestedAt = new Date();

    // If already subscribed to Massive, we're done
    if (entry.connectionPoolIndex !== null) {
      // Send cached quote immediately if available
      const cached = getValidCachedQuote(upperContract);
      if (cached) {
        broadcastOptionsQuote(upperContract, {
          type: "options_quote",
          data: {
            contract: upperContract,
            underlying: cached.underlying,
            bid: cached.bid,
            ask: cached.ask,
            last: cached.last,
            timestamp: cached.timestamp.toISOString(),
          },
        });
      }
      return;
    }
  } else {
    // Create new entry
    entry = {
      contract: upperContract,
      priority,
      subscribers: new Set([subscriberId]),
      connectionPoolIndex: null,
      lastRequestedAt: new Date(),
    };
    subscriptions.set(upperContract, entry);
  }

  // Try to subscribe immediately
  const pool = await getAvailablePool();
  if (pool && pool.contracts.size < MAX_CONTRACTS_PER_CONNECTION) {
    await subscribeToPool(pool, entry);
  } else {
    // Add to pending queue
    addToPendingQueue(entry);
  }
}

/**
 * Release a subscription from a subscriber.
 * Uses debouncing to prevent thrashing.
 */
export function releaseSubscription(contract: string, subscriberId: string): void {
  const upperContract = contract.toUpperCase();
  const entry = subscriptions.get(upperContract);
  if (!entry) {
    return;
  }

  entry.subscribers.delete(subscriberId);

  // If no more subscribers, schedule unsubscribe
  if (entry.subscribers.size === 0) {
    // Don't unsubscribe critical priority contracts
    if (entry.priority === SubscriptionPriority.CRITICAL) {
      return;
    }

    // Debounce unsubscribe
    const existing = pendingUnsubscribes.get(upperContract);
    if (existing) {
      clearTimeout(existing.timeoutId);
    }

    const timeoutId = setTimeout(() => {
      unsubscribeContract(upperContract);
      pendingUnsubscribes.delete(upperContract);
    }, UNSUBSCRIBE_DEBOUNCE_MS);

    pendingUnsubscribes.set(upperContract, { contract: upperContract, timeoutId });
  }
}

/**
 * Subscribe multiple contracts with a given priority.
 */
export async function requestBatchSubscription(
  contracts: string[],
  priority: SubscriptionPriority,
  subscriberId: string
): Promise<void> {
  for (const contract of contracts) {
    await requestSubscription(contract, priority, subscriberId);
  }
}

/**
 * Release multiple subscriptions.
 */
export function releaseBatchSubscription(contracts: string[], subscriberId: string): void {
  for (const contract of contracts) {
    releaseSubscription(contract, subscriberId);
  }
}

/**
 * Set contracts as critical (position-based).
 * These contracts will never be automatically unsubscribed.
 */
export async function setCriticalContracts(
  contracts: string[],
  subscriberId: string
): Promise<void> {
  for (const contract of contracts) {
    await requestSubscription(contract, SubscriptionPriority.CRITICAL, subscriberId);
  }
}

// ============================================
// Internal Subscription Operations
// ============================================

/**
 * Subscribe a contract to a specific pool.
 */
async function subscribeToPool(pool: ConnectionPool, entry: SubscriptionEntry): Promise<void> {
  const poolIndex = getPoolIndex(pool);
  pool.contracts.add(entry.contract);
  entry.connectionPoolIndex = poolIndex;

  if (pool.client.isConnected()) {
    await pool.client.subscribe([`Q.${entry.contract}`, `T.${entry.contract}`]);
  }
}

/**
 * Unsubscribe a contract from its pool.
 */
async function unsubscribeContract(contract: string): Promise<void> {
  const entry = subscriptions.get(contract);
  if (!entry) {
    return;
  }

  // Don't unsubscribe if there are still subscribers
  if (entry.subscribers.size > 0) {
    return;
  }

  const poolIndex = entry.connectionPoolIndex;
  if (poolIndex !== null && poolIndex < connectionPools.length) {
    const pool = connectionPools[poolIndex];
    if (pool) {
      pool.contracts.delete(contract);

      if (pool.client.isConnected()) {
        await pool.client.unsubscribe([`Q.${contract}`, `T.${contract}`]);
      }
    }
  }

  subscriptions.delete(contract);

  // Process pending queue to fill the slot
  processPendingQueue();
}

/**
 * Add entry to pending queue sorted by priority.
 */
function addToPendingQueue(entry: SubscriptionEntry): void {
  // Check if already in queue
  const existingIndex = pendingQueue.findIndex((e) => e.contract === entry.contract);
  if (existingIndex !== -1) {
    pendingQueue.splice(existingIndex, 1);
  }

  // Insert sorted by priority (lower = higher priority)
  const insertIndex = pendingQueue.findIndex((e) => e.priority > entry.priority);
  if (insertIndex === -1) {
    pendingQueue.push(entry);
  } else {
    pendingQueue.splice(insertIndex, 0, entry);
  }
}

/**
 * Process pending queue when capacity becomes available.
 */
async function processPendingQueue(): Promise<void> {
  while (pendingQueue.length > 0) {
    const pool = await getAvailablePool();
    if (!pool || pool.contracts.size >= MAX_CONTRACTS_PER_CONNECTION) {
      break;
    }

    const entry = pendingQueue.shift();
    if (entry && entry.subscribers.size > 0) {
      await subscribeToPool(pool, entry);
    }
  }
}

/**
 * Evict lowest priority subscriptions to make room.
 * Returns number of subscriptions evicted.
 */
export function evictLowestPriority(count: number): number {
  // Collect all subscriptions sorted by priority (highest priority number = lowest importance)
  const sortedEntries = Array.from(subscriptions.values())
    .filter((e) => e.connectionPoolIndex !== null && e.priority > SubscriptionPriority.CRITICAL)
    .sort((a, b) => {
      // Sort by priority descending (low priority first), then by last requested (oldest first)
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return a.lastRequestedAt.getTime() - b.lastRequestedAt.getTime();
    });

  let evicted = 0;
  for (const entry of sortedEntries) {
    if (evicted >= count) {
      break;
    }
    // Move to pending queue
    entry.connectionPoolIndex = null;
    addToPendingQueue(entry);
    evicted++;
  }

  return evicted;
}

// ============================================
// Quote Handling
// ============================================

/**
 * Handle quote message from Massive.
 */
function handleQuoteMessage(msg: MassiveQuoteMessage): void {
  const contract = msg.sym;
  const underlying = extractUnderlying(contract);

  // Update cache
  const cached = quoteCache.get(contract);
  const newQuote: CachedQuote = {
    underlying,
    bid: msg.bp,
    ask: msg.ap,
    last: cached?.last ?? (msg.bp + msg.ap) / 2,
    volume: cached?.volume ?? 0,
    timestamp: new Date(msg.t / 1e6),
    cachedAt: new Date(),
  };

  // Check for significant move (invalidate stale cache)
  if (cached) {
    const midOld = (cached.bid + cached.ask) / 2;
    const midNew = (msg.bp + msg.ap) / 2;
    if (midOld > 0 && Math.abs(midNew - midOld) / midOld > SIGNIFICANT_MOVE_THRESHOLD) {
      // Significant move - update timestamp to extend TTL
      newQuote.cachedAt = new Date();
    }
  }

  quoteCache.set(contract, newQuote);

  // Broadcast to subscribers
  broadcastOptionsQuote(contract, {
    type: "options_quote",
    data: {
      contract,
      underlying,
      bid: msg.bp,
      ask: msg.ap,
      bidSize: msg.bs,
      askSize: msg.as,
      last: newQuote.last,
      timestamp: newQuote.timestamp.toISOString(),
    },
  });
}

/**
 * Handle trade message from Massive.
 */
function handleTradeMessage(msg: MassiveTradeMessage): void {
  const contract = msg.sym;
  const underlying = extractUnderlying(contract);

  // Update cache
  const cached = quoteCache.get(contract);
  quoteCache.set(contract, {
    underlying,
    bid: cached?.bid ?? msg.p,
    ask: cached?.ask ?? msg.p,
    last: msg.p,
    volume: (cached?.volume ?? 0) + msg.s,
    timestamp: new Date(msg.t / 1e6),
    cachedAt: new Date(),
  });

  // Broadcast trade
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

/**
 * Extract underlying symbol from OCC contract.
 */
function extractUnderlying(contract: string): string {
  const symbol = contract.startsWith("O:") ? contract.slice(2) : contract;
  const dateStart = symbol.search(/\d/);
  return dateStart > 0 ? symbol.slice(0, dateStart) : symbol;
}

// ============================================
// Cache Management
// ============================================

/**
 * Get cached quote if still valid.
 */
function getValidCachedQuote(contract: string): CachedQuote | null {
  const cached = quoteCache.get(contract);
  if (!cached) {
    return null;
  }

  const age = Date.now() - cached.cachedAt.getTime();
  if (age > CACHE_TTL_MS) {
    quoteCache.delete(contract);
    return null;
  }

  return cached;
}

/**
 * Get cached quote for a contract.
 */
export function getCachedQuote(contract: string): CachedQuote | null {
  return getValidCachedQuote(contract.toUpperCase());
}

/**
 * Clean expired cache entries.
 */
export function cleanExpiredCache(): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [contract, cached] of quoteCache) {
    if (now - cached.cachedAt.getTime() > CACHE_TTL_MS) {
      quoteCache.delete(contract);
      cleaned++;
    }
  }

  return cleaned;
}

// ============================================
// Metrics & Status
// ============================================

export interface SubscriptionManagerStats {
  isInitialized: boolean;
  poolCount: number;
  pools: Array<{
    index: number;
    isConnected: boolean;
    contractCount: number;
    capacity: number;
  }>;
  totalSubscriptions: number;
  pendingQueueSize: number;
  cacheSize: number;
  subscriptionsByPriority: Record<string, number>;
}

/**
 * Get subscription manager statistics.
 */
export function getStats(): SubscriptionManagerStats {
  const subscriptionsByPriority = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };

  for (const entry of subscriptions.values()) {
    switch (entry.priority) {
      case SubscriptionPriority.CRITICAL:
        subscriptionsByPriority.critical++;
        break;
      case SubscriptionPriority.HIGH:
        subscriptionsByPriority.high++;
        break;
      case SubscriptionPriority.MEDIUM:
        subscriptionsByPriority.medium++;
        break;
      case SubscriptionPriority.LOW:
        subscriptionsByPriority.low++;
        break;
    }
  }

  return {
    isInitialized,
    poolCount: connectionPools.length,
    pools: connectionPools.map((pool, index) => ({
      index,
      isConnected: pool.isConnected,
      contractCount: pool.contracts.size,
      capacity: MAX_CONTRACTS_PER_CONNECTION - pool.contracts.size,
    })),
    totalSubscriptions: subscriptions.size,
    pendingQueueSize: pendingQueue.length,
    cacheSize: quoteCache.size,
    subscriptionsByPriority,
  };
}

/**
 * Check if subscription manager is ready.
 */
export function isReady(): boolean {
  return isInitialized && connectionPools.some((p) => p.isConnected);
}

/**
 * Get total capacity across all pools.
 */
export function getTotalCapacity(): number {
  return connectionPools.reduce((sum, pool) => {
    return sum + (pool.isConnected ? MAX_CONTRACTS_PER_CONNECTION - pool.contracts.size : 0);
  }, 0);
}

/**
 * Get all active subscriptions.
 */
export function getActiveSubscriptions(): string[] {
  return Array.from(subscriptions.entries())
    .filter(([, entry]) => entry.connectionPoolIndex !== null)
    .map(([contract]) => contract);
}

// ============================================
// Export
// ============================================

export default {
  initSubscriptionManager,
  shutdownSubscriptionManager,
  requestSubscription,
  releaseSubscription,
  requestBatchSubscription,
  releaseBatchSubscription,
  setCriticalContracts,
  getCachedQuote,
  cleanExpiredCache,
  evictLowestPriority,
  getStats,
  isReady,
  getTotalCapacity,
  getActiveSubscriptions,
  SubscriptionPriority,
};
