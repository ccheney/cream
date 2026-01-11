/**
 * Shared test fixtures and data generators for transforms tests.
 */

import { simpleReturn } from "../../../src/transforms/returns.js";
import type { Candle } from "../../../src/types.js";

export function generateValues(
  count: number,
  start = 100,
  drift = 0.001,
  volatility = 0.02
): number[] {
  const values: number[] = [start];

  for (let i = 1; i < count; i++) {
    const change = drift + (Math.random() - 0.5) * 2 * volatility;
    values.push(values[i - 1]! * (1 + change));
  }

  return values;
}

export function generateTimestamps(count: number): number[] {
  const timestamps: number[] = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    timestamps.push(now - (count - i) * 3600000);
  }

  return timestamps;
}

export function generateCandles(count: number, startPrice = 100): Candle[] {
  const candles: Candle[] = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * 0.04;
    price = Math.max(1, price * (1 + change));

    candles.push({
      timestamp: Date.now() - (count - i) * 3600000,
      open: price * 0.998,
      high: price * 1.01,
      low: price * 0.99,
      close: price,
      volume: 1000000 * (0.5 + Math.random()),
    });
  }

  return candles;
}

export function generateReturnsFromPrices(prices: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push(simpleReturn(prices[i]!, prices[i - 1]!));
  }
  return returns;
}
