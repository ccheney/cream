/**
 * Tests for Universe Configuration Schema
 */

import { describe, expect, it } from "bun:test";
import { ETFHoldingsSourceSchema, UniverseConfigSchema, UniverseSourceSchema } from "./universe";

describe("UniverseSourceSchema", () => {
  it("validates static source", () => {
    const result = UniverseSourceSchema.safeParse({
      type: "static",
      name: "core-holdings",
      tickers: ["AAPL", "GOOGL", "MSFT"],
    });
    expect(result.success).toBe(true);
  });

  it("validates index source", () => {
    const result = UniverseSourceSchema.safeParse({
      type: "index",
      name: "sp500",
      index_id: "SP500",
    });
    expect(result.success).toBe(true);
  });

  it("validates ETF holdings source with single symbol", () => {
    const result = UniverseSourceSchema.safeParse({
      type: "etf_holdings",
      name: "spy-holdings",
      etf_symbol: "SPY",
    });
    expect(result.success).toBe(true);
  });

  it("validates ETF holdings source with multiple symbols", () => {
    const result = UniverseSourceSchema.safeParse({
      type: "etf_holdings",
      name: "etf-mix",
      etf_symbols: ["SPY", "QQQ"],
    });
    expect(result.success).toBe(true);
  });

  it("validates screener source", () => {
    const result = UniverseSourceSchema.safeParse({
      type: "screener",
      name: "high-volume",
      criteria: { min_avg_volume: 1000000 },
    });
    expect(result.success).toBe(true);
  });
});

describe("ETFHoldingsSourceSchema", () => {
  it("accepts etf_symbol", () => {
    const result = ETFHoldingsSourceSchema.safeParse({
      type: "etf_holdings",
      name: "single-etf",
      etf_symbol: "SPY",
    });
    expect(result.success).toBe(true);
  });

  it("accepts etf_symbols", () => {
    const result = ETFHoldingsSourceSchema.safeParse({
      type: "etf_holdings",
      name: "multi-etf",
      etf_symbols: ["SPY", "QQQ", "IWM"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects when neither etf_symbol nor etf_symbols provided", () => {
    const result = ETFHoldingsSourceSchema.safeParse({
      type: "etf_holdings",
      name: "no-etf",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.message.includes("Either etf_symbol or etf_symbols"))
      ).toBe(true);
    }
  });

  it("rejects when both etf_symbol and etf_symbols provided", () => {
    const result = ETFHoldingsSourceSchema.safeParse({
      type: "etf_holdings",
      name: "both-etf",
      etf_symbol: "SPY",
      etf_symbols: ["QQQ", "IWM"],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes("Cannot specify both"))).toBe(true);
    }
  });
});

describe("UniverseConfigSchema", () => {
  it("validates complete config with multiple sources", () => {
    const result = UniverseConfigSchema.safeParse({
      compose_mode: "union",
      sources: [
        { type: "static", name: "core", tickers: ["AAPL"] },
        { type: "index", name: "sp500", index_id: "SP500" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("validates config with intersection mode", () => {
    const result = UniverseConfigSchema.safeParse({
      compose_mode: "intersection",
      sources: [
        { type: "static", name: "watchlist", tickers: ["AAPL", "MSFT"] },
        { type: "index", name: "nasdaq100", index_id: "NASDAQ100" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("validates config with exclude_tickers filter", () => {
    const result = UniverseConfigSchema.safeParse({
      compose_mode: "union",
      sources: [{ type: "index", name: "sp500", index_id: "SP500" }],
      filters: {
        exclude_tickers: ["GME", "AMC"],
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.filters?.exclude_tickers).toContain("GME");
      expect(result.data.filters?.exclude_tickers).toContain("AMC");
    }
  });

  it("applies default compose_mode", () => {
    const result = UniverseConfigSchema.safeParse({
      sources: [{ type: "static", name: "test", tickers: ["AAPL"] }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.compose_mode).toBe("union");
    }
  });
});
