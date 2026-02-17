"use client";

import { memo, useCallback, useEffect, useMemo } from "react";
import { useOptionsPositions } from "@/hooks/queries/useOptionsPositions";
import {
	type AggregateGreeks,
	type StreamingOptionsPosition,
	usePositionGreeks,
} from "@/hooks/usePositionGreeks";
import { useWebSocket } from "@/hooks/useWebSocket";
import { AggregateGreeks as AggregateGreeksPanel } from "./AggregateGreeks";
import { OptionsPositionRow } from "./OptionsPositionRow";

export interface OptionsPositionsWidgetProps {
	showAggregateGreeks?: boolean;
	onPositionClick?: (position: StreamingOptionsPosition) => void;
	className?: string;
}

interface NormalizedQuoteMessage {
	type?: string;
	symbol?: string;
	price?: number;
	last?: number;
}

interface PositionDataResult {
	positions: StreamingOptionsPosition[];
	underlyingPrices: Record<string, number>;
	isLoading: boolean;
	error: unknown;
	contractSymbols: string[];
	underlyings: string[];
}

type OptionsPositionsState = {
	positions: StreamingOptionsPosition[];
	streamingPositions: StreamingOptionsPosition[];
	aggregateGreeks: AggregateGreeks;
	isStreaming: boolean;
	isLoading: boolean;
	error: unknown;
};

function safeParseMessage(message: unknown): NormalizedQuoteMessage | null {
	if (!message || typeof message !== "object") {
		return null;
	}

	const data = message as Partial<NormalizedQuoteMessage>;
	if (!data.type || !data.symbol) {
		return null;
	}

	const price = data.price ?? data.last;
	if (typeof price !== "number") {
		return null;
	}

	return {
		type: data.type,
		symbol: data.symbol,
		price,
	};
}

function usePositionsData(): PositionDataResult {
	const { data, isLoading, error } = useOptionsPositions();

	const positions = data?.positions ?? [];
	const underlyingPrices = data?.underlyingPrices ?? {};
	const contractSymbols = useMemo(() => {
		return positions.map((position) => position.contractSymbol);
	}, [positions]);
	const underlyings = useMemo(() => {
		return [...new Set(positions.map((position) => position.underlying))];
	}, [positions]);

	return { positions, underlyingPrices, isLoading, error, contractSymbols, underlyings };
}

function useStreamingPositionState({
	positions,
	underlyingPrices,
}: {
	positions: StreamingOptionsPosition[];
	underlyingPrices: Record<string, number>;
}) {
	const {
		streamingPositions,
		aggregateGreeks,
		isStreaming,
		updateContractPrice,
		updateUnderlyingPrice,
	} = usePositionGreeks({
		positions,
		underlyingPrices,
	});

	return {
		streamingPositions,
		aggregateGreeks,
		isStreaming,
		updateContractPrice,
		updateUnderlyingPrice,
	};
}

function useOptionsWebSocket({
	contractSymbols,
	underlyings,
	onMessage,
}: {
	contractSymbols: string[];
	underlyings: string[];
	onMessage: (message: unknown) => void;
}) {
	const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001/ws";
	const { connected, subscribeOptions, unsubscribeOptions, subscribeSymbols, unsubscribeSymbols } =
		useWebSocket({
			url: wsUrl,
			onMessage,
			autoConnect: true,
		});

	useEffect(() => {
		if (!connected || contractSymbols.length === 0) {
			return;
		}

		subscribeOptions(contractSymbols);
		if (underlyings.length > 0) {
			subscribeSymbols(underlyings);
		}

		return () => {
			unsubscribeOptions(contractSymbols);
			unsubscribeSymbols(underlyings);
		};
	}, [
		connected,
		contractSymbols,
		underlyings,
		subscribeOptions,
		subscribeSymbols,
		unsubscribeOptions,
		unsubscribeSymbols,
	]);

	return { connected, isStreaming: connected };
}

function useOptionsQuoteHandler({
	contractSymbols,
	updateContractPrice,
	updateUnderlyingPrice,
}: {
	contractSymbols: string[];
	updateContractPrice: (symbol: string, price: number) => void;
	updateUnderlyingPrice: (symbol: string, price: number) => void;
}): (message: unknown) => void {
	return useCallback(
		(message: unknown) => {
			const normalized = safeParseMessage(message);
			if (!normalized) {
				return;
			}

			const { type, symbol, price } = normalized;
			if (type === "quote" || type === "options_quote") {
				if (contractSymbols.includes(symbol)) {
					updateContractPrice(symbol, price);
				} else {
					updateUnderlyingPrice(symbol, price);
				}
			}
		},
		[contractSymbols, updateContractPrice, updateUnderlyingPrice],
	);
}

function useOptionsPositionsState(): OptionsPositionsState {
	const { positions, underlyingPrices, isLoading, error, contractSymbols, underlyings } =
		usePositionsData();
	const {
		streamingPositions,
		aggregateGreeks,
		isStreaming,
		updateContractPrice,
		updateUnderlyingPrice,
	} = useStreamingPositionState({ positions, underlyingPrices });
	const handleMessage = useOptionsQuoteHandler({
		contractSymbols,
		updateContractPrice,
		updateUnderlyingPrice,
	});

	useOptionsWebSocket({ contractSymbols, underlyings, onMessage: handleMessage });

	return {
		positions,
		streamingPositions,
		aggregateGreeks,
		isStreaming,
		isLoading,
		error,
	};
}

