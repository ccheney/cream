/**
 * Cycle History Query Hooks
 *
 * TanStack Query hooks for fetching cycle history and full cycle data.
 */

import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api/client";
import { CACHE_TIMES, queryKeys, STALE_TIMES } from "@/lib/api/query-client";

// ============================================
// Types
// ============================================

export interface CycleListItem {
	id: string;
	environment: string;
	status: "running" | "completed" | "failed";
	startedAt: string;
	completedAt: string | null;
	durationMs: number | null;
	decisionsCount: number;
	approved: boolean | null;
	configVersion: string | null;
}

export interface CycleListResponse {
	data: CycleListItem[];
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
}

export interface FullCycleResponse {
	cycle: CycleListItem & {
		currentPhase: string | null;
		progressPct: number;
		iterations: number | null;
		errorMessage: string | null;
	};
	streamingState: Record<string, ReconstructedAgentState>;
}

export interface CycleListFilters {
	environment?: "BACKTEST" | "PAPER" | "LIVE";
	status?: "running" | "completed" | "failed";
	page?: number;
	pageSize?: number;
}

// ============================================
// Hooks
// ============================================

/**
 * Fetch list of cycles with pagination and filters.
 */
export function useCycleHistory(filters?: CycleListFilters) {
	const queryParams = new URLSearchParams();
	if (filters?.environment) {
		queryParams.set("environment", filters.environment);
	}
	if (filters?.status) {
		queryParams.set("status", filters.status);
	}
	if (filters?.page) {
		queryParams.set("page", String(filters.page));
	}
	if (filters?.pageSize) {
		queryParams.set("pageSize", String(filters.pageSize));
	}

	const queryString = queryParams.toString();
	const url = `/api/system/cycles${queryString ? `?${queryString}` : ""}`;

	return useQuery({
		queryKey: queryKeys.cycles.list(filters as Record<string, unknown> | undefined),
		queryFn: async () => {
			const { data } = await get<CycleListResponse>(url);
			return data;
		},
		staleTime: STALE_TIMES.HISTORICAL,
		gcTime: CACHE_TIMES.HISTORICAL,
	});
}

/**
 * Fetch full cycle data including reconstructed streaming state.
 */
export function useFullCycle(cycleId: string | null) {
	return useQuery({
		queryKey: queryKeys.cycles.full(cycleId ?? ""),
		queryFn: async () => {
			const { data } = await get<FullCycleResponse>(`/api/system/cycles/${cycleId}/full`);
			return data;
		},
		staleTime: STALE_TIMES.HISTORICAL,
		gcTime: CACHE_TIMES.HISTORICAL,
		enabled: Boolean(cycleId),
	});
}
