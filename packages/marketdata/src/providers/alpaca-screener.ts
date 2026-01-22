/**
 * Alpaca Markets Screener API Client
 *
 * Provides access to Alpaca's screener endpoints for market movers and most active stocks.
 * These endpoints are useful for pre-market scanning and identifying overnight price movements.
 *
 * @see https://docs.alpaca.markets/reference/mostactives-1
 * @see https://docs.alpaca.markets/reference/movers-1
 * @see docs/plans/42-overnight-macro-watch.md
 */

import { z } from "zod";

// ============================================
// Constants
// ============================================

const ALPACA_DATA_BASE_URL = "https://data.alpaca.markets";
const ALPACA_TRADING_BASE_URL = "https://api.alpaca.markets";

// ============================================
// Response Schemas
// ============================================

export const MostActiveStockSchema = z.object({
	symbol: z.string(),
	volume: z.number(),
	trade_count: z.number(),
});
export type MostActiveStock = z.infer<typeof MostActiveStockSchema>;

export const MostActivesResponseSchema = z.object({
	most_actives: z.array(MostActiveStockSchema),
	last_updated: z.string(),
});
export type MostActivesResponse = z.infer<typeof MostActivesResponseSchema>;

export const MoverSchema = z.object({
	symbol: z.string(),
	percent_change: z.number(),
	change: z.number(),
	price: z.number(),
});
export type Mover = z.infer<typeof MoverSchema>;

export const MoversResponseSchema = z.object({
	gainers: z.array(MoverSchema),
	losers: z.array(MoverSchema),
	market_type: z.literal("stocks"),
	last_updated: z.string(),
});
export type MoversResponse = z.infer<typeof MoversResponseSchema>;

export const AssetInfoSchema = z.object({
	symbol: z.string(),
	name: z.string(),
	exchange: z.string(),
	status: z.string(),
	tradable: z.boolean(),
});
export type AssetInfo = z.infer<typeof AssetInfoSchema>;

// ============================================
// Client Types
// ============================================

export type MostActivesBy = "volume" | "trades";

export interface AlpacaScreenerConfig {
	apiKey: string;
	apiSecret: string;
	baseUrl?: string;
}

// ============================================
// Client Implementation
// ============================================

/**
 * Alpaca Screener API client for market movers and most active stocks.
 *
 * @example
 * ```typescript
 * const screener = new AlpacaScreenerClient({
 *   apiKey: Bun.env.ALPACA_KEY!,
 *   apiSecret: Bun.env.ALPACA_SECRET!,
 * });
 *
 * // Get top 10 most active by volume
 * const actives = await screener.getMostActives("volume", 10);
 *
 * // Get top gainers and losers
 * const movers = await screener.getMarketMovers(10);
 * ```
 */
export class AlpacaScreenerClient {
	private apiKey: string;
	private apiSecret: string;
	private baseUrl: string;

	constructor(config: AlpacaScreenerConfig) {
		this.apiKey = config.apiKey;
		this.apiSecret = config.apiSecret;
		this.baseUrl = config.baseUrl ?? ALPACA_DATA_BASE_URL;
	}

	/**
	 * Make an authenticated request to the Alpaca data API.
	 */
	private async request<T>(
		path: string,
		params?: Record<string, string | number | boolean | undefined>,
		baseUrl?: string,
	): Promise<T> {
		const url = new URL(path, baseUrl ?? this.baseUrl);

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

	/**
	 * Get asset info for a single symbol.
	 */
	async getAssetInfo(symbol: string): Promise<AssetInfo | null> {
		try {
			const response = await this.request<Record<string, unknown>>(
				`/v2/assets/${symbol}`,
				undefined,
				ALPACA_TRADING_BASE_URL,
			);

			const parsed = AssetInfoSchema.safeParse(response);
			if (parsed.success) {
				return parsed.data;
			}

			// Fallback extraction
			if (response?.symbol && response?.exchange) {
				return {
					symbol: String(response.symbol),
					name: String(response.name ?? ""),
					exchange: String(response.exchange),
					status: String(response.status ?? "unknown"),
					tradable: Boolean(response.tradable),
				};
			}

			return null;
		} catch {
			return null;
		}
	}

	/**
	 * Get asset info for multiple symbols (batch lookup).
	 * Returns a map of symbol -> AssetInfo.
	 */
	async getAssetsInfo(symbols: string[]): Promise<Map<string, AssetInfo>> {
		const results = new Map<string, AssetInfo>();

		// Batch lookup in parallel with concurrency limit
		const BATCH_SIZE = 10;
		for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
			const batch = symbols.slice(i, i + BATCH_SIZE);
			const infos = await Promise.all(batch.map((s) => this.getAssetInfo(s)));

			for (let j = 0; j < batch.length; j++) {
				const info = infos[j];
				const symbol = batch[j];
				if (info && symbol) {
					results.set(symbol.toUpperCase(), info);
				}
			}
		}

		return results;
	}

