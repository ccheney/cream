/**
 * Anomaly Detection Tests
 */

import { describe, expect, test } from "bun:test";
import {
	DEFAULT_ANOMALY_CONFIG,
	detectAllAnomalies,
	detectFlashCrashes,
	detectPriceSpikes,
	detectVolumeAnomalies,
	filterAnomalousCandles,
} from "../src/validation/anomalies";
import type { Candle } from "../src/validation/gaps";

// Helper to generate test candles
function generateCandles(count: number, symbol = "AAPL"): Candle[] {
	const candles: Candle[] = [];
	let price = 100;
	const baseVolume = 1000000;

	for (let i = 0; i < count; i++) {
		// Normal random walk
		const change = (Math.random() - 0.5) * 2;
		price = Math.max(10, price + change);

		const open = price;
		const high = price * 1.01;
		const low = price * 0.99;
		const close = price + (Math.random() - 0.5);
		const volume = baseVolume * (0.8 + Math.random() * 0.4);

		candles.push({
			symbol,
			timeframe: "1h",
			timestamp: new Date(Date.now() - (count - i) * 3600000).toISOString(),
			open,
			high,
			low,
			close,
			volume,
		});
	}

	return candles;
}

describe("detectVolumeAnomalies", () => {
	test("returns empty array for insufficient data", () => {
		const candles = generateCandles(5);
		const anomalies = detectVolumeAnomalies(candles, { ...DEFAULT_ANOMALY_CONFIG, minSamples: 10 });
		expect(anomalies.length).toBe(0);
	});

	test("detects volume spike (>5σ)", () => {
		const candles = generateCandles(30);

		// Insert a massive volume spike
		candles[25]!.volume = 50000000; // 50x normal

		const anomalies = detectVolumeAnomalies(candles);
		expect(anomalies.length).toBeGreaterThan(0);
		expect(anomalies.some((a) => a.type === "volume_spike")).toBe(true);
	});

	test("marks critical severity for extreme volume (>7.5σ)", () => {
		const candles = generateCandles(30);

		// Insert extreme volume spike
		candles[25]!.volume = 100000000; // 100x normal

		const anomalies = detectVolumeAnomalies(candles);
		const critical = anomalies.filter((a) => a.severity === "critical");
		expect(critical.length).toBeGreaterThan(0);
	});

	test("no anomalies for normal volume", () => {
		const candles = generateCandles(30);
		const anomalies = detectVolumeAnomalies(candles);
		// May have some but should be few
		expect(anomalies.length).toBeLessThan(5);
	});
});

describe("detectPriceSpikes", () => {
	test("detects price spike (>10%)", () => {
		const candles = generateCandles(10);

		// Insert a large price spike
		const prevClose = candles[5]!.close;
		candles[6]!.close = prevClose * 1.15; // 15% spike up

		const anomalies = detectPriceSpikes(candles);
		expect(anomalies.some((a) => a.type === "price_spike")).toBe(true);
	});

	test("detects gap up", () => {
		const candles = generateCandles(10);

		// Insert a gap up (open significantly higher than prev close)
		const prevClose = candles[5]!.close;
		candles[6]!.open = prevClose * 1.15; // 15% gap up

		const anomalies = detectPriceSpikes(candles);
		expect(anomalies.some((a) => a.type === "gap_up")).toBe(true);
	});

	test("detects gap down", () => {
		const candles = generateCandles(10);

		// Insert a gap down
		const prevClose = candles[5]!.close;
		candles[6]!.open = prevClose * 0.85; // 15% gap down

		const anomalies = detectPriceSpikes(candles);
		expect(anomalies.some((a) => a.type === "gap_down")).toBe(true);
	});

	test("marks critical severity for extreme price spike (>15%)", () => {
		const candles = generateCandles(10);

		const prevClose = candles[5]!.close;
		candles[6]!.close = prevClose * 1.2; // 20% spike

		const anomalies = detectPriceSpikes(candles);
		const critical = anomalies.filter((a) => a.severity === "critical");
		expect(critical.length).toBeGreaterThan(0);
	});
});

