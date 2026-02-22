const sleep = Bun.sleep;

/**
 * Simple token bucket rate limiter.
 * FRED free tier: 120 requests/minute
 */
export class RateLimiter {
	private tokens: number;
	private lastRefill: number;
	private readonly maxTokens: number;
	private readonly refillIntervalMs: number;

	constructor(maxRequests: number, intervalMs: number) {
		this.maxTokens = maxRequests;
		this.tokens = maxRequests;
		this.refillIntervalMs = intervalMs;
		this.lastRefill = Date.now();
	}

	async acquire(): Promise<void> {
		this.refill();
		if (this.tokens > 0) {
			this.tokens--;
			return;
		}
		const waitTime = this.refillIntervalMs - (Date.now() - this.lastRefill);
		if (waitTime > 0) {
			await sleep(waitTime);
			this.refill();
		}
		this.tokens--;
	}

	private refill(): void {
		const now = Date.now();
		if (now - this.lastRefill < this.refillIntervalMs) {
			return;
		}
		this.tokens = this.maxTokens;
		this.lastRefill = now;
	}
}
