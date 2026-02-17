/**
 * Data Quality Validation Tests
 */

import { expect, it } from "bun:test";
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

function createCandle(
	timestamp: string,
	close: number,
	volume = 1_000_000,
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

function createCandleSeries(count: number, startPrice = 100, intervalMs = 3_600_000): Candle[] {
	const candles: Candle[] = [];
	const baseTime = Date.now() - count * intervalMs;
	for (let i = 0; i < count; i++) {
		const variation = Math.sin(i * 0.5) * 2;
		const price = startPrice + variation;
		candles.push(
			createCandle(
				new Date(baseTime + i * intervalMs).toISOString(),
				price,
				1_000_000 + (i % 10) * 10_000,
			),
		);
	}
	return candles;
}

it("checkStaleness detects stale data", () => {
	const oldTimestamp = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
	const result = checkStaleness(oldTimestamp, "1h");
	expect(result.isStale).toBe(true);
	expect(result.staleMinutes).toBeGreaterThan(120);
});

it("checkStaleness detects fresh data", () => {
	const recentTimestamp = new Date(Date.now() - 30 * 60 * 1000).toISOString();
	const result = checkStaleness(recentTimestamp, "1h");
	expect(result.isStale).toBe(false);
	expect(result.staleMinutes).toBeLessThan(120);
});

it("checkStaleness handles null timestamp", () => {
	const result = checkStaleness(null, "1h");
	expect(result.isStale).toBe(true);
	expect(result.staleMinutes).toBe(Infinity);
});

it("checkStaleness uses timeframe thresholds", () => {
	const timestamp = new Date(Date.now() - 15 * 60 * 1000).toISOString();
	expect(checkStaleness(timestamp, "1m").isStale).toBe(true);
	expect(checkStaleness(timestamp, "1d").isStale).toBe(false);
});

it("getStaleSymbols returns only stale symbols", () => {
	const timestamps = new Map<string, string | null>([
		["AAPL", new Date(Date.now() - 30 * 60 * 1000).toISOString()],
		["MSFT", new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()],
		["GOOGL", null],
	]);
	const stale = getStaleSymbols(timestamps, "1h");
	expect(stale).toContain("MSFT");
	expect(stale).toContain("GOOGL");
	expect(stale).not.toContain("AAPL");
});

it("isFresh returns true for fresh data and false for stale data", () => {
	expect(isFresh(new Date(Date.now() - 30 * 60 * 1000).toISOString(), "1h")).toBe(true);
	expect(isFresh(new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), "1h")).toBe(false);
});

it("detectGaps finds missing candles", () => {
	const candles = createCandleSeries(5);
	const previous = requireArrayItem(candles, 1, "candle");
	candles[2] = createCandle(
		new Date(new Date(previous.timestamp).getTime() + 3 * 3_600_000).toISOString(),
		100,
	);
	const result = detectGaps(candles);
	expect(result.hasGaps).toBe(true);
	expect(result.gapCount).toBe(1);
	expect(result.gaps[0]?.gapCandles).toBe(2);
});

it("detectGaps reports no gaps in continuous data", () => {
	const result = detectGaps(createCandleSeries(10));
	expect(result.hasGaps).toBe(false);
	expect(result.gapCount).toBe(0);
});

it("detectGaps handles empty input", () => {
	const result = detectGaps([]);
	expect(result.hasGaps).toBe(false);
	expect(result.totalCandles).toBe(0);
});

it("fillGaps fills single-candle gaps", () => {
	const candles: Candle[] = [
		createCandle(new Date(1000 * 3_600_000).toISOString(), 100),
		createCandle(new Date(1002 * 3_600_000).toISOString(), 102),
	];
	const filled = fillGaps(candles, 1);
	expect(filled.length).toBe(3);
	const interpolated = requireArrayItem(filled, 1, "filled candle");
	expect("interpolated" in interpolated && interpolated.interpolated).toBe(true);
});

it("fillGaps does not fill multi-candle gaps by default", () => {
	const candles: Candle[] = [
		createCandle(new Date(1000 * 3_600_000).toISOString(), 100),
		createCandle(new Date(1005 * 3_600_000).toISOString(), 105),
	];
	expect(fillGaps(candles, 1).length).toBe(2);
});

it("interpolateCandle creates expected synthetic candle", () => {
	const prev = createCandle("2024-01-01T10:00:00Z", 100);
	const next = createCandle("2024-01-01T12:00:00Z", 102);
	const interpolated = interpolateCandle(prev, next, "2024-01-01T11:00:00Z");
	expect(interpolated.interpolated).toBe(true);
	expect(interpolated.open).toBe(prev.close);
	expect(interpolated.close).toBe(next.open);
	expect(interpolated.volume).toBe(0);
});

