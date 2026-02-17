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

describe("calculateDrawdown", () => {
	it("returns 0 when current equals or exceeds peak", () => {
		expect(calculateDrawdown(100000, 100000)).toBe(0);
		expect(calculateDrawdown(110000, 100000)).toBe(0);
	});

	it("calculates percentage drawdown", () => {
		expect(calculateDrawdown(90000, 100000)).toBeCloseTo(0.1, 5);
		expect(calculateDrawdown(50000, 100000)).toBeCloseTo(0.5, 5);
	});

	it("handles invalid peak values", () => {
		expect(calculateDrawdown(100, 0)).toBe(0);
		expect(calculateDrawdown(100, -100)).toBe(0);
	});
});

describe("calculateRecoveryNeeded", () => {
	it("returns 0 for no drawdown", () => {
		expect(calculateRecoveryNeeded(0)).toBe(0);
	});

	it("returns expected recovery percentages", () => {
		expect(calculateRecoveryNeeded(0.5)).toBeCloseTo(1, 5);
		expect(calculateRecoveryNeeded(0.1)).toBeCloseTo(0.1111, 3);
		expect(calculateRecoveryNeeded(0.2)).toBeCloseTo(0.25, 5);
	});

	it("returns infinity for 100% drawdown", () => {
		expect(calculateRecoveryNeeded(1)).toBe(Number.POSITIVE_INFINITY);
	});
});

describe("getRiskLevel", () => {
	it("returns optimal for < 5%", () => {
		expect(getRiskLevel(0.04)).toBe("optimal");
		expect(getRiskLevel(0)).toBe("optimal");
	});

	it("returns normal/elevated/high in mid ranges", () => {
		expect(getRiskLevel(0.05)).toBe("normal");
		expect(getRiskLevel(0.1)).toBe("elevated");
		expect(getRiskLevel(0.15)).toBe("high");
	});

	it("returns critical for >= 25%", () => {
		expect(getRiskLevel(0.25)).toBe("critical");
		expect(getRiskLevel(0.5)).toBe("critical");
	});
});

