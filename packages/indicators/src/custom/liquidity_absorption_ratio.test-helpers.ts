import type { OHLCVBar } from "../types";

const DAY_MS = 86400000;
const DEFAULT_VOLUME = 1000000;

export function generateBars(count: number, startPrice = 100, volatility = 0.02): OHLCVBar[] {
	const bars: OHLCVBar[] = [];
	let price = startPrice;
	const baseTime = Date.now() - count * DAY_MS;

	for (let i = 0; i < count; i++) {
		const change = (Math.random() - 0.5) * 2 * volatility;
		const open = price;
		const high = price * (1 + Math.abs(change) + Math.random() * 0.01);
		const low = price * (1 - Math.abs(change) - Math.random() * 0.01);
		price *= 1 + change;

		bars.push({
			timestamp: baseTime + i * DAY_MS,
			open,
			high,
			low,
			close: price,
			volume: Math.floor(DEFAULT_VOLUME + Math.random() * 500000),
		});
	}

	return bars;
}

export function generateBullishCandleWithWick(
	upperWickRatio: number,
	lowerWickRatio: number,
	basePrice = 100,
	totalRange = 10,
	volume = DEFAULT_VOLUME,
	timestamp = Date.now(),
): OHLCVBar {
	const low = basePrice;
	const high = basePrice + totalRange;
	const bodySize = totalRange * (1 - upperWickRatio - lowerWickRatio);
	const open = low + totalRange * lowerWickRatio;
	const close = open + bodySize;

	return {
		timestamp,
		open,
		high,
		low,
		close,
		volume,
	};
}

export function generateBearishCandleWithWick(
	upperWickRatio: number,
	lowerWickRatio: number,
	basePrice = 100,
	totalRange = 10,
	volume = DEFAULT_VOLUME,
	timestamp = Date.now(),
): OHLCVBar {
	const low = basePrice;
	const high = basePrice + totalRange;
	const bodySize = totalRange * (1 - upperWickRatio - lowerWickRatio);
	const close = low + totalRange * lowerWickRatio;
	const open = close + bodySize;

	return {
		timestamp,
		open,
		high,
		low,
		close,
		volume,
	};
}

export function generateLowAbsorptionBars(count: number): OHLCVBar[] {
	const bars: OHLCVBar[] = [];
	const baseTime = Date.now() - count * DAY_MS;

	for (let i = 0; i < count; i++) {
		const timestamp = baseTime + i * DAY_MS;
		if (i % 2 === 0) {
			bars.push(generateBullishCandleWithWick(0.05, 0.05, 100, 10, DEFAULT_VOLUME, timestamp));
			continue;
		}

		bars.push(generateBearishCandleWithWick(0.05, 0.05, 100, 10, DEFAULT_VOLUME, timestamp));
	}

	return bars;
}
