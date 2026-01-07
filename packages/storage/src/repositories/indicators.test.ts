/**
 * Indicators Repository Tests
 *
 * Tests for the Dynamic Indicator Synthesis data layer.
 */

// Set required environment variables before imports
process.env.CREAM_ENV = "BACKTEST";
process.env.CREAM_BROKER = "ALPACA";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createInMemoryClient, type TursoClient } from "../turso.js";
import { RepositoryError } from "./base.js";
import {
  type CreateIndicatorICHistoryInput,
  type CreateIndicatorInput,
  type CreateIndicatorTrialInput,
  IndicatorsRepository,
  type PaperTradingReport,
  type ValidationReport,
} from "./indicators.js";

// Helper to generate unique IDs for tests
let idCounter = 0;
function testId(prefix: string): string {
  return `${prefix}-${++idCounter}-${Date.now()}`;
}

async function setupTables(client: TursoClient): Promise<void> {
  // Enable foreign key constraints
  await client.run("PRAGMA foreign_keys = ON");

  // Create indicators table
  await client.run(`
    CREATE TABLE IF NOT EXISTS indicators (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL CHECK (category IN ('momentum', 'trend', 'volatility', 'volume', 'custom')),
      status TEXT NOT NULL DEFAULT 'staging' CHECK (status IN ('staging', 'paper', 'production', 'retired')),
      hypothesis TEXT NOT NULL,
      economic_rationale TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      generated_by TEXT NOT NULL,
      code_hash TEXT,
      ast_signature TEXT,
      validation_report TEXT,
      paper_trading_start TEXT,
      paper_trading_end TEXT,
      paper_trading_report TEXT,
      promoted_at TEXT,
      pr_url TEXT,
      merged_at TEXT,
      retired_at TEXT,
      retirement_reason TEXT,
      similar_to TEXT REFERENCES indicators(id),
      replaces TEXT REFERENCES indicators(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Create indicator_trials table
  await client.run(`
    CREATE TABLE IF NOT EXISTS indicator_trials (
      id TEXT PRIMARY KEY,
      indicator_id TEXT NOT NULL REFERENCES indicators(id) ON DELETE CASCADE,
      trial_number INTEGER NOT NULL,
      hypothesis TEXT NOT NULL,
      parameters TEXT NOT NULL,
      sharpe_ratio REAL,
      information_coefficient REAL,
      max_drawdown REAL,
      calmar_ratio REAL,
      sortino_ratio REAL,
      selected INTEGER NOT NULL DEFAULT 0 CHECK (selected IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(indicator_id, trial_number)
    )
  `);

  // Create indicator_ic_history table
  await client.run(`
    CREATE TABLE IF NOT EXISTS indicator_ic_history (
      id TEXT PRIMARY KEY,
      indicator_id TEXT NOT NULL REFERENCES indicators(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      ic_value REAL NOT NULL,
      ic_std REAL NOT NULL,
      decisions_used_in INTEGER NOT NULL DEFAULT 0,
      decisions_correct INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(indicator_id, date)
    )
  `);
}

describe("IndicatorsRepository", () => {
  let client: TursoClient;
  let repo: IndicatorsRepository;

  beforeEach(async () => {
    client = await createInMemoryClient();
    await setupTables(client);
    repo = new IndicatorsRepository(client);
  });

  afterEach(() => {
    client.close();
  });

  // ========================================
  // Indicator CRUD
  // ========================================

  describe("Indicator CRUD", () => {
    test("creates an indicator", async () => {
      const id = testId("ind");
      const input: CreateIndicatorInput = {
        id,
        name: "RSI_Adaptive_14",
        category: "momentum",
        hypothesis: "Adaptive RSI responds better to volatility regime changes",
        economicRationale: "Volatility clustering suggests static parameters underperform",
        generatedBy: "cycle-001",
        codeHash: "abc123def456",
        astSignature: "sig-001",
      };

      const result = await repo.create(input);

      expect(result.id).toBe(id);
      expect(result.name).toBe("RSI_Adaptive_14");
      expect(result.category).toBe("momentum");
      expect(result.status).toBe("staging");
      expect(result.hypothesis).toBe("Adaptive RSI responds better to volatility regime changes");
      expect(result.economicRationale).toBe(
        "Volatility clustering suggests static parameters underperform"
      );
      expect(result.generatedBy).toBe("cycle-001");
      expect(result.codeHash).toBe("abc123def456");
      expect(result.astSignature).toBe("sig-001");
      expect(result.validationReport).toBeNull();
      expect(result.paperTradingStart).toBeNull();
      expect(result.paperTradingEnd).toBeNull();
      expect(result.paperTradingReport).toBeNull();
    });

    test("creates indicator with minimal input", async () => {
      const result = await repo.create({
        id: testId("ind"),
        name: "MinimalIndicator",
        category: "trend",
        hypothesis: "Test hypothesis",
        economicRationale: "Test rationale",
        generatedBy: "cycle-002",
      });

      expect(result.name).toBe("MinimalIndicator");
      expect(result.codeHash).toBeNull();
      expect(result.astSignature).toBeNull();
      expect(result.similarTo).toBeNull();
      expect(result.replaces).toBeNull();
    });

    test("creates indicator with relationships", async () => {
      // Create parent indicator
      const parent = await repo.create({
        id: testId("ind"),
        name: "ParentIndicator",
        category: "momentum",
        hypothesis: "Original hypothesis",
        economicRationale: "Original rationale",
        generatedBy: "cycle-001",
      });

      // Create child indicator that replaces parent
      const child = await repo.create({
        id: testId("ind"),
        name: "ChildIndicator",
        category: "momentum",
        hypothesis: "Improved hypothesis",
        economicRationale: "Improved rationale",
        generatedBy: "cycle-002",
        similarTo: parent.id,
        replaces: parent.id,
      });

      expect(child.similarTo).toBe(parent.id);
      expect(child.replaces).toBe(parent.id);
    });

    test("finds indicator by ID", async () => {
      const created = await repo.create({
        id: testId("ind"),
        name: "FindTest",
        category: "volatility",
        hypothesis: "Test",
        economicRationale: "Test",
        generatedBy: "cycle-001",
      });

      const found = await repo.findById(created.id);
      expect(found).not.toBeNull();
      expect(found!.name).toBe("FindTest");
    });

    test("returns null for non-existent ID", async () => {
      const found = await repo.findById("nonexistent");
      expect(found).toBeNull();
    });

    test("finds indicator by name", async () => {
      await repo.create({
        id: testId("ind"),
        name: "NamedIndicator",
        category: "volume",
        hypothesis: "Test",
        economicRationale: "Test",
        generatedBy: "cycle-001",
      });

      const found = await repo.findByName("NamedIndicator");
      expect(found).not.toBeNull();
      expect(found!.category).toBe("volume");
    });

    test("finds indicator by code hash", async () => {
      await repo.create({
        id: testId("ind"),
        name: "HashIndicator",
        category: "custom",
        hypothesis: "Test",
        economicRationale: "Test",
        generatedBy: "cycle-001",
        codeHash: "unique-hash-123",
      });

      const found = await repo.findByCodeHash("unique-hash-123");
      expect(found).not.toBeNull();
      expect(found!.name).toBe("HashIndicator");
    });

    test("finds many with status filter", async () => {
      await repo.create({
        id: testId("ind"),
        name: "Staging1",
        category: "momentum",
        hypothesis: "Test",
        economicRationale: "Test",
        generatedBy: "cycle-001",
      });
      await repo.create({
        id: testId("ind"),
        name: "Staging2",
        category: "trend",
        hypothesis: "Test",
        economicRationale: "Test",
        generatedBy: "cycle-001",
      });
      const ind3 = await repo.create({
        id: testId("ind"),
        name: "Production1",
        category: "volatility",
        hypothesis: "Test",
        economicRationale: "Test",
        generatedBy: "cycle-001",
      });
      await repo.updateStatus(ind3.id, "production");

      const staging = await repo.findMany({ status: "staging" });
      expect(staging.data).toHaveLength(2);

      const production = await repo.findMany({ status: "production" });
      expect(production.data).toHaveLength(1);
      expect(production.data[0]!.name).toBe("Production1");
    });

    test("finds many with category filter", async () => {
      await repo.create({
        id: testId("ind"),
        name: "Mom1",
        category: "momentum",
        hypothesis: "Test",
        economicRationale: "Test",
        generatedBy: "cycle-001",
      });
      await repo.create({
        id: testId("ind"),
        name: "Mom2",
        category: "momentum",
        hypothesis: "Test",
        economicRationale: "Test",
        generatedBy: "cycle-001",
      });
      await repo.create({
        id: testId("ind"),
        name: "Trend1",
        category: "trend",
        hypothesis: "Test",
        economicRationale: "Test",
        generatedBy: "cycle-001",
      });

      const momentum = await repo.findMany({ category: "momentum" });
      expect(momentum.data).toHaveLength(2);

      const trend = await repo.findMany({ category: "trend" });
      expect(trend.data).toHaveLength(1);
    });

    test("finds active indicators (paper + production)", async () => {
      await repo.create({
        id: testId("ind"),
        name: "StagingInd",
        category: "momentum",
        hypothesis: "Test",
        economicRationale: "Test",
        generatedBy: "cycle-001",
      });
      const paper = await repo.create({
        id: testId("ind"),
        name: "PaperInd",
        category: "trend",
        hypothesis: "Test",
        economicRationale: "Test",
        generatedBy: "cycle-001",
      });
      const prod = await repo.create({
        id: testId("ind"),
        name: "ProdInd",
        category: "volatility",
        hypothesis: "Test",
        economicRationale: "Test",
        generatedBy: "cycle-001",
      });

      await repo.updateStatus(paper.id, "paper");
      await repo.updateStatus(prod.id, "production");

      const active = await repo.findActive();
      expect(active).toHaveLength(2);
      expect(active.map((i) => i.name).sort()).toEqual(["PaperInd", "ProdInd"]);
    });

    test("finds production indicators only", async () => {
      const paper = await repo.create({
        id: testId("ind"),
        name: "PaperOnly",
        category: "momentum",
        hypothesis: "Test",
        economicRationale: "Test",
        generatedBy: "cycle-001",
      });
      const prod = await repo.create({
        id: testId("ind"),
        name: "ProdOnly",
        category: "momentum",
        hypothesis: "Test",
        economicRationale: "Test",
        generatedBy: "cycle-001",
      });

      await repo.updateStatus(paper.id, "paper");
      await repo.updateStatus(prod.id, "production");

      const production = await repo.findProduction();
      expect(production).toHaveLength(1);
      expect(production[0]!.name).toBe("ProdOnly");
    });

    test("deletes an indicator", async () => {
      const created = await repo.create({
        id: testId("ind"),
        name: "ToDelete",
        category: "custom",
        hypothesis: "Test",
        economicRationale: "Test",
        generatedBy: "cycle-001",
      });

      const deleted = await repo.delete(created.id);
      expect(deleted).toBe(true);

      const found = await repo.findById(created.id);
      expect(found).toBeNull();
    });

    test("delete returns false for non-existent ID", async () => {
      const deleted = await repo.delete("nonexistent");
      expect(deleted).toBe(false);
    });
  });

  // ========================================
  // Status Transitions
  // ========================================

  describe("Status Transitions", () => {
    test("updates status", async () => {
      const ind = await repo.create({
        id: testId("ind"),
        name: "StatusTest",
        category: "momentum",
        hypothesis: "Test",
        economicRationale: "Test",
        generatedBy: "cycle-001",
      });

      const updated = await repo.updateStatus(ind.id, "paper");
      expect(updated.status).toBe("paper");
    });

    test("updateStatus throws for non-existent indicator", async () => {
      await expect(repo.updateStatus("nonexistent", "paper")).rejects.toThrow(RepositoryError);
    });

    test("saves validation report", async () => {
      const ind = await repo.create({
        id: testId("ind"),
        name: "ValidationTest",
        category: "momentum",
        hypothesis: "Test",
        economicRationale: "Test",
        generatedBy: "cycle-001",
      });

      const report: ValidationReport = {
        trialsCount: 50,
        rawSharpe: 1.8,
        deflatedSharpe: 1.2,
        probabilityOfOverfit: 0.15,
        informationCoefficient: 0.08,
        icStandardDev: 0.02,
        maxDrawdown: -0.12,
        calmarRatio: 1.5,
        sortinoRatio: 2.1,
        walkForwardPeriods: [
          {
            startDate: "2023-01-01",
            endDate: "2023-06-30",
            inSampleSharpe: 1.9,
            outOfSampleSharpe: 1.6,
            informationCoefficient: 0.09,
          },
        ],
        validatedAt: "2024-01-15T10:00:00Z",
      };

      const updated = await repo.saveValidationReport(ind.id, report);
      expect(updated.validationReport).toEqual(report);
    });

    test("starts paper trading", async () => {
      const ind = await repo.create({
        id: testId("ind"),
        name: "PaperStart",
        category: "momentum",
        hypothesis: "Test",
        economicRationale: "Test",
        generatedBy: "cycle-001",
      });

      const updated = await repo.startPaperTrading(ind.id, "2024-01-01T00:00:00Z");
      expect(updated.status).toBe("paper");
      expect(updated.paperTradingStart).toBe("2024-01-01T00:00:00Z");
    });

    test("ends paper trading with report", async () => {
      const ind = await repo.create({
        id: testId("ind"),
        name: "PaperEnd",
        category: "momentum",
        hypothesis: "Test",
        economicRationale: "Test",
        generatedBy: "cycle-001",
      });
      await repo.startPaperTrading(ind.id, "2024-01-01T00:00:00Z");

      const report: PaperTradingReport = {
        periodStart: "2024-01-01T00:00:00Z",
        periodEnd: "2024-02-01T00:00:00Z",
        tradingDays: 22,
        realizedSharpe: 1.5,
        expectedSharpe: 1.8,
        sharpeTrackingError: 0.3,
        realizedIC: 0.07,
        expectedIC: 0.08,
        signalsGenerated: 150,
        profitableSignalRate: 0.55,
        returnCorrelation: 0.85,
        recommendation: "PROMOTE",
        generatedAt: "2024-02-01T00:00:00Z",
      };

      const updated = await repo.endPaperTrading(ind.id, "2024-02-01T00:00:00Z", report);
      expect(updated.paperTradingEnd).toBe("2024-02-01T00:00:00Z");
      expect(updated.paperTradingReport).toEqual(report);
    });

    test("promotes to production", async () => {
      const ind = await repo.create({
        id: testId("ind"),
        name: "PromoteTest",
        category: "momentum",
        hypothesis: "Test",
        economicRationale: "Test",
        generatedBy: "cycle-001",
      });
      await repo.updateStatus(ind.id, "paper");

      const updated = await repo.promote(ind.id, "https://github.com/org/repo/pull/123");
      expect(updated.status).toBe("production");
      expect(updated.promotedAt).toBeDefined();
      expect(updated.prUrl).toBe("https://github.com/org/repo/pull/123");
    });

    test("marks as merged", async () => {
      const ind = await repo.create({
        id: testId("ind"),
        name: "MergeTest",
        category: "momentum",
        hypothesis: "Test",
        economicRationale: "Test",
        generatedBy: "cycle-001",
      });
      await repo.promote(ind.id, "https://github.com/org/repo/pull/123");

      const updated = await repo.markMerged(ind.id);
      expect(updated.mergedAt).toBeDefined();
    });

    test("retires indicator", async () => {
      const ind = await repo.create({
        id: testId("ind"),
        name: "RetireTest",
        category: "momentum",
        hypothesis: "Test",
        economicRationale: "Test",
        generatedBy: "cycle-001",
      });
      await repo.updateStatus(ind.id, "production");

      const updated = await repo.retire(ind.id, "IC decay below threshold");
      expect(updated.status).toBe("retired");
      expect(updated.retiredAt).toBeDefined();
      expect(updated.retirementReason).toBe("IC decay below threshold");
    });
  });

  // ========================================
  // Indicator Trials
  // ========================================

  describe("Indicator Trials", () => {
    test("creates a trial", async () => {
      const ind = await repo.create({
        id: testId("ind"),
        name: "TrialIndicator",
        category: "momentum",
        hypothesis: "Test",
        economicRationale: "Test",
        generatedBy: "cycle-001",
      });

      const trialId = testId("trial");
      const input: CreateIndicatorTrialInput = {
        id: trialId,
        indicatorId: ind.id,
        trialNumber: 1,
        hypothesis: "Lower threshold improves signal quality",
        parameters: {
          lookback: 14,
          upperThreshold: 70,
          lowerThreshold: 30,
        },
      };

      const trial = await repo.createTrial(input);
      expect(trial.id).toBe(trialId);
      expect(trial.indicatorId).toBe(ind.id);
      expect(trial.trialNumber).toBe(1);
      expect(trial.hypothesis).toBe("Lower threshold improves signal quality");
      expect(trial.parameters.lookback).toBe(14);
      expect(trial.selected).toBe(false);
    });

    test("finds trial by ID", async () => {
      const ind = await repo.create({
        id: testId("ind"),
        name: "TrialFind",
        category: "momentum",
        hypothesis: "Test",
        economicRationale: "Test",
        generatedBy: "cycle-001",
      });

      const created = await repo.createTrial({
        id: testId("trial"),
        indicatorId: ind.id,
        trialNumber: 1,
        hypothesis: "Test trial",
        parameters: { lookback: 14 },
      });

      const found = await repo.findTrialById(created.id);
      expect(found).not.toBeNull();
      expect(found!.trialNumber).toBe(1);
    });

    test("finds trials by indicator ID", async () => {
      const ind = await repo.create({
        id: testId("ind"),
        name: "MultiTrial",
        category: "momentum",
        hypothesis: "Test",
        economicRationale: "Test",
        generatedBy: "cycle-001",
      });

      await repo.createTrial({
        id: testId("trial"),
        indicatorId: ind.id,
        trialNumber: 1,
        hypothesis: "Trial 1",
        parameters: { lookback: 10 },
      });
      await repo.createTrial({
        id: testId("trial"),
        indicatorId: ind.id,
        trialNumber: 2,
        hypothesis: "Trial 2",
        parameters: { lookback: 14 },
      });
      await repo.createTrial({
        id: testId("trial"),
        indicatorId: ind.id,
        trialNumber: 3,
        hypothesis: "Trial 3",
        parameters: { lookback: 20 },
      });

      const trials = await repo.findTrialsByIndicatorId(ind.id);
      expect(trials).toHaveLength(3);
      expect(trials.map((t) => t.trialNumber)).toEqual([1, 2, 3]);
    });

    test("updates trial results", async () => {
      const ind = await repo.create({
        id: testId("ind"),
        name: "TrialResults",
        category: "momentum",
        hypothesis: "Test",
        economicRationale: "Test",
        generatedBy: "cycle-001",
      });

      const trial = await repo.createTrial({
        id: testId("trial"),
        indicatorId: ind.id,
        trialNumber: 1,
        hypothesis: "Test trial",
        parameters: { lookback: 14 },
      });

      const updated = await repo.updateTrialResults(trial.id, {
        sharpeRatio: 1.5,
        informationCoefficient: 0.08,
        maxDrawdown: -0.12,
        calmarRatio: 1.3,
        sortinoRatio: 1.8,
      });

      expect(updated.sharpeRatio).toBe(1.5);
      expect(updated.informationCoefficient).toBe(0.08);
      expect(updated.maxDrawdown).toBe(-0.12);
      expect(updated.calmarRatio).toBe(1.3);
      expect(updated.sortinoRatio).toBe(1.8);
    });

    test("selects best trial", async () => {
      const ind = await repo.create({
        id: testId("ind"),
        name: "SelectTrial",
        category: "momentum",
        hypothesis: "Test",
        economicRationale: "Test",
        generatedBy: "cycle-001",
      });

      await repo.createTrial({
        id: testId("trial"),
        indicatorId: ind.id,
        trialNumber: 1,
        hypothesis: "Trial 1",
        parameters: { lookback: 10 },
      });
      const trial2 = await repo.createTrial({
        id: testId("trial"),
        indicatorId: ind.id,
        trialNumber: 2,
        hypothesis: "Trial 2",
        parameters: { lookback: 14 },
      });

      // Select trial 2 as best
      await repo.selectTrial(trial2.id);

      const trials = await repo.findTrialsByIndicatorId(ind.id);
      const selectedTrials = trials.filter((t) => t.selected);
      expect(selectedTrials).toHaveLength(1);
      expect(selectedTrials[0]!.id).toBe(trial2.id);
    });

    test("selecting trial deselects others for same indicator", async () => {
      const ind = await repo.create({
        id: testId("ind"),
        name: "DeselectOthers",
        category: "momentum",
        hypothesis: "Test",
        economicRationale: "Test",
        generatedBy: "cycle-001",
      });

      const trial1 = await repo.createTrial({
        id: testId("trial"),
        indicatorId: ind.id,
        trialNumber: 1,
        hypothesis: "Trial 1",
        parameters: { lookback: 10 },
      });
      const trial2 = await repo.createTrial({
        id: testId("trial"),
        indicatorId: ind.id,
        trialNumber: 2,
        hypothesis: "Trial 2",
        parameters: { lookback: 14 },
      });

      // Select trial 1 first
      await repo.selectTrial(trial1.id);
      let trials = await repo.findTrialsByIndicatorId(ind.id);
      expect(trials.find((t) => t.id === trial1.id)!.selected).toBe(true);

      // Now select trial 2 - trial 1 should be deselected
      await repo.selectTrial(trial2.id);
      trials = await repo.findTrialsByIndicatorId(ind.id);
      expect(trials.find((t) => t.id === trial1.id)!.selected).toBe(false);
      expect(trials.find((t) => t.id === trial2.id)!.selected).toBe(true);
    });

    test("gets trial count for indicator", async () => {
      const ind = await repo.create({
        id: testId("ind"),
        name: "CountTrials",
        category: "momentum",
        hypothesis: "Test",
        economicRationale: "Test",
        generatedBy: "cycle-001",
      });

      expect(await repo.getTrialCount(ind.id)).toBe(0);

      await repo.createTrial({
        id: testId("trial"),
        indicatorId: ind.id,
        trialNumber: 1,
        hypothesis: "Trial 1",
        parameters: {},
      });
      expect(await repo.getTrialCount(ind.id)).toBe(1);

      await repo.createTrial({
        id: testId("trial"),
        indicatorId: ind.id,
        trialNumber: 2,
        hypothesis: "Trial 2",
        parameters: {},
      });
      expect(await repo.getTrialCount(ind.id)).toBe(2);
    });
  });

  // ========================================
  // IC History
  // ========================================

  describe("IC History", () => {
    test("records IC history", async () => {
      const ind = await repo.create({
        id: testId("ind"),
        name: "ICHistoryInd",
        category: "momentum",
        hypothesis: "Test",
        economicRationale: "Test",
        generatedBy: "cycle-001",
      });

      const historyId = testId("ich");
      const input: CreateIndicatorICHistoryInput = {
        id: historyId,
        indicatorId: ind.id,
        date: "2024-01-15",
        icValue: 0.08,
        icStd: 0.02,
        decisionsUsedIn: 10,
        decisionsCorrect: 6,
      };

      const history = await repo.recordICHistory(input);
      expect(history.id).toBe(historyId);
      expect(history.indicatorId).toBe(ind.id);
      expect(history.date).toBe("2024-01-15");
      expect(history.icValue).toBe(0.08);
      expect(history.icStd).toBe(0.02);
      expect(history.decisionsUsedIn).toBe(10);
      expect(history.decisionsCorrect).toBe(6);
    });

    test("records IC history with minimal input", async () => {
      const ind = await repo.create({
        id: testId("ind"),
        name: "ICMinimal",
        category: "momentum",
        hypothesis: "Test",
        economicRationale: "Test",
        generatedBy: "cycle-001",
      });

      const history = await repo.recordICHistory({
        id: testId("ich"),
        indicatorId: ind.id,
        date: "2024-01-15",
        icValue: 0.08,
        icStd: 0.02,
      });

      expect(history.decisionsUsedIn).toBe(0);
      expect(history.decisionsCorrect).toBe(0);
    });

    test("finds IC history by ID", async () => {
      const ind = await repo.create({
        id: testId("ind"),
        name: "ICFindById",
        category: "momentum",
        hypothesis: "Test",
        economicRationale: "Test",
        generatedBy: "cycle-001",
      });

      const created = await repo.recordICHistory({
        id: testId("ich"),
        indicatorId: ind.id,
        date: "2024-01-15",
        icValue: 0.08,
        icStd: 0.02,
      });

      const found = await repo.findICHistoryById(created.id);
      expect(found).not.toBeNull();
      expect(found!.date).toBe("2024-01-15");
    });

    test("finds IC history by indicator ID", async () => {
      const ind = await repo.create({
        id: testId("ind"),
        name: "ICHistoryQuery",
        category: "momentum",
        hypothesis: "Test",
        economicRationale: "Test",
        generatedBy: "cycle-001",
      });

      await repo.recordICHistory({
        id: testId("ich"),
        indicatorId: ind.id,
        date: "2024-01-13",
        icValue: 0.07,
        icStd: 0.02,
      });
      await repo.recordICHistory({
        id: testId("ich"),
        indicatorId: ind.id,
        date: "2024-01-14",
        icValue: 0.08,
        icStd: 0.02,
      });
      await repo.recordICHistory({
        id: testId("ich"),
        indicatorId: ind.id,
        date: "2024-01-15",
        icValue: 0.09,
        icStd: 0.02,
      });

      const history = await repo.findICHistoryByIndicatorId(ind.id);
      expect(history).toHaveLength(3);
      // Should be ordered by date descending
      expect(history[0]!.date).toBe("2024-01-15");
      expect(history[2]!.date).toBe("2024-01-13");
    });

    test("finds IC history with date filters", async () => {
      const ind = await repo.create({
        id: testId("ind"),
        name: "ICDateFilter",
        category: "momentum",
        hypothesis: "Test",
        economicRationale: "Test",
        generatedBy: "cycle-001",
      });

      await repo.recordICHistory({
        id: testId("ich"),
        indicatorId: ind.id,
        date: "2024-01-10",
        icValue: 0.06,
        icStd: 0.02,
      });
      await repo.recordICHistory({
        id: testId("ich"),
        indicatorId: ind.id,
        date: "2024-01-15",
        icValue: 0.07,
        icStd: 0.02,
      });
      await repo.recordICHistory({
        id: testId("ich"),
        indicatorId: ind.id,
        date: "2024-01-20",
        icValue: 0.08,
        icStd: 0.02,
      });

      const filtered = await repo.findICHistoryByIndicatorId(ind.id, {
        startDate: "2024-01-14",
        endDate: "2024-01-16",
      });
      expect(filtered).toHaveLength(1);
      expect(filtered[0]!.date).toBe("2024-01-15");
    });

    test("calculates average IC", async () => {
      const ind = await repo.create({
        id: testId("ind"),
        name: "ICAverage",
        category: "momentum",
        hypothesis: "Test",
        economicRationale: "Test",
        generatedBy: "cycle-001",
      });

      await repo.recordICHistory({
        id: testId("ich"),
        indicatorId: ind.id,
        date: "2024-01-13",
        icValue: 0.06,
        icStd: 0.02,
      });
      await repo.recordICHistory({
        id: testId("ich"),
        indicatorId: ind.id,
        date: "2024-01-14",
        icValue: 0.08,
        icStd: 0.02,
      });
      await repo.recordICHistory({
        id: testId("ich"),
        indicatorId: ind.id,
        date: "2024-01-15",
        icValue: 0.1,
        icStd: 0.02,
      });

      const avg = await repo.getAverageIC(ind.id);
      expect(avg).toBeCloseTo(0.08, 6);
    });

    test("average IC returns null when no history", async () => {
      const ind = await repo.create({
        id: testId("ind"),
        name: "ICNoHistory",
        category: "momentum",
        hypothesis: "Test",
        economicRationale: "Test",
        generatedBy: "cycle-001",
      });

      const avg = await repo.getAverageIC(ind.id);
      expect(avg).toBeNull();
    });

    test("average IC with days parameter", async () => {
      const ind = await repo.create({
        id: testId("ind"),
        name: "ICAvgDays",
        category: "momentum",
        hypothesis: "Test",
        economicRationale: "Test",
        generatedBy: "cycle-001",
      });

      // Add history entries
      await repo.recordICHistory({
        id: testId("ich"),
        indicatorId: ind.id,
        date: "2024-01-10",
        icValue: 0.04,
        icStd: 0.02,
      });
      await repo.recordICHistory({
        id: testId("ich"),
        indicatorId: ind.id,
        date: "2024-01-14",
        icValue: 0.08,
        icStd: 0.02,
      });
      await repo.recordICHistory({
        id: testId("ich"),
        indicatorId: ind.id,
        date: "2024-01-15",
        icValue: 0.1,
        icStd: 0.02,
      });

      // Get average of last 2 entries
      const avg = await repo.getAverageIC(ind.id, 2);
      expect(avg).toBeCloseTo(0.09, 6);
    });
  });

  // ========================================
  // All Categories and Statuses
  // ========================================

  describe("Categories and Statuses", () => {
    test("handles all indicator categories", async () => {
      const categories = ["momentum", "trend", "volatility", "volume", "custom"] as const;

      for (const category of categories) {
        const ind = await repo.create({
          id: testId("ind"),
          name: `Category_${category}`,
          category,
          hypothesis: "Test",
          economicRationale: "Test",
          generatedBy: "cycle-001",
        });

        expect(ind.category).toBe(category);

        const found = await repo.findMany({ category });
        expect(found.data.length).toBeGreaterThanOrEqual(1);
      }
    });

    test("handles all indicator statuses", async () => {
      const statuses = ["staging", "paper", "production", "retired"] as const;

      for (const status of statuses) {
        const ind = await repo.create({
          id: testId("ind"),
          name: `Status_${status}`,
          category: "momentum",
          hypothesis: "Test",
          economicRationale: "Test",
          generatedBy: "cycle-001",
        });

        await repo.updateStatus(ind.id, status);

        const found = await repo.findMany({ status });
        expect(found.data.some((i) => i.name === `Status_${status}`)).toBe(true);
      }
    });
  });

  // ========================================
  // Edge Cases
  // ========================================

  describe("Edge Cases", () => {
    test("handles complex validation report", async () => {
      const ind = await repo.create({
        id: testId("ind"),
        name: "ComplexValidation",
        category: "momentum",
        hypothesis: "Test",
        economicRationale: "Test",
        generatedBy: "cycle-001",
      });

      const complexReport: ValidationReport = {
        trialsCount: 100,
        rawSharpe: 2.5,
        deflatedSharpe: 1.8,
        probabilityOfOverfit: 0.1,
        informationCoefficient: 0.12,
        icStandardDev: 0.03,
        maxDrawdown: -0.15,
        calmarRatio: 2.0,
        sortinoRatio: 3.0,
        walkForwardPeriods: [
          {
            startDate: "2022-01-01",
            endDate: "2022-06-30",
            inSampleSharpe: 2.0,
            outOfSampleSharpe: 1.5,
            informationCoefficient: 0.1,
          },
          {
            startDate: "2022-07-01",
            endDate: "2022-12-31",
            inSampleSharpe: 2.2,
            outOfSampleSharpe: 1.7,
            informationCoefficient: 0.11,
          },
          {
            startDate: "2023-01-01",
            endDate: "2023-06-30",
            inSampleSharpe: 2.4,
            outOfSampleSharpe: 1.9,
            informationCoefficient: 0.13,
          },
        ],
        validatedAt: "2024-01-15T10:00:00Z",
      };

      const updated = await repo.saveValidationReport(ind.id, complexReport);
      expect(updated.validationReport).toEqual(complexReport);
      expect(updated.validationReport!.walkForwardPeriods).toHaveLength(3);
    });

    test("handles trial with custom parameters", async () => {
      const ind = await repo.create({
        id: testId("ind"),
        name: "CustomParams",
        category: "custom",
        hypothesis: "Test",
        economicRationale: "Test",
        generatedBy: "cycle-001",
      });

      const trial = await repo.createTrial({
        id: testId("trial"),
        indicatorId: ind.id,
        trialNumber: 1,
        hypothesis: "Custom parameters test",
        parameters: {
          lookback: 20,
          smoothing: 0.5,
          upperThreshold: 80,
          lowerThreshold: 20,
          custom: {
            adaptiveWindow: true,
            volatilityScaling: 1.5,
            nestedConfig: {
              enabled: true,
              factor: 0.8,
            },
          },
        },
      });

      expect(trial.parameters.custom).toEqual({
        adaptiveWindow: true,
        volatilityScaling: 1.5,
        nestedConfig: {
          enabled: true,
          factor: 0.8,
        },
      });
    });

    test("cascade deletes trials and IC history", async () => {
      const ind = await repo.create({
        id: testId("ind"),
        name: "CascadeDelete",
        category: "momentum",
        hypothesis: "Test",
        economicRationale: "Test",
        generatedBy: "cycle-001",
      });

      // Add trials
      await repo.createTrial({
        id: testId("trial"),
        indicatorId: ind.id,
        trialNumber: 1,
        hypothesis: "Trial 1",
        parameters: {},
      });
      await repo.createTrial({
        id: testId("trial"),
        indicatorId: ind.id,
        trialNumber: 2,
        hypothesis: "Trial 2",
        parameters: {},
      });

      // Add IC history
      await repo.recordICHistory({
        id: testId("ich"),
        indicatorId: ind.id,
        date: "2024-01-15",
        icValue: 0.08,
        icStd: 0.02,
      });

      // Delete indicator
      await repo.delete(ind.id);

      // Verify trials and IC history were deleted
      const trials = await repo.findTrialsByIndicatorId(ind.id);
      expect(trials).toHaveLength(0);

      const history = await repo.findICHistoryByIndicatorId(ind.id);
      expect(history).toHaveLength(0);
    });

    test("handles pagination in findMany", async () => {
      // Create 10 indicators
      for (let i = 0; i < 10; i++) {
        await repo.create({
          id: testId("ind"),
          name: `Paginate_${i}`,
          category: "momentum",
          hypothesis: "Test",
          economicRationale: "Test",
          generatedBy: "cycle-001",
        });
      }

      // Get first page
      const page1 = await repo.findMany({}, { page: 1, pageSize: 3 });
      expect(page1.data).toHaveLength(3);
      expect(page1.total).toBe(10);
      expect(page1.page).toBe(1);
      expect(page1.pageSize).toBe(3);
      expect(page1.totalPages).toBe(4);

      // Get second page
      const page2 = await repo.findMany({}, { page: 2, pageSize: 3 });
      expect(page2.data).toHaveLength(3);
      expect(page2.page).toBe(2);

      // Verify no overlap
      const page1Names = page1.data.map((i) => i.name);
      const page2Names = page2.data.map((i) => i.name);
      const overlap = page1Names.filter((n) => page2Names.includes(n));
      expect(overlap).toHaveLength(0);
    });
  });
});
