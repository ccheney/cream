/**
 * Option Chain Scanner Tests
 */

import { describe, expect, it, mock } from "bun:test";
import {
  buildOptionTicker,
  calculateDte,
  DEFAULT_FILTERS,
  OptionChainScanner,
  type OptionFilterCriteria,
  parseOptionTicker,
} from "./optionChain";
import type {
  AlpacaMarketDataClient,
  AlpacaOptionContract,
  AlpacaSnapshot,
} from "./providers/alpaca";

// ============================================
// Mock Data
// ============================================

const mockOptionContracts: AlpacaOptionContract[] = [
  {
    symbol: "AAPL260130C00150000",
    underlyingSymbol: "AAPL",
    type: "call" as const,
    expirationDate: "2026-01-30",
    strikePrice: 150,
  },
  {
    symbol: "AAPL260130C00155000",
    underlyingSymbol: "AAPL",
    type: "call" as const,
    expirationDate: "2026-01-30",
    strikePrice: 155,
  },
  {
    symbol: "AAPL260130P00145000",
    underlyingSymbol: "AAPL",
    type: "put" as const,
    expirationDate: "2026-01-30",
    strikePrice: 145,
  },
  {
    symbol: "AAPL260220C00150000",
    underlyingSymbol: "AAPL",
    type: "call" as const,
    expirationDate: "2026-02-20",
    strikePrice: 150,
  },
  {
    symbol: "AAPL260320C00160000",
    underlyingSymbol: "AAPL",
    type: "call" as const,
    expirationDate: "2026-03-20",
    strikePrice: 160,
  },
];

const mockSnapshot: AlpacaSnapshot = {
  symbol: "AAPL",
  dailyBar: {
    symbol: "AAPL",
    open: 150,
    high: 152,
    low: 149,
    close: 151,
    volume: 5000000,
    timestamp: new Date().toISOString(),
  },
  latestTrade: {
    symbol: "AAPL",
    price: 151.5,
    size: 100,
    timestamp: new Date().toISOString(),
  },
};

function createMockClient(): AlpacaMarketDataClient {
  return {
    getOptionContracts: mock(() => Promise.resolve(mockOptionContracts)),
    getSnapshots: mock(() => {
      const map = new Map<string, AlpacaSnapshot>();
      map.set("AAPL", mockSnapshot);
      return Promise.resolve(map);
    }),
    getQuotes: mock(() => Promise.resolve(new Map())),
    getQuote: mock(() => Promise.resolve(null)),
    getBars: mock(() => Promise.resolve([])),
    getLatestTrades: mock(() => Promise.resolve(new Map())),
    getOptionSnapshots: mock(() => Promise.resolve(new Map())),
    getOptionExpirations: mock(() => Promise.resolve([])),
    getStockSplits: mock(() => Promise.resolve([])),
    getDividends: mock(() => Promise.resolve([])),
  } as unknown as AlpacaMarketDataClient;
}

// ============================================
// parseOptionTicker Tests
// ============================================

describe("parseOptionTicker", () => {
  it("parses valid call option ticker", () => {
    const result = parseOptionTicker("AAPL260119C00150000");
    expect(result).toEqual({
      underlying: "AAPL",
      expiration: "2026-01-19",
      type: "call",
      strike: 150,
    });
  });

  it("parses valid put option ticker", () => {
    const result = parseOptionTicker("MSFT260315P00400000");
    expect(result).toEqual({
      underlying: "MSFT",
      expiration: "2026-03-15",
      type: "put",
      strike: 400,
    });
  });

  it("handles fractional strikes", () => {
    const result = parseOptionTicker("SPY260221C00475500");
    expect(result).toEqual({
      underlying: "SPY",
      expiration: "2026-02-21",
      type: "call",
      strike: 475.5,
    });
  });

  it("returns undefined for invalid ticker", () => {
    expect(parseOptionTicker("AAPL")).toBeUndefined();
    expect(parseOptionTicker("invalid")).toBeUndefined();
    expect(parseOptionTicker("")).toBeUndefined();
  });
});

