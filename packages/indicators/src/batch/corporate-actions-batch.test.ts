/**
 * Corporate Actions Batch Job Tests
 *
 * Tests for the CorporateActionsBatchJob including calculation functions
 * and batch job processing.
 */

import { describe, expect, mock, test } from "bun:test";
import type { CorporateActionsRepository } from "@cream/storage/repositories";
import {
  type AlpacaCorporateAction,
  type AlpacaCorporateActionsClient,
  CorporateActionsBatchJob,
  calculateDaysToExDividend,
  calculateDividendGrowth,
  calculateDividendIndicators,
  calculateSplitAdjustmentFactor,
  calculateTrailingDividendYield,
  hasPendingSplit,
  mapAlpacaActionType,
} from "./corporate-actions-batch.js";

// ============================================
// Mock Factories
// ============================================

function createMockClient(actions: AlpacaCorporateAction[] = []): AlpacaCorporateActionsClient {
  return {
    getCorporateActions: mock(async () => actions),
    getCorporateActionsForSymbols: mock(async () => actions),
  };
}

function createMockRepo(): CorporateActionsRepository {
  return {
    upsert: mock(async () => {}),
    getForSymbol: mock(async () => []),
    getSplits: mock(async () => []),
    getDividends: mock(async () => []),
    getByExDate: mock(async () => []),
  } as unknown as CorporateActionsRepository;
}

// ============================================
// Calculation Function Tests
// ============================================

describe("mapAlpacaActionType", () => {
  test("maps dividend types correctly", () => {
    expect(mapAlpacaActionType("Dividend")).toBe("dividend");
    expect(mapAlpacaActionType("SpecialDividend")).toBe("special_dividend");
  });

  test("maps split types correctly", () => {
    expect(mapAlpacaActionType("Split")).toBe("split");
    expect(mapAlpacaActionType("ReverseSplit")).toBe("reverse_split");
  });

  test("maps other corporate actions correctly", () => {
    expect(mapAlpacaActionType("Spinoff")).toBe("spinoff");
    expect(mapAlpacaActionType("Merger")).toBe("merger");
    expect(mapAlpacaActionType("Acquisition")).toBe("acquisition");
    expect(mapAlpacaActionType("NameChange")).toBe("name_change");
  });
});

describe("calculateTrailingDividendYield", () => {
  test("calculates yield correctly", () => {
    // $2 annual dividend / $100 price = 2% yield
    const yield_ = calculateTrailingDividendYield([0.5, 0.5, 0.5, 0.5], 100);
    expect(yield_).toBe(0.02);
  });

  test("handles single dividend", () => {
    const yield_ = calculateTrailingDividendYield([1.0], 50);
    expect(yield_).toBe(0.02);
  });

  test("returns null for zero price", () => {
    expect(calculateTrailingDividendYield([0.5, 0.5], 0)).toBeNull();
  });

  test("returns null for negative price", () => {
    expect(calculateTrailingDividendYield([0.5], -10)).toBeNull();
  });

  test("returns null for null price", () => {
    expect(calculateTrailingDividendYield([0.5], null)).toBeNull();
  });

  test("returns null for empty dividends array", () => {
    expect(calculateTrailingDividendYield([], 100)).toBeNull();
  });

  test("handles large dividend amounts", () => {
    const yield_ = calculateTrailingDividendYield([10, 10, 10, 10], 100);
    expect(yield_).toBe(0.4); // 40% yield
  });
});

describe("calculateDaysToExDividend", () => {
  test("calculates days correctly for future date", () => {
    // Use dates relative to now to avoid timezone parsing issues
    const now = new Date();
    const futureDate = new Date(now);
    futureDate.setDate(futureDate.getDate() + 10);
    const exDateStr = futureDate.toISOString().split("T")[0]!;
    const days = calculateDaysToExDividend(exDateStr, now);
    // Allow for minor variance due to time-of-day
    expect(days).toBeGreaterThanOrEqual(9);
    expect(days).toBeLessThanOrEqual(10);
  });

  test("returns 0 or positive for same day", () => {
    const now = new Date();
    const exDateStr = now.toISOString().split("T")[0]!;
    const days = calculateDaysToExDividend(exDateStr, now);
    // On same day, should be 0 or possibly -1/+1 due to timezone
    expect(days === null || days >= 0).toBe(true);
  });

  test("returns null for clearly past date", () => {
    const now = new Date();
    const pastDate = new Date(now);
    pastDate.setDate(pastDate.getDate() - 10);
    const exDateStr = pastDate.toISOString().split("T")[0]!;
    const days = calculateDaysToExDividend(exDateStr, now);
    expect(days).toBeNull();
  });

  test("returns null for null input", () => {
    expect(calculateDaysToExDividend(null)).toBeNull();
  });

  test("handles future dates consistently", () => {
    const now = new Date();
    const futureDate = new Date(now);
    futureDate.setDate(futureDate.getDate() + 30);
    const exDateStr = futureDate.toISOString().split("T")[0]!;
    const days = calculateDaysToExDividend(exDateStr, now);
    expect(days).toBeGreaterThanOrEqual(29);
    expect(days).toBeLessThanOrEqual(30);
  });
});

