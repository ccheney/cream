/**
 * Shared test utilities for technical indicator tests.
 */

import type { Candle } from "../src/types.js";

/**
 * Generate mock candle data for testing.
 */
export function generateCandles(count: number, startPrice = 100, volatility = 0.02): Candle[] {
  const candles: Candle[] = [];
  let price = startPrice;
  const baseVolume = 1000000;

  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * 2 * volatility * price;
    price = Math.max(1, price + change);

    const open = price;
    const high = open * (1 + Math.random() * volatility);
    const low = open * (1 - Math.random() * volatility);
    const close = low + Math.random() * (high - low);
    const volume = baseVolume * (0.5 + Math.random());

    candles.push({
      timestamp: Date.now() - (count - i) * 3600000,
      open,
      high,
      low,
      close,
      volume,
    });
  }

  return candles;
}

/**
 * Generate trending candle data (uptrend).
 */
export function generateUptrend(count: number, startPrice = 100): Candle[] {
  const candles: Candle[] = [];
  let price = startPrice;
  const baseVolume = 1000000;

  for (let i = 0; i < count; i++) {
    const deterministicNoise = Math.sin(i * 0.5) * 0.002;
    const change = price * (0.01 + deterministicNoise);
    price = price + change;

    const open = price * 0.998;
    const high = price * 1.005;
    const low = price * 0.995;
    const close = price;
    const volume = baseVolume;

    candles.push({
      timestamp: Date.now() - (count - i) * 3600000,
      open,
      high,
      low,
      close,
      volume,
    });
  }

  return candles;
}

/**
 * Generate downtrend candle data.
 */
export function generateDowntrend(count: number, startPrice = 100): Candle[] {
  const candles: Candle[] = [];
  let price = startPrice;
  const baseVolume = 1000000;

  for (let i = 0; i < count; i++) {
    const change = -price * 0.005 + (Math.random() - 0.7) * 0.01 * price;
    price = Math.max(1, price + change);

    const open = price * 1.002;
    const high = price * 1.005;
    const low = price * 0.995;
    const close = price;
    const volume = baseVolume * (0.8 + Math.random() * 0.4);

    candles.push({
      timestamp: Date.now() - (count - i) * 3600000,
      open,
      high,
      low,
      close,
      volume,
    });
  }

  return candles;
}
