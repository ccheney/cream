/**
 * Tool Types
 *
 * Shared type definitions for agent tools.
 */

export interface Quote {
	symbol: string;
	bid: number;
	ask: number;
	last: number;
	volume: number;
	timestamp: string;
}

export interface PortfolioStateResponse {
	positions: PortfolioPosition[];
	buyingPower: number;
	totalEquity: number;
	dayPnL: number;
	totalPnL: number;
}

export interface PortfolioPosition {
	symbol: string;
	quantity: number;
	averageCost: number;
	marketValue: number;
	unrealizedPnL: number;
}

export interface OptionChainResponse {
	underlying: string;
	expirations: OptionExpiration[];
}

export interface OptionExpiration {
	expiration: string;
	calls: OptionContract[];
	puts: OptionContract[];
}

export interface OptionContract {
	symbol: string;
	strike: number;
	expiration: string;
	type: "call" | "put";
	bid: number;
	ask: number;
	last: number;
	volume: number;
	openInterest: number;
}

export interface Greeks {
	delta: number;
	gamma: number;
	theta: number;
	vega: number;
	rho: number;
	iv: number;
}

export interface IndicatorResult {
	indicator: string;
	symbol: string;
	values: number[];
	timestamps: string[];
}

export interface EconomicEvent {
	id: string;
	name: string;
	date: string;
	time: string;
	impact: "high" | "medium" | "low";
	forecast: string | null;
	previous: string | null;
	actual: string | null;
}

export interface HelixQueryResult {
	nodes: unknown[];
	edges: unknown[];
	metadata: Record<string, unknown>;
}
