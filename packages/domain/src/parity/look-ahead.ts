import { z } from "zod";

export const ParityCandleSchema = z.object({
	timestamp: z.string().datetime(),
	open: z.number().positive(),
	high: z.number().positive(),
	low: z.number().positive(),
	close: z.number().positive(),
	volume: z.number().nonnegative(),
});

export type ParityCandle = z.infer<typeof ParityCandleSchema>;

export interface LookAheadBiasResult {
	valid: boolean;
	violations: Array<{
		type: "future_data" | "non_sequential" | "unadjusted" | "peeking";
		description: string;
		timestamp?: string;
	}>;
}

export function checkLookAheadBias(
	candles: ParityCandle[],
	decisionTimestamp: string,
): LookAheadBiasResult {
	const violations: LookAheadBiasResult["violations"] = [];
	const decisionTime = new Date(decisionTimestamp).getTime();

	for (const candle of candles) {
		const candleTime = new Date(candle.timestamp).getTime();
		if (candleTime > decisionTime) {
			violations.push({
				type: "future_data",
				description: `Candle at ${candle.timestamp} is in the future relative to decision at ${decisionTimestamp}`,
				timestamp: candle.timestamp,
			});
		}
	}

	for (let i = 1; i < candles.length; i++) {
		const prev = candles[i - 1];
		const curr = candles[i];
		if (!prev || !curr) {
			continue;
		}

		const prevTime = new Date(prev.timestamp).getTime();
		const currTime = new Date(curr.timestamp).getTime();

		if (currTime <= prevTime) {
			violations.push({
				type: "non_sequential",
				description: `Candle at ${curr.timestamp} is not after previous candle at ${prev.timestamp}`,
				timestamp: curr.timestamp,
			});
		}
	}

	return {
		valid: violations.length === 0,
		violations,
	};
}

export function validateAdjustedData(
	prices: Array<{
		timestamp: string;
		price: number;
		adjustedPrice: number;
		splitFactor?: number;
		dividendAdjustment?: number;
	}>,
): LookAheadBiasResult {
	const violations: LookAheadBiasResult["violations"] = [];

	for (const priceRecord of prices) {
		if (priceRecord.splitFactor !== undefined && priceRecord.splitFactor !== 1) {
			const expectedAdjusted = priceRecord.price / priceRecord.splitFactor;
			const tolerance = 0.001;

			if (Math.abs(priceRecord.adjustedPrice - expectedAdjusted) / expectedAdjusted > tolerance) {
				violations.push({
					type: "unadjusted",
					description: `Price at ${priceRecord.timestamp} may not be properly split-adjusted. Raw: ${priceRecord.price}, Adjusted: ${priceRecord.adjustedPrice}, Factor: ${priceRecord.splitFactor}`,
					timestamp: priceRecord.timestamp,
				});
			}
		}
	}

	return {
		valid: violations.length === 0,
		violations,
	};
}
