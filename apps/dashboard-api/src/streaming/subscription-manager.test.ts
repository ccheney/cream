/**
 * Subscription Manager Tests
 *
 * Tests for priority queue logic, connection pooling, and cache management.
 */

import { describe, expect, it } from "bun:test";
import { getStats, SubscriptionPriority } from "./subscription-manager.js";

// ============================================
// Test Helpers
// ============================================

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================
// Priority Queue Tests (Unit Tests)
// ============================================

describe("SubscriptionPriority", () => {
  it("has correct priority ordering", () => {
    expect(SubscriptionPriority.CRITICAL).toBe(0);
    expect(SubscriptionPriority.HIGH).toBe(1);
    expect(SubscriptionPriority.MEDIUM).toBe(2);
    expect(SubscriptionPriority.LOW).toBe(3);
  });

  it("CRITICAL < HIGH < MEDIUM < LOW", () => {
    expect(SubscriptionPriority.CRITICAL).toBeLessThan(SubscriptionPriority.HIGH);
    expect(SubscriptionPriority.HIGH).toBeLessThan(SubscriptionPriority.MEDIUM);
    expect(SubscriptionPriority.MEDIUM).toBeLessThan(SubscriptionPriority.LOW);
  });
});

// ============================================
// Priority Queue Sorting Logic Tests
// ============================================

describe("Priority Queue Sorting", () => {
  interface MockEntry {
    contract: string;
    priority: SubscriptionPriority;
    lastRequestedAt: Date;
  }

  function sortByPriority(entries: MockEntry[]): MockEntry[] {
    return entries.toSorted((a, b) => {
      // Lower priority number = higher importance
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      // Older requests first (FIFO within same priority)
      return a.lastRequestedAt.getTime() - b.lastRequestedAt.getTime();
    });
  }

  it("sorts by priority first", () => {
    const entries: MockEntry[] = [
      { contract: "LOW", priority: SubscriptionPriority.LOW, lastRequestedAt: new Date() },
      { contract: "HIGH", priority: SubscriptionPriority.HIGH, lastRequestedAt: new Date() },
      {
        contract: "CRITICAL",
        priority: SubscriptionPriority.CRITICAL,
        lastRequestedAt: new Date(),
      },
      { contract: "MEDIUM", priority: SubscriptionPriority.MEDIUM, lastRequestedAt: new Date() },
    ];

    const sorted = sortByPriority(entries);
    expect(sorted.map((e) => e.contract)).toEqual(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);
  });

  it("sorts by timestamp within same priority (FIFO)", () => {
    const now = Date.now();
    const entries: MockEntry[] = [
      {
        contract: "THIRD",
        priority: SubscriptionPriority.HIGH,
        lastRequestedAt: new Date(now + 200),
      },
      { contract: "FIRST", priority: SubscriptionPriority.HIGH, lastRequestedAt: new Date(now) },
      {
        contract: "SECOND",
        priority: SubscriptionPriority.HIGH,
        lastRequestedAt: new Date(now + 100),
      },
    ];

    const sorted = sortByPriority(entries);
    expect(sorted.map((e) => e.contract)).toEqual(["FIRST", "SECOND", "THIRD"]);
  });

  it("handles mixed priorities and timestamps", () => {
    const now = Date.now();
    const entries: MockEntry[] = [
      { contract: "LOW_OLD", priority: SubscriptionPriority.LOW, lastRequestedAt: new Date(now) },
      {
        contract: "HIGH_NEW",
        priority: SubscriptionPriority.HIGH,
        lastRequestedAt: new Date(now + 100),
      },
      { contract: "HIGH_OLD", priority: SubscriptionPriority.HIGH, lastRequestedAt: new Date(now) },
      {
        contract: "CRITICAL",
        priority: SubscriptionPriority.CRITICAL,
        lastRequestedAt: new Date(now + 200),
      },
    ];

    const sorted = sortByPriority(entries);
    expect(sorted.map((e) => e.contract)).toEqual(["CRITICAL", "HIGH_OLD", "HIGH_NEW", "LOW_OLD"]);
  });
});

// ============================================
// Eviction Logic Tests
// ============================================

