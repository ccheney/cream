/**
 * Factor Zoo Repository Tests
 *
 * Tests for the Factor Zoo data layer managing alpha factors.
 */

// Set required environment variables before imports
Bun.env.CREAM_ENV = "BACKTEST";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { DailyMetrics, NewFactor, NewHypothesis, NewResearchRun } from "@cream/domain";
import { createInMemoryClient, type TursoClient } from "../turso.js";
import { FactorZooRepository } from "./factor-zoo.js";

// Helper to generate unique IDs for tests
let idCounter = 0;
function testId(prefix: string): string {
	return `${prefix}-${++idCounter}-${Date.now()}`;
}

async function setupTables(client: TursoClient): Promise<void> {
	// Enable foreign key constraints
	await client.run("PRAGMA foreign_keys = ON");

	// Create hypotheses table
	await client.run(`
    CREATE TABLE IF NOT EXISTS hypotheses (
      hypothesis_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      economic_rationale TEXT NOT NULL,
      market_mechanism TEXT NOT NULL,
      target_regime TEXT CHECK (target_regime IN ('bull', 'bear', 'sideways', 'volatile', 'all')),
      falsification_criteria TEXT,
      status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'implementing', 'validating', 'validated', 'rejected')),
      iteration INTEGER NOT NULL DEFAULT 1,
      parent_hypothesis_id TEXT REFERENCES hypotheses(hypothesis_id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

	// Create factors table
	await client.run(`
    CREATE TABLE IF NOT EXISTS factors (
      factor_id TEXT PRIMARY KEY,
      hypothesis_id TEXT REFERENCES hypotheses(hypothesis_id),
      name TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'research' CHECK (status IN ('research', 'validating', 'active', 'decaying', 'retired')),
      version INTEGER NOT NULL DEFAULT 1,
      author TEXT NOT NULL,
      python_module TEXT,
      typescript_module TEXT,
      symbolic_length INTEGER,
      parameter_count INTEGER,
      feature_count INTEGER,
      originality_score REAL CHECK (originality_score BETWEEN 0 AND 1),
      hypothesis_alignment REAL CHECK (hypothesis_alignment BETWEEN 0 AND 1),
      stage1_sharpe REAL,
      stage1_ic REAL,
      stage1_max_drawdown REAL,
      stage1_completed_at TEXT,
      stage2_pbo REAL CHECK (stage2_pbo BETWEEN 0 AND 1),
      stage2_dsr_pvalue REAL CHECK (stage2_dsr_pvalue BETWEEN 0 AND 1),
      stage2_wfe REAL,
      stage2_completed_at TEXT,
      paper_validation_passed INTEGER NOT NULL DEFAULT 0 CHECK (paper_validation_passed IN (0, 1)),
      paper_start_date TEXT,
      paper_end_date TEXT,
      paper_realized_sharpe REAL,
      paper_realized_ic REAL,
      current_weight REAL NOT NULL DEFAULT 0,
      last_ic REAL,
      decay_rate REAL,
      target_regimes TEXT,
      parity_report TEXT,
      parity_validated_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      promoted_at TEXT,
      retired_at TEXT,
      last_updated TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

	// Create factor_performance table
	await client.run(`
    CREATE TABLE IF NOT EXISTS factor_performance (
      id TEXT PRIMARY KEY,
      factor_id TEXT NOT NULL REFERENCES factors(factor_id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      ic REAL NOT NULL,
      icir REAL,
      sharpe REAL,
      weight REAL NOT NULL DEFAULT 0,
      signal_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(factor_id, date)
    )
  `);

	// Create factor_correlations table
	await client.run(`
    CREATE TABLE IF NOT EXISTS factor_correlations (
      factor_id_1 TEXT NOT NULL REFERENCES factors(factor_id) ON DELETE CASCADE,
      factor_id_2 TEXT NOT NULL REFERENCES factors(factor_id) ON DELETE CASCADE,
      correlation REAL NOT NULL CHECK (correlation BETWEEN -1 AND 1),
      computed_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (factor_id_1, factor_id_2),
      CHECK (factor_id_1 < factor_id_2)
    )
  `);

	// Create research_runs table
	await client.run(`
    CREATE TABLE IF NOT EXISTS research_runs (
      run_id TEXT PRIMARY KEY,
      trigger_type TEXT NOT NULL CHECK (trigger_type IN ('scheduled', 'decay_detected', 'regime_change', 'manual', 'refinement')),
      trigger_reason TEXT NOT NULL,
      phase TEXT NOT NULL DEFAULT 'idea' CHECK (phase IN ('idea', 'implementation', 'stage1', 'stage2', 'translation', 'equivalence', 'paper', 'promotion', 'completed', 'failed')),
      current_iteration INTEGER NOT NULL DEFAULT 1,
      hypothesis_id TEXT REFERENCES hypotheses(hypothesis_id),
      factor_id TEXT REFERENCES factors(factor_id),
      pr_url TEXT,
      error_message TEXT,
      tokens_used INTEGER NOT NULL DEFAULT 0,
      compute_hours REAL NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    )
  `);
}

describe("FactorZooRepository", () => {
	let client: TursoClient;
	let repo: FactorZooRepository;

	beforeEach(async () => {
		client = await createInMemoryClient();
		await setupTables(client);
		repo = new FactorZooRepository(client);
	});

	afterEach(() => {
		client.close();
	});

	// ========================================
	// Hypothesis CRUD
	// ========================================

	describe("Hypothesis CRUD", () => {
		test("creates a hypothesis", async () => {
			const id = testId("hyp");
			const input: NewHypothesis = {
				hypothesisId: id,
				title: "Momentum Persistence",
				economicRationale: "Winners tend to keep winning in the short term",
				marketMechanism: "Investor underreaction to new information",
				targetRegime: "bull",
				falsificationCriteria: {
					conditions: ["IC < 0.02 for 30 days"],
					thresholds: { ic: 0.02 },
					timeHorizon: "30 days",
				},
				status: "proposed",
				iteration: 1,
				parentHypothesisId: null,
			};

			const result = await repo.createHypothesis(input);

			expect(result.hypothesisId).toBe(id);
			expect(result.title).toBe("Momentum Persistence");
			expect(result.economicRationale).toBe("Winners tend to keep winning in the short term");
			expect(result.marketMechanism).toBe("Investor underreaction to new information");
			expect(result.targetRegime).toBe("bull");
			expect(result.falsificationCriteria?.conditions).toEqual(["IC < 0.02 for 30 days"]);
			expect(result.status).toBe("proposed");
			expect(result.iteration).toBe(1);
			expect(result.parentHypothesisId).toBeNull();
		});

		test("creates hypothesis with minimal input", async () => {
			const result = await repo.createHypothesis({
				title: "Test Hypothesis",
				economicRationale: "Test rationale",
				marketMechanism: "Test mechanism",
				targetRegime: null,
				falsificationCriteria: null,
				status: "proposed",
				iteration: 1,
				parentHypothesisId: null,
			});

			expect(result.title).toBe("Test Hypothesis");
			expect(result.targetRegime).toBeNull();
			expect(result.falsificationCriteria).toBeNull();
		});

		test("finds hypothesis by ID", async () => {
			const created = await repo.createHypothesis({
				title: "Find Test",
				economicRationale: "Test",
				marketMechanism: "Test",
				targetRegime: "bear",
				falsificationCriteria: null,
				status: "validating",
				iteration: 1,
				parentHypothesisId: null,
			});

			const found = await repo.findHypothesisById(created.hypothesisId);
			expect(found).not.toBeNull();
			expect(found!.title).toBe("Find Test");
			expect(found!.targetRegime).toBe("bear");
		});

		test("returns null for non-existent hypothesis", async () => {
			const found = await repo.findHypothesisById("nonexistent");
			expect(found).toBeNull();
		});

		test("updates hypothesis status", async () => {
			const created = await repo.createHypothesis({
				title: "Status Update Test",
				economicRationale: "Test",
				marketMechanism: "Test",
				targetRegime: null,
				falsificationCriteria: null,
				status: "proposed",
				iteration: 1,
				parentHypothesisId: null,
			});

			await repo.updateHypothesisStatus(created.hypothesisId, "validated");

			const found = await repo.findHypothesisById(created.hypothesisId);
			expect(found!.status).toBe("validated");
		});

		test("finds hypotheses by status", async () => {
			await repo.createHypothesis({
				title: "Proposed 1",
				economicRationale: "Test",
				marketMechanism: "Test",
				targetRegime: null,
				falsificationCriteria: null,
				status: "proposed",
				iteration: 1,
				parentHypothesisId: null,
			});
			await repo.createHypothesis({
				title: "Proposed 2",
				economicRationale: "Test",
				marketMechanism: "Test",
				targetRegime: null,
				falsificationCriteria: null,
				status: "proposed",
				iteration: 1,
				parentHypothesisId: null,
			});
			await repo.createHypothesis({
				title: "Validated 1",
				economicRationale: "Test",
				marketMechanism: "Test",
				targetRegime: null,
				falsificationCriteria: null,
				status: "validated",
				iteration: 1,
				parentHypothesisId: null,
			});

			const proposed = await repo.findHypothesesByStatus("proposed");
			expect(proposed).toHaveLength(2);

			const validated = await repo.findHypothesesByStatus("validated");
			expect(validated).toHaveLength(1);
		});

		test("creates hypothesis with parent", async () => {
			const parent = await repo.createHypothesis({
				title: "Parent Hypothesis",
				economicRationale: "Original rationale",
				marketMechanism: "Original mechanism",
				targetRegime: "all",
				falsificationCriteria: null,
				status: "rejected",
				iteration: 1,
				parentHypothesisId: null,
			});

			const child = await repo.createHypothesis({
				title: "Child Hypothesis",
				economicRationale: "Refined rationale",
				marketMechanism: "Refined mechanism",
				targetRegime: "bull",
				falsificationCriteria: null,
				status: "proposed",
				iteration: 2,
				parentHypothesisId: parent.hypothesisId,
			});

			expect(child.parentHypothesisId).toBe(parent.hypothesisId);
			expect(child.iteration).toBe(2);
		});
	});

	// ========================================
	// Factor CRUD
	// ========================================

	describe("Factor CRUD", () => {
		test("creates a factor", async () => {
			const id = testId("fac");
			const input: NewFactor = {
				factorId: id,
				hypothesisId: null,
				name: "MomentumAlpha_v1",
				status: "research",
				version: 1,
				author: "researcher-1",
				pythonModule: "factors.momentum_alpha",
				typescriptModule: null,
				symbolicLength: 15,
				parameterCount: 3,
				featureCount: 5,
				originalityScore: 0.85,
				hypothesisAlignment: 0.9,
				stage1Sharpe: null,
				stage1Ic: null,
				stage1MaxDrawdown: null,
				stage1CompletedAt: null,
				stage2Pbo: null,
				stage2DsrPvalue: null,
				stage2Wfe: null,
				stage2CompletedAt: null,
				paperValidationPassed: false,
				paperStartDate: null,
				paperEndDate: null,
				paperRealizedSharpe: null,
				paperRealizedIc: null,
				currentWeight: 0,
				lastIc: null,
				decayRate: null,
				promotedAt: null,
				retiredAt: null,
			};

			const result = await repo.createFactor(input);

			expect(result.factorId).toBe(id);
			expect(result.name).toBe("MomentumAlpha_v1");
			expect(result.status).toBe("research");
			expect(result.author).toBe("researcher-1");
			expect(result.pythonModule).toBe("factors.momentum_alpha");
			expect(result.symbolicLength).toBe(15);
			expect(result.originalityScore).toBe(0.85);
		});

		test("creates factor with minimal input", async () => {
			const result = await repo.createFactor({
				hypothesisId: null,
				name: "MinimalFactor",
				status: "research",
				version: 1,
				author: "test",
				pythonModule: null,
				typescriptModule: null,
				symbolicLength: null,
				parameterCount: null,
				featureCount: null,
				originalityScore: null,
				hypothesisAlignment: null,
				stage1Sharpe: null,
				stage1Ic: null,
				stage1MaxDrawdown: null,
				stage1CompletedAt: null,
				stage2Pbo: null,
				stage2DsrPvalue: null,
				stage2Wfe: null,
				stage2CompletedAt: null,
				paperValidationPassed: false,
				paperStartDate: null,
				paperEndDate: null,
				paperRealizedSharpe: null,
				paperRealizedIc: null,
				currentWeight: 0,
				lastIc: null,
				decayRate: null,
				promotedAt: null,
				retiredAt: null,
			});

			expect(result.name).toBe("MinimalFactor");
			expect(result.pythonModule).toBeNull();
		});

		test("finds factor by ID", async () => {
			const created = await repo.createFactor({
				hypothesisId: null,
				name: "FindFactor",
				status: "research",
				version: 1,
				author: "test",
				pythonModule: null,
				typescriptModule: null,
				symbolicLength: null,
				parameterCount: null,
				featureCount: null,
				originalityScore: null,
				hypothesisAlignment: null,
				stage1Sharpe: null,
				stage1Ic: null,
				stage1MaxDrawdown: null,
				stage1CompletedAt: null,
				stage2Pbo: null,
				stage2DsrPvalue: null,
				stage2Wfe: null,
				stage2CompletedAt: null,
				paperValidationPassed: false,
				paperStartDate: null,
				paperEndDate: null,
				paperRealizedSharpe: null,
				paperRealizedIc: null,
				currentWeight: 0,
				lastIc: null,
				decayRate: null,
				promotedAt: null,
				retiredAt: null,
			});

			const found = await repo.findFactorById(created.factorId);
			expect(found).not.toBeNull();
			expect(found!.name).toBe("FindFactor");
		});

		test("returns null for non-existent factor", async () => {
			const found = await repo.findFactorById("nonexistent");
			expect(found).toBeNull();
		});

		test("finds factors by status", async () => {
			await repo.createFactor({
				hypothesisId: null,
				name: "Research1",
				status: "research",
				version: 1,
				author: "test",
				pythonModule: null,
				typescriptModule: null,
				symbolicLength: null,
				parameterCount: null,
				featureCount: null,
				originalityScore: null,
				hypothesisAlignment: null,
				stage1Sharpe: null,
				stage1Ic: null,
				stage1MaxDrawdown: null,
				stage1CompletedAt: null,
				stage2Pbo: null,
				stage2DsrPvalue: null,
				stage2Wfe: null,
				stage2CompletedAt: null,
				paperValidationPassed: false,
				paperStartDate: null,
				paperEndDate: null,
				paperRealizedSharpe: null,
				paperRealizedIc: null,
				currentWeight: 0,
				lastIc: null,
				decayRate: null,
				promotedAt: null,
				retiredAt: null,
			});
			await repo.createFactor({
				hypothesisId: null,
				name: "Active1",
				status: "active",
				version: 1,
				author: "test",
				pythonModule: null,
				typescriptModule: null,
				symbolicLength: null,
				parameterCount: null,
				featureCount: null,
				originalityScore: null,
				hypothesisAlignment: null,
				stage1Sharpe: null,
				stage1Ic: null,
				stage1MaxDrawdown: null,
				stage1CompletedAt: null,
				stage2Pbo: null,
				stage2DsrPvalue: null,
				stage2Wfe: null,
				stage2CompletedAt: null,
				paperValidationPassed: false,
				paperStartDate: null,
				paperEndDate: null,
				paperRealizedSharpe: null,
				paperRealizedIc: null,
				currentWeight: 0.5,
				lastIc: 0.08,
				decayRate: null,
				promotedAt: null,
				retiredAt: null,
			});

			const research = await repo.findFactorsByStatus("research");
			expect(research).toHaveLength(1);
			expect(research[0]!.name).toBe("Research1");

			const active = await repo.findFactorsByStatus("active");
			expect(active).toHaveLength(1);
			expect(active[0]!.name).toBe("Active1");
		});

		test("finds active factors", async () => {
			await repo.createFactor({
				hypothesisId: null,
				name: "Decaying1",
				status: "decaying",
				version: 1,
				author: "test",
				pythonModule: null,
				typescriptModule: null,
				symbolicLength: null,
				parameterCount: null,
				featureCount: null,
				originalityScore: null,
				hypothesisAlignment: null,
				stage1Sharpe: null,
				stage1Ic: null,
				stage1MaxDrawdown: null,
				stage1CompletedAt: null,
				stage2Pbo: null,
				stage2DsrPvalue: null,
				stage2Wfe: null,
				stage2CompletedAt: null,
				paperValidationPassed: false,
				paperStartDate: null,
				paperEndDate: null,
				paperRealizedSharpe: null,
				paperRealizedIc: null,
				currentWeight: 0.2,
				lastIc: 0.03,
				decayRate: 0.1,
				promotedAt: null,
				retiredAt: null,
			});
			await repo.createFactor({
				hypothesisId: null,
				name: "Active2",
				status: "active",
				version: 1,
				author: "test",
				pythonModule: null,
				typescriptModule: null,
				symbolicLength: null,
				parameterCount: null,
				featureCount: null,
				originalityScore: null,
				hypothesisAlignment: null,
				stage1Sharpe: null,
				stage1Ic: null,
				stage1MaxDrawdown: null,
				stage1CompletedAt: null,
				stage2Pbo: null,
				stage2DsrPvalue: null,
				stage2Wfe: null,
				stage2CompletedAt: null,
				paperValidationPassed: false,
				paperStartDate: null,
				paperEndDate: null,
				paperRealizedSharpe: null,
				paperRealizedIc: null,
				currentWeight: 0.5,
				lastIc: 0.08,
				decayRate: null,
				promotedAt: null,
				retiredAt: null,
			});

			const active = await repo.findActiveFactors();
			expect(active).toHaveLength(1);
			expect(active[0]!.name).toBe("Active2");
		});

		test("finds decaying factors", async () => {
			await repo.createFactor({
				hypothesisId: null,
				name: "Decaying2",
				status: "decaying",
				version: 1,
				author: "test",
				pythonModule: null,
				typescriptModule: null,
				symbolicLength: null,
				parameterCount: null,
				featureCount: null,
				originalityScore: null,
				hypothesisAlignment: null,
				stage1Sharpe: null,
				stage1Ic: null,
				stage1MaxDrawdown: null,
				stage1CompletedAt: null,
				stage2Pbo: null,
				stage2DsrPvalue: null,
				stage2Wfe: null,
				stage2CompletedAt: null,
				paperValidationPassed: false,
				paperStartDate: null,
				paperEndDate: null,
				paperRealizedSharpe: null,
				paperRealizedIc: null,
				currentWeight: 0.1,
				lastIc: 0.02,
				decayRate: 0.15,
				promotedAt: null,
				retiredAt: null,
			});

			const decaying = await repo.findDecayingFactors();
			expect(decaying).toHaveLength(1);
			expect(decaying[0]!.decayRate).toBe(0.15);
		});
	});

	// ========================================
	// Factor Status Transitions
	// ========================================

	describe("Factor Status Transitions", () => {
		async function createTestFactor(name: string): Promise<string> {
			const factor = await repo.createFactor({
				hypothesisId: null,
				name,
				status: "research",
				version: 1,
				author: "test",
				pythonModule: null,
				typescriptModule: null,
				symbolicLength: null,
				parameterCount: null,
				featureCount: null,
				originalityScore: null,
				hypothesisAlignment: null,
				stage1Sharpe: null,
				stage1Ic: null,
				stage1MaxDrawdown: null,
				stage1CompletedAt: null,
				stage2Pbo: null,
				stage2DsrPvalue: null,
				stage2Wfe: null,
				stage2CompletedAt: null,
				paperValidationPassed: false,
				paperStartDate: null,
				paperEndDate: null,
				paperRealizedSharpe: null,
				paperRealizedIc: null,
				currentWeight: 0,
				lastIc: null,
				decayRate: null,
				promotedAt: null,
				retiredAt: null,
			});
			return factor.factorId;
		}

		test("promotes factor to active", async () => {
			const id = await createTestFactor("PromoteTest");

			await repo.promote(id);

			const factor = await repo.findFactorById(id);
			expect(factor!.status).toBe("active");
			expect(factor!.promotedAt).not.toBeNull();
		});

		test("marks factor as decaying", async () => {
			const id = await createTestFactor("DecayTest");

			await repo.markDecaying(id, 0.05);

			const factor = await repo.findFactorById(id);
			expect(factor!.status).toBe("decaying");
			expect(factor!.decayRate).toBe(0.05);
		});

		test("retires factor", async () => {
			const id = await createTestFactor("RetireTest");

			await repo.retire(id);

			const factor = await repo.findFactorById(id);
			expect(factor!.status).toBe("retired");
			expect(factor!.retiredAt).not.toBeNull();
		});
	});

	// ========================================
	// Performance Tracking
	// ========================================

	describe("Performance Tracking", () => {
		let factorId: string;

		beforeEach(async () => {
			const factor = await repo.createFactor({
				hypothesisId: null,
				name: `PerfTest-${testId("f")}`,
				status: "active",
				version: 1,
				author: "test",
				pythonModule: null,
				typescriptModule: null,
				symbolicLength: null,
				parameterCount: null,
				featureCount: null,
				originalityScore: null,
				hypothesisAlignment: null,
				stage1Sharpe: null,
				stage1Ic: null,
				stage1MaxDrawdown: null,
				stage1CompletedAt: null,
				stage2Pbo: null,
				stage2DsrPvalue: null,
				stage2Wfe: null,
				stage2CompletedAt: null,
				paperValidationPassed: false,
				paperStartDate: null,
				paperEndDate: null,
				paperRealizedSharpe: null,
				paperRealizedIc: null,
				currentWeight: 0.5,
				lastIc: null,
				decayRate: null,
				promotedAt: null,
				retiredAt: null,
			});
			factorId = factor.factorId;
		});

		test("records daily performance", async () => {
			const metrics: DailyMetrics = {
				date: "2024-01-15",
				ic: 0.08,
				icir: 2.5,
				sharpe: 1.5,
				weight: 0.5,
				signalCount: 100,
			};

			await repo.recordDailyPerformance(factorId, metrics);

			const history = await repo.getPerformanceHistory(factorId, 30);
			expect(history).toHaveLength(1);
			expect(history[0]!.ic).toBe(0.08);
			expect(history[0]!.icir).toBe(2.5);
			expect(history[0]!.sharpe).toBe(1.5);
			expect(history[0]!.signalCount).toBe(100);
		});

		test("updates factor lastIc on performance record", async () => {
			await repo.recordDailyPerformance(factorId, {
				date: "2024-01-15",
				ic: 0.09,
				weight: 0,
				signalCount: 0,
			});

			const factor = await repo.findFactorById(factorId);
			expect(factor!.lastIc).toBe(0.09);
		});

		test("upserts performance on same date", async () => {
			await repo.recordDailyPerformance(factorId, {
				date: "2024-01-15",
				ic: 0.05,
				weight: 0,
				signalCount: 0,
			});

			await repo.recordDailyPerformance(factorId, {
				date: "2024-01-15",
				ic: 0.08,
				weight: 0,
				signalCount: 0,
			});

			const history = await repo.getPerformanceHistory(factorId, 30);
			expect(history).toHaveLength(1);
			expect(history[0]!.ic).toBe(0.08);
		});

		test("gets performance history ordered by date", async () => {
			await repo.recordDailyPerformance(factorId, {
				date: "2024-01-13",
				ic: 0.06,
				weight: 0,
				signalCount: 0,
			});
			await repo.recordDailyPerformance(factorId, {
				date: "2024-01-15",
				ic: 0.08,
				weight: 0,
				signalCount: 0,
			});
			await repo.recordDailyPerformance(factorId, {
				date: "2024-01-14",
				ic: 0.07,
				weight: 0,
				signalCount: 0,
			});

			const history = await repo.getPerformanceHistory(factorId, 30);
			expect(history).toHaveLength(3);
			expect(history[0]!.date).toBe("2024-01-15");
			expect(history[1]!.date).toBe("2024-01-14");
			expect(history[2]!.date).toBe("2024-01-13");
		});

		test("limits history by days parameter", async () => {
			await repo.recordDailyPerformance(factorId, {
				date: "2024-01-13",
				ic: 0.06,
				weight: 0,
				signalCount: 0,
			});
			await repo.recordDailyPerformance(factorId, {
				date: "2024-01-14",
				ic: 0.07,
				weight: 0,
				signalCount: 0,
			});
			await repo.recordDailyPerformance(factorId, {
				date: "2024-01-15",
				ic: 0.08,
				weight: 0,
				signalCount: 0,
			});

			const history = await repo.getPerformanceHistory(factorId, 2);
			expect(history).toHaveLength(2);
		});
	});

	// ========================================
	// Correlation Tracking
	// ========================================

	describe("Correlation Tracking", () => {
		let factor1Id: string;
		let factor2Id: string;
		let factor3Id: string;

		beforeEach(async () => {
			const f1 = await repo.createFactor({
				hypothesisId: null,
				name: `Corr1-${testId("f")}`,
				status: "active",
				version: 1,
				author: "test",
				pythonModule: null,
				typescriptModule: null,
				symbolicLength: null,
				parameterCount: null,
				featureCount: null,
				originalityScore: null,
				hypothesisAlignment: null,
				stage1Sharpe: null,
				stage1Ic: null,
				stage1MaxDrawdown: null,
				stage1CompletedAt: null,
				stage2Pbo: null,
				stage2DsrPvalue: null,
				stage2Wfe: null,
				stage2CompletedAt: null,
				paperValidationPassed: false,
				paperStartDate: null,
				paperEndDate: null,
				paperRealizedSharpe: null,
				paperRealizedIc: null,
				currentWeight: 0.3,
				lastIc: 0.08,
				decayRate: null,
				promotedAt: null,
				retiredAt: null,
			});
			const f2 = await repo.createFactor({
				hypothesisId: null,
				name: `Corr2-${testId("f")}`,
				status: "active",
				version: 1,
				author: "test",
				pythonModule: null,
				typescriptModule: null,
				symbolicLength: null,
				parameterCount: null,
				featureCount: null,
				originalityScore: null,
				hypothesisAlignment: null,
				stage1Sharpe: null,
				stage1Ic: null,
				stage1MaxDrawdown: null,
				stage1CompletedAt: null,
				stage2Pbo: null,
				stage2DsrPvalue: null,
				stage2Wfe: null,
				stage2CompletedAt: null,
				paperValidationPassed: false,
				paperStartDate: null,
				paperEndDate: null,
				paperRealizedSharpe: null,
				paperRealizedIc: null,
				currentWeight: 0.4,
				lastIc: 0.09,
				decayRate: null,
				promotedAt: null,
				retiredAt: null,
			});
			const f3 = await repo.createFactor({
				hypothesisId: null,
				name: `Corr3-${testId("f")}`,
				status: "active",
				version: 1,
				author: "test",
				pythonModule: null,
				typescriptModule: null,
				symbolicLength: null,
				parameterCount: null,
				featureCount: null,
				originalityScore: null,
				hypothesisAlignment: null,
				stage1Sharpe: null,
				stage1Ic: null,
				stage1MaxDrawdown: null,
				stage1CompletedAt: null,
				stage2Pbo: null,
				stage2DsrPvalue: null,
				stage2Wfe: null,
				stage2CompletedAt: null,
				paperValidationPassed: false,
				paperStartDate: null,
				paperEndDate: null,
				paperRealizedSharpe: null,
				paperRealizedIc: null,
				currentWeight: 0.3,
				lastIc: 0.07,
				decayRate: null,
				promotedAt: null,
				retiredAt: null,
			});
			factor1Id = f1.factorId;
			factor2Id = f2.factorId;
			factor3Id = f3.factorId;
		});

		test("updates correlations", async () => {
			await repo.updateCorrelations([
				{ factorId1: factor1Id, factorId2: factor2Id, correlation: 0.3, computedAt: "2024-01-15" },
				{ factorId1: factor2Id, factorId2: factor3Id, correlation: 0.5, computedAt: "2024-01-15" },
			]);

			const matrix = await repo.getCorrelationMatrix();
			expect(matrix.size).toBe(3);
		});

		test("builds symmetric correlation matrix", async () => {
			await repo.updateCorrelations([
				{ factorId1: factor1Id, factorId2: factor2Id, correlation: 0.3, computedAt: "2024-01-15" },
			]);

			const matrix = await repo.getCorrelationMatrix();

			// Both directions should be present
			expect(matrix.get(factor1Id)?.get(factor2Id)).toBe(0.3);
			expect(matrix.get(factor2Id)?.get(factor1Id)).toBe(0.3);
		});

		test("upserts correlation for same factor pair", async () => {
			await repo.updateCorrelations([
				{ factorId1: factor1Id, factorId2: factor2Id, correlation: 0.3, computedAt: "2024-01-15" },
			]);

			await repo.updateCorrelations([
				{ factorId1: factor1Id, factorId2: factor2Id, correlation: 0.5, computedAt: "2024-01-16" },
			]);

			const matrix = await repo.getCorrelationMatrix();
			expect(matrix.get(factor1Id)?.get(factor2Id)).toBe(0.5);
		});
	});

	// ========================================
	// Weight Management
	// ========================================

	describe("Weight Management", () => {
		let factor1Id: string;
		let factor2Id: string;

		beforeEach(async () => {
			const f1 = await repo.createFactor({
				hypothesisId: null,
				name: `Weight1-${testId("f")}`,
				status: "active",
				version: 1,
				author: "test",
				pythonModule: null,
				typescriptModule: null,
				symbolicLength: null,
				parameterCount: null,
				featureCount: null,
				originalityScore: null,
				hypothesisAlignment: null,
				stage1Sharpe: null,
				stage1Ic: null,
				stage1MaxDrawdown: null,
				stage1CompletedAt: null,
				stage2Pbo: null,
				stage2DsrPvalue: null,
				stage2Wfe: null,
				stage2CompletedAt: null,
				paperValidationPassed: false,
				paperStartDate: null,
				paperEndDate: null,
				paperRealizedSharpe: null,
				paperRealizedIc: null,
				currentWeight: 0.3,
				lastIc: 0.08,
				decayRate: null,
				promotedAt: null,
				retiredAt: null,
			});
			const f2 = await repo.createFactor({
				hypothesisId: null,
				name: `Weight2-${testId("f")}`,
				status: "active",
				version: 1,
				author: "test",
				pythonModule: null,
				typescriptModule: null,
				symbolicLength: null,
				parameterCount: null,
				featureCount: null,
				originalityScore: null,
				hypothesisAlignment: null,
				stage1Sharpe: null,
				stage1Ic: null,
				stage1MaxDrawdown: null,
				stage1CompletedAt: null,
				stage2Pbo: null,
				stage2DsrPvalue: null,
				stage2Wfe: null,
				stage2CompletedAt: null,
				paperValidationPassed: false,
				paperStartDate: null,
				paperEndDate: null,
				paperRealizedSharpe: null,
				paperRealizedIc: null,
				currentWeight: 0.7,
				lastIc: 0.09,
				decayRate: null,
				promotedAt: null,
				retiredAt: null,
			});
			factor1Id = f1.factorId;
			factor2Id = f2.factorId;
		});

		test("gets active weights", async () => {
			const weights = await repo.getActiveWeights();

			expect(weights.size).toBe(2);
			expect(weights.get(factor1Id)).toBe(0.3);
			expect(weights.get(factor2Id)).toBe(0.7);
		});

		test("updates weights", async () => {
			const newWeights = new Map([
				[factor1Id, 0.5],
				[factor2Id, 0.5],
			]);

			await repo.updateWeights(newWeights);

			const weights = await repo.getActiveWeights();
			expect(weights.get(factor1Id)).toBe(0.5);
			expect(weights.get(factor2Id)).toBe(0.5);
		});
	});

	// ========================================
	// Research Runs
	// ========================================

	describe("Research Runs", () => {
		test("creates a research run", async () => {
			const id = testId("run");
			const input: NewResearchRun = {
				runId: id,
				triggerType: "scheduled",
				triggerReason: "Weekly research cycle",
				phase: "idea",
				currentIteration: 1,
				hypothesisId: null,
				factorId: null,
				prUrl: null,
				errorMessage: null,
				tokensUsed: 0,
				computeHours: 0,
				completedAt: null,
			};

			const result = await repo.createResearchRun(input);

			expect(result.runId).toBe(id);
			expect(result.triggerType).toBe("scheduled");
			expect(result.triggerReason).toBe("Weekly research cycle");
			expect(result.phase).toBe("idea");
			expect(result.currentIteration).toBe(1);
		});

		test("finds research run by ID", async () => {
			const created = await repo.createResearchRun({
				triggerType: "decay_detected",
				triggerReason: "Factor IC dropped below threshold",
				phase: "implementation",
				currentIteration: 2,
				hypothesisId: null,
				factorId: null,
				prUrl: null,
				errorMessage: null,
				tokensUsed: 5000,
				computeHours: 0.5,
				completedAt: null,
			});

			const found = await repo.findResearchRunById(created.runId);
			expect(found).not.toBeNull();
			expect(found!.triggerType).toBe("decay_detected");
		});

		test("updates research run", async () => {
			const run = await repo.createResearchRun({
				triggerType: "manual",
				triggerReason: "User initiated",
				phase: "idea",
				currentIteration: 1,
				hypothesisId: null,
				factorId: null,
				prUrl: null,
				errorMessage: null,
				tokensUsed: 0,
				computeHours: 0,
				completedAt: null,
			});

			await repo.updateResearchRun(run.runId, {
				phase: "stage1",
				currentIteration: 2,
				tokensUsed: 10000,
				computeHours: 1.5,
			});

			const updated = await repo.findResearchRunById(run.runId);
			expect(updated!.phase).toBe("stage1");
			expect(updated!.currentIteration).toBe(2);
			expect(updated!.tokensUsed).toBe(10000);
			expect(updated!.computeHours).toBe(1.5);
		});

		test("completes research run", async () => {
			const run = await repo.createResearchRun({
				triggerType: "scheduled",
				triggerReason: "Test",
				phase: "promotion",
				currentIteration: 1,
				hypothesisId: null,
				factorId: null,
				prUrl: "https://github.com/org/repo/pull/123",
				errorMessage: null,
				tokensUsed: 50000,
				computeHours: 5.0,
				completedAt: null,
			});

			const now = new Date().toISOString();
			await repo.updateResearchRun(run.runId, {
				phase: "completed",
				completedAt: now,
			});

			const completed = await repo.findResearchRunById(run.runId);
			expect(completed!.phase).toBe("completed");
			expect(completed!.completedAt).not.toBeNull();
		});

		test("finds active research runs", async () => {
			await repo.createResearchRun({
				triggerType: "scheduled",
				triggerReason: "Active run 1",
				phase: "stage1",
				currentIteration: 1,
				hypothesisId: null,
				factorId: null,
				prUrl: null,
				errorMessage: null,
				tokensUsed: 0,
				computeHours: 0,
				completedAt: null,
			});
			await repo.createResearchRun({
				triggerType: "scheduled",
				triggerReason: "Active run 2",
				phase: "stage2",
				currentIteration: 1,
				hypothesisId: null,
				factorId: null,
				prUrl: null,
				errorMessage: null,
				tokensUsed: 0,
				computeHours: 0,
				completedAt: null,
			});
			const completedRun = await repo.createResearchRun({
				triggerType: "scheduled",
				triggerReason: "Completed run",
				phase: "stage1",
				currentIteration: 1,
				hypothesisId: null,
				factorId: null,
				prUrl: null,
				errorMessage: null,
				tokensUsed: 0,
				computeHours: 0,
				completedAt: null,
			});
			await repo.updateResearchRun(completedRun.runId, { phase: "completed" });

			const active = await repo.findActiveResearchRuns();
			expect(active).toHaveLength(2);
		});

		test("finds last completed research run", async () => {
			// Create and complete first run
			const run1 = await repo.createResearchRun({
				triggerType: "scheduled",
				triggerReason: "First completed run",
				phase: "stage1",
				currentIteration: 1,
				hypothesisId: null,
				factorId: null,
				prUrl: null,
				errorMessage: null,
				tokensUsed: 1000,
				computeHours: 1.0,
				completedAt: null,
			});
			const completedAt1 = "2025-01-01T10:00:00.000Z";
			await repo.updateResearchRun(run1.runId, { phase: "completed", completedAt: completedAt1 });

			// Create and complete second run (more recent)
			const run2 = await repo.createResearchRun({
				triggerType: "manual",
				triggerReason: "Second completed run",
				phase: "stage2",
				currentIteration: 2,
				hypothesisId: null,
				factorId: null,
				prUrl: null,
				errorMessage: null,
				tokensUsed: 2000,
				computeHours: 2.0,
				completedAt: null,
			});
			const completedAt2 = "2025-01-02T15:00:00.000Z";
			await repo.updateResearchRun(run2.runId, { phase: "completed", completedAt: completedAt2 });

			// Create active run (should not be returned)
			await repo.createResearchRun({
				triggerType: "scheduled",
				triggerReason: "Active run",
				phase: "implementation",
				currentIteration: 1,
				hypothesisId: null,
				factorId: null,
				prUrl: null,
				errorMessage: null,
				tokensUsed: 0,
				computeHours: 0,
				completedAt: null,
			});

			const lastCompleted = await repo.findLastCompletedResearchRun();

			expect(lastCompleted).not.toBeNull();
			expect(lastCompleted!.runId).toBe(run2.runId);
			expect(lastCompleted!.completedAt).toBe(completedAt2);
		});

		test("returns null when no completed runs exist", async () => {
			// Create only active runs
			await repo.createResearchRun({
				triggerType: "scheduled",
				triggerReason: "Active run",
				phase: "implementation",
				currentIteration: 1,
				hypothesisId: null,
				factorId: null,
				prUrl: null,
				errorMessage: null,
				tokensUsed: 0,
				computeHours: 0,
				completedAt: null,
			});

			const lastCompleted = await repo.findLastCompletedResearchRun();
			expect(lastCompleted).toBeNull();
		});

		test("gets research budget status", async () => {
			// Create a research run in current month
			await repo.createResearchRun({
				triggerType: "scheduled",
				triggerReason: "Run 1",
				phase: "completed",
				currentIteration: 1,
				hypothesisId: null,
				factorId: null,
				prUrl: null,
				errorMessage: null,
				tokensUsed: 5000,
				computeHours: 2.5,
				completedAt: new Date().toISOString(),
			});
			await repo.createResearchRun({
				triggerType: "manual",
				triggerReason: "Run 2",
				phase: "stage1",
				currentIteration: 1,
				hypothesisId: null,
				factorId: null,
				prUrl: null,
				errorMessage: null,
				tokensUsed: 3000,
				computeHours: 1.5,
				completedAt: null,
			});

			const budget = await repo.getResearchBudgetStatus();

			expect(budget.tokensUsedThisMonth).toBe(8000);
			expect(budget.computeHoursThisMonth).toBe(4.0);
			expect(budget.runsThisMonth).toBe(2);
			expect(budget.isExhausted).toBe(false);
			expect(budget.maxMonthlyTokens).toBe(0); // default unlimited
			expect(budget.maxMonthlyComputeHours).toBe(0); // default unlimited
		});

		test("detects exhausted budget", async () => {
			await repo.createResearchRun({
				triggerType: "scheduled",
				triggerReason: "Run 1",
				phase: "completed",
				currentIteration: 1,
				hypothesisId: null,
				factorId: null,
				prUrl: null,
				errorMessage: null,
				tokensUsed: 10000,
				computeHours: 5.0,
				completedAt: new Date().toISOString(),
			});

			// Check with limits that would be exceeded
			const budget = await repo.getResearchBudgetStatus(5000, 2.0);

			expect(budget.isExhausted).toBe(true);
			expect(budget.maxMonthlyTokens).toBe(5000);
			expect(budget.maxMonthlyComputeHours).toBe(2.0);
		});
	});

	// ========================================
	// Statistics
	// ========================================

	describe("Statistics", () => {
		test("gets empty stats", async () => {
			const stats = await repo.getStats();

			expect(stats.totalFactors).toBe(0);
			expect(stats.activeFactors).toBe(0);
			expect(stats.decayingFactors).toBe(0);
			expect(stats.researchFactors).toBe(0);
			expect(stats.retiredFactors).toBe(0);
			expect(stats.averageIc).toBe(0);
			expect(stats.totalWeight).toBe(0);
		});

		test("gets populated stats", async () => {
			// Create hypotheses
			await repo.createHypothesis({
				title: "Validated Hyp",
				economicRationale: "Test",
				marketMechanism: "Test",
				targetRegime: null,
				falsificationCriteria: null,
				status: "validated",
				iteration: 1,
				parentHypothesisId: null,
			});
			await repo.createHypothesis({
				title: "Rejected Hyp",
				economicRationale: "Test",
				marketMechanism: "Test",
				targetRegime: null,
				falsificationCriteria: null,
				status: "rejected",
				iteration: 1,
				parentHypothesisId: null,
			});

			// Create factors
			await repo.createFactor({
				hypothesisId: null,
				name: "ActiveFactor1",
				status: "active",
				version: 1,
				author: "test",
				pythonModule: null,
				typescriptModule: null,
				symbolicLength: null,
				parameterCount: null,
				featureCount: null,
				originalityScore: null,
				hypothesisAlignment: null,
				stage1Sharpe: null,
				stage1Ic: null,
				stage1MaxDrawdown: null,
				stage1CompletedAt: null,
				stage2Pbo: null,
				stage2DsrPvalue: null,
				stage2Wfe: null,
				stage2CompletedAt: null,
				paperValidationPassed: false,
				paperStartDate: null,
				paperEndDate: null,
				paperRealizedSharpe: null,
				paperRealizedIc: null,
				currentWeight: 0.4,
				lastIc: 0.08,
				decayRate: null,
				promotedAt: null,
				retiredAt: null,
			});
			await repo.createFactor({
				hypothesisId: null,
				name: "ActiveFactor2",
				status: "active",
				version: 1,
				author: "test",
				pythonModule: null,
				typescriptModule: null,
				symbolicLength: null,
				parameterCount: null,
				featureCount: null,
				originalityScore: null,
				hypothesisAlignment: null,
				stage1Sharpe: null,
				stage1Ic: null,
				stage1MaxDrawdown: null,
				stage1CompletedAt: null,
				stage2Pbo: null,
				stage2DsrPvalue: null,
				stage2Wfe: null,
				stage2CompletedAt: null,
				paperValidationPassed: false,
				paperStartDate: null,
				paperEndDate: null,
				paperRealizedSharpe: null,
				paperRealizedIc: null,
				currentWeight: 0.6,
				lastIc: 0.1,
				decayRate: null,
				promotedAt: null,
				retiredAt: null,
			});
			await repo.createFactor({
				hypothesisId: null,
				name: "DecayingFactor1",
				status: "decaying",
				version: 1,
				author: "test",
				pythonModule: null,
				typescriptModule: null,
				symbolicLength: null,
				parameterCount: null,
				featureCount: null,
				originalityScore: null,
				hypothesisAlignment: null,
				stage1Sharpe: null,
				stage1Ic: null,
				stage1MaxDrawdown: null,
				stage1CompletedAt: null,
				stage2Pbo: null,
				stage2DsrPvalue: null,
				stage2Wfe: null,
				stage2CompletedAt: null,
				paperValidationPassed: false,
				paperStartDate: null,
				paperEndDate: null,
				paperRealizedSharpe: null,
				paperRealizedIc: null,
				currentWeight: 0.1,
				lastIc: 0.03,
				decayRate: 0.1,
				promotedAt: null,
				retiredAt: null,
			});
			await repo.createFactor({
				hypothesisId: null,
				name: "ResearchFactor1",
				status: "research",
				version: 1,
				author: "test",
				pythonModule: null,
				typescriptModule: null,
				symbolicLength: null,
				parameterCount: null,
				featureCount: null,
				originalityScore: null,
				hypothesisAlignment: null,
				stage1Sharpe: null,
				stage1Ic: null,
				stage1MaxDrawdown: null,
				stage1CompletedAt: null,
				stage2Pbo: null,
				stage2DsrPvalue: null,
				stage2Wfe: null,
				stage2CompletedAt: null,
				paperValidationPassed: false,
				paperStartDate: null,
				paperEndDate: null,
				paperRealizedSharpe: null,
				paperRealizedIc: null,
				currentWeight: 0,
				lastIc: null,
				decayRate: null,
				promotedAt: null,
				retiredAt: null,
			});

			const stats = await repo.getStats();

			expect(stats.totalFactors).toBe(4);
			expect(stats.activeFactors).toBe(2);
			expect(stats.decayingFactors).toBe(1);
			expect(stats.researchFactors).toBe(1);
			expect(stats.retiredFactors).toBe(0);
			expect(stats.averageIc).toBeCloseTo(0.09, 2); // (0.08 + 0.1) / 2
			expect(stats.totalWeight).toBeCloseTo(1.0, 2); // 0.4 + 0.6
			expect(stats.hypothesesValidated).toBe(1);
			expect(stats.hypothesesRejected).toBe(1);
		});
	});
});
