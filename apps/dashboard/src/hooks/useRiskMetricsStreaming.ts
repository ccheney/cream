/**
 * useRiskMetricsStreaming Hook
 *
 * Provides real-time risk metrics by combining:
 * - Historical metrics from REST API (sharpe, sortino, max DD, win rate, profit factor)
 * - Real-time current drawdown calculated from streaming NAV
 *
 * @see docs/plans/ui/40-streaming-data-integration.md
 */

import { useMemo, useRef } from "react";
import type { PerformanceMetrics } from "@/lib/api/types";
import type { PortfolioStreamingState } from "./usePortfolioStreaming";

export interface StreamingRiskMetrics {
	sharpeRatio: number;
	sortinoRatio: number;
	maxDrawdownPct: number;
	currentDrawdownPct: number;
	winRate: number;
	profitFactor: number;
	isStreaming: boolean;
}

type MinimalPerformanceMetrics = Pick<
	PerformanceMetrics,
	| "sharpeRatio"
	| "sortinoRatio"
	| "maxDrawdownPct"
	| "winRate"
	| "profitFactor"
	| "currentDrawdownPct"
>;

export interface UseRiskMetricsStreamingOptions {
	/** Performance metrics from REST API */
	performanceMetrics?: PerformanceMetrics;
	/** Streaming portfolio state from usePortfolioStreaming */
	portfolioState: PortfolioStreamingState;
	/** Account data for peak tracking initialization */
	initialEquity?: number;
}

const FALLBACK_PERFORMANCE_METRICS: Pick<
	PerformanceMetrics,
	| "sharpeRatio"
	| "sortinoRatio"
	| "maxDrawdownPct"
	| "winRate"
	| "profitFactor"
	| "currentDrawdownPct"
> = {
	sharpeRatio: 0,
	sortinoRatio: 0,
	maxDrawdownPct: 0,
	winRate: 0,
	profitFactor: 0,
	currentDrawdownPct: 0,
};

function buildFallbackPortfolioState(): PortfolioStreamingState {
	return {
		liveNav: 0,
		liveTotalPnl: 0,
		liveTotalPnlPct: 0,
		liveDayPnl: 0,
		liveDayPnlPct: 0,
		isStreaming: false,
		lastUpdated: null,
	};
}

function getHistoricalMetrics(
	performanceMetrics: MinimalPerformanceMetrics,
): Pick<
	StreamingRiskMetrics,
	"sharpeRatio" | "sortinoRatio" | "maxDrawdownPct" | "winRate" | "profitFactor"
> {
	return {
		sharpeRatio: performanceMetrics.sharpeRatio,
		sortinoRatio: performanceMetrics.sortinoRatio,
		maxDrawdownPct: performanceMetrics.maxDrawdownPct,
		winRate: performanceMetrics.winRate,
		profitFactor: performanceMetrics.profitFactor,
	};
}

function calculatePeakNav(
	peakNavRef: { current: number },
	currentNav: number,
	initialEquity: number,
): number {
	if (peakNavRef.current === 0) {
		peakNavRef.current = Math.max(initialEquity, currentNav);
		return peakNavRef.current;
	}

	if (currentNav > peakNavRef.current) {
		peakNavRef.current = currentNav;
	}

	return peakNavRef.current;
}

function calculateRealTimeDrawdown(peakNav: number, currentNav: number): number {
	if (peakNav <= 0 || currentNav <= 0) {
		return 0;
	}
	return -((peakNav - currentNav) / peakNav) * 100;
}

function buildStreamingRiskMetrics(
	performanceMetrics: MinimalPerformanceMetrics,
	portfolioState: PortfolioStreamingState,
	initialEquity: number,
	peakNavRef: { current: number },
): StreamingRiskMetrics {
	const historical = getHistoricalMetrics(performanceMetrics);
	const currentNav = portfolioState.liveNav;
	const peakNav = calculatePeakNav(peakNavRef, currentNav, initialEquity);
	const currentDrawdownFromStreaming = calculateRealTimeDrawdown(peakNav, currentNav);
	const currentDrawdownPct = !portfolioState.isStreaming
		? performanceMetrics.currentDrawdownPct
		: currentDrawdownFromStreaming;

	return {
		...historical,
		currentDrawdownPct,
		isStreaming: portfolioState.isStreaming,
	};
}

/**
 * Hook to calculate real-time risk metrics using streaming NAV data.
 *
 * Current drawdown is calculated in real-time as: (peak - currentNAV) / peak
 * Other metrics come from the REST API as they depend on historical data.
 */
export function useRiskMetricsStreaming({
	performanceMetrics,
	portfolioState,
	initialEquity = 100000,
}: UseRiskMetricsStreamingOptions): StreamingRiskMetrics {
	// Track the peak NAV seen during this session for accurate drawdown calculation
	// Initialize with the higher of initial equity or max drawdown-derived peak.
	const peakNavRef = useRef<number>(0);
	const safePerformanceMetrics = performanceMetrics ?? FALLBACK_PERFORMANCE_METRICS;
	const safePortfolioState = portfolioState ?? buildFallbackPortfolioState();
	const safeInitialEquity =
		Number.isFinite(initialEquity) && initialEquity > 0 ? initialEquity : 100000;

	const { sharpeRatio, sortinoRatio, maxDrawdownPct, winRate, profitFactor, currentDrawdownPct } =
		safePerformanceMetrics;

	const metrics = useMemo((): StreamingRiskMetrics => {
		return buildStreamingRiskMetrics(
			{
				sharpeRatio,
				sortinoRatio,
				maxDrawdownPct,
				winRate,
				profitFactor,
				currentDrawdownPct,
			},
			safePortfolioState,
			safeInitialEquity,
			peakNavRef,
		);
	}, [
		sharpeRatio,
		sortinoRatio,
		maxDrawdownPct,
		winRate,
		profitFactor,
		currentDrawdownPct,
		safeInitialEquity,
		safePortfolioState,
	]);

	return metrics;
}

export default useRiskMetricsStreaming;
