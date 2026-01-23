/**
 * Data Quality Validation Tests
 */

import { describe, expect, it } from "bun:test";
import { requireArrayItem } from "@cream/test-utils";
import type { Timeframe } from "../ingestion/candleIngestion";
import {
	detectAllAnomalies,
	detectFlashCrashes,
	detectPriceSpikes,
	detectVolumeAnomalies,
} from "./anomalies";
import { type Candle, detectGaps, fillGaps, interpolateCandle } from "./gaps";
import { getQualityScore, isValidCandleData, validateCandleData } from "./index";
import { checkStaleness, getStaleSymbols, isFresh } from "./staleness";

// ============================================
// Test Data
// ============================================

function createCandle(
	timestamp: string,
	close: number,
	volume = 1000000,
	overrides: Partial<Candle> = {},
): Candle {
	return {
		symbol: "AAPL",
		timeframe: "1h" as Timeframe,
		timestamp,
		open: close * 0.99,
		high: close * 1.01,
		low: close * 0.98,
		close,
		volume,
		...overrides,
	};
}

function createCandleSeries(
	count: number,
	startPrice = 100,
	intervalMs = 3600000, // 1 hour
): Candle[] {
	const candles: Candle[] = [];
	const baseTime = Date.now() - count * intervalMs;

	for (let i = 0; i < count; i++) {
		// Deterministic small variation to avoid anomaly detection
		const variation = Math.sin(i * 0.5) * 2;
		const price = startPrice + variation;
		candles.push(
			createCandle(
				new Date(baseTime + i * intervalMs).toISOString(),
				price,
				1000000 + (i % 10) * 10000, // Deterministic volume variation
			),
		);
	}

	return candles;
}

// ============================================
// Staleness Tests
// ============================================

describe("Staleness Detection", () => {
	describe("checkStaleness", () => {
		it("should detect stale data", () => {
			const oldTimestamp = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(); // 3 hours ago
			const result = checkStaleness(oldTimestamp, "1h");

			expect(result.isStale).toBe(true);
			expect(result.staleMinutes).toBeGreaterThan(120);
		});

		it("should detect fresh data", () => {
			const recentTimestamp = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 min ago
			const result = checkStaleness(recentTimestamp, "1h");

			expect(result.isStale).toBe(false);
			expect(result.staleMinutes).toBeLessThan(120);
		});

		it("should handle null timestamp", () => {
			const result = checkStaleness(null, "1h");

			expect(result.isStale).toBe(true);
			expect(result.staleMinutes).toBe(Infinity);
		});

		it("should use correct thresholds per timeframe", () => {
			const timestamp = new Date(Date.now() - 15 * 60 * 1000).toISOString(); // 15 min ago

			const result1m = checkStaleness(timestamp, "1m");
			const result1d = checkStaleness(timestamp, "1d");

			expect(result1m.isStale).toBe(true); // 15 > 2 minutes threshold
			expect(result1d.isStale).toBe(false); // 15 < 2880 minutes threshold
		});
	});

	describe("getStaleSymbols", () => {
		it("should return only stale symbols", () => {
			const timestamps = new Map<string, string | null>();
			timestamps.set("AAPL", new Date(Date.now() - 30 * 60 * 1000).toISOString()); // Fresh
			timestamps.set("MSFT", new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()); // Stale
			timestamps.set("GOOGL", null); // Stale

			const stale = getStaleSymbols(timestamps, "1h");

			expect(stale).toContain("MSFT");
			expect(stale).toContain("GOOGL");
			expect(stale).not.toContain("AAPL");
		});
	});

	describe("isFresh", () => {
		it("should return true for fresh data", () => {
			const timestamp = new Date(Date.now() - 30 * 60 * 1000).toISOString();
			expect(isFresh(timestamp, "1h")).toBe(true);
		});

		it("should return false for stale data", () => {
			const timestamp = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
			expect(isFresh(timestamp, "1h")).toBe(false);
		});
	});
});

// ============================================
// Gap Detection Tests
// ============================================

