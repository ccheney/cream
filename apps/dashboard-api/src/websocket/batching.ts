/**
 * Quote Batching and Throttling
 *
 * Optimizes WebSocket message throughput by batching quotes and
 * throttling per-symbol updates.
 *
 * @see docs/plans/ui/06-websocket.md lines 158-174
 */

// ============================================
// Types
// ============================================

/**
 * Quote data structure.
 */
export interface Quote {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  bidSize?: number;
  askSize?: number;
  volume: number;
  prevClose?: number;
  changePercent?: number;
  timestamp: string;
}

/**
 * Batching configuration.
 */
export interface BatchingConfig {
  /** Maximum quotes per batch (default: 50) */
  maxBatchSize: number;
  /** Flush interval in ms (default: 100) */
  flushInterval: number;
  /** Per-symbol throttle in ms (default: 200) */
  throttlePerSymbol: number;
}

/**
 * Batching metrics.
 */
export interface BatchingMetrics {
  /** Total quotes received */
  quotesReceived: number;
  /** Quotes sent (after throttling) */
  quotesSent: number;
  /** Quotes discarded by throttle */
  quotesThrottled: number;
  /** Total batches sent */
  batchesSent: number;
  /** Average batch size */
  avgBatchSize: number;
  /** Max batch size seen */
  maxBatchSizeSeen: number;
  /** Flushes triggered by size limit */
  flushBySize: number;
  /** Flushes triggered by timer */
  flushByTimer: number;
}

/**
 * Callback for sending batched quotes.
 */
export type BatchCallback = (quotes: Quote[]) => void;

// ============================================
// Constants
// ============================================

/**
 * Default batching configuration.
 */
export const DEFAULT_BATCHING_CONFIG: BatchingConfig = {
  maxBatchSize: 50,
  flushInterval: 100,
  throttlePerSymbol: 200,
};

// ============================================
// Per-Symbol Throttle
// ============================================

/**
 * Per-symbol throttle tracker.
 */
export class SymbolThrottle {
  private lastSent: Map<string, number> = new Map();
  private throttleMs: number;

  constructor(throttleMs: number = 200) {
    this.throttleMs = throttleMs;
  }

  /**
   * Check if a symbol can be updated (not throttled).
   */
  canUpdate(symbol: string): boolean {
    const now = Date.now();
    const lastTime = this.lastSent.get(symbol) ?? 0;
    return now - lastTime >= this.throttleMs;
  }

  /**
   * Mark a symbol as sent.
   */
  markSent(symbol: string): void {
    this.lastSent.set(symbol, Date.now());
  }

  /**
   * Get time until symbol can be updated.
   */
  timeUntilAllowed(symbol: string): number {
    const now = Date.now();
    const lastTime = this.lastSent.get(symbol) ?? 0;
    const elapsed = now - lastTime;
    return Math.max(0, this.throttleMs - elapsed);
  }

  /**
   * Clear all throttle state.
   */
  clear(): void {
    this.lastSent.clear();
  }

  /**
   * Get current throttle interval.
   */
  getThrottleMs(): number {
    return this.throttleMs;
  }

  /**
   * Update throttle interval.
   */
  setThrottleMs(ms: number): void {
    this.throttleMs = ms;
  }
}

// ============================================
// Quote Batcher
// ============================================

/**
 * Batches and throttles quote updates.
 */
export class QuoteBatcher {
  private config: BatchingConfig;
  private buffer: Map<string, Quote> = new Map();
  private throttle: SymbolThrottle;
  private metrics: BatchingMetrics;
  private callback: BatchCallback;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private isRunning: boolean = false;

  constructor(callback: BatchCallback, config?: Partial<BatchingConfig>) {
    this.config = { ...DEFAULT_BATCHING_CONFIG, ...config };
    this.throttle = new SymbolThrottle(this.config.throttlePerSymbol);
    this.callback = callback;
    this.metrics = this.createEmptyMetrics();
  }

