import { beforeAll, describe, expect, mock, test } from "bun:test";
import priceIndicatorsRoutes from "./price-indicators";

beforeAll(() => {
  process.env.ALPACA_KEY = "test";
  process.env.ALPACA_SECRET = "test";
});

// Generate mock bars with realistic price data
function generateMockBars(count: number, basePrice: number = 150) {
  const bars = [];
  let price = basePrice;
  const now = new Date();

  for (let i = 0; i < count; i++) {
    // Random walk for price
    const change = (Math.random() - 0.5) * 2;
    price = Math.max(price + change, 1);

    const high = price + Math.random() * 2;
    const low = price - Math.random() * 2;
    const open = price + (Math.random() - 0.5);
    const close = price;

    const timestamp = new Date(now.getTime() - (count - i) * 60 * 60 * 1000);

    bars.push({
      timestamp: timestamp.toISOString(),
      open,
      high,
      low,
      close,
      volume: Math.floor(Math.random() * 1000000) + 100000,
      vwap: (high + low + close) / 3,
      trade_count: Math.floor(Math.random() * 10000) + 1000,
    });
  }

  return bars;
}

// Mock Alpaca market data client
mock.module("@cream/marketdata", () => ({
  createAlpacaClientFromEnv: () => ({
    getBars: async (symbol: string) => {
      if (symbol === "INVALID") {
        return [];
      }
      // Return enough bars for all indicator calculations (200+ for SMA200)
      return generateMockBars(300, 150);
    },
    getSnapshots: () => Promise.resolve(new Map()),
  }),
  isAlpacaConfigured: () => true,
}));

describe("Price Indicators Routes", () => {
  test("GET /:symbol/price returns price indicators", async () => {
    const res = await priceIndicatorsRoutes.request("/AAPL/price");
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.symbol).toBe("AAPL");
    expect(data.timeframe).toBe("1h");
    expect(data.timestamp).toBeDefined();
    expect(data.indicators).toBeDefined();

    // Check that indicators are present (may be null if not enough data)
    expect(data.indicators).toHaveProperty("rsi_14");
    expect(data.indicators).toHaveProperty("atr_14");
    expect(data.indicators).toHaveProperty("sma_20");
    expect(data.indicators).toHaveProperty("sma_50");
    expect(data.indicators).toHaveProperty("sma_200");
    expect(data.indicators).toHaveProperty("ema_9");
    expect(data.indicators).toHaveProperty("ema_12");
    expect(data.indicators).toHaveProperty("ema_21");
    expect(data.indicators).toHaveProperty("ema_26");
    expect(data.indicators).toHaveProperty("macd_line");
    expect(data.indicators).toHaveProperty("macd_signal");
    expect(data.indicators).toHaveProperty("macd_histogram");
    expect(data.indicators).toHaveProperty("bollinger_upper");
    expect(data.indicators).toHaveProperty("bollinger_middle");
    expect(data.indicators).toHaveProperty("bollinger_lower");
    expect(data.indicators).toHaveProperty("bollinger_bandwidth");
    expect(data.indicators).toHaveProperty("bollinger_percentb");
    expect(data.indicators).toHaveProperty("stochastic_k");
    expect(data.indicators).toHaveProperty("stochastic_d");
  });

  test("GET /:symbol/price with timeframe query param", async () => {
    const res = await priceIndicatorsRoutes.request("/AAPL/price?timeframe=1d");
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.symbol).toBe("AAPL");
    expect(data.timeframe).toBe("1d");
  });

  test("GET /:symbol/price normalizes symbol to uppercase", async () => {
    const res = await priceIndicatorsRoutes.request("/aapl/price");
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.symbol).toBe("AAPL");
  });

  test("GET /:symbol/price returns 503 when no data available", async () => {
    const res = await priceIndicatorsRoutes.request("/INVALID/price");
    expect(res.status).toBe(503);

    const text = await res.text();
    expect(text).toContain("No market data available");
  });

  test("GET /:symbol/price calculates RSI correctly", async () => {
    const res = await priceIndicatorsRoutes.request("/AAPL/price");
    expect(res.status).toBe(200);

    const data = await res.json();
    // RSI should be between 0 and 100
    if (data.indicators.rsi_14 !== null) {
      expect(data.indicators.rsi_14).toBeGreaterThanOrEqual(0);
      expect(data.indicators.rsi_14).toBeLessThanOrEqual(100);
    }
  });

  test("GET /:symbol/price calculates Bollinger Bands correctly", async () => {
    const res = await priceIndicatorsRoutes.request("/AAPL/price");
    expect(res.status).toBe(200);

    const data = await res.json();
    // Upper band should be greater than middle, which should be greater than lower
    if (
      data.indicators.bollinger_upper !== null &&
      data.indicators.bollinger_middle !== null &&
      data.indicators.bollinger_lower !== null
    ) {
      expect(data.indicators.bollinger_upper).toBeGreaterThan(data.indicators.bollinger_middle);
      expect(data.indicators.bollinger_middle).toBeGreaterThan(data.indicators.bollinger_lower);
    }
  });

  test("GET /:symbol/price calculates Stochastic correctly", async () => {
    const res = await priceIndicatorsRoutes.request("/AAPL/price");
    expect(res.status).toBe(200);

    const data = await res.json();
    // Stochastic K and D should be between 0 and 100
    if (data.indicators.stochastic_k !== null) {
      expect(data.indicators.stochastic_k).toBeGreaterThanOrEqual(0);
      expect(data.indicators.stochastic_k).toBeLessThanOrEqual(100);
    }
    if (data.indicators.stochastic_d !== null) {
      expect(data.indicators.stochastic_d).toBeGreaterThanOrEqual(0);
      expect(data.indicators.stochastic_d).toBeLessThanOrEqual(100);
    }
  });

  test("GET /:symbol/price validates timeframe enum", async () => {
    const res = await priceIndicatorsRoutes.request("/AAPL/price?timeframe=invalid");
    expect(res.status).toBe(400);
  });
});
