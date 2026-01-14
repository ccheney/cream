/**
 * Event Normalizer Types
 *
 * Type definitions for WebSocket message processing and normalized events.
 */

export interface WebSocketMessage {
	type: string;
	data?: unknown;
	cycleId?: string;
}

export type EventType =
	| "quote"
	| "trade"
	| "options_quote"
	| "options_trade"
	| "decision"
	| "order"
	| "fill"
	| "reject"
	| "alert"
	| "agent"
	| "cycle"
	| "backtest"
	| "system";

export type EventColor = "profit" | "loss" | "neutral" | "accent";

export interface NormalizedEvent {
	id: string;
	timestamp: Date;
	type: EventType;
	icon: string;
	symbol: string;
	contractSymbol?: string;
	title: string;
	details: string;
	color: EventColor;
	raw?: unknown;
}

export const EVENT_ICONS: Record<EventType, string> = {
	quote: "●",
	trade: "◆",
	options_quote: "●",
	options_trade: "◇",
	decision: "★",
	order: "◉",
	fill: "✓",
	reject: "✗",
	alert: "⚠",
	agent: "◈",
	cycle: "↻",
	backtest: "▶",
	system: "⚙",
};

export const EVENT_TYPE_COLORS: Record<EventType, string> = {
	quote: "text-blue-500",
	trade: "text-cyan-500",
	options_quote: "text-purple-500",
	options_trade: "text-violet-500",
	decision: "text-green-500",
	order: "text-orange-500",
	fill: "text-emerald-500",
	reject: "text-red-500",
	alert: "text-amber-500",
	agent: "text-indigo-500",
	cycle: "text-teal-500",
	backtest: "text-sky-500",
	system: "text-gray-500",
};

export const VALUE_COLORS: Record<EventColor, string> = {
	profit: "text-green-500",
	loss: "text-red-500",
	neutral: "text-stone-600 dark:text-night-200 dark:text-night-400",
	accent: "text-purple-500",
};

export interface QuoteData {
	symbol: string;
	bid: number;
	ask: number;
	last?: number;
}

export interface TradeData {
	sym: string;
	p: number;
	s: number;
	x?: number;
}

export interface AggregateData {
	symbol: string;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
}

export interface OptionsQuoteData {
	contract: string;
	underlying: string;
	bid: number;
	ask: number;
	last: number;
}

export interface OptionsTradeData {
	contract: string;
	underlying: string;
	price: number;
	size: number;
}

export interface DecisionData {
	instrument?: { symbol?: string };
	action?: string;
	consensus?: { total?: number; agreeing?: number };
}

export interface DecisionPlanData {
	symbol?: string;
	action?: string;
	direction?: string;
}

export interface OrderData {
	symbol?: string;
	side?: string;
	qty?: number;
	status?: string;
	avgFillPrice?: number;
}

export interface AlertData {
	severity?: string;
	title?: string;
	message?: string;
	symbol?: string;
}

export interface AgentOutputData {
	agentType?: string;
	status?: string;
	symbol?: string;
}

export interface AgentToolCallData {
	agentType?: string;
	toolName?: string;
	symbol?: string;
}

export interface AgentToolResultData {
	agentType?: string;
	toolName?: string;
	symbol?: string;
	success?: boolean;
}

export interface AgentReasoningData {
	agentType?: string;
	text?: string;
	symbol?: string;
}

export interface AgentTextDeltaData {
	agentType?: string;
	text?: string;
	symbol?: string;
}

export interface AgentStatusData {
	type?: string;
	displayName?: string;
	status?: string;
	symbol?: string;
}

export interface CycleProgressData {
	phase?: string;
	progress?: number;
	symbol?: string;
}

export interface CycleResultData {
	cycleId?: string;
	status?: string;
	symbol?: string;
	decisionsCount?: number;
}

export interface BacktestStartedData {
	backtestId?: string;
	symbol?: string;
}

export interface BacktestProgressData {
	backtestId?: string;
	progress?: number;
	currentDate?: string;
}

export interface BacktestTradeData {
	symbol?: string;
	side?: string;
	quantity?: number;
	price?: number;
}

export interface BacktestEquityData {
	equity?: number;
	date?: string;
}

export interface BacktestCompletedData {
	backtestId?: string;
	totalReturn?: number;
	sharpe?: number;
}

export interface BacktestErrorData {
	backtestId?: string;
	error?: string;
}
