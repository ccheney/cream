import { calculateATR } from "../calculators/price/atr";
import { calculateRSI } from "../calculators/price/rsi";
import { calculateSMA } from "../calculators/price/sma";
import type { OHLCVBar } from "./calculator-schemas";

export interface IndicatorPipelineConfig {
	timeframes: string[];
	basePeriod: number;
	includeVolume: boolean;
}

export const DEFAULT_PIPELINE_CONFIG: IndicatorPipelineConfig = {
	timeframes: ["1d", "1h", "15m"],
	basePeriod: 14,
	includeVolume: true,
};

export interface TransformConfig {
	method: "zscore" | "minmax" | "robust";
	lookbackPeriod: number;
	clipOutliers: boolean;
	clipThreshold: number;
}

export const DEFAULT_TRANSFORM_CONFIG: TransformConfig = {
	method: "zscore",
	lookbackPeriod: 20,
	clipOutliers: true,
	clipThreshold: 3,
};

export interface MultiTimeframeIndicators {
	[timeframe: string]: {
		[indicator: string]: number | null;
	};
}

export function calculateMultiTimeframeIndicators(
	candles: OHLCVBar[],
	config: Partial<IndicatorPipelineConfig> = {},
): MultiTimeframeIndicators {
	if (candles.length === 0) {
		return {};
	}

	const period = { ...DEFAULT_PIPELINE_CONFIG, ...config }.basePeriod;
	const rsiResult = calculateRSI(candles, period);
	const indicators: Record<string, number | null> = {
		[`rsi_${period}`]: rsiResult?.rsi ?? null,
		[`sma_${period}`]: calculateSMA(candles, period),
		[`atr_${period}`]: calculateATR(candles, period),
	};

	return { "1h": indicators };
}

export interface TransformedFeatures {
	[feature: string]: number;
}

function mean(values: number[]): number {
	if (values.length === 0) {
		return 0;
	}
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values: number[], valueMean?: number): number {
	if (values.length < 2) {
		return 0;
	}
	const m = valueMean ?? mean(values);
	const variance = values.reduce((sum, value) => sum + (value - m) ** 2, 0) / (values.length - 1);
	return Math.sqrt(variance);
}

function median(values: number[]): number {
	if (values.length === 0) {
		return 0;
	}
	const sorted = values.toSorted((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 0) {
		return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
	}
	return sorted[mid] ?? 0;
}

function iqr(values: number[]): number {
	if (values.length < 4) {
		return 0;
	}
	const sorted = values.toSorted((a, b) => a - b);
	const q1 = sorted[Math.floor(sorted.length * 0.25)] ?? 0;
	const q3 = sorted[Math.floor(sorted.length * 0.75)] ?? 0;
	return q3 - q1;
}

function normalizeZScore(value: number, values: number[]): number | null {
	const m = mean(values);
	const s = stdDev(values, m);
	if (s === 0) {
		return null;
	}
	return (value - m) / s;
}

function normalizeMinMax(value: number, values: number[]): number | null {
	const min = Math.min(...values);
	const max = Math.max(...values);
	const range = max - min;
	if (range === 0) {
		return null;
	}
	return (value - min) / range;
}

function normalizeRobust(value: number, values: number[]): number | null {
	const interquartileRange = iqr(values);
	if (interquartileRange === 0) {
		return null;
	}
	return (value - median(values)) / interquartileRange;
}

function clipOutlier(value: number, values: number[], threshold: number): number {
	const m = mean(values);
	const s = stdDev(values, m);
	if (s === 0) {
		return value;
	}
	return Math.max(m - threshold * s, Math.min(m + threshold * s, value));
}

function extractFeatureSeries(
	candles: OHLCVBar[],
	feature: "close" | "return" | "volume" | "high_low_range",
): number[] {
	if (feature === "close") {
		return candles.map((candle) => candle.close);
	}
	if (feature === "volume") {
		return candles.map((candle) => candle.volume);
	}
	if (feature === "high_low_range") {
		return candles.map((candle) =>
			candle.close !== 0 ? (candle.high - candle.low) / candle.close : 0,
		);
	}

	const returns: number[] = [];
	for (let index = 1; index < candles.length; index += 1) {
		const previous = candles[index - 1];
		const current = candles[index];
		if (previous && current && previous.close !== 0) {
			returns.push((current.close - previous.close) / previous.close);
		}
	}
	return returns;
}

function normalizeValue(
	value: number,
	values: number[],
	method: TransformConfig["method"],
): number | null {
	switch (method) {
		case "zscore":
			return normalizeZScore(value, values);
		case "minmax":
			return normalizeMinMax(value, values);
		case "robust":
			return normalizeRobust(value, values);
	}
}

export function applyTransforms(
	candles: OHLCVBar[],
	timeframe: string,
	config: Partial<TransformConfig> = {},
): TransformedFeatures {
	if (candles.length < 2) {
		return {};
	}

	const fullConfig = { ...DEFAULT_TRANSFORM_CONFIG, ...config };
	const features = ["close", "return", "volume", "high_low_range"] as const;
	const result: TransformedFeatures = {};

	for (const feature of features) {
		const series = extractFeatureSeries(candles, feature);
		if (series.length < fullConfig.lookbackPeriod) {
			continue;
		}
		const lookbackValues = series.slice(-fullConfig.lookbackPeriod);
		const lastValue = series.at(-1);
		if (lastValue === undefined) {
			continue;
		}
		const value = fullConfig.clipOutliers
			? clipOutlier(lastValue, lookbackValues, fullConfig.clipThreshold)
			: lastValue;
		const normalizedValue = normalizeValue(value, lookbackValues, fullConfig.method);
		if (normalizedValue !== null && Number.isFinite(normalizedValue)) {
			result[`${fullConfig.method}_${feature}_${fullConfig.lookbackPeriod}_${timeframe}`] =
				normalizedValue;
		}
	}

	return result;
}
