/**
 * Chart Indicator Calculations
 *
 * Computes moving average series from OHLCV data for chart overlays.
 */

import type { OHLCVData } from "./chart-config";

export interface MASeriesPoint {
	time: number | string;
	value: number;
}

export interface MASeriesConfig {
	period: number;
	color: string;
	label: string;
}

/**
 * Default MA configurations for chart overlays
 */
export const DEFAULT_MA_CONFIGS: Record<string, MASeriesConfig> = {
	sma20: { period: 20, color: "#F59E0B", label: "SMA 20" }, // amber
	sma50: { period: 50, color: "#3B82F6", label: "SMA 50" }, // blue
	sma200: { period: 200, color: "#8B5CF6", label: "SMA 200" }, // purple
	ema12: { period: 12, color: "#10B981", label: "EMA 12" }, // emerald
	ema26: { period: 26, color: "#EF4444", label: "EMA 26" }, // red
};

/**
 * Calculate Simple Moving Average series
 */
export function calculateSMA(data: OHLCVData[], period: number): MASeriesPoint[] {
	if (data.length < period) {
		return [];
	}

	const result: MASeriesPoint[] = [];
	let sum = 0;

	// Initialize sum with first `period` closes
	for (let i = 0; i < period; i++) {
		sum += data[i]?.close ?? 0;
	}

	// First SMA point
	const firstPoint = data[period - 1];
	if (firstPoint) {
		result.push({
			time: firstPoint.time,
			value: sum / period,
		});
	}

	// Sliding window for remaining points
	for (let i = period; i < data.length; i++) {
		const current = data[i];
		const removed = data[i - period];
		if (current && removed) {
			sum = sum - removed.close + current.close;
			result.push({
				time: current.time,
				value: sum / period,
			});
		}
	}

	return result;
}

/**
 * Calculate Exponential Moving Average series
 */
export function calculateEMA(data: OHLCVData[], period: number): MASeriesPoint[] {
	if (data.length < period) {
		return [];
	}

	const result: MASeriesPoint[] = [];
	const k = 2 / (period + 1); // Smoothing factor

	// Initialize with SMA for first EMA value
	let sum = 0;
	for (let i = 0; i < period; i++) {
		sum += data[i]?.close ?? 0;
	}
	let ema = sum / period;

	const firstPoint = data[period - 1];
	if (firstPoint) {
		result.push({
			time: firstPoint.time,
			value: ema,
		});
	}

	// Calculate EMA for remaining points
	for (let i = period; i < data.length; i++) {
		const current = data[i];
		if (current) {
			ema = current.close * k + ema * (1 - k);
			result.push({
				time: current.time,
				value: ema,
			});
		}
	}

	return result;
}

export interface MAOverlay {
	id: string;
	data: MASeriesPoint[];
	color: string;
	label: string;
}

/**
 * Calculate all enabled MA overlays from candle data
 */
export function calculateMAOverlays(
	candles: OHLCVData[],
	enabledMAs: string[] = ["sma20", "sma50", "sma200"]
): MAOverlay[] {
	const overlays: MAOverlay[] = [];

	for (const maId of enabledMAs) {
		const config = DEFAULT_MA_CONFIGS[maId];
		if (!config) {
			continue;
		}

		const isEMA = maId.startsWith("ema");
		const data = isEMA
			? calculateEMA(candles, config.period)
			: calculateSMA(candles, config.period);

		if (data.length > 0) {
			overlays.push({
				id: maId,
				data,
				color: config.color,
				label: config.label,
			});
		}
	}

	return overlays;
}
