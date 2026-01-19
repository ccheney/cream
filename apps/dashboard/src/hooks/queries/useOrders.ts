/**
 * Order History Hook
 *
 * Fetches orders from Alpaca via REST API for initial load.
 * Real-time updates are handled via WebSocket (order_update messages)
 * which automatically invalidate the query cache.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { get } from "@/lib/api/client";
import { CACHE_TIMES, queryKeys, STALE_TIMES } from "@/lib/api/query-client";
import type { Order, OrdersFilters, OrdersResponse } from "@/lib/api/types";

export interface UseOrdersOptions extends OrdersFilters {
	enabled?: boolean;
}

export function useOrders(options: UseOrdersOptions = {}) {
	const { enabled = true, ...filters } = options;

	const params = new URLSearchParams();
	if (filters.status) {
		params.set("status", filters.status);
	}
	if (filters.limit) {
		params.set("limit", String(filters.limit));
	}
	if (filters.direction) {
		params.set("direction", filters.direction);
	}
	if (filters.symbols) {
		params.set("symbols", filters.symbols);
	}
	if (filters.side) {
		params.set("side", filters.side);
	}
	if (filters.nested !== undefined) {
		params.set("nested", String(filters.nested));
	}

	const queryString = params.toString();
	const url = queryString ? `/api/portfolio/orders?${queryString}` : "/api/portfolio/orders";

	return useQuery({
		queryKey: queryKeys.portfolio.orders(filters as Record<string, unknown>),
		queryFn: async () => {
			const { data } = await get<OrdersResponse>(url);
			return data;
		},
		staleTime: STALE_TIMES.PORTFOLIO,
		gcTime: CACHE_TIMES.PORTFOLIO,
		enabled,
	});
}

export function useOpenOrders(options: Omit<UseOrdersOptions, "status"> = {}) {
	return useOrders({ ...options, status: "open" });
}

export function useClosedOrders(options: Omit<UseOrdersOptions, "status"> = {}) {
	return useOrders({ ...options, status: "closed" });
}

export function useAllOrders(options: Omit<UseOrdersOptions, "status"> = {}) {
	return useOrders({ ...options, status: "all" });
}

export function useOrdersBySymbol(symbol: string, options: UseOrdersOptions = {}) {
	return useOrders({ ...options, symbols: symbol });
}

export function usePrefetchOrders() {
	const queryClient = useQueryClient();

	return async (filters: OrdersFilters = {}) => {
		const params = new URLSearchParams();
		if (filters.status) {
			params.set("status", filters.status);
		}
		if (filters.limit) {
			params.set("limit", String(filters.limit));
		}

		const queryString = params.toString();
		const url = queryString ? `/api/portfolio/orders?${queryString}` : "/api/portfolio/orders";

		await queryClient.prefetchQuery({
			queryKey: queryKeys.portfolio.orders(filters as Record<string, unknown>),
			queryFn: async () => {
				const { data } = await get<OrdersResponse>(url);
				return data;
			},
			staleTime: STALE_TIMES.PORTFOLIO,
		});
	};
}

export type { Order, OrdersFilters, OrdersResponse };
