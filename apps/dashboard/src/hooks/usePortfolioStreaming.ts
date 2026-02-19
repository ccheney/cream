/**
 * @see docs/plans/ui/40-streaming-data-integration.md Part 4.2
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Position } from "@/lib/api/types";
import { useWebSocketContext } from "@/providers/WebSocketProvider";

export interface StreamingQuote {
	symbol: string;
	price: number;
	bid?: number;
	ask?: number;
	changePercent?: number;
	timestamp: Date;
}

export interface StreamingPosition extends Position {
	livePrice: number;
	liveMarketValue: number;
	liveUnrealizedPnl: number;
	liveUnrealizedPnlPct: number;
	liveDayPnl: number;
	previousPrice: number;
	isStreaming: boolean;
	lastUpdated: Date | null;
}

export interface PortfolioStreamingState {
	liveNav: number;
	liveTotalPnl: number;
	liveTotalPnlPct: number;
	liveDayPnl: number;
	liveDayPnlPct: number;
	isStreaming: boolean;
	lastUpdated: Date | null;
}

export interface UsePortfolioStreamingOptions {
	cash?: number;
	positions?: Position[];
	enabled?: boolean;
}

export interface UsePortfolioStreamingResult {
	streamingPositions: StreamingPosition[];
	state: PortfolioStreamingState;
	getQuote: (symbol: string) => StreamingQuote | undefined;
	refresh: () => void;
}

function usePositionSymbols(positions: Position[]): string[] {
	return useMemo(() => [...new Set(positions.map((position) => position.symbol))], [positions]);
}

function useQuoteStore() {
	const [quotes, setQuotes] = useState<Map<string, StreamingQuote>>(new Map());
	const previousPricesRef = useRef<Map<string, number>>(new Map());
	const lastUpdatedRef = useRef<Date | null>(null);

	return { quotes, setQuotes, previousPricesRef, lastUpdatedRef };
}

function useHandleQuoteUpdate(
	setQuotes: React.Dispatch<React.SetStateAction<Map<string, StreamingQuote>>>,
	previousPricesRef: React.MutableRefObject<Map<string, number>>,
	lastUpdatedRef: React.MutableRefObject<Date | null>,
) {
	return useCallback(
		(quote: StreamingQuote) => {
			setQuotes((prev) => {
				const updated = new Map(prev);
				const existing = updated.get(quote.symbol);

				if (existing && existing.price !== quote.price) {
					previousPricesRef.current.set(quote.symbol, existing.price);
				}

				updated.set(quote.symbol, quote);
				lastUpdatedRef.current = new Date();
				return updated;
			});
		},
		[setQuotes, previousPricesRef, lastUpdatedRef],
	);
}

function useRegisterQuoteHandler(handleQuoteUpdate: (quote: StreamingQuote) => void) {
	useEffect(() => {
		(
			window as unknown as { __portfolioQuoteHandler?: typeof handleQuoteUpdate }
		).__portfolioQuoteHandler = handleQuoteUpdate;
		return () => {
			delete (window as unknown as { __portfolioQuoteHandler?: typeof handleQuoteUpdate })
				.__portfolioQuoteHandler;
		};
	}, [handleQuoteUpdate]);
}

function useStreamingPositions(
	positions: Position[],
	quotes: Map<string, StreamingQuote>,
	previousPricesRef: React.MutableRefObject<Map<string, number>>,
) {
	return useMemo(() => {
		return positions.map((position) => {
			const quote = quotes.get(position.symbol);
			const livePrice = quote?.price ?? position.currentPrice;
			const previousPrice = previousPricesRef.current.get(position.symbol) ?? position.currentPrice;
			const multiplier = position.side === "LONG" ? 1 : -1;
			const absQty = Math.abs(position.qty);
			const liveMarketValue = livePrice * absQty;
			const liveUnrealizedPnl = (livePrice - position.avgEntry) * absQty * multiplier;
			const liveUnrealizedPnlPct =
				position.avgEntry !== 0
					? ((livePrice - position.avgEntry) / position.avgEntry) * 100 * multiplier
					: 0;
			let liveDayPnl = 0;
			if (position.lastdayPrice != null && livePrice > 0) {
				liveDayPnl = (livePrice - position.lastdayPrice) * absQty * multiplier;
			}

			return {
				...position,
				livePrice,
				liveMarketValue,
				liveUnrealizedPnl,
				liveUnrealizedPnlPct,
				liveDayPnl,
				previousPrice,
				isStreaming: quote !== undefined,
				lastUpdated: quote?.timestamp ?? null,
			};
		});
	}, [positions, quotes, previousPricesRef]);
}

function usePortfolioStreamingState(
	positions: Position[],
	streamingPositions: StreamingPosition[],
	cash: number,
	lastUpdatedRef: React.MutableRefObject<Date | null>,
) {
	return useMemo((): PortfolioStreamingState => {
		const totalMarketValue = streamingPositions.reduce((sum, p) => sum + p.liveMarketValue, 0);
		const liveTotalPnl = streamingPositions.reduce((sum, p) => sum + p.liveUnrealizedPnl, 0);
		const totalCostBasis = positions.reduce((sum, p) => sum + p.avgEntry * p.qty, 0);
		const liveTotalPnlPct = totalCostBasis !== 0 ? (liveTotalPnl / totalCostBasis) * 100 : 0;
		const liveNav = cash + totalMarketValue;
		const liveDayPnl = streamingPositions.reduce((sum, p) => sum + p.liveDayPnl, 0);
		const yesterdayNav = liveNav - liveDayPnl;
		const liveDayPnlPct = yesterdayNav > 0 ? (liveDayPnl / yesterdayNav) * 100 : 0;
		const isStreaming = streamingPositions.some((p) => p.isStreaming);

		return {
			liveNav,
			liveTotalPnl,
			liveTotalPnlPct,
			liveDayPnl,
			liveDayPnlPct,
			isStreaming,
			lastUpdated: lastUpdatedRef.current,
		};
	}, [positions, streamingPositions, cash, lastUpdatedRef]);
}

function useQuoteUpdateRegistration(
	connected: boolean,
	symbols: string[],
	subscribe: (channels: string[]) => void,
	subscribeSymbols: (symbols: string[]) => void,
	enabled: boolean,
) {
	useEffect(() => {
		if (!enabled || !connected || symbols.length === 0) {
			return;
		}
		subscribe(["quotes"]);
		subscribeSymbols(symbols);
	}, [connected, enabled, symbols, subscribe, subscribeSymbols]);
}

function useLiveSymbolsState(symbols: string[]) {
	const symbolsRef = useRef<string[]>([]);

	useEffect(() => {
		symbolsRef.current = symbols;
	}, [symbols]);

	return symbolsRef;
}

export function usePortfolioStreaming(
	options: UsePortfolioStreamingOptions = {},
): UsePortfolioStreamingResult {
	const { cash = 0, positions = [], enabled = true } = options;
	const { subscribe, subscribeSymbols, connected } = useWebSocketContext();

	const symbols = usePositionSymbols(positions);
	const { quotes, setQuotes, previousPricesRef, lastUpdatedRef } = useQuoteStore();
	useQuoteUpdateRegistration(connected, symbols, subscribe, subscribeSymbols, enabled);
	const symbolsRef = useLiveSymbolsState(symbols);

	const handleQuoteUpdate = useHandleQuoteUpdate(setQuotes, previousPricesRef, lastUpdatedRef);
	useRegisterQuoteHandler(handleQuoteUpdate);

	const streamingPositions = useStreamingPositions(positions, quotes, previousPricesRef);
	const state = usePortfolioStreamingState(positions, streamingPositions, cash, lastUpdatedRef);

	const getQuote = useCallback(
		(symbol: string): StreamingQuote | undefined => {
			return quotes.get(symbol);
		},
		[quotes],
	);

	const refresh = useCallback(() => {
		const activeSymbols = symbolsRef.current;
		if (connected && activeSymbols.length > 0) {
			subscribeSymbols(activeSymbols);
		}
	}, [connected, subscribeSymbols, symbolsRef]);

	return {
		streamingPositions,
		state,
		getQuote,
		refresh,
	};
}

export default usePortfolioStreaming;
