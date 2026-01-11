/**
 * Short Interest Batch Job Tests
 *
 * Tests for FINRA short interest data fetching and processing.
 */

import { beforeEach, describe, expect, it, mock } from "bun:test";
import type {
  CreateShortInterestInput,
  ShortInterestIndicators,
  ShortInterestRepository,
} from "@cream/storage";
import {
  calculateShortInterestMomentum,
  calculateShortInterestRatio,
  calculateShortPctFloat,
  type FINRAClient,
  type FINRAShortInterestRecord,
  type SharesOutstandingProvider,
  ShortInterestBatchJob,
} from "./short-interest-batch.js";

// ============================================
// Test Helpers
// ============================================

function createMockFINRARecord(
  overrides: Partial<FINRAShortInterestRecord> = {}
): FINRAShortInterestRecord {
  return {
    symbolCode: "AAPL",
    issueName: "Apple Inc",
    marketClassCode: "NMS",
    settlementDate: "2024-01-15",
    currentShortPositionQuantity: 100000,
    previousShortPositionQuantity: 90000,
    changePreviousNumber: 10000,
    changePercent: 11.11,
    averageDailyVolumeQuantity: 50000,
    daysToCoverQuantity: 2.0,
    stockSplitFlag: null,
    revisionFlag: null,
    ...overrides,
  };
}

function createMockFINRAClient(records: FINRAShortInterestRecord[] = []): FINRAClient {
  return {
    queryShortInterest: mock(() => Promise.resolve(records)),
    getShortInterestBySymbols: mock(() => Promise.resolve(records)),
    getLatestSettlementDate: mock(() => Promise.resolve("2024-01-15")),
  };
}

function createMockSharesProvider(
  data: Map<string, { sharesOutstanding: number; floatShares: number | null }> = new Map()
): SharesOutstandingProvider {
  return {
    getSharesData: mock((symbol: string) => Promise.resolve(data.get(symbol) ?? null)),
  };
}

// Mock repository type for testing - extends ShortInterestRepository with tracking
type MockShortInterestRepository = ShortInterestRepository & {
  upsertCalls: CreateShortInterestInput[];
};

function createMockRepository(): MockShortInterestRepository {
  const upsertCalls: CreateShortInterestInput[] = [];
  const mockRepo = {
    upsertCalls,
    upsert: mock((input: CreateShortInterestInput) => {
      upsertCalls.push(input);
      // Return a mock ShortInterestIndicators that matches the input
      return Promise.resolve({
        id: input.id,
        symbol: input.symbol,
        settlementDate: input.settlementDate,
        shortInterest: input.shortInterest,
        shortInterestRatio: input.shortInterestRatio ?? null,
        shortPctFloat: input.shortPctFloat ?? null,
        daysToCover: input.daysToCover ?? null,
        shortInterestChange: input.shortInterestChange ?? null,
        source: input.source ?? "FINRA",
        fetchedAt: new Date().toISOString(),
      });
    }),
    findBySymbol: mock(() => Promise.resolve([])),
    findBySymbolAndDate: mock(() => Promise.resolve(null)),
    findLatestBySymbol: mock(() => Promise.resolve(null)),
    // Unused methods - provide minimal mocks
    create: mock(() => Promise.resolve({} as ShortInterestIndicators)),
    bulkUpsert: mock(() => Promise.resolve(0)),
    findById: mock(() => Promise.resolve(null)),
    update: mock(() => Promise.resolve(null)),
    delete: mock(() => Promise.resolve(false)),
    deleteOlderThan: mock(() => Promise.resolve(0)),
    findAll: mock(() => Promise.resolve([])),
    count: mock(() => Promise.resolve(0)),
    findWithFilters: mock(() =>
      Promise.resolve({
        data: [],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
      })
    ),
  };
  // Cast to ShortInterestRepository to bypass private client property check
  return mockRepo as unknown as MockShortInterestRepository;
}

// ============================================
// Calculation Function Tests
// ============================================

describe("calculateShortPctFloat", () => {
  it("calculates short % of float correctly", () => {
    // 100,000 short / 1,000,000 float = 10%
    const result = calculateShortPctFloat(100000, 1000000);
    expect(result).toBe(0.1);
  });

  it("returns null when float shares is null", () => {
    const result = calculateShortPctFloat(100000, null);
    expect(result).toBeNull();
  });

  it("returns null when float shares is zero", () => {
    const result = calculateShortPctFloat(100000, 0);
    expect(result).toBeNull();
  });

  it("returns null when float shares is negative", () => {
    const result = calculateShortPctFloat(100000, -1000);
    expect(result).toBeNull();
  });

  it("handles small short interest values", () => {
    // 1,000 short / 10,000,000 float = 0.01%
    const result = calculateShortPctFloat(1000, 10000000);
    expect(result).toBeCloseTo(0.0001, 6);
  });

  it("handles high short interest (>100% of float)", () => {
    // This can happen due to lending chains
    // 1,500,000 short / 1,000,000 float = 150%
    const result = calculateShortPctFloat(1500000, 1000000);
    expect(result).toBe(1.5);
  });
});

