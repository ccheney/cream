/**
 * TradeTape Utilities
 *
 * Utility functions for trade classification, formatting, and statistics.
 */

import type { Trade, TradeSide } from "./types.js";
import { BUY_CONDITIONS, EXCHANGE_NAMES, SELL_CONDITIONS } from "./types.js";

/**
 * Classify trade side from conditions.
 * This is a heuristic - real side determination requires order book context.
 */
export function classifyTradeSide(conditions?: number[]): TradeSide {
  if (!conditions || conditions.length === 0) {
    return "UNKNOWN";
  }

  for (const cond of conditions) {
    if (BUY_CONDITIONS.has(cond)) {
      return "BUY";
    }
    if (SELL_CONDITIONS.has(cond)) {
      return "SELL";
    }
  }

  return "UNKNOWN";
}

/**
 * Get exchange name from ID.
 */
export function getExchangeName(exchangeId?: number): string {
  if (exchangeId === undefined) {
    return "--";
  }
  return EXCHANGE_NAMES[exchangeId] ?? `EX${exchangeId}`;
}

/**
 * Format price with proper decimals.
 */
export function formatPrice(price: number): string {
  return `$${price.toFixed(2)}`;
}

/**
 * Format size with commas.
 */
export function formatSize(size: number): string {
  return size.toLocaleString();
}

/**
 * Format timestamp as HH:MM:SS.mmm
 */
export function formatTimestamp(date: Date): string {
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const seconds = date.getSeconds().toString().padStart(2, "0");
  const millis = date.getMilliseconds().toString().padStart(3, "0");
  return `${hours}:${minutes}:${seconds}.${millis}`;
}

/**
 * Calculate VWAP from trades.
 */
export function calculateVWAP(trades: Trade[]): number {
  if (trades.length === 0) {
    return 0;
  }

  let sumPriceVolume = 0;
  let sumVolume = 0;

  for (const trade of trades) {
    sumPriceVolume += trade.price * trade.size;
    sumVolume += trade.size;
  }

  return sumVolume > 0 ? sumPriceVolume / sumVolume : 0;
}

/**
 * Calculate trades per minute (1-minute rolling window).
 */
export function calculateTradesPerMinute(trades: Trade[]): number {
  if (trades.length === 0) {
    return 0;
  }

  const now = Date.now();
  const oneMinuteAgo = now - 60_000;
  const recentTrades = trades.filter((t) => t.timestamp.getTime() >= oneMinuteAgo);

  return recentTrades.length;
}

/**
 * Format volume with K/M/B suffix.
 */
export function formatVolume(volume: number): string {
  if (volume >= 1_000_000_000) {
    return `${(volume / 1_000_000_000).toFixed(1)}B`;
  }
  if (volume >= 1_000_000) {
    return `${(volume / 1_000_000).toFixed(1)}M`;
  }
  if (volume >= 1_000) {
    return `${(volume / 1_000).toFixed(1)}K`;
  }
  return volume.toLocaleString();
}
