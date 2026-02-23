/**
 * Market Hours Utilities
 *
 * Client-side hooks for checking if the US options market is open.
 * Data comes from the Calendar API only.
 */

"use client";

import { useMemo } from "react";
import { useMarketStatus } from "@/hooks/useCalendar";

// ============================================
// React Hooks (API-based)
// ============================================

/**
 * Market hours state from API.
 */
export interface MarketHoursState {
	/** Whether options market is open for trading */
	isOpen: boolean;
	/** Human-readable status message */
	message: string;
	/** Current trading session */
	session: "PRE_MARKET" | "RTH" | "AFTER_HOURS" | "CLOSED";
	/** Whether data is loading */
	isLoading: boolean;
	/** Error if any */
	error: Error | null;
}

/**
 * Hook for market hours with API data.
 */
export function useMarketHours(): MarketHoursState {
	const { data, isLoading, error } = useMarketStatus();

	return useMemo(() => {
		if (data) {
			return {
				isOpen: data.isOpen,
				message: data.message,
				session: data.session,
				isLoading: false,
				error: null,
			};
		}

		if (isLoading) {
			return {
				isOpen: false,
				message: "Loading market status...",
				session: "CLOSED" as const,
				isLoading: true,
				error: null,
			};
		}

		return {
			isOpen: false,
			message: "Market status unavailable",
			session: "CLOSED" as const,
			isLoading: false,
			error: error instanceof Error ? error : new Error("Market status unavailable"),
		};
	}, [data, isLoading, error]);
}

/**
 * Hook for checking if options market is open (simple boolean).
 */
export function useIsOptionsMarketOpen(): {
	isOpen: boolean;
	isLoading: boolean;
} {
	const { isOpen, isLoading, session } = useMarketHours();

	// Options only trade during RTH
	const isOptionsOpen = isOpen && session === "RTH";

	return { isOpen: isOptionsOpen, isLoading };
}
