import { parseOptionSymbol } from "./ivSolver";
import type { OptionQuoteData } from "./realtimeOptionsProvider.types";

export function average(values: number[]): number | null {
	if (values.length === 0) {
		return null;
	}
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function collectAtmIvs(
	quotes: Iterable<OptionQuoteData>,
	underlyingPrice: number,
	atmThreshold = 0.02,
): number[] {
	const atmIvs: number[] = [];
	for (const quote of quotes) {
		const iv = quote.iv;
		if (iv === null) {
			continue;
		}
		const optionInfo = parseOptionSymbol(quote.symbol);
		if (!optionInfo) {
			continue;
		}
		const moneyness = Math.abs(optionInfo.strike - underlyingPrice) / underlyingPrice;
		if (moneyness <= atmThreshold) {
			atmIvs.push(iv);
		}
	}
	return atmIvs;
}

export function collectSkewBuckets(
	quotes: Iterable<OptionQuoteData>,
	underlyingPrice: number,
): {
	atmIvs: number[];
	otmPutIvs: number[];
	otmCallIvs: number[];
} {
	const atmIvs: number[] = [];
	const otmPutIvs: number[] = [];
	const otmCallIvs: number[] = [];
	const atmThreshold = 0.02;
	const minOtmThreshold = 0.05;
	const maxOtmThreshold = 0.1;

	for (const quote of quotes) {
		const iv = quote.iv;
		if (iv === null) {
			continue;
		}
		const bucket = classifySkewBucket(
			quote.symbol,
			underlyingPrice,
			atmThreshold,
			minOtmThreshold,
			maxOtmThreshold,
		);
		if (bucket === "atm") {
			atmIvs.push(iv);
		} else if (bucket === "otmPut") {
			otmPutIvs.push(iv);
		} else if (bucket === "otmCall") {
			otmCallIvs.push(iv);
		}
	}

	return { atmIvs, otmPutIvs, otmCallIvs };
}

function classifySkewBucket(
	symbol: string,
	underlyingPrice: number,
	atmThreshold: number,
	minOtmThreshold: number,
	maxOtmThreshold: number,
): "atm" | "otmPut" | "otmCall" | null {
	const optionInfo = parseOptionSymbol(symbol);
	if (!optionInfo) {
		return null;
	}
	const moneyness = (optionInfo.strike - underlyingPrice) / underlyingPrice;
	const absMoneyness = Math.abs(moneyness);
	if (absMoneyness <= atmThreshold) {
		return "atm";
	}
	if (absMoneyness < minOtmThreshold || absMoneyness > maxOtmThreshold) {
		return null;
	}
	if (optionInfo.type === "PUT" && moneyness < 0) {
		return "otmPut";
	}
	if (optionInfo.type === "CALL" && moneyness > 0) {
		return "otmCall";
	}
	return null;
}
