/**
 * Tests for exposure calculations
 */

import { describe, expect, test } from "bun:test";
import type { Position } from "./execution";
import {
	calculateDeltaAdjustedExposure,
	calculateExposureByInstrumentType,
	calculateExposureBySector,
	calculateExposureByStrategy,
	calculateExposurePair,
	calculateExposureStats,
	createEmptyExposureStats,
	DEFAULT_EXPOSURE_LIMITS,
	formatExposureStats,
	type PositionWithDelta,
	type PositionWithMetadata,
	validateExposure,
	validateSectorExposure,
} from "./exposure";

// ============================================
// Test Fixtures
// ============================================

function createPosition(
	symbol: string,
	quantity: number,
	marketValue: number,
	type: "EQUITY" | "OPTION" = "EQUITY",
): Position {
	const avgEntryPrice = Math.abs(marketValue / quantity);
	return {
		instrument: { instrumentId: symbol, instrumentType: type },
		quantity,
		avgEntryPrice,
		marketValue,
		unrealizedPnl: 0,
		unrealizedPnlPct: 0,
		costBasis: Math.abs(marketValue),
	};
}

// ============================================
// Core Calculation Tests
// ============================================

describe("calculateExposureStats", () => {
	test("calculates basic gross/net exposure", () => {
		// Classic example: 70% long + 30% short = 100% gross, 40% net
		const positions: Position[] = [
			createPosition("AAPL", 100, 70000), // Long 70%
			createPosition("TSLA", -50, -30000), // Short 30%
		];

		const stats = calculateExposureStats(positions, 100000);

		expect(stats.grossExposureNotional).toBe(100000);
		expect(stats.netExposureNotional).toBe(40000);
		expect(stats.grossExposurePctEquity).toBeCloseTo(1.0, 6);
		expect(stats.netExposurePctEquity).toBeCloseTo(0.4, 6);
		expect(stats.longPositionCount).toBe(1);
		expect(stats.shortPositionCount).toBe(1);
		expect(stats.totalPositionCount).toBe(2);
	});

	test("handles all-long portfolio", () => {
		const positions: Position[] = [
			createPosition("AAPL", 100, 50000),
			createPosition("GOOGL", 50, 30000),
		];

		const stats = calculateExposureStats(positions, 100000);

		expect(stats.grossExposureNotional).toBe(80000);
		expect(stats.netExposureNotional).toBe(80000);
		expect(stats.grossExposurePctEquity).toBeCloseTo(0.8, 6);
		expect(stats.netExposurePctEquity).toBeCloseTo(0.8, 6);
		expect(stats.longPositionCount).toBe(2);
		expect(stats.shortPositionCount).toBe(0);
	});

	test("handles all-short portfolio", () => {
		const positions: Position[] = [
			createPosition("AAPL", -100, -50000),
			createPosition("GOOGL", -50, -30000),
		];

		const stats = calculateExposureStats(positions, 100000);

		expect(stats.grossExposureNotional).toBe(80000);
		expect(stats.netExposureNotional).toBe(-80000);
		expect(stats.grossExposurePctEquity).toBeCloseTo(0.8, 6);
		expect(stats.netExposurePctEquity).toBeCloseTo(-0.8, 6);
		expect(stats.longPositionCount).toBe(0);
		expect(stats.shortPositionCount).toBe(2);
	});

	test("handles empty portfolio", () => {
		const stats = calculateExposureStats([], 100000);

		expect(stats.grossExposureNotional).toBe(0);
		expect(stats.netExposureNotional).toBe(0);
		expect(stats.totalPositionCount).toBe(0);
	});

	test("handles leveraged portfolio (gross > 100%)", () => {
		const positions: Position[] = [
			createPosition("AAPL", 100, 120000), // Long 120%
			createPosition("TSLA", -50, -80000), // Short 80%
		];

		const stats = calculateExposureStats(positions, 100000);

		expect(stats.grossExposurePctEquity).toBeCloseTo(2.0, 6); // 200%
		expect(stats.netExposurePctEquity).toBeCloseTo(0.4, 6); // 40%
	});

	test("throws on zero equity", () => {
		expect(() => calculateExposureStats([], 0)).toThrow("accountEquity must be positive");
	});

	test("throws on negative equity", () => {
		expect(() => calculateExposureStats([], -100000)).toThrow("accountEquity must be positive");
	});
});

