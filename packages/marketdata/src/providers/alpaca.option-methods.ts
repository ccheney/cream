import type {
	AlpacaOptionContract,
	AlpacaOptionSnapshot,
	AlpacaQueryParams,
	AlpacaRequestFn,
	OptionContractParams,
} from "./alpaca.schemas";

const OPTION_BATCH_SIZE = 100;

type RawOptionQuote = {
	bp?: number;
	bs?: number;
	ap?: number;
	as?: number;
	bx?: string;
	ax?: string;
	t?: string;
};

type RawOptionTrade = {
	p?: number;
	s?: number;
	t?: string;
	x?: string;
	c?: string[];
};

type RawOptionGreeks = {
	delta?: number;
	gamma?: number;
	theta?: number;
	vega?: number;
	rho?: number;
};

type OptionBatchResult = {
	snapshots: Record<string, unknown>;
	bars: Record<string, unknown[]>;
};

function splitIntoBatches<T>(values: T[], batchSize: number): T[][] {
	const batches: T[][] = [];
	for (let i = 0; i < values.length; i += batchSize) {
		batches.push(values.slice(i, i + batchSize));
	}
	return batches;
}

function parseStrikePrice(rawStrike: unknown): number {
	if (typeof rawStrike === "string") {
		return Number.parseFloat(rawStrike);
	}
	return typeof rawStrike === "number" ? rawStrike : 0;
}

function toOptionContract(
	underlying: string,
	contract: Record<string, unknown>,
): AlpacaOptionContract {
	return {
		symbol: (contract.symbol as string) ?? "",
		name: contract.name as string | undefined,
		status: contract.status as string | undefined,
		tradable: contract.tradable as boolean | undefined,
		expirationDate: (contract.expiration_date as string) ?? "",
		rootSymbol: contract.root_symbol as string | undefined,
		underlyingSymbol: (contract.underlying_symbol as string) ?? underlying,
		underlyingAssetId: contract.underlying_asset_id as string | undefined,
		type: (contract.type as "call" | "put") ?? "call",
		style: contract.style as string | undefined,
		strikePrice: parseStrikePrice(contract.strike_price),
		multiplier: contract.multiplier as number | undefined,
		size: contract.size as number | undefined,
		openInterest: contract.open_interest as number | undefined,
		openInterestDate: contract.open_interest_date as string | undefined,
		closePrice: contract.close_price as number | undefined,
		closePriceDate: contract.close_price_date as string | undefined,
	};
}

function toOptionSnapshot(
	symbol: string,
	tradingDay: string,
	dailyVolume: number,
	snapshot: Record<string, unknown>,
): AlpacaOptionSnapshot {
	const quote = snapshot.latestQuote as RawOptionQuote | undefined;
	const trade = snapshot.latestTrade as RawOptionTrade | undefined;
	const greeks = snapshot.greeks as RawOptionGreeks | undefined;

	return {
		symbol,
		latestQuote: quote
			? {
					bidPrice: quote.bp ?? 0,
					bidSize: quote.bs ?? 0,
					askPrice: quote.ap ?? 0,
					askSize: quote.as ?? 0,
					bidExchange: quote.bx,
					askExchange: quote.ax,
					timestamp: quote.t ?? "",
				}
			: undefined,
		latestTrade: trade
			? {
					price: trade.p ?? 0,
					size: trade.s ?? 0,
					timestamp: trade.t ?? "",
					exchange: trade.x,
					conditions: trade.c,
				}
			: undefined,
		dailyBar: {
			open: 0,
			high: 0,
			low: 0,
			close: 0,
			volume: dailyVolume,
			timestamp: tradingDay,
		},
		greeks: greeks
			? {
					delta: greeks.delta,
					gamma: greeks.gamma,
					theta: greeks.theta,
					vega: greeks.vega,
					rho: greeks.rho,
				}
			: undefined,
		impliedVolatility: snapshot.impliedVolatility as number | undefined,
	};
}

function mergeBatchResults(results: OptionBatchResult[]): {
	allSnapshots: Record<string, unknown>;
	allBars: Record<string, unknown[]>;
} {
	const allSnapshots: Record<string, unknown> = {};
	const allBars: Record<string, unknown[]> = {};
	for (const { snapshots, bars } of results) {
		Object.assign(allSnapshots, snapshots);
		Object.assign(allBars, bars);
	}
	return { allSnapshots, allBars };
}

function buildVolumeMap(allBars: Record<string, unknown[]>): Map<string, number> {
	const volumeMap = new Map<string, number>();
	for (const [symbol, bars] of Object.entries(allBars)) {
		if (!Array.isArray(bars) || bars.length === 0) {
			continue;
		}
		const firstBar = bars[0] as { v?: number };
		volumeMap.set(symbol, firstBar.v ?? 0);
	}
	return volumeMap;
}

function buildContractQuery(underlying: string, params?: OptionContractParams): AlpacaQueryParams {
	return {
		underlying_symbols: underlying,
		expiration_date_gte: params?.expirationDateGte,
		expiration_date_lte: params?.expirationDateLte,
		root_symbol: params?.rootSymbol,
		type: params?.type,
		strike_price_gte: params?.strikePriceGte,
		strike_price_lte: params?.strikePriceLte,
		limit: params?.limit ?? 1000,
	};
}

