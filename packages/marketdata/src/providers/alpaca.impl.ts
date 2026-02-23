/**
 * Alpaca Markets API client.
 */

import { getDividends, getStockSplits } from "./alpaca.corporate-methods";
import { getNews as getNewsArticles } from "./alpaca.news-methods";
import {
	getTradingDayForVolume as computeTradingDayForVolume,
	getOptionContracts,
	getOptionExpirations,
	getOptionSnapshots,
} from "./alpaca.option-methods";

export * from "./alpaca.schemas";

import type {
	AlpacaBar,
	AlpacaClientConfig,
	AlpacaCorporateActionDividend,
	AlpacaCorporateActionSplit,
	AlpacaNewsArticle,
	AlpacaOptionContract,
	AlpacaOptionSnapshot,
	AlpacaQueryParams,
	AlpacaQuote,
	AlpacaSnapshot,
	AlpacaTimeframe,
	AlpacaTrade,
	OptionContractParams,
	TradingEnvironment,
} from "./alpaca.schemas";
import {
	ALPACA_DATA_BASE_URL,
	ALPACA_LIVE_TRADING_URL,
	ALPACA_PAPER_TRADING_URL,
} from "./alpaca.schemas";
import { getBars, getLatestTrades, getQuotes, getSnapshots } from "./alpaca.stock-methods";

export class AlpacaMarketDataClient {
	private apiKey: string;
	private apiSecret: string;
	private baseUrl: string;
	private tradingUrl: string;

	constructor(config: AlpacaClientConfig) {
		this.apiKey = config.apiKey;
		this.apiSecret = config.apiSecret;
		this.baseUrl = config.baseUrl ?? ALPACA_DATA_BASE_URL;
		this.tradingUrl =
			config.environment === "LIVE" ? ALPACA_LIVE_TRADING_URL : ALPACA_PAPER_TRADING_URL;
	}

	private async request<T>(path: string, params?: AlpacaQueryParams): Promise<T> {
		return this.makeRequest<T>(this.baseUrl, path, params);
	}

	private async tradingRequest<T>(path: string, params?: AlpacaQueryParams): Promise<T> {
		return this.makeRequest<T>(this.tradingUrl, path, params);
	}

	private async makeRequest<T>(
		baseUrl: string,
		path: string,
		params?: AlpacaQueryParams,
	): Promise<T> {
		const url = new URL(path, baseUrl);
		if (params) {
			for (const [key, value] of Object.entries(params)) {
				if (value !== undefined) {
					url.searchParams.set(key, String(value));
				}
			}
		}

		const response = await fetch(url.toString(), {
			headers: {
				"APCA-API-KEY-ID": this.apiKey,
				"APCA-API-SECRET-KEY": this.apiSecret,
				Accept: "application/json",
			},
		});

		if (!response.ok) {
			const errorText = await response.text().catch(() => response.statusText);
			throw new Error(`Alpaca API error ${response.status}: ${errorText}`);
		}

		return response.json() as Promise<T>;
	}

	async getQuotes(symbols: string[]): Promise<Map<string, AlpacaQuote>> {
		return getQuotes(this.request.bind(this), symbols);
	}

	async getQuote(symbol: string): Promise<AlpacaQuote | null> {
		const quotes = await this.getQuotes([symbol]);
		return quotes.get(symbol) ?? null;
	}

	async getBars(
		symbol: string,
		timeframe: AlpacaTimeframe,
		start: string,
		end: string,
		limit?: number,
	): Promise<AlpacaBar[]> {
		return getBars(this.request.bind(this), symbol, timeframe, start, end, limit);
	}

	async getSnapshots(symbols: string[]): Promise<Map<string, AlpacaSnapshot>> {
		return getSnapshots(this.request.bind(this), symbols);
	}

	async getLatestTrades(symbols: string[]): Promise<Map<string, AlpacaTrade>> {
		return getLatestTrades(this.request.bind(this), symbols);
	}

	async getOptionContracts(
		underlying: string,
		params?: OptionContractParams,
	): Promise<AlpacaOptionContract[]> {
		return getOptionContracts(this.tradingRequest.bind(this), underlying, params);
	}

	getTradingDayForVolume(): string {
		return computeTradingDayForVolume();
	}

	async getOptionSnapshots(symbols: string[]): Promise<Map<string, AlpacaOptionSnapshot>> {
		return getOptionSnapshots(this.request.bind(this), symbols);
	}

	async getOptionExpirations(underlying: string): Promise<string[]> {
		return getOptionExpirations(this.tradingRequest.bind(this), underlying);
	}

	async getStockSplits(symbol: string): Promise<AlpacaCorporateActionSplit[]> {
		return getStockSplits(this.request.bind(this), symbol);
	}

	async getDividends(symbol: string): Promise<AlpacaCorporateActionDividend[]> {
		return getDividends(this.request.bind(this), symbol);
	}

	async getNews(
		symbols: string[],
		limit = 10,
		start?: string,
		end?: string,
	): Promise<AlpacaNewsArticle[]> {
		return getNewsArticles(this.request.bind(this), symbols, limit, start, end);
	}
}

export function createAlpacaClientFromEnv(): AlpacaMarketDataClient {
	const apiKey = Bun.env.ALPACA_KEY;
	const apiSecret = Bun.env.ALPACA_SECRET;
	const creamEnv = Bun.env.CREAM_ENV;

	if (!apiKey || !apiSecret) {
		throw new Error("ALPACA_KEY and ALPACA_SECRET environment variables are required");
	}

	if (!creamEnv) {
		throw new Error("CREAM_ENV environment variable is required. Set to PAPER or LIVE.");
	}

	if (creamEnv !== "PAPER" && creamEnv !== "LIVE") {
		throw new Error(`Invalid CREAM_ENV value '${creamEnv}'. Supported values are PAPER and LIVE.`);
	}

	const environment: TradingEnvironment = creamEnv;
	return new AlpacaMarketDataClient({ apiKey, apiSecret, environment });
}

export function isAlpacaConfigured(): boolean {
	return Boolean(Bun.env.ALPACA_KEY && Bun.env.ALPACA_SECRET);
}
