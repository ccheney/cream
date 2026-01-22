import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { OptionsOrderRequest } from "@/components/options/PositionBuilderModal";
import { get, post } from "@/lib/api/client";
import { CACHE_TIMES, queryKeys, STALE_TIMES } from "@/lib/api/query-client";
import type {
	ExpirationsResponse,
	OptionsChainResponse,
	OptionsQuoteDetail,
} from "@/lib/api/types";

export interface UseOptionsChainOptions {
	/** Filter to specific expiration date (YYYY-MM-DD) */
	expiration?: string;
	/** Strike range as percentage from current price (default: 20) */
	strikeRange?: number;
	/** Disable automatic fetching */
	enabled?: boolean;
}

/**
 * Fetch options chain for an underlying symbol.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useOptionsChain('AAPL', {
 *   expiration: '2025-01-17',
 *   strikeRange: 20,
 * });
 * ```
 */
export function useOptionsChain(underlying: string, options: UseOptionsChainOptions = {}) {
	const { expiration, strikeRange = 20, enabled = true } = options;

	return useQuery({
		queryKey: queryKeys.options.chain(underlying, expiration),
		queryFn: async () => {
			const params = new URLSearchParams();
			if (expiration) {
				params.set("expiration", expiration);
			}
			params.set("strikeRange", strikeRange.toString());

			const url = `/api/options/chain/${underlying.toUpperCase()}?${params.toString()}`;
			const { data } = await get<OptionsChainResponse>(url);
			return data;
		},
		staleTime: STALE_TIMES.MARKET,
		gcTime: CACHE_TIMES.CHART,
		enabled: enabled && Boolean(underlying),
		refetchInterval: 30000,
		placeholderData: keepPreviousData,
	});
}

/**
 * Fetch available expiration dates for an underlying.
 *
 * @example
 * ```tsx
 * const { data } = useOptionsExpirations('AAPL');
 * // data.expirations = [{ date: '2025-01-17', dte: 10, type: 'monthly' }, ...]
 * ```
 */
export function useOptionsExpirations(underlying: string, enabled = true) {
	return useQuery({
		queryKey: queryKeys.options.expirations(underlying),
		queryFn: async () => {
			const url = `/api/options/expirations/${underlying.toUpperCase()}`;
			const { data } = await get<ExpirationsResponse>(url);
			return data;
		},
		staleTime: STALE_TIMES.CONFIG,
		gcTime: CACHE_TIMES.CONFIG,
		enabled: enabled && Boolean(underlying),
	});
}

/**
 * Fetch detailed quote with greeks for a specific option contract.
 *
 * @example
 * ```tsx
 * const { data } = useOptionQuote('AAPL240119C00180000');
 * // data.greeks = { delta: 0.65, gamma: 0.02, theta: -0.05, vega: 0.15 }
 * ```
 */
export function useOptionQuote(contract: string, enabled = true) {
	return useQuery({
		queryKey: queryKeys.options.quote(contract),
		queryFn: async () => {
			const url = `/api/options/quote/${contract.toUpperCase()}`;
			const { data } = await get<OptionsQuoteDetail>(url);
			return data;
		},
		staleTime: STALE_TIMES.MARKET,
		gcTime: CACHE_TIMES.MARKET,
		enabled: enabled && Boolean(contract),
	});
}

/**
 * Format OCC option symbol from components.
 *
 * @example
 * ```ts
 * formatOccSymbol('AAPL', '2025-01-17', 'C', 180) // 'AAPL250117C00180000'
 * ```
 */
export function formatOccSymbol(
	underlying: string,
	expiration: string,
	type: "C" | "P",
	strike: number,
): string {
	const [year, month, day] = expiration.split("-");
	const yy = year?.slice(2) ?? "00";
	const strikeFormatted = Math.round(strike * 1000)
		.toString()
		.padStart(8, "0");
	return `${underlying.toUpperCase()}${yy}${month}${day}${type}${strikeFormatted}`;
}

/**
 * Parse OCC option symbol into components.
 *
 * @example
 * ```ts
 * parseOccSymbol('AAPL250117C00180000')
 * // { underlying: 'AAPL', expiration: '2025-01-17', type: 'C', strike: 180 }
 * ```
 */
export function parseOccSymbol(symbol: string): {
	underlying: string;
	expiration: string;
	type: "C" | "P";
	strike: number;
} | null {
	const match = symbol.match(/^([A-Z]+)(\d{6})([CP])(\d{8})$/);
	if (!match) {
		return null;
	}

	const [, underlying, expStr, typeChar, strikeStr] = match;
	if (!underlying || !expStr || !typeChar || !strikeStr) {
		return null;
	}

	const year = 2000 + Number.parseInt(expStr.slice(0, 2), 10);
	const month = expStr.slice(2, 4);
	const day = expStr.slice(4, 6);

	return {
		underlying,
		expiration: `${year}-${month}-${day}`,
		type: typeChar as "C" | "P",
		strike: Number.parseInt(strikeStr, 10) / 1000,
	};
}

export interface OptionsOrderResponse {
	orderId: string;
	clientOrderId: string;
	status: "pending" | "accepted" | "filled" | "rejected";
	filledQty: number;
	avgFillPrice: number | null;
	createdAt: string;
}

/**
 * Submit an options order.
 *
 * @example
 * ```tsx
 * const { mutateAsync, isPending } = useOptionsOrder();
 *
 * const handleSubmit = async (order: OptionsOrderRequest) => {
 *   const result = await mutateAsync(order);
 *   console.log('Order submitted:', result.orderId);
 * };
 * ```
 */
export function useOptionsOrder() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (order: OptionsOrderRequest) => {
			const { data } = await post<OptionsOrderResponse>("/api/orders/options", order);
			return data;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.portfolio.positions() });
			queryClient.invalidateQueries({ queryKey: ["options-positions"] });
		},
	});
}
