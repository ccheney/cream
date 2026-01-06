/**
 * Alpha Vantage API Client Tests
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  AlphaVantageClient,
  EconomicDataPointSchema,
  EconomicIndicatorResponseSchema,
  FederalFundsRateResponseSchema,
  INDICATOR_METADATA,
  TreasuryYieldResponseSchema,
} from "../src/providers/alphavantage";
import { createJsonResponse, createMockFetch, getMockCallUrl, type MockFetch } from "./helpers";

// ============================================
// Tests
// ============================================

describe("AlphaVantageClient", () => {
  // Mock fetch for testing
  const originalFetch = globalThis.fetch;
  let mockFetch: MockFetch;
  let client: AlphaVantageClient;

  const mockEconomicResponse = {
    name: "Test Indicator",
    interval: "monthly",
    unit: "percent",
    data: [
      { date: "2024-01-01", value: "3.5" },
      { date: "2023-12-01", value: "3.4" },
      { date: "2023-11-01", value: "3.3" },
    ],
  };

  beforeEach(() => {
    mockFetch = createMockFetch(() => Promise.resolve(createJsonResponse(mockEconomicResponse)));
    globalThis.fetch = mockFetch;
    client = new AlphaVantageClient({ apiKey: "test-key", tier: "premium" });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("constructor", () => {
    test("creates client with API key", () => {
      expect(client).toBeInstanceOf(AlphaVantageClient);
    });
  });

  describe("Treasury Yield", () => {
    test("fetches treasury yield data", async () => {
      const mockTreasuryResponse = {
        name: "10-Year Treasury Yield",
        interval: "daily",
        unit: "percent",
        data: [
          { date: "2024-01-15", value: "4.25" },
          { date: "2024-01-14", value: "4.20" },
        ],
      };
      mockFetch = createMockFetch(() => Promise.resolve(createJsonResponse(mockTreasuryResponse)));
      globalThis.fetch = mockFetch;

      const result = await client.getTreasuryYield("10year", "daily");

      expect(result.name).toBe("10-Year Treasury Yield");
      expect(result.data).toHaveLength(2);
      expect(result.data[0]?.value).toBe(4.25);
      const url = getMockCallUrl(mockFetch);
      expect(url).toContain("function=TREASURY_YIELD");
      expect(url).toContain("maturity=10year");
    });

    test("fetches 2-year treasury yield", async () => {
      await client.getTreasuryYield("2year");

      const url = getMockCallUrl(mockFetch);
      expect(url).toContain("maturity=2year");
    });
  });

  describe("Federal Funds Rate", () => {
    test("fetches federal funds rate", async () => {
      const mockFFRResponse = {
        name: "Federal Funds Rate",
        interval: "daily",
        unit: "percent",
        data: [{ date: "2024-01-15", value: "5.33" }],
      };
      mockFetch = createMockFetch(() => Promise.resolve(createJsonResponse(mockFFRResponse)));
      globalThis.fetch = mockFetch;

      const result = await client.getFederalFundsRate();

      expect(result.name).toBe("Federal Funds Rate");
      expect(result.data[0]?.value).toBe(5.33);
      const url = getMockCallUrl(mockFetch);
      expect(url).toContain("function=FEDERAL_FUNDS_RATE");
    });
  });

  describe("CPI", () => {
    test("fetches CPI data", async () => {
      const result = await client.getCPI();

      expect(result.name).toBe("Test Indicator");
      const url = getMockCallUrl(mockFetch);
      expect(url).toContain("function=CPI");
      expect(url).toContain("interval=monthly");
    });

    test("fetches semiannual CPI", async () => {
      await client.getCPI("semiannual");

      const url = getMockCallUrl(mockFetch);
      expect(url).toContain("interval=semiannual");
    });
  });

  describe("Real GDP", () => {
    test("fetches GDP data", async () => {
      const result = await client.getRealGDP();

      expect(result.name).toBe("Test Indicator");
      const url = getMockCallUrl(mockFetch);
      expect(url).toContain("function=REAL_GDP");
      expect(url).toContain("interval=quarterly");
    });

    test("fetches annual GDP", async () => {
      await client.getRealGDP("annual");

      const url = getMockCallUrl(mockFetch);
      expect(url).toContain("interval=annual");
    });
  });

  describe("Unemployment Rate", () => {
    test("fetches unemployment data", async () => {
      const result = await client.getUnemploymentRate();

      expect(result.name).toBe("Test Indicator");
      const url = getMockCallUrl(mockFetch);
      expect(url).toContain("function=UNEMPLOYMENT");
    });
  });

  describe("Inflation", () => {
    test("fetches inflation data", async () => {
      const result = await client.getInflation();

      expect(result.name).toBe("Test Indicator");
      const url = getMockCallUrl(mockFetch);
      expect(url).toContain("function=INFLATION");
    });
  });

  describe("Retail Sales", () => {
    test("fetches retail sales data", async () => {
      const result = await client.getRetailSales();

      expect(result.name).toBe("Test Indicator");
      const url = getMockCallUrl(mockFetch);
      expect(url).toContain("function=RETAIL_SALES");
    });
  });

  describe("Nonfarm Payroll", () => {
    test("fetches nonfarm payroll data", async () => {
      const result = await client.getNonfarmPayroll();

      expect(result.name).toBe("Test Indicator");
      const url = getMockCallUrl(mockFetch);
      expect(url).toContain("function=NONFARM_PAYROLL");
    });
  });

  describe("Durable Goods", () => {
    test("fetches durable goods data", async () => {
      const result = await client.getDurableGoods();

      expect(result.name).toBe("Test Indicator");
      const url = getMockCallUrl(mockFetch);
      expect(url).toContain("function=DURABLES");
    });
  });

  describe("Real GDP Per Capita", () => {
    test("fetches GDP per capita data", async () => {
      const result = await client.getRealGDPPerCapita();

      expect(result.name).toBe("Test Indicator");
      const url = getMockCallUrl(mockFetch);
      expect(url).toContain("function=REAL_GDP_PER_CAPITA");
    });
  });

  describe("Inflation Expectation", () => {
    test("fetches inflation expectation data", async () => {
      const result = await client.getInflationExpectation();

      expect(result.name).toBe("Test Indicator");
      const url = getMockCallUrl(mockFetch);
      expect(url).toContain("function=INFLATION_EXPECTATION");
    });
  });

  describe("Consumer Sentiment", () => {
    test("fetches consumer sentiment data", async () => {
      const result = await client.getConsumerSentiment();

      expect(result.name).toBe("Test Indicator");
      const url = getMockCallUrl(mockFetch);
      expect(url).toContain("function=CONSUMER_SENTIMENT");
    });
  });

  describe("Static Utility Methods", () => {
    test("getLatestValue returns first data point value", () => {
      const response = {
        name: "Test",
        interval: "monthly",
        unit: "percent",
        data: [
          { date: "2024-01-01", value: 3.5 },
          { date: "2023-12-01", value: 3.4 },
        ],
      };

      expect(AlphaVantageClient.getLatestValue(response)).toBe(3.5);
    });

    test("getLatestValue returns null for empty data", () => {
      const response = {
        name: "Test",
        interval: "monthly",
        unit: "percent",
        data: [],
      };

      expect(AlphaVantageClient.getLatestValue(response)).toBeNull();
    });

    test("getLatestValue returns null for null value", () => {
      const response = {
        name: "Test",
        interval: "monthly",
        unit: "percent",
        data: [{ date: "2024-01-01", value: null }],
      };

      expect(AlphaVantageClient.getLatestValue(response)).toBeNull();
    });

    test("getValueAtDate returns value at exact date", () => {
      const response = {
        name: "Test",
        interval: "monthly",
        unit: "percent",
        data: [
          { date: "2024-01-01", value: 3.5 },
          { date: "2023-12-01", value: 3.4 },
          { date: "2023-11-01", value: 3.3 },
        ],
      };

      const result = AlphaVantageClient.getValueAtDate(response, "2023-12-01");
      expect(result?.date).toBe("2023-12-01");
      expect(result?.value).toBe(3.4);
    });

    test("getValueAtDate returns nearest prior date", () => {
      const response = {
        name: "Test",
        interval: "monthly",
        unit: "percent",
        data: [
          { date: "2024-01-01", value: 3.5 },
          { date: "2023-12-01", value: 3.4 },
          { date: "2023-11-01", value: 3.3 },
        ],
      };

      const result = AlphaVantageClient.getValueAtDate(response, "2023-12-15");
      expect(result?.date).toBe("2023-12-01");
      expect(result?.value).toBe(3.4);
    });

    test("getValueAtDate returns null for date before all data", () => {
      const response = {
        name: "Test",
        interval: "monthly",
        unit: "percent",
        data: [{ date: "2024-01-01", value: 3.5 }],
      };

      const result = AlphaVantageClient.getValueAtDate(response, "2020-01-01");
      expect(result).toBeNull();
    });

    test("getPercentChange calculates correct change", () => {
      const response = {
        name: "Test",
        interval: "monthly",
        unit: "percent",
        data: [
          { date: "2024-01-01", value: 110 },
          { date: "2023-12-01", value: 100 },
        ],
      };

      const change = AlphaVantageClient.getPercentChange(response, "2023-12-01", "2024-01-01");
      expect(change).toBe(10); // 10% increase
    });

    test("getPercentChange returns null for missing dates", () => {
      const response = {
        name: "Test",
        interval: "monthly",
        unit: "percent",
        data: [{ date: "2024-01-01", value: 100 }],
      };

      const change = AlphaVantageClient.getPercentChange(response, "2020-01-01", "2024-01-01");
      expect(change).toBeNull();
    });

    test("getMetadata returns indicator metadata", () => {
      const metadata = AlphaVantageClient.getMetadata("REAL_GDP");

      expect(metadata.name).toBe("Real GDP");
      expect(metadata.frequency).toBe("quarterly");
      expect(metadata.unit).toBe("billions of dollars");
    });

    test("getAllMetadata returns all metadata", () => {
      const allMetadata = AlphaVantageClient.getAllMetadata();

      expect(Object.keys(allMetadata)).toContain("REAL_GDP");
      expect(Object.keys(allMetadata)).toContain("CPI");
      expect(Object.keys(allMetadata)).toContain("UNEMPLOYMENT");
    });
  });
});

describe("Zod Schemas", () => {
  test("EconomicDataPointSchema parses numeric value", () => {
    const data = { date: "2024-01-01", value: "3.5" };
    const parsed = EconomicDataPointSchema.parse(data);
    expect(parsed.value).toBe(3.5);
  });

  test("EconomicDataPointSchema handles missing value marker", () => {
    const data = { date: "2024-01-01", value: "." };
    const parsed = EconomicDataPointSchema.parse(data);
    expect(parsed.value).toBeNull();
  });

  test("EconomicIndicatorResponseSchema validates complete response", () => {
    const data = {
      name: "Test Indicator",
      interval: "monthly",
      unit: "percent",
      data: [
        { date: "2024-01-01", value: "3.5" },
        { date: "2023-12-01", value: "3.4" },
      ],
    };
    const parsed = EconomicIndicatorResponseSchema.parse(data);
    expect(parsed.name).toBe("Test Indicator");
    expect(parsed.data).toHaveLength(2);
    expect(parsed.data[0]?.value).toBe(3.5);
  });

  test("TreasuryYieldResponseSchema validates treasury data", () => {
    const data = {
      name: "10-Year Treasury Yield",
      interval: "daily",
      unit: "percent",
      data: [{ date: "2024-01-15", value: "4.25" }],
    };
    expect(() => TreasuryYieldResponseSchema.parse(data)).not.toThrow();
  });

  test("FederalFundsRateResponseSchema validates FFR data", () => {
    const data = {
      name: "Federal Funds Rate",
      interval: "daily",
      unit: "percent",
      data: [{ date: "2024-01-15", value: "5.33" }],
    };
    expect(() => FederalFundsRateResponseSchema.parse(data)).not.toThrow();
  });
});

describe("Indicator Metadata", () => {
  test("all indicators have required fields", () => {
    for (const [key, metadata] of Object.entries(INDICATOR_METADATA)) {
      expect(metadata.code).toBe(key as typeof metadata.code);
      expect(metadata.name).toBeTruthy();
      expect(metadata.description).toBeTruthy();
      expect(metadata.unit).toBeTruthy();
      expect(metadata.frequency).toBeTruthy();
      expect(metadata.cacheTtlMs).toBeGreaterThan(0);
    }
  });

  test("daily indicators have 24h cache TTL", () => {
    const dailyIndicators = Object.values(INDICATOR_METADATA).filter(
      (m) => m.frequency === "daily"
    );
    for (const indicator of dailyIndicators) {
      expect(indicator.cacheTtlMs).toBe(86400000); // 24 hours
    }
  });

  test("quarterly indicators have longer cache TTL", () => {
    const quarterlyIndicators = Object.values(INDICATOR_METADATA).filter(
      (m) => m.frequency === "quarterly"
    );
    for (const indicator of quarterlyIndicators) {
      expect(indicator.cacheTtlMs).toBeGreaterThanOrEqual(86400000 * 7); // 7 days
    }
  });
});