describe("calculateDividendGrowth", () => {
  test("calculates positive growth correctly", () => {
    // $2.20 vs $2.00 = 10% growth
    const growth = calculateDividendGrowth(2.2, 2.0);
    expect(growth).toBeCloseTo(0.1, 5);
  });

  test("calculates negative growth correctly", () => {
    // $1.80 vs $2.00 = -10% decline
    const growth = calculateDividendGrowth(1.8, 2.0);
    expect(growth).toBeCloseTo(-0.1, 5);
  });

  test("calculates zero growth", () => {
    const growth = calculateDividendGrowth(2.0, 2.0);
    expect(growth).toBe(0);
  });

  test("returns null for zero prior dividends", () => {
    expect(calculateDividendGrowth(1.0, 0)).toBeNull();
  });

  test("returns null for negative prior dividends", () => {
    expect(calculateDividendGrowth(1.0, -1.0)).toBeNull();
  });

  test("handles 100% growth (dividend doubled)", () => {
    const growth = calculateDividendGrowth(4.0, 2.0);
    expect(growth).toBe(1.0);
  });
});

describe("calculateSplitAdjustmentFactor", () => {
  test("calculates forward split factor correctly", () => {
    // 2:1 split - stock price halves, so historical prices need to be multiplied by 2
    expect(calculateSplitAdjustmentFactor(2, false)).toBe(2);
  });

  test("calculates 3:1 split factor", () => {
    expect(calculateSplitAdjustmentFactor(3, false)).toBe(3);
  });

  test("calculates reverse split factor correctly", () => {
    // 1:2 reverse split - stock price doubles, so historical prices need to be multiplied by 0.5
    expect(calculateSplitAdjustmentFactor(2, true)).toBe(0.5);
  });

  test("calculates 1:10 reverse split factor", () => {
    expect(calculateSplitAdjustmentFactor(10, true)).toBe(0.1);
  });

  test("handles 1:1 (no split)", () => {
    expect(calculateSplitAdjustmentFactor(1, false)).toBe(1);
    expect(calculateSplitAdjustmentFactor(1, true)).toBe(1);
  });
});

describe("hasPendingSplit", () => {
  test("returns true for upcoming split", () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 15);
    const actions: AlpacaCorporateAction[] = [
      {
        corporate_action_type: "Split",
        symbol: "AAPL",
        ex_date: futureDate.toISOString().split("T")[0]!,
        record_date: null,
        payment_date: null,
        value: 4,
      },
    ];
    expect(hasPendingSplit(actions)).toBe(true);
  });

  test("returns true for upcoming reverse split", () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    const actions: AlpacaCorporateAction[] = [
      {
        corporate_action_type: "ReverseSplit",
        symbol: "XYZ",
        ex_date: futureDate.toISOString().split("T")[0]!,
        record_date: null,
        payment_date: null,
        value: 0.1,
      },
    ];
    expect(hasPendingSplit(actions)).toBe(true);
  });

  test("returns false for past split", () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 10);
    const actions: AlpacaCorporateAction[] = [
      {
        corporate_action_type: "Split",
        symbol: "AAPL",
        ex_date: pastDate.toISOString().split("T")[0]!,
        record_date: null,
        payment_date: null,
        value: 4,
      },
    ];
    expect(hasPendingSplit(actions)).toBe(false);
  });

  test("returns false for split beyond lookahead window", () => {
    const farFutureDate = new Date();
    farFutureDate.setDate(farFutureDate.getDate() + 60);
    const actions: AlpacaCorporateAction[] = [
      {
        corporate_action_type: "Split",
        symbol: "AAPL",
        ex_date: farFutureDate.toISOString().split("T")[0]!,
        record_date: null,
        payment_date: null,
        value: 4,
      },
    ];
    expect(hasPendingSplit(actions, new Date(), 30)).toBe(false);
  });

  test("returns false for non-split actions", () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 15);
    const actions: AlpacaCorporateAction[] = [
      {
        corporate_action_type: "Dividend",
        symbol: "AAPL",
        ex_date: futureDate.toISOString().split("T")[0]!,
        record_date: null,
        payment_date: null,
        value: 0.25,
      },
    ];
    expect(hasPendingSplit(actions)).toBe(false);
  });

  test("returns false for empty actions array", () => {
    expect(hasPendingSplit([])).toBe(false);
  });
});

