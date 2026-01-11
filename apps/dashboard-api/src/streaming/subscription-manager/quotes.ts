/**
 * Quote Message Handling
 *
 * Handles incoming quote and trade messages from Massive.
 */

import type { MassiveQuoteMessage, MassiveTradeMessage } from "@cream/marketdata";
import { broadcastOptionsQuote } from "../../websocket/handler.js";
import { extractUnderlying } from "./cache.js";
import { SIGNIFICANT_MOVE_THRESHOLD } from "./constants.js";
import { quoteCache } from "./state.js";
import type { CachedQuote } from "./types.js";

/**
 * Handle quote message from Massive.
 */
export function handleQuoteMessage(msg: MassiveQuoteMessage): void {
  const contract = msg.sym;
  const underlying = extractUnderlying(contract);

  const cached = quoteCache.get(contract);
  const newQuote: CachedQuote = {
    underlying,
    bid: msg.bp,
    ask: msg.ap,
    last: cached?.last ?? (msg.bp + msg.ap) / 2,
    volume: cached?.volume ?? 0,
    timestamp: new Date(msg.t / 1e6),
    cachedAt: new Date(),
  };

  if (cached) {
    const midOld = (cached.bid + cached.ask) / 2;
    const midNew = (msg.bp + msg.ap) / 2;
    if (midOld > 0 && Math.abs(midNew - midOld) / midOld > SIGNIFICANT_MOVE_THRESHOLD) {
      newQuote.cachedAt = new Date();
    }
  }

  quoteCache.set(contract, newQuote);

  broadcastOptionsQuote(contract, {
    type: "options_quote",
    data: {
      contract,
      underlying,
      bid: msg.bp,
      ask: msg.ap,
      bidSize: msg.bs,
      askSize: msg.as,
      last: newQuote.last,
      timestamp: newQuote.timestamp.toISOString(),
    },
  });
}

/**
 * Handle trade message from Massive.
 */
export function handleTradeMessage(msg: MassiveTradeMessage): void {
  const contract = msg.sym;
  const underlying = extractUnderlying(contract);

  const cached = quoteCache.get(contract);
  quoteCache.set(contract, {
    underlying,
    bid: cached?.bid ?? msg.p,
    ask: cached?.ask ?? msg.p,
    last: msg.p,
    volume: (cached?.volume ?? 0) + msg.s,
    timestamp: new Date(msg.t / 1e6),
    cachedAt: new Date(),
  });

  broadcastOptionsQuote(contract, {
    type: "options_trade",
    data: {
      contract,
      underlying,
      price: msg.p,
      size: msg.s,
      timestamp: new Date(msg.t / 1e6).toISOString(),
    },
  });
}