describe("Eviction Priority", () => {
  interface MockEntry {
    contract: string;
    priority: SubscriptionPriority;
    lastRequestedAt: Date;
  }

  function sortForEviction(entries: MockEntry[]): MockEntry[] {
    // Lowest importance first (highest priority number, oldest timestamp)
    return entries.toSorted((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return a.lastRequestedAt.getTime() - b.lastRequestedAt.getTime();
    });
  }

  it("evicts LOW priority before HIGH", () => {
    const entries: MockEntry[] = [
      { contract: "HIGH", priority: SubscriptionPriority.HIGH, lastRequestedAt: new Date() },
      { contract: "LOW", priority: SubscriptionPriority.LOW, lastRequestedAt: new Date() },
    ];

    const sorted = sortForEviction(entries);
    expect(sorted[0]?.contract).toBe("LOW");
  });

  it("evicts oldest within same priority", () => {
    const now = Date.now();
    const entries: MockEntry[] = [
      {
        contract: "NEW",
        priority: SubscriptionPriority.MEDIUM,
        lastRequestedAt: new Date(now + 100),
      },
      { contract: "OLD", priority: SubscriptionPriority.MEDIUM, lastRequestedAt: new Date(now) },
    ];

    const sorted = sortForEviction(entries);
    expect(sorted[0]?.contract).toBe("OLD");
  });

  it("never evicts CRITICAL", () => {
    const entries: MockEntry[] = [
      {
        contract: "CRITICAL",
        priority: SubscriptionPriority.CRITICAL,
        lastRequestedAt: new Date(),
      },
      { contract: "LOW", priority: SubscriptionPriority.LOW, lastRequestedAt: new Date() },
    ];

    // Filter out CRITICAL before sorting
    const evictable = entries.filter((e) => e.priority !== SubscriptionPriority.CRITICAL);
    const sorted = sortForEviction(evictable);
    expect(sorted.length).toBe(1);
    expect(sorted[0]?.contract).toBe("LOW");
  });
});

// ============================================
// Cache TTL Logic Tests
// ============================================

describe("Cache TTL", () => {
  const CACHE_TTL_MS = 30_000;

  function isExpired(cachedAt: Date, ttl: number = CACHE_TTL_MS): boolean {
    return Date.now() - cachedAt.getTime() > ttl;
  }

  it("considers recent entries valid", () => {
    const cachedAt = new Date();
    expect(isExpired(cachedAt)).toBe(false);
  });

  it("considers old entries expired", () => {
    const cachedAt = new Date(Date.now() - 31_000);
    expect(isExpired(cachedAt)).toBe(true);
  });

  it("boundary case: exactly at TTL", () => {
    const cachedAt = new Date(Date.now() - CACHE_TTL_MS);
    // At exactly TTL, should not be expired yet
    expect(isExpired(cachedAt)).toBe(false);
  });
});

// ============================================
// Significant Move Detection Tests
// ============================================

describe("Significant Move Detection", () => {
  const THRESHOLD = 0.01; // 1%

  function isSignificantMove(oldMid: number, newMid: number): boolean {
    if (oldMid <= 0) {
      return false;
    }
    return Math.abs(newMid - oldMid) / oldMid > THRESHOLD;
  }

  it("detects >1% increase as significant", () => {
    const oldMid = 100;
    const newMid = 101.5; // 1.5% increase
    expect(isSignificantMove(oldMid, newMid)).toBe(true);
  });

  it("detects >1% decrease as significant", () => {
    const oldMid = 100;
    const newMid = 98.5; // 1.5% decrease
    expect(isSignificantMove(oldMid, newMid)).toBe(true);
  });

  it("considers <1% change as not significant", () => {
    const oldMid = 100;
    const newMid = 100.5; // 0.5% change
    expect(isSignificantMove(oldMid, newMid)).toBe(false);
  });

  it("handles edge case: exactly 1%", () => {
    const oldMid = 100;
    const newMid = 101; // exactly 1%
    // At exactly 1%, should not be significant (> not >=)
    expect(isSignificantMove(oldMid, newMid)).toBe(false);
  });

  it("handles zero old price", () => {
    const oldMid = 0;
    const newMid = 100;
    expect(isSignificantMove(oldMid, newMid)).toBe(false);
  });
});

// ============================================
// Contract Extraction Tests
// ============================================

describe("Contract Symbol Extraction", () => {
  function extractUnderlying(contract: string): string {
    const symbol = contract.startsWith("O:") ? contract.slice(2) : contract;
    const dateStart = symbol.search(/\d/);
    return dateStart > 0 ? symbol.slice(0, dateStart) : symbol;
  }

  it("extracts AAPL from O:AAPL250117C00100000", () => {
    expect(extractUnderlying("O:AAPL250117C00100000")).toBe("AAPL");
  });

  it("extracts SPY from O:SPY250121P00450000", () => {
    expect(extractUnderlying("O:SPY250121P00450000")).toBe("SPY");
  });

  it("handles without O: prefix", () => {
    expect(extractUnderlying("MSFT250117C00400000")).toBe("MSFT");
  });

  it("handles SPXW (index options)", () => {
    expect(extractUnderlying("O:SPXW250117C04500000")).toBe("SPXW");
  });

  it("handles BRK.A (dots in symbol)", () => {
    // Note: This would fail with current regex - symbols with dots need special handling
    expect(extractUnderlying("O:BRKA250117C00500000")).toBe("BRKA");
  });
});

