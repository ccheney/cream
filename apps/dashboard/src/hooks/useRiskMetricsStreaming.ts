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

export interface UseRiskMetricsStreamingOptions {
	/** Performance metrics from REST API */
	performanceMetrics?: PerformanceMetrics;
	/** Streaming portfolio state from usePortfolioStreaming */
	portfolioState: PortfolioStreamingState;
	/** Account data for peak tracking initialization */
	initialEquity?: number;
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
	// Initialize with the higher of initial equity or max drawdown-derived peak
	const peakNavRef = useRef<number>(0);

	const metrics = useMemo((): StreamingRiskMetrics => {
		// Use API metrics for historical values
		const sharpeRatio = performanceMetrics?.sharpeRatio ?? 0;
		const sortinoRatio = performanceMetrics?.sortinoRatio ?? 0;
		const winRate = performanceMetrics?.winRate ?? 0;
		const profitFactor = performanceMetrics?.profitFactor ?? 0;

		// Max drawdown comes from historical data
		const maxDrawdownPct = performanceMetrics?.maxDrawdownPct ?? 0;

		// Calculate current drawdown in real-time using streaming NAV
		const currentNav = portfolioState.liveNav;

		// Initialize or update peak NAV
		if (peakNavRef.current === 0) {
			// First run: initialize peak from API data or initial equity
			// If we have max drawdown data, we can estimate historical peak
			if (performanceMetrics && performanceMetrics.maxDrawdownPct < 0) {
				// maxDrawdownPct is negative (e.g., -1.17%)
				// peak = currentNav / (1 + maxDrawdownPct/100) at the time of max DD
				// But we don't know current vs max DD timing, so use initial equity as baseline
				peakNavRef.current = Math.max(initialEquity, currentNav);
			} else {
				peakNavRef.current = Math.max(initialEquity, currentNav);
			}
		}

		// Update peak if current NAV is higher
		if (currentNav > peakNavRef.current) {
			peakNavRef.current = currentNav;
		}

		// Calculate current drawdown as negative percentage
		// Formula: -((peak - current) / peak) * 100
		// Result: 0% at peak, -5% when 5% below peak, etc.
		let currentDrawdownPct = 0;
		if (peakNavRef.current > 0 && currentNav > 0) {
			const drawdownFromPeak = peakNavRef.current - currentNav;
			currentDrawdownPct = -(drawdownFromPeak / peakNavRef.current) * 100;
		}

		// If API provides current drawdown and we don't have streaming data yet, use API value
		if (!portfolioState.isStreaming && performanceMetrics) {
			currentDrawdownPct = performanceMetrics.currentDrawdownPct;
		}

		return {
			sharpeRatio,
			sortinoRatio,
			maxDrawdownPct,
			currentDrawdownPct,
			winRate,
			profitFactor,
			isStreaming: portfolioState.isStreaming,
		};
	}, [performanceMetrics, portfolioState, initialEquity]);

	return metrics;
}

export default useRiskMetricsStreaming;