function WidgetContainer({
	children,
	className,
}: {
	children: React.ReactNode;
	className: string;
}) {
	return (
		<div
			className={`bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 ${className}`}
		>
			{children}
		</div>
	);
}

function WidgetTitle() {
	return (
		<h3 className="text-lg font-semibold text-stone-900 dark:text-night-50">Options Positions</h3>
	);
}

function LoadingSkeleton() {
	return (
		<div className="animate-pulse">
			<div className="h-10 bg-cream-100 dark:bg-night-700 rounded mb-2" />
			<div className="h-12 bg-cream-100 dark:bg-night-700 rounded mb-2" />
			<div className="h-12 bg-cream-100 dark:bg-night-700 rounded mb-2" />
			<div className="h-12 bg-cream-100 dark:bg-night-700 rounded mb-2" />
		</div>
	);
}

function EmptyState() {
	return (
		<div className="text-center py-8 text-stone-500 dark:text-night-300">
			<p>No options positions</p>
			<p className="text-sm mt-1">Options positions will appear here when opened</p>
		</div>
	);
}

function LiveIndicator() {
	return (
		<output
			className="w-2 h-2 rounded-full bg-green-500 animate-pulse"
			aria-label="Live streaming"
		/>
	);
}

function WidgetHeader({
	positionCount,
	isStreaming,
}: {
	positionCount: number;
	isStreaming: boolean;
}) {
	return (
		<div className="px-4 py-3 border-b border-cream-200 dark:border-night-700">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<WidgetTitle />
					{isStreaming && <LiveIndicator />}
				</div>
				<span className="text-sm text-stone-500 dark:text-night-300">
					{positionCount} position{positionCount !== 1 ? "s" : ""}
				</span>
			</div>
		</div>
	);
}

function OptionsTableHeader() {
	return (
		<thead>
			<tr className="border-b border-cream-200 dark:border-night-700 text-sm text-stone-500 dark:text-night-300">
				<th className="px-4 py-2 text-left font-medium">Contract</th>
				<th className="px-4 py-2 text-right font-medium">Qty</th>
				<th className="px-4 py-2 text-right font-medium">Cost</th>
				<th className="px-4 py-2 text-right font-medium">Mkt</th>
				<th className="px-4 py-2 text-right font-medium">P/L</th>
				<th className="px-4 py-2 text-right font-medium">Delta</th>
				<th className="px-4 py-2 text-right font-medium">Theta</th>
				<th className="px-4 py-2 text-right font-medium">DTE</th>
			</tr>
		</thead>
	);
}

function OptionsPositionsRows({
	positions,
	onPositionClick,
}: {
	positions: StreamingOptionsPosition[];
	onPositionClick?: (position: StreamingOptionsPosition) => void;
}) {
	return (
		<tbody>
			{positions.map((position) => (
				<OptionsPositionRow
					key={position.id}
					position={position}
					onPositionClick={onPositionClick}
				/>
			))}
		</tbody>
	);
}

function WidgetAggregateFooter({
	showAggregateGreeks,
	aggregateGreeks,
	isStreaming,
}: {
	showAggregateGreeks: boolean;
	aggregateGreeks: AggregateGreeks;
	isStreaming: boolean;
}) {
	if (!showAggregateGreeks) {
		return null;
	}

	return (
		<div className="border-t border-cream-200 dark:border-night-700">
			<AggregateGreeksPanel greeks={aggregateGreeks} isStreaming={isStreaming} />
		</div>
	);
}

export const OptionsPositionsWidget = memo(function OptionsPositionsWidget({
	showAggregateGreeks = true,
	onPositionClick,
	className = "",
}: OptionsPositionsWidgetProps) {
	const { positions, streamingPositions, aggregateGreeks, isStreaming, isLoading, error } =
		useOptionsPositionsState();

	if (isLoading) {
		return (
			<WidgetContainer className={`p-4 ${className}`}>
				<WidgetTitle />
				<LoadingSkeleton />
			</WidgetContainer>
		);
	}

	if (error) {
		return (
			<WidgetContainer className={`p-4 ${className}`}>
				<WidgetTitle />
				<div className="text-center py-4 text-red-500">Failed to load options positions</div>
			</WidgetContainer>
		);
	}

	if (positions.length === 0) {
		return (
			<WidgetContainer className={`p-4 ${className}`}>
				<WidgetTitle />
				<EmptyState />
			</WidgetContainer>
		);
	}

	return (
		<WidgetContainer className={`overflow-hidden ${className}`}>
			<WidgetHeader positionCount={positions.length} isStreaming={isStreaming} />
			<div className="overflow-x-auto">
				<table className="w-full">
					<OptionsTableHeader />
					<OptionsPositionsRows positions={streamingPositions} onPositionClick={onPositionClick} />
				</table>
			</div>
			<WidgetAggregateFooter
				showAggregateGreeks={showAggregateGreeks}
				aggregateGreeks={aggregateGreeks}
				isStreaming={isStreaming}
			/>
		</WidgetContainer>
	);
});

export default OptionsPositionsWidget;