describe("Gap Detection", () => {
	describe("detectGaps", () => {
		it("should detect gaps in candle data", () => {
			const candles = createCandleSeries(5);
			// Create a 3-hour gap
			const previous = requireArrayItem(candles, 1, "candle");
			candles[2] = createCandle(
				new Date(new Date(previous.timestamp).getTime() + 3 * 3600000).toISOString(),
				100,
			);

			const result = detectGaps(candles);

			expect(result.hasGaps).toBe(true);
			expect(result.gapCount).toBe(1);
			const firstGap = result.gaps[0];
			if (!firstGap) {
				throw new Error("Expected a gap to be detected");
			}
			expect(firstGap.gapCandles).toBe(2);
		});

		it("should detect no gaps in continuous data", () => {
			const candles = createCandleSeries(10);
			const result = detectGaps(candles);

			expect(result.hasGaps).toBe(false);
			expect(result.gapCount).toBe(0);
		});

		it("should handle empty input", () => {
			const result = detectGaps([]);

			expect(result.hasGaps).toBe(false);
			expect(result.totalCandles).toBe(0);
		});
	});

	describe("fillGaps", () => {
		it("should fill single-candle gaps", () => {
			const candles: Candle[] = [
				createCandle(new Date(1000 * 3600000).toISOString(), 100),
				createCandle(new Date(1002 * 3600000).toISOString(), 102), // 2 hour gap
			];

			const filled = fillGaps(candles, 1);

			expect(filled.length).toBe(3);
			const interpolated = requireArrayItem(filled, 1, "filled candle");
			expect("interpolated" in interpolated && interpolated.interpolated).toBe(true);
		});

		it("should not fill multi-candle gaps by default", () => {
			const candles: Candle[] = [
				createCandle(new Date(1000 * 3600000).toISOString(), 100),
				createCandle(new Date(1005 * 3600000).toISOString(), 105), // 5 hour gap
			];

			const filled = fillGaps(candles, 1);

			expect(filled.length).toBe(2); // No interpolation
		});
	});

	describe("interpolateCandle", () => {
		it("should create interpolated candle correctly", () => {
			const prev = createCandle("2024-01-01T10:00:00Z", 100);
			const next = createCandle("2024-01-01T12:00:00Z", 102);

			const interpolated = interpolateCandle(prev, next, "2024-01-01T11:00:00Z");

			expect(interpolated.interpolated).toBe(true);
			expect(interpolated.open).toBe(prev.close); // prev close
			expect(interpolated.close).toBe(next.open); // next open
			expect(interpolated.volume).toBe(0);
		});
	});
});

// ============================================
// Anomaly Detection Tests
// ============================================

describe("Anomaly Detection", () => {
	describe("detectVolumeAnomalies", () => {
		it("should detect volume spikes", () => {
			const candles = createCandleSeries(30);
			// Add a massive volume spike
			requireArrayItem(candles, 25, "candle").volume = 10000000; // 10x normal

			const anomalies = detectVolumeAnomalies(candles);

			expect(anomalies.length).toBeGreaterThan(0);
			expect(anomalies.some((a) => a.type === "volume_spike")).toBe(true);
		});

		it("should not flag normal volume variation", () => {
			const candles = createCandleSeries(30);
			const anomalies = detectVolumeAnomalies(candles);

			// Random variation should not trigger 5σ anomalies
			expect(anomalies.filter((a) => a.type === "volume_spike").length).toBe(0);
		});
	});

	describe("detectPriceSpikes", () => {
		it("should detect price spikes >10%", () => {
			const candles = createCandleSeries(10);
			const spikeCandle = requireArrayItem(candles, 5, "candle");
			const priorCandle = requireArrayItem(candles, 4, "candle");
			spikeCandle.close = priorCandle.close * 1.15; // 15% spike

			const anomalies = detectPriceSpikes(candles);

			expect(anomalies.length).toBeGreaterThan(0);
			expect(anomalies.some((a) => a.type === "price_spike")).toBe(true);
		});

		it("should detect gap up/down", () => {
			const candles = createCandleSeries(10);
			const gapCandle = requireArrayItem(candles, 5, "candle");
			const priorCandle = requireArrayItem(candles, 4, "candle");
			gapCandle.open = priorCandle.close * 1.12; // 12% gap up

			const anomalies = detectPriceSpikes(candles);

			expect(anomalies.some((a) => a.type === "gap_up")).toBe(true);
		});
	});

	describe("detectFlashCrashes", () => {
		it("should detect flash crash pattern", () => {
			const candles = createCandleSeries(20);
			const basePrice = requireArrayItem(candles, 10, "candle").close;

			// Create flash crash: 6% drop then recovery
			requireArrayItem(candles, 11, "candle").low = basePrice * 0.94;
			requireArrayItem(candles, 11, "candle").close = basePrice * 0.95;
			requireArrayItem(candles, 12, "candle").close = basePrice * 0.98; // Recovery

			const anomalies = detectFlashCrashes(candles);

			expect(anomalies.some((a) => a.type === "flash_crash")).toBe(true);
		});
	});

	describe("detectAllAnomalies", () => {
		it("should combine all anomaly types", () => {
			const candles = createCandleSeries(30);
			requireArrayItem(candles, 25, "candle").volume = 10000000; // Volume spike
			const priceSpike = requireArrayItem(candles, 20, "candle");
			const priorCandle = requireArrayItem(candles, 19, "candle");
			priceSpike.close = priorCandle.close * 1.15; // Price spike

			const result = detectAllAnomalies(candles);

			expect(result.hasAnomalies).toBe(true);
			expect(result.anomalies.length).toBeGreaterThan(0);
		});
	});
});

