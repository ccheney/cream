/**
 * Exponential backoff calculator for retries.
 */
export class RetryBackoff {
	private attempt = 0;
	private readonly baseDelayMs: number;
	private readonly maxDelayMs: number;
	private readonly jitterFactor: number;

	constructor(options?: {
		baseDelayMs?: number;
		maxDelayMs?: number;
		jitterFactor?: number;
	}) {
		this.baseDelayMs = options?.baseDelayMs ?? 100;
		this.maxDelayMs = options?.maxDelayMs ?? 30000;
		this.jitterFactor = options?.jitterFactor ?? 0.2;
	}

	/**
	 * Get next backoff delay in milliseconds.
	 */
	nextDelay(): number {
		const exponentialDelay = this.baseDelayMs * 2 ** this.attempt;
		const cappedDelay = Math.min(exponentialDelay, this.maxDelayMs);
		const jitterRange = cappedDelay * this.jitterFactor;
		const jitter = (Math.random() * 2 - 1) * jitterRange;

		this.attempt++;
		return Math.max(0, cappedDelay + jitter);
	}

	/**
	 * Reset backoff state.
	 */
	reset(): void {
		this.attempt = 0;
	}

	/**
	 * Get current attempt number.
	 */
	getAttempt(): number {
		return this.attempt;
	}
}
