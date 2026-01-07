/**
 * Options Positions Query Hooks
 *
 * TanStack Query hooks for options position data.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 2.2
 */

import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api/client";
import { CACHE_TIMES, queryKeys, STALE_TIMES } from "@/lib/api/query-client";

// ============================================
// Types
// ============================================

export interface OptionsPosition {
  /** Position ID */
  id: string;
  /** OCC format contract symbol */
  contractSymbol: string;
  /** Underlying symbol */
  underlying: string;
  /** Expiration date (YYYY-MM-DD) */
  expiration: string;
  /** Strike price */
  strike: number;
  /** Option type */
  right: "CALL" | "PUT";
  /** Number of contracts (positive = long, negative = short) */
  quantity: number;
  /** Average cost per contract */
  avgCost: number;
  /** Current market price */
  currentPrice: number;
  /** Days to expiration */
  dte: number;
  /** Position opened timestamp */
  openedAt: string;
  /** Related thesis ID */
  thesisId: string | null;
}

export interface OptionsPositionsResponse {
  positions: OptionsPosition[];
  underlyingPrices: Record<string, number>;
}

// ============================================
// Query Hooks
// ============================================

/**
 * Fetch all options positions.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useOptionsPositions();
 * ```
 */
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
