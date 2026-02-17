import type { cycleEvents, cycles } from "../schema/core-trading";

export type CycleStatus = "running" | "completed" | "failed";
export type CyclePhase = "observe" | "orient" | "decide" | "act" | "complete";

export interface DecisionSummary {
	symbol: string;
	action: "BUY" | "SELL" | "HOLD";
	direction: "LONG" | "SHORT" | "FLAT";
	confidence: number;
}

export interface OrderSummary {
	orderId: string;
	symbol: string;
	side: "buy" | "sell";
	quantity: number;
	status: "submitted" | "filled" | "rejected";
}

export interface Cycle {
	id: string;
	environment: string;
	status: CycleStatus;
	startedAt: string;
	completedAt: string | null;
	durationMs: number | null;
	currentPhase: CyclePhase | null;
	phaseStartedAt: string | null;
	totalSymbols: number;
	completedSymbols: number;
	progressPct: number;
	approved: boolean | null;
	iterations: number | null;
	decisionsCount: number;
	ordersCount: number;
	decisions: DecisionSummary[];
	orders: OrderSummary[];
	errorMessage: string | null;
	errorStack: string | null;
	configVersion: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface CreateCycleInput {
	id?: string;
	environment: string;
	totalSymbols?: number;
	configVersion?: string;
}

export interface UpdateCycleInput {
	status?: CycleStatus;
	completedAt?: string;
	durationMs?: number;
	currentPhase?: CyclePhase;
	phaseStartedAt?: string;
	completedSymbols?: number;
	progressPct?: number;
	approved?: boolean;
	iterations?: number;
	decisionsCount?: number;
	ordersCount?: number;
	decisions?: DecisionSummary[];
	orders?: OrderSummary[];
	errorMessage?: string;
	errorStack?: string;
}

export type CycleEventType =
	| "phase_change"
	| "agent_start"
	| "agent_complete"
	| "decision"
	| "order"
	| "error"
	| "progress"
	| "tool_call"
	| "tool_result"
	| "reasoning_delta"
	| "text_delta";

export interface CycleEvent {
	id: number;
	cycleId: string;
	eventType: CycleEventType;
	phase: CyclePhase | null;
	agentType: string | null;
	symbol: string | null;
	message: string | null;
	data: Record<string, unknown>;
	timestamp: string;
	durationMs: number | null;
}

export interface CreateCycleEventInput {
	cycleId: string;
	eventType: CycleEventType;
	phase?: CyclePhase;
	agentType?: string;
	symbol?: string;
	message?: string;
	data?: Record<string, unknown>;
	durationMs?: number;
}

export interface PaginationOptions {
	page?: number;
	pageSize?: number;
}

export interface PaginatedResult<T> {
	data: T[];
	total: number;
	page: number;
	pageSize: number;
	totalPages: number;
}

export interface ReconstructedToolCall {
	toolCallId: string;
	toolName: string;
	toolArgs: string;
	status: "pending" | "complete" | "error";
	resultSummary?: string;
	durationMs?: number;
	timestamp: string;
}

export interface ReconstructedAgentState {
	status: "idle" | "processing" | "complete" | "error";
	toolCalls: ReconstructedToolCall[];
	reasoningText: string;
	textOutput: string;
	error?: string;
	lastUpdate: string | null;
	startedAt: string | null;
}

export interface ReconstructedStreamingState {
	agents: Record<string, ReconstructedAgentState>;
	cycleId: string;
}

export interface CycleAnalyticsFilters {
	environment?: string;
	status?: CycleStatus;
	fromDate?: string;
	toDate?: string;
}

export interface CycleAnalytics {
	totalCycles: number;
	completionRate: number;
	approvalRate: number;
	avgDurationMs: number | null;
	totalDecisions: number;
	totalOrders: number;
	statusDistribution: Record<string, number>;
}

type CycleRow = typeof cycles.$inferSelect;
type CycleEventRow = typeof cycleEvents.$inferSelect;

export function mapCycleRow(row: CycleRow): Cycle {
	return {
		id: row.id,
		environment: row.environment,
		status: row.status as CycleStatus,
		startedAt: row.startedAt.toISOString(),
		completedAt: row.completedAt?.toISOString() ?? null,
		durationMs: row.durationMs,
		currentPhase: row.currentPhase as CyclePhase | null,
		phaseStartedAt: row.phaseStartedAt?.toISOString() ?? null,
		totalSymbols: row.totalSymbols ?? 0,
		completedSymbols: row.completedSymbols ?? 0,
		progressPct: row.progressPct ? Number(row.progressPct) : 0,
		approved: row.approved,
		iterations: row.iterations,
		decisionsCount: row.decisionsCount ?? 0,
		ordersCount: row.ordersCount ?? 0,
		decisions: (row.decisionsJson as DecisionSummary[]) ?? [],
		orders: (row.ordersJson as OrderSummary[]) ?? [],
		errorMessage: row.errorMessage,
		errorStack: row.errorStack,
		configVersion: row.configVersion,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

export function mapCycleEventRow(row: CycleEventRow): CycleEvent {
	return {
		id: row.id,
		cycleId: row.cycleId,
		eventType: row.eventType as CycleEventType,
		phase: row.phase as CyclePhase | null,
		agentType: row.agentType,
		symbol: row.symbol,
		message: row.message,
		data: (row.dataJson as Record<string, unknown>) ?? {},
		timestamp: row.timestamp.toISOString(),
		durationMs: row.durationMs,
	};
}
