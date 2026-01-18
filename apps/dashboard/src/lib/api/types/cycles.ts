/**
 * Cycle Analytics Types
 *
 * Types for cycle-level analytics, decision metrics, and calibration data.
 */

export type AnalyticsPeriod = "1D" | "1W" | "1M" | "3M" | "1Y" | "ALL";

export interface CycleAnalyticsFilters {
	environment?: string;
	fromDate?: string;
	toDate?: string;
	period?: AnalyticsPeriod;
}

export interface CycleAnalyticsSummary {
	totalCycles: number;
	completionRate: number;
	approvalRate: number;
	avgDurationMs: number | null;
	totalDecisions: number;
	totalOrders: number;
	statusDistribution: Record<string, number>;
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
