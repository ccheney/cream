/**
 * Tests for Drawdown Metrics Calculation
 */

import { describe, expect, it } from "bun:test";
import {
	calculateDrawdown,
	calculateDrawdownStats,
	calculateRecoveryNeeded,
	checkDrawdownAlert,
	createEmptyDrawdownStats,
	DEFAULT_DRAWDOWN_ALERT_CONFIG,
	DRAWDOWN_THRESHOLDS,
	DrawdownStatsSchema,
	DrawdownTracker,
	type EquityPoint,
	formatDrawdownStats,
	getRiskLevel,
} from "./drawdown";

// ============================================
// Basic Calculation Tests
// ============================================

describe("calculateDrawdown", () => {
	it("should return 0 when current equals peak", () => {
		expect(calculateDrawdown(100000, 100000)).toBe(0);
	});

	it("should return 0 when current exceeds peak", () => {
		expect(calculateDrawdown(110000, 100000)).toBe(0);
	});

	it("should calculate 10% drawdown correctly", () => {
		const drawdown = calculateDrawdown(90000, 100000);
		expect(drawdown).toBeCloseTo(0.1, 5);
	});

	it("should calculate 50% drawdown correctly", () => {
		const drawdown = calculateDrawdown(50000, 100000);
		expect(drawdown).toBeCloseTo(0.5, 5);
	});

	it("should handle edge case of zero peak", () => {
		expect(calculateDrawdown(100, 0)).toBe(0);
	});

	it("should handle edge case of negative peak", () => {
		expect(calculateDrawdown(100, -100)).toBe(0);
	});
});

describe("calculateRecoveryNeeded", () => {
	it("should return 0 for no drawdown", () => {
		expect(calculateRecoveryNeeded(0)).toBe(0);
	});

	it("should return 100% for 50% drawdown", () => {
		// 50% drawdown requires 100% gain to recover
		const recovery = calculateRecoveryNeeded(0.5);
		expect(recovery).toBeCloseTo(1.0, 5);
	});

	it("should return ~11.1% for 10% drawdown", () => {
		// 10% drawdown requires ~11.1% gain to recover
		const recovery = calculateRecoveryNeeded(0.1);
		expect(recovery).toBeCloseTo(0.1111, 3);
	});

	it("should return ~25% for 20% drawdown", () => {
		// 20% drawdown requires 25% gain to recover
		const recovery = calculateRecoveryNeeded(0.2);
		expect(recovery).toBeCloseTo(0.25, 5);
	});

	it("should return infinity for 100% drawdown", () => {
		expect(calculateRecoveryNeeded(1)).toBe(Number.POSITIVE_INFINITY);
	});
});

describe("getRiskLevel", () => {
	it("should return optimal for < 5% drawdown", () => {
		expect(getRiskLevel(0.04)).toBe("optimal");
		expect(getRiskLevel(0)).toBe("optimal");
	});

	it("should return normal for 5-10% drawdown", () => {
		expect(getRiskLevel(0.05)).toBe("normal");
		expect(getRiskLevel(0.09)).toBe("normal");
	});

	it("should return elevated for 10-15% drawdown", () => {
		expect(getRiskLevel(0.1)).toBe("elevated");
		expect(getRiskLevel(0.14)).toBe("elevated");
	});

	it("should return high for 15-25% drawdown", () => {
		expect(getRiskLevel(0.15)).toBe("high");
		expect(getRiskLevel(0.24)).toBe("high");
	});

	it("should return critical for >= 25% drawdown", () => {
		expect(getRiskLevel(0.25)).toBe("critical");
		expect(getRiskLevel(0.5)).toBe("critical");
	});
});

// ============================================
// Equity Curve Analysis Tests
// ============================================

