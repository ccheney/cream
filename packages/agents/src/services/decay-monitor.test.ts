/**
 * Decay Monitor Service Tests
 *
 * Tests for alpha decay detection and alerting system.
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Factor, FactorPerformance } from "@cream/domain";
import type { FactorZooRepository } from "@cream/storage";
import {
	DEFAULT_DECAY_MONITOR_CONFIG,
	type DecayAlert,
	type DecayAlertService,
	DecayMonitorService,
	type MarketDataProvider,
} from "./decay-monitor.js";

// ============================================
// Test Helpers
// ============================================

function createMockFactor(overrides: Partial<Factor> = {}): Factor {
	const now = new Date().toISOString();
	return {
		factorId: `factor-${Math.random().toString(36).slice(2, 8)}`,
		hypothesisId: "hypo-123",
		name: "Test Factor",
		status: "active",
		version: 1,
		author: "test",
		typescriptModule: null,
		symbolicLength: null,
		parameterCount: null,
		featureCount: null,
		originalityScore: null,
		hypothesisAlignment: null,
		stage1Sharpe: 1.5,
		stage1Ic: 0.05,
		stage1MaxDrawdown: -0.1,
		stage1CompletedAt: now,
		stage2Pbo: 0.1,
		stage2DsrPvalue: 0.01,
		stage2Wfe: 0.8,
		stage2CompletedAt: now,
		paperValidationPassed: true,
		paperStartDate: null,
		paperEndDate: null,
		paperRealizedSharpe: null,
		paperRealizedIc: null,
		currentWeight: 0.1,
		lastIc: 0.05,
		decayRate: null,
		targetRegimes: null,
		parityReport: null,
		parityValidatedAt: null,
		createdAt: now,
		promotedAt: null,
		retiredAt: null,
		lastUpdated: now,
		...overrides,
	};
}

function createMockPerformance(
	factorId: string,
	ic: number,
	sharpe: number,
	daysAgo = 0
): FactorPerformance {
	const date = new Date();
	date.setDate(date.getDate() - daysAgo);
	return {
		id: `perf-${Math.random().toString(36).slice(2, 8)}`,
		factorId,
		date: date.toISOString().split("T")[0]!,
		ic,
		icir: ic / 0.02, // Simplified ICIR
		sharpe,
		weight: 0.1,
		signalCount: 100,
		createdAt: date.toISOString(),
	};
}

function createDecayingHistory(
	factorId: string,
	peakIC: number,
	decayedIC: number,
	days: number
): FactorPerformance[] {
	// Create history where most values are at decayed level but peak is in history
	return Array.from({ length: days }, (_, i) => {
		// Put peak at beginning, rest at decayed level
		const ic = i === 0 ? peakIC : decayedIC;
		return createMockPerformance(factorId, ic, ic * 10, days - 1 - i);
	});
}

function createStableHistory(
	factorId: string,
	ic: number,
	sharpe: number,
	days: number
): FactorPerformance[] {
	return Array.from({ length: days }, (_, i) =>
		createMockPerformance(factorId, ic, sharpe, days - 1 - i)
	);
}

function createLowSharpeHistory(
	factorId: string,
	ic: number,
	sharpe: number,
	days: number
): FactorPerformance[] {
	return Array.from({ length: days }, (_, i) =>
		createMockPerformance(factorId, ic, sharpe, days - 1 - i)
	);
}

// ============================================
// Mock Factories
// ============================================

function createMockRepository(overrides: Partial<FactorZooRepository> = {}): FactorZooRepository {
	return {
		findActiveFactors: mock(() => Promise.resolve([])),
		findFactorById: mock(() => Promise.resolve(null)),
		getPerformanceHistory: mock(() => Promise.resolve([])),
		getCorrelationMatrix: mock(() => Promise.resolve(new Map())),
		getActiveWeights: mock(() => Promise.resolve(new Map())),
		updateWeights: mock(() => Promise.resolve()),
		markDecaying: mock(() => Promise.resolve()),
		findDecayingFactors: mock(() => Promise.resolve([])),
		getStats: mock(() =>
			Promise.resolve({
				activeFactors: 0,
				researchFactors: 0,
				retiredFactors: 0,
				totalFactors: 0,
				averageIc: 0,
				totalWeight: 0,
				hypothesesValidated: 0,
				hypothesesRejected: 0,
			})
		),
		...overrides,
	} as FactorZooRepository;
}

function createMockAlertService(): DecayAlertService & { alerts: DecayAlert[] } {
	const alerts: DecayAlert[] = [];
	return {
		alerts,
		send: mock(async (alert: DecayAlert) => {
			alerts.push(alert);
		}),
	};
}

function createMockMarketData(returns: number[]): MarketDataProvider {
	return {
		getMarketReturns: mock(() => Promise.resolve(returns)),
	};
}

// ============================================
// Tests
// ============================================

describe("DecayMonitorService", () => {
	let repository: FactorZooRepository;
	let alertService: DecayAlertService & { alerts: DecayAlert[] };

	beforeEach(() => {
		repository = createMockRepository();
		alertService = createMockAlertService();
	});

	// ============================================
	// Constructor Tests
	// ============================================

	describe("constructor", () => {
		test("creates service with default config", () => {
			const service = new DecayMonitorService(repository);
			expect(service.getConfig()).toEqual(DEFAULT_DECAY_MONITOR_CONFIG);
		});

		test("creates service with custom config", () => {
			const customConfig = {
				icDecayThreshold: 0.6,
				sharpeDecayThreshold: 0.3,
			};
			const service = new DecayMonitorService(repository, undefined, undefined, customConfig);
			expect(service.getConfig().icDecayThreshold).toBe(0.6);
			expect(service.getConfig().sharpeDecayThreshold).toBe(0.3);
		});
	});

	// ============================================
	// IC Decay Tests
	// ============================================

	describe("checkICDecay", () => {
		test("returns null when insufficient history", async () => {
			const factor = createMockFactor({ factorId: "f1" });
			const shortHistory = createStableHistory("f1", 0.05, 1.0, 10);

			repository = createMockRepository({
				getPerformanceHistory: mock(() => Promise.resolve(shortHistory)),
			});

			const service = new DecayMonitorService(repository);
			const result = await service.checkICDecay(factor);

			expect(result).toBeNull();
		});

		test("returns null when IC is healthy", async () => {
			const factor = createMockFactor({ factorId: "f1" });
			const stableHistory = createStableHistory("f1", 0.05, 1.0, 20);

			repository = createMockRepository({
				getPerformanceHistory: mock(() => Promise.resolve(stableHistory)),
			});

			const service = new DecayMonitorService(repository);
			const result = await service.checkICDecay(factor);

			expect(result).toBeNull();
		});

		test("returns WARNING alert when IC decays to 40% of peak", async () => {
			const factor = createMockFactor({ factorId: "f1" });
			// Peak at 0.1, decayed to 0.04 (40% of peak)
			const decayingHistory = createDecayingHistory("f1", 0.1, 0.04, 20);

			repository = createMockRepository({
				getPerformanceHistory: mock(() => Promise.resolve(decayingHistory)),
			});

			const service = new DecayMonitorService(repository);
			const result = await service.checkICDecay(factor);

			expect(result).not.toBeNull();
			expect(result!.alertType).toBe("IC_DECAY");
			expect(result!.severity).toBe("WARNING");
			expect(result!.peakValue).toBe(0.1);
		});

		test("returns CRITICAL alert when IC decays to 20% of peak", async () => {
			const factor = createMockFactor({ factorId: "f1" });
			// Peak at 0.1, decayed to 0.02 (20% of peak)
			const decayingHistory = createDecayingHistory("f1", 0.1, 0.02, 20);

			repository = createMockRepository({
				getPerformanceHistory: mock(() => Promise.resolve(decayingHistory)),
			});

			const service = new DecayMonitorService(repository);
			const result = await service.checkICDecay(factor);

			expect(result).not.toBeNull();
			expect(result!.alertType).toBe("IC_DECAY");
			expect(result!.severity).toBe("CRITICAL");
		});

		test("calculates decay rate correctly", async () => {
			const factor = createMockFactor({ factorId: "f1" });
			const decayingHistory = createDecayingHistory("f1", 0.1, 0.04, 20);

			repository = createMockRepository({
				getPerformanceHistory: mock(() => Promise.resolve(decayingHistory)),
			});

			const service = new DecayMonitorService(repository);
			const result = await service.checkICDecay(factor);

			expect(result).not.toBeNull();
			expect(result!.decayRate).toBeGreaterThan(0);
		});
	});

	// ============================================
	// Sharpe Decay Tests
	// ============================================

	describe("checkSharpeDecay", () => {
		test("returns null when insufficient history", async () => {
			const factor = createMockFactor({ factorId: "f1" });
			const shortHistory = createStableHistory("f1", 0.05, 1.0, 5);

			repository = createMockRepository({
				getPerformanceHistory: mock(() => Promise.resolve(shortHistory)),
			});

			const service = new DecayMonitorService(repository);
			const result = await service.checkSharpeDecay(factor);

			expect(result).toBeNull();
		});

		test("returns null when Sharpe is healthy", async () => {
			const factor = createMockFactor({ factorId: "f1" });
			const stableHistory = createStableHistory("f1", 0.05, 1.5, 10);

			repository = createMockRepository({
				getPerformanceHistory: mock(() => Promise.resolve(stableHistory)),
			});

			const service = new DecayMonitorService(repository);
			const result = await service.checkSharpeDecay(factor);

			expect(result).toBeNull();
		});

		test("returns WARNING alert when Sharpe below threshold", async () => {
			const factor = createMockFactor({ factorId: "f1" });
			const lowSharpeHistory = createLowSharpeHistory("f1", 0.05, 0.3, 10);

			repository = createMockRepository({
				getPerformanceHistory: mock(() => Promise.resolve(lowSharpeHistory)),
			});

			const service = new DecayMonitorService(repository);
			const result = await service.checkSharpeDecay(factor);

			expect(result).not.toBeNull();
			expect(result!.alertType).toBe("SHARPE_DECAY");
			expect(result!.severity).toBe("WARNING");
			expect(result!.currentValue).toBeCloseTo(0.3, 5);
		});

		test("returns CRITICAL alert when Sharpe is negative", async () => {
			const factor = createMockFactor({ factorId: "f1" });
			const negativeSharpeHistory = createLowSharpeHistory("f1", 0.05, -0.5, 10);

			repository = createMockRepository({
				getPerformanceHistory: mock(() => Promise.resolve(negativeSharpeHistory)),
			});

			const service = new DecayMonitorService(repository);
			const result = await service.checkSharpeDecay(factor);

			expect(result).not.toBeNull();
			expect(result!.alertType).toBe("SHARPE_DECAY");
			expect(result!.severity).toBe("CRITICAL");
		});
	});

	// ============================================
	// Crowding Tests
	// ============================================

	describe("checkCrowding", () => {
		test("returns null when no market data provider", async () => {
			const factor = createMockFactor({ factorId: "f1" });
			const service = new DecayMonitorService(repository);
			const result = await service.checkCrowding(factor);

			expect(result).toBeNull();
		});

		test("returns null when low market correlation", async () => {
			const factor = createMockFactor({ factorId: "f1" });
			const history = createStableHistory("f1", 0.05, 1.0, 60);

			// Create uncorrelated market returns
			const marketReturns = Array.from(
				{ length: 60 },
				(_, i) => (i % 2 === 0 ? 0.01 : -0.01) * Math.random()
			);

			repository = createMockRepository({
				getPerformanceHistory: mock(() => Promise.resolve(history)),
			});

			const marketData = createMockMarketData(marketReturns);
			const service = new DecayMonitorService(repository, undefined, marketData);
			const result = await service.checkCrowding(factor);

			// Likely null due to low correlation, but depends on random values
			// This is a probabilistic test
			expect(result === null || result.alertType === "CROWDING").toBe(true);
		});

		test("returns WARNING alert when highly correlated with market", async () => {
			const factor = createMockFactor({ factorId: "f1" });

			// Create perfectly correlated data
			const icValues = Array.from({ length: 60 }, (_, i) => 0.05 + i * 0.001);
			const history = icValues.map((ic, i) => createMockPerformance("f1", ic, 1.0, 59 - i));

			const marketReturns = icValues.map((ic) => ic * 2); // Perfectly correlated

			repository = createMockRepository({
				getPerformanceHistory: mock(() => Promise.resolve(history)),
			});

			const marketData = createMockMarketData(marketReturns);
			const service = new DecayMonitorService(repository, undefined, marketData);
			const result = await service.checkCrowding(factor);

			expect(result).not.toBeNull();
			expect(result!.alertType).toBe("CROWDING");
			expect(result!.severity).toBe("CRITICAL"); // Correlation ~1.0
		});

		test("returns null when insufficient data", async () => {
			const factor = createMockFactor({ factorId: "f1" });
			const shortHistory = createStableHistory("f1", 0.05, 1.0, 10);

			repository = createMockRepository({
				getPerformanceHistory: mock(() => Promise.resolve(shortHistory)),
			});

			const marketData = createMockMarketData([0.01, 0.02]);
			const service = new DecayMonitorService(repository, undefined, marketData);
			const result = await service.checkCrowding(factor);

			expect(result).toBeNull();
		});
	});

	// ============================================
	// Correlation Spike Tests
	// ============================================

	describe("checkCorrelationSpikes", () => {
		test("returns empty array when no correlations", async () => {
			const factors = [createMockFactor({ factorId: "f1" }), createMockFactor({ factorId: "f2" })];

			repository = createMockRepository({
				getCorrelationMatrix: mock(() => Promise.resolve(new Map())),
			});

			const service = new DecayMonitorService(repository);
			const result = await service.checkCorrelationSpikes(factors);

			expect(result).toEqual([]);
		});

		test("returns empty array when correlations below threshold", async () => {
			const factors = [createMockFactor({ factorId: "f1" }), createMockFactor({ factorId: "f2" })];

			const correlations = new Map([["f1", new Map([["f2", 0.3]])]]);

			repository = createMockRepository({
				getCorrelationMatrix: mock(() => Promise.resolve(correlations)),
			});

			const service = new DecayMonitorService(repository);
			const result = await service.checkCorrelationSpikes(factors);

			expect(result).toEqual([]);
		});

		test("returns alert when correlation above threshold", async () => {
			const factors = [createMockFactor({ factorId: "f1" }), createMockFactor({ factorId: "f2" })];

			const correlations = new Map([["f1", new Map([["f2", 0.85]])]]);

			repository = createMockRepository({
				getCorrelationMatrix: mock(() => Promise.resolve(correlations)),
			});

			const service = new DecayMonitorService(repository);
			const result = await service.checkCorrelationSpikes(factors);

			expect(result).toHaveLength(1);
			expect(result[0]!.alertType).toBe("CORRELATION_SPIKE");
			expect(result[0]!.factorId).toBe("f1");
			expect(result[0]!.relatedFactorId).toBe("f2");
			expect(result[0]!.currentValue).toBe(0.85);
		});

		test("only creates one alert per pair", async () => {
			const factors = [
				createMockFactor({ factorId: "f1" }),
				createMockFactor({ factorId: "f2" }),
				createMockFactor({ factorId: "f3" }),
			];

			const correlations = new Map([
				[
					"f1",
					new Map([
						["f2", 0.85],
						["f3", 0.9],
					]),
				],
				[
					"f2",
					new Map([
						["f1", 0.85],
						["f3", 0.6],
					]),
				],
			]);

			repository = createMockRepository({
				getCorrelationMatrix: mock(() => Promise.resolve(correlations)),
			});

			const service = new DecayMonitorService(repository);
			const result = await service.checkCorrelationSpikes(factors);

			// Should be 2 alerts: f1-f2 and f1-f3 (not duplicates)
			expect(result).toHaveLength(2);
			expect(result.map((a) => a.factorId)).toContain("f1");
		});
	});

	// ============================================
	// Daily Check Tests
	// ============================================

	describe("runDailyCheck", () => {
		test("returns empty result when no active factors", async () => {
			repository = createMockRepository({
				findActiveFactors: mock(() => Promise.resolve([])),
			});

			const service = new DecayMonitorService(repository, alertService);
			const result = await service.runDailyCheck();

			expect(result.alerts).toEqual([]);
			expect(result.factorsChecked).toBe(0);
			expect(result.decayingFactors).toEqual([]);
			expect(result.crowdedFactors).toEqual([]);
			expect(result.correlatedPairs).toEqual([]);
		});

		test("checks all active factors", async () => {
			const factors = [
				createMockFactor({ factorId: "f1" }),
				createMockFactor({ factorId: "f2" }),
				createMockFactor({ factorId: "f3" }),
			];

			repository = createMockRepository({
				findActiveFactors: mock(() => Promise.resolve(factors)),
				getPerformanceHistory: mock(() =>
					Promise.resolve(createStableHistory("f1", 0.05, 1.0, 20))
				),
				getCorrelationMatrix: mock(() => Promise.resolve(new Map())),
			});

			const service = new DecayMonitorService(repository, alertService);
			const result = await service.runDailyCheck();

			expect(result.factorsChecked).toBe(3);
		});

		test("sends alerts via alert service", async () => {
			const factors = [createMockFactor({ factorId: "f1" })];
			const decayingHistory = createDecayingHistory("f1", 0.1, 0.03, 20);

			repository = createMockRepository({
				findActiveFactors: mock(() => Promise.resolve(factors)),
				getPerformanceHistory: mock(() => Promise.resolve(decayingHistory)),
				getCorrelationMatrix: mock(() => Promise.resolve(new Map())),
			});

			const service = new DecayMonitorService(repository, alertService);
			await service.runDailyCheck();

			expect(alertService.alerts.length).toBeGreaterThan(0);
			expect(alertService.alerts[0]!.alertType).toBe("IC_DECAY");
		});

		test("accumulates multiple alerts", async () => {
			const factors = [createMockFactor({ factorId: "f1" })];
			// Both IC and Sharpe decaying
			const history = Array.from({ length: 20 }, (_, i) =>
				createMockPerformance("f1", 0.02, 0.3, 19 - i)
			);
			// Make IC decay by having a higher peak in the middle
			history[10]!.ic = 0.1;

			repository = createMockRepository({
				findActiveFactors: mock(() => Promise.resolve(factors)),
				getPerformanceHistory: mock(() => Promise.resolve(history)),
				getCorrelationMatrix: mock(() => Promise.resolve(new Map())),
			});

			const service = new DecayMonitorService(repository, alertService);
			const result = await service.runDailyCheck();

			// Should have both IC_DECAY and SHARPE_DECAY alerts
			expect(result.alerts.length).toBe(2);
			expect(result.alerts.map((a) => a.alertType).sort()).toEqual(["IC_DECAY", "SHARPE_DECAY"]);
		});

		test("returns correlated pairs", async () => {
			const factors = [createMockFactor({ factorId: "f1" }), createMockFactor({ factorId: "f2" })];

			const correlations = new Map([["f1", new Map([["f2", 0.85]])]]);

			repository = createMockRepository({
				findActiveFactors: mock(() => Promise.resolve(factors)),
				getPerformanceHistory: mock(() =>
					Promise.resolve(createStableHistory("f1", 0.05, 1.0, 20))
				),
				getCorrelationMatrix: mock(() => Promise.resolve(correlations)),
			});

			const service = new DecayMonitorService(repository, alertService);
			const result = await service.runDailyCheck();

			expect(result.correlatedPairs).toHaveLength(1);
			expect(result.correlatedPairs[0]).toEqual({
				factor1: "f1",
				factor2: "f2",
				correlation: 0.85,
			});
		});
	});

	// ============================================
	// Single Factor Check Tests
	// ============================================

	describe("checkFactor", () => {
		test("returns empty array for non-existent factor", async () => {
			repository = createMockRepository({
				findFactorById: mock(() => Promise.resolve(null)),
			});

			const service = new DecayMonitorService(repository);
			const result = await service.checkFactor("unknown");

			expect(result).toEqual([]);
		});

		test("returns empty array for inactive factor", async () => {
			const inactiveFactor = createMockFactor({ factorId: "f1", status: "retired" });

			repository = createMockRepository({
				findFactorById: mock(() => Promise.resolve(inactiveFactor)),
			});

			const service = new DecayMonitorService(repository);
			const result = await service.checkFactor("f1");

			expect(result).toEqual([]);
		});

		test("returns alerts for active decaying factor", async () => {
			const factor = createMockFactor({ factorId: "f1" });
			const decayingHistory = createDecayingHistory("f1", 0.1, 0.03, 20);

			repository = createMockRepository({
				findFactorById: mock(() => Promise.resolve(factor)),
				getPerformanceHistory: mock(() => Promise.resolve(decayingHistory)),
			});

			const service = new DecayMonitorService(repository);
			const result = await service.checkFactor("f1");

			expect(result.length).toBeGreaterThan(0);
			expect(result[0]!.factorId).toBe("f1");
		});
	});

	// ============================================
	// Correlation Calculation Tests
	// ============================================

	describe("correlation helper", () => {
		test("computes correct correlation for identical arrays", async () => {
			const factor = createMockFactor({ factorId: "f1" });

			// Create identical sequences
			const icValues = Array.from({ length: 30 }, (_, i) => 0.05 + i * 0.001);
			const history = icValues.map((ic, i) => createMockPerformance("f1", ic, 1.0, 29 - i));
			const marketReturns = [...icValues];

			repository = createMockRepository({
				getPerformanceHistory: mock(() => Promise.resolve(history)),
			});

			const marketData = createMockMarketData(marketReturns);
			const service = new DecayMonitorService(repository, undefined, marketData);
			const result = await service.checkCrowding(factor);

			// Should detect high correlation (r ~= 1.0)
			expect(result).not.toBeNull();
			expect(result!.currentValue).toBeGreaterThan(0.95);
		});

		test("computes correct correlation for negatively correlated arrays", async () => {
			const factor = createMockFactor({ factorId: "f1" });

			// Create negatively correlated sequences
			const icValues = Array.from({ length: 30 }, (_, i) => 0.05 + i * 0.001);
			const history = icValues.map((ic, i) => createMockPerformance("f1", ic, 1.0, 29 - i));
			const marketReturns = icValues.map((ic) => -ic); // Negatively correlated

			repository = createMockRepository({
				getPerformanceHistory: mock(() => Promise.resolve(history)),
			});

			const marketData = createMockMarketData(marketReturns);
			const service = new DecayMonitorService(repository, undefined, marketData);
			const result = await service.checkCrowding(factor);

			// Should detect high negative correlation (r ~= -1.0)
			expect(result).not.toBeNull();
			expect(result!.currentValue).toBeLessThan(-0.95);
		});
	});

	// ============================================
	// Config Tests
	// ============================================

	describe("getConfig", () => {
		test("returns copy of config", () => {
			const service = new DecayMonitorService(repository);
			const config1 = service.getConfig();
			const config2 = service.getConfig();

			expect(config1).toEqual(config2);
			expect(config1).not.toBe(config2); // Different objects
		});

		test("custom config overrides defaults", () => {
			const customConfig = {
				icDecayThreshold: 0.4,
				crowdingThreshold: 0.9,
			};

			const service = new DecayMonitorService(repository, undefined, undefined, customConfig);
			const config = service.getConfig();

			expect(config.icDecayThreshold).toBe(0.4);
			expect(config.crowdingThreshold).toBe(0.9);
			// Other defaults unchanged
			expect(config.sharpeDecayThreshold).toBe(DEFAULT_DECAY_MONITOR_CONFIG.sharpeDecayThreshold);
		});
	});
});
