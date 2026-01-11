/**
 * Fundamentals Batch Job Tests
 *
 * Unit tests for the FundamentalsBatchJob class and calculation functions.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type {
  CreateFundamentalIndicatorsInput,
  FundamentalsRepository,
} from "@cream/storage/repositories";
import {
  calculateAccrualsRatio,
  calculateAssetGrowth,
  calculateBeneishMScore,
  calculateCashFlowQuality,
  calculateGrossProfitability,
  type FMPBalanceSheet,
  type FMPCashFlowStatement,
  type FMPCompanyProfile,
  type FMPIncomeStatement,
  type FMPKeyMetrics,
  FundamentalsBatchJob,
  type FundamentalsFMPClient,
} from "./fundamentals-batch.js";

// ============================================
// Test Data Factories
// ============================================

function createMockKeyMetrics(overrides?: Partial<FMPKeyMetrics>): FMPKeyMetrics {
  return {
    symbol: "AAPL",
    date: "2024-09-28",
    calendarYear: "2024",
    period: "FY",
    peRatio: 28.5,
    priceToSalesRatio: 7.5,
    pbRatio: 45.2,
    enterpriseValueOverEBITDA: 22.3,
    earningsYield: 0.035,
    dividendYield: 0.005,
    roe: 1.65,
    returnOnAssets: 0.26,
    marketCap: 3500000000000,
    ...overrides,
  };
}

function createMockIncomeStatement(overrides?: Partial<FMPIncomeStatement>): FMPIncomeStatement {
  return {
    symbol: "AAPL",
    date: "2024-09-28",
    calendarYear: "2024",
    period: "FY",
    revenue: 391000000000,
    costOfRevenue: 214000000000,
    grossProfit: 177000000000,
    netIncome: 94000000000,
    operatingIncome: 119000000000,
    depreciationAndAmortization: 11000000000,
    ...overrides,
  };
}

function createMockBalanceSheet(overrides?: Partial<FMPBalanceSheet>): FMPBalanceSheet {
  return {
    symbol: "AAPL",
    date: "2024-09-28",
    calendarYear: "2024",
    period: "FY",
    totalAssets: 365000000000,
    totalCurrentAssets: 153000000000,
    totalCurrentLiabilities: 176000000000,
    totalStockholdersEquity: 57000000000,
    inventory: 7300000000,
    netReceivables: 66000000000,
    accountPayables: 69000000000,
    propertyPlantEquipmentNet: 46000000000,
    ...overrides,
  };
}

function createMockCashFlowStatement(
  overrides?: Partial<FMPCashFlowStatement>
): FMPCashFlowStatement {
  return {
    symbol: "AAPL",
    date: "2024-09-28",
    calendarYear: "2024",
    period: "FY",
    operatingCashFlow: 118000000000,
    netIncome: 94000000000,
    depreciationAndAmortization: 11000000000,
    capitalExpenditure: -9400000000,
    ...overrides,
  };
}

function createMockProfile(overrides?: Partial<FMPCompanyProfile>): FMPCompanyProfile {
  return {
    symbol: "AAPL",
    companyName: "Apple Inc.",
    sector: "Technology",
    industry: "Consumer Electronics",
    mktCap: 3500000000000,
    price: 230,
    ...overrides,
  };
}

// ============================================
// Calculation Function Tests
// ============================================

describe("Calculation Functions", () => {
  describe("calculateGrossProfitability", () => {
    it("calculates gross profitability correctly", () => {
      const income = createMockIncomeStatement({
        revenue: 100000,
        costOfRevenue: 60000,
      });
      const balance = createMockBalanceSheet({
        totalAssets: 200000,
      });

      const result = calculateGrossProfitability(income, balance);

      // (100000 - 60000) / 200000 = 0.2
      expect(result).toBeCloseTo(0.2, 5);
    });

    it("returns null when totalAssets is zero", () => {
      const income = createMockIncomeStatement();
      const balance = createMockBalanceSheet({ totalAssets: 0 });

      const result = calculateGrossProfitability(income, balance);

      expect(result).toBeNull();
    });

    it("handles high profitability companies", () => {
      const income = createMockIncomeStatement({
        revenue: 1000000,
        costOfRevenue: 200000, // 80% gross margin
      });
      const balance = createMockBalanceSheet({
        totalAssets: 500000,
      });

      const result = calculateGrossProfitability(income, balance);

      // (1000000 - 200000) / 500000 = 1.6
      expect(result).toBeCloseTo(1.6, 5);
    });
  });

  describe("calculateAssetGrowth", () => {
    it("calculates positive asset growth", () => {
      const current = createMockBalanceSheet({ totalAssets: 120000 });
      const prior = createMockBalanceSheet({ totalAssets: 100000 });

      const result = calculateAssetGrowth(current, prior);

      // (120000 - 100000) / 100000 = 0.2
      expect(result).toBeCloseTo(0.2, 5);
    });

    it("calculates negative asset growth", () => {
      const current = createMockBalanceSheet({ totalAssets: 80000 });
      const prior = createMockBalanceSheet({ totalAssets: 100000 });

      const result = calculateAssetGrowth(current, prior);

      // (80000 - 100000) / 100000 = -0.2
      expect(result).toBeCloseTo(-0.2, 5);
    });

    it("returns null when prior totalAssets is zero", () => {
      const current = createMockBalanceSheet({ totalAssets: 100000 });
      const prior = createMockBalanceSheet({ totalAssets: 0 });

      const result = calculateAssetGrowth(current, prior);

      expect(result).toBeNull();
    });
  });

  describe("calculateAccrualsRatio", () => {
    it("calculates positive accruals (low quality earnings)", () => {
      const income = createMockIncomeStatement({ netIncome: 100000 });
      const cashflow = createMockCashFlowStatement({ operatingCashFlow: 60000 });
      const balance = createMockBalanceSheet({ totalAssets: 500000 });

      const result = calculateAccrualsRatio(income, cashflow, balance);

      // (100000 - 60000) / 500000 = 0.08
      expect(result).toBeCloseTo(0.08, 5);
    });

    it("calculates negative accruals (high quality earnings)", () => {
      const income = createMockIncomeStatement({ netIncome: 100000 });
      const cashflow = createMockCashFlowStatement({ operatingCashFlow: 150000 });
      const balance = createMockBalanceSheet({ totalAssets: 500000 });

      const result = calculateAccrualsRatio(income, cashflow, balance);

      // (100000 - 150000) / 500000 = -0.1
      expect(result).toBeCloseTo(-0.1, 5);
    });

    it("returns null when totalAssets is zero", () => {
      const income = createMockIncomeStatement();
      const cashflow = createMockCashFlowStatement();
      const balance = createMockBalanceSheet({ totalAssets: 0 });

      const result = calculateAccrualsRatio(income, cashflow, balance);

      expect(result).toBeNull();
    });
  });

  describe("calculateCashFlowQuality", () => {
    it("calculates cash flow quality > 1 (high quality)", () => {
      const income = createMockIncomeStatement({ netIncome: 100000 });
      const cashflow = createMockCashFlowStatement({ operatingCashFlow: 120000 });

      const result = calculateCashFlowQuality(income, cashflow);

      // 120000 / 100000 = 1.2
      expect(result).toBeCloseTo(1.2, 5);
    });

    it("calculates cash flow quality < 1 (low quality)", () => {
      const income = createMockIncomeStatement({ netIncome: 100000 });
      const cashflow = createMockCashFlowStatement({ operatingCashFlow: 80000 });

      const result = calculateCashFlowQuality(income, cashflow);

      // 80000 / 100000 = 0.8
      expect(result).toBeCloseTo(0.8, 5);
    });

    it("returns null when netIncome is zero", () => {
      const income = createMockIncomeStatement({ netIncome: 0 });
      const cashflow = createMockCashFlowStatement();

      const result = calculateCashFlowQuality(income, cashflow);

      expect(result).toBeNull();
    });
  });

  describe("calculateBeneishMScore", () => {
    it("calculates M-Score for normal company", () => {
      const currentIncome = createMockIncomeStatement();
      const priorIncome = createMockIncomeStatement({
        date: "2023-09-30",
        calendarYear: "2023",
        revenue: 380000000000,
        costOfRevenue: 210000000000,
        grossProfit: 170000000000,
        netIncome: 90000000000,
        operatingIncome: 115000000000,
      });
      const currentBalance = createMockBalanceSheet();
      const priorBalance = createMockBalanceSheet({
        date: "2023-09-30",
        totalAssets: 350000000000,
        totalCurrentAssets: 148000000000,
        propertyPlantEquipmentNet: 44000000000,
        netReceivables: 62000000000,
        totalStockholdersEquity: 55000000000,
      });
      const currentCashflow = createMockCashFlowStatement();

      const result = calculateBeneishMScore(
        currentIncome,
        priorIncome,
        currentBalance,
        priorBalance,
        currentCashflow
      );

      expect(result).not.toBeNull();
      // Apple-like company should have M-Score < -2.22 (no manipulation)
      expect(result!).toBeLessThan(-1.5);
    });

    it("returns null when prior data is missing", () => {
      const currentIncome = createMockIncomeStatement();
      const currentBalance = createMockBalanceSheet();
      const currentCashflow = createMockCashFlowStatement();

      const result = calculateBeneishMScore(
        currentIncome,
        null as unknown as FMPIncomeStatement,
        currentBalance,
        null as unknown as FMPBalanceSheet,
        currentCashflow
      );

      expect(result).toBeNull();
    });
  });
});

// ============================================
// FundamentalsBatchJob Tests
// ============================================

describe("FundamentalsBatchJob", () => {
  let mockFMPClient: FundamentalsFMPClient;
  let mockRepo: FundamentalsRepository;
  let upsertCalls: CreateFundamentalIndicatorsInput[];

  beforeEach(() => {
    upsertCalls = [];

    mockFMPClient = {
      getKeyMetrics: mock(async () => [createMockKeyMetrics()]),
      getIncomeStatement: mock(async () => [
        createMockIncomeStatement(),
        createMockIncomeStatement({ date: "2023-09-30", calendarYear: "2023" }),
      ]),
      getBalanceSheet: mock(async () => [
        createMockBalanceSheet(),
        createMockBalanceSheet({
          date: "2023-09-30",
          calendarYear: "2023",
          totalAssets: 350000000000,
        }),
      ]),
      getCashFlowStatement: mock(async () => [createMockCashFlowStatement()]),
      getCompanyProfile: mock(async () => createMockProfile()),
    };

    mockRepo = {
      upsert: mock(async (input: CreateFundamentalIndicatorsInput) => {
        upsertCalls.push(input);
        return { ...input, computedAt: new Date().toISOString() };
      }),
    } as unknown as FundamentalsRepository;
  });

  afterEach(() => {
    mock.restore();
  });

  describe("run", () => {
    it("processes all symbols successfully", async () => {
      const job = new FundamentalsBatchJob(mockFMPClient, mockRepo, {
        rateLimitDelayMs: 0, // Disable rate limiting for tests
      });

      const result = await job.run(["AAPL", "MSFT", "GOOGL"]);

      expect(result.processed).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(upsertCalls).toHaveLength(3);
    });

    it("handles partial failures gracefully", async () => {
      let callCount = 0;
      mockFMPClient.getKeyMetrics = mock(async () => {
        callCount++;
        if (callCount === 2) {
          throw new Error("API error");
        }
        return [createMockKeyMetrics()];
      });

      const job = new FundamentalsBatchJob(mockFMPClient, mockRepo, {
        rateLimitDelayMs: 0,
        maxRetries: 0, // No retries for faster tests
      });

      const result = await job.run(["AAPL", "MSFT", "GOOGL"]);

      expect(result.processed).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.symbol).toBe("MSFT");
    });

    it("throws on failure when continueOnError is false", async () => {
      mockFMPClient.getKeyMetrics = mock(async () => {
        throw new Error("API error");
      });

      const job = new FundamentalsBatchJob(mockFMPClient, mockRepo, {
        rateLimitDelayMs: 0,
        maxRetries: 0,
        continueOnError: false,
      });

      await expect(job.run(["AAPL"])).rejects.toThrow("API error");
    });

    it("retries failed requests", async () => {
      let callCount = 0;
      mockFMPClient.getKeyMetrics = mock(async () => {
        callCount++;
        if (callCount < 3) {
          throw new Error("Temporary error");
        }
        return [createMockKeyMetrics()];
      });

      const job = new FundamentalsBatchJob(mockFMPClient, mockRepo, {
        rateLimitDelayMs: 0,
        maxRetries: 2,
        retryDelayMs: 10, // Fast retries for tests
      });

      const result = await job.run(["AAPL"]);

      expect(result.processed).toBe(1);
      expect(result.failed).toBe(0);
      expect(callCount).toBe(3); // Initial + 2 retries
    });

    it("tracks duration", async () => {
      const job = new FundamentalsBatchJob(mockFMPClient, mockRepo, {
        rateLimitDelayMs: 0,
      });

      const result = await job.run(["AAPL"]);

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("data storage", () => {
    it("stores calculated quality factors", async () => {
      const job = new FundamentalsBatchJob(mockFMPClient, mockRepo, {
        rateLimitDelayMs: 0,
      });

      await job.run(["AAPL"]);

      expect(upsertCalls).toHaveLength(1);
      const stored = upsertCalls[0]!;

      // Value factors from key metrics
      expect(stored.peRatioTtm).toBe(28.5);
      expect(stored.pbRatio).toBe(45.2);
      expect(stored.evEbitda).toBe(22.3);
      expect(stored.roe).toBe(1.65);
      expect(stored.roa).toBe(0.26);

      // Calculated quality factors
      expect(stored.grossProfitability).not.toBeNull();
      expect(stored.assetGrowth).not.toBeNull();
      expect(stored.accrualsRatio).not.toBeNull();
      expect(stored.cashFlowQuality).not.toBeNull();

      // Market context from profile
      expect(stored.sector).toBe("Technology");
      expect(stored.industry).toBe("Consumer Electronics");
      expect(stored.marketCap).toBe(3500000000000);

      // Source
      expect(stored.source).toBe("FMP");
    });

    it("handles missing profile gracefully", async () => {
      mockFMPClient.getCompanyProfile = mock(async () => null);

      const job = new FundamentalsBatchJob(mockFMPClient, mockRepo, {
        rateLimitDelayMs: 0,
      });

      await job.run(["AAPL"]);

      const stored = upsertCalls[0]!;
      expect(stored.sector).toBeNull();
      expect(stored.industry).toBeNull();
      expect(stored.marketCap).toBe(3500000000000); // Falls back to key metrics
    });

    it("handles missing cash flow data gracefully", async () => {
      mockFMPClient.getCashFlowStatement = mock(async () => []);

      const job = new FundamentalsBatchJob(mockFMPClient, mockRepo, {
        rateLimitDelayMs: 0,
      });

      await job.run(["AAPL"]);

      const stored = upsertCalls[0]!;
      // These require cash flow data
      expect(stored.accrualsRatio).toBeNull();
      expect(stored.cashFlowQuality).toBeNull();
      expect(stored.beneishMScore).toBeNull();
    });

    it("handles missing prior period data gracefully", async () => {
      mockFMPClient.getIncomeStatement = mock(async () => [createMockIncomeStatement()]);
      mockFMPClient.getBalanceSheet = mock(async () => [createMockBalanceSheet()]);

      const job = new FundamentalsBatchJob(mockFMPClient, mockRepo, {
        rateLimitDelayMs: 0,
      });

      await job.run(["AAPL"]);

      const stored = upsertCalls[0]!;
      // These require prior period
      expect(stored.assetGrowth).toBeNull();
      expect(stored.beneishMScore).toBeNull();
    });

    it("throws when insufficient data", async () => {
      mockFMPClient.getKeyMetrics = mock(async () => []);

      const job = new FundamentalsBatchJob(mockFMPClient, mockRepo, {
        rateLimitDelayMs: 0,
        maxRetries: 0,
      });

      const result = await job.run(["AAPL"]);

      expect(result.failed).toBe(1);
      expect(result.errors[0]?.error).toContain("Insufficient data");
    });
  });

  describe("configuration", () => {
    it("uses default configuration", () => {
      const job = new FundamentalsBatchJob(mockFMPClient, mockRepo);

      // Access private config via run behavior
      // The job should work with defaults
      expect(job).toBeDefined();
    });

    it("respects custom rate limit delay", async () => {
      const startTime = Date.now();

      const job = new FundamentalsBatchJob(mockFMPClient, mockRepo, {
        rateLimitDelayMs: 50,
      });

      await job.run(["AAPL", "MSFT"]);

      const elapsed = Date.now() - startTime;
      // Should have at least one delay between symbols
      expect(elapsed).toBeGreaterThanOrEqual(40); // Allow some tolerance
    });
  });
});
