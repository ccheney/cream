import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useMultiTickHistory } from "@/hooks/useTickHistory";
import { get } from "@/lib/api/client";
import { useWebSocketContext } from "@/providers/WebSocketProvider";
import type { Quote } from "./ticker-item";

export interface TickerStripProps {
	symbols: string[];
	onSymbolClick?: (symbol: string) => void;
	onSymbolRemove?: (symbol: string) => void;
	onSymbolAdd?: () => void;
	showSparkline?: boolean;
	showTickHistory?: boolean;
	allowRemove?: boolean;
	allowAdd?: boolean;
	className?: string;
	"data-testid"?: string;
}

export interface TickerListItem {
	symbol: string;
	quote: Quote | undefined;
	previousPrice: number | undefined;
	tickHistory: Array<{ timestamp: number; price: number }>;
	priceHistory: Array<{ time: string; price: number }>;
}

export interface TickerStripState {
	scrollContainerRef: React.RefObject<HTMLDivElement>;
	quotes: Map<string, Quote>;
	previousPrices: Map<string, number>;
	symbolItems: TickerListItem[];
	onQuoteUpdate: (newQuote: Quote) => void;
	fetchInitialQuotes: () => void;
	canScrollLeft: boolean;
	canScrollRight: boolean;
	scrollLeft: () => void;
	scrollRight: () => void;
}

interface TickerQuoteStateMap {
	quotes: Map<string, Quote>;
	previousPrices: Map<string, number>;
}

function getQuotePriceMeta(newQuote: Quote, priorQuote: Quote | undefined) {
	const prevClose = newQuote.prevClose ?? priorQuote?.prevClose;
	const changePercent =
		newQuote.changePercent ??
		(prevClose && prevClose > 0 ? ((newQuote.last - prevClose) / prevClose) * 100 : 0);

	return { prevClose, changePercent };
}

function addTickerQuote(
	state: TickerQuoteStateMap,
	newQuote: Quote,
	recordTick: (symbol: string, price: number) => void,
) {
	const { quotes, previousPrices } = state;
	const updatedQuotes = new Map(quotes);
	const updatedPreviousPrices = new Map(previousPrices);
	const existing = updatedQuotes.get(newQuote.symbol);

	if (existing?.last !== undefined && existing.last !== newQuote.last) {
		updatedPreviousPrices.set(newQuote.symbol, existing.last);
	}

	const { prevClose, changePercent } = getQuotePriceMeta(newQuote, existing);
	updatedQuotes.set(newQuote.symbol, {
		...newQuote,
		prevClose,
		changePercent,
	});

	if (newQuote.last !== undefined) {
		recordTick(newQuote.symbol, newQuote.last);
	}

	return { quotes: updatedQuotes, previousPrices: updatedPreviousPrices };
}

function getLastMessageQuoteData(lastMessage: unknown): Quote | null {
	if (
		typeof lastMessage !== "object" ||
		lastMessage === null ||
		!("type" in lastMessage) ||
		!("data" in lastMessage)
	) {
		return null;
	}

	const message = lastMessage as {
		type: string;
		data?: {
			symbol: string;
			bid: number;
			ask: number;
			last: number;
			volume?: number;
			prevClose?: number;
			changePercent?: number;
			timestamp?: string;
		};
	};

	if (message.type !== "quote" || !message.data) {
		return null;
	}

	return {
		symbol: message.data.symbol,
		bid: message.data.bid,
		ask: message.data.ask,
		last: message.data.last,
		volume: message.data.volume,
		prevClose: message.data.prevClose,
		changePercent: message.data.changePercent,
		timestamp: message.data.timestamp ? new Date(message.data.timestamp) : new Date(),
	};
}

function useTickerQuoteMap(recordTick: (symbol: string, price: number) => void) {
	const [state, setState] = useState<TickerQuoteStateMap>({
		quotes: new Map(),
		previousPrices: new Map(),
	});

	const onQuoteUpdate = useCallback(
		(newQuote: Quote) =>
			setState((previousState) => addTickerQuote(previousState, newQuote, recordTick)),
		[recordTick],
	);

	const addInitialQuote = useCallback(
		(newQuote: Quote) =>
			setState((previousState) => {
				if (previousState.quotes.has(newQuote.symbol)) {
					return previousState;
				}
				return addTickerQuote(previousState, newQuote, recordTick);
			}),
		[recordTick],
	);

	return { state, onQuoteUpdate, addInitialQuote };
}