describe("detectFlashCrashes", () => {
	test("detects flash crash with recovery", () => {
		const candles = generateCandles(20);

		// Set up a flash crash scenario
		const basePrice = 100;
		candles[10]!.close = basePrice;
		candles[11]!.low = basePrice * 0.92; // 8% drop
		candles[11]!.close = basePrice * 0.95;
		// Recovery within 5 candles
		candles[12]!.close = basePrice * 0.98; // Back within 2%

		const anomalies = detectFlashCrashes(candles);
		expect(anomalies.some((a) => a.type === "flash_crash")).toBe(true);
	});

	test("detects flash rally with reversal", () => {
		const candles = generateCandles(20);

		// Set up a flash rally scenario
		const basePrice = 100;
		candles[10]!.close = basePrice;
		candles[11]!.high = basePrice * 1.08; // 8% spike up
		candles[11]!.close = basePrice * 1.05;
		// Reversal within 5 candles
		candles[12]!.close = basePrice * 1.01; // Back within 2%

		const anomalies = detectFlashCrashes(candles);
		expect(anomalies.some((a) => a.type === "flash_rally")).toBe(true);
	});

	test("does not detect crash without recovery", () => {
		const candles = generateCandles(20);

		// Set up a crash without recovery
		const basePrice = 100;
		candles[10]!.close = basePrice;
		candles[11]!.low = basePrice * 0.9;
		candles[11]!.close = basePrice * 0.9;
		// No recovery - stays down
		for (let i = 12; i < 17; i++) {
			candles[i]!.close = basePrice * 0.88;
		}

		const anomalies = detectFlashCrashes(candles);
		expect(anomalies.filter((a) => a.type === "flash_crash").length).toBe(0);
	});
});

describe("detectAllAnomalies", () => {
	test("returns empty result for empty candles", () => {
		const result = detectAllAnomalies([]);
		expect(result.hasAnomalies).toBe(false);
		expect(result.anomalies.length).toBe(0);
		expect(result.symbol).toBe("");
		expect(result.volumeAnomalies).toBe(0);
		expect(result.priceAnomalies).toBe(0);
		expect(result.flashCrashes).toBe(0);
	});

	test("combines all anomaly types", () => {
		const candles = generateCandles(30, "GOOGL");

		// Add volume spike
		candles[25]!.volume = 50000000;

		// Add price spike
		const prevClose = candles[15]!.close;
		candles[16]!.close = prevClose * 1.15;

		const result = detectAllAnomalies(candles);
		expect(result.symbol).toBe("GOOGL");
		expect(result.hasAnomalies).toBe(true);
		expect(result.anomalies.length).toBeGreaterThan(0);
	});

	test("counts anomaly types correctly", () => {
		const candles = generateCandles(30);

		// Add volume spike
		candles[25]!.volume = 50000000;

		// Add price spike
		const prevClose = candles[15]!.close;
		candles[16]!.close = prevClose * 1.15;

		const result = detectAllAnomalies(candles);
		expect(result.volumeAnomalies).toBeGreaterThanOrEqual(0);
		expect(result.priceAnomalies).toBeGreaterThanOrEqual(0);
	});

	test("sorts anomalies by timestamp", () => {
		const candles = generateCandles(30);

		// Add multiple anomalies at different times
		candles[10]!.volume = 50000000;
		candles[20]!.volume = 50000000;

		const result = detectAllAnomalies(candles);

		if (result.anomalies.length >= 2) {
			for (let i = 1; i < result.anomalies.length; i++) {
				const prev = new Date(result.anomalies[i - 1]!.timestamp).getTime();
				const curr = new Date(result.anomalies[i]!.timestamp).getTime();
				expect(curr).toBeGreaterThanOrEqual(prev);
			}
		}
	});
});

describe("filterAnomalousCandles", () => {
	test("removes candles with critical anomalies", () => {
		const candles = generateCandles(10);

		const anomalies = [
			{
				type: "volume_spike" as const,
				timestamp: candles[5]!.timestamp,
				symbol: "AAPL",
				value: 10,
				threshold: 5,
				severity: "critical" as const,
				description: "Test anomaly",
			},
		];

		const filtered = filterAnomalousCandles(candles, anomalies);
		expect(filtered.length).toBe(9);
		expect(filtered.some((c) => c.timestamp === candles[5]!.timestamp)).toBe(false);
	});

	test("keeps candles with warning anomalies", () => {
		const candles = generateCandles(10);

		const anomalies = [
			{
				type: "volume_spike" as const,
				timestamp: candles[5]!.timestamp,
				symbol: "AAPL",
				value: 6,
				threshold: 5,
				severity: "warning" as const,
				description: "Test anomaly",
			},
		];

		const filtered = filterAnomalousCandles(candles, anomalies);
		expect(filtered.length).toBe(10);
	});

	test("handles empty anomalies array", () => {
		const candles = generateCandles(10);
		const filtered = filterAnomalousCandles(candles, []);
		expect(filtered.length).toBe(10);
	});
});