// ============================================
// buildOptionTicker Tests
// ============================================

describe("buildOptionTicker", () => {
  it("builds call option ticker", () => {
    const ticker = buildOptionTicker("AAPL", "2026-01-19", "call", 150);
    expect(ticker).toBe("AAPL260119C00150000");
  });

  it("builds put option ticker", () => {
    const ticker = buildOptionTicker("MSFT", "2026-03-15", "put", 400);
    expect(ticker).toBe("MSFT260315P00400000");
  });

  it("handles fractional strikes", () => {
    const ticker = buildOptionTicker("SPY", "2026-02-21", "call", 475.5);
    expect(ticker).toBe("SPY260221C00475500");
  });

  it("roundtrips with parseOptionTicker", () => {
    const original = {
      underlying: "AAPL",
      expiration: "2026-01-19",
      type: "call" as const,
      strike: 150,
    };
    const ticker = buildOptionTicker(
      original.underlying,
      original.expiration,
      original.type,
      original.strike
    );
    const parsed = parseOptionTicker(ticker);
    expect(parsed).toEqual(original);
  });
});

// ============================================
// calculateDte Tests
// ============================================

describe("calculateDte", () => {
  it("calculates positive DTE", () => {
    // 30 days from now
    const future = new Date();
    future.setDate(future.getDate() + 30);
    const expiration = future.toISOString().split("T")[0];

    if (!expiration) {
      throw new Error("Failed to get expiration date");
    }

    const dte = calculateDte(expiration);
    expect(dte).toBeGreaterThanOrEqual(29);
    expect(dte).toBeLessThanOrEqual(31);
  });

  it("returns 0 for today", () => {
    const today = new Date().toISOString().split("T")[0];
    if (!today) {
      throw new Error("Failed to get today's date");
    }
    const dte = calculateDte(today);
    expect(dte).toBeLessThanOrEqual(1);
  });
});

// ============================================
// DEFAULT_FILTERS Tests
// ============================================

describe("DEFAULT_FILTERS", () => {
  it("has creditSpread filter", () => {
    expect(DEFAULT_FILTERS.creditSpread).toBeDefined();
    expect(DEFAULT_FILTERS.creditSpread?.minDte).toBe(30);
    expect(DEFAULT_FILTERS.creditSpread?.maxDte).toBe(60);
  });

  it("has debitSpread filter", () => {
    expect(DEFAULT_FILTERS.debitSpread).toBeDefined();
    expect(DEFAULT_FILTERS.debitSpread?.minDelta).toBe(0.3);
  });

  it("has coveredCall filter with call type", () => {
    expect(DEFAULT_FILTERS.coveredCall).toBeDefined();
    expect(DEFAULT_FILTERS.coveredCall?.optionType).toBe("call");
  });

  it("has cashSecuredPut filter with put type", () => {
    expect(DEFAULT_FILTERS.cashSecuredPut).toBeDefined();
    expect(DEFAULT_FILTERS.cashSecuredPut?.optionType).toBe("put");
  });
});

// ============================================
// OptionChainScanner Tests
// ============================================