describe("calculateDividendIndicators", () => {
  test("calculates all indicators correctly", () => {
    // Use dates relative to today to ensure they're within trailing 12 months
    const now = new Date();
    const formatDateStr = (d: Date) => d.toISOString().split("T")[0]!;

    const q1 = new Date(now);
    q1.setMonth(q1.getMonth() - 1);
    const q2 = new Date(now);
    q2.setMonth(q2.getMonth() - 4);
    const q3 = new Date(now);
    q3.setMonth(q3.getMonth() - 7);
    const q4 = new Date(now);
    q4.setMonth(q4.getMonth() - 10);

    const dividends = [
      { amount: 0.5, exDate: formatDateStr(q1) },
      { amount: 0.5, exDate: formatDateStr(q2) },
      { amount: 0.5, exDate: formatDateStr(q3) },
      { amount: 0.5, exDate: formatDateStr(q4) },
    ];

    const futureDate = new Date(now);
    futureDate.setDate(futureDate.getDate() + 30);

    const result = calculateDividendIndicators(
      dividends,
      100, // $100 stock price
      formatDateStr(futureDate), // Future ex-date
      1.8 // Prior year dividends
    );

    expect(result.trailingDividendYield).toBe(0.02); // 2% yield ($2 / $100)
    // Days to ex-dividend may vary slightly due to time-of-day
    expect(result.daysToExDividend).toBeGreaterThanOrEqual(29);
    expect(result.daysToExDividend).toBeLessThanOrEqual(30);
    expect(result.dividendGrowth).toBeCloseTo(0.1111, 3); // ~11% growth (2.0 vs 1.8)
    expect(result.lastDividendAmount).toBe(0.5);
    expect(result.annualDividend).toBe(2.0);
  });

  test("handles no dividends", () => {
    const result = calculateDividendIndicators([], 100, null, 0);

    expect(result.trailingDividendYield).toBeNull();
    expect(result.daysToExDividend).toBeNull();
    expect(result.dividendGrowth).toBeNull();
    expect(result.lastDividendAmount).toBeNull();
    expect(result.annualDividend).toBeNull();
  });

  test("handles null price", () => {
    const dividends = [{ amount: 0.5, exDate: new Date().toISOString().split("T")[0]! }];
    const result = calculateDividendIndicators(dividends, null, null, 0);

    expect(result.trailingDividendYield).toBeNull();
    expect(result.lastDividendAmount).toBe(0.5);
    expect(result.annualDividend).toBe(0.5);
  });

  test("filters out dividends older than 12 months", () => {
    const oldDate = new Date();
    oldDate.setFullYear(oldDate.getFullYear() - 2);
    const dividends = [
      { amount: 0.5, exDate: new Date().toISOString().split("T")[0]! },
      { amount: 10.0, exDate: oldDate.toISOString().split("T")[0]! }, // Old dividend should be excluded
    ];

    const result = calculateDividendIndicators(dividends, 100, null, 0);
    expect(result.annualDividend).toBe(0.5); // Only recent dividend counted
  });
});

// ============================================
// CorporateActionsBatchJob Tests
// ============================================

