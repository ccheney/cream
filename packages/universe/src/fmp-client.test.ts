/**
 * FMP Client Tests
 */

// Set required environment variables before imports
process.env.CREAM_ENV = "BACKTEST";
process.env.FMP_KEY = "test-api-key";

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  createFMPClient,
  FMPClient,
  type FMPConstituent,
  type FMPETFHolding,
  type FMPHistoricalConstituent,
  type FMPScreenerResult,
} from "./fmp-client.js";

// Mock responses
const mockConstituents: FMPConstituent[] = [
  { symbol: "AAPL", name: "Apple Inc.", sector: "Technology" },
  { symbol: "MSFT", name: "Microsoft Corporation", sector: "Technology" },
  { symbol: "GOOGL", name: "Alphabet Inc.", sector: "Communication Services" },
];

const mockHistoricalConstituents: FMPHistoricalConstituent[] = [
  {
    dateAdded: "2024-06-24",
    addedSecurity: "GEV",
    removedTicker: "FRC",
    removedSecurity: "First Republic Bank",
    symbol: "GEV",
    reason: "Company acquired",
  },
  {
    dateAdded: "2023-03-20",
    addedSecurity: "GEHC",
    removedTicker: "VTR",
    removedSecurity: "Ventas Inc.",
    symbol: "GEHC",
    reason: "Market cap change",
  },
];

const mockETFHoldings: FMPETFHolding[] = [
  { asset: "AAPL", name: "Apple Inc.", sharesNumber: 1000000, weightPercentage: 7.5 },
  { asset: "MSFT", name: "Microsoft Corp", sharesNumber: 800000, weightPercentage: 6.2 },
  { asset: "NVDA", name: "NVIDIA Corp", sharesNumber: 500000, weightPercentage: 4.8 },
];

const mockScreenerResults: FMPScreenerResult[] = [
  {
    symbol: "AAPL",
    companyName: "Apple Inc.",
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
    isActivelyTrading: true,
    isEtf: false,
  },
];

const mockProfile = [
  {
    symbol: "AAPL",
    companyName: "Apple Inc.",
    sector: "Technology",
    industry: "Consumer Electronics",
    mktCap: 3000000000000,
    price: 195.5,
    volAvg: 50000000,
  },
];

