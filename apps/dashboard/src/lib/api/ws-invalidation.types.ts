import type { CyclePhase } from "@/stores/cycle-store";

export type WSMessageType =
	| "quote"
	| "aggregate"
	| "options_quote"
	| "options_trade"
	| "options_aggregate"
	| "order"
	| "decision"
	| "agent_output"
	| "cycle_progress"
	| "cycle_result"
	| "alert"
	| "system_status"
	| "account_update"
	| "position_update"
	| "order_update"
	| "portfolio_update"
	| "portfolio"
	| "worker_run_update";

export interface WSMessage<T = unknown> {
	type: WSMessageType;
	data: T;
	timestamp?: string;
	invalidates?: string[];
}

export interface QuoteData {
	symbol: string;
	bid: number;
	ask: number;
	last: number;
	volume: number;
	timestamp: string;
	bidSize?: number;
	askSize?: number;
	prevClose?: number;
	changePercent?: number;
}

export interface AggregateData {
	symbol: string;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
	timestamp: string;
}

export interface Candle {
	timestamp: string;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
}

export interface OrderData {
	id: string;
	symbol: string;
	status: string;
	filledQty?: number;
	avgPrice?: number;
}

export interface DecisionData {
	id: string;
	symbol: string;
	action: string;
	status: string;
}

export interface AgentOutputData {
	decisionId: string;
	agentType: string;
	status: "processing" | "complete";
	vote?: "APPROVE" | "REJECT" | "ABSTAIN";
	confidence?: number;
	reasoning?: string;
	output?: string;
}

export interface CycleProgressData {
	cycleId: string;
	phase: CyclePhase;
	step: string;
	progress: number;
	message: string;
	activeSymbol?: string;
	totalSymbols?: number;
	completedSymbols?: number;
	startedAt?: string;
	estimatedCompletion?: string;
	timestamp: string;
}

export interface CycleResultData {
	cycleId: string;
	environment: string;
	status: "completed" | "failed";
	result?: {
		approved: boolean;
		iterations: number;
		decisions: unknown[];
		orders: unknown[];
	};
	error?: string;
	durationMs: number;
	configVersion?: string;
	timestamp: string;
}

export interface SystemStatusData {
	status: "running" | "paused" | "stopped" | "error";
	lastCycleId?: string;
	lastCycleTime?: string;
	nextCycleAt?: string;
}

export interface OptionsQuoteData {
	contract: string;
	underlying: string;
	bid: number;
	ask: number;
	bidSize?: number;
	askSize?: number;
	last?: number;
	timestamp: string;
}

export interface OptionsTradeData {
	contract: string;
	underlying: string;
	price: number;
	size: number;
	timestamp: string;
}
