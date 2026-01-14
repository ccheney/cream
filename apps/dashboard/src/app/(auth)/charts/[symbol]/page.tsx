"use client";

/**
 * Charts Page - Market context with candle charts and indicators
 *
 * Uses useDeferredValue to prevent UI flicker when switching symbols.
 * The old chart stays visible until new data is ready.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md
 */

import { use, useDeferredValue } from "react";
import { LoadingOverlay } from "@/components/ui/spinner";
import type { ChartPageProps } from "./components/index";
import { ChartContent } from "./components/index";

export default function ChartPage({ params }: ChartPageProps) {
	// Use React 19's `use` hook to unwrap the params promise
	const { symbol } = use(params);

	// Defer the symbol change to keep old UI visible during transition
	const deferredSymbol = useDeferredValue(symbol);
	const isStale = symbol !== deferredSymbol;

	return (
		<LoadingOverlay isLoading={isStale} label="Loading chart">
			<ChartContent symbol={deferredSymbol} />
		</LoadingOverlay>
	);
}