describe("calculateExposurePair", () => {
	test("returns detailed exposure pair", () => {
		const positions: Position[] = [
			createPosition("AAPL", 100, 70000),
			createPosition("TSLA", -50, -30000),
		];

		const pair = calculateExposurePair(positions, 100000);

		expect(pair.gross.notional).toBe(100000);
		expect(pair.gross.pctEquity).toBeCloseTo(1.0, 6);
		expect(pair.net.notional).toBe(40000);
		expect(pair.net.pctEquity).toBeCloseTo(0.4, 6);
		expect(pair.long.notional).toBe(70000);
		expect(pair.short.notional).toBe(30000);
	});
});

// ============================================
// Bucketed Exposure Tests
// ============================================

describe("calculateExposureByInstrumentType", () => {
	test("buckets by equity vs option", () => {
		const positions: Position[] = [
			createPosition("AAPL", 100, 50000, "EQUITY"),
			createPosition("AAPL240119C150", 10, 20000, "OPTION"),
			createPosition("TSLA", 50, 30000, "EQUITY"),
		];

		const result = calculateExposureByInstrumentType(positions, 100000);

		expect(result.bucketType).toBe("instrument_type");
		expect(result.breakdown.size).toBe(2);
		expect(result.breakdown.get("EQUITY")?.gross.notional).toBe(80000);
		expect(result.breakdown.get("OPTION")?.gross.notional).toBe(20000);
		expect(result.total.gross.notional).toBe(100000);
	});
});

describe("calculateExposureBySector", () => {
	test("buckets by sector", () => {
		const positions: PositionWithMetadata[] = [
			{ position: createPosition("AAPL", 100, 50000), sector: "Technology" },
			{ position: createPosition("MSFT", 50, 30000), sector: "Technology" },
			{ position: createPosition("JNJ", 100, 20000), sector: "Healthcare" },
		];

		const result = calculateExposureBySector(positions, 100000);

		expect(result.bucketType).toBe("sector");
		expect(result.breakdown.get("Technology")?.gross.notional).toBe(80000);
		expect(result.breakdown.get("Healthcare")?.gross.notional).toBe(20000);
	});

	test("handles missing sector as Unknown", () => {
		const positions: PositionWithMetadata[] = [
			{ position: createPosition("AAPL", 100, 50000), sector: "Technology" },
			{ position: createPosition("XYZ", 50, 30000) }, // No sector
		];

		const result = calculateExposureBySector(positions, 100000);

		expect(result.breakdown.has("Unknown")).toBe(true);
		expect(result.breakdown.get("Unknown")?.gross.notional).toBe(30000);
	});
});

describe("calculateExposureByStrategy", () => {
	test("buckets by strategy", () => {
		const positions: PositionWithMetadata[] = [
			{ position: createPosition("AAPL", 100, 50000), strategy: "momentum" },
			{ position: createPosition("MSFT", 50, 30000), strategy: "momentum" },
			{ position: createPosition("JNJ", 100, 20000), strategy: "mean_reversion" },
		];

		const result = calculateExposureByStrategy(positions, 100000);

		expect(result.bucketType).toBe("strategy");
		expect(result.breakdown.get("momentum")?.gross.notional).toBe(80000);
		expect(result.breakdown.get("mean_reversion")?.gross.notional).toBe(20000);
	});
});

// ============================================
// Validation Tests
// ============================================

describe("validateExposure", () => {
	test("passes when within limits", () => {
		// Keep each position under 20% single position limit
		const positions: Position[] = [
			createPosition("AAPL", 100, 15000), // 15%
			createPosition("GOOGL", 50, 10000), // 10%
			createPosition("MSFT", 50, 10000), // 10%
		];

		const result = validateExposure(positions, 100000);

		expect(result.valid).toBe(true);
		expect(result.violations).toHaveLength(0);
	});

	test("fails on gross exposure violation", () => {
		const positions: Position[] = [
			createPosition("AAPL", 100, 150000), // 150%
			createPosition("TSLA", -50, -100000), // 100%
		];

		const result = validateExposure(positions, 100000, { maxGrossExposure: 2.0 });

		expect(result.valid).toBe(false);
		expect(result.violations.some((v) => v.limitType === "gross")).toBe(true);
	});

	test("fails on net exposure violation", () => {
		const positions: Position[] = [
			createPosition("AAPL", 100, 120000), // 120% net long
		];

		const result = validateExposure(positions, 100000, { maxNetExposure: 1.0 });

		expect(result.valid).toBe(false);
		expect(result.violations.some((v) => v.limitType === "net")).toBe(true);
	});

	test("fails on single position violation", () => {
		const positions: Position[] = [
			createPosition("AAPL", 100, 25000), // 25% > 20% limit
			createPosition("GOOGL", 50, 10000),
		];

		const result = validateExposure(positions, 100000, { maxSinglePositionExposure: 0.2 });

		expect(result.valid).toBe(false);
		expect(result.violations.some((v) => v.limitType === "single_position")).toBe(true);
		expect(result.violations.find((v) => v.limitType === "single_position")?.context).toBe("AAPL");
	});

	test("uses default limits", () => {
		expect(DEFAULT_EXPOSURE_LIMITS.maxGrossExposure).toBe(2.0);
		expect(DEFAULT_EXPOSURE_LIMITS.maxNetExposure).toBe(1.0);
		expect(DEFAULT_EXPOSURE_LIMITS.maxSinglePositionExposure).toBe(0.2);
		expect(DEFAULT_EXPOSURE_LIMITS.maxSectorExposure).toBe(0.4);
	});
});

