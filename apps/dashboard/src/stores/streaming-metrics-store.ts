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

export const useStreamingMetricsStore = create<StreamingMetricsStore>()((set, get) => ({
	...initialState,

	recordStockQuote: (serverTimestamp) => {
		const now = Date.now();
		const state = get();

		let newLatencyQueue = state.latencyQueue;
		if (serverTimestamp) {
			const latency = now - serverTimestamp;
			newLatencyQueue = [...state.latencyQueue, latency].slice(-LATENCY_QUEUE_SIZE);
		}

		const cutoff = now - QUOTE_WINDOW_MS;
		const newQuoteTimestamps = [...state.stockQuoteTimestamps, now].filter((t) => t > cutoff);

		const avgLatency =
			newLatencyQueue.length > 0
				? newLatencyQueue.reduce((a, b) => a + b, 0) / newLatencyQueue.length
				: 0;

		set({
			lastMessageTimestamp: now,
			lastMessageAgo: 0,
			latencyQueue: newLatencyQueue,
			avgLatency,
			stockQuoteTimestamps: newQuoteTimestamps,
			quotesPerMinute: newQuoteTimestamps.length,
		});
	},

	recordOptionsQuote: (serverTimestamp) => {
		const now = Date.now();
		const state = get();

		let newLatencyQueue = state.latencyQueue;
		if (serverTimestamp) {
			const latency = now - serverTimestamp;
			newLatencyQueue = [...state.latencyQueue, latency].slice(-LATENCY_QUEUE_SIZE);
		}

		const cutoff = now - QUOTE_WINDOW_MS;
		const newQuoteTimestamps = [...state.optionsQuoteTimestamps, now].filter((t) => t > cutoff);

		const avgLatency =
			newLatencyQueue.length > 0
				? newLatencyQueue.reduce((a, b) => a + b, 0) / newLatencyQueue.length
				: 0;

		set({
			lastMessageTimestamp: now,
			lastMessageAgo: 0,
			latencyQueue: newLatencyQueue,
			avgLatency,
			optionsQuoteTimestamps: newQuoteTimestamps,
			optionsQuotesPerMinute: newQuoteTimestamps.length,
		});
	},

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

		const lastMessageAgo = state.lastMessageTimestamp ? now - state.lastMessageTimestamp : 0;

		const cutoff = now - QUOTE_WINDOW_MS;
		const stockQuoteTimestamps = state.stockQuoteTimestamps.filter((t) => t > cutoff);
		const optionsQuoteTimestamps = state.optionsQuoteTimestamps.filter((t) => t > cutoff);

		set({
			lastMessageAgo,
			stockQuoteTimestamps,
			optionsQuoteTimestamps,
			quotesPerMinute: stockQuoteTimestamps.length,
			optionsQuotesPerMinute: optionsQuoteTimestamps.length,
		});
	},

	reset: () => {
		set(initialState);
	},
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
		}))
	);
}

export default useStreamingMetricsStore;