describe("calculateDrawdownStats", () => {
	it("should handle empty equity curve", () => {
		const stats = calculateDrawdownStats([]);
		expect(stats.currentDrawdown).toBe(0);
		expect(stats.maxDrawdown).toBe(0);
		expect(stats.riskLevel).toBe("optimal");
	});

	it("should handle single point equity curve", () => {
		const curve: EquityPoint[] = [{ timestamp: "2024-01-01T00:00:00Z", equity: 100000 }];
		const stats = calculateDrawdownStats(curve);
		expect(stats.currentDrawdown).toBe(0);
		expect(stats.maxDrawdown).toBe(0);
		expect(stats.peakEquity).toBe(100000);
	});

	it("should calculate drawdown from monotonically increasing curve", () => {
		const curve: EquityPoint[] = [
			{ timestamp: "2024-01-01T00:00:00Z", equity: 100000 },
			{ timestamp: "2024-01-02T00:00:00Z", equity: 105000 },
			{ timestamp: "2024-01-03T00:00:00Z", equity: 110000 },
		];
		const stats = calculateDrawdownStats(curve);
		expect(stats.currentDrawdown).toBe(0);
		expect(stats.maxDrawdown).toBe(0);
		expect(stats.peakEquity).toBe(110000);
	});

	it("should calculate drawdown correctly for declining curve", () => {
		const curve: EquityPoint[] = [
			{ timestamp: "2024-01-01T00:00:00Z", equity: 100000 },
			{ timestamp: "2024-01-02T00:00:00Z", equity: 95000 },
			{ timestamp: "2024-01-03T00:00:00Z", equity: 90000 },
		];
		const stats = calculateDrawdownStats(curve);
		expect(stats.currentDrawdown).toBeCloseTo(0.1, 5);
		expect(stats.maxDrawdown).toBeCloseTo(0.1, 5);
		expect(stats.drawdownDuration).toBe(2);
		expect(stats.peakEquity).toBe(100000);
		expect(stats.troughEquity).toBe(90000);
	});

	it("should track max drawdown through recovery", () => {
		const curve: EquityPoint[] = [
			{ timestamp: "2024-01-01T00:00:00Z", equity: 100000 },
			{ timestamp: "2024-01-02T00:00:00Z", equity: 80000 }, // 20% drawdown
			{ timestamp: "2024-01-03T00:00:00Z", equity: 85000 }, // partial recovery
			{ timestamp: "2024-01-04T00:00:00Z", equity: 110000 }, // full recovery + new high
		];
		const stats = calculateDrawdownStats(curve);
		expect(stats.currentDrawdown).toBe(0);
		expect(stats.maxDrawdown).toBeCloseTo(0.2, 5);
		expect(stats.peakEquity).toBe(110000);
	});

	it("should track multiple drawdowns and find maximum", () => {
		const curve: EquityPoint[] = [
			{ timestamp: "2024-01-01T00:00:00Z", equity: 100000 },
			{ timestamp: "2024-01-02T00:00:00Z", equity: 90000 }, // 10% drawdown
			{ timestamp: "2024-01-03T00:00:00Z", equity: 105000 }, // new high
			{ timestamp: "2024-01-04T00:00:00Z", equity: 84000 }, // 20% drawdown from 105k
		];
		const stats = calculateDrawdownStats(curve);
		expect(stats.currentDrawdown).toBeCloseTo(0.2, 5);
		expect(stats.maxDrawdown).toBeCloseTo(0.2, 5);
		expect(stats.peakEquity).toBe(105000);
	});

	it("should validate stats with Zod schema", () => {
		const curve: EquityPoint[] = [
			{ timestamp: "2024-01-01T00:00:00Z", equity: 100000 },
			{ timestamp: "2024-01-02T00:00:00Z", equity: 85000 },
		];
		const stats = calculateDrawdownStats(curve);
		const result = DrawdownStatsSchema.safeParse(stats);
		expect(result.success).toBe(true);
	});
});

// ============================================
// DrawdownTracker Tests
// ============================================