it("detectVolumeAnomalies finds volume spikes", () => {
	const candles = createCandleSeries(30);
	requireArrayItem(candles, 25, "candle").volume = 10_000_000;
	const anomalies = detectVolumeAnomalies(candles);
	expect(anomalies.length).toBeGreaterThan(0);
	expect(anomalies.some((a) => a.type === "volume_spike")).toBe(true);
});

it("detectVolumeAnomalies ignores normal variation", () => {
	const anomalies = detectVolumeAnomalies(createCandleSeries(30));
	expect(anomalies.filter((a) => a.type === "volume_spike").length).toBe(0);
});

it("detectPriceSpikes finds >10% moves", () => {
	const candles = createCandleSeries(10);
	const spikeCandle = requireArrayItem(candles, 5, "candle");
	const priorCandle = requireArrayItem(candles, 4, "candle");
	spikeCandle.close = priorCandle.close * 1.15;
	const anomalies = detectPriceSpikes(candles);
	expect(anomalies.length).toBeGreaterThan(0);
	expect(anomalies.some((a) => a.type === "price_spike")).toBe(true);
});

it("detectPriceSpikes detects gap up", () => {
	const candles = createCandleSeries(10);
	const gapCandle = requireArrayItem(candles, 5, "candle");
	const priorCandle = requireArrayItem(candles, 4, "candle");
	gapCandle.open = priorCandle.close * 1.12;
	expect(detectPriceSpikes(candles).some((a) => a.type === "gap_up")).toBe(true);
});

it("detectFlashCrashes detects crash and recovery pattern", () => {
	const candles = createCandleSeries(20);
	const basePrice = requireArrayItem(candles, 10, "candle").close;
	requireArrayItem(candles, 11, "candle").low = basePrice * 0.94;
	requireArrayItem(candles, 11, "candle").close = basePrice * 0.95;
	requireArrayItem(candles, 12, "candle").close = basePrice * 0.98;
	expect(detectFlashCrashes(candles).some((a) => a.type === "flash_crash")).toBe(true);
});

it("detectAllAnomalies combines anomaly types", () => {
	const candles = createCandleSeries(30);
	requireArrayItem(candles, 25, "candle").volume = 10_000_000;
	const priceSpike = requireArrayItem(candles, 20, "candle");
	const priorCandle = requireArrayItem(candles, 19, "candle");
	priceSpike.close = priorCandle.close * 1.15;
	const result = detectAllAnomalies(candles);
	expect(result.hasAnomalies).toBe(true);
	expect(result.anomalies.length).toBeGreaterThan(0);
});

it("validateCandleData returns valid for good data", () => {
	const candles = createCandleSeries(50);
	requireArrayItem(candles, candles.length - 1, "candle").timestamp = new Date().toISOString();
	const result = validateCandleData(candles);
	expect(result.isValid).toBe(true);
	expect(result.qualityScore).toBeGreaterThan(80);
});

it("validateCandleData detects stale data", () => {
	const candles = createCandleSeries(50);
	requireArrayItem(candles, candles.length - 1, "candle").timestamp = new Date(
		Date.now() - 5 * 60 * 60 * 1000,
	).toISOString();
	const result = validateCandleData(candles);
	expect(result.staleness?.isStale).toBe(true);
	expect(result.issues.some((i) => i.type === "staleness")).toBe(true);
});

it("validateCandleData detects gaps when calendar awareness is disabled", () => {
	const candles = createCandleSeries(20);
	const priorCandle = requireArrayItem(candles, 9, "candle");
	requireArrayItem(candles, 10, "candle").timestamp = new Date(
		new Date(priorCandle.timestamp).getTime() + 5 * 3_600_000,
	).toISOString();
	const result = validateCandleData(candles, { calendarAware: false });
	expect(result.gaps?.hasGaps).toBe(true);
	expect(result.issues.some((i) => i.type === "gap")).toBe(true);
});

it("validateCandleData handles empty input", () => {
	const result = validateCandleData([]);
	expect(result.isValid).toBe(false);
	expect(result.qualityScore).toBe(0);
	expect(result.issues.some((i) => i.type === "insufficient_data")).toBe(true);
});

it("isValidCandleData returns expected boolean", () => {
	const candles = createCandleSeries(50);
	requireArrayItem(candles, candles.length - 1, "candle").timestamp = new Date().toISOString();
	expect(isValidCandleData(candles)).toBe(true);
	expect(isValidCandleData([])).toBe(false);
});

it("getQualityScore returns higher score for better data", () => {
	const goodCandles = createCandleSeries(50);
	requireArrayItem(goodCandles, goodCandles.length - 1, "candle").timestamp =
		new Date().toISOString();
	const badCandles = createCandleSeries(5);
	requireArrayItem(badCandles, badCandles.length - 1, "candle").timestamp = new Date(
		Date.now() - 10 * 60 * 60 * 1000,
	).toISOString();
	expect(getQualityScore(goodCandles)).toBeGreaterThanOrEqual(70);
	expect(getQualityScore(badCandles)).toBeLessThan(80);
});
