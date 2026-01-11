/**
 * Observe Phase
 *
 * Market data fetching for the trading cycle workflow.
 */

import type { ExecutionContext } from "@cream/domain";
import { isBacktest } from "@cream/domain";
import { createMarketDataAdapter } from "@cream/marketdata";

import {
  FIXTURE_TIMESTAMP,
  getCandleFixtures,
  getSnapshotFixture,
} from "../../../../fixtures/market/index.js";
import type { CandleData, MarketSnapshot, QuoteData } from "./types.js";

// ============================================
// Market Data Fetching
// ============================================

/**
 * Fetch market snapshot for the given instruments.
 *
 * In BACKTEST mode, uses deterministic fixture data for reproducible behavior.
 * In PAPER/LIVE mode, fetches real market data via the market data adapter.
 *
 * @param instruments - Array of ticker symbols
 * @param ctx - Execution context for environment detection
 * @returns Market snapshot with candles and quotes for each instrument
 */
export async function fetchMarketSnapshot(
  instruments: string[],
  ctx?: ExecutionContext
): Promise<MarketSnapshot> {
  if (ctx && isBacktest(ctx)) {
    return fetchFixtureSnapshot(instruments);
  }

  const adapter = createMarketDataAdapter(ctx?.environment);

  const toDate = new Date();
  const fromDate = new Date(toDate.getTime() - 7 * 24 * 60 * 60 * 1000);
  const from = fromDate.toISOString().slice(0, 10);
  const to = toDate.toISOString().slice(0, 10);

  const timestamp = Date.now();
  const candles: Record<string, CandleData[]> = {};
  const quotes: Record<string, QuoteData> = {};

  for (const symbol of instruments) {
    const adapterCandles = await adapter.getCandles(symbol, "1h", from, to);
    candles[symbol] = adapterCandles.slice(-120).map((c) => ({
      timestamp: c.timestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));
  }

  const adapterQuotes = await adapter.getQuotes(instruments);
  for (const symbol of instruments) {
    const quote = adapterQuotes.get(symbol);
    if (quote) {
      quotes[symbol] = {
        bid: quote.bid,
        ask: quote.ask,
        bidSize: quote.bidSize,
        askSize: quote.askSize,
        timestamp: quote.timestamp,
      };
    } else {
      const symbolCandles = candles[symbol];
      const lastCandle = symbolCandles?.[symbolCandles.length - 1];
      const lastPrice = lastCandle?.close ?? 100;
      const spread = lastPrice * 0.0002;
      quotes[symbol] = {
        bid: Number((lastPrice - spread / 2).toFixed(2)),
        ask: Number((lastPrice + spread / 2).toFixed(2)),
        bidSize: 100,
        askSize: 100,
        timestamp,
      };
    }
  }

  return {
    instruments,
    candles,
    quotes,
    timestamp,
  };
}

/**
 * Fetch market snapshot using deterministic fixture data (for BACKTEST mode).
 */
export function fetchFixtureSnapshot(instruments: string[]): MarketSnapshot {
  const timestamp = FIXTURE_TIMESTAMP;
  const candles: Record<string, CandleData[]> = {};
  const quotes: Record<string, QuoteData> = {};

  for (const symbol of instruments) {
    const candleData = getCandleFixtures(symbol, 120);
    candles[symbol] = candleData;

    const snapshot = getSnapshotFixture(symbol);
    if (snapshot.lastQuote) {
      quotes[symbol] = {
        bid: snapshot.lastQuote.bid,
        ask: snapshot.lastQuote.ask,
        bidSize: snapshot.lastQuote.bidSize,
        askSize: snapshot.lastQuote.askSize,
        timestamp: snapshot.lastQuote.timestamp,
      };
    } else {
      const lastPrice = snapshot.lastTrade?.price ?? snapshot.open;
      const spread = lastPrice * 0.0002;
      quotes[symbol] = {
        bid: Number((lastPrice - spread / 2).toFixed(2)),
        ask: Number((lastPrice + spread / 2).toFixed(2)),
        bidSize: 100,
        askSize: 100,
        timestamp,
      };
    }
  }

  return {
    instruments,
    candles,
    quotes,
    timestamp,
  };
}
