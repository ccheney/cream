/**
 * Quotes Tool
 *
 * Get real-time quotes for instruments using gRPC MarketDataService.
 */

import { timestampDate } from "@bufbuild/protobuf/wkt";
import { type ExecutionContext, isBacktest } from "@cream/domain";
import { getMarketDataClient } from "../clients.js";
import type { Quote } from "../types.js";

/**
 * Get real-time quotes for instruments
 *
 * Uses gRPC MarketDataService.
 *
 * @param ctx - ExecutionContext
 * @param instruments - Array of instrument symbols
 * @returns Array of quotes
 * @throws Error if gRPC call fails or backtest mode is used
 */
export async function getQuotes(ctx: ExecutionContext, instruments: string[]): Promise<Quote[]> {
  if (isBacktest(ctx)) {
    throw new Error("getQuotes is not available in BACKTEST mode - use historical data instead");
  }

  const client = getMarketDataClient();
  const response = await client.getSnapshot({
    symbols: instruments,
    includeBars: false,
    barTimeframes: [],
  });

  // Map protobuf quotes to tool Quote format
  const quotes: Quote[] = [];
  for (const symbolSnapshot of response.data.snapshot?.symbols ?? []) {
    const quote = symbolSnapshot.quote;
    if (quote) {
      quotes.push({
        symbol: quote.symbol,
        bid: quote.bid,
        ask: quote.ask,
        last: quote.last,
        volume: Number(quote.volume),
        timestamp: quote.timestamp
          ? timestampDate(quote.timestamp).toISOString()
          : new Date().toISOString(),
      });
    }
  }

  // Log warning for any missing symbols (ADRs, OTC, etc. may not be available)
  const foundSymbols = new Set(quotes.map((q) => q.symbol));
  const missingSymbols = instruments.filter((s) => !foundSymbols.has(s));
  if (missingSymbols.length > 0) {
    console.warn(
      `[quotes] Missing quotes for symbols (may be ADR/OTC): ${missingSymbols.join(", ")}`
    );
  }

  // Return partial results even if some symbols are missing
  if (quotes.length === 0) {
    throw new Error(`No quotes available for any requested symbols: ${instruments.join(", ")}`);
  }

  return quotes;
}
