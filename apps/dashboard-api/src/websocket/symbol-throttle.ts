/**
 * Tracks per-symbol send times for quote throttling.
 */
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
