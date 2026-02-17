import type { decisions } from "../schema/core-trading";

export type DecisionStatus =
	| "pending"
	| "approved"
	| "rejected"
	| "executed"
	| "cancelled"
	| "expired";

export type DecisionAction = "BUY" | "SELL" | "HOLD" | "CLOSE" | "INCREASE" | "REDUCE" | "NO_TRADE";
export type SizeUnit = "SHARES" | "CONTRACTS" | "DOLLARS" | "PCT_EQUITY";
export type DecisionDirection = "LONG" | "SHORT" | "FLAT";

export interface Decision {
	id: string;
	cycleId: string;
	symbol: string;
	action: DecisionAction;
	direction: DecisionDirection;
	size: number;
	sizeUnit: SizeUnit;
	entryPrice: number | null;
	stopPrice: number | null;
	targetPrice: number | null;
	status: DecisionStatus;
	strategyFamily: string | null;
	timeHorizon: string | null;
	rationale: string | null;
	bullishFactors: string[];
	bearishFactors: string[];
	confidenceScore: number | null;
	riskScore: number | null;
	metadata: Record<string, unknown>;
	environment: string;
	createdAt: string;
	updatedAt: string;
}

export interface CreateDecisionInput {
	id?: string;
	cycleId: string;
	symbol: string;
	action: DecisionAction;
	direction: DecisionDirection;
	size: number;
	sizeUnit?: SizeUnit;
	entryPrice?: number | null;
	stopPrice?: number | null;
	targetPrice?: number | null;
	status?: DecisionStatus;
	strategyFamily?: string | null;
	timeHorizon?: string | null;
	rationale?: string | null;
	bullishFactors?: string[];
	bearishFactors?: string[];
	confidenceScore?: number | null;
	riskScore?: number | null;
	metadata?: Record<string, unknown>;
	environment: string;
}

export interface DecisionFilters {
	symbol?: string;
	status?: DecisionStatus | DecisionStatus[];
	action?: DecisionAction;
	direction?: DecisionDirection;
	environment?: string;
	cycleId?: string;
	fromDate?: string;
	toDate?: string;
}

export interface DecisionAnalytics {
	totalDecisions: number;
	executionRate: number;
	statusDistribution: Record<string, number>;
	actionDistribution: Record<string, number>;
	directionDistribution: Record<string, number>;
	avgConfidence: number | null;
	avgRisk: number | null;
}

export interface ConfidenceCalibrationBin {
	bin: string;
	total: number;
	executed: number;
	executionRate: number;
}

export interface StrategyBreakdownItem {
	strategyFamily: string;
	count: number;
	executedCount: number;
	approvalRate: number;
	avgConfidence: number | null;
	avgRisk: number | null;
}

type DecisionRow = typeof decisions.$inferSelect;

export function mapDecisionRow(row: DecisionRow): Decision {
	return {
		id: row.id,
		cycleId: row.cycleId,
		symbol: row.symbol,
		action: row.action as DecisionAction,
		direction: row.direction as DecisionDirection,
		size: Number(row.size),
		sizeUnit: row.sizeUnit as SizeUnit,
		entryPrice: row.entryPrice ? Number(row.entryPrice) : null,
		stopPrice: row.stopPrice ? Number(row.stopPrice) : null,
		targetPrice: row.targetPrice ? Number(row.targetPrice) : null,
		status: row.status as DecisionStatus,
		strategyFamily: row.strategyFamily,
		timeHorizon: row.timeHorizon,
		rationale: row.rationale,
		bullishFactors: (row.bullishFactors as string[]) ?? [],
		bearishFactors: (row.bearishFactors as string[]) ?? [],
		confidenceScore: row.confidenceScore ? Number(row.confidenceScore) : null,
		riskScore: row.riskScore ? Number(row.riskScore) : null,
		metadata: (row.metadata as Record<string, unknown>) ?? {},
		environment: row.environment,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}
