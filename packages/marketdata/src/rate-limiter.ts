import type { RateLimitConfig } from "./client.js";

/**
 * Token bucket rate limiter.
 */
export class RateLimiter {
	private tokens: number;
	private lastRefill: number;

	constructor(private config: RateLimitConfig) {
		this.tokens = config.maxRequests;
		this.lastRefill = Date.now();
	}

	/**
	 * Acquire a token for making a request.
	 * Returns immediately if tokens are available, otherwise waits.
	 */
	async acquire(): Promise<void> {
		this.refill();

		if (this.tokens > 0) {
			this.tokens--;
			return;
		}

		const waitTime = this.config.intervalMs - (Date.now() - this.lastRefill);
		if (waitTime > 0) {
			await this.sleep(waitTime);
			this.refill();
		}

		this.tokens--;
	}

	private refill(): void {
		const now = Date.now();
		const elapsed = now - this.lastRefill;

		if (elapsed >= this.config.intervalMs) {
			this.tokens = this.config.maxRequests;
			this.lastRefill = now;
		}
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
