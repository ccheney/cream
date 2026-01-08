/**
 * Portfolio Service
 *
 * Unified service for portfolio-related operations.
 * Handles position retrieval, options data enrichment, and performance metrics.
 */

import { createPolygonClientFromEnv, parseOptionTicker } from "@cream/marketdata";
import { getPositionsRepo } from "../db.js";
import { systemState } from "../routes/system.js";

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
  private polygonClient = createPolygonClientFromEnv();

  private constructor() {}

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
    const positions = await positionsRepo.findOpen(systemState.environment);

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
          // biome-ignore lint/suspicious/noConsole: Log warning for bad data
          console.warn(`Failed to parse option ticker: ${pos.symbol}`);
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
          // biome-ignore lint/suspicious/noConsole: Log warning
          console.warn(`Failed to parse/prep option ${pos.symbol}`, error);
          return null;
        }
      })
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

    // Fetch chain snapshots for each underlying
    for (const [underlying, items] of byUnderlying.entries()) {
      try {
        // Fetch snapshot for the underlying's option chain
        // We can filter by expiration/strike if needed, but for now getting the chain
        // is the best way to get Greeks.
        // Optimization: limit to relevant strikes/dates if possible.
        // For now, just fetch the chain snapshot.
        const chainSnapshot = await this.polygonClient.getOptionChainSnapshot(underlying, {
          limit: 250, // Hope our positions are in the top 250 liquid ones or broadly returned
        });

        const snapshotMap = new Map(
          chainSnapshot.results?.map((r) => [r.details?.ticker, r]) ?? []
        );

        if (!items) {
          continue;
        }

        for (const item of items) {
          // items is not undefined here
          if (!item) {
            continue;
          }

          const marketData = snapshotMap.get(item.pos.symbol);
          const underlyingPrice = marketData?.underlying_asset?.price ?? 0;

          // Fallback values if market data missing
          const currentPrice =
            marketData?.last_quote?.midpoint ??
            marketData?.day?.close ??
            item.pos.currentPrice ??
            0;

          const marketValue = Math.abs(item.pos.quantity) * currentPrice * 100; // Standard 100 multiplier

          const costBasis = item.pos.costBasis; // Total cost
          // Calculate unrealized PnL
          // Long: MV - Cost, Short: Cost - MV
          const unrealizedPnl =
            item.pos.side === "LONG" ? marketValue - costBasis : costBasis - marketValue;

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
        // biome-ignore lint/suspicious/noConsole: Log error
        console.error(`Error fetching options for ${underlying}:`, error);
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
