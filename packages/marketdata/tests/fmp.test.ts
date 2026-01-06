/**
 * FMP API Client Tests
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  ConstituentChangeSchema,
  EarningsEventSchema,
  EarningsTranscriptSchema,
  FmpClient,
  IndexConstituentSchema,
  PressReleaseSchema,
  QuoteSchema,
  ScreenerResultSchema,
  SecFilingSchema,
  SentimentRatingSchema,
  StockDividendSchema,
  StockNewsSchema,
  StockSplitSchema,
  SymbolChangeSchema,
} from "../src/providers/fmp";
import { createJsonResponse, createMockFetch, getMockCallUrl, type MockFetch } from "./helpers";

// ============================================
// Tests
// ============================================

describe("FmpClient", () => {
  // Mock fetch for testing
  const originalFetch = globalThis.fetch;
  let mockFetch: MockFetch;
  let client: FmpClient;

  beforeEach(() => {
    mockFetch = createMockFetch(() => Promise.resolve(createJsonResponse([])));
    globalThis.fetch = mockFetch;
    client = new FmpClient({ apiKey: "test-key", tier: "starter" });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("constructor", () => {
    test("creates client with API key", () => {
      expect(client).toBeInstanceOf(FmpClient);
    });
  });

  describe("getEarningsTranscript", () => {
    test("fetches earnings transcript", async () => {
      const mockTranscript = {
        symbol: "AAPL",
        quarter: 1,
        year: 2024,
        date: "2024-01-25",
        content: "Good afternoon everyone...",
      };
      mockFetch = createMockFetch(() => Promise.resolve(createJsonResponse([mockTranscript])));
      globalThis.fetch = mockFetch;

      const result = await client.getEarningsTranscript("AAPL", 1, 2024);

      expect(result).toHaveLength(1);
      expect(result[0]?.symbol).toBe("AAPL");
      expect(result[0]?.quarter).toBe(1);
      expect(mockFetch).toHaveBeenCalled();
      const url = getMockCallUrl(mockFetch);
      expect(url).toContain("/v3/earning_call_transcript/AAPL");
      expect(url).toContain("apikey=test-key");
    });
  });

  describe("getSecFilings", () => {
    test("fetches SEC filings", async () => {
      const mockFiling = {
        symbol: "AAPL",
        cik: "0000320193",
        type: "10-K",
        link: "https://sec.gov/...",
        finalLink: "https://sec.gov/final/...",
        acceptedDate: "2024-01-15 08:00:00",
        fillingDate: "2024-01-15",
      };
      mockFetch = createMockFetch(() => Promise.resolve(createJsonResponse([mockFiling])));
      globalThis.fetch = mockFetch;

      const result = await client.getSecFilings("AAPL", "10-K");

      expect(result).toHaveLength(1);
      expect(result[0]?.type).toBe("10-K");
      const url = getMockCallUrl(mockFetch);
      expect(url).toContain("/v3/sec_filings/AAPL");
      expect(url).toContain("type=10-K");
    });
  });

  describe("getSentimentRatings", () => {
    test("fetches sentiment ratings", async () => {
      const mockRating = {
        symbol: "AAPL",
        date: "2024-01-15",
        rating: "Strong Buy",
        ratingScore: 5,
        ratingRecommendation: "Strong Buy",
      };
      mockFetch = createMockFetch(() => Promise.resolve(createJsonResponse([mockRating])));
      globalThis.fetch = mockFetch;

      const result = await client.getSentimentRatings("AAPL");

      expect(result).toHaveLength(1);
      expect(result[0]?.rating).toBe("Strong Buy");
    });
  });

  describe("getStockNews", () => {
    test("fetches stock news", async () => {
      const mockNews = {
        symbol: "AAPL",
        publishedDate: "2024-01-15 10:30:00",
        title: "Apple announces new product",
        text: "Apple Inc announced...",
        url: "https://news.com/article",
        site: "news.com",
      };
      mockFetch = createMockFetch(() => Promise.resolve(createJsonResponse([mockNews])));
      globalThis.fetch = mockFetch;

      const result = await client.getStockNews(["AAPL", "MSFT"]);

      expect(result).toHaveLength(1);
      const url = getMockCallUrl(mockFetch);
      expect(url).toContain("tickers=AAPL%2CMSFT");
    });
  });

  describe("Index Constituents", () => {
    test("fetches S&P 500 constituents", async () => {
      const mockConstituent = {
        symbol: "AAPL",
        name: "Apple Inc",
        sector: "Technology",
        subSector: "Consumer Electronics",
        headQuarter: "Cupertino, California",
        dateFirstAdded: "1982-11-30",
        cik: "0000320193",
        founded: "1976",
      };
      mockFetch = createMockFetch(() => Promise.resolve(createJsonResponse([mockConstituent])));
      globalThis.fetch = mockFetch;

      const result = await client.getSP500Constituents();

      expect(result).toHaveLength(1);
      expect(result[0]?.symbol).toBe("AAPL");
      const url = getMockCallUrl(mockFetch);
      expect(url).toContain("/v3/sp500_constituent");
    });

    test("fetches NASDAQ 100 constituents", async () => {
      mockFetch = createMockFetch(() =>
        Promise.resolve(
          createJsonResponse([{ symbol: "AAPL", name: "Apple Inc", sector: "Technology" }])
        )
      );
      globalThis.fetch = mockFetch;

      const result = await client.getNasdaq100Constituents();

      expect(result).toHaveLength(1);
      const url = getMockCallUrl(mockFetch);
      expect(url).toContain("/v3/nasdaq_constituent");
    });

    test("fetches Dow Jones constituents", async () => {
      mockFetch = createMockFetch(() =>
        Promise.resolve(
          createJsonResponse([{ symbol: "AAPL", name: "Apple Inc", sector: "Technology" }])
        )
      );
      globalThis.fetch = mockFetch;

      const result = await client.getDowJonesConstituents();

      expect(result).toHaveLength(1);
      const url = getMockCallUrl(mockFetch);
      expect(url).toContain("/v3/dowjones_constituent");
    });
  });

  describe("Historical Constituent Changes", () => {
    test("fetches S&P 500 constituent changes", async () => {
      const mockChange = {
        dateAdded: "2024-01-15",
        addedSecurity: "New Corp",
        removedTicker: "OLD",
        removedSecurity: "Old Corp",
        symbol: "NEW",
        reason: "Market cap increase",
      };
      mockFetch = createMockFetch(() => Promise.resolve(createJsonResponse([mockChange])));
      globalThis.fetch = mockFetch;

      const result = await client.getSP500ConstituentChanges();

      expect(result).toHaveLength(1);
      expect(result[0]?.symbol).toBe("NEW");
      expect(result[0]?.removedTicker).toBe("OLD");
      const url = getMockCallUrl(mockFetch);
      expect(url).toContain("/v3/historical/sp500_constituent");
    });

    test("fetches NASDAQ 100 constituent changes", async () => {
      mockFetch = createMockFetch(() =>
        Promise.resolve(
          createJsonResponse([
            {
              dateAdded: "2024-01-15",
              addedSecurity: "New Corp",
              removedTicker: null,
              removedSecurity: null,
              symbol: "NEW",
            },
          ])
        )
      );
      globalThis.fetch = mockFetch;

      const result = await client.getNasdaq100ConstituentChanges();

      expect(result).toHaveLength(1);
      const url = getMockCallUrl(mockFetch);
      expect(url).toContain("/v3/historical/nasdaq_constituent");
    });

    test("fetches Dow Jones constituent changes", async () => {
      mockFetch = createMockFetch(() =>
        Promise.resolve(
          createJsonResponse([
            {
              dateAdded: "2024-01-15",
              addedSecurity: "New Corp",
              removedTicker: null,
              removedSecurity: null,
              symbol: "NEW",
            },
          ])
        )
      );
      globalThis.fetch = mockFetch;

      const result = await client.getDowJonesConstituentChanges();

      expect(result).toHaveLength(1);
      const url = getMockCallUrl(mockFetch);
      expect(url).toContain("/v3/historical/dowjones_constituent");
    });
  });

  describe("Stock Screener", () => {
    test("screens stocks with filters", async () => {
      const mockResult = {
        symbol: "AAPL",
        companyName: "Apple Inc",
        marketCap: 3000000000000,
        sector: "Technology",
        industry: "Consumer Electronics",
        beta: 1.2,
        price: 195.5,
        lastAnnualDividend: 0.96,
        volume: 50000000,
        exchange: "NASDAQ",
        exchangeShortName: "NASDAQ",
        country: "US",
        isEtf: false,
        isActivelyTrading: true,
      };
      mockFetch = createMockFetch(() => Promise.resolve(createJsonResponse([mockResult])));
      globalThis.fetch = mockFetch;

      const result = await client.screenStocks({
        marketCapMoreThan: 1000000000000,
        sector: "Technology",
        volumeMoreThan: 10000000,
      });

      expect(result).toHaveLength(1);
      expect(result[0]?.symbol).toBe("AAPL");
      expect(result[0]?.marketCap).toBe(3000000000000);
      const url = getMockCallUrl(mockFetch);
      expect(url).toContain("/v3/stock-screener");
      expect(url).toContain("marketCapMoreThan=1000000000000");
      expect(url).toContain("sector=Technology");
    });

    test("applies default limit", async () => {
      mockFetch = createMockFetch(() => Promise.resolve(createJsonResponse([])));
      globalThis.fetch = mockFetch;

      await client.screenStocks();

      const url = getMockCallUrl(mockFetch);
      expect(url).toContain("limit=1000");
    });
  });

  describe("Earnings Calendar", () => {
    test("fetches earnings calendar with date range", async () => {
      const mockEvent = {
        date: "2024-01-25",
        symbol: "AAPL",
        eps: 2.18,
        epsEstimated: 2.1,
        time: "amc",
        revenue: 120000000000,
        revenueEstimated: 118000000000,
      };
      mockFetch = createMockFetch(() => Promise.resolve(createJsonResponse([mockEvent])));
      globalThis.fetch = mockFetch;

      const result = await client.getEarningsCalendar({
        from: "2024-01-20",
        to: "2024-01-30",
      });

      expect(result).toHaveLength(1);
      expect(result[0]?.symbol).toBe("AAPL");
      expect(result[0]?.eps).toBe(2.18);
      const url = getMockCallUrl(mockFetch);
      expect(url).toContain("/v3/earning_calendar");
      expect(url).toContain("from=2024-01-20");
      expect(url).toContain("to=2024-01-30");
    });

    test("fetches historical earnings for symbol", async () => {
      const mockEvent = {
        date: "2024-01-25",
        symbol: "AAPL",
        eps: 2.18,
        epsEstimated: 2.1,
        time: "amc",
        revenue: null,
        revenueEstimated: null,
      };
      mockFetch = createMockFetch(() => Promise.resolve(createJsonResponse([mockEvent])));
      globalThis.fetch = mockFetch;

      const result = await client.getHistoricalEarnings("AAPL");

      expect(result).toHaveLength(1);
      const url = getMockCallUrl(mockFetch);
      expect(url).toContain("/v3/historical/earning_calendar/AAPL");
    });
  });

  describe("Corporate Actions", () => {
    test("fetches stock splits", async () => {
      const mockSplit = {
        date: "2020-08-31",
        label: "August 31, 2020 (4:1)",
        symbol: "AAPL",
        numerator: 4,
        denominator: 1,
      };
      mockFetch = createMockFetch(() =>
        Promise.resolve(createJsonResponse({ historical: [mockSplit] }))
      );
      globalThis.fetch = mockFetch;

      const result = await client.getStockSplits("AAPL");

      expect(result).toHaveLength(1);
      expect(result[0]?.numerator).toBe(4);
      expect(result[0]?.denominator).toBe(1);
      const url = getMockCallUrl(mockFetch);
      expect(url).toContain("/v3/historical-price-full/stock_split/AAPL");
    });

    test("fetches stock dividends", async () => {
      const mockDividend = {
        date: "2024-01-12",
        label: "January 12, 2024",
        symbol: "AAPL",
        dividend: 0.24,
        adjDividend: 0.24,
        recordDate: "2024-01-15",
        paymentDate: "2024-02-15",
        declarationDate: "2024-01-02",
      };
      mockFetch = createMockFetch(() =>
        Promise.resolve(createJsonResponse({ historical: [mockDividend] }))
      );
      globalThis.fetch = mockFetch;

      const result = await client.getStockDividends("AAPL");

      expect(result).toHaveLength(1);
      expect(result[0]?.dividend).toBe(0.24);
      const url = getMockCallUrl(mockFetch);
      expect(url).toContain("/v3/historical-price-full/stock_dividend/AAPL");
    });

    test("fetches symbol changes", async () => {
      const mockChange = {
        date: "2024-01-15",
        name: "Example Corp",
        oldSymbol: "OLD",
        newSymbol: "NEW",
      };
      mockFetch = createMockFetch(() => Promise.resolve(createJsonResponse([mockChange])));
      globalThis.fetch = mockFetch;

      const result = await client.getSymbolChanges();

      expect(result).toHaveLength(1);
      expect(result[0]?.oldSymbol).toBe("OLD");
      expect(result[0]?.newSymbol).toBe("NEW");
      const url = getMockCallUrl(mockFetch);
      expect(url).toContain("/v4/symbol_change");
    });
  });

  describe("Press Releases", () => {
    test("fetches press releases", async () => {
      const mockRelease = {
        symbol: "AAPL",
        date: "2024-01-15 08:00:00",
        title: "Apple Reports Q1 Results",
        text: "CUPERTINO, California — Apple Inc. today announced...",
      };
      mockFetch = createMockFetch(() => Promise.resolve(createJsonResponse([mockRelease])));
      globalThis.fetch = mockFetch;

      const result = await client.getPressReleases("AAPL");

      expect(result).toHaveLength(1);
      expect(result[0]?.title).toBe("Apple Reports Q1 Results");
      const url = getMockCallUrl(mockFetch);
      expect(url).toContain("/v3/press-releases/AAPL");
      expect(url).toContain("limit=100");
    });
  });

  describe("Quotes", () => {
    test("fetches multiple quotes", async () => {
      const mockQuote = {
        symbol: "AAPL",
        name: "Apple Inc",
        price: 195.5,
        changesPercentage: 1.5,
        change: 2.89,
        dayLow: 193.0,
        dayHigh: 196.5,
        yearHigh: 199.62,
        yearLow: 124.17,
        marketCap: 3000000000000,
        priceAvg50: 185.0,
        priceAvg200: 175.0,
        volume: 50000000,
        avgVolume: 60000000,
        exchange: "NASDAQ",
        open: 193.5,
        previousClose: 192.61,
        eps: 6.13,
        pe: 31.89,
        earningsAnnouncement: "2024-01-25T00:00:00.000+0000",
        sharesOutstanding: 15500000000,
        timestamp: 1705350000,
      };
      mockFetch = createMockFetch(() => Promise.resolve(createJsonResponse([mockQuote])));
      globalThis.fetch = mockFetch;

      const result = await client.getQuotes(["AAPL"]);

      expect(result).toHaveLength(1);
      expect(result[0]?.price).toBe(195.5);
    });

    test("fetches single quote", async () => {
      const mockQuote = {
        symbol: "AAPL",
        name: "Apple Inc",
        price: 195.5,
        changesPercentage: 1.5,
        change: 2.89,
        dayLow: 193.0,
        dayHigh: 196.5,
        yearHigh: 199.62,
        yearLow: 124.17,
        marketCap: 3000000000000,
        priceAvg50: 185.0,
        priceAvg200: 175.0,
        volume: 50000000,
        avgVolume: 60000000,
        exchange: "NASDAQ",
        open: 193.5,
        previousClose: 192.61,
        eps: 6.13,
        pe: 31.89,
        earningsAnnouncement: "2024-01-25T00:00:00.000+0000",
        sharesOutstanding: 15500000000,
        timestamp: 1705350000,
      };
      mockFetch = createMockFetch(() => Promise.resolve(createJsonResponse([mockQuote])));
      globalThis.fetch = mockFetch;

      const result = await client.getQuote("AAPL");

      expect(result).toBeDefined();
      expect(result?.price).toBe(195.5);
    });

    test("returns undefined for missing quote", async () => {
      mockFetch = createMockFetch(() => Promise.resolve(createJsonResponse([])));
      globalThis.fetch = mockFetch;

      const result = await client.getQuote("INVALID");

      expect(result).toBeUndefined();
    });
  });
});

describe("Zod Schemas", () => {
  test("EarningsTranscriptSchema validates correct data", () => {
    const data = {
      symbol: "AAPL",
      quarter: 1,
      year: 2024,
      date: "2024-01-25",
      content: "Good afternoon...",
    };
    expect(() => EarningsTranscriptSchema.parse(data)).not.toThrow();
  });

  test("SecFilingSchema validates correct data", () => {
    const data = {
      symbol: "AAPL",
      cik: "0000320193",
      type: "10-K",
      link: "https://sec.gov/...",
      finalLink: "https://sec.gov/final/...",
      acceptedDate: "2024-01-15 08:00:00",
      fillingDate: "2024-01-15",
    };
    expect(() => SecFilingSchema.parse(data)).not.toThrow();
  });

  test("IndexConstituentSchema validates correct data", () => {
    const data = {
      symbol: "AAPL",
      name: "Apple Inc",
      sector: "Technology",
    };
    expect(() => IndexConstituentSchema.parse(data)).not.toThrow();
  });

  test("ConstituentChangeSchema validates with null values", () => {
    const data = {
      dateAdded: null,
      addedSecurity: null,
      removedTicker: "OLD",
      removedSecurity: "Old Corp",
      symbol: "OLD",
    };
    expect(() => ConstituentChangeSchema.parse(data)).not.toThrow();
  });

  test("ScreenerResultSchema validates correct data", () => {
    const data = {
      symbol: "AAPL",
      companyName: "Apple Inc",
      marketCap: 3000000000000,
      sector: "Technology",
      industry: "Consumer Electronics",
      beta: 1.2,
      price: 195.5,
      lastAnnualDividend: 0.96,
      volume: 50000000,
      exchange: "NASDAQ",
      country: "US",
    };
    expect(() => ScreenerResultSchema.parse(data)).not.toThrow();
  });

  test("EarningsEventSchema validates correct data", () => {
    const data = {
      date: "2024-01-25",
      symbol: "AAPL",
      eps: 2.18,
      epsEstimated: 2.1,
      time: "amc",
      revenue: 120000000000,
      revenueEstimated: 118000000000,
    };
    expect(() => EarningsEventSchema.parse(data)).not.toThrow();
  });

  test("StockSplitSchema validates correct data", () => {
    const data = {
      date: "2020-08-31",
      label: "August 31, 2020 (4:1)",
      symbol: "AAPL",
      numerator: 4,
      denominator: 1,
    };
    expect(() => StockSplitSchema.parse(data)).not.toThrow();
  });

  test("StockDividendSchema validates correct data", () => {
    const data = {
      date: "2024-01-12",
      label: "January 12, 2024",
      symbol: "AAPL",
      dividend: 0.24,
      adjDividend: 0.24,
      recordDate: "2024-01-15",
      paymentDate: "2024-02-15",
      declarationDate: "2024-01-02",
    };
    expect(() => StockDividendSchema.parse(data)).not.toThrow();
  });

  test("SymbolChangeSchema validates correct data", () => {
    const data = {
      date: "2024-01-15",
      name: "Example Corp",
      oldSymbol: "OLD",
      newSymbol: "NEW",
    };
    expect(() => SymbolChangeSchema.parse(data)).not.toThrow();
  });

  test("PressReleaseSchema validates correct data", () => {
    const data = {
      symbol: "AAPL",
      date: "2024-01-15 08:00:00",
      title: "Apple Reports Q1 Results",
      text: "CUPERTINO, California — Apple Inc. today announced...",
    };
    expect(() => PressReleaseSchema.parse(data)).not.toThrow();
  });

  test("QuoteSchema validates with nullable fields", () => {
    const data = {
      symbol: "AAPL",
      name: "Apple Inc",
      price: 195.5,
      changesPercentage: 1.5,
      change: 2.89,
      dayLow: 193.0,
      dayHigh: 196.5,
      yearHigh: 199.62,
      yearLow: 124.17,
      marketCap: null,
      priceAvg50: null,
      priceAvg200: null,
      volume: 50000000,
      avgVolume: 60000000,
      exchange: "NASDAQ",
      open: 193.5,
      previousClose: 192.61,
      eps: null,
      pe: null,
      earningsAnnouncement: null,
      sharesOutstanding: null,
      timestamp: 1705350000,
    };
    expect(() => QuoteSchema.parse(data)).not.toThrow();
  });

  test("SentimentRatingSchema validates correct data", () => {
    const data = {
      symbol: "AAPL",
      date: "2024-01-15",
      rating: "Strong Buy",
      ratingScore: 5,
      ratingRecommendation: "Strong Buy",
    };
    expect(() => SentimentRatingSchema.parse(data)).not.toThrow();
  });

  test("StockNewsSchema validates with optional image", () => {
    const data = {
      symbol: "AAPL",
      publishedDate: "2024-01-15 10:30:00",
      title: "Apple announces new product",
      text: "Apple Inc announced...",
      url: "https://news.com/article",
      site: "news.com",
    };
    expect(() => StockNewsSchema.parse(data)).not.toThrow();
  });
});