describe("calculateDrawdownStats basic curves", () => {
	it("handles empty and single-point curves", () => {
		const empty = calculateDrawdownStats([]);
		expect(empty.currentDrawdown).toBe(0);
		expect(empty.maxDrawdown).toBe(0);
		expect(empty.riskLevel).toBe("optimal");

		const single: EquityPoint[] = [{ timestamp: "2024-01-01T00:00:00Z", equity: 100000 }];
		const one = calculateDrawdownStats(single);
		expect(one.currentDrawdown).toBe(0);
		expect(one.maxDrawdown).toBe(0);
		expect(one.peakEquity).toBe(100000);
	});

	it("handles monotonically increasing curve", () => {
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
});

describe("calculateDrawdownStats drawdown patterns", () => {
	it("calculates drawdown for declining curve", () => {
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

	it("tracks max drawdown through recovery", () => {
		const curve: EquityPoint[] = [
			{ timestamp: "2024-01-01T00:00:00Z", equity: 100000 },
			{ timestamp: "2024-01-02T00:00:00Z", equity: 80000 },
			{ timestamp: "2024-01-03T00:00:00Z", equity: 85000 },
			{ timestamp: "2024-01-04T00:00:00Z", equity: 110000 },
		];
		const stats = calculateDrawdownStats(curve);
		expect(stats.currentDrawdown).toBe(0);
		expect(stats.maxDrawdown).toBeCloseTo(0.2, 5);
		expect(stats.peakEquity).toBe(110000);
	});

	it("tracks multiple drawdowns and validates schema", () => {
		const curve: EquityPoint[] = [
			{ timestamp: "2024-01-01T00:00:00Z", equity: 100000 },
			{ timestamp: "2024-01-02T00:00:00Z", equity: 90000 },
			{ timestamp: "2024-01-03T00:00:00Z", equity: 105000 },
			{ timestamp: "2024-01-04T00:00:00Z", equity: 84000 },
		];
		const stats = calculateDrawdownStats(curve);
		expect(stats.currentDrawdown).toBeCloseTo(0.2, 5);
		expect(stats.maxDrawdown).toBeCloseTo(0.2, 5);
		expect(stats.peakEquity).toBe(105000);
		expect(DrawdownStatsSchema.safeParse(stats).success).toBe(true);
	});
});

describe("DrawdownTracker lifecycle", () => {
	it("initializes with correct state", () => {
		const tracker = new DrawdownTracker(100000, "2024-01-01T00:00:00Z");
		const stats = tracker.getStats();
		expect(stats.currentDrawdown).toBe(0);
		expect(stats.maxDrawdown).toBe(0);
		expect(stats.peakEquity).toBe(100000);
		expect(tracker.isInDrawdown()).toBe(false);
	});

	it("tracks drawdown on declining equity", () => {
		const tracker = new DrawdownTracker(100000, "2024-01-01T00:00:00Z");
		tracker.update(95000, "2024-01-02T00:00:00Z");
		expect(tracker.getStats().currentDrawdown).toBeCloseTo(0.05, 5);
		expect(tracker.isInDrawdown()).toBe(true);
		tracker.update(90000, "2024-01-03T00:00:00Z");
		expect(tracker.getStats().drawdownDuration).toBe(2);
	});

	it("recognizes recovery to new high", () => {
		const tracker = new DrawdownTracker(100000, "2024-01-01T00:00:00Z");
		tracker.update(80000, "2024-01-02T00:00:00Z");
		expect(tracker.isInDrawdown()).toBe(true);
		tracker.update(105000, "2024-01-03T00:00:00Z");
		expect(tracker.isInDrawdown()).toBe(false);
		expect(tracker.getStats().maxDrawdown).toBeCloseTo(0.2, 5);
	});

	it("resets correctly", () => {
		const tracker = new DrawdownTracker(100000, "2024-01-01T00:00:00Z");
		tracker.update(80000, "2024-01-02T00:00:00Z");
		tracker.reset(200000, "2024-02-01T00:00:00Z");
		expect(tracker.getStats().currentDrawdown).toBe(0);
		expect(tracker.getStats().maxDrawdown).toBe(0);
		expect(tracker.getStats().peakEquity).toBe(200000);
		expect(tracker.getHistory().length).toBe(0);
	});
});

describe("DrawdownTracker history and persistence", () => {
	it("tracks drawdown history", () => {
		const tracker = new DrawdownTracker(100000, "2024-01-01T00:00:00Z");
		tracker.update(90000, "2024-01-02T00:00:00Z");
		tracker.update(105000, "2024-01-03T00:00:00Z");
		const history = tracker.getHistory();
		expect(history.length).toBe(1);
		const first = history[0];
		if (!first) {
			throw new Error("Expected drawdown history to have one entry");
		}
		expect(first.maxDrawdownPct).toBeCloseTo(0.1, 5);
		expect(first.recovered).toBe(true);
	});

	it("serializes and deserializes correctly", () => {
		const tracker = new DrawdownTracker(100000, "2024-01-01T00:00:00Z");
		tracker.update(85000, "2024-01-02T00:00:00Z");
		tracker.update(90000, "2024-01-03T00:00:00Z");
		const restored = DrawdownTracker.deserialize(tracker.serialize());
		expect(restored.getStats().currentDrawdown).toBeCloseTo(0.1, 5);
		expect(restored.getStats().maxDrawdown).toBeCloseTo(0.15, 5);
		expect(restored.isInDrawdown()).toBe(true);
	});
});

describe("checkDrawdownAlert thresholds", () => {
	it("does not alert below all thresholds", () => {
		const alert = checkDrawdownAlert(createEmptyDrawdownStats());
		expect(alert.shouldAlert).toBe(false);
		expect(alert.reasons.length).toBe(0);
	});

	it("alerts on current drawdown threshold breach", () => {
		const stats = createEmptyDrawdownStats();
		stats.currentDrawdown = 0.2;
		const alert = checkDrawdownAlert(stats);
		expect(alert.shouldAlert).toBe(true);
		expect(alert.reasons[0]).toContain("Current drawdown");
	});

	it("alerts on max drawdown and duration thresholds", () => {
		const stats = createEmptyDrawdownStats();
		stats.maxDrawdown = 0.3;
		stats.drawdownDuration = 30;
		const alert = checkDrawdownAlert(stats);
		expect(alert.shouldAlert).toBe(true);
		expect(alert.reasons.some((reason) => reason.includes("Max drawdown"))).toBe(true);
		expect(alert.reasons.some((reason) => reason.includes("duration"))).toBe(true);
	});

	it("alerts for multiple reasons", () => {
		const stats = createEmptyDrawdownStats();
		stats.currentDrawdown = 0.3;
		stats.maxDrawdown = 0.35;
		stats.drawdownDuration = 48;
		expect(checkDrawdownAlert(stats).reasons.length).toBe(3);
	});
});

describe("checkDrawdownAlert custom config", () => {
	it("respects custom config", () => {
		const stats = createEmptyDrawdownStats();
		stats.currentDrawdown = 0.08;
		const customConfig = {
			...DEFAULT_DRAWDOWN_ALERT_CONFIG,
			currentDrawdownThreshold: 0.05,
		};
		expect(checkDrawdownAlert(stats, customConfig).shouldAlert).toBe(true);
	});
});

describe("formatDrawdownStats", () => {
	it("formats stats for display", () => {
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

	it("shows No recovery needed when flat", () => {
		expect(formatDrawdownStats(createEmptyDrawdownStats())).toContain("No recovery needed");
	});
});

describe("DRAWDOWN_THRESHOLDS", () => {
	it("has correct threshold values", () => {
		expect(DRAWDOWN_THRESHOLDS.optimal).toBe(0.05);
		expect(DRAWDOWN_THRESHOLDS.normal).toBe(0.1);
		expect(DRAWDOWN_THRESHOLDS.elevated).toBe(0.15);
		expect(DRAWDOWN_THRESHOLDS.high).toBe(0.25);
		expect(DRAWDOWN_THRESHOLDS.critical).toBe(0.25);
	});
});

describe("drawdown edge cases", () => {
	it("handles very small equity values", () => {
		const tracker = new DrawdownTracker(1, "2024-01-01T00:00:00Z");
		tracker.update(0.5, "2024-01-02T00:00:00Z");
		expect(tracker.getStats().currentDrawdown).toBeCloseTo(0.5, 5);
	});

	it("handles very large equity values", () => {
		const tracker = new DrawdownTracker(1e12, "2024-01-01T00:00:00Z");
		tracker.update(9e11, "2024-01-02T00:00:00Z");
		expect(tracker.getStats().currentDrawdown).toBeCloseTo(0.1, 5);
	});

	it("handles rapid successive updates", () => {
		const tracker = new DrawdownTracker(100000, "2024-01-01T00:00:00Z");
		for (let i = 1; i <= 100; i++) {
			const equity = 100000 - i * 100;
			tracker.update(equity, `2024-01-01T00:${i.toString().padStart(2, "0")}:00Z`);
		}
		expect(tracker.getStats().currentDrawdown).toBeCloseTo(0.1, 5);
		expect(tracker.getStats().drawdownDuration).toBe(100);
	});
});
