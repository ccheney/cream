"use client";

/**
 * useCycleTraces Hook
 *
 * Fetches cycle trace data from OpenObserve via the dashboard-api proxy.
 * Uses TanStack Query with polling for active cycles.
 */

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/api/query-client";
import type { CycleData, CycleListItem } from "@/lib/api/types";
import { config } from "@/lib/config";

const API_BASE = `${config.api.baseUrl}/api/traces`;

// ============================================
// API Functions
// ============================================

async function fetchCycle(cycleId: string): Promise<CycleData | null> {
	const res = await fetch(`${API_BASE}/cycles/${cycleId}`, {
		credentials: "include",
	});
	if (!res.ok) {
		if (res.status === 404) return null;
		throw new Error(`Failed to fetch cycle: ${res.status}`);
	}
	return res.json();
}

async function fetchLatestCycle(): Promise<CycleData | null> {
	const res = await fetch(`${API_BASE}/cycles/latest`, {
		credentials: "include",
	});
	if (!res.ok) {
		throw new Error(`Failed to fetch latest cycle: ${res.status}`);
	}
	return res.json();
}

async function fetchCycleList(limit = 20): Promise<CycleListItem[]> {
	const res = await fetch(`${API_BASE}/cycles?limit=${limit}`, {
		credentials: "include",
	});
	if (!res.ok) {
		throw new Error(`Failed to fetch cycles: ${res.status}`);
	}
	return res.json();
}

// ============================================
// Hook
// ============================================

export interface UseCycleTracesReturn {
	/** Current cycle data */
	cycle: CycleData | null | undefined;
	/** Whether cycle data is loading */
	isLoading: boolean;
	/** Whether there was an error loading cycle data */
	isError: boolean;
	/** List of recent cycles for the selector */
	cycles: CycleListItem[];
	/** Whether cycles list is loading */
	isLoadingCycles: boolean;
	/** Manually refetch cycle data */
	refetch: () => void;
}

/**
 * Hook for fetching cycle trace data from OpenObserve.
 *
 * @param cycleId - Optional cycle ID. If not provided, fetches the latest cycle.
 * @returns Cycle data and list of recent cycles
 *
 * @example
 * ```tsx
 * const { cycle, cycles, isLoading } = useCycleTraces();
 * // or for a specific cycle:
 * const { cycle } = useCycleTraces("abc-123");
 * ```
 */
export function useCycleTraces(cycleId?: string): UseCycleTracesReturn {
	// Fetch specific cycle or latest
	const cycleQuery = useQuery({
		queryKey: cycleId ? queryKeys.traces.cycle(cycleId) : queryKeys.traces.latest(),
		queryFn: () => (cycleId ? fetchCycle(cycleId) : fetchLatestCycle()),
		refetchInterval: (query) => {
			// Poll every 2s if cycle is running, stop when complete
			const data = query.state.data;
			if (!data) return 5000; // Poll for data if none yet
			return data.status === "running" ? 2000 : false;
		},
		staleTime: 1000, // Data is stale after 1s
		gcTime: 1000 * 60 * 5, // Keep in cache for 5 minutes
	});

	// Fetch cycle list for selector
	const listQuery = useQuery({
		queryKey: queryKeys.traces.cycles(),
		queryFn: () => fetchCycleList(),
		staleTime: 30000, // 30s
		gcTime: 1000 * 60 * 5, // 5 minutes
	});

	return {
		cycle: cycleQuery.data,
		isLoading: cycleQuery.isLoading,
		isError: cycleQuery.isError,
		cycles: listQuery.data ?? [],
		isLoadingCycles: listQuery.isLoading,
		refetch: () => {
			cycleQuery.refetch();
		},
	};
}

export default useCycleTraces;