  /**
   * Start the batcher (enables flush timer).
   */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.flushTimer = setInterval(() => {
      if (this.buffer.size > 0) {
        this.flush("timer");
      }
    }, this.config.flushInterval);
  }

  /**
   * Stop the batcher.
   */
  stop(): void {
    this.isRunning = false;
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Add a quote to the batch.
   * Returns true if quote was accepted, false if throttled.
   */
  add(quote: Quote): boolean {
    this.metrics.quotesReceived++;

    // Check per-symbol throttle
    if (!this.throttle.canUpdate(quote.symbol)) {
      this.metrics.quotesThrottled++;
      return false;
    }

    // Add to buffer (de-duplicate: latest wins)
    this.buffer.set(quote.symbol, quote);
    this.throttle.markSent(quote.symbol);

    // Flush if batch is full
    if (this.buffer.size >= this.config.maxBatchSize) {
      this.flush("size");
    }

    return true;
  }

  /**
   * Add multiple quotes.
   * Returns count of accepted quotes.
   */
  addMany(quotes: Quote[]): number {
    let accepted = 0;
    for (const quote of quotes) {
      if (this.add(quote)) {
        accepted++;
      }
    }
    return accepted;
  }

  /**
   * Flush the current batch.
   */
  flush(reason: "size" | "timer" | "manual" = "manual"): void {
    if (this.buffer.size === 0) return;

    const quotes = Array.from(this.buffer.values());
    this.buffer.clear();

    // Update metrics
    this.metrics.quotesSent += quotes.length;
    this.metrics.batchesSent++;
    this.metrics.maxBatchSizeSeen = Math.max(
      this.metrics.maxBatchSizeSeen,
      quotes.length
    );
    this.metrics.avgBatchSize =
      this.metrics.quotesSent / this.metrics.batchesSent;

    if (reason === "size") {
      this.metrics.flushBySize++;
    } else if (reason === "timer") {
      this.metrics.flushByTimer++;
    }

    // Send batch
    this.callback(quotes);
  }

  /**
   * Get current metrics.
   */
  getMetrics(): BatchingMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics.
   */
  resetMetrics(): void {
    this.metrics = this.createEmptyMetrics();
  }

  /**
   * Get current buffer size.
   */
  getBufferSize(): number {
    return this.buffer.size;
  }

  /**
   * Check if batcher is running.
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Get current configuration.
   */
  getConfig(): BatchingConfig {
    return { ...this.config };
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<BatchingConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.throttlePerSymbol !== undefined) {
      this.throttle.setThrottleMs(config.throttlePerSymbol);
    }

    // Restart timer if interval changed
    if (config.flushInterval !== undefined && this.isRunning) {
      this.stop();
      this.start();
    }
  }

  /**
   * Clear buffer and throttle state.
   */
  clear(): void {
    this.buffer.clear();
    this.throttle.clear();
  }

  private createEmptyMetrics(): BatchingMetrics {
    return {
      quotesReceived: 0,
      quotesSent: 0,
      quotesThrottled: 0,
      batchesSent: 0,
      avgBatchSize: 0,
      maxBatchSizeSeen: 0,
      flushBySize: 0,
      flushByTimer: 0,
    };
  }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Calculate throttle discard rate.
 */
export function calculateThrottleRate(metrics: BatchingMetrics): number {
  if (metrics.quotesReceived === 0) return 0;
  return metrics.quotesThrottled / metrics.quotesReceived;
}

/**
 * Calculate batch fill rate.
 */
export function calculateBatchFillRate(
  metrics: BatchingMetrics,
  maxBatchSize: number
): number {
  if (metrics.batchesSent === 0) return 0;
  return metrics.avgBatchSize / maxBatchSize;
}

/**
 * Create a quote object.
 */
export function createQuote(
  symbol: string,
  bid: number,
  ask: number,
  last: number,
  volume: number = 0
): Quote {
  return {
    symbol,
    bid,
    ask,
    last,
    volume,
    timestamp: new Date().toISOString(),
  };
}
