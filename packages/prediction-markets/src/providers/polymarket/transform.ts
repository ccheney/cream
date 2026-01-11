/**
 * Polymarket Data Transformation
 *
 * Functions for transforming Polymarket API responses to domain types.
 */

import type { PredictionMarketEvent, PredictionMarketType } from "@cream/domain";
import { getRelatedInstruments, parseNumericValue } from "./helpers.js";
import type { PolymarketEvent, PolymarketMarket } from "./types.js";

/**
 * Calculate liquidity score from market data (0-1 scale)
 */
export function calculateLiquidityScore(market: PolymarketMarket): number {
  let score = 0;

  if (market.volume24hr) {
    const volume = parseNumericValue(market.volume24hr);
    score += Math.min(volume / 100000, 0.5);
  }

  if (market.liquidity) {
    const liquidity = parseNumericValue(market.liquidity);
    score += Math.min(liquidity / 50000, 0.5);
  }

  return Math.min(score, 1);
}

/**
 * Transform a Polymarket market to a domain PredictionMarketEvent
 */
export function transformMarket(
  market: PolymarketMarket,
  marketType: (typeof PredictionMarketType.options)[number],
  _event?: PolymarketEvent
): PredictionMarketEvent {
  const outcomeNames = market.outcomes ?? ["Yes", "No"];
  const outcomePrices = market.outcomePrices ?? [];

  const outcomes: PredictionMarketEvent["payload"]["outcomes"] = outcomeNames.map((name, i) => {
    const price = outcomePrices[i] ? Number.parseFloat(outcomePrices[i]) : 0;
    const volume24h = market.volume24hr ? parseNumericValue(market.volume24hr) : undefined;

    return {
      outcome: name ?? `Outcome ${i + 1}`,
      probability: price,
      price,
      volume24h,
    };
  });

  return {
    eventId: `pm_polymarket_${market.id}`,
    eventType: "PREDICTION_MARKET",
    eventTime: market.endDate ?? new Date().toISOString(),
    payload: {
      platform: "POLYMARKET",
      marketType,
      marketTicker: market.id,
      marketQuestion: market.question,
      outcomes,
      lastUpdated: new Date().toISOString(),
      volume24h: market.volume24hr ? parseNumericValue(market.volume24hr) : undefined,
      liquidityScore: calculateLiquidityScore(market),
    },
    relatedInstrumentIds: getRelatedInstruments(marketType),
  };
}

/**
 * Transform a Polymarket event to a domain PredictionMarketEvent
 */
export function transformEvent(
  event: PolymarketEvent,
  marketType: (typeof PredictionMarketType.options)[number]
): PredictionMarketEvent | null {
  const market = event.markets?.[0];
  if (!market) {
    return null;
  }

  return transformMarket(market, marketType, event);
}
