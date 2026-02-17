import { z } from "zod";

export const ALPACA_DATA_BASE_URL = "https://data.alpaca.markets";
export const ALPACA_PAPER_TRADING_URL = "https://paper-api.alpaca.markets";
export const ALPACA_LIVE_TRADING_URL = "https://api.alpaca.markets";

export const AlpacaQuoteSchema = z.object({
	symbol: z.string(),
	bidPrice: z.number(),
	bidSize: z.number(),
	askPrice: z.number(),
	askSize: z.number(),
	bidExchange: z.string().optional(),
	askExchange: z.string().optional(),
	timestamp: z.string(),
	conditions: z.array(z.string()).optional(),
	tape: z.string().optional(),
});
export type AlpacaQuote = z.infer<typeof AlpacaQuoteSchema>;

export const AlpacaBarSchema = z.object({
	symbol: z.string(),
	open: z.number(),
	high: z.number(),
	low: z.number(),
	close: z.number(),
	volume: z.number(),
	timestamp: z.string(),
	vwap: z.number().optional(),
	tradeCount: z.number().optional(),
});
export type AlpacaBar = z.infer<typeof AlpacaBarSchema>;

export const AlpacaTradeSchema = z.object({
	symbol: z.string(),
	price: z.number(),
	size: z.number(),
	timestamp: z.string(),
	exchange: z.string().optional(),
	id: z.number().optional(),
	conditions: z.array(z.string()).optional(),
	tape: z.string().optional(),
});
export type AlpacaTrade = z.infer<typeof AlpacaTradeSchema>;

export const AlpacaSnapshotSchema = z.object({
	symbol: z.string(),
	latestQuote: AlpacaQuoteSchema.optional(),
	latestTrade: AlpacaTradeSchema.optional(),
	minuteBar: AlpacaBarSchema.optional(),
	dailyBar: AlpacaBarSchema.optional(),
	prevDailyBar: AlpacaBarSchema.optional(),
});
export type AlpacaSnapshot = z.infer<typeof AlpacaSnapshotSchema>;

export const AlpacaOptionContractSchema = z.object({
	symbol: z.string(),
	name: z.string().optional(),
	status: z.string().optional(),
	tradable: z.boolean().optional(),
	expirationDate: z.string(),
	rootSymbol: z.string().optional(),
	underlyingSymbol: z.string(),
	underlyingAssetId: z.string().optional(),
	type: z.enum(["call", "put"]),
	style: z.string().optional(),
	strikePrice: z.number(),
	multiplier: z.number().optional(),
	size: z.number().optional(),
	openInterest: z.number().optional(),
	openInterestDate: z.string().optional(),
	closePrice: z.number().optional(),
	closePriceDate: z.string().optional(),
});
export type AlpacaOptionContract = z.infer<typeof AlpacaOptionContractSchema>;

export const AlpacaOptionGreeksSchema = z.object({
	delta: z.number().optional(),
	gamma: z.number().optional(),
	theta: z.number().optional(),
	vega: z.number().optional(),
	rho: z.number().optional(),
});
export type AlpacaOptionGreeks = z.infer<typeof AlpacaOptionGreeksSchema>;

const OptionBarSchema = z.object({
	open: z.number(),
	high: z.number(),
	low: z.number(),
	close: z.number(),
	volume: z.number(),
	vwap: z.number().optional(),
	tradeCount: z.number().optional(),
	timestamp: z.string(),
});

export const AlpacaOptionSnapshotSchema = z.object({
	symbol: z.string(),
	latestQuote: z
		.object({
			bidPrice: z.number(),
			bidSize: z.number(),
			askPrice: z.number(),
			askSize: z.number(),
			bidExchange: z.string().optional(),
			askExchange: z.string().optional(),
			timestamp: z.string(),
		})
		.optional(),
	latestTrade: z
		.object({
			price: z.number(),
			size: z.number(),
			timestamp: z.string(),
			exchange: z.string().optional(),
			conditions: z.array(z.string()).optional(),
		})
		.optional(),
	dailyBar: OptionBarSchema.optional(),
	prevDailyBar: OptionBarSchema.optional(),
	greeks: AlpacaOptionGreeksSchema.optional(),
	impliedVolatility: z.number().optional(),
});
export type AlpacaOptionSnapshot = z.infer<typeof AlpacaOptionSnapshotSchema>;

export const AlpacaCorporateActionSplitSchema = z.object({
	symbol: z.string(),
	newRate: z.number(),
	oldRate: z.number(),
	processDate: z.string(),
	exDate: z.string(),
	recordDate: z.string().optional(),
	payableDate: z.string().optional(),
});
export type AlpacaCorporateActionSplit = z.infer<typeof AlpacaCorporateActionSplitSchema>;

export const AlpacaCorporateActionDividendSchema = z.object({
	symbol: z.string(),
	rate: z.number(),
	special: z.boolean().optional(),
	foreign: z.boolean().optional(),
	exDate: z.string(),
	recordDate: z.string().optional(),
	payableDate: z.string().optional(),
	processDate: z.string().optional(),
});
export type AlpacaCorporateActionDividend = z.infer<typeof AlpacaCorporateActionDividendSchema>;

export const AlpacaNewsArticleSchema = z.object({
	id: z.number(),
	headline: z.string(),
	summary: z.string().optional(),
	author: z.string().optional(),
	created_at: z.string(),
	updated_at: z.string().optional(),
	url: z.string().optional(),
	content: z.string().optional(),
	symbols: z.array(z.string()),
	source: z.string(),
});
export type AlpacaNewsArticle = z.infer<typeof AlpacaNewsArticleSchema>;

export type TradingEnvironment = "PAPER" | "LIVE";

export interface AlpacaClientConfig {
	apiKey: string;
	apiSecret: string;
	baseUrl?: string;
	environment?: TradingEnvironment;
}

export type AlpacaTimeframe =
	| "1Min"
	| "5Min"
	| "15Min"
	| "30Min"
	| "1Hour"
	| "2Hour"
	| "4Hour"
	| "1Day"
	| "1Week"
	| "1Month";

export interface OptionContractParams {
	expirationDateGte?: string;
	expirationDateLte?: string;
	rootSymbol?: string;
	type?: "call" | "put";
	strikePriceGte?: number;
	strikePriceLte?: number;
	limit?: number;
}

export type AlpacaQueryParams = Record<string, string | number | boolean | undefined>;
export type AlpacaRequestFn = <T>(path: string, params?: AlpacaQueryParams) => Promise<T>;
