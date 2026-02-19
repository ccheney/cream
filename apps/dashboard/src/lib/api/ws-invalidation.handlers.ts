import type { QueryClient } from "@tanstack/react-query";
import { type CyclePhase, useCycleStore } from "@/stores/cycle-store";
import { queryKeys } from "./query-client";
import type { OptionsChainResponse } from "./types";
import type {
	AgentOutputData,
	AggregateData,
	Candle,
	CycleProgressData,
	CycleResultData,
	OptionsQuoteData,
	OptionsTradeData,
	QuoteData,
	WSMessage,
} from "./ws-invalidation.types";

export interface WSHandlerContext {
	queryClient: QueryClient;
	queueInvalidation: (hint: string) => void;
	queueInvalidations: (hints: string[]) => void;
}

type InvalidationHintResolver = (parts: string[]) => readonly unknown[] | null;

function resolvePortfolioHint(parts: string[]): readonly unknown[] {
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
}

function resolveOrdersHint(parts: string[]): readonly unknown[] {
	return parts[1] === "recent"
		? queryKeys.portfolio.orders({ status: "all" })
		: queryKeys.portfolio.orders();
}

function resolveDecisionsHint(parts: string[]): readonly unknown[] {
	return parts[1] ? queryKeys.decisions.detail(parts[1]) : queryKeys.decisions.all;
}

function resolveMarketHint(parts: string[]): readonly unknown[] {
	if (!parts[1]) {
		return queryKeys.market.all;
	}
	return parts[2] === "quote"
		? queryKeys.market.quote(parts[1])
		: queryKeys.market.symbol(parts[1]);
}

function resolveSystemHint(parts: string[]): readonly unknown[] {
	return parts[1] === "status" ? queryKeys.system.status() : queryKeys.system.all;
}

function resolveOptionsHint(parts: string[]): readonly unknown[] {
	if (parts[1] === "chain" && parts[2]) {
		return parts[3]
			? queryKeys.options.chain(parts[2], parts[3])
			: queryKeys.options.chain(parts[2]);
	}
	if (parts[1] === "quote" && parts[2]) {
		return queryKeys.options.quote(parts[2]);
	}
	return queryKeys.options.all;
}

const HINT_RESOLVERS: Partial<Record<string, InvalidationHintResolver>> = {
	portfolio: resolvePortfolioHint,
	orders: resolveOrdersHint,
	decisions: resolveDecisionsHint,
	market: resolveMarketHint,
	system: resolveSystemHint,
	options: resolveOptionsHint,
	alerts: () => queryKeys.alerts.all,
};

export function mapInvalidationHintToQueryKey(hint: string): readonly unknown[] | null {
	const parts = hint.split(".");
	const category = parts[0];
	if (!category) {
		return null;
	}
	const resolver = HINT_RESOLVERS[category];
	return resolver ? resolver(parts) : null;
}

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

function updateAggregateCandles(queryClient: QueryClient, agg: AggregateData): void {
	const queries = queryClient.getQueriesData<Candle[]>({
		queryKey: [...queryKeys.market.all, "candles", agg.symbol],
		exact: false,
	});

	for (const [queryKey, oldData] of queries) {
		if (!oldData || oldData.length === 0) {
			continue;
		}

		const lastCandle = oldData.at(-1);
		if (!lastCandle) {
			continue;
		}

		const updateTime = new Date(agg.timestamp).getTime();
		const lastCandleTime = new Date(lastCandle.timestamp).getTime();
		if (updateTime < lastCandleTime) {
			continue;
		}

		const newData =
			updateTime === lastCandleTime
				? [
						...oldData.slice(0, -1),
						{
							...lastCandle,
							close: agg.close,
							high: Math.max(lastCandle.high, agg.high),
							low: Math.min(lastCandle.low, agg.low),
							volume: agg.volume,
						},
					]
				: appendCandle(oldData, agg, queryKey);

		queryClient.setQueryData(queryKey, newData);
	}
}

function appendCandle(
	oldData: Candle[],
	agg: AggregateData,
	queryKey: readonly unknown[],
): Candle[] {
	const limit = (queryKey.at(-1) as number) || 500;
	const appended: Candle[] = [
		...oldData,
		{
			timestamp: agg.timestamp,
			open: agg.open,
			high: agg.high,
			low: agg.low,
			close: agg.close,
			volume: agg.volume,
		},
	];
	return appended.length > limit ? appended.slice(-limit) : appended;
}

