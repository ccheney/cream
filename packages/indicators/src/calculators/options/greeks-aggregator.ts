/**
 * Greeks Aggregator for Portfolio Positions
 *
 * Aggregates option Greeks across a portfolio to provide net exposure metrics.
 * Essential for understanding overall portfolio risk from options positions.
 *
 * Greeks:
 * - Delta: Directional exposure (equivalent shares)
 * - Gamma: Rate of delta change (convexity)
 * - Theta: Time decay (daily $ decay)
 * - Vega: Volatility exposure ($ per 1% IV change)
 *
 * Aggregation:
 * - Sum raw Greeks for total exposure
 * - Weight by position size (contracts × 100 shares)
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

import { z } from "zod";

// ============================================================
// TYPES
// ============================================================

/**
 * Single option position
 */
export const OptionPositionSchema = z.object({
  symbol: z.string(), // Option symbol
  underlyingSymbol: z.string(),
  optionType: z.enum(["call", "put"]),
  strike: z.number(),
  expiration: z.string(), // ISO date
  quantity: z.number(), // Positive = long, negative = short
  delta: z.number(),
  gamma: z.number(),
  theta: z.number(),
  vega: z.number(),
  impliedVolatility: z.number().optional(),
  currentPrice: z.number().optional(),
  underlyingPrice: z.number().optional(),
});
export type OptionPosition = z.infer<typeof OptionPositionSchema>;

/**
 * Stock position (for delta-adjusted calculations)
 */
export interface StockPosition {
  symbol: string;
  quantity: number; // Shares
  currentPrice: number;
}

/**
 * Aggregated Greeks result
 */
export interface AggregatedGreeksResult {
  /** Net delta exposure (equivalent shares) */
  netDelta: number;
  /** Net dollar delta (delta × underlying price) */
  dollarDelta: number;
  /** Net gamma (delta change per $1 underlying move) */
  netGamma: number;
  /** Net dollar gamma (gamma × underlying price²) */
  dollarGamma: number;
  /** Net theta (daily time decay in $) */
  netTheta: number;
  /** Net vega ($ exposure per 1% IV change) */
  netVega: number;
  /** Breakdown by underlying */
  byUnderlying: Map<string, UnderlyingGreeks>;
  /** Number of positions included */
  positionCount: number;
  /** Timestamp */
  timestamp: number;
}

/**
 * Greeks for a single underlying
 */
export interface UnderlyingGreeks {
  symbol: string;
  underlyingPrice: number | null;
  netDelta: number;
  netGamma: number;
  netTheta: number;
  netVega: number;
  callDelta: number;
  putDelta: number;
  optionPositions: number;
  stockShares: number;
}

/**
 * Portfolio risk summary
 */
export interface PortfolioRiskSummary {
  /** Portfolio-level Greeks */
  aggregated: AggregatedGreeksResult;
  /** Largest delta exposures */
  topDeltaExposures: Array<{ symbol: string; delta: number }>;
  /** Largest gamma exposures */
  topGammaExposures: Array<{ symbol: string; gamma: number }>;
  /** Largest theta decay */
  topThetaDecay: Array<{ symbol: string; theta: number }>;
  /** Net delta as % of portfolio notional */
  deltaPctNotional: number | null;
}

// ============================================================
// AGGREGATION LOGIC
// ============================================================

/**
 * Aggregate Greeks across option positions
 *
 * @param positions - Array of option positions
 * @param stockPositions - Optional stock positions for delta adjustment
 * @returns Aggregated Greeks result
 *
 * @example
 * ```typescript
 * const positions = [
 *   { symbol: "AAPL240119C00180000", underlyingSymbol: "AAPL", optionType: "call",
 *     strike: 180, expiration: "2024-01-19", quantity: 10, delta: 0.55,
 *     gamma: 0.02, theta: -0.05, vega: 0.15 },
 *   { symbol: "AAPL240119P00170000", underlyingSymbol: "AAPL", optionType: "put",
 *     strike: 170, expiration: "2024-01-19", quantity: -5, delta: -0.35,
 *     gamma: 0.018, theta: -0.04, vega: 0.12 }
 * ];
 * const result = aggregateGreeks(positions);
 * // result.netDelta = 550 + 175 = 725 (equivalent shares)
 * ```
 */
