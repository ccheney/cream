/**
 * Quote Batching and Throttling
 *
 * Optimizes WebSocket message throughput by batching quotes and
 * throttling per-symbol updates.
 *
 * @see docs/plans/ui/06-websocket.md lines 158-174
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

export interface BatchingConfig {
	/** Maximum quotes per batch (default: 50) */
	maxBatchSize: number;
	/** Flush interval in ms (default: 100) */
	flushInterval: number;
	/** Per-symbol throttle in ms (default: 200) */
	throttlePerSymbol: number;
}

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

export type BatchCallback = (quotes: Quote[]) => void;

export const DEFAULT_BATCHING_CONFIG: BatchingConfig = {
	maxBatchSize: 50,
	flushInterval: 100,
	throttlePerSymbol: 200,
};

export class SymbolThrottle {
	private lastSent: Map<string, number> = new Map();
	private throttleMs: number;

	constructor(throttleMs = 200) {
		this.throttleMs = throttleMs;
	}

	canUpdate(symbol: string): boolean {
		const now = Date.now();
		const lastTime = this.lastSent.get(symbol) ?? 0;
		return now - lastTime >= this.throttleMs;
	}

	markSent(symbol: string): void {
		this.lastSent.set(symbol, Date.now());
	}

	timeUntilAllowed(symbol: string): number {
		const now = Date.now();
		const lastTime = this.lastSent.get(symbol) ?? 0;
		const elapsed = now - lastTime;
		return Math.max(0, this.throttleMs - elapsed);
	}

	clear(): void {
		this.lastSent.clear();
	}

	getThrottleMs(): number {
		return this.throttleMs;
	}

	setThrottleMs(ms: number): void {
		this.throttleMs = ms;
	}
}

export class QuoteBatcher {
	private config: BatchingConfig;
	private buffer: Map<string, Quote> = new Map();
	private throttle: SymbolThrottle;
	private metrics: BatchingMetrics;
	private callback: BatchCallback;
	private flushTimer: ReturnType<typeof setInterval> | null = null;
	private isRunning = false;

	constructor(callback: BatchCallback, config?: Partial<BatchingConfig>) {
		this.config = { ...DEFAULT_BATCHING_CONFIG, ...config };
		this.throttle = new SymbolThrottle(this.config.throttlePerSymbol);
		this.callback = callback;
		this.metrics = this.createEmptyMetrics();
	}

	start(): void {
		if (this.isRunning) {
			return;
		}

		this.isRunning = true;
		this.flushTimer = setInterval(() => {
			if (this.buffer.size > 0) {
				this.flush("timer");
			}
		}, this.config.flushInterval);
	}

	stop(): void {
		this.isRunning = false;
		if (this.flushTimer) {
			clearInterval(this.flushTimer);
			this.flushTimer = null;
		}
	}

	/**
	 * Returns true if quote was accepted, false if throttled.
	 */
	add(quote: Quote): boolean {
		this.metrics.quotesReceived++;

		if (!this.throttle.canUpdate(quote.symbol)) {
			this.metrics.quotesThrottled++;
			return false;
		}

		// Latest quote wins when same symbol appears multiple times before flush
		this.buffer.set(quote.symbol, quote);
		this.throttle.markSent(quote.symbol);

		if (this.buffer.size >= this.config.maxBatchSize) {
			this.flush("size");
		}

		return true;
	}

	/**
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

	flush(reason: "size" | "timer" | "manual" = "manual"): void {
		if (this.buffer.size === 0) {
			return;
		}

		const quotes = Array.from(this.buffer.values());
		this.buffer.clear();

		this.metrics.quotesSent += quotes.length;
		this.metrics.batchesSent++;
		this.metrics.maxBatchSizeSeen = Math.max(this.metrics.maxBatchSizeSeen, quotes.length);
		this.metrics.avgBatchSize = this.metrics.quotesSent / this.metrics.batchesSent;

		if (reason === "size") {
			this.metrics.flushBySize++;
		} else if (reason === "timer") {
			this.metrics.flushByTimer++;
		}

		this.callback(quotes);
	}

	getMetrics(): BatchingMetrics {
		return { ...this.metrics };
	}

	resetMetrics(): void {
		this.metrics = this.createEmptyMetrics();
	}

	getBufferSize(): number {
		return this.buffer.size;
	}

	isActive(): boolean {
		return this.isRunning;
	}

	getConfig(): BatchingConfig {
		return { ...this.config };
	}

	updateConfig(config: Partial<BatchingConfig>): void {
		this.config = { ...this.config, ...config };
		if (config.throttlePerSymbol !== undefined) {
			this.throttle.setThrottleMs(config.throttlePerSymbol);
		}

		// Timer must be restarted to pick up new flushInterval
		if (config.flushInterval !== undefined && this.isRunning) {
			this.stop();
			this.start();
		}
	}

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

export function calculateThrottleRate(metrics: BatchingMetrics): number {
	if (metrics.quotesReceived === 0) {
		return 0;
	}
	return metrics.quotesThrottled / metrics.quotesReceived;
}

export function calculateBatchFillRate(metrics: BatchingMetrics, maxBatchSize: number): number {
	if (metrics.batchesSent === 0) {
		return 0;
	}
	return metrics.avgBatchSize / maxBatchSize;
}

export function createQuote(
	symbol: string,
	bid: number,
	ask: number,
	last: number,
	volume = 0
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