describe("FMPClient", () => {
  let originalFetch: typeof global.fetch;
  let mockFetch: ReturnType<typeof mock>;

  beforeEach(() => {
    originalFetch = global.fetch;
    mockFetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response)
    );
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // ========================================
  // Client Creation
  // ========================================

  test("creates client with config", () => {
    const client = new FMPClient({ apiKey: "test-key" });
    expect(client).toBeDefined();
  });

  test("creates client with custom config", () => {
    const client = new FMPClient({
      apiKey: "test-key",
      baseUrl: "https://custom.api.com",
      timeout: 60000,
      retries: 5,
      retryDelay: 2000,
    });
    expect(client).toBeDefined();
  });

  test("createFMPClient uses environment variable", () => {
    const client = createFMPClient();
    expect(client).toBeDefined();
  });

  test("createFMPClient throws without API key", () => {
    const originalKey = process.env.FMP_KEY;
    delete process.env.FMP_KEY;

    expect(() => createFMPClient()).toThrow("FMP_KEY environment variable is required");

    process.env.FMP_KEY = originalKey;
  });

  test("createFMPClient allows override", () => {
    const client = createFMPClient({ apiKey: "override-key", timeout: 5000 });
    expect(client).toBeDefined();
  });

  // ========================================
  // Index Constituents
  // ========================================

  test("getIndexConstituents fetches SP500", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockConstituents),
      } as Response)
    );

    const client = new FMPClient({ apiKey: "test-key" });
    const result = await client.getIndexConstituents("SP500");

    expect(result).toEqual(mockConstituents);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain("/sp500_constituent");
    expect(url).toContain("apikey=test-key");
  });

  test("getIndexConstituents fetches NASDAQ100", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockConstituents),
      } as Response)
    );

    const client = new FMPClient({ apiKey: "test-key" });
    await client.getIndexConstituents("NASDAQ100");

    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain("/nasdaq_constituent");
  });

  test("getIndexConstituents fetches DOWJONES", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockConstituents),
      } as Response)
    );

    const client = new FMPClient({ apiKey: "test-key" });
    await client.getIndexConstituents("DOWJONES");

    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain("/dowjones_constituent");
  });

  test("getIndexConstituents fetches RUSSELL2000", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockConstituents),
      } as Response)
    );

    const client = new FMPClient({ apiKey: "test-key" });
    await client.getIndexConstituents("RUSSELL2000");

    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain("/russell_2000_constituent");
  });

  test("getIndexConstituents fetches RUSSELL3000", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockConstituents),
      } as Response)
    );

    const client = new FMPClient({ apiKey: "test-key" });
    await client.getIndexConstituents("RUSSELL3000");

    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain("/russell_3000_constituent");
  });

  test("getIndexConstituents throws for unsupported index", async () => {
    const client = new FMPClient({ apiKey: "test-key" });

    await expect(client.getIndexConstituents("INVALID" as any)).rejects.toThrow(
      "Unsupported index: INVALID"
    );
  });

  // ========================================
  // Historical Constituents
  // ========================================

  test("getHistoricalConstituents fetches SP500 history", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockHistoricalConstituents),
      } as Response)
    );

    const client = new FMPClient({ apiKey: "test-key" });
    const result = await client.getHistoricalConstituents("SP500");

    expect(result).toEqual(mockHistoricalConstituents);
    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain("/historical/sp500_constituent");
  });

  test("getHistoricalConstituents fetches NASDAQ100 history", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockHistoricalConstituents),
      } as Response)
    );

    const client = new FMPClient({ apiKey: "test-key" });
    await client.getHistoricalConstituents("NASDAQ100");

    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain("/historical/nasdaq_constituent");
  });

  test("getHistoricalConstituents throws for unsupported index", async () => {
    const client = new FMPClient({ apiKey: "test-key" });

    await expect(client.getHistoricalConstituents("RUSSELL2000")).rejects.toThrow(
      "Historical data not available for index: RUSSELL2000"
    );
  });

  // ========================================
  // Constituents As Of Date
  // ========================================

  test("getConstituentsAsOf reconstructs historical universe", async () => {
    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      // First call: current constituents
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              { symbol: "AAPL", name: "Apple", sector: "Technology" },
              { symbol: "GEV", name: "GE Vernova", sector: "Industrials" },
              { symbol: "GEHC", name: "GE HealthCare", sector: "Healthcare" },
            ]),
        } as Response);
      }
      // Second call: historical changes
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              dateAdded: "2024-06-24",
              symbol: "GEV",
              removedTicker: "FRC",
              addedSecurity: "GE Vernova",
              removedSecurity: "First Republic Bank",
              reason: "Acquisition",
            },
            {
              dateAdded: "2023-03-20",
              symbol: "GEHC",
              removedTicker: "VTR",
              addedSecurity: "GE HealthCare",
              removedSecurity: "Ventas",
              reason: "Spin-off",
            },
          ]),
      } as Response);
    });

    const client = new FMPClient({ apiKey: "test-key" });

    // Query as of 2023-01-01 - before both changes
    const asOf2023 = await client.getConstituentsAsOf("SP500", new Date("2023-01-01"));

    // Should have AAPL, FRC, VTR (GEV and GEHC removed, FRC and VTR added back)
    expect(asOf2023).toContain("AAPL");
    expect(asOf2023).toContain("FRC");
    expect(asOf2023).toContain("VTR");
    expect(asOf2023).not.toContain("GEV");
    expect(asOf2023).not.toContain("GEHC");
  });

  // ========================================
  // ETF Holdings
  // ========================================

  test("getETFHoldings fetches holdings", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockETFHoldings),
      } as Response)
    );

    const client = new FMPClient({ apiKey: "test-key" });
    const result = await client.getETFHoldings("SPY");

    expect(result).toEqual(mockETFHoldings);
    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain("/etf-holder/SPY");
  });

  // ========================================
  // Stock Screener
  // ========================================

  test("screenStocks with no filters", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockScreenerResults),
      } as Response)
    );

    const client = new FMPClient({ apiKey: "test-key" });
    const result = await client.screenStocks({});

    expect(result).toEqual(mockScreenerResults);
    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain("/stock-screener");
  });

  test("screenStocks with all filters", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockScreenerResults),
      } as Response)
    );

    const client = new FMPClient({ apiKey: "test-key" });
    await client.screenStocks({
      marketCapMoreThan: 1000000000,
      marketCapLowerThan: 100000000000,
      volumeMoreThan: 1000000,
      volumeLowerThan: 100000000,
      priceMoreThan: 10,
      priceLowerThan: 500,
      betaMoreThan: 0.5,
      betaLowerThan: 2.0,
      dividendMoreThan: 1.0,
      dividendLowerThan: 5.0,
      sector: "Technology",
      industry: "Software",
      country: "US",
      exchange: "NASDAQ",
      isActivelyTrading: true,
      isEtf: false,
      limit: 100,
    });

    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain("marketCapMoreThan=1000000000");
    expect(url).toContain("marketCapLowerThan=100000000000");
    expect(url).toContain("volumeMoreThan=1000000");
    expect(url).toContain("volumeLowerThan=100000000");
    expect(url).toContain("priceMoreThan=10");
    expect(url).toContain("priceLowerThan=500");
    expect(url).toContain("betaMoreThan=0.5");
    expect(url).toContain("betaLowerThan=2");
    expect(url).toContain("dividendMoreThan=1");
    expect(url).toContain("dividendLowerThan=5");
    expect(url).toContain("sector=Technology");
    expect(url).toContain("industry=Software");
    expect(url).toContain("country=US");
    expect(url).toContain("exchange=NASDAQ");
    expect(url).toContain("isActivelyTrading=true");
    expect(url).toContain("isEtf=false");
    expect(url).toContain("limit=100");
  });

  // ========================================
  // Company Profile
  // ========================================

  test("getCompanyProfile returns profile", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockProfile),
      } as Response)
    );

    const client = new FMPClient({ apiKey: "test-key" });
    const result = await client.getCompanyProfile("AAPL");

    expect(result).toEqual(mockProfile[0]);
    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain("/profile/AAPL");
  });

  test("getCompanyProfile returns null for empty response", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response)
    );

    const client = new FMPClient({ apiKey: "test-key" });
    const result = await client.getCompanyProfile("UNKNOWN");

    expect(result).toBeNull();
  });

  test("getCompanyProfiles returns map of profiles", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              symbol: "AAPL",
              companyName: "Apple Inc.",
              sector: "Technology",
              industry: "Consumer Electronics",
              mktCap: 3000000000000,
              price: 195.5,
              volAvg: 50000000,
            },
            {
              symbol: "MSFT",
              companyName: "Microsoft Corp",
              sector: "Technology",
              industry: "Software",
              mktCap: 2800000000000,
              price: 420.0,
              volAvg: 25000000,
            },
          ]),
      } as Response)
    );

    const client = new FMPClient({ apiKey: "test-key" });
    const result = await client.getCompanyProfiles(["AAPL", "MSFT"]);

    expect(result.size).toBe(2);
    expect(result.get("AAPL")!.companyName).toBe("Apple Inc.");
    expect(result.get("MSFT")!.companyName).toBe("Microsoft Corp");
  });

  test("getCompanyProfiles batches large requests", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response)
    );

    const client = new FMPClient({ apiKey: "test-key" });
    const symbols = Array.from({ length: 100 }, (_, i) => `SYM${i}`);
    await client.getCompanyProfiles(symbols);

    // Should make 2 requests (100 symbols / 50 per batch)
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  // ========================================
  // Error Handling and Retries
  // ========================================

  test("handles API error response", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      } as Response)
    );

    const client = new FMPClient({ apiKey: "invalid-key", retries: 1 });

    await expect(client.getIndexConstituents("SP500")).rejects.toThrow(
      "FMP API error: 401 Unauthorized"
    );
  });

  test("retries on transient errors", async () => {
    let attempt = 0;
    mockFetch.mockImplementation(() => {
      attempt++;
      if (attempt < 2) {
        return Promise.reject(new Error("Network error"));
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockConstituents),
      } as Response);
    });

    const client = new FMPClient({ apiKey: "test-key", retries: 3, retryDelay: 10 });
    const result = await client.getIndexConstituents("SP500");

    expect(result).toEqual(mockConstituents);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  test("throws after all retries exhausted", async () => {
    mockFetch.mockImplementation(() => Promise.reject(new Error("Network error")));

    const client = new FMPClient({ apiKey: "test-key", retries: 2, retryDelay: 10 });

    await expect(client.getIndexConstituents("SP500")).rejects.toThrow("Network error");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  test("does not retry on 4xx errors (except 429)", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 404,
        statusText: "Not Found",
      } as Response)
    );

    const client = new FMPClient({ apiKey: "test-key", retries: 3 });

    await expect(client.getIndexConstituents("SP500")).rejects.toThrow(
      "FMP API error: 404 Not Found"
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
