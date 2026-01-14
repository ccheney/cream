/**
 * Synthesis Query Hooks
 *
 * TanStack Query hooks for fetching synthesis pipeline status
 * and history from the dashboard API.
 *
 * @see docs/plans/36-dynamic-indicator-synthesis-workflow.md
 */

import type { SynthesisHistoryResponse, SynthesisStatusResponse } from "@cream/dashboard-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { get, post } from "@/lib/api/client";
import { CACHE_TIMES, STALE_TIMES } from "@/lib/api/query-client";

// ============================================
// Query Keys
// ============================================

export const synthesisKeys = {
	all: ["synthesis"] as const,
	status: () => [...synthesisKeys.all, "status"] as const,
	history: (limit?: number) => [...synthesisKeys.all, "history", limit] as const,
};

// ============================================
// Status Hook
// ============================================

/**
 * Fetch current synthesis pipeline status.
 *
 * Returns trigger status, active synthesis workflow (if any),
 * and recent activity.
 *
 * Polls every 60 seconds for real-time updates.
 */
export function useSynthesisStatus() {
	return useQuery({
		queryKey: synthesisKeys.status(),
		queryFn: async () => {
			const { data } = await get<SynthesisStatusResponse>("/api/indicators/synthesis/status");
			return data;
		},
		staleTime: STALE_TIMES.DEFAULT, // 30 seconds
		gcTime: CACHE_TIMES.DEFAULT,
		refetchInterval: 60_000, // Poll every minute
	});
}

// ============================================
// History Hook
// ============================================

/**
 * Fetch synthesis attempt history.
 *
 * Returns list of synthesized indicators with their
 * lifecycle status and 30-day rolling IC.
 */
export function useSynthesisHistory(limit = 20) {
	return useQuery({
		queryKey: synthesisKeys.history(limit),
		queryFn: async () => {
			const { data } = await get<{ history: SynthesisHistoryResponse["history"] }>(
				`/api/indicators/synthesis/history?limit=${limit}`
			);
			return data.history;
		},
		staleTime: STALE_TIMES.DEFAULT,
		gcTime: CACHE_TIMES.DEFAULT,
	});
}

// ============================================
// Trigger Mutation
// ============================================

export interface TriggerSynthesisInput {
	reason?: string;
	regime?: string;
}

export interface TriggerSynthesisResult {
	success: boolean;
	indicatorId?: string;
	indicatorName?: string;
	status: string;
	message: string;
	phases: {
		hypothesisGenerated: boolean;
		implementationSucceeded: boolean;
		validationPassed: boolean;
		paperTradingStarted: boolean;
	};
}

/**
 * Manually trigger indicator synthesis.
 *
 * Starts the synthesis workflow with optional reason and regime parameters.
 * Invalidates status and history queries on success.
 */
export function useTriggerSynthesis() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (input: TriggerSynthesisInput): Promise<TriggerSynthesisResult> => {
			const { data } = await post<TriggerSynthesisResult>(
				"/api/indicators/synthesis/trigger",
				input
			);
			return data;
		},
		onSuccess: () => {
			// Invalidate related queries
			queryClient.invalidateQueries({ queryKey: synthesisKeys.status() });
			queryClient.invalidateQueries({ queryKey: synthesisKeys.history() });
		},
	});
}
