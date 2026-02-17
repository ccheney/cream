import { describe, expect, it } from "bun:test";

import { classifyMarketCap, isValidFeatureSnapshot, parseFeatureSnapshot } from "./schema";
import { createSimpleSnapshot } from "./snapshot.test.fixtures";

describe("classifyMarketCap", () => {
	it("should classify MEGA cap", () => {
		expect(classifyMarketCap(250_000_000_000)).toBe("MEGA");
		expect(classifyMarketCap(3_000_000_000_000)).toBe("MEGA");
	});

	it("should classify LARGE cap", () => {
		expect(classifyMarketCap(50_000_000_000)).toBe("LARGE");
		expect(classifyMarketCap(10_000_000_000)).toBe("LARGE");
	});

	it("should classify MID cap", () => {
		expect(classifyMarketCap(5_000_000_000)).toBe("MID");
		expect(classifyMarketCap(2_000_000_000)).toBe("MID");
	});

	it("should classify SMALL cap", () => {
		expect(classifyMarketCap(1_000_000_000)).toBe("SMALL");
		expect(classifyMarketCap(300_000_000)).toBe("SMALL");
	});

	it("should classify MICRO cap", () => {
		expect(classifyMarketCap(100_000_000)).toBe("MICRO");
		expect(classifyMarketCap(50_000_000)).toBe("MICRO");
	});

	it("should return undefined for undefined input", () => {
		expect(classifyMarketCap(undefined)).toBeUndefined();
	});
});

describe("parseFeatureSnapshot", () => {
	it("should validate a valid snapshot", () => {
		const snapshot = createSimpleSnapshot();
		snapshot.latestPrice = 150.5;
		snapshot.indicators.rsi_14_1h = 65;
		snapshot.normalized.zscore_rsi_14_1h = 0.5;
		snapshot.config.timeframes = ["1h", "4h", "1d"];

		const parsed = parseFeatureSnapshot(snapshot);
		expect(parsed.symbol).toBe("AAPL");
		expect(parsed.regime.regime).toBe("BULL_TREND");
	});

	it("should reject invalid regime label", () => {
		const snapshot = createSimpleSnapshot();
		const invalid = {
			...snapshot,
			regime: {
				regime: "INVALID_REGIME",
				confidence: 0.8,
			},
		};

		expect(() => parseFeatureSnapshot(invalid)).toThrow();
	});
});

describe("isValidFeatureSnapshot", () => {
	it("should return true for valid snapshot", () => {
		const snapshot = createSimpleSnapshot();
		snapshot.latestPrice = 150.5;
		snapshot.regime = {
			regime: "RANGE",
			confidence: 0.6,
		};

		expect(isValidFeatureSnapshot(snapshot)).toBe(true);
	});

	it("should return false for invalid snapshot", () => {
		expect(isValidFeatureSnapshot({})).toBe(false);
		expect(isValidFeatureSnapshot(null)).toBe(false);
		expect(isValidFeatureSnapshot("not an object")).toBe(false);
	});
});
