/**
 * WebSocket Cache Invalidation
 *
 * Handles TanStack Query cache invalidation triggered by WebSocket messages.
 * Uses debouncing to avoid excessive refetches from rapid message bursts.
 *
 * @see docs/plans/ui/07-state-management.md lines 47-66
 * @see docs/plans/ui/40-streaming-data-integration.md Part 4.2
 */

import { type CyclePhase, useCycleStore } from "@/stores/cycle-store";
import { getQueryClient, queryKeys } from "./query-client";
import type { OptionsChainResponse } from "./types";

// ============================================
// Debounced Invalidation
// ============================================

/** Pending invalidation keys, grouped by category for efficient debouncing */
const pendingInvalidations = new Set<string>();

/** Debounce timer reference */
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounce delay in milliseconds */
const DEBOUNCE_MS = 100;

/**
 * Map server invalidation hints to TanStack Query keys.
 * The server sends dot-notation strings like "portfolio.positions".
 */
function mapInvalidationHintToQueryKey(hint: string): readonly unknown[] | null {
	const parts = hint.split(".");

	switch (parts[0]) {
		case "portfolio":
			if (parts[1] === "positions") {
				return parts[2] ? queryKeys.portfolio.position(parts[2]) : queryKeys.portfolio.positions();
			}
			if (parts[1] === "summary") {
				return queryKeys.portfolio.summary();
			}
			if (parts[1] === "account") {
				return queryKeys.portfolio.account();
			}
			return queryKeys.portfolio.all;

		case "orders":
			// Orders are not in queryKeys, invalidate decisions as fallback
			return queryKeys.decisions.all;

		case "decisions":
			if (parts[1]) {
				return queryKeys.decisions.detail(parts[1]);
			}
			return queryKeys.decisions.all;

		case "market":
			if (parts[1]) {
				if (parts[2] === "quote") {
					return queryKeys.market.quote(parts[1]);
				}
				return queryKeys.market.symbol(parts[1]);
			}
			return queryKeys.market.all;

		case "system":
			if (parts[1] === "status") {
				return queryKeys.system.status();
			}
			return queryKeys.system.all;

		case "options":
			if (parts[1] === "chain" && parts[2]) {
				return parts[3]
					? queryKeys.options.chain(parts[2], parts[3])
					: queryKeys.options.chain(parts[2]);
			}
			if (parts[1] === "quote" && parts[2]) {
				return queryKeys.options.quote(parts[2]);
			}
			return queryKeys.options.all;

		case "alerts":
			return queryKeys.alerts.all;

		default:
			return null;
	}
}

/**
 * Queue an invalidation hint for debounced processing.
 */
function queueInvalidation(hint: string): void {
	pendingInvalidations.add(hint);
	scheduleFlush();
}

/**
 * Queue multiple invalidation hints.
 */
function queueInvalidations(hints: string[]): void {
	for (const hint of hints) {
		pendingInvalidations.add(hint);
	}
	scheduleFlush();
}

/**
 * Schedule a debounced flush of pending invalidations.
 */
function scheduleFlush(): void {
	if (debounceTimer !== null) {
		return; // Already scheduled
	}

	debounceTimer = setTimeout(() => {
		flushPendingInvalidations();
		debounceTimer = null;
	}, DEBOUNCE_MS);
}

/**
 * Flush all pending invalidations immediately.
 */
function flushPendingInvalidations(): void {
	if (pendingInvalidations.size === 0) {
		return;
	}

	const queryClient = getQueryClient();
	const processedKeys = new Set<string>();

	for (const hint of pendingInvalidations) {
		const queryKey = mapInvalidationHintToQueryKey(hint);
		if (queryKey) {
			const keyString = JSON.stringify(queryKey);
			// Avoid invalidating the same key multiple times
			if (!processedKeys.has(keyString)) {
				processedKeys.add(keyString);
				queryClient.invalidateQueries({ queryKey });
			}
		}
	}

	pendingInvalidations.clear();
}

// ============================================
// Message Types
// ============================================

