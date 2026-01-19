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
	/** Pattern Day Trader (PDT) status information */
	pdt: PdtStatus;
}

/**
 * Pattern Day Trader (PDT) status for the account.
 *
 * FINRA Rule 4210 restricts accounts under $25,000 equity to 3 day trades
 * per rolling 5 business day period.
 */
export interface PdtStatus {
	/** Number of day trades used in rolling 5-day window */
	dayTradeCount: number;
	/** Remaining day trades available (-1 = unlimited when above $25k) */
	remainingDayTrades: number;
	/** Whether the account is flagged as pattern day trader by the broker */
	isPatternDayTrader: boolean;
	/** Whether the account is under the $25k PDT threshold */
	isUnderThreshold: boolean;
	/** Previous day's closing equity */
	lastEquity: number;
	/** Day trading buying power (4x equity for PDT accounts) */
	daytradingBuyingPower: number;
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

// ============================================
// Enriched Position Types
// ============================================

export interface PositionStrategy {
	strategyFamily: string | null;
	timeHorizon: string | null;
	confidenceScore: number | null;
	riskScore: number | null;
	rationale: string | null;
	bullishFactors: string[];
	bearishFactors: string[];
}

export interface PositionRiskParams {
	stopPrice: number | null;
	targetPrice: number | null;
	entryPrice: number | null;
}

export interface PositionThesisContext {
	thesisId: string | null;
	state: string | null;
	entryThesis: string | null;
	invalidationConditions: string | null;
	conviction: number | null;
}

export interface EnrichedPortfolioPosition extends PortfolioPosition {
	positionId: string | null;
	decisionId: string | null;
	openedAt: string | null;
	holdingDays: number | null;
	strategy: PositionStrategy | null;
	riskParams: PositionRiskParams | null;
	thesis: PositionThesisContext | null;
}

export interface EnrichedPortfolioStateResponse {
	positions: EnrichedPortfolioPosition[];
	buyingPower: number;
	totalEquity: number;
	dayPnL: number;
	totalPnL: number;
	pdt: PdtStatus;
}
