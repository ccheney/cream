/**
 * GMM Classifier Tests
 */

import { describe, expect, it } from "bun:test";
import type { OHLCVBar } from "@cream/indicators";
import { requireValue } from "@cream/test-utils";
import {
	calculateMean,
	calculateStd,
	calculateZScore,
	extractFeatures,
	extractSingleFeature,
	getMinimumCandleCount,
	normalizeFeatures,
} from "../src/features";
import {
	classifySeriesWithGMM,
	classifyWithGMM,
	deserializeGMMModel,
	serializeGMMModel,
	trainGMM,
} from "../src/gmmClassifier";

function createOHLCVBar(
	timestamp: string,
	close: number,
	volume = 1000000,
	overrides: Partial<OHLCVBar> = {},
): OHLCVBar {
	return {
		timestamp: new Date(timestamp).getTime(),
		open: close * 0.995,
		high: close * 1.01,
		low: close * 0.99,
		close,
		volume,
		...overrides,
	};
}

function generateTrendingOHLCVBars(
	startPrice: number,
	direction: "up" | "down",
	count: number,
	volatility = 0.01,
): OHLCVBar[] {
	const candles: OHLCVBar[] = [];
	let price = startPrice;
	const baseDate = new Date("2024-01-01");

	for (let i = 0; i < count; i++) {
		const drift = direction === "up" ? 0.002 : -0.002;
		const noise = (Math.random() - 0.5) * volatility;
		price = price * (1 + drift + noise);

		const date = new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000);
		candles.push(createOHLCVBar(date.toISOString(), price));
	}

	return candles;
}

function generateRangeBoundOHLCVBars(
	basePrice: number,
	count: number,
	volatility = 0.01,
): OHLCVBar[] {
	const candles: OHLCVBar[] = [];
	const baseDate = new Date("2024-01-01");

	for (let i = 0; i < count; i++) {
		const deviation = (Math.random() - 0.5) * volatility * 2;
		const price = basePrice * (1 + deviation);

		const date = new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000);
		candles.push(createOHLCVBar(date.toISOString(), price));
	}

	return candles;
}

function generateHighVolatilityOHLCVBars(basePrice: number, count: number): OHLCVBar[] {
	const candles: OHLCVBar[] = [];
	let price = basePrice;
	const baseDate = new Date("2024-01-01");

	for (let i = 0; i < count; i++) {
		const swing = (Math.random() - 0.5) * 0.08;
		price = price * (1 + swing);

		const date = new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000);
		candles.push(createOHLCVBar(date.toISOString(), price, 2000000));
	}

	return candles;
}

describe("calculateMean", () => {
	it("calculates mean correctly", () => {
		expect(calculateMean([1, 2, 3, 4, 5])).toBe(3);
	});

	it("throws for empty array", () => {
		expect(() => calculateMean([])).toThrow("Cannot calculate mean of empty array");
	});
});

describe("calculateStd", () => {
	it("calculates standard deviation correctly", () => {
		const std = calculateStd([2, 4, 4, 4, 5, 5, 7, 9]);
		expect(std).toBeCloseTo(2, 1);
	});

	it("throws for single element", () => {
		expect(() => calculateStd([5])).toThrow(
			"Cannot calculate standard deviation with single value",
		);
	});

	it("throws for empty array", () => {
		expect(() => calculateStd([])).toThrow("Cannot calculate standard deviation of empty array");
	});
});

describe("calculateZScore", () => {
	it("calculates z-score correctly", () => {
		const sample = [10, 20, 30, 40, 50];
		const zScore = calculateZScore(50, sample);
		expect(zScore).toBeGreaterThan(1);
	});

	it("throws for zero std", () => {
		const sample = [5, 5, 5, 5, 5];
		expect(() => calculateZScore(6, sample)).toThrow(
			"Cannot calculate z-score: standard deviation is near zero",
		);
	});
});

describe("extractFeatures", () => {
	it("extracts features from candles", () => {
		const candles = generateTrendingOHLCVBars(100, "up", 50);
		const features = extractFeatures(candles);

		expect(features.length).toBeGreaterThan(0);
		expect(features[0]).toHaveProperty("returns");
		expect(features[0]).toHaveProperty("volatility");
		expect(features[0]).toHaveProperty("volumeZScore");
		expect(features[0]).toHaveProperty("trendStrength");
	});

	it("returns empty for insufficient data", () => {
		const candles = generateTrendingOHLCVBars(100, "up", 5);
		const features = extractFeatures(candles);
		expect(features.length).toBe(0);
	});
});

