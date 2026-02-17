import { mock } from "bun:test";
import type {
	AlpacaMarketDataClient,
	AlpacaOptionContract,
	AlpacaSnapshot,
} from "./providers/alpaca";

export const mockOptionContracts: AlpacaOptionContract[] = [
	{
		symbol: "AAPL260130C00150000",
		underlyingSymbol: "AAPL",
		type: "call",
		expirationDate: "2026-01-30",
		strikePrice: 150,
	},
	{
		symbol: "AAPL260130C00155000",
		underlyingSymbol: "AAPL",
		type: "call",
		expirationDate: "2026-01-30",
		strikePrice: 155,
	},
	{
		symbol: "AAPL260130P00145000",
		underlyingSymbol: "AAPL",
		type: "put",
		expirationDate: "2026-01-30",
		strikePrice: 145,
	},
	{
		symbol: "AAPL260220C00150000",
		underlyingSymbol: "AAPL",
		type: "call",
		expirationDate: "2026-02-20",
		strikePrice: 150,
	},
	{
		symbol: "AAPL260320C00160000",
		underlyingSymbol: "AAPL",
		type: "call",
		expirationDate: "2026-03-20",
		strikePrice: 160,
	},
];

export const mockSnapshot: AlpacaSnapshot = {
	symbol: "AAPL",
	dailyBar: {
		symbol: "AAPL",
		open: 150,
		high: 152,
		low: 149,
		close: 151,
		volume: 5000000,
		timestamp: new Date().toISOString(),
	},
	latestTrade: {
		symbol: "AAPL",
		price: 151.5,
		size: 100,
		timestamp: new Date().toISOString(),
	},
};

export function createMockClient(): AlpacaMarketDataClient {
	return {
		getOptionContracts: mock(() => Promise.resolve(mockOptionContracts)),
		getSnapshots: mock(() => {
			const map = new Map<string, AlpacaSnapshot>();
			map.set("AAPL", mockSnapshot);
			return Promise.resolve(map);
		}),
		getQuotes: mock(() => Promise.resolve(new Map())),
		getQuote: mock(() => Promise.resolve(null)),
		getBars: mock(() => Promise.resolve([])),
		getLatestTrades: mock(() => Promise.resolve(new Map())),
		getOptionSnapshots: mock(() => Promise.resolve(new Map())),
		getOptionExpirations: mock(() => Promise.resolve([])),
		getStockSplits: mock(() => Promise.resolve([])),
		getDividends: mock(() => Promise.resolve([])),
	} as unknown as AlpacaMarketDataClient;
}
