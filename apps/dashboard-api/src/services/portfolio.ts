/**
 * Portfolio Service
 *
 * Unified service for portfolio-related operations.
 * Handles options position retrieval with market data and greeks enrichment.
 * Uses Alpaca as the sole source of truth for positions.
 *
 * @see docs/plans/31-alpaca-data-consolidation.md
 */

import { type Position as BrokerPosition, createAlpacaClient } from "@cream/broker";
import {
	type AlpacaMarketDataClient,
	createAlpacaClientFromEnv,
	parseOptionTicker,
} from "@cream/marketdata";
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

type ParsedOptionTicker = NonNullable<ReturnType<typeof parseOptionTicker>>;
type OptionSnapshots = Awaited<ReturnType<AlpacaMarketDataClient["getOptionSnapshots"]>>;
type OptionSnapshot = OptionSnapshots extends Map<string, infer Value> ? Value : never;

interface OptionPositionWithDetails {
	pos: BrokerPosition;
	details: ParsedOptionTicker;
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
	 * Uses Alpaca as the sole source of truth for positions.
	 */
	async getOptionsPositions(): Promise<OptionsPosition[]> {
		const tradingClient = this.createTradingClientFromEnv();
		if (!tradingClient) {
			log.warn("Alpaca not configured, returning empty options positions");
			return [];
		}

		// 1. Get all open positions from Alpaca
		const positions = await tradingClient.getPositions();
		const groupedPositions = this.groupOptionPositionsByUnderlying(positions);
		if (groupedPositions.size === 0) {
			return [];
		}

		const results: OptionsPosition[] = [];
		// 2. Fetch snapshots for each underlying group
		for (const [underlying, items] of groupedPositions.entries()) {
			const positionsForUnderlying = await this.buildPositionsForUnderlying(underlying, items);
			results.push(...positionsForUnderlying);
		}

		return results;
	}

	private createTradingClientFromEnv(): {
		getPositions(): Promise<BrokerPosition[]>;
	} | null {
		const alpacaKey = Bun.env.ALPACA_KEY;
		const alpacaSecret = Bun.env.ALPACA_SECRET;
		if (!alpacaKey || !alpacaSecret) {
			return null;
		}

		return createAlpacaClient({
			apiKey: alpacaKey,
			apiSecret: alpacaSecret,
			environment: getCurrentEnvironment(),
		});
	}

	private groupOptionPositionsByUnderlying(
		positions: BrokerPosition[],
	): Map<string, OptionPositionWithDetails[]> {
		const optionPositions = positions.filter(
			(position) => parseOptionTicker(position.symbol) !== undefined,
		);
		const grouped = new Map<string, OptionPositionWithDetails[]>();

		for (const position of optionPositions) {
			const details = parseOptionTicker(position.symbol);
			if (!details) {
				log.warn({ symbol: position.symbol }, "Failed to parse option ticker");
				continue;
			}

			const list = grouped.get(details.underlying) ?? [];
			list.push({ pos: position, details });
			grouped.set(details.underlying, list);
		}

		return grouped;
	}

	private async buildPositionsForUnderlying(
		underlying: string,
		items: OptionPositionWithDetails[],
	): Promise<OptionsPosition[]> {
		if (items.length === 0) {
			return [];
		}

		try {
			const optionSymbols = items.map((item) => item.pos.symbol);
			const optionSnapshots = await this.alpacaClient.getOptionSnapshots(optionSymbols);
			const underlyingPrice = await this.getUnderlyingPrice(underlying);
			return items.map((item) =>
				this.buildPositionFromSnapshot(item, underlyingPrice, optionSnapshots.get(item.pos.symbol)),
			);
		} catch (error) {
			log.error(
				{ underlying, error: error instanceof Error ? error.message : String(error) },
				"Error fetching options market data",
			);
			return items.map((item) => this.buildBrokerOnlyPosition(item));
		}
	}

	private async getUnderlyingPrice(underlying: string): Promise<number> {
		const stockSnapshots = await this.alpacaClient.getSnapshots([underlying]);
		const stockSnapshot = stockSnapshots.get(underlying);
		return stockSnapshot?.dailyBar?.close ?? stockSnapshot?.latestTrade?.price ?? 0;
	}

	private buildPositionFromSnapshot(
		item: OptionPositionWithDetails,
		underlyingPrice: number,
		marketData: OptionSnapshot | undefined,
	): OptionsPosition {
		const currentPrice =
			marketData?.latestTrade?.price ??
			marketData?.latestQuote?.bidPrice ??
			item.pos.currentPrice ??
			0;
		const marketValue = Math.abs(item.pos.qty) * currentPrice * 100;
		const costBasis = item.pos.qty * item.pos.avgEntryPrice * 100;
		const unrealizedPnl =
			item.pos.side === "long" ? marketValue - costBasis : costBasis - marketValue;
		const unrealizedPnlPct = costBasis > 0 ? (unrealizedPnl / costBasis) * 100 : 0;

		return {
			contractSymbol: item.pos.symbol,
			underlying: item.details.underlying,
			underlyingPrice,
			expiration: item.details.expiration,
			strike: item.details.strike,
			right: item.details.type === "call" ? "CALL" : "PUT",
			quantity: item.pos.qty,
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
		};
	}

	private buildBrokerOnlyPosition(item: OptionPositionWithDetails): OptionsPosition {
		return {
			contractSymbol: item.pos.symbol,
			underlying: item.details.underlying,
			underlyingPrice: 0,
			expiration: item.details.expiration,
			strike: item.details.strike,
			right: item.details.type === "call" ? "CALL" : "PUT",
			quantity: item.pos.qty,
			avgCost: item.pos.avgEntryPrice,
			currentPrice: item.pos.currentPrice,
			marketValue: item.pos.marketValue,
			unrealizedPnl: item.pos.unrealizedPl,
			unrealizedPnlPct: item.pos.unrealizedPlpc * 100,
			greeks: undefined,
		};
	}
}

export const portfolioService = PortfolioService.getInstance();
