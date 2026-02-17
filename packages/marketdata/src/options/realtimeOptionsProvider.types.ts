export interface OptionsDataProvider {
	getImpliedVolatility(symbol: string): Promise<number | null>;
	getIVSkew(symbol: string): Promise<number | null>;
	getPutCallRatio(symbol: string): Promise<number | null>;
}

export interface OptionQuoteData {
	symbol: string;
	bidPrice: number;
	askPrice: number;
	bidSize: number;
	askSize: number;
	timestamp: number;
	iv: number | null;
}

export interface OptionTradeData {
	symbol: string;
	price: number;
	size: number;
	timestamp: number;
}

export interface UnderlyingData {
	price: number;
	lastUpdate: number;
}

export interface SubscriptionState {
	underlying: string;
	optionSymbols: Set<string>;
	quotes: Map<string, OptionQuoteData>;
	trades: OptionTradeData[];
	lastSubscribeTime: number;
}

export interface RealtimeOptionsProviderConfig {
	riskFreeRate?: number;
	maxDte?: number;
	minDte?: number;
	staleThresholdMs?: number;
	tradeRetentionMs?: number;
}

export const DEFAULT_CONFIG: Required<RealtimeOptionsProviderConfig> = {
	riskFreeRate: 0.05,
	maxDte: 60,
	minDte: 1,
	staleThresholdMs: 60_000,
	tradeRetentionMs: 3600_000,
};
