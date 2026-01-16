/**
 * Global Search Query Hooks
 *
 * TanStack Query hooks for global fuzzy search across all entities.
 *
 * @see docs/plans/46-postgres-drizzle-migration.md
 */

import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api/client";
import { CACHE_TIMES, STALE_TIMES } from "@/lib/api/query-client";

// ============================================
// Types
// ============================================

export type SearchResultType = "symbol" | "decision" | "thesis" | "alert" | "config" | "navigation";

export interface SearchResult {
	id: string;
	type: SearchResultType;
	title: string;
	subtitle: string | null;
	url: string;
	score: number;
}

export interface SearchResponse {
	results: SearchResult[];
	query: string;
	timestamp: string;
}

// ============================================
// Query Keys
// ============================================

export const searchKeys = {
	all: ["search"] as const,
	query: (q: string) => [...searchKeys.all, q] as const,
};

// ============================================
// Query Hooks
// ============================================

/**
 * Search across all entities.
 * Debounces automatically via staleTime.
 */
export function useGlobalSearch(query: string) {
	const trimmedQuery = query.trim();

	return useQuery({
		queryKey: searchKeys.query(trimmedQuery),
		queryFn: async () => {
			if (!trimmedQuery || trimmedQuery.length < 2) {
				return { results: [], query: trimmedQuery, timestamp: new Date().toISOString() };
			}

			const { data } = await get<SearchResponse>(
				`/api/search?q=${encodeURIComponent(trimmedQuery)}&limit=20`
			);
			return data;
		},
		staleTime: STALE_TIMES.DEFAULT,
		gcTime: CACHE_TIMES.DEFAULT,
		enabled: trimmedQuery.length >= 2,
	});
}