export function aggregateGreeks(
  positions: OptionPosition[],
  stockPositions: StockPosition[] = []
): AggregatedGreeksResult {
  const byUnderlying = new Map<string, UnderlyingGreeks>();

  // Initialize aggregation
  let totalNetDelta = 0;
  let totalDollarDelta = 0;
  let totalNetGamma = 0;
  let totalDollarGamma = 0;
  let totalNetTheta = 0;
  let totalNetVega = 0;

  // Process option positions
  for (const pos of positions) {
    const contractMultiplier = 100; // Standard options
    const signedQuantity = pos.quantity;

    // Position Greeks (scaled by quantity and multiplier)
    const positionDelta = pos.delta * signedQuantity * contractMultiplier;
    const positionGamma = pos.gamma * signedQuantity * contractMultiplier;
    const positionTheta = pos.theta * signedQuantity * contractMultiplier;
    const positionVega = pos.vega * signedQuantity * contractMultiplier;

    // Dollar Greeks (if underlying price available)
    const underlyingPrice = pos.underlyingPrice ?? 0;
    const dollarDelta = positionDelta * underlyingPrice;
    const dollarGamma = positionGamma * underlyingPrice * underlyingPrice;

    // Accumulate totals
    totalNetDelta += positionDelta;
    totalDollarDelta += dollarDelta;
    totalNetGamma += positionGamma;
    totalDollarGamma += dollarGamma;
    totalNetTheta += positionTheta;
    totalNetVega += positionVega;

    // Update per-underlying breakdown
    let underlyingData = byUnderlying.get(pos.underlyingSymbol);
    if (!underlyingData) {
      underlyingData = {
        symbol: pos.underlyingSymbol,
        underlyingPrice: pos.underlyingPrice ?? null,
        netDelta: 0,
        netGamma: 0,
        netTheta: 0,
        netVega: 0,
        callDelta: 0,
        putDelta: 0,
        optionPositions: 0,
        stockShares: 0,
      };
      byUnderlying.set(pos.underlyingSymbol, underlyingData);
    }

    underlyingData.netDelta += positionDelta;
    underlyingData.netGamma += positionGamma;
    underlyingData.netTheta += positionTheta;
    underlyingData.netVega += positionVega;
    underlyingData.optionPositions += Math.abs(signedQuantity);

    if (pos.underlyingPrice) {
      underlyingData.underlyingPrice = pos.underlyingPrice;
    }

    if (pos.optionType === "call") {
      underlyingData.callDelta += positionDelta;
    } else {
      underlyingData.putDelta += positionDelta;
    }
  }

  // Add stock positions to delta
  for (const stock of stockPositions) {
    const stockDelta = stock.quantity; // 1 delta per share
    const stockDollarDelta = stock.quantity * stock.currentPrice;

    totalNetDelta += stockDelta;
    totalDollarDelta += stockDollarDelta;

    let underlyingData = byUnderlying.get(stock.symbol);
    if (!underlyingData) {
      underlyingData = {
        symbol: stock.symbol,
        underlyingPrice: stock.currentPrice,
        netDelta: 0,
        netGamma: 0,
        netTheta: 0,
        netVega: 0,
        callDelta: 0,
        putDelta: 0,
        optionPositions: 0,
        stockShares: 0,
      };
      byUnderlying.set(stock.symbol, underlyingData);
    }

    underlyingData.netDelta += stockDelta;
    underlyingData.stockShares += stock.quantity;
    underlyingData.underlyingPrice = stock.currentPrice;
  }

  return {
    netDelta: totalNetDelta,
    dollarDelta: totalDollarDelta,
    netGamma: totalNetGamma,
    dollarGamma: totalDollarGamma,
    netTheta: totalNetTheta,
    netVega: totalNetVega,
    byUnderlying,
    positionCount: positions.length + stockPositions.length,
    timestamp: Date.now(),
  };
}

/**
 * Calculate portfolio risk summary with top exposures
 *
 * @param positions - Option positions
 * @param stockPositions - Stock positions
 * @param portfolioNotional - Portfolio notional value for % calculations
 * @param topN - Number of top exposures to include
 * @returns Portfolio risk summary
 */
