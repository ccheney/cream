import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";

export type HealthStatus = "healthy" | "degraded" | "disconnected";

export interface StreamingMetricsState {
	stocksConnected: boolean;
	optionsConnected: boolean;
	symbolCount: number;
	contractCount: number;
	quotesPerMinute: number;
	optionsQuotesPerMinute: number;
	lastMessageAgo: number;
	avgLatency: number;
	reconnectAttempts: number;
	lastMessageTimestamp: number | null;
	latencyQueue: number[];
	stockQuoteTimestamps: number[];
	optionsQuoteTimestamps: number[];
}

export interface StreamingMetricsActions {
	recordStockQuote: (serverTimestamp?: number) => void;
	recordOptionsQuote: (serverTimestamp?: number) => void;
	setStocksConnected: (connected: boolean) => void;
	setOptionsConnected: (connected: boolean) => void;
	setSymbolCount: (count: number) => void;
	setContractCount: (count: number) => void;
	setReconnectAttempts: (attempts: number) => void;
	tick: () => void;
	reset: () => void;
}

export type StreamingMetricsStore = StreamingMetricsState & StreamingMetricsActions;

const LATENCY_QUEUE_SIZE = 100;
const QUOTE_WINDOW_MS = 60000;

const initialState: StreamingMetricsState = {
	stocksConnected: false,
	optionsConnected: false,
	symbolCount: 0,
	contractCount: 0,
	quotesPerMinute: 0,
	optionsQuotesPerMinute: 0,
	lastMessageAgo: 0,
	avgLatency: 0,
	reconnectAttempts: 0,
	lastMessageTimestamp: null,
	latencyQueue: [],
	stockQuoteTimestamps: [],
	optionsQuoteTimestamps: [],
};

type StreamingSet = (
	partial:
		| Partial<StreamingMetricsStore>
		| ((state: StreamingMetricsStore) => Partial<StreamingMetricsStore>),
) => void;
type StreamingGet = () => StreamingMetricsStore;

function updateLatencyQueue(
	latencyQueue: number[],
	now: number,
	serverTimestamp?: number,
): { queue: number[]; avgLatency: number } {
	const queue =
		typeof serverTimestamp === "number"
			? [...latencyQueue, now - serverTimestamp].slice(-LATENCY_QUEUE_SIZE)
			: latencyQueue;
	const avgLatency =
		queue.length > 0 ? queue.reduce((sum, latency) => sum + latency, 0) / queue.length : 0;
	return { queue, avgLatency };
}

function getRecentTimestamps(timestamps: number[], now: number): number[] {
	const cutoff = now - QUOTE_WINDOW_MS;
	return timestamps.filter((timestamp) => timestamp > cutoff);
}

function recordQuote(
	set: StreamingSet,
	get: StreamingGet,
	type: "stock" | "options",
	serverTimestamp?: number,
): void {
	const now = Date.now();
	const state = get();
	const { queue, avgLatency } = updateLatencyQueue(state.latencyQueue, now, serverTimestamp);
	const timestamps =
		type === "stock"
			? getRecentTimestamps([...state.stockQuoteTimestamps, now], now)
			: getRecentTimestamps([...state.optionsQuoteTimestamps, now], now);

	set({
		lastMessageTimestamp: now,
		lastMessageAgo: 0,
		latencyQueue: queue,
		avgLatency,
		stockQuoteTimestamps: type === "stock" ? timestamps : state.stockQuoteTimestamps,
		optionsQuoteTimestamps: type === "options" ? timestamps : state.optionsQuoteTimestamps,
		quotesPerMinute: type === "stock" ? timestamps.length : state.quotesPerMinute,
		optionsQuotesPerMinute: type === "options" ? timestamps.length : state.optionsQuotesPerMinute,
	});
}

function createStreamingActions(set: StreamingSet, get: StreamingGet): StreamingMetricsActions {
	return {
		recordStockQuote: (serverTimestamp) => recordQuote(set, get, "stock", serverTimestamp),
		recordOptionsQuote: (serverTimestamp) => recordQuote(set, get, "options", serverTimestamp),
		setStocksConnected: (connected) => {
			set({ stocksConnected: connected });
		},
		setOptionsConnected: (connected) => {
			set({ optionsConnected: connected });
		},
		setSymbolCount: (count) => {
			set({ symbolCount: count });
		},
		setContractCount: (count) => {
			set({ contractCount: count });
		},
		setReconnectAttempts: (attempts) => {
			set({ reconnectAttempts: attempts });
		},
		tick: () => {
			const state = get();
			const now = Date.now();
			const stockQuoteTimestamps = getRecentTimestamps(state.stockQuoteTimestamps, now);
			const optionsQuoteTimestamps = getRecentTimestamps(state.optionsQuoteTimestamps, now);
			set({
				lastMessageAgo: state.lastMessageTimestamp ? now - state.lastMessageTimestamp : 0,
				stockQuoteTimestamps,
				optionsQuoteTimestamps,
				quotesPerMinute: stockQuoteTimestamps.length,
				optionsQuotesPerMinute: optionsQuoteTimestamps.length,
			});
		},
		reset: () => {
			set(initialState);
		},
	};
}

export const useStreamingMetricsStore = create<StreamingMetricsStore>()((set, get) => ({
	...initialState,
	...createStreamingActions(set, get),
}));

export function getHealthStatus(state: StreamingMetricsState): HealthStatus {
	if (!state.stocksConnected && !state.optionsConnected) {
		return "disconnected";
	}

	if (state.avgLatency > 500 || state.lastMessageAgo > 5000) {
		return "degraded";
	}

	return "healthy";
}

export function useHealthStatus(): HealthStatus {
	return useStreamingMetricsStore((state) => getHealthStatus(state));
}

export function useStocksConnected(): boolean {
	return useStreamingMetricsStore((state) => state.stocksConnected);
}

export function useOptionsConnected(): boolean {
	return useStreamingMetricsStore((state) => state.optionsConnected);
}

export function useStreamingMetrics() {
	return useStreamingMetricsStore(
		useShallow((state) => ({
			stocksConnected: state.stocksConnected,
			optionsConnected: state.optionsConnected,
			symbolCount: state.symbolCount,
			contractCount: state.contractCount,
			quotesPerMinute: state.quotesPerMinute,
			optionsQuotesPerMinute: state.optionsQuotesPerMinute,
			lastMessageAgo: state.lastMessageAgo,
			avgLatency: state.avgLatency,
			reconnectAttempts: state.reconnectAttempts,
			healthStatus: getHealthStatus(state),
		})),
	);
}

export default useStreamingMetricsStore;