function updateOptionsQuote(queryClient: QueryClient, optQuote: OptionsQuoteData): void {
	const parsed = parseOccSymbol(optQuote.contract);
	if (!parsed) {
		return;
	}

	const chainQueryKey = queryKeys.options.chain(parsed.underlying, parsed.expiration);
	const chainData = queryClient.getQueryData<OptionsChainResponse>(chainQueryKey);
	if (!chainData?.chain) {
		return;
	}

	const updatedChain = chainData.chain.map((row) => {
		if (row.call?.symbol === optQuote.contract) {
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

	queryClient.setQueryData<OptionsChainResponse>(chainQueryKey, {
		...chainData,
		chain: updatedChain,
	});
}

function updateOptionsTrade(queryClient: QueryClient, optTrade: OptionsTradeData): void {
	const parsed = parseOccSymbol(optTrade.contract);
	if (!parsed) {
		return;
	}

	const chainQueryKey = queryKeys.options.chain(parsed.underlying, parsed.expiration);
	const chainData = queryClient.getQueryData<OptionsChainResponse>(chainQueryKey);
	if (!chainData?.chain) {
		return;
	}

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

function queueInvalidatesOrFallback(
	message: WSMessage,
	queueInvalidation: (hint: string) => void,
	queueInvalidations: (hints: string[]) => void,
	fallback: string | string[],
): void {
	if (message.invalidates?.length) {
		queueInvalidations(message.invalidates);
		return;
	}

	if (Array.isArray(fallback)) {
		queueInvalidations(fallback);
		return;
	}

	queueInvalidation(fallback);
}

function handleAgentOutput(message: WSMessage, queryClient: QueryClient): void {
	const data = message.data as AgentOutputData;
	const store = useCycleStore.getState();

	if (data.status === "processing") {
		store.setStreamingOutput({
			agentType: data.agentType,
			text: data.output || "",
		});
	} else if (data.status === "complete") {
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

	queryClient.invalidateQueries({
		queryKey: queryKeys.decisions.detail(data.decisionId),
	});
}

function handleCycleProgress(message: WSMessage, queryClient: QueryClient): void {
	const data = message.data as CycleProgressData;
	const store = useCycleStore.getState();
	const normalizedPhase = data.phase.toLowerCase() as CyclePhase;

	store.setCycle({
		id: data.cycleId,
		phase: normalizedPhase,
		progress: data.progress,
		startedAt: data.startedAt ?? data.timestamp,
		estimatedEndAt: data.estimatedCompletion,
	});
	store.updatePhase(normalizedPhase);
	store.updateProgress(data.progress);

	queryClient.invalidateQueries({ queryKey: queryKeys.system.status() });
}

function handleCycleResult(
	message: WSMessage,
	queueInvalidations: (hints: string[]) => void,
): void {
	const data = message.data as CycleResultData;
	const store = useCycleStore.getState();

	if (data.status === "completed") {
		store.completeCycle();
	} else if (data.status === "failed") {
		store.reset();
	}

	queueInvalidations(["system.status", "decisions", "portfolio"]);
}

function handleQuote(message: WSMessage, queryClient: QueryClient): void {
	const quote = message.data as QuoteData;
	queryClient.setQueryData(queryKeys.market.quote(quote.symbol), quote);
}

function handleOptionsAggregate(
	message: WSMessage,
	queueInvalidation: (hint: string) => void,
): void {
	const aggData = message.data as { contract: string };
	const parsed = parseOccSymbol(aggData.contract);
	if (parsed) {
		queueInvalidation(`options.chain.${parsed.underlying}.${parsed.expiration}`);
	}
}

type WSMessageHandler = (message: WSMessage, context: WSHandlerContext) => void;

const WS_MESSAGE_HANDLERS: Partial<Record<WSMessage["type"], WSMessageHandler>> = {
	quote: (message, { queryClient }) => {
		handleQuote(message, queryClient);
	},
	aggregate: (message, { queryClient }) => {
		updateAggregateCandles(queryClient, message.data as AggregateData);
	},
	options_quote: (message, { queryClient }) => {
		updateOptionsQuote(queryClient, message.data as OptionsQuoteData);
	},
	options_trade: (message, { queryClient }) => {
		updateOptionsTrade(queryClient, message.data as OptionsTradeData);
	},
	options_aggregate: (message, { queueInvalidation }) => {
		handleOptionsAggregate(message, queueInvalidation);
	},
	system_status: () => {},
	order: (_, { queueInvalidations }) => {
		queueInvalidations(["portfolio.positions", "portfolio.summary"]);
	},
	decision: (_, { queueInvalidation }) => {
		queueInvalidation("decisions");
	},
	agent_output: (message, { queryClient }) => {
		handleAgentOutput(message, queryClient);
	},
	cycle_progress: (message, { queryClient }) => {
		handleCycleProgress(message, queryClient);
	},
	cycle_result: (message, { queueInvalidations }) => {
		handleCycleResult(message, queueInvalidations);
	},
	alert: (_, { queueInvalidation }) => {
		queueInvalidation("alerts");
	},
	account_update: (message, { queueInvalidation, queueInvalidations }) => {
		queueInvalidatesOrFallback(message, queueInvalidation, queueInvalidations, "portfolio.account");
	},
	position_update: (message, { queueInvalidation, queueInvalidations }) => {
		queueInvalidatesOrFallback(
			message,
			queueInvalidation,
			queueInvalidations,
			"portfolio.positions",
		);
	},
	order_update: (message, { queueInvalidation, queueInvalidations }) => {
		queueInvalidatesOrFallback(message, queueInvalidation, queueInvalidations, [
			"orders",
			"portfolio.positions",
			"portfolio.summary",
		]);
	},
	portfolio_update: (_, { queryClient }) => {
		queryClient.invalidateQueries({ queryKey: queryKeys.portfolio.all });
	},
	portfolio: (_, { queryClient }) => {
		queryClient.invalidateQueries({ queryKey: queryKeys.portfolio.all });
	},
	worker_run_update: (_, { queryClient }) => {
		queryClient.invalidateQueries({ queryKey: queryKeys.workers.all });
	},
};

export function handleWSMessageWithContext(message: WSMessage, context: WSHandlerContext): void {
	const handler = WS_MESSAGE_HANDLERS[message.type];
	if (handler) {
		handler(message, context);
	}
}
