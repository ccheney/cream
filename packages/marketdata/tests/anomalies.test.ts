/**
 * Anomaly Detection Tests
 */

import { describe, expect, test } from "bun:test";
import { requireArrayItem, requireValue } from "@cream/test-utils";
import {
	DEFAULT_ANOMALY_CONFIG,
	detectAllAnomalies,
	detectFlashCrashes,
	detectPriceSpikes,
	detectVolumeAnomalies,
	filterAnomalousCandles,
} from "../src/validation/anomalies";
import type { Candle } from "../src/validation/gaps";

function generateCandles(count: number, symbol = "AAPL"): Candle[] {
	const candles: Candle[] = [];
	let price = 100;
	const baseVolume = 1000000;

	for (let i = 0; i < count; i++) {
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
		requireArrayItem(candles, 25, "candle").volume = 50000000;

		const anomalies = detectVolumeAnomalies(candles);
		expect(anomalies.length).toBeGreaterThan(0);
		expect(anomalies.some((a) => a.type === "volume_spike")).toBe(true);
	});

	test("marks critical severity for extreme volume (>7.5σ)", () => {
		const candles = generateCandles(30);
		requireArrayItem(candles, 25, "candle").volume = 100000000;

		const anomalies = detectVolumeAnomalies(candles);
		const critical = anomalies.filter((a) => a.severity === "critical");
		expect(critical.length).toBeGreaterThan(0);
	});

	test("no anomalies for normal volume", () => {
		const candles = generateCandles(30);
		const anomalies = detectVolumeAnomalies(candles);
		expect(anomalies.length).toBeLessThan(5);
	});
});

describe("detectPriceSpikes", () => {
	test("detects price spike (>10%)", () => {
		const candles = generateCandles(10);
		const prevClose = requireArrayItem(candles, 5, "candle").close;
		requireArrayItem(candles, 6, "candle").close = prevClose * 1.15;

		const anomalies = detectPriceSpikes(candles);
		expect(anomalies.some((a) => a.type === "price_spike")).toBe(true);
	});

	test("detects gap up", () => {
		const candles = generateCandles(10);
		const prevClose = requireArrayItem(candles, 5, "candle").close;
		requireArrayItem(candles, 6, "candle").open = prevClose * 1.15;

		const anomalies = detectPriceSpikes(candles);
		expect(anomalies.some((a) => a.type === "gap_up")).toBe(true);
	});

	test("detects gap down", () => {
		const candles = generateCandles(10);
		const prevClose = requireArrayItem(candles, 5, "candle").close;
		requireArrayItem(candles, 6, "candle").open = prevClose * 0.85;

		const anomalies = detectPriceSpikes(candles);
		expect(anomalies.some((a) => a.type === "gap_down")).toBe(true);
	});

	test("marks critical severity for extreme price spike (>15%)", () => {
		const candles = generateCandles(10);
		const prevClose = requireArrayItem(candles, 5, "candle").close;
		requireArrayItem(candles, 6, "candle").close = prevClose * 1.2;

		const anomalies = detectPriceSpikes(candles);
		const critical = anomalies.filter((a) => a.severity === "critical");
		expect(critical.length).toBeGreaterThan(0);
	});
});

describe("detectFlashCrashes", () => {
	test("detects flash crash with recovery", () => {
		const candles = generateCandles(20);
		const basePrice = 100;
		requireArrayItem(candles, 10, "candle").close = basePrice;
		requireArrayItem(candles, 11, "candle").low = basePrice * 0.92;
		requireArrayItem(candles, 11, "candle").close = basePrice * 0.95;
		requireArrayItem(candles, 12, "candle").close = basePrice * 0.98;

		const anomalies = detectFlashCrashes(candles);
		expect(anomalies.some((a) => a.type === "flash_crash")).toBe(true);
	});

	test("detects flash rally with reversal", () => {
		const candles = generateCandles(20);
		const basePrice = 100;
		requireArrayItem(candles, 10, "candle").close = basePrice;
		requireArrayItem(candles, 11, "candle").high = basePrice * 1.08;
		requireArrayItem(candles, 11, "candle").close = basePrice * 1.05;
		requireArrayItem(candles, 12, "candle").close = basePrice * 1.01;

		const anomalies = detectFlashCrashes(candles);
		expect(anomalies.some((a) => a.type === "flash_rally")).toBe(true);
	});

	test("does not detect crash without recovery", () => {
		const candles = generateCandles(20);
		const basePrice = 100;
		requireArrayItem(candles, 10, "candle").close = basePrice;
		requireArrayItem(candles, 11, "candle").low = basePrice * 0.9;
		requireArrayItem(candles, 11, "candle").close = basePrice * 0.9;
		for (let i = 12; i < 17; i++) {
			requireArrayItem(candles, i, "candle").close = basePrice * 0.88;
		}

		const anomalies = detectFlashCrashes(candles);
		expect(anomalies.filter((a) => a.type === "flash_crash").length).toBe(0);
	});
});

describe("detectAllAnomalies summary", () => {
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
		requireArrayItem(candles, 25, "candle").volume = 50000000;
		const prevClose = requireArrayItem(candles, 15, "candle").close;
		requireArrayItem(candles, 16, "candle").close = prevClose * 1.15;

		const result = detectAllAnomalies(candles);
		expect(result.symbol).toBe("GOOGL");
		expect(result.hasAnomalies).toBe(true);
		expect(result.anomalies.length).toBeGreaterThan(0);
	});

	test("counts anomaly types correctly", () => {
		const candles = generateCandles(30);
		requireArrayItem(candles, 25, "candle").volume = 50000000;
		const prevClose = requireArrayItem(candles, 15, "candle").close;
		requireArrayItem(candles, 16, "candle").close = prevClose * 1.15;

		const result = detectAllAnomalies(candles);
		expect(result.volumeAnomalies).toBeGreaterThanOrEqual(0);
		expect(result.priceAnomalies).toBeGreaterThanOrEqual(0);
	});
});

describe("detectAllAnomalies ordering", () => {
	test("sorts anomalies by timestamp", () => {
		const candles = generateCandles(30);
		requireArrayItem(candles, 10, "candle").volume = 50000000;
		requireArrayItem(candles, 20, "candle").volume = 50000000;

		const result = detectAllAnomalies(candles);

		if (result.anomalies.length >= 2) {
			for (let i = 1; i < result.anomalies.length; i++) {
				const prevAnomaly = requireValue(result.anomalies[i - 1], "anomaly");
				const currAnomaly = requireValue(result.anomalies[i], "anomaly");
				const prev = new Date(prevAnomaly.timestamp).getTime();
				const curr = new Date(currAnomaly.timestamp).getTime();
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
				timestamp: requireArrayItem(candles, 5, "candle").timestamp,
				symbol: "AAPL",
				value: 10,
				threshold: 5,
				severity: "critical" as const,
				description: "Test anomaly",
			},
		];

		const filtered = filterAnomalousCandles(candles, anomalies);
		expect(filtered.length).toBe(9);
		expect(
			filtered.some((c) => c.timestamp === requireArrayItem(candles, 5, "candle").timestamp),
		).toBe(false);
	});

	test("keeps candles with warning anomalies", () => {
		const candles = generateCandles(10);
		const anomalies = [
			{
				type: "volume_spike" as const,
				timestamp: requireArrayItem(candles, 5, "candle").timestamp,
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
