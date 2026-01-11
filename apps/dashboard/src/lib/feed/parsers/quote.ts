/**
 * Quote Event Parser
 *
 * Handles equity quote event normalization.
 */

import type { NormalizedEvent, QuoteData } from "../types.js";
import { EVENT_ICONS } from "../types.js";

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function normalizeQuote(data: QuoteData, timestamp: Date): NormalizedEvent {
  const spread = data.ask - data.bid;
  return {
    id: crypto.randomUUID(),
    timestamp,
    type: "quote",
    icon: EVENT_ICONS.quote,
    symbol: data.symbol,
    title: `${data.symbol}`,
    details: `${formatCurrency(data.bid)} × ${formatCurrency(data.ask)}  Spread: ${formatCurrency(spread)}`,
    color: "neutral",
    raw: data,
  };
}