describe("OptionChainScanner", () => {
  describe("scan", () => {
    it("fetches and returns option chain", async () => {
      const client = createMockClient();
      const scanner = new OptionChainScanner(client);

      const results = await scanner.scan("AAPL", {});
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.underlying).toBe("AAPL");
    });

    it("filters by DTE", async () => {
      const client = createMockClient();
      const scanner = new OptionChainScanner(client);

      const filter: OptionFilterCriteria = {
        minDte: 25,
        maxDte: 50,
      };

      const results = await scanner.scan("AAPL", filter);

      for (const opt of results) {
        expect(opt.dte).toBeGreaterThanOrEqual(25);
        expect(opt.dte).toBeLessThanOrEqual(50);
      }
    });

    it("filters by option type", async () => {
      const client = createMockClient();
      const scanner = new OptionChainScanner(client);

      const callsOnly = await scanner.scan("AAPL", { optionType: "call" });
      for (const opt of callsOnly) {
        expect(opt.type).toBe("call");
      }

      const putsOnly = await scanner.scan("AAPL", { optionType: "put" });
      for (const opt of putsOnly) {
        expect(opt.type).toBe("put");
      }
    });
  });

  describe("caching", () => {
    it("caches results", async () => {
      const client = createMockClient();
      const scanner = new OptionChainScanner(client, 60000); // 1 minute cache

      // First call
      await scanner.scan("AAPL", {});
      expect(client.getOptionContracts).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await scanner.scan("AAPL", {});
      expect(client.getOptionContracts).toHaveBeenCalledTimes(1);
    });

    it("clears cache when requested", async () => {
      const client = createMockClient();
      const scanner = new OptionChainScanner(client, 60000);

      await scanner.scan("AAPL", {});
      expect(client.getOptionContracts).toHaveBeenCalledTimes(1);

      scanner.clearCache("AAPL");

      await scanner.scan("AAPL", {});
      expect(client.getOptionContracts).toHaveBeenCalledTimes(2);
    });
  });

  describe("getTopCandidates", () => {
    it("returns top N candidates for strategy", async () => {
      const client = createMockClient();
      const scanner = new OptionChainScanner(client);

      const candidates = await scanner.getTopCandidates("AAPL", "longOption", 3);
      expect(candidates.length).toBeLessThanOrEqual(3);
    });
  });
});

// ============================================
// Filtering Logic Tests
// ============================================

describe("filtering logic", () => {
  it("filters by minimum volume", async () => {
    const client = createMockClient();
    const scanner = new OptionChainScanner(client);

    // Without greeks provider, volume is undefined, so filter should exclude all
    const results = await scanner.scan("AAPL", { minVolume: 100 });
    expect(results.length).toBe(0);
  });

  it("allows 'both' option type", async () => {
    const client = createMockClient();
    const scanner = new OptionChainScanner(client);

    const results = await scanner.scan("AAPL", { optionType: "both" });
    const types = new Set(results.map((r) => r.type));
    expect(types.size).toBeGreaterThanOrEqual(1);
  });
});

// ============================================
// Scoring Tests
// ============================================

describe("scoring", () => {
  it("assigns liquidity score", async () => {
    const client = createMockClient();
    const scanner = new OptionChainScanner(client);

    // Provide mock greeks with volume and OI
    const greeksProvider = async (tickers: string[]) => {
      const map = new Map();
      for (const ticker of tickers) {
        map.set(ticker, {
          delta: 0.25,
          volume: 500,
          openInterest: 2000,
          bid: 1.5,
          ask: 1.55,
        });
      }
      return map;
    };

    const results = await scanner.scan("AAPL", {}, greeksProvider);

    for (const opt of results) {
      expect(opt.liquidityScore).toBeDefined();
      expect(opt.liquidityScore).toBeGreaterThan(0);
    }
  });

  it("ranks options by overall score", async () => {
    const client = createMockClient();
    const scanner = new OptionChainScanner(client);

    const greeksProvider = async (tickers: string[]) => {
      const map = new Map();
      for (const [i, ticker] of tickers.entries()) {
        map.set(ticker, {
          delta: 0.2 + i * 0.05,
          volume: 100 + i * 100,
          openInterest: 500 + i * 500,
          bid: 1.5,
          ask: 1.55,
        });
      }
      return map;
    };

    const results = await scanner.scan("AAPL", {}, greeksProvider);

    // Verify sorted by score (descending)
    for (let i = 1; i < results.length; i++) {
      const prev = results[i - 1];
      const curr = results[i];
      expect(prev?.overallScore).toBeGreaterThanOrEqual(curr?.overallScore ?? 0);
    }
  });
});
