/**
 * Portfolio and account types (positions, trades, performance, risk).
 */

import type {
	DecisionSummary,
	Position,
	ThesisDetail,
} from "./trading";

export interface PortfolioSummary {
	nav: number;
	cash: number;
	equity: number;
	buyingPower: number;
	grossExposure: number;
	netExposure: number;
	positionCount: number;
	todayPnl: number;
	todayPnlPct: number;
	totalPnl: number;
	totalPnlPct: number;
	lastUpdated: string;
}

export type AccountStatus =
	| "ACTIVE"
	| "SUBMITTED"
	| "APPROVAL_PENDING"
	| "APPROVED"
	| "REJECTED"
	| "CLOSED"
	| "DISABLED";

export interface Account {
	id: string;
	status: AccountStatus;
	currency: string;
	cash: number;
	portfolioValue: number;
	buyingPower: number;
	regtBuyingPower: number;
	daytradingBuyingPower: number;
	daytradeCount: number;
	patternDayTrader: boolean;
	tradingBlocked: boolean;
	transfersBlocked: boolean;
	accountBlocked: boolean;
	shortingEnabled: boolean;
	longMarketValue: number;
	shortMarketValue: number;
	equity: number;
	lastEquity: number;
	multiplier: number;
	initialMargin: number;
	maintenanceMargin: number;
	sma: number;
	createdAt: string;
}

export type PortfolioHistoryPeriod = "1D" | "1W" | "1M" | "3M" | "1A" | "all";

export type PortfolioHistoryTimeframe = "1Min" | "5Min" | "15Min" | "1H" | "1D";

export interface PortfolioHistory {
	timestamp: number[];
	equity: number[];
	profitLoss: number[];
	profitLossPct: number[];
	timeframe: PortfolioHistoryTimeframe;
	baseValue: number;
}

export interface Trade {
	id: string;
	timestamp: string;
	symbol: string;
	side: "BUY" | "SELL";
	qty: number;
	price: number;
	pnl: number | null;
}

export interface PositionDetail extends Position {
	trades: Trade[];
	relatedDecisions: DecisionSummary[];
	thesis: ThesisDetail | null;
}

export interface EquityPoint {
	timestamp: string;
	nav: number;
	drawdown: number;
	drawdownPct: number;
}

export interface PeriodMetrics {
	return: number;
	returnPct: number;
	trades: number;
	winRate: number;
}

export interface PerformanceMetrics {
	periods: {
		today: PeriodMetrics;
		week: PeriodMetrics;
		month: PeriodMetrics;
		threeMonth: PeriodMetrics;
		ytd: PeriodMetrics;
		oneYear: PeriodMetrics;
		total: PeriodMetrics;
	};
	volatility: {
		daily: number;
		annualized: number;
	};
	sharpeRatio: number;
	sortinoRatio: number;
	maxDrawdown: number;
	maxDrawdownPct: number;
	currentDrawdown: number;
	currentDrawdownPct: number;
	winRate: number;
	profitFactor: number;
	avgWin: number;
	avgLoss: number;
	totalTrades: number;
}

export interface ExposureMetrics {
	gross: { current: number; limit: number; pct: number };
	net: { current: number; limit: number; pct: number };
	long: number;
	short: number;
	concentrationMax: { symbol: string; pct: number };
	sectorExposure: Record<string, number>;
}

export interface PositionGreeks {
	symbol: string;
	delta: number;
	gamma: number;
	vega: number;
	theta: number;
}

export interface GreeksSummary {
	delta: { current: number; limit: number };
	gamma: { current: number; limit: number };
	vega: { current: number; limit: number };
	theta: { current: number; limit: number };
	byPosition: PositionGreeks[];
}

export interface CorrelationMatrix {
	symbols: string[];
	matrix: number[][];
	highCorrelationPairs: Array<{ a: string; b: string; correlation: number }>;
}

export interface VaRMetrics {
	oneDay95: number;
	oneDay99: number;
	tenDay95: number;
	method: "historical" | "parametric";
}

export type LimitStatusType = "ok" | "warning" | "critical";

export interface LimitStatus {
	name: string;
	category: "per_instrument" | "portfolio" | "options";
	current: number;
	limit: number;
	utilization: number;
	status: LimitStatusType;
}

export type { Position, DecisionSummary, ThesisDetail };