describe("calculateShortInterestRatio", () => {
  it("calculates short interest ratio (days to cover) correctly", () => {
    // 100,000 short / 50,000 avg volume = 2 days
    const result = calculateShortInterestRatio(100000, 50000);
    expect(result).toBe(2);
  });

  it("returns null when avg daily volume is null", () => {
    const result = calculateShortInterestRatio(100000, null);
    expect(result).toBeNull();
  });

  it("returns null when avg daily volume is zero", () => {
    const result = calculateShortInterestRatio(100000, 0);
    expect(result).toBeNull();
  });

  it("returns null when avg daily volume is negative", () => {
    const result = calculateShortInterestRatio(100000, -1000);
    expect(result).toBeNull();
  });

  it("handles low liquidity stocks", () => {
    // 100,000 short / 1,000 avg volume = 100 days
    const result = calculateShortInterestRatio(100000, 1000);
    expect(result).toBe(100);
  });
});

describe("calculateShortInterestMomentum", () => {
  it("calculates positive momentum correctly", () => {
    // 110,000 current vs 100,000 previous = +10%
    const result = calculateShortInterestMomentum(110000, 100000);
    expect(result).toBe(0.1);
  });

  it("calculates negative momentum correctly", () => {
    // 90,000 current vs 100,000 previous = -10%
    const result = calculateShortInterestMomentum(90000, 100000);
    expect(result).toBe(-0.1);
  });

  it("returns null when previous is null", () => {
    const result = calculateShortInterestMomentum(100000, null);
    expect(result).toBeNull();
  });

  it("returns null when previous is zero", () => {
    const result = calculateShortInterestMomentum(100000, 0);
    expect(result).toBeNull();
  });

  it("returns null when previous is negative", () => {
    const result = calculateShortInterestMomentum(100000, -1000);
    expect(result).toBeNull();
  });

  it("handles no change", () => {
    const result = calculateShortInterestMomentum(100000, 100000);
    expect(result).toBe(0);
  });

  it("handles large increases", () => {
    // 300,000 current vs 100,000 previous = +200%
    const result = calculateShortInterestMomentum(300000, 100000);
    expect(result).toBe(2);
  });
});

// ============================================
// ShortInterestBatchJob Tests
// ============================================