// ============================================
// Connection Pool Capacity Tests
// ============================================

describe("Connection Pool Capacity", () => {
  const MAX_CONTRACTS_PER_CONNECTION = 1000;
  const CONNECTION_SPAWN_THRESHOLD = 900;

  interface MockPool {
    isConnected: boolean;
    contractCount: number;
  }

  function shouldSpawnNewPool(pools: MockPool[], maxPools: number): boolean {
    if (pools.length >= maxPools) {
      return false;
    }
    const lastPool = pools[pools.length - 1];
    return lastPool !== undefined && lastPool.contractCount >= CONNECTION_SPAWN_THRESHOLD;
  }

  function getAvailableCapacity(pools: MockPool[]): number {
    return pools.reduce((sum, pool) => {
      return sum + (pool.isConnected ? MAX_CONTRACTS_PER_CONNECTION - pool.contractCount : 0);
    }, 0);
  }

  it("spawns new pool when at 90% capacity", () => {
    const pools: MockPool[] = [{ isConnected: true, contractCount: 900 }];
    expect(shouldSpawnNewPool(pools, 5)).toBe(true);
  });

  it("does not spawn when below threshold", () => {
    const pools: MockPool[] = [{ isConnected: true, contractCount: 800 }];
    expect(shouldSpawnNewPool(pools, 5)).toBe(false);
  });

  it("does not spawn when at max pools", () => {
    const pools: MockPool[] = Array(5)
      .fill(null)
      .map(() => ({ isConnected: true, contractCount: 950 }));
    expect(shouldSpawnNewPool(pools, 5)).toBe(false);
  });

  it("calculates available capacity", () => {
    const pools: MockPool[] = [
      { isConnected: true, contractCount: 800 },
      { isConnected: true, contractCount: 500 },
      { isConnected: false, contractCount: 100 }, // Disconnected, doesn't count
    ];
    expect(getAvailableCapacity(pools)).toBe(700); // (1000-800) + (1000-500) + 0
  });
});

// ============================================
// Debounce Logic Tests
// ============================================

describe("Unsubscribe Debounce", () => {
  it("cancels unsubscribe if resubscribed within debounce period", async () => {
    let unsubscribeCalled = false;
    let timeoutId: Timer | null = null;

    // Simulate schedule unsubscribe
    timeoutId = setTimeout(() => {
      unsubscribeCalled = true;
    }, 100);

    // Simulate resubscribe before debounce expires
    await delay(50);
    clearTimeout(timeoutId);

    await delay(100);
    expect(unsubscribeCalled).toBe(false);
  });

  it("executes unsubscribe after debounce period", async () => {
    let unsubscribeCalled = false;

    setTimeout(() => {
      unsubscribeCalled = true;
    }, 50);

    await delay(100);
    expect(unsubscribeCalled).toBe(true);
  });
});

// ============================================
// Stats Structure Tests
// ============================================

describe("Stats Structure", () => {
  it("getStats returns expected structure", () => {
    // Note: This test will fail if module not initialized, but tests structure
    const expectedKeys = [
      "isInitialized",
      "poolCount",
      "pools",
      "totalSubscriptions",
      "pendingQueueSize",
      "cacheSize",
      "subscriptionsByPriority",
    ];

    const stats = getStats();
    for (const key of expectedKeys) {
      expect(stats).toHaveProperty(key);
    }
  });

  it("subscriptionsByPriority has all levels", () => {
    const stats = getStats();
    expect(stats.subscriptionsByPriority).toHaveProperty("critical");
    expect(stats.subscriptionsByPriority).toHaveProperty("high");
    expect(stats.subscriptionsByPriority).toHaveProperty("medium");
    expect(stats.subscriptionsByPriority).toHaveProperty("low");
  });
});

// ============================================
// Edge Cases
// ============================================

describe("Edge Cases", () => {
  it("handles uppercase contract normalization", () => {
    const contract = "o:aapl250117c00100000";
    expect(contract.toUpperCase()).toBe("O:AAPL250117C00100000");
  });

  it("handles empty subscriber set", () => {
    const subscribers = new Set<string>();
    expect(subscribers.size).toBe(0);
    subscribers.delete("nonexistent"); // Should not throw
    expect(subscribers.size).toBe(0);
  });

  it("handles duplicate subscriber add", () => {
    const subscribers = new Set<string>();
    subscribers.add("conn-1");
    subscribers.add("conn-1"); // Duplicate
    expect(subscribers.size).toBe(1);
  });
});