describe("extractSingleFeature", () => {
	it("extracts single feature for latest candle", () => {
		const candles = generateTrendingOHLCVBars(100, "up", 50);
		const feature = extractSingleFeature(candles);

		expect(feature).not.toBeNull();
		const lastOHLCVBar = candles.at(-1);
		const safeFeature = requireValue(feature, "feature");
		const safeLast = requireValue(lastOHLCVBar, "last OHLCV bar");
		expect(safeFeature.timestamp).toBe(new Date(safeLast.timestamp).toISOString());
	});
});

describe("getMinimumCandleCount", () => {
	it("returns correct minimum", () => {
		const min = getMinimumCandleCount();
		expect(min).toBe(21);
	});
});

describe("normalizeFeatures", () => {
	it("normalizes features to zero mean and unit variance", () => {
		const candles = generateTrendingOHLCVBars(100, "up", 100);
		const features = extractFeatures(candles);
		const { normalized, means, stds } = normalizeFeatures(features);

		expect(normalized.length).toBe(features.length);
		expect(means.length).toBe(4);
		expect(stds.length).toBe(4);

		const normalizedMean =
			normalized.reduce((sum, row) => sum + requireValue(row[0], "normalized value"), 0) /
			normalized.length;
		expect(Math.abs(normalizedMean)).toBeLessThan(0.1);
	});
});

describe("trainGMM", () => {
	it("trains a GMM model", () => {
		const candles = [
			...generateTrendingOHLCVBars(100, "up", 100),
			...generateTrendingOHLCVBars(150, "down", 100),
			...generateRangeBoundOHLCVBars(120, 100),
		];

		const model = trainGMM(candles);

		expect(model.k).toBe(5);
		expect(model.clusters.length).toBe(5);
		expect(model.featureMeans.length).toBe(4);
		expect(model.featureStds.length).toBe(4);
		expect(model.trainingSamples).toBeGreaterThan(0);
	});

	it("throws for insufficient data", () => {
		const candles = generateTrendingOHLCVBars(100, "up", 30);
		expect(() => trainGMM(candles)).toThrow("Insufficient data");
	});

	it("assigns regime labels to clusters", () => {
		const candles = [
			...generateTrendingOHLCVBars(100, "up", 150),
			...generateTrendingOHLCVBars(200, "down", 150),
			...generateHighVolatilityOHLCVBars(150, 150),
		];

		const model = trainGMM(candles);
		const regimeLabels = model.clusters.map((cluster) => cluster.regime);

		expect(regimeLabels).toContain("BULL_TREND");
		expect(regimeLabels).toContain("BEAR_TREND");
		expect(regimeLabels).toContain("HIGH_VOL");
	});
});

describe("classifyWithGMM", () => {
	it("classifies candles with trained model", () => {
		const trainingOHLCVBars = [
			...generateTrendingOHLCVBars(100, "up", 150),
			...generateTrendingOHLCVBars(200, "down", 150),
			...generateRangeBoundOHLCVBars(150, 150),
		];
		const model = trainGMM(trainingOHLCVBars);

		const testOHLCVBars = generateTrendingOHLCVBars(100, "up", 50);
		const result = classifyWithGMM(model, testOHLCVBars);

		expect(result).not.toBeNull();
		const safeResult = requireValue(result, "classification result");
		expect(safeResult.regime).toBeDefined();
		expect(safeResult.confidence).toBeGreaterThan(0);
		expect(safeResult.clusterProbabilities.length).toBe(5);
	});

	it("returns null for insufficient test data", () => {
		const trainingOHLCVBars = generateTrendingOHLCVBars(100, "up", 300);
		const model = trainGMM(trainingOHLCVBars);

		const testOHLCVBars = generateTrendingOHLCVBars(100, "up", 5);
		const result = classifyWithGMM(model, testOHLCVBars);
		expect(result).toBeNull();
	});
});

describe("classifySeriesWithGMM", () => {
	it("classifies a series of candles", () => {
		const trainingOHLCVBars = [
			...generateTrendingOHLCVBars(100, "up", 150),
			...generateTrendingOHLCVBars(200, "down", 150),
			...generateRangeBoundOHLCVBars(150, 150),
		];
		const model = trainGMM(trainingOHLCVBars);

		const testOHLCVBars = generateTrendingOHLCVBars(100, "up", 100);
		const results = classifySeriesWithGMM(model, testOHLCVBars);

		expect(results.length).toBeGreaterThan(0);
		expect(results[0]).toHaveProperty("regime");
		expect(results[0]).toHaveProperty("timestamp");
	});
});

describe("Model Serialization", () => {
	it("serializes and deserializes model", () => {
		const candles = generateTrendingOHLCVBars(100, "up", 300);
		const model = trainGMM(candles);

		const json = serializeGMMModel(model);
		expect(typeof json).toBe("string");

		const restored = deserializeGMMModel(json);
		expect(restored.k).toBe(model.k);
		expect(restored.clusters.length).toBe(model.clusters.length);
		expect(restored.featureMeans).toEqual(model.featureMeans);
	});
});