export type WSMessageType =
	| "quote"
	| "aggregate"
	| "options_quote"
	| "options_trade"
	| "options_aggregate"
	| "order"
	| "decision"
	| "agent_output"
	| "cycle_progress"
	| "cycle_result"
	| "alert"
	| "system_status"
	| "account_update"
	| "position_update"
	| "order_update"
	| "portfolio_update"
	| "portfolio";

export interface WSMessage<T = unknown> {
	type: WSMessageType;
	data: T;
	timestamp?: string;
	/** Server-provided cache invalidation hints */
	invalidates?: string[];
}

export interface QuoteData {
	symbol: string;
	bid: number;
	ask: number;
	last: number;
	volume: number;
	timestamp: string;
	bidSize?: number;
	askSize?: number;
	prevClose?: number;
	changePercent?: number;
}

export interface AggregateData {
	symbol: string;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
	timestamp: string;
}

export interface Candle {
	timestamp: string;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
}

export interface OrderData {
	id: string;
	symbol: string;
	status: string;
	filledQty?: number;
	avgPrice?: number;
}

export interface DecisionData {
	id: string;
	symbol: string;
	action: string;
	status: string;
}

export interface AgentOutputData {
	decisionId: string;
	agentType: string;
	status: "processing" | "complete";
	vote?: "APPROVE" | "REJECT" | "ABSTAIN";
	confidence?: number;
	reasoning?: string;
	output?: string;
}

export interface CycleProgressData {
	cycleId: string;
	phase: CyclePhase;
	step: string;
	progress: number;
	message: string;
	activeSymbol?: string;
	totalSymbols?: number;
	completedSymbols?: number;
	startedAt?: string;
	estimatedCompletion?: string;
	timestamp: string;
}

export interface CycleResultData {
	cycleId: string;
	environment: string;
	status: "completed" | "failed";
	result?: {
		approved: boolean;
		iterations: number;
		decisions: unknown[];
		orders: unknown[];
	};
	error?: string;
	durationMs: number;
	configVersion?: string;
	timestamp: string;
}

export interface SystemStatusData {
	status: "running" | "paused" | "stopped" | "error";
	lastCycleId?: string;
	lastCycleTime?: string;
	nextCycleAt?: string;
}

export interface OptionsQuoteData {
	contract: string;
	underlying: string;
	bid: number;
	ask: number;
	bidSize?: number;
	askSize?: number;
	last?: number;
	timestamp: string;
}

export interface OptionsTradeData {
	contract: string;
	underlying: string;
	price: number;
	size: number;
	timestamp: string;
}

/**
 * Parse OCC option symbol to extract expiration date.
 * Format: {underlying}{YYMMDD}{C|P}{strike}
 * Example: AAPL250117C00180000 -> { underlying: 'AAPL', expiration: '2025-01-17' }
 */
function parseOccSymbol(symbol: string): { underlying: string; expiration: string } | null {
	const match = symbol.match(/^([A-Z]+)(\d{6})([CP])(\d{8})$/);
	if (!match) {
		return null;
	}

	const [, underlying, expStr] = match;
	if (!underlying || !expStr) {
		return null;
	}

	const year = 2000 + Number.parseInt(expStr.slice(0, 2), 10);
	const month = expStr.slice(2, 4);
	const day = expStr.slice(4, 6);

	return {
		underlying,
		expiration: `${year}-${month}-${day}`,
	};
}