	/**
	 * Get the most active stocks by volume or trade count.
	 *
	 * @param by - Sort by "volume" or "trades"
	 * @param top - Number of results (max 50, default 20)
	 * @returns Array of most active stocks with volume and trade count
	 */
	async getMostActives(by: MostActivesBy = "volume", top = 20): Promise<MostActiveStock[]> {
		try {
			const response = await this.request<MostActivesResponse>(
				"/v1beta1/screener/stocks/most-actives",
				{
					by: by.toUpperCase(),
					top: Math.min(top, 50),
				},
			);

			const parsed = MostActivesResponseSchema.safeParse(response);
			if (parsed.success) {
				return parsed.data.most_actives;
			}

			// Fallback: try to extract data from raw response
			if (response?.most_actives && Array.isArray(response.most_actives)) {
				return response.most_actives.map((item) => ({
					symbol: String(item.symbol ?? ""),
					volume: Number(item.volume ?? 0),
					trade_count: Number(item.trade_count ?? 0),
				}));
			}

			return [];
		} catch {
			return [];
		}
	}

	/**
	 * Get top market movers (gainers and losers) by percent change.
	 *
	 * @param top - Number of gainers/losers to return (default 10)
	 * @returns Object with gainers and losers arrays
	 */
	async getMarketMovers(top = 10): Promise<{ gainers: Mover[]; losers: Mover[] }> {
		try {
			const response = await this.request<MoversResponse>("/v1beta1/screener/stocks/movers", {
				top,
			});

			const parsed = MoversResponseSchema.safeParse(response);
			if (parsed.success) {
				return {
					gainers: parsed.data.gainers,
					losers: parsed.data.losers,
				};
			}

			// Fallback: try to extract data from raw response
			const result = {
				gainers: [] as Mover[],
				losers: [] as Mover[],
			};

			if (response?.gainers && Array.isArray(response.gainers)) {
				result.gainers = response.gainers.map((item) => ({
					symbol: String(item.symbol ?? ""),
					percent_change: Number(item.percent_change ?? 0),
					change: Number(item.change ?? 0),
					price: Number(item.price ?? 0),
				}));
			}

			if (response?.losers && Array.isArray(response.losers)) {
				result.losers = response.losers.map((item) => ({
					symbol: String(item.symbol ?? ""),
					percent_change: Number(item.percent_change ?? 0),
					change: Number(item.change ?? 0),
					price: Number(item.price ?? 0),
				}));
			}

			return result;
		} catch {
			return { gainers: [], losers: [] };
		}
	}

	/**
	 * Get pre-market movers filtered to specific symbols.
	 *
	 * @param universeSymbols - Array of symbols to filter to
	 * @param topMarketWide - Number of additional market-wide movers to include
	 * @returns Combined movers filtered to universe plus top market-wide
	 */
	async getPreMarketMovers(
		universeSymbols: string[],
		topMarketWide = 5,
	): Promise<{ gainers: Mover[]; losers: Mover[] }> {
		const allMovers = await this.getMarketMovers(50);
		const universeSet = new Set(universeSymbols.map((s) => s.toUpperCase()));

		// Filter to universe symbols
		const universeGainers = allMovers.gainers.filter((m) =>
			universeSet.has(m.symbol.toUpperCase()),
		);
		const universeLosers = allMovers.losers.filter((m) => universeSet.has(m.symbol.toUpperCase()));

		// Add top market-wide movers not in universe
		const marketGainers = allMovers.gainers
			.filter((m) => !universeSet.has(m.symbol.toUpperCase()))
			.slice(0, topMarketWide);
		const marketLosers = allMovers.losers
			.filter((m) => !universeSet.has(m.symbol.toUpperCase()))
			.slice(0, topMarketWide);

		return {
			gainers: [...universeGainers, ...marketGainers],
			losers: [...universeLosers, ...marketLosers],
		};
	}
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create an Alpaca Screener client from environment variables.
 */
export function createAlpacaScreenerFromEnv(): AlpacaScreenerClient {
	const apiKey = Bun.env.ALPACA_KEY;
	const apiSecret = Bun.env.ALPACA_SECRET;

	if (!apiKey || !apiSecret) {
		throw new Error("ALPACA_KEY and ALPACA_SECRET environment variables are required");
	}

	return new AlpacaScreenerClient({ apiKey, apiSecret });
}

/**
 * Check if Alpaca Screener is configured.
 */
export function isAlpacaScreenerConfigured(): boolean {
	return Boolean(Bun.env.ALPACA_KEY && Bun.env.ALPACA_SECRET);
}
