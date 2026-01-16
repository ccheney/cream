/**
 * System status and health types.
 */

import type { Environment } from "./common";

export type SystemStatusType = "running" | "paused" | "stopped" | "error";

export interface Alert {
	id: string;
	severity: "critical" | "warning" | "info";
	type: string;
	message: string;
	details?: Record<string, unknown>;
	acknowledged: boolean;
	createdAt: string;
}

export interface RunningCycle {
	cycleId: string;
	status: "queued" | "running" | "completed" | "failed";
	startedAt: string;
	phase: "observe" | "orient" | "decide" | "act" | "complete" | null;
}

export interface SystemStatus {
	environment: Environment;
	status: SystemStatusType;
	lastCycleId: string | null;
	lastCycleTime: string | null;
	nextCycleTime: string | null;
	positionCount: number;
	openOrderCount: number;
	alerts: Alert[];
	runningCycle: RunningCycle | null;
}

export interface StartRequest {
	environment?: Environment;
}

export interface StopRequest {
	closeAllPositions?: boolean;
}

export interface EnvironmentRequest {
	environment: Environment;
	confirmLive?: boolean;
}

export interface HealthResponse {
	status: "healthy" | "degraded" | "unhealthy";
	services: Record<string, { status: string; latencyMs?: number }>;
	timestamp: string;
}

export interface TriggerCycleRequest {
	environment: Environment;
	useDraftConfig?: boolean;
	symbols?: string[];
	confirmLive?: boolean;
}

export interface TriggerCycleResponse {
	cycleId: string;
	status: "queued" | "running" | "completed" | "failed";
	environment: Environment;
	configVersion: string;
	startedAt: string;
}

export type CyclePhase = "OBSERVE" | "ORIENT" | "DECIDE" | "ACT" | "COMPLETE";

export interface CycleProgress {
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

export interface DecisionSummaryBrief {
	symbol: string;
	action: "BUY" | "SELL" | "HOLD";
	direction: "LONG" | "SHORT" | "FLAT";
	confidence: number;
}

export interface OrderSummaryBrief {
	orderId: string;
	symbol: string;
	side: "buy" | "sell";
	quantity: number;
	status: "submitted" | "filled" | "rejected";
}

export interface CycleResult {
	cycleId: string;
	environment: Environment;
	status: "completed" | "failed";
	result?: {
		approved: boolean;
		iterations: number;
		decisions: DecisionSummaryBrief[];
		orders: OrderSummaryBrief[];
	};
	error?: string;
	durationMs: number;
	configVersion?: string;
	timestamp: string;
}