export function handleWSMessage(message: WSMessage): void {
	const queryClient = getQueryClient();

	switch (message.type) {
		case "quote": {
			const quote = message.data as QuoteData;
			// Direct cache update avoids refetch latency for high-frequency quote data
			queryClient.setQueryData(queryKeys.market.quote(quote.symbol), quote);
			break;
		}

		case "aggregate": {
			const agg = message.data as AggregateData;
			// Update all candle caches for this symbol (any timeframe/limit)
			// This handles real-time candle updates from WebSocket
			const queries = queryClient.getQueriesData<Candle[]>({
				queryKey: [...queryKeys.market.all, "candles", agg.symbol],
				exact: false,
			});

			for (const [queryKey, oldData] of queries) {
				if (!oldData || oldData.length === 0) {
					continue;
				}

				const lastCandle = oldData[oldData.length - 1];
				if (!lastCandle) {
					continue;
				}

				const updateTime = new Date(agg.timestamp).getTime();
				const lastCandleTime = new Date(lastCandle.timestamp).getTime();

				let newData: Candle[];

				if (updateTime === lastCandleTime) {
					// Same timestamp - update existing candle
					const updatedCandle: Candle = {
						...lastCandle,
						close: agg.close,
						high: Math.max(lastCandle.high, agg.high),
						low: Math.min(lastCandle.low, agg.low),
						volume: agg.volume,
					};
					newData = [...oldData.slice(0, -1), updatedCandle];
				} else if (updateTime > lastCandleTime) {
					// New candle - append
					const newCandle: Candle = {
						timestamp: agg.timestamp,
						open: agg.open,
						high: agg.high,
						low: agg.low,
						close: agg.close,
						volume: agg.volume,
					};
					// Extract limit from query key (last element)
					const limit = (queryKey[queryKey.length - 1] as number) || 500;
					newData = [...oldData, newCandle];
					if (newData.length > limit) {
						newData = newData.slice(-limit);
					}
				} else {
					// Old data - ignore
					continue;
				}

				queryClient.setQueryData(queryKey, newData);
			}
			break;
		}

		case "options_quote": {
			const optQuote = message.data as OptionsQuoteData;

			const parsed = parseOccSymbol(optQuote.contract);
			if (!parsed) {
				break;
			}

			// Find and update the options chain cache
			const chainQueryKey = queryKeys.options.chain(parsed.underlying, parsed.expiration);
			const chainData = queryClient.getQueryData<OptionsChainResponse>(chainQueryKey);

			if (chainData?.chain) {
				// Find the contract in the chain and update it
				let foundContract = false;
				const updatedChain = chainData.chain.map((row) => {
					if (row.call?.symbol === optQuote.contract) {
						foundContract = true;
						return {
							...row,
							call: {
								...row.call,
								bid: optQuote.bid,
								ask: optQuote.ask,
								last: optQuote.last ?? row.call.last,
							},
						};
					}
					if (row.put?.symbol === optQuote.contract) {
						foundContract = true;
						return {
							...row,
							put: {
								...row.put,
								bid: optQuote.bid,
								ask: optQuote.ask,
								last: optQuote.last ?? row.put.last,
							},
						};
					}
					return row;
				});
				if (foundContract) {
				}

				queryClient.setQueryData<OptionsChainResponse>(chainQueryKey, {
					...chainData,
					chain: updatedChain,
				});
			}
			break;
		}

		case "options_trade": {
			const optTrade = message.data as OptionsTradeData;
			const parsed = parseOccSymbol(optTrade.contract);
			if (!parsed) {
				break;
			}

			// Find and update the options chain cache with last trade price
			const chainQueryKey = queryKeys.options.chain(parsed.underlying, parsed.expiration);
			const chainData = queryClient.getQueryData<OptionsChainResponse>(chainQueryKey);

			if (chainData?.chain) {
				const updatedChain = chainData.chain.map((row) => {
					if (row.call?.symbol === optTrade.contract) {
						return {
							...row,
							call: {
								...row.call,
								last: optTrade.price,
								volume: (row.call.volume ?? 0) + optTrade.size,
							},
						};
					}
					if (row.put?.symbol === optTrade.contract) {
						return {
							...row,
							put: {
								...row.put,
								last: optTrade.price,
								volume: (row.put.volume ?? 0) + optTrade.size,
							},
						};
					}
					return row;
				});

				queryClient.setQueryData<OptionsChainResponse>(chainQueryKey, {
					...chainData,
					chain: updatedChain,
				});
			}
			break;
		}

		case "options_aggregate": {
			// Options aggregates are less frequent - just invalidate to refetch
			const aggData = message.data as { contract: string; underlying: string };
			const parsed = parseOccSymbol(aggData.contract);
			if (parsed) {
				queueInvalidation(`options.chain.${parsed.underlying}.${parsed.expiration}`);
			}
			break;
		}

		case "system_status": {
			// NOTE: WebSocket system_status is for health checks (healthy/unhealthy),
			// NOT trading system status (ACTIVE/PAUSED/STOPPED).
			// Don't update the system status query here - it's handled by REST API.
			break;
		}

		case "order": {
			// Use debounced invalidation for order bursts
			queueInvalidations(["portfolio.positions", "portfolio.summary"]);
			break;
		}

		case "decision": {
			// Use debounced invalidation for decision updates
			queueInvalidation("decisions");
			break;
		}

		case "agent_output": {
			const data = message.data as AgentOutputData;
			const store = useCycleStore.getState();

			if (data.status === "processing") {
				// Streaming partial output
				store.setStreamingOutput({
					agentType: data.agentType,
					text: data.output || "",
				});
			} else if (data.status === "complete") {
				// Agent finished - save final output and clear streaming
				store.updateAgentOutput({
					decisionId: data.decisionId,
					agentType: data.agentType,
					vote: data.vote || "ABSTAIN",
					confidence: data.confidence || 0,
					reasoningSummary: data.reasoning,
					timestamp: new Date().toISOString(),
				});
				store.setStreamingOutput(null);
			}

			// Also invalidate decision detail for vote display
			queryClient.invalidateQueries({
				queryKey: queryKeys.decisions.detail(data.decisionId),
			});
			break;
		}

		case "cycle_progress": {
			const data = message.data as CycleProgressData;
			const store = useCycleStore.getState();

			// Normalize phase to lowercase for cycle-store compatibility
			const normalizedPhase = data.phase.toLowerCase() as CyclePhase;

			// Update cycle store with progress
			store.setCycle({
				id: data.cycleId,
				phase: normalizedPhase,
				progress: data.progress,
				startedAt: data.startedAt ?? data.timestamp,
				estimatedEndAt: data.estimatedCompletion,
			});

			// Update phase explicitly in case setCycle doesn't update it
			store.updatePhase(normalizedPhase);
			store.updateProgress(data.progress);

			// Also invalidate system status
			queryClient.invalidateQueries({ queryKey: queryKeys.system.status() });
			break;
		}

		case "cycle_result": {
			const data = message.data as CycleResultData;
			const store = useCycleStore.getState();

			if (data.status === "completed") {
				// Mark cycle as complete
				store.completeCycle();
			} else if (data.status === "failed") {
				// Reset the store on failure
				store.reset();
			}

			// Use debounced invalidation for multiple query types
			queueInvalidations(["system.status", "decisions", "portfolio"]);
			break;
		}

		case "alert": {
			// Use debounced invalidation for alert bursts
			queueInvalidation("alerts");
			break;
		}

		case "account_update": {
			// Use server-provided invalidation hints if available
			if (message.invalidates?.length) {
				queueInvalidations(message.invalidates);
			} else {
				// Fallback to default invalidation
				queueInvalidation("portfolio.account");
			}
			break;
		}

		case "position_update": {
			// Use server-provided invalidation hints if available
			if (message.invalidates?.length) {
				queueInvalidations(message.invalidates);
			} else {
				// Fallback to default invalidation
				queueInvalidation("portfolio.positions");
			}
			break;
		}

		case "order_update": {
			// Use server-provided invalidation hints if available
			if (message.invalidates?.length) {
				queueInvalidations(message.invalidates);
			} else {
				// Fallback to default invalidation
				queueInvalidations(["portfolio.positions", "portfolio.summary"]);
			}
			break;
		}

		case "portfolio_update":
		case "portfolio": {
			queryClient.invalidateQueries({ queryKey: queryKeys.portfolio.all });
			break;
		}

		default:
	}
}

/**
 * Create a WebSocket message handler bound to the query client.
 *
 * @example
 * ```typescript
 * const handler = createWSMessageHandler();
 * websocket.addEventListener('message', (event) => {
 *   handler(JSON.parse(event.data));
 * });
 * ```
 */
export function createWSMessageHandler() {
	return handleWSMessage;
}

/**
 * Immediately flush all pending debounced invalidations.
 *
 * Call this when you need to force an immediate cache refresh,
 * such as before navigation or when the user explicitly requests it.
 */
export function flushInvalidations(): void {
	if (debounceTimer !== null) {
		clearTimeout(debounceTimer);
		debounceTimer = null;
	}
	flushPendingInvalidations();
}

/**
 * Queue invalidation hints for debounced processing.
 * Exported for direct use when handling custom messages.
 */
export { queueInvalidation, queueInvalidations };

export default handleWSMessage;