describe("DrawdownTracker", () => {
	it("should initialize with correct state", () => {
		const tracker = new DrawdownTracker(100000, "2024-01-01T00:00:00Z");
		const stats = tracker.getStats();

		expect(stats.currentDrawdown).toBe(0);
		expect(stats.maxDrawdown).toBe(0);
		expect(stats.peakEquity).toBe(100000);
		expect(tracker.isInDrawdown()).toBe(false);
	});

	it("should track drawdown on declining equity", () => {
		const tracker = new DrawdownTracker(100000, "2024-01-01T00:00:00Z");

		tracker.update(95000, "2024-01-02T00:00:00Z");
		let stats = tracker.getStats();
		expect(stats.currentDrawdown).toBeCloseTo(0.05, 5);
		expect(tracker.isInDrawdown()).toBe(true);

		tracker.update(90000, "2024-01-03T00:00:00Z");
		stats = tracker.getStats();
		expect(stats.currentDrawdown).toBeCloseTo(0.1, 5);
		expect(stats.drawdownDuration).toBe(2);
	});

	it("should recognize recovery to new high", () => {
		const tracker = new DrawdownTracker(100000, "2024-01-01T00:00:00Z");

		tracker.update(80000, "2024-01-02T00:00:00Z");
		expect(tracker.isInDrawdown()).toBe(true);

		tracker.update(105000, "2024-01-03T00:00:00Z");
		expect(tracker.isInDrawdown()).toBe(false);

		const stats = tracker.getStats();
		expect(stats.currentDrawdown).toBe(0);
		expect(stats.maxDrawdown).toBeCloseTo(0.2, 5);
		expect(stats.peakEquity).toBe(105000);
	});

	it("should track drawdown history", () => {
		const tracker = new DrawdownTracker(100000, "2024-01-01T00:00:00Z");

		// First drawdown and recovery
		tracker.update(90000, "2024-01-02T00:00:00Z");
		tracker.update(105000, "2024-01-03T00:00:00Z");

		const history = tracker.getHistory();
		expect(history.length).toBe(1);
		expect(history[0]!.maxDrawdownPct).toBeCloseTo(0.1, 5);
		expect(history[0]!.recovered).toBe(true);
	});

	it("should serialize and deserialize correctly", () => {
		const tracker = new DrawdownTracker(100000, "2024-01-01T00:00:00Z");
		tracker.update(85000, "2024-01-02T00:00:00Z");
		tracker.update(90000, "2024-01-03T00:00:00Z");

		const serialized = tracker.serialize();
		const restored = DrawdownTracker.deserialize(serialized);

		expect(restored.getStats().currentDrawdown).toBeCloseTo(0.1, 5);
		expect(restored.getStats().maxDrawdown).toBeCloseTo(0.15, 5);
		expect(restored.isInDrawdown()).toBe(true);
	});

	it("should reset correctly", () => {
		const tracker = new DrawdownTracker(100000, "2024-01-01T00:00:00Z");
		tracker.update(80000, "2024-01-02T00:00:00Z");

		tracker.reset(200000, "2024-02-01T00:00:00Z");
		const stats = tracker.getStats();

		expect(stats.currentDrawdown).toBe(0);
		expect(stats.maxDrawdown).toBe(0);
		expect(stats.peakEquity).toBe(200000);
		expect(tracker.getHistory().length).toBe(0);
	});
});

// ============================================
// Alert Tests
// ============================================