export function calculatePortfolioRiskSummary(
  positions: OptionPosition[],
  stockPositions: StockPosition[] = [],
  portfolioNotional: number | null = null,
  topN = 5
): PortfolioRiskSummary {
  const aggregated = aggregateGreeks(positions, stockPositions);

  // Build sorted exposure lists
  const deltaExposures: Array<{ symbol: string; delta: number }> = [];
  const gammaExposures: Array<{ symbol: string; gamma: number }> = [];
  const thetaDecay: Array<{ symbol: string; theta: number }> = [];

  for (const [symbol, data] of aggregated.byUnderlying) {
    deltaExposures.push({ symbol, delta: data.netDelta });
    gammaExposures.push({ symbol, gamma: data.netGamma });
    thetaDecay.push({ symbol, theta: data.netTheta });
  }

  // Sort by absolute value, take top N
  deltaExposures.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  gammaExposures.sort((a, b) => Math.abs(b.gamma) - Math.abs(a.gamma));
  thetaDecay.sort((a, b) => Math.abs(b.theta) - Math.abs(a.theta));

  const deltaPctNotional =
    portfolioNotional && portfolioNotional > 0
      ? (aggregated.dollarDelta / portfolioNotional) * 100
      : null;

  return {
    aggregated,
    topDeltaExposures: deltaExposures.slice(0, topN),
    topGammaExposures: gammaExposures.slice(0, topN),
    topThetaDecay: thetaDecay.slice(0, topN),
    deltaPctNotional,
  };
}

/**
 * Calculate Greeks for a single underlying from positions
 */
export function aggregateGreeksForUnderlying(
  positions: OptionPosition[],
  underlyingSymbol: string,
  stockShares = 0,
  underlyingPriceParam: number | null = null
): UnderlyingGreeks {
  const filtered = positions.filter((p) => p.underlyingSymbol === underlyingSymbol);

  let netDelta = stockShares; // Start with stock delta
  let netGamma = 0;
  let netTheta = 0;
  let netVega = 0;
  let callDelta = 0;
  let putDelta = 0;
  let optionPositions = 0;
  let underlyingPrice = underlyingPriceParam;

  for (const pos of filtered) {
    const contractMultiplier = 100;
    const positionDelta = pos.delta * pos.quantity * contractMultiplier;
    const positionGamma = pos.gamma * pos.quantity * contractMultiplier;
    const positionTheta = pos.theta * pos.quantity * contractMultiplier;
    const positionVega = pos.vega * pos.quantity * contractMultiplier;

    netDelta += positionDelta;
    netGamma += positionGamma;
    netTheta += positionTheta;
    netVega += positionVega;
    optionPositions += Math.abs(pos.quantity);

    if (pos.optionType === "call") {
      callDelta += positionDelta;
    } else {
      putDelta += positionDelta;
    }

    // Use position's underlying price if not provided
    if (underlyingPrice === null && pos.underlyingPrice) {
      underlyingPrice = pos.underlyingPrice;
    }
  }

  return {
    symbol: underlyingSymbol,
    underlyingPrice,
    netDelta,
    netGamma,
    netTheta,
    netVega,
    callDelta,
    putDelta,
    optionPositions,
    stockShares,
  };
}

/**
 * Calculate delta-neutral hedge ratio
 *
 * Returns number of shares to trade to neutralize delta exposure.
 *
 * @param currentDelta - Current net delta
 * @returns Shares to trade (negative = sell, positive = buy)
 */
export function calculateDeltaNeutralHedge(currentDelta: number): number {
  return -currentDelta;
}

/**
 * Calculate gamma scalping levels
 *
 * Returns the underlying price move needed to generate target delta change.
 *
 * @param currentGamma - Current net gamma
 * @param targetDeltaChange - Target delta change
 * @returns Required underlying price move
 */
export function calculateGammaScalpLevel(
  currentGamma: number,
  targetDeltaChange: number
): number | null {
  if (currentGamma === 0) {
    return null;
  }
  return targetDeltaChange / currentGamma;
}