// ============================================
// Combined Validation Tests
// ============================================

describe("Combined Validation", () => {
	describe("validateCandleData", () => {
		it("should return valid for good data", () => {
			const candles = createCandleSeries(50);
			// Make last candle recent
			const lastIndex = candles.length - 1;
			requireArrayItem(candles, lastIndex, "candle").timestamp = new Date().toISOString();

			const result = validateCandleData(candles);

			expect(result.isValid).toBe(true);
			expect(result.qualityScore).toBeGreaterThan(80);
		});

		it("should detect stale data", () => {
			const candles = createCandleSeries(50);
			// Make last candle old
			const lastIndex = candles.length - 1;
			requireArrayItem(candles, lastIndex, "candle").timestamp = new Date(
				Date.now() - 5 * 60 * 60 * 1000,
			).toISOString();

			const result = validateCandleData(candles);

			expect(result.staleness?.isStale).toBe(true);
			expect(result.issues.some((i) => i.type === "staleness")).toBe(true);
		});

		it("should detect gaps", () => {
			const candles = createCandleSeries(20);
			// Create a gap
			const priorCandle = requireArrayItem(candles, 9, "candle");
			requireArrayItem(candles, 10, "candle").timestamp = new Date(
				new Date(priorCandle.timestamp).getTime() + 5 * 3600000,
			).toISOString();

			// Disable calendar awareness so gap is detected regardless of day-of-week
			const result = validateCandleData(candles, { calendarAware: false });

			expect(result.gaps?.hasGaps).toBe(true);
			expect(result.issues.some((i) => i.type === "gap")).toBe(true);
		});

		it("should handle empty input", () => {
			const result = validateCandleData([]);

			expect(result.isValid).toBe(false);
			expect(result.qualityScore).toBe(0);
			expect(result.issues.some((i) => i.type === "insufficient_data")).toBe(true);
		});
	});

	describe("isValidCandleData", () => {
		it("should return true for valid data", () => {
			const candles = createCandleSeries(50);
			const lastIndex = candles.length - 1;
			requireArrayItem(candles, lastIndex, "candle").timestamp = new Date().toISOString();

			expect(isValidCandleData(candles)).toBe(true);
		});

		it("should return false for invalid data", () => {
			expect(isValidCandleData([])).toBe(false);
		});
	});

	describe("getQualityScore", () => {
		it("should return high score for good data", () => {
			const candles = createCandleSeries(50);
			const lastIndex = candles.length - 1;
			requireArrayItem(candles, lastIndex, "candle").timestamp = new Date().toISOString();

			const score = getQualityScore(candles);

			expect(score).toBeGreaterThanOrEqual(70); // Reasonable threshold
		});

		it("should return low score for bad data", () => {
			const candles = createCandleSeries(5);
			// Old data
			const lastIndex = candles.length - 1;
			requireArrayItem(candles, lastIndex, "candle").timestamp = new Date(
				Date.now() - 10 * 60 * 60 * 1000,
			).toISOString();

			const score = getQualityScore(candles);

			expect(score).toBeLessThan(80);
		});
	});
});