describe("ShortInterestBatchJob", () => {
  let mockFinra: FINRAClient;
  let mockRepo: ReturnType<typeof createMockRepository>;
  let mockSharesProvider: SharesOutstandingProvider;

  beforeEach(() => {
    mockFinra = createMockFINRAClient();
    mockRepo = createMockRepository();
    mockSharesProvider = createMockSharesProvider();
  });

  describe("run", () => {
    it("processes symbols and stores short interest data", async () => {
      const records = [
        createMockFINRARecord({ symbolCode: "AAPL" }),
        createMockFINRARecord({ symbolCode: "MSFT", currentShortPositionQuantity: 200000 }),
      ];
      mockFinra = createMockFINRAClient(records);

      const job = new ShortInterestBatchJob(mockFinra, mockRepo);
      const result = await job.run(["AAPL", "MSFT"]);

      expect(result.processed).toBe(2);
      expect(result.failed).toBe(0);
      expect(mockRepo.upsertCalls).toHaveLength(2);
    });

    it("uses provided settlement date", async () => {
      const records = [createMockFINRARecord()];
      mockFinra = createMockFINRAClient(records);

      const job = new ShortInterestBatchJob(mockFinra, mockRepo);
      await job.run(["AAPL"], "2024-02-01");

      expect(mockFinra.getShortInterestBySymbols).toHaveBeenCalledWith(["AAPL"], "2024-02-01");
    });

    it("fetches latest settlement date when not provided", async () => {
      const records = [createMockFINRARecord()];
      mockFinra = createMockFINRAClient(records);

      const job = new ShortInterestBatchJob(mockFinra, mockRepo);
      await job.run(["AAPL"]);

      expect(mockFinra.getLatestSettlementDate).toHaveBeenCalled();
    });

    it("skips symbols without FINRA data", async () => {
      // FINRA only returns data for AAPL, not XYZ
      const records = [createMockFINRARecord({ symbolCode: "AAPL" })];
      mockFinra = createMockFINRAClient(records);

      const job = new ShortInterestBatchJob(mockFinra, mockRepo);
      const result = await job.run(["AAPL", "XYZ"]);

      expect(result.processed).toBe(1);
      expect(result.failed).toBe(0);
      expect(mockRepo.upsertCalls).toHaveLength(1);
    });

    it("calculates short % of float when shares provider is available", async () => {
      const records = [createMockFINRARecord({ currentShortPositionQuantity: 100000 })];
      mockFinra = createMockFINRAClient(records);

      const sharesData = new Map([["AAPL", { sharesOutstanding: 10000000, floatShares: 8000000 }]]);
      mockSharesProvider = createMockSharesProvider(sharesData);

      const job = new ShortInterestBatchJob(mockFinra, mockRepo, mockSharesProvider);
      await job.run(["AAPL"]);

      expect(mockRepo.upsertCalls).toHaveLength(1);
      const upserted = mockRepo.upsertCalls[0];
      // 100,000 / 8,000,000 = 0.0125 (1.25%)
      expect(upserted?.shortPctFloat).toBeCloseTo(0.0125, 6);
    });

    it("handles missing float shares data", async () => {
      const records = [createMockFINRARecord()];
      mockFinra = createMockFINRAClient(records);

      // Provider returns data but no float shares
      const sharesData = new Map([["AAPL", { sharesOutstanding: 10000000, floatShares: null }]]);
      mockSharesProvider = createMockSharesProvider(sharesData);

      const job = new ShortInterestBatchJob(mockFinra, mockRepo, mockSharesProvider);
      await job.run(["AAPL"]);

      const upserted = mockRepo.upsertCalls[0];
      expect(upserted?.shortPctFloat).toBeNull();
    });

    it("calculates short interest ratio", async () => {
      const records = [
        createMockFINRARecord({
          currentShortPositionQuantity: 100000,
          averageDailyVolumeQuantity: 25000,
        }),
      ];
      mockFinra = createMockFINRAClient(records);

      const job = new ShortInterestBatchJob(mockFinra, mockRepo);
      await job.run(["AAPL"]);

      const upserted = mockRepo.upsertCalls[0];
      // 100,000 / 25,000 = 4 days
      expect(upserted?.shortInterestRatio).toBe(4);
    });

    it("calculates short interest change (momentum)", async () => {
      const records = [
        createMockFINRARecord({
          currentShortPositionQuantity: 120000,
          previousShortPositionQuantity: 100000,
        }),
      ];
      mockFinra = createMockFINRAClient(records);

      const job = new ShortInterestBatchJob(mockFinra, mockRepo);
      await job.run(["AAPL"]);

      const upserted = mockRepo.upsertCalls[0];
      // (120,000 - 100,000) / 100,000 = 0.2 (20%)
      expect(upserted?.shortInterestChange).toBe(0.2);
    });

    it("stores FINRA days to cover value", async () => {
      const records = [createMockFINRARecord({ daysToCoverQuantity: 3.5 })];
      mockFinra = createMockFINRAClient(records);

      const job = new ShortInterestBatchJob(mockFinra, mockRepo);
      await job.run(["AAPL"]);

      const upserted = mockRepo.upsertCalls[0];
      expect(upserted?.daysToCover).toBe(3.5);
    });

    it("sets source to FINRA", async () => {
      const records = [createMockFINRARecord()];
      mockFinra = createMockFINRAClient(records);

      const job = new ShortInterestBatchJob(mockFinra, mockRepo);
      await job.run(["AAPL"]);

      const upserted = mockRepo.upsertCalls[0];
      expect(upserted?.source).toBe("FINRA");
    });

    it("normalizes symbol to uppercase", async () => {
      const records = [createMockFINRARecord({ symbolCode: "aapl" })];
      mockFinra = createMockFINRAClient(records);

      const job = new ShortInterestBatchJob(mockFinra, mockRepo);
      await job.run(["aapl"]);

      const upserted = mockRepo.upsertCalls[0];
      expect(upserted?.symbol).toBe("AAPL");
    });

    it("generates unique IDs for each record", async () => {
      const records = [
        createMockFINRARecord({ symbolCode: "AAPL" }),
        createMockFINRARecord({ symbolCode: "MSFT" }),
      ];
      mockFinra = createMockFINRAClient(records);

      const job = new ShortInterestBatchJob(mockFinra, mockRepo);
      await job.run(["AAPL", "MSFT"]);

      const ids = mockRepo.upsertCalls.map((c: CreateShortInterestInput) => c.id);
      expect(ids[0]).toMatch(/^si_/);
      expect(ids[1]).toMatch(/^si_/);
      expect(ids[0]).not.toBe(ids[1]);
    });
  });

  describe("batching", () => {
    it("processes symbols in batches", async () => {
      // Create 250 symbols to test batching (default batch size is 100)
      const symbols = Array.from({ length: 250 }, (_, i) => `SYM${i}`);
      const records = symbols.map((s) => createMockFINRARecord({ symbolCode: s }));
      mockFinra = createMockFINRAClient(records);

      const job = new ShortInterestBatchJob(mockFinra, mockRepo);
      const result = await job.run(symbols);

      // Should have made 3 API calls (100 + 100 + 50)
      expect(mockFinra.getShortInterestBySymbols).toHaveBeenCalledTimes(3);
      expect(result.processed).toBe(250);
    });

    it("respects custom batch size", async () => {
      const symbols = Array.from({ length: 100 }, (_, i) => `SYM${i}`);
      const records = symbols.map((s) => createMockFINRARecord({ symbolCode: s }));
      mockFinra = createMockFINRAClient(records);

      const job = new ShortInterestBatchJob(mockFinra, mockRepo, undefined, {
        batchSize: 25,
      });
      const result = await job.run(symbols);

      // Should have made 4 API calls (25 + 25 + 25 + 25)
      expect(mockFinra.getShortInterestBySymbols).toHaveBeenCalledTimes(4);
      expect(result.processed).toBe(100);
    });
  });

  describe("error handling", () => {
    it("continues on individual symbol errors when configured", async () => {
      const records = [
        createMockFINRARecord({ symbolCode: "AAPL" }),
        createMockFINRARecord({ symbolCode: "MSFT" }),
      ];
      mockFinra = createMockFINRAClient(records);

      // Make upsert fail for AAPL
      let callCount = 0;
      mockRepo.upsert = mock(async (): Promise<ShortInterestIndicators> => {
        callCount++;
        if (callCount === 1) {
          throw new Error("Database error");
        }
        // Return a mock result for successful calls
        return {
          id: `si_${callCount}`,
          symbol: "MSFT",
          settlementDate: "2024-01-15",
          shortInterest: 1000000,
          shortInterestRatio: 2.5,
          shortPctFloat: 0.05,
          daysToCover: 3,
          shortInterestChange: null,
          source: "FINRA",
          fetchedAt: new Date().toISOString(),
        };
      });

      const job = new ShortInterestBatchJob(mockFinra, mockRepo, undefined, {
        continueOnError: true,
      });
      const result = await job.run(["AAPL", "MSFT"]);

      expect(result.processed).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.symbol).toBe("AAPL");
      expect(result.errors[0]?.error).toContain("Database error");
    });

    it("stops on error when continueOnError is false", async () => {
      const records = [
        createMockFINRARecord({ symbolCode: "AAPL" }),
        createMockFINRARecord({ symbolCode: "MSFT" }),
      ];
      mockFinra = createMockFINRAClient(records);

      mockRepo.upsert = mock(async () => {
        throw new Error("Database error");
      });

      const job = new ShortInterestBatchJob(mockFinra, mockRepo, undefined, {
        continueOnError: false,
      });

      await expect(job.run(["AAPL", "MSFT"])).rejects.toThrow("Database error");
    });

    it("handles batch-level FINRA API failures", async () => {
      mockFinra.getShortInterestBySymbols = mock(async () => {
        throw new Error("FINRA API unavailable");
      });

      const job = new ShortInterestBatchJob(mockFinra, mockRepo, undefined, {
        maxRetries: 0,
        continueOnError: true,
      });
      const result = await job.run(["AAPL", "MSFT"]);

      expect(result.processed).toBe(0);
      expect(result.failed).toBe(2);
      expect(result.errors).toHaveLength(2);
    });

    it("throws batch-level errors when continueOnError is false", async () => {
      mockFinra.getShortInterestBySymbols = mock(async () => {
        throw new Error("FINRA API unavailable");
      });

      const job = new ShortInterestBatchJob(mockFinra, mockRepo, undefined, {
        maxRetries: 0,
        continueOnError: false,
      });

      await expect(job.run(["AAPL"])).rejects.toThrow("FINRA API unavailable");
    });
  });

  describe("retry logic", () => {
    it("retries failed API calls", async () => {
      let attempts = 0;
      mockFinra.getShortInterestBySymbols = mock(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error("Temporary failure");
        }
        return [createMockFINRARecord()];
      });

      const job = new ShortInterestBatchJob(mockFinra, mockRepo, undefined, {
        maxRetries: 3,
        retryDelayMs: 10, // Fast for testing
      });
      const result = await job.run(["AAPL"]);

      expect(attempts).toBe(3);
      expect(result.processed).toBe(1);
    });

    it("gives up after max retries", async () => {
      mockFinra.getShortInterestBySymbols = mock(async () => {
        throw new Error("Persistent failure");
      });

      const job = new ShortInterestBatchJob(mockFinra, mockRepo, undefined, {
        maxRetries: 2,
        retryDelayMs: 10,
        continueOnError: true,
      });
      const result = await job.run(["AAPL"]);

      // Initial attempt + 2 retries = 3 calls
      expect(mockFinra.getShortInterestBySymbols).toHaveBeenCalledTimes(3);
      expect(result.failed).toBe(1);
    });

    it("retries getLatestSettlementDate on failure", async () => {
      let attempts = 0;
      mockFinra.getLatestSettlementDate = mock(async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error("Temporary failure");
        }
        return "2024-01-15";
      });
      mockFinra.getShortInterestBySymbols = mock(async () => [createMockFINRARecord()]);

      const job = new ShortInterestBatchJob(mockFinra, mockRepo, undefined, {
        maxRetries: 3,
        retryDelayMs: 10,
      });
      await job.run(["AAPL"]);

      expect(attempts).toBe(2);
    });
  });

  describe("result metadata", () => {
    it("returns execution time in milliseconds", async () => {
      const records = [createMockFINRARecord()];
      mockFinra = createMockFINRAClient(records);

      const job = new ShortInterestBatchJob(mockFinra, mockRepo);
      const result = await job.run(["AAPL"]);

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.durationMs).toBe("number");
    });

    it("returns error details for failed symbols", async () => {
      const records = [createMockFINRARecord()];
      mockFinra = createMockFINRAClient(records);

      mockRepo.upsert = mock(async () => {
        throw new Error("Constraint violation");
      });

      const job = new ShortInterestBatchJob(mockFinra, mockRepo, undefined, {
        continueOnError: true,
      });
      const result = await job.run(["AAPL"]);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        symbol: "AAPL",
        error: "Constraint violation",
      });
    });
  });

  describe("edge cases", () => {
    it("handles empty symbol list", async () => {
      const job = new ShortInterestBatchJob(mockFinra, mockRepo);
      const result = await job.run([]);

      expect(result.processed).toBe(0);
      expect(result.failed).toBe(0);
      expect(mockFinra.getShortInterestBySymbols).not.toHaveBeenCalled();
    });

    it("handles null values in FINRA response", async () => {
      const records = [
        createMockFINRARecord({
          previousShortPositionQuantity: null,
          averageDailyVolumeQuantity: null,
          daysToCoverQuantity: null,
        }),
      ];
      mockFinra = createMockFINRAClient(records);

      const job = new ShortInterestBatchJob(mockFinra, mockRepo);
      await job.run(["AAPL"]);

      const upserted = mockRepo.upsertCalls[0];
      expect(upserted?.shortInterestRatio).toBeNull();
      expect(upserted?.shortInterestChange).toBeNull();
      expect(upserted?.daysToCover).toBeNull();
    });

    it("handles duplicate symbols in input", async () => {
      const records = [createMockFINRARecord()];
      mockFinra = createMockFINRAClient(records);

      const job = new ShortInterestBatchJob(mockFinra, mockRepo);
      // Note: The batch job doesn't dedupe - it processes what it receives
      // This tests that multiple upserts for same symbol work
      await job.run(["AAPL", "AAPL"]);

      // Both should be processed (upsert handles duplicates)
      expect(mockRepo.upsertCalls).toHaveLength(2);
    });

    it("handles very large short interest values", async () => {
      const records = [
        createMockFINRARecord({
          currentShortPositionQuantity: 999999999999,
          previousShortPositionQuantity: 888888888888,
          averageDailyVolumeQuantity: 100000000,
        }),
      ];
      mockFinra = createMockFINRAClient(records);

      const job = new ShortInterestBatchJob(mockFinra, mockRepo);
      await job.run(["AAPL"]);

      const upserted = mockRepo.upsertCalls[0];
      expect(upserted?.shortInterest).toBe(999999999999);
      expect(upserted?.shortInterestRatio).toBe(9999.99999999);
    });
  });
});
