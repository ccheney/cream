/**
 * Portfolio Service
 *
 * Unified service for portfolio-related operations.
 * Handles position retrieval, options data enrichment, and performance metrics.
 *
 * @see docs/plans/31-alpaca-data-consolidation.md
 */

import {
	type AlpacaMarketDataClient,
	createAlpacaClientFromEnv,
	parseOptionTicker,
} from "@cream/marketdata";
import { getPositionsRepo } from "../db.js";
import log from "../logger.js";
import { getCurrentEnvironment } from "../routes/system.js";

// ============================================
// Types
// ============================================

export interface OptionsPosition {
	contractSymbol: string;
	underlying: string;
	underlyingPrice: number;
	expiration: string;
	strike: number;
	right: "CALL" | "PUT";
	quantity: number;
	avgCost: number;
	currentPrice: number;
	marketValue: number;
	unrealizedPnl: number;
	unrealizedPnlPct: number;
	greeks?: {
		delta: number;
		gamma: number;
		theta: number;
		vega: number;
	};
}

// ============================================
// Service
// ============================================

export class PortfolioService {
	private static instance: PortfolioService;
	private _alpacaClient?: AlpacaMarketDataClient;

	private constructor() {}

	private get alpacaClient() {
		if (!this._alpacaClient) {
			this._alpacaClient = createAlpacaClientFromEnv();
		}
		return this._alpacaClient;
	}

	/** Reset singleton for testing */
	static _resetForTesting(): void {
		PortfolioService.instance = undefined as unknown as PortfolioService;
	}

	static getInstance(): PortfolioService {
		if (!PortfolioService.instance) {
			PortfolioService.instance = new PortfolioService();
		}
		return PortfolioService.instance;
	}

	/**
	 * Get all options positions with market data and greeks.
	 */
	async getOptionsPositions(): Promise<OptionsPosition[]> {
		const positionsRepo = await getPositionsRepo();

		// 1. Get all open positions
		const positions = await positionsRepo.findOpen(getCurrentEnvironment());

		// 2. Filter for options using OCC format check
		const optionPositions = positions.filter((p) => parseOptionTicker(p.symbol) !== undefined);

		if (optionPositions.length === 0) {
			return [];
		}

		// 3. Fetch market data for all options
		// We can use getOptionChainSnapshot or getTickerSnapshot for each
		// For efficiency with multiple positions, we should try to batch if possible
		// Polygon doesn't have a specific batch endpoint for arbitrary option tickers,
		// so we'll fetch snapshots individually or use the underlying chain if they share an underlying.
		// For now, simple parallel fetch.

		const enrichedPositions = await Promise.all(
			optionPositions.map(async (pos) => {
				const details = parseOptionTicker(pos.symbol);

				if (!details) {
					log.warn({ symbol: pos.symbol }, "Failed to parse option ticker");
					return null;
				}

				try {
					// Fetch snapshot for this specific option contract
					// Note: Ticker snapshot gives price, but not greeks usually.
					// Option contract snapshot gives greeks.
					// We need to use the options API.

					// Since we don't have a "get snapshot for specific contract" method readily exposed
					// that returns greeks in the main PolygonClient public interface (it has getOptionChainSnapshot),
					// we might need to rely on what's available or fetch the chain for the underlying.

					// Let's check if we can get data for a single contract.
					// Polygon's getTickerSnapshot works for options tickers too (O: prefix or plain OCC).
					// But it might not have Greeks.

					// Attempt to find the specific contract in the underlying's chain snapshot
					// This is heavier but gives us Greeks.
					// Optimization: Group by underlying.

					return { pos, details };
				} catch (error) {
					log.warn(
						{ symbol: pos.symbol, error: error instanceof Error ? error.message : String(error) },
						"Failed to prep option",
					);
					return null;
				}
			}),
		);
		// Group by underlying to minimize API calls
		const byUnderlying = new Map<string, typeof enrichedPositions>();
		for (const item of enrichedPositions) {
			if (!item) {
				continue;
			}
			const list = byUnderlying.get(item.details.underlying) ?? [];
			list.push(item);
			byUnderlying.set(item.details.underlying, list);
		}

		const results: OptionsPosition[] = [];

		// Fetch snapshots for each underlying group
		for (const [underlying, items] of byUnderlying.entries()) {
			try {
				if (!items || items.length === 0) {
					continue;
				}

				// Get option symbols for this underlying
				const optionSymbols = items
					.filter((item): item is NonNullable<typeof item> => item !== null)
					.map((item) => item.pos.symbol);

				// Fetch option snapshots for all contracts (includes greeks)
				const optionSnapshots = await this.alpacaClient.getOptionSnapshots(optionSymbols);

				// Get underlying price from stock snapshot
				const stockSnapshots = await this.alpacaClient.getSnapshots([underlying]);
				const stockSnapshot = stockSnapshots.get(underlying);
				const underlyingPrice =
					stockSnapshot?.dailyBar?.close ?? stockSnapshot?.latestTrade?.price ?? 0;

				for (const item of items) {
					if (!item) {
						continue;
					}

					const marketData = optionSnapshots.get(item.pos.symbol);

					// Fallback values if market data missing
					const currentPrice =
						marketData?.latestTrade?.price ??
						marketData?.latestQuote?.bidPrice ??
						item.pos.currentPrice ??
						0;

					const marketValue = Math.abs(item.pos.quantity) * currentPrice * 100; // Standard 100 multiplier

					const costBasis = item.pos.costBasis; // Total cost
					// Calculate unrealized PnL
					// Long: MV - Cost, Short: Cost - MV
					const unrealizedPnl =
						item.pos.side === "long" ? marketValue - costBasis : costBasis - marketValue;

					const unrealizedPnlPct = costBasis > 0 ? (unrealizedPnl / costBasis) * 100 : 0;

					results.push({
						contractSymbol: item.pos.symbol,
						underlying: item.details.underlying,
						underlyingPrice,
						expiration: item.details.expiration,
						strike: item.details.strike,
						right: item.details.type === "call" ? "CALL" : "PUT",
						quantity: item.pos.quantity,
						avgCost: item.pos.avgEntryPrice,
						currentPrice,
						marketValue,
						unrealizedPnl,
						unrealizedPnlPct,
						greeks: marketData?.greeks
							? {
									delta: marketData.greeks.delta ?? 0,
									gamma: marketData.greeks.gamma ?? 0,
									theta: marketData.greeks.theta ?? 0,
									vega: marketData.greeks.vega ?? 0,
								}
							: undefined,
					});
				}
			} catch (error) {
				log.error(
					{ underlying, error: error instanceof Error ? error.message : String(error) },
					"Error fetching options",
				);
				// Add with stale/db data
				if (items) {
					for (const item of items) {
						if (!item) {
							continue;
						}
						results.push({
							contractSymbol: item.pos.symbol,
							underlying: item.details.underlying,
							underlyingPrice: 0,
							expiration: item.details.expiration,
							strike: item.details.strike,
							right: item.details.type === "call" ? "CALL" : "PUT",
							quantity: item.pos.quantity,
							avgCost: item.pos.avgEntryPrice,
							currentPrice: item.pos.currentPrice ?? 0,
							marketValue: item.pos.marketValue ?? 0,
							unrealizedPnl: item.pos.unrealizedPnl ?? 0,
							unrealizedPnlPct: item.pos.unrealizedPnlPct ?? 0,
							greeks: undefined,
						});
					}
				}
			}
		}

		return results;
	}
}

export const portfolioService = PortfolioService.getInstance();