describe("checkDrawdownAlert", () => {
	it("should not alert when below all thresholds", () => {
		const stats = createEmptyDrawdownStats();
		const alert = checkDrawdownAlert(stats);
		expect(alert.shouldAlert).toBe(false);
		expect(alert.reasons.length).toBe(0);
	});

	it("should alert when current drawdown exceeds threshold", () => {
		const stats = createEmptyDrawdownStats();
		stats.currentDrawdown = 0.2; // 20% > 15% threshold

		const alert = checkDrawdownAlert(stats);
		expect(alert.shouldAlert).toBe(true);
		expect(alert.reasons.length).toBe(1);
		expect(alert.reasons[0]).toContain("Current drawdown");
	});

	it("should alert when max drawdown exceeds threshold", () => {
		const stats = createEmptyDrawdownStats();
		stats.maxDrawdown = 0.3; // 30% > 25% threshold

		const alert = checkDrawdownAlert(stats);
		expect(alert.shouldAlert).toBe(true);
		expect(alert.reasons.some((r) => r.includes("Max drawdown"))).toBe(true);
	});

	it("should alert when duration exceeds threshold", () => {
		const stats = createEmptyDrawdownStats();
		stats.drawdownDuration = 30; // 30 > 24 threshold

		const alert = checkDrawdownAlert(stats);
		expect(alert.shouldAlert).toBe(true);
		expect(alert.reasons.some((r) => r.includes("duration"))).toBe(true);
	});

	it("should alert for multiple reasons", () => {
		const stats = createEmptyDrawdownStats();
		stats.currentDrawdown = 0.3;
		stats.maxDrawdown = 0.35;
		stats.drawdownDuration = 48;

		const alert = checkDrawdownAlert(stats);
		expect(alert.shouldAlert).toBe(true);
		expect(alert.reasons.length).toBe(3);
	});

	it("should respect custom config", () => {
		const stats = createEmptyDrawdownStats();
		stats.currentDrawdown = 0.08; // Would not trigger default threshold

		const customConfig = {
			...DEFAULT_DRAWDOWN_ALERT_CONFIG,
			currentDrawdownThreshold: 0.05, // 5% threshold
		};

		const alert = checkDrawdownAlert(stats, customConfig);
		expect(alert.shouldAlert).toBe(true);
	});
});

// ============================================
// Utility Tests
// ============================================

describe("formatDrawdownStats", () => {
	it("should format stats for display", () => {
		const stats = createEmptyDrawdownStats();
		stats.currentDrawdown = 0.12;
		stats.currentDrawdownAbsolute = 12000;
		stats.maxDrawdown = 0.15;
		stats.maxDrawdownAbsolute = 15000;
		stats.drawdownDuration = 5;
		stats.riskLevel = "elevated";
		stats.recoveryNeeded = 0.1364;

		const formatted = formatDrawdownStats(stats);

		expect(formatted).toContain("Current Drawdown: 12.00%");
		expect(formatted).toContain("Max Drawdown: 15.00%");
		expect(formatted).toContain("Duration: 5 periods");
		expect(formatted).toContain("Risk Level: ELEVATED");
		expect(formatted).toContain("Recovery Needed:");
	});

	it("should show 'No recovery needed' when not in drawdown", () => {
		const stats = createEmptyDrawdownStats();
		const formatted = formatDrawdownStats(stats);
		expect(formatted).toContain("No recovery needed");
	});
});

describe("DRAWDOWN_THRESHOLDS", () => {
	it("should have correct threshold values", () => {
		expect(DRAWDOWN_THRESHOLDS.optimal).toBe(0.05);
		expect(DRAWDOWN_THRESHOLDS.normal).toBe(0.1);
		expect(DRAWDOWN_THRESHOLDS.elevated).toBe(0.15);
		expect(DRAWDOWN_THRESHOLDS.high).toBe(0.25);
		expect(DRAWDOWN_THRESHOLDS.critical).toBe(0.25);
	});
});

// ============================================
// Edge Cases
// ============================================

describe("Edge cases", () => {
	it("should handle very small equity values", () => {
		const tracker = new DrawdownTracker(1, "2024-01-01T00:00:00Z");
		tracker.update(0.5, "2024-01-02T00:00:00Z");

		const stats = tracker.getStats();
		expect(stats.currentDrawdown).toBeCloseTo(0.5, 5);
	});

	it("should handle very large equity values", () => {
		const tracker = new DrawdownTracker(1e12, "2024-01-01T00:00:00Z");
		tracker.update(9e11, "2024-01-02T00:00:00Z");

		const stats = tracker.getStats();
		expect(stats.currentDrawdown).toBeCloseTo(0.1, 5);
	});

	it("should handle rapid successive updates", () => {
		const tracker = new DrawdownTracker(100000, "2024-01-01T00:00:00Z");

		for (let i = 1; i <= 100; i++) {
			const equity = 100000 - i * 100;
			tracker.update(equity, `2024-01-01T00:${i.toString().padStart(2, "0")}:00Z`);
		}

		const stats = tracker.getStats();
		expect(stats.currentDrawdown).toBeCloseTo(0.1, 5);
		expect(stats.drawdownDuration).toBe(100);
	});
});