function getDateString(date: Date): string {
	return date.toISOString().slice(0, 10);
}

function buildExpirationDateRanges(today: Date): Array<{ gte: string; lte: string }> {
	const dateRanges: Array<{ gte: string; lte: string }> = [];
	for (let week = 0; week < 12; week++) {
		const start = new Date(today);
		start.setDate(start.getDate() + week * 7);
		const end = new Date(start);
		end.setDate(end.getDate() + 6);
		dateRanges.push({ gte: getDateString(start), lte: getDateString(end) });
	}
	for (let month = 3; month < 12; month++) {
		const start = new Date(today);
		start.setMonth(start.getMonth() + month);
		start.setDate(1);
		const end = new Date(start);
		end.setMonth(end.getMonth() + 1);
		end.setDate(0);
		dateRanges.push({ gte: getDateString(start), lte: getDateString(end) });
	}
	return dateRanges;
}

export function getTradingDayForVolume(now = new Date()): string {
	const day = now.getDay();
	const etHour = (now.getUTCHours() - 5 + 24) % 24;
	const etMinute = now.getUTCMinutes();
	const marketOpen = etHour > 9 || (etHour === 9 && etMinute >= 30);
	const marketClose = etHour < 16;
	const isWeekday = day >= 1 && day <= 5;
	const isMarketOpen = isWeekday && marketOpen && marketClose;
	if (isMarketOpen) {
		return getDateString(now);
	}

	const daysBack = getDaysBackWhenMarketClosed(day, marketOpen);
	const tradingDay = new Date(now);
	tradingDay.setDate(tradingDay.getDate() - daysBack);
	return getDateString(tradingDay);
}

function getDaysBackWhenMarketClosed(day: number, marketOpen: boolean): number {
	if (day === 0) {
		return 2;
	}
	if (day === 6) {
		return 1;
	}
	if (day === 1 && !marketOpen) {
		return 3;
	}
	if (!marketOpen) {
		return 1;
	}
	return 0;
}

export async function getOptionContracts(
	tradingRequest: AlpacaRequestFn,
	underlying: string,
	params?: OptionContractParams,
): Promise<AlpacaOptionContract[]> {
	const contracts: AlpacaOptionContract[] = [];
	try {
		const response = await tradingRequest<{ option_contracts?: unknown[] }>(
			"/v2/options/contracts",
			buildContractQuery(underlying, params),
		);
		if (!Array.isArray(response?.option_contracts)) {
			return contracts;
		}
		for (const contract of response.option_contracts) {
			contracts.push(toOptionContract(underlying, contract as Record<string, unknown>));
		}
	} catch {
		return contracts;
	}
	return contracts;
}

async function fetchOptionBatch(
	request: AlpacaRequestFn,
	batch: string[],
	tradingDay: string,
): Promise<OptionBatchResult> {
	const [snapshotRes, barsRes] = await Promise.all([
		request<{ snapshots: Record<string, unknown> }>("/v1beta1/options/snapshots", {
			symbols: batch.join(","),
		}),
		request<{ bars: Record<string, unknown[]> }>("/v1beta1/options/bars", {
			symbols: batch.join(","),
			timeframe: "1Day",
			start: tradingDay,
			limit: batch.length,
		}).catch(() => ({ bars: {} })),
	]);
	return {
		snapshots: snapshotRes?.snapshots ?? {},
		bars: barsRes?.bars ?? {},
	};
}

export async function getOptionSnapshots(
	request: AlpacaRequestFn,
	symbols: string[],
): Promise<Map<string, AlpacaOptionSnapshot>> {
	const result = new Map<string, AlpacaOptionSnapshot>();
	if (symbols.length === 0) {
		return result;
	}

	const tradingDay = getTradingDayForVolume();
	try {
		const batches = splitIntoBatches(symbols, OPTION_BATCH_SIZE);
		const batchResults = await Promise.all(
			batches.map((batch) => fetchOptionBatch(request, batch, tradingDay)),
		);
		const { allSnapshots, allBars } = mergeBatchResults(batchResults);
		const volumeMap = buildVolumeMap(allBars);

		for (const [symbol, snapshot] of Object.entries(allSnapshots)) {
			result.set(
				symbol,
				toOptionSnapshot(
					symbol,
					tradingDay,
					volumeMap.get(symbol) ?? 0,
					snapshot as Record<string, unknown>,
				),
			);
		}
	} catch {
		return result;
	}
	return result;
}

export async function getOptionExpirations(
	tradingRequest: AlpacaRequestFn,
	underlying: string,
): Promise<string[]> {
	const expirations = new Set<string>();
	const dateRanges = buildExpirationDateRanges(new Date());

	await Promise.all(
		dateRanges.map(async (range) => {
			try {
				const response = await tradingRequest<{ option_contracts?: unknown[] }>(
					"/v2/options/contracts",
					{
						underlying_symbols: underlying,
						expiration_date_gte: range.gte,
						expiration_date_lte: range.lte,
						limit: 10,
					},
				);
				if (!Array.isArray(response?.option_contracts)) {
					return;
				}
				for (const contract of response.option_contracts) {
					const expDate = (contract as Record<string, unknown>).expiration_date as
						| string
						| undefined;
					if (expDate) {
						expirations.add(expDate);
					}
				}
			} catch {
				return;
			}
		}),
	);

	return Array.from(expirations).toSorted();
}
