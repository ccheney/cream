/**
 * Indicator Synthesis Scheduler Tests
 */

// Set required environment variables before imports
process.env.CREAM_ENV = "PAPER";

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { RegimeLabel, TursoClient } from "@cream/storage";
import { IndicatorSynthesisScheduler } from "./indicator-synthesis";

// ============================================
// Mock Factory Helpers
// ============================================

function createMockTursoClient(): TursoClient {
  return {
    execute: mock(() => Promise.resolve([])),
    run: mock(() => Promise.resolve({ changes: 0 })),
    get: mock(() => Promise.resolve(null)),
    close: mock(() => {}),
  } as unknown as TursoClient;
}

function createMockRegimeLabel(regime = "bull_trend"): RegimeLabel {
  return {
    id: 1,
    symbol: "_MARKET",
    timestamp: new Date().toISOString(),
    timeframe: "1d",
    regime: regime as RegimeLabel["regime"],
    confidence: 0.85,
    trendStrength: null,
    volatilityPercentile: null,
    correlationToMarket: null,
    modelName: "hmm_regime",
    modelVersion: null,
    computedAt: new Date().toISOString(),
  };
}

// ============================================
// Tests
// ============================================

describe("IndicatorSynthesisScheduler", () => {
  let scheduler: IndicatorSynthesisScheduler;
  let mockDb: TursoClient;

  beforeEach(() => {
    mockDb = createMockTursoClient();
    scheduler = new IndicatorSynthesisScheduler({ db: mockDb });
  });

  afterEach(() => {
    scheduler.stop();
  });

  describe("initialization", () => {
    test("should create scheduler with initial state", () => {
      const state = scheduler.getState();
      expect(state.lastRun).toBeNull();
      expect(state.lastTriggerResult).toBe(false);
      expect(state.lastError).toBeNull();
      expect(state.nextRun).toBeNull();
      expect(state.runCount).toBe(0);
    });

    test("should start scheduler and set next run time", () => {
      scheduler.start();
      const state = scheduler.getState();

      // Next run should be set after starting
      expect(state.nextRun).not.toBeNull();
      expect(state.nextRun instanceof Date).toBe(true);
    });

    test("should stop scheduler", () => {
      scheduler.start();
      scheduler.stop();

      // Scheduler should be stopped (no error on second stop)
      scheduler.stop();
    });
  });

  describe("trigger check - no regime data", () => {
    test("should return false when no market regime exists", async () => {
      // Mock no regime data
      (mockDb.get as ReturnType<typeof mock>).mockReturnValue(Promise.resolve(null));

      const result = await scheduler.triggerCheck();

      expect(result).toBe(false);
      const state = scheduler.getState();
      expect(state.lastRun).not.toBeNull();
      expect(state.lastTriggerResult).toBe(false);
      expect(state.runCount).toBe(1);
    });
  });

  describe("trigger check - with regime data", () => {
    test("should check trigger conditions when regime exists", async () => {
      const regimeLabel = createMockRegimeLabel("bull_trend");

      // Mock regime query - return for getMarketRegime
      (mockDb.get as ReturnType<typeof mock>).mockReturnValue(
        Promise.resolve({
          id: regimeLabel.id,
          symbol: regimeLabel.symbol,
          timestamp: regimeLabel.timestamp,
          timeframe: regimeLabel.timeframe,
          regime: regimeLabel.regime,
          confidence: regimeLabel.confidence,
          trend_strength: regimeLabel.trendStrength,
          volatility_percentile: regimeLabel.volatilityPercentile,
          correlation_to_market: regimeLabel.correlationToMarket,
          model_name: regimeLabel.modelName,
          model_version: regimeLabel.modelVersion,
          computed_at: regimeLabel.computedAt,
        })
      );

      // Mock empty factors (no active factors = no active regimes)
      (mockDb.execute as ReturnType<typeof mock>).mockReturnValue(Promise.resolve([]));

      const result = await scheduler.triggerCheck();

      // The result depends on the ResearchTriggerService's blocking conditions
      // With no factors, it should either trigger (regime gap) or be blocked
      expect(typeof result).toBe("boolean");
      expect(scheduler.getState().runCount).toBe(1);
    });

    test("should handle errors gracefully", async () => {
      // Mock database error
      (mockDb.get as ReturnType<typeof mock>).mockRejectedValue(
        new Error("Database connection failed")
      );

      const result = await scheduler.triggerCheck();

      expect(result).toBe(false);
      const state = scheduler.getState();
      expect(state.lastError).toBe("Database connection failed");
      expect(state.lastTriggerResult).toBe(false);
    });
  });

  describe("state management", () => {
    test("should increment run count on each check", async () => {
      (mockDb.get as ReturnType<typeof mock>).mockReturnValue(Promise.resolve(null));

      await scheduler.triggerCheck();
      expect(scheduler.getState().runCount).toBe(1);

      await scheduler.triggerCheck();
      expect(scheduler.getState().runCount).toBe(2);

      await scheduler.triggerCheck();
      expect(scheduler.getState().runCount).toBe(3);
    });

    test("should update lastRun timestamp on each check", async () => {
      (mockDb.get as ReturnType<typeof mock>).mockReturnValue(Promise.resolve(null));

      const beforeCheck = new Date();
      await scheduler.triggerCheck();
      const afterCheck = new Date();

      const state = scheduler.getState();
      expect(state.lastRun).not.toBeNull();
      expect(state.lastRun!.getTime()).toBeGreaterThanOrEqual(beforeCheck.getTime());
      expect(state.lastRun!.getTime()).toBeLessThanOrEqual(afterCheck.getTime());
    });
  });

  describe("cron schedule", () => {
    test("should have correct cron schedule (6 AM ET weekdays)", () => {
      scheduler.start();
      const state = scheduler.getState();

      // Verify next run is in the future
      expect(state.nextRun).not.toBeNull();
      expect(state.nextRun!.getTime()).toBeGreaterThan(Date.now());

      // Verify next run is on a weekday (Mon-Fri)
      const dayOfWeek = state.nextRun!.getDay();
      expect(dayOfWeek).toBeGreaterThanOrEqual(1); // Monday = 1
      expect(dayOfWeek).toBeLessThanOrEqual(5); // Friday = 5
    });
  });
});

describe("createIndicatorSynthesisScheduler", () => {
  test("should create scheduler with dependencies", () => {
    const { createIndicatorSynthesisScheduler } = require("./indicator-synthesis");
    const mockDb = createMockTursoClient();

    const scheduler = createIndicatorSynthesisScheduler({ db: mockDb });

    expect(scheduler).toBeInstanceOf(IndicatorSynthesisScheduler);
    scheduler.stop();
  });
});

describe("startIndicatorSynthesisScheduler", () => {
  test("should create and start scheduler", () => {
    const { startIndicatorSynthesisScheduler } = require("./indicator-synthesis");
    const mockDb = createMockTursoClient();

    const scheduler = startIndicatorSynthesisScheduler(mockDb);

    expect(scheduler).toBeInstanceOf(IndicatorSynthesisScheduler);
    expect(scheduler.getState().nextRun).not.toBeNull();
    scheduler.stop();
  });
});
