import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api/client";
import { CACHE_TIMES, queryKeys, STALE_TIMES } from "@/lib/api/query-client";

export interface OptionsPosition {
	id: string;
	contractSymbol: string;
	underlying: string;
	expiration: string;
	strike: number;
	right: "CALL" | "PUT";
	/** Positive = long, negative = short */
	quantity: number;
	avgCost: number;
	currentPrice: number;
	dte: number;
	openedAt: string;
	thesisId: string | null;
}

export interface OptionsPositionsResponse {
	positions: OptionsPosition[];
	underlyingPrices: Record<string, number>;
}

export function useOptionsPositions(enabled = true) {
	return useQuery({
		queryKey: [...queryKeys.portfolio.all, "options"] as const,
		queryFn: async () => {
			const { data } = await get<OptionsPositionsResponse>("/api/portfolio/options");
			return data;
		},
		staleTime: STALE_TIMES.PORTFOLIO,
		gcTime: CACHE_TIMES.PORTFOLIO,
		enabled,
		refetchInterval: 5000,
	});
}

/**
 * Format contract symbol for display.
 *
 * Converts OCC format (AAPL250117C00180000) to human-readable
 * (AAPL Jan17 $180C).
 */
export function formatContractDisplay(
	underlying: string,
	expiration: string,
	strike: number,
	right: "CALL" | "PUT"
): string {
	const date = new Date(expiration);
	const month = date.toLocaleDateString("en-US", { month: "short" });
	const day = date.getDate();
	const rightChar = right === "CALL" ? "C" : "P";
	return `${underlying} ${month}${day} $${strike}${rightChar}`;
}
