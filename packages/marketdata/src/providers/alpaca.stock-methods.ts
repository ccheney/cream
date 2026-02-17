import type {
	AlpacaBar,
	AlpacaQuote,
	AlpacaRequestFn,
	AlpacaSnapshot,
	AlpacaTimeframe,
	AlpacaTrade,
} from "./alpaca.schemas";

type RawMarketQuote = {
	bp?: number;
	bs?: number;
	ap?: number;
	as?: number;
	bx?: string;
	ax?: string;
	t?: string;
	c?: string[];
	z?: string;
};

type RawMarketTrade = {
	p?: number;
	s?: number;
	t?: string;
	x?: string;
	i?: number;
	c?: string[];
	z?: string;
};

type RawMarketBar = {
	o?: number;
	h?: number;
	l?: number;
	c?: number;
	v?: number;
	t?: string;
	vw?: number;
	n?: number;
};

function toQuote(symbol: string, raw: RawMarketQuote): AlpacaQuote {
	return {
		symbol,
		bidPrice: raw.bp ?? 0,
		bidSize: raw.bs ?? 0,
		askPrice: raw.ap ?? 0,
		askSize: raw.as ?? 0,
		bidExchange: raw.bx,
		askExchange: raw.ax,
		timestamp: raw.t ?? new Date().toISOString(),
		conditions: raw.c,
		tape: raw.z,
	};
}

function toTrade(symbol: string, raw: RawMarketTrade): AlpacaTrade {
	return {
		symbol,
		price: raw.p ?? 0,
		size: raw.s ?? 0,
		timestamp: raw.t ?? "",
		exchange: raw.x,
		id: raw.i,
		conditions: raw.c,
		tape: raw.z,
	};
}

function toBar(symbol: string, raw: RawMarketBar): AlpacaBar {
	return {
		symbol,
		open: raw.o ?? 0,
		high: raw.h ?? 0,
		low: raw.l ?? 0,
		close: raw.c ?? 0,
		volume: raw.v ?? 0,
		timestamp: raw.t ?? "",
		vwap: raw.vw,
		tradeCount: raw.n,
	};
}

function toSnapshot(symbol: string, snapshot: Record<string, unknown>): AlpacaSnapshot {
	const quote = snapshot.latestQuote as RawMarketQuote | undefined;
	const trade = snapshot.latestTrade as RawMarketTrade | undefined;
	const minuteBar = snapshot.minuteBar as RawMarketBar | undefined;
	const dailyBar = snapshot.dailyBar as RawMarketBar | undefined;
	const prevDailyBar = snapshot.prevDailyBar as RawMarketBar | undefined;
	return {
		symbol,
		latestQuote: quote ? toQuote(symbol, quote) : undefined,
		latestTrade: trade ? toTrade(symbol, trade) : undefined,
		minuteBar: minuteBar ? toBar(symbol, minuteBar) : undefined,
		dailyBar: dailyBar ? toBar(symbol, dailyBar) : undefined,
		prevDailyBar: prevDailyBar ? toBar(symbol, prevDailyBar) : undefined,
	};
}

export async function getQuotes(
	request: AlpacaRequestFn,
	symbols: string[],
): Promise<Map<string, AlpacaQuote>> {
	const result = new Map<string, AlpacaQuote>();
	try {
		const response = await request<{ quotes: Record<string, unknown> }>(
			"/v2/stocks/quotes/latest",
			{
				symbols: symbols.join(","),
			},
		);
		if (!response?.quotes) {
			return result;
		}
		for (const [symbol, quote] of Object.entries(response.quotes)) {
			result.set(symbol, toQuote(symbol, quote as RawMarketQuote));
		}
	} catch {
		return result;
	}
	return result;
}

export async function getBars(
	request: AlpacaRequestFn,
	symbol: string,
	timeframe: AlpacaTimeframe,
	start: string,
	end: string,
	limit?: number,
): Promise<AlpacaBar[]> {
	const bars: AlpacaBar[] = [];
	try {
		const response = await request<{ bars: Record<string, unknown[]> }>("/v2/stocks/bars", {
			symbols: symbol,
			timeframe,
			start,
			end,
			limit: limit ?? 10000,
		});
		const symbolBars = response?.bars?.[symbol];
		if (!Array.isArray(symbolBars)) {
			return bars;
		}
		for (const bar of symbolBars) {
			bars.push(toBar(symbol, bar as RawMarketBar));
		}
	} catch {
		return bars;
	}
	return bars;
}

export async function getSnapshots(
	request: AlpacaRequestFn,
	symbols: string[],
): Promise<Map<string, AlpacaSnapshot>> {
	const result = new Map<string, AlpacaSnapshot>();
	try {
		const response = await request<Record<string, unknown>>("/v2/stocks/snapshots", {
			symbols: symbols.join(","),
		});
		for (const [symbol, snapshot] of Object.entries(response)) {
			result.set(symbol, toSnapshot(symbol, snapshot as Record<string, unknown>));
		}
	} catch {
		return result;
	}
	return result;
}

export async function getLatestTrades(
	request: AlpacaRequestFn,
	symbols: string[],
): Promise<Map<string, AlpacaTrade>> {
	const result = new Map<string, AlpacaTrade>();
	try {
		const response = await request<{ trades: Record<string, unknown> }>(
			"/v2/stocks/trades/latest",
			{
				symbols: symbols.join(","),
			},
		);
		if (!response?.trades) {
			return result;
		}
		for (const [symbol, trade] of Object.entries(response.trades)) {
			result.set(symbol, toTrade(symbol, trade as RawMarketTrade));
		}
	} catch {
		return result;
	}
	return result;
}
