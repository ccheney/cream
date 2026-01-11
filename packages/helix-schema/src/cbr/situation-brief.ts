/**
 * CBR Situation Brief Generation
 *
 * Generates text descriptions from market snapshots for embedding and similarity search.
 *
 * @module
 */

import type { CBRMarketSnapshot } from "./types.js";

/**
 * Generate a situation brief from a market snapshot.
 * This text is embedded for similarity search.
 */
export function generateCBRSituationBrief(snapshot: CBRMarketSnapshot): string {
  const parts: string[] = [];

  parts.push(`Trading ${snapshot.instrumentId}`);
  if (snapshot.underlyingSymbol) {
    parts.push(`(underlying: ${snapshot.underlyingSymbol})`);
  }
  parts.push(`in ${snapshot.regimeLabel} market regime.`);

  if (snapshot.sector) {
    parts.push(`Sector: ${snapshot.sector}.`);
  }

  if (snapshot.indicators) {
    const indicators: string[] = [];
    if (snapshot.indicators.rsi !== undefined) {
      indicators.push(`RSI: ${snapshot.indicators.rsi.toFixed(1)}`);
    }
    if (snapshot.indicators.volatility !== undefined) {
      indicators.push(`Volatility: ${(snapshot.indicators.volatility * 100).toFixed(1)}%`);
    }
    if (snapshot.indicators.atr !== undefined) {
      indicators.push(`ATR: ${snapshot.indicators.atr.toFixed(2)}`);
    }
    if (snapshot.indicators.volumeRatio !== undefined) {
      indicators.push(`Volume ratio: ${snapshot.indicators.volumeRatio.toFixed(1)}x`);
    }
    if (indicators.length > 0) {
      parts.push(`Indicators: ${indicators.join(", ")}.`);
    }
  }

  if (snapshot.currentPrice !== undefined) {
    parts.push(`Current price: $${snapshot.currentPrice.toFixed(2)}.`);
  }

  if (snapshot.positionContext) {
    parts.push(`Position: ${snapshot.positionContext}.`);
  }

  return parts.join(" ");
}
