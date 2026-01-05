/**
 * Quote Batching and Throttling Tests
 *
 * Tests for quote batching, throttling, and metrics.
 *
 * @see docs/plans/ui/06-websocket.md lines 158-174
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  type BatchingMetrics,
  calculateBatchFillRate,
  calculateThrottleRate,
  createQuote,
  DEFAULT_BATCHING_CONFIG,
  type Quote,
  QuoteBatcher,
  SymbolThrottle,
} from "./batching.js";

// ============================================
// Test Helpers
// ============================================

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createTestQuote(symbol: string, last?: number): Quote {
  return createQuote(symbol, last ?? 100 - 0.01, last ?? 100 + 0.01, last ?? 100, 1000);
}

// ============================================
// SymbolThrottle Tests
// ============================================

describe("SymbolThrottle", () => {
  it("allows first update for a symbol", () => {
    const throttle = new SymbolThrottle(200);
    expect(throttle.canUpdate("AAPL")).toBe(true);
  });

  it("blocks immediate second update", () => {
    const throttle = new SymbolThrottle(200);
    throttle.markSent("AAPL");
    expect(throttle.canUpdate("AAPL")).toBe(false);
  });

  it("allows update after throttle period", async () => {
    const throttle = new SymbolThrottle(50);
    throttle.markSent("AAPL");
    await delay(60);
    expect(throttle.canUpdate("AAPL")).toBe(true);
  });

  it("tracks different symbols independently", () => {
    const throttle = new SymbolThrottle(200);
    throttle.markSent("AAPL");
    expect(throttle.canUpdate("AAPL")).toBe(false);
    expect(throttle.canUpdate("MSFT")).toBe(true);
  });

  it("calculates time until allowed", () => {
    const throttle = new SymbolThrottle(200);
    throttle.markSent("AAPL");
    const time = throttle.timeUntilAllowed("AAPL");
    expect(time).toBeGreaterThan(0);
    expect(time).toBeLessThanOrEqual(200);
  });

  it("returns 0 time for untracked symbols", () => {
    const throttle = new SymbolThrottle(200);
    expect(throttle.timeUntilAllowed("AAPL")).toBe(0);
  });

  it("clears all state", () => {
    const throttle = new SymbolThrottle(200);
    throttle.markSent("AAPL");
    throttle.markSent("MSFT");
    throttle.clear();
    expect(throttle.canUpdate("AAPL")).toBe(true);
    expect(throttle.canUpdate("MSFT")).toBe(true);
  });

  it("updates throttle interval", () => {
    const throttle = new SymbolThrottle(200);
    expect(throttle.getThrottleMs()).toBe(200);
    throttle.setThrottleMs(500);
    expect(throttle.getThrottleMs()).toBe(500);
  });
});

// ============================================
// QuoteBatcher Basic Tests
// ============================================

describe("QuoteBatcher", () => {
  let receivedBatches: Quote[][];
  let batcher: QuoteBatcher;

  beforeEach(() => {
    receivedBatches = [];
    batcher = new QuoteBatcher((quotes) => receivedBatches.push(quotes), {
      maxBatchSize: 5,
      flushInterval: 50,
      throttlePerSymbol: 10,
    });
  });

  afterEach(() => {
    batcher.stop();
  });

  it("accepts quotes into buffer", () => {
    batcher.add(createTestQuote("AAPL"));
    expect(batcher.getBufferSize()).toBe(1);
  });

  it("de-duplicates quotes by symbol", () => {
    batcher.add(createTestQuote("AAPL", 100));
    batcher.add(createTestQuote("AAPL", 101)); // Should be throttled
    expect(batcher.getBufferSize()).toBe(1);
  });

  it("tracks multiple symbols", async () => {
    batcher.add(createTestQuote("AAPL"));
    await delay(15);
    batcher.add(createTestQuote("MSFT"));
    expect(batcher.getBufferSize()).toBe(2);
  });

  it("flushes manually", () => {
    batcher.add(createTestQuote("AAPL"));
    batcher.flush();
    expect(batcher.getBufferSize()).toBe(0);
    expect(receivedBatches.length).toBe(1);
    expect(receivedBatches[0]?.length).toBe(1);
  });

  it("does not flush empty buffer", () => {
    batcher.flush();
    expect(receivedBatches.length).toBe(0);
  });
});

// ============================================
// Batch Size Limit Tests
// ============================================

describe("QuoteBatcher - Size Limit", () => {
  let receivedBatches: Quote[][];
  let batcher: QuoteBatcher;

  beforeEach(() => {
    receivedBatches = [];
    batcher = new QuoteBatcher((quotes) => receivedBatches.push(quotes), {
      maxBatchSize: 3,
      flushInterval: 1000,
      throttlePerSymbol: 0,
    });
  });

  afterEach(() => {
    batcher.stop();
  });

  it("flushes when batch size reached", () => {
    batcher.add(createTestQuote("AAPL"));
    batcher.add(createTestQuote("MSFT"));
    batcher.add(createTestQuote("GOOGL")); // Should trigger flush
    expect(receivedBatches.length).toBe(1);
    expect(receivedBatches[0]?.length).toBe(3);
  });

  it("accepts quotes after size flush", () => {
    batcher.add(createTestQuote("AAPL"));
    batcher.add(createTestQuote("MSFT"));
    batcher.add(createTestQuote("GOOGL"));
    batcher.add(createTestQuote("AMZN"));
    expect(batcher.getBufferSize()).toBe(1);
  });
});

// ============================================
// Timer Flush Tests
// ============================================

describe("QuoteBatcher - Timer Flush", () => {
  let receivedBatches: Quote[][];
  let batcher: QuoteBatcher;

  beforeEach(() => {
    receivedBatches = [];
    batcher = new QuoteBatcher((quotes) => receivedBatches.push(quotes), {
      maxBatchSize: 50,
      flushInterval: 30,
      throttlePerSymbol: 0,
    });
  });

  afterEach(() => {
    batcher.stop();
  });

  it("flushes on timer when running", async () => {
    batcher.start();
    batcher.add(createTestQuote("AAPL"));
    expect(receivedBatches.length).toBe(0);
    await delay(50);
    expect(receivedBatches.length).toBe(1);
  });

  it("does not flush when stopped", async () => {
    batcher.add(createTestQuote("AAPL"));
    await delay(50);
    expect(receivedBatches.length).toBe(0);
  });

  it("can start and stop", () => {
    expect(batcher.isActive()).toBe(false);
    batcher.start();
    expect(batcher.isActive()).toBe(true);
    batcher.stop();
    expect(batcher.isActive()).toBe(false);
  });
});

// ============================================
// Throttling Tests
// ============================================

describe("QuoteBatcher - Throttling", () => {
  let receivedBatches: Quote[][];
  let batcher: QuoteBatcher;

  beforeEach(() => {
    receivedBatches = [];
    batcher = new QuoteBatcher((quotes) => receivedBatches.push(quotes), {
      maxBatchSize: 50,
      flushInterval: 1000,
      throttlePerSymbol: 50,
    });
  });

  afterEach(() => {
    batcher.stop();
  });

  it("throttles rapid updates for same symbol", () => {
    expect(batcher.add(createTestQuote("AAPL", 100))).toBe(true);
    expect(batcher.add(createTestQuote("AAPL", 101))).toBe(false);
    expect(batcher.add(createTestQuote("AAPL", 102))).toBe(false);
  });

  it("allows updates after throttle period", async () => {
    expect(batcher.add(createTestQuote("AAPL", 100))).toBe(true);
    await delay(60);
    expect(batcher.add(createTestQuote("AAPL", 101))).toBe(true);
  });

  it("tracks throttle count in metrics", () => {
    batcher.add(createTestQuote("AAPL", 100));
    batcher.add(createTestQuote("AAPL", 101)); // Throttled
    batcher.add(createTestQuote("AAPL", 102)); // Throttled
    const metrics = batcher.getMetrics();
    expect(metrics.quotesReceived).toBe(3);
    expect(metrics.quotesThrottled).toBe(2);
  });
});

// ============================================
// Metrics Tests
// ============================================

describe("QuoteBatcher - Metrics", () => {
  let batcher: QuoteBatcher;

  beforeEach(() => {
    batcher = new QuoteBatcher(() => {}, {
      maxBatchSize: 5,
      flushInterval: 1000,
      throttlePerSymbol: 0,
    });
  });

  afterEach(() => {
    batcher.stop();
  });

  it("tracks quotes received", () => {
    batcher.add(createTestQuote("AAPL"));
    batcher.add(createTestQuote("MSFT"));
    batcher.add(createTestQuote("GOOGL"));
    expect(batcher.getMetrics().quotesReceived).toBe(3);
  });

  it("tracks quotes sent", () => {
    batcher.add(createTestQuote("AAPL"));
    batcher.add(createTestQuote("MSFT"));
    batcher.flush();
    expect(batcher.getMetrics().quotesSent).toBe(2);
  });

  it("tracks batches sent", () => {
    batcher.add(createTestQuote("AAPL"));
    batcher.flush();
    batcher.add(createTestQuote("MSFT"));
    batcher.flush();
    expect(batcher.getMetrics().batchesSent).toBe(2);
  });

  it("calculates average batch size", () => {
    batcher.add(createTestQuote("AAPL"));
    batcher.add(createTestQuote("MSFT"));
    batcher.flush();
    batcher.add(createTestQuote("GOOGL"));
    batcher.add(createTestQuote("AMZN"));
    batcher.add(createTestQuote("NVDA"));
    batcher.add(createTestQuote("META"));
    batcher.flush();
    const metrics = batcher.getMetrics();
    expect(metrics.avgBatchSize).toBe(3); // (2 + 4) / 2
  });

  it("tracks max batch size", () => {
    batcher.add(createTestQuote("AAPL"));
    batcher.flush();
    batcher.add(createTestQuote("MSFT"));
    batcher.add(createTestQuote("GOOGL"));
    batcher.add(createTestQuote("AMZN"));
    batcher.flush();
    expect(batcher.getMetrics().maxBatchSizeSeen).toBe(3);
  });

  it("tracks flush reasons", () => {
    // Manual flush
    batcher.add(createTestQuote("AAPL"));
    batcher.flush("manual");

    // Size flush (batch of 5)
    for (let i = 0; i < 5; i++) {
      batcher.add(createTestQuote(`SYM${i}`));
    }

    const metrics = batcher.getMetrics();
    expect(metrics.flushBySize).toBe(1);
  });

  it("resets metrics", () => {
    batcher.add(createTestQuote("AAPL"));
    batcher.flush();
    batcher.resetMetrics();
    const metrics = batcher.getMetrics();
    expect(metrics.quotesReceived).toBe(0);
    expect(metrics.batchesSent).toBe(0);
  });
});

// ============================================
// Configuration Tests
// ============================================

describe("QuoteBatcher - Configuration", () => {
  it("uses default config", () => {
    const batcher = new QuoteBatcher(() => {});
    expect(batcher.getConfig()).toEqual(DEFAULT_BATCHING_CONFIG);
    batcher.stop();
  });

  it("accepts partial config", () => {
    const batcher = new QuoteBatcher(() => {}, { maxBatchSize: 100 });
    const config = batcher.getConfig();
    expect(config.maxBatchSize).toBe(100);
    expect(config.flushInterval).toBe(DEFAULT_BATCHING_CONFIG.flushInterval);
    batcher.stop();
  });

  it("updates config", () => {
    const batcher = new QuoteBatcher(() => {});
    batcher.updateConfig({ maxBatchSize: 200 });
    expect(batcher.getConfig().maxBatchSize).toBe(200);
    batcher.stop();
  });

  it("clears buffer and throttle", () => {
    const batcher = new QuoteBatcher(() => {}, { throttlePerSymbol: 1000 });
    batcher.add(createTestQuote("AAPL"));
    expect(batcher.getBufferSize()).toBe(1);
    expect(batcher.add(createTestQuote("AAPL"))).toBe(false); // Throttled

    batcher.clear();
    expect(batcher.getBufferSize()).toBe(0);
    expect(batcher.add(createTestQuote("AAPL"))).toBe(true); // No longer throttled
    batcher.stop();
  });
});

// ============================================
// addMany Tests
// ============================================

describe("QuoteBatcher - addMany", () => {
  it("adds multiple quotes", () => {
    const batcher = new QuoteBatcher(() => {}, { throttlePerSymbol: 0 });
    const quotes = [createTestQuote("AAPL"), createTestQuote("MSFT"), createTestQuote("GOOGL")];
    const accepted = batcher.addMany(quotes);
    expect(accepted).toBe(3);
    expect(batcher.getBufferSize()).toBe(3);
    batcher.stop();
  });

  it("counts throttled quotes", () => {
    const batcher = new QuoteBatcher(() => {}, { throttlePerSymbol: 1000 });
    const quotes = [
      createTestQuote("AAPL", 100),
      createTestQuote("AAPL", 101), // Throttled
      createTestQuote("AAPL", 102), // Throttled
      createTestQuote("MSFT"),
    ];
    const accepted = batcher.addMany(quotes);
    expect(accepted).toBe(2);
    batcher.stop();
  });
});

// ============================================
// Utility Function Tests
// ============================================

describe("Utility Functions", () => {
  it("calculateThrottleRate returns 0 for no quotes", () => {
    const metrics: BatchingMetrics = {
      quotesReceived: 0,
      quotesSent: 0,
      quotesThrottled: 0,
      batchesSent: 0,
      avgBatchSize: 0,
      maxBatchSizeSeen: 0,
      flushBySize: 0,
      flushByTimer: 0,
    };
    expect(calculateThrottleRate(metrics)).toBe(0);
  });

  it("calculateThrottleRate calculates correctly", () => {
    const metrics: BatchingMetrics = {
      quotesReceived: 100,
      quotesSent: 50,
      quotesThrottled: 50,
      batchesSent: 5,
      avgBatchSize: 10,
      maxBatchSizeSeen: 15,
      flushBySize: 3,
      flushByTimer: 2,
    };
    expect(calculateThrottleRate(metrics)).toBe(0.5);
  });

  it("calculateBatchFillRate returns 0 for no batches", () => {
    const metrics: BatchingMetrics = {
      quotesReceived: 10,
      quotesSent: 0,
      quotesThrottled: 0,
      batchesSent: 0,
      avgBatchSize: 0,
      maxBatchSizeSeen: 0,
      flushBySize: 0,
      flushByTimer: 0,
    };
    expect(calculateBatchFillRate(metrics, 50)).toBe(0);
  });

  it("calculateBatchFillRate calculates correctly", () => {
    const metrics: BatchingMetrics = {
      quotesReceived: 100,
      quotesSent: 100,
      quotesThrottled: 0,
      batchesSent: 4,
      avgBatchSize: 25,
      maxBatchSizeSeen: 50,
      flushBySize: 2,
      flushByTimer: 2,
    };
    expect(calculateBatchFillRate(metrics, 50)).toBe(0.5);
  });

  it("createQuote creates valid quote", () => {
    const quote = createQuote("AAPL", 149.99, 150.01, 150.0, 1000000);
    expect(quote.symbol).toBe("AAPL");
    expect(quote.bid).toBe(149.99);
    expect(quote.ask).toBe(150.01);
    expect(quote.last).toBe(150.0);
    expect(quote.volume).toBe(1000000);
    expect(quote.timestamp).toBeDefined();
  });
});

// ============================================
// Default Config Tests
// ============================================

describe("DEFAULT_BATCHING_CONFIG", () => {
  it("has correct maxBatchSize", () => {
    expect(DEFAULT_BATCHING_CONFIG.maxBatchSize).toBe(50);
  });

  it("has correct flushInterval", () => {
    expect(DEFAULT_BATCHING_CONFIG.flushInterval).toBe(100);
  });

  it("has correct throttlePerSymbol", () => {
    expect(DEFAULT_BATCHING_CONFIG.throttlePerSymbol).toBe(200);
  });
});
