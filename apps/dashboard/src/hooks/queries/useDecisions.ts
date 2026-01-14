/**
 * Decisions Query Hooks
 *
 * TanStack Query hooks for decisions data.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { get, post } from "@/lib/api/client";
import { CACHE_TIMES, queryKeys, STALE_TIMES } from "@/lib/api/query-client";
import type { Decision, DecisionDetail, DecisionFilters, PaginatedResponse } from "@/lib/api/types";

/**
 * Get paginated decisions list.
 */
export function useDecisions(filters?: DecisionFilters) {
	const params = new URLSearchParams();
	if (filters?.symbol) {
		params.set("symbol", filters.symbol);
	}
	if (filters?.action) {
		params.set("action", filters.action);
	}
	if (filters?.status) {
		params.set("status", filters.status);
	}
	if (filters?.dateFrom) {
		params.set("dateFrom", filters.dateFrom);
	}
	if (filters?.dateTo) {
		params.set("dateTo", filters.dateTo);
	}
	if (filters?.limit) {
		params.set("limit", String(filters.limit));
	}
	if (filters?.offset) {
		params.set("offset", String(filters.offset));
	}

	const queryString = params.toString();
	const url = queryString ? `/api/decisions?${queryString}` : "/api/decisions";

	return useQuery({
		queryKey: queryKeys.decisions.list(filters),
		queryFn: async () => {
			const { data } = await get<PaginatedResponse<Decision>>(url);
			return data;
		},
		staleTime: STALE_TIMES.DECISIONS,
		gcTime: CACHE_TIMES.DECISIONS,
	});
}

/**
 * Get recent decisions (shorthand for latest N).
 */
export function useRecentDecisions(limit = 10) {
	return useDecisions({ limit, offset: 0 });
}

/**
 * Get decision detail.
 */
export function useDecisionDetail(id: string) {
	return useQuery({
		queryKey: queryKeys.decisions.detail(id),
		queryFn: async () => {
			const { data } = await get<DecisionDetail>(`/api/decisions/${id}`);
			return data;
		},
		staleTime: STALE_TIMES.DECISIONS,
		gcTime: CACHE_TIMES.DECISIONS,
		enabled: Boolean(id),
	});
}

/**
 * Approve a pending decision (admin only).
 */
export function useApproveDecision() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (id: string) => {
			const { data } = await post<DecisionDetail>(`/api/decisions/${id}/approve`);
			return data;
		},
		onSuccess: (data) => {
			queryClient.setQueryData(queryKeys.decisions.detail(data.id), data);
			queryClient.invalidateQueries({ queryKey: queryKeys.decisions.all });
		},
	});
}

/**
 * Reject a pending decision (admin only).
 */
export function useRejectDecision() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
			const { data } = await post<DecisionDetail>(`/api/decisions/${id}/reject`, { reason });
			return data;
		},
		onSuccess: (data) => {
			queryClient.setQueryData(queryKeys.decisions.detail(data.id), data);
			queryClient.invalidateQueries({ queryKey: queryKeys.decisions.all });
		},
	});
}