function useTickerMapState(recordTick: (symbol: string, price: number) => void) {
	const { state, onQuoteUpdate, addInitialQuote } = useTickerQuoteMap(recordTick);

	const fetchInitialQuotes = useCallback(
		async (symbols: string[]) => {
			if (symbols.length === 0) {
				return;
			}

			try {
				const { data } = await get<
					Array<{
						symbol: string;
						bid: number;
						ask: number;
						last: number;
						volume: number;
						prevClose?: number;
						changePercent?: number;
						timestamp: string;
					}>
				>("/api/market/quotes", { params: { symbols: symbols.join(",") } });

				for (const quote of data) {
					addInitialQuote({
						symbol: quote.symbol,
						bid: quote.bid,
						ask: quote.ask,
						last: quote.last,
						volume: quote.volume,
						prevClose: quote.prevClose,
						changePercent: quote.changePercent,
						timestamp: new Date(quote.timestamp),
					});
				}
			} catch {
				// Silently fail - WebSocket will provide data when available
			}
		},
		[addInitialQuote],
	);

	return {
		quotes: state.quotes,
		previousPrices: state.previousPrices,
		fetchInitialQuotes,
		onQuoteUpdate,
	};
}

function useTickerData(symbols: string[], recordTick: (symbol: string, price: number) => void) {
	const { subscribe, subscribeSymbols, connected, lastMessage } = useWebSocketContext();
	const { quotes, previousPrices, fetchInitialQuotes, onQuoteUpdate } =
		useTickerMapState(recordTick);
	const requestInitialQuotes = useCallback(
		() => fetchInitialQuotes(symbols),
		[fetchInitialQuotes, symbols],
	);

	useEffect(() => {
		requestInitialQuotes();
	}, [requestInitialQuotes]);

	useEffect(() => {
		if (!connected || symbols.length === 0) {
			return;
		}

		subscribe(["quotes"]);
		subscribeSymbols(symbols);
	}, [connected, symbols, subscribe, subscribeSymbols]);

	useEffect(() => {
		if (!connected || !lastMessage) {
			return;
		}

		const quote = getLastMessageQuoteData(lastMessage);
		if (!quote) {
			return;
		}

		if (symbols.includes(quote.symbol)) {
			onQuoteUpdate(quote);
		}
	}, [connected, lastMessage, onQuoteUpdate, symbols]);

	return { quotes, previousPrices, fetchInitialQuotes: requestInitialQuotes, onQuoteUpdate };
}

function useTickerScrollState() {
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const [canScrollLeft, setCanScrollLeft] = useState(false);
	const [canScrollRight, setCanScrollRight] = useState(false);

	const updateScrollState = useCallback(() => {
		const container = scrollContainerRef.current;
		if (!container) {
			return;
		}

		setCanScrollLeft(container.scrollLeft > 0);
		setCanScrollRight(container.scrollLeft < container.scrollWidth - container.clientWidth - 1);
	}, []);

	useEffect(() => {
		const container = scrollContainerRef.current;
		if (!container) {
			return;
		}

		updateScrollState();
		container.addEventListener("scroll", updateScrollState);
		const resizeObserver = new ResizeObserver(updateScrollState);
		resizeObserver.observe(container);

		return () => {
			container.removeEventListener("scroll", updateScrollState);
			resizeObserver.disconnect();
		};
	}, [updateScrollState]);

	const scrollLeft = useCallback(() => {
		scrollContainerRef.current?.scrollBy({ left: -200, behavior: "smooth" });
	}, []);

	const scrollRight = useCallback(() => {
		scrollContainerRef.current?.scrollBy({ left: 200, behavior: "smooth" });
	}, []);

	return {
		scrollContainerRef,
		canScrollLeft,
		canScrollRight,
		updateScrollState,
		scrollLeft,
		scrollRight,
	};
}

export function useTickerStripState({
	symbols,
	onSymbolAdd,
	onSymbolRemove,
	onSymbolClick,
	showSparkline,
	showTickHistory,
	allowAdd,
	allowRemove,
	"data-testid": testId,
	className,
}: TickerStripProps): TickerStripState & { hasSymbols: boolean } {
	const { getTicks, getPriceHistory, recordTick } = useMultiTickHistory();
	const { quotes, previousPrices, fetchInitialQuotes, onQuoteUpdate } = useTickerData(
		symbols,
		recordTick,
	);
	const { scrollContainerRef, canScrollLeft, canScrollRight, scrollLeft, scrollRight } =
		useTickerScrollState();

	const symbolItems = useMemo(
		() =>
			symbols.map((symbol) => ({
				symbol,
				quote: quotes.get(symbol),
				previousPrice: previousPrices.get(symbol),
				tickHistory: getTicks(symbol),
				priceHistory: getPriceHistory(symbol),
			})),
		[symbols, quotes, previousPrices, getTicks, getPriceHistory],
	);

	return {
		scrollContainerRef,
		quotes,
		previousPrices,
		symbolItems,
		onQuoteUpdate,
		fetchInitialQuotes,
		canScrollLeft,
		canScrollRight,
		scrollLeft,
		scrollRight,
		hasSymbols: symbols.length > 0,
		className,
		allowAdd,
		allowRemove,
		onSymbolAdd,
		onSymbolRemove,
		onSymbolClick,
		showSparkline,
		showTickHistory,
		testId,
	};
}
