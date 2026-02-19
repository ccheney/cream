"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuotes } from "@/hooks/queries/useMarket";
import { type OptionsPosition, useOptionsPositions } from "@/hooks/queries/useOptionsPositions";
import { usePositionGreeks } from "@/hooks/usePositionGreeks";

export interface AggregateGreeksData {
	/** Delta-adjusted notional exposure in dollars */
	deltaNotional: number;
	/** Delta expressed as SPY share equivalent */
	deltaSPYEquivalent: number;
	/** Total gamma (change in delta per $1 underlying move) */
	gammaTotal: number;
	/** Daily theta decay in dollars */
	thetaDaily: number;
	/** Total vega exposure per 1% IV change in dollars */
	vegaTotal: number;
	/** Total rho exposure per 1% rate change (optional) */
	rhoTotal: number;
	/** Number of positions included */
	positionCount: number;
	/** Last update timestamp */
	lastUpdated: Date;
}

export interface UseAggregateGreeksOptions {
	throttleMs?: number;
	spyPrice?: number;
	enabled?: boolean;
}

export interface UseAggregateGreeksReturn {
	data: AggregateGreeksData | null;
	isLoading: boolean;
	isStreaming: boolean;
	error: Error | null;
	refresh: () => void;
}

const DEFAULT_THROTTLE_MS = 100;
const DEFAULT_SPY_PRICE = 500;

function buildUnderlyingPriceMap(
	quotesData: Array<{ symbol: string; last?: number; bid?: number; ask?: number }>,
	underlyingPricesFromApi: Record<string, number>,
) {
	const prices: Record<string, number> = { ...underlyingPricesFromApi };
	for (const quote of quotesData) {
		if (quote?.symbol) {
			prices[quote.symbol] = quote.last ?? quote.bid ?? quote.ask ?? 0;
		}
	}
	return prices;
}

function deriveAggregateData(
	positions: Array<{ id: string }>,
	aggregateGreeks: {
		deltaNotional: number;
		totalGamma: number;
		totalTheta: number;
		totalVega: number;
		totalRho: number;
	},
	underlyingPrices: Record<string, number>,
	providedSpyPrice?: number,
) {
	if (positions.length === 0) {
		return null;
	}

	const spyPrice = providedSpyPrice ?? underlyingPrices.SPY ?? DEFAULT_SPY_PRICE;
	const deltaSPYEquivalent = spyPrice > 0 ? aggregateGreeks.deltaNotional / spyPrice : 0;

	return {
		deltaNotional: aggregateGreeks.deltaNotional,
		deltaSPYEquivalent,
		gammaTotal: aggregateGreeks.totalGamma,
		thetaDaily: aggregateGreeks.totalTheta,
		vegaTotal: aggregateGreeks.totalVega,
		rhoTotal: aggregateGreeks.totalRho,
		positionCount: positions.length,
		lastUpdated: new Date(),
	};
}

function useThrottleAggregateData({
	enabled,
	throttleMs,
	greeksStreaming,
	transformedData,
	setData,
	setIsStreaming,
}: {
	enabled: boolean;
	throttleMs: number;
	greeksStreaming: boolean;
	transformedData: AggregateGreeksData | null;
	setData: (data: AggregateGreeksData | null) => void;
	setIsStreaming: (isStreaming: boolean) => void;
}) {
	const pendingUpdateRef = useRef<AggregateGreeksData | null>(null);
	const lastUpdateRef = useRef<number>(0);

	useEffect(() => {
		if (!enabled || !transformedData) {
			if (!transformedData) {
				setData(null);
			}
			return undefined;
		}

		const now = Date.now();
		const timeSinceLastUpdate = now - lastUpdateRef.current;
		if (timeSinceLastUpdate >= throttleMs) {
			setData(transformedData);
			lastUpdateRef.current = now;
			setIsStreaming(greeksStreaming);
			return undefined;
		}

		pendingUpdateRef.current = transformedData;
		const timeoutId = setTimeout(() => {
			if (pendingUpdateRef.current) {
				setData(pendingUpdateRef.current);
				lastUpdateRef.current = Date.now();
				pendingUpdateRef.current = null;
				setIsStreaming(greeksStreaming);
			}
		}, throttleMs - timeSinceLastUpdate);

		return () => clearTimeout(timeoutId);
	}, [enabled, transformedData, throttleMs, greeksStreaming, setData, setIsStreaming]);
}

function useAggregatePositionState() {
	const {
		data: positionsResponse,
		isLoading: positionsLoading,
		error: positionsError,
		refetch: refetchPositions,
	} = useOptionsPositions();

	const positions = useMemo(() => positionsResponse?.positions ?? [], [positionsResponse]);
	const underlyingPricesFromApi = useMemo(
		() => positionsResponse?.underlyingPrices ?? {},
		[positionsResponse],
	);

	const underlyingSymbols = useMemo(() => {
		const symbols = new Set(positions.map((position) => position.underlying));
		symbols.add("SPY");
		return Array.from(symbols);
	}, [positions]);

	const { data: quotesData } = useQuotes(underlyingSymbols);

	const underlyingPrices = useMemo(
		() => buildUnderlyingPriceMap(quotesData, underlyingPricesFromApi),
		[quotesData, underlyingPricesFromApi],
	);

	return {
		positions,
		positionsLoading,
		positionsError,
		refetchPositions,
		underlyingPrices,
	};
}

function useAggregateDerivedState(
	positions: OptionsPosition[],
	providedSpyPrice: number | undefined,
	underlyingPrices: Record<string, number>,
	throttleMs: number,
	enabled: boolean,
) {
	const { aggregateGreeks, isStreaming: greeksStreaming } = usePositionGreeks({
		positions,
		underlyingPrices,
	});

	const [data, setData] = useState<AggregateGreeksData | null>(null);
	const [isStreaming, setIsStreaming] = useState(false);

	const transformedData = useMemo(
		() => deriveAggregateData(positions, aggregateGreeks, underlyingPrices, providedSpyPrice),
		[aggregateGreeks, positions, underlyingPrices, providedSpyPrice],
	);

	useThrottleAggregateData({
		enabled,
		throttleMs,
		greeksStreaming,
		transformedData,
		setData,
		setIsStreaming,
	});

	return {
		data,
		isStreaming,
	};
}

export function useAggregateGreeks(
	options: UseAggregateGreeksOptions = {},
): UseAggregateGreeksReturn {
	const { throttleMs = DEFAULT_THROTTLE_MS, spyPrice: providedSpyPrice, enabled = true } = options;

	const { positions, positionsLoading, positionsError, refetchPositions, underlyingPrices } =
		useAggregatePositionState();

	const { data, isStreaming } = useAggregateDerivedState(
		positions,
		providedSpyPrice,
		underlyingPrices,
		throttleMs,
		enabled,
	);

	const refresh = useCallback(() => {
		refetchPositions();
	}, [refetchPositions]);

	return {
		data,
		isLoading: positionsLoading,
		isStreaming,
		error: positionsError instanceof Error ? positionsError : null,
		refresh,
	};
}

export default useAggregateGreeks;
