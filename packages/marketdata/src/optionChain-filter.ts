import type { OptionFilterCriteria, OptionWithMarketData } from "./optionChain-types.js";

function failsDte(option: OptionWithMarketData, filter: OptionFilterCriteria): boolean {
	if (filter.minDte !== undefined && option.dte < filter.minDte) {
		return true;
	}
	return filter.maxDte !== undefined && option.dte > filter.maxDte;
}

function failsType(option: OptionWithMarketData, filter: OptionFilterCriteria): boolean {
	return Boolean(
		filter.optionType && filter.optionType !== "both" && option.type !== filter.optionType,
	);
}

function failsDelta(option: OptionWithMarketData, filter: OptionFilterCriteria): boolean {
	if (option.delta === undefined) {
		return false;
	}

	const absDelta = Math.abs(option.delta);
	if (filter.minDelta !== undefined && absDelta < filter.minDelta) {
		return true;
	}

	return filter.maxDelta !== undefined && absDelta > filter.maxDelta;
}

function failsVolume(option: OptionWithMarketData, filter: OptionFilterCriteria): boolean {
	if (filter.minVolume === undefined) {
		return false;
	}

	return option.volume === undefined || option.volume < filter.minVolume;
}

function failsOpenInterest(option: OptionWithMarketData, filter: OptionFilterCriteria): boolean {
	if (filter.minOpenInterest === undefined) {
		return false;
	}

	return option.openInterest === undefined || option.openInterest < filter.minOpenInterest;
}

function failsSpread(option: OptionWithMarketData, filter: OptionFilterCriteria): boolean {
	if (
		filter.maxSpreadPct !== undefined &&
		option.spreadPct !== undefined &&
		option.spreadPct > filter.maxSpreadPct
	) {
		return true;
	}

	return Boolean(
		filter.maxSpreadAbs !== undefined &&
			option.spread !== undefined &&
			option.spread > filter.maxSpreadAbs,
	);
}

function failsIvPercentile(option: OptionWithMarketData, filter: OptionFilterCriteria): boolean {
	if (option.ivPercentile === undefined) {
		return filter.minIvPercentile !== undefined || filter.maxIvPercentile !== undefined;
	}

	if (filter.minIvPercentile !== undefined && option.ivPercentile < filter.minIvPercentile) {
		return true;
	}

	return filter.maxIvPercentile !== undefined && option.ivPercentile > filter.maxIvPercentile;
}

/**
 * Check if option passes all filter criteria.
 */
export function passesOptionFilter(
	option: OptionWithMarketData,
	filter: OptionFilterCriteria,
): boolean {
	if (failsDte(option, filter) || failsType(option, filter) || failsDelta(option, filter)) {
		return false;
	}

	if (
		failsVolume(option, filter) ||
		failsOpenInterest(option, filter) ||
		failsSpread(option, filter)
	) {
		return false;
	}

	return !failsIvPercentile(option, filter);
}
