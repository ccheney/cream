/**
 * Theses Query Hooks
 *
 * TanStack Query hooks for trading theses.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { del, get, post, put } from "@/lib/api/client";
import { CACHE_TIMES, queryKeys, STALE_TIMES } from "@/lib/api/query-client";
import type { ThesisFilters } from "@/lib/api/types";

// Note: API uses slightly different types than frontend
interface ApiThesis {
	id: string;
	symbol: string;
	direction: "BULLISH" | "BEARISH" | "NEUTRAL";
	thesis: string;
	catalysts: string[];
	invalidationConditions: string[];
	targetPrice: number | null;
	stopPrice: number | null;
	timeHorizon: "INTRADAY" | "SWING" | "POSITION" | "LONG_TERM";
	confidence: number;
	status: "ACTIVE" | "INVALIDATED" | "REALIZED" | "EXPIRED";
	entryPrice: number | null;
	currentPrice: number | null;
	pnlPct: number | null;
	createdAt: string;
	updatedAt: string;
	expiresAt: string | null;
	agentSource: string;
	supportingEvidence: Array<{
		type: "technical" | "fundamental" | "sentiment" | "macro";
		summary: string;
		weight: number;
	}>;
}

/**
 * Get theses list.
 */
export function useTheses(filters?: ThesisFilters) {
	const params = new URLSearchParams();
	if (filters?.symbol) {
		params.set("symbol", filters.symbol);
	}
	if (filters?.state) {
		params.set("status", filters.state);
	}
	if (filters?.limit) {
		params.set("limit", String(filters.limit));
	}
	if (filters?.offset) {
		params.set("offset", String(filters.offset));
	}

	const queryString = params.toString();
	const url = queryString ? `/api/theses?${queryString}` : "/api/theses";

	return useQuery({
		queryKey: [...queryKeys.theses.all, filters] as const,
		queryFn: async () => {
			const { data } = await get<ApiThesis[]>(url);
			return data;
		},
		staleTime: STALE_TIMES.DEFAULT,
		gcTime: CACHE_TIMES.DEFAULT,
	});
}

/**
 * Get thesis detail.
 */
export function useThesis(id: string) {
	return useQuery({
		queryKey: queryKeys.theses.detail(id),
		queryFn: async () => {
			const { data } = await get<ApiThesis>(`/api/theses/${id}`);
			return data;
		},
		staleTime: STALE_TIMES.DEFAULT,
		gcTime: CACHE_TIMES.DEFAULT,
		enabled: Boolean(id),
	});
}

/**
 * Get thesis history.
 */
export function useThesisHistory(id: string) {
	return useQuery({
		queryKey: [...queryKeys.theses.detail(id), "history"] as const,
		queryFn: async () => {
			const { data } = await get<
				Array<{
					id: string;
					thesisId: string;
					field: string;
					oldValue: unknown;
					newValue: unknown;
					reason: string | null;
					timestamp: string;
				}>
			>(`/api/theses/${id}/history`);
			return data;
		},
		staleTime: STALE_TIMES.DEFAULT,
		gcTime: CACHE_TIMES.DEFAULT,
		enabled: Boolean(id),
	});
}

/**
 * Create a new thesis.
 */
export function useCreateThesis() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (request: {
			symbol: string;
			direction: "BULLISH" | "BEARISH" | "NEUTRAL";
			thesis: string;
			catalysts: string[];
			invalidationConditions: string[];
			targetPrice: number | null;
			stopPrice: number | null;
			timeHorizon: "INTRADAY" | "SWING" | "POSITION" | "LONG_TERM";
			confidence: number;
			expiresAt: string | null;
		}) => {
			const { data } = await post<ApiThesis>("/api/theses", request);
			return data;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.theses.all });
		},
	});
}

/**
 * Update a thesis.
 */
export function useUpdateThesis() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ id, updates }: { id: string; updates: Record<string, unknown> }) => {
			const { data } = await put<ApiThesis>(`/api/theses/${id}`, updates);
			return data;
		},
		onSuccess: (data) => {
			queryClient.setQueryData(queryKeys.theses.detail(data.id), data);
			queryClient.invalidateQueries({ queryKey: queryKeys.theses.all });
		},
	});
}

/**
 * Invalidate a thesis.
 */
export function useInvalidateThesis() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
			const { data } = await post<ApiThesis>(`/api/theses/${id}/invalidate`, { reason });
			return data;
		},
		onSuccess: (data) => {
			queryClient.setQueryData(queryKeys.theses.detail(data.id), data);
			queryClient.invalidateQueries({ queryKey: queryKeys.theses.all });
		},
	});
}

/**
 * Realize a thesis (mark as complete with exit).
 */
export function useRealizeThesis() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			id,
			exitPrice,
			notes,
		}: {
			id: string;
			exitPrice: number;
			notes?: string;
		}) => {
			const { data } = await post<ApiThesis>(`/api/theses/${id}/realize`, { exitPrice, notes });
			return data;
		},
		onSuccess: (data) => {
			queryClient.setQueryData(queryKeys.theses.detail(data.id), data);
			queryClient.invalidateQueries({ queryKey: queryKeys.theses.all });
		},
	});
}

/**
 * Delete a thesis.
 */
export function useDeleteThesis() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (id: string) => {
			await del(`/api/theses/${id}`);
			return id;
		},
		onSuccess: (id) => {
			queryClient.removeQueries({ queryKey: queryKeys.theses.detail(id) });
			queryClient.invalidateQueries({ queryKey: queryKeys.theses.all });
		},
	});
}
