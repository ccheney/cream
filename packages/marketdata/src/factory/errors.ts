/**
 * Error thrown when market data provider is not configured.
 */
export class MarketDataConfigError extends Error {
	constructor(
		public readonly provider: string,
		public readonly missingVar: string,
	) {
		super(`Market data provider "${provider}" requires ${missingVar} environment variable.`);
		this.name = "MarketDataConfigError";
	}
}