describe("validateSectorExposure", () => {
	test("passes when within sector limits", () => {
		const positions: PositionWithMetadata[] = [
			{ position: createPosition("AAPL", 100, 30000), sector: "Technology" },
			{ position: createPosition("JNJ", 100, 30000), sector: "Healthcare" },
		];

		const violations = validateSectorExposure(positions, 100000, 0.4);

		expect(violations).toHaveLength(0);
	});

	test("fails when sector exceeds limit", () => {
		const positions: PositionWithMetadata[] = [
			{ position: createPosition("AAPL", 100, 30000), sector: "Technology" },
			{ position: createPosition("MSFT", 100, 20000), sector: "Technology" }, // Total 50%
		];

		const violations = validateSectorExposure(positions, 100000, 0.4);

		expect(violations).toHaveLength(1);
		expect(violations[0].limitType).toBe("sector");
		expect(violations[0].context).toBe("Technology");
	});
});

// ============================================
// Delta-Adjusted Exposure Tests
// ============================================

describe("calculateDeltaAdjustedExposure", () => {
	test("uses delta for options exposure", () => {
		const positions: PositionWithDelta[] = [
			{
				...createPosition("AAPL", 100, 15000, "EQUITY"),
				// Equity uses market value directly
			},
			{
				...createPosition("AAPL240119C150", 10, 5000, "OPTION"),
				delta: 0.5,
				underlyingPrice: 150,
				// Delta exposure = 0.5 * 150 * 10 * 100 = 75000
			},
		];

		const stats = calculateDeltaAdjustedExposure(positions, 100000);

		// Equity: 15000 + Option delta-adjusted: 75000 = 90000
		expect(stats.grossExposureNotional).toBe(90000);
		expect(stats.longPositionCount).toBe(2);
	});

	test("handles short options (negative delta)", () => {
		const positions: PositionWithDelta[] = [
			{
				...createPosition("AAPL240119P150", -10, -5000, "OPTION"),
				delta: -0.3,
				underlyingPrice: 150,
				// Delta exposure = |-0.3| * 150 * |-10| * 100 = 45000
			},
		];

		const stats = calculateDeltaAdjustedExposure(positions, 100000);

		expect(stats.grossExposureNotional).toBe(45000);
		expect(stats.shortPositionCount).toBe(1);
	});

	test("falls back to market value when delta not provided", () => {
		const positions: PositionWithDelta[] = [
			{
				...createPosition("AAPL", 100, 50000, "EQUITY"),
				// No delta - should use market value
			},
		];

		const stats = calculateDeltaAdjustedExposure(positions, 100000);

		expect(stats.grossExposureNotional).toBe(50000);
	});
});

// ============================================
// Utility Tests
// ============================================

describe("formatExposureStats", () => {
	test("formats stats as readable string", () => {
		const stats = calculateExposureStats(
			[createPosition("AAPL", 100, 70000), createPosition("TSLA", -50, -30000)],
			100000,
		);

		const formatted = formatExposureStats(stats);

		expect(formatted).toContain("Gross Exposure: 100.0%");
		expect(formatted).toContain("Net Exposure: 40.0%");
		expect(formatted).toContain("Long:");
		expect(formatted).toContain("Short:");
	});
});

describe("createEmptyExposureStats", () => {
	test("returns all zeros", () => {
		const empty = createEmptyExposureStats();

		expect(empty.grossExposureNotional).toBe(0);
		expect(empty.netExposureNotional).toBe(0);
		expect(empty.grossExposurePctEquity).toBe(0);
		expect(empty.netExposurePctEquity).toBe(0);
		expect(empty.totalPositionCount).toBe(0);
	});
});