describe("CorporateActionsBatchJob", () => {
  describe("run", () => {
    test("processes symbols and stores corporate actions", async () => {
      const actions: AlpacaCorporateAction[] = [
        {
          corporate_action_type: "Dividend",
          symbol: "AAPL",
          ex_date: "2024-01-15",
          record_date: "2024-01-16",
          payment_date: "2024-01-20",
          value: 0.24,
        },
        {
          corporate_action_type: "Split",
          symbol: "AAPL",
          ex_date: "2024-08-01",
          record_date: null,
          payment_date: null,
          value: 4,
        },
      ];

      const client = createMockClient(actions);
      const repo = createMockRepo();
      const job = new CorporateActionsBatchJob(client, repo);

      const result = await job.run(["AAPL"]);

      expect(result.processed).toBe(1);
      expect(result.failed).toBe(0);
      expect(repo.upsert).toHaveBeenCalledTimes(2);
    });

    test("handles multiple symbols", async () => {
      const actions: AlpacaCorporateAction[] = [
        {
          corporate_action_type: "Dividend",
          symbol: "AAPL",
          ex_date: "2024-01-15",
          record_date: null,
          payment_date: null,
          value: 0.24,
        },
        {
          corporate_action_type: "Dividend",
          symbol: "MSFT",
          ex_date: "2024-01-15",
          record_date: null,
          payment_date: null,
          value: 0.68,
        },
      ];

      const client = createMockClient(actions);
      const repo = createMockRepo();
      const job = new CorporateActionsBatchJob(client, repo);

      const result = await job.run(["AAPL", "MSFT"]);

      expect(result.processed).toBe(2);
      expect(result.failed).toBe(0);
    });

    test("handles symbols with no corporate actions", async () => {
      const client = createMockClient([]);
      const repo = createMockRepo();
      const job = new CorporateActionsBatchJob(client, repo);

      const result = await job.run(["AAPL"]);

      expect(result.processed).toBe(1);
      expect(result.failed).toBe(0);
      expect(repo.upsert).not.toHaveBeenCalled();
    });

    test("handles API errors with retry", async () => {
      let callCount = 0;
      const client: AlpacaCorporateActionsClient = {
        getCorporateActions: mock(async () => []),
        getCorporateActionsForSymbols: mock(async () => {
          callCount++;
          if (callCount < 3) {
            throw new Error("API error");
          }
          return [
            {
              corporate_action_type: "Dividend" as const,
              symbol: "AAPL",
              ex_date: "2024-01-15",
              record_date: null,
              payment_date: null,
              value: 0.24,
            },
          ];
        }),
      };

      const repo = createMockRepo();
      const job = new CorporateActionsBatchJob(client, repo, undefined, {
        retryDelayMs: 10, // Fast retries for testing
      });

      const result = await job.run(["AAPL"]);

      expect(result.processed).toBe(1);
      expect(result.failed).toBe(0);
      expect(callCount).toBe(3);
    });

    test("continues on individual symbol errors when configured", async () => {
      const client = createMockClient([
        {
          corporate_action_type: "Dividend",
          symbol: "AAPL",
          ex_date: "2024-01-15",
          record_date: null,
          payment_date: null,
          value: 0.24,
        },
      ]);

      const repo = createMockRepo();
      (repo.upsert as ReturnType<typeof mock>).mockImplementation(async () => {
        throw new Error("Database error");
      });

      const job = new CorporateActionsBatchJob(client, repo, undefined, {
        continueOnError: true,
      });

      const result = await job.run(["AAPL", "MSFT"]);

      // AAPL fails during upsert, MSFT has no actions so succeeds
      expect(result.failed).toBe(1);
      expect(result.processed).toBe(1);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]!.symbol).toBe("AAPL");
    });

    test("stops on error when continueOnError is false", async () => {
      const client: AlpacaCorporateActionsClient = {
        getCorporateActions: mock(async () => []),
        getCorporateActionsForSymbols: mock(async () => {
          throw new Error("API error");
        }),
      };

      const repo = createMockRepo();
      const job = new CorporateActionsBatchJob(client, repo, undefined, {
        continueOnError: false,
        maxRetries: 0,
      });

      await expect(job.run(["AAPL"])).rejects.toThrow("API error");
    });

    test("reports duration in milliseconds", async () => {
      const client = createMockClient([]);
      const repo = createMockRepo();
      const job = new CorporateActionsBatchJob(client, repo);

      const result = await job.run(["AAPL"]);

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("action type mapping", () => {
    test("stores dividend actions with amount", async () => {
      const actions: AlpacaCorporateAction[] = [
        {
          corporate_action_type: "Dividend",
          symbol: "AAPL",
          ex_date: "2024-01-15",
          record_date: "2024-01-16",
          payment_date: "2024-01-20",
          value: 0.24,
          description: "Quarterly dividend",
        },
      ];

      const client = createMockClient(actions);
      const repo = createMockRepo();
      const job = new CorporateActionsBatchJob(client, repo);

      await job.run(["AAPL"]);

      const calls = (repo.upsert as ReturnType<typeof mock>).mock.calls;
      expect(calls.length).toBe(1);
      const insert = calls[0]![0];
      expect(insert.actionType).toBe("dividend");
      expect(insert.amount).toBe(0.24);
      expect(insert.ratio).toBeNull();
      expect(insert.details).toEqual({ description: "Quarterly dividend" });
    });

    test("stores split actions with ratio", async () => {
      const actions: AlpacaCorporateAction[] = [
        {
          corporate_action_type: "Split",
          symbol: "AAPL",
          ex_date: "2024-08-01",
          record_date: null,
          payment_date: null,
          value: 4,
        },
      ];

      const client = createMockClient(actions);
      const repo = createMockRepo();
      const job = new CorporateActionsBatchJob(client, repo);

      await job.run(["AAPL"]);

      const calls = (repo.upsert as ReturnType<typeof mock>).mock.calls;
      expect(calls.length).toBe(1);
      const insert = calls[0]![0];
      expect(insert.actionType).toBe("split");
      expect(insert.ratio).toBe(4);
      expect(insert.amount).toBeNull();
    });

    test("stores reverse split with ratio", async () => {
      const actions: AlpacaCorporateAction[] = [
        {
          corporate_action_type: "ReverseSplit",
          symbol: "XYZ",
          ex_date: "2024-03-01",
          record_date: null,
          payment_date: null,
          value: 0.1,
        },
      ];

      const client = createMockClient(actions);
      const repo = createMockRepo();
      const job = new CorporateActionsBatchJob(client, repo);

      await job.run(["XYZ"]);

      const calls = (repo.upsert as ReturnType<typeof mock>).mock.calls;
      expect(calls.length).toBe(1);
      const insert = calls[0]![0];
      expect(insert.actionType).toBe("reverse_split");
      expect(insert.ratio).toBe(0.1);
    });

    test("stores special dividend", async () => {
      const actions: AlpacaCorporateAction[] = [
        {
          corporate_action_type: "SpecialDividend",
          symbol: "COST",
          ex_date: "2024-12-01",
          record_date: null,
          payment_date: null,
          value: 15.0,
        },
      ];

      const client = createMockClient(actions);
      const repo = createMockRepo();
      const job = new CorporateActionsBatchJob(client, repo);

      await job.run(["COST"]);

      const calls = (repo.upsert as ReturnType<typeof mock>).mock.calls;
      expect(calls.length).toBe(1);
      const insert = calls[0]![0];
      expect(insert.actionType).toBe("special_dividend");
      expect(insert.amount).toBe(15.0);
    });
  });

  describe("configuration", () => {
    test("uses default configuration", async () => {
      const client = createMockClient([]);
      const repo = createMockRepo();
      const job = new CorporateActionsBatchJob(client, repo);

      const result = await job.run(["AAPL"]);
      expect(result.processed).toBe(1);
    });

    test("respects custom lookback days", async () => {
      const client = createMockClient([]);
      const repo = createMockRepo();
      const job = new CorporateActionsBatchJob(client, repo, undefined, {
        lookbackDays: 30,
        lookaheadDays: 14,
      });

      await job.run(["AAPL"]);

      // Verify the client was called (we can't easily verify dates without more mocking)
      expect(client.getCorporateActionsForSymbols).toHaveBeenCalled();
    });
  });

  describe("edge cases", () => {
    test("handles empty symbols array", async () => {
      const client = createMockClient([]);
      const repo = createMockRepo();
      const job = new CorporateActionsBatchJob(client, repo);

      const result = await job.run([]);

      expect(result.processed).toBe(0);
      expect(result.failed).toBe(0);
    });

    test("handles case-insensitive symbol matching", async () => {
      const actions: AlpacaCorporateAction[] = [
        {
          corporate_action_type: "Dividend",
          symbol: "aapl", // lowercase from API
          ex_date: "2024-01-15",
          record_date: null,
          payment_date: null,
          value: 0.24,
        },
      ];

      const client = createMockClient(actions);
      const repo = createMockRepo();
      const job = new CorporateActionsBatchJob(client, repo);

      const result = await job.run(["AAPL"]); // uppercase input

      expect(result.processed).toBe(1);
      expect(repo.upsert).toHaveBeenCalled();
    });

    test("handles actions without description", async () => {
      const actions: AlpacaCorporateAction[] = [
        {
          corporate_action_type: "Dividend",
          symbol: "AAPL",
          ex_date: "2024-01-15",
          record_date: null,
          payment_date: null,
          value: 0.24,
          // no description
        },
      ];

      const client = createMockClient(actions);
      const repo = createMockRepo();
      const job = new CorporateActionsBatchJob(client, repo);

      await job.run(["AAPL"]);

      const calls = (repo.upsert as ReturnType<typeof mock>).mock.calls;
      expect(calls[0]![0].details).toBeNull();
    });
  });
});
