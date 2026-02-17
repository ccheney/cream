import type { UniverseConfig, UniverseFilters, UniverseSource } from "@cream/config";

import {
	type ResolvedInstrument,
	resolveSource,
	type SourceResolutionResult,
	type SourceResolverOptions,
} from "./sources.js";

export interface UniverseResolutionResult {
	instruments: ResolvedInstrument[];
	sourceResults: SourceResolutionResult[];
	composeMode: "union" | "intersection";
	resolvedAt: string;
	warnings: string[];
	stats: {
		totalFromSources: number;
		afterComposition: number;
		afterFilters: number;
		afterDiversification: number;
		final: number;
		sectors: string[];
	};
}

export interface UniverseResolverOptions extends SourceResolverOptions {
	skipDisabled?: boolean;
}

export interface DiversificationConfig {
	maxPerSector?: number;
	maxPerIndustry?: number;
	minSectorsRepresented?: number;
}

interface FilterResult {
	instruments: ResolvedInstrument[];
	warnings: string[];
}

interface ResolutionOutput {
	sourceResults: SourceResolutionResult[];
	warnings: string[];
}

interface UniverseStats {
	totalFromSources: number;
	afterComposition: number;
	afterFilters: number;
	afterDiversification: number;
	final: number;
	sectors: string[];
}

function mergeInstrumentMetadata(
	existing: ResolvedInstrument,
	incoming: ResolvedInstrument,
): ResolvedInstrument {
	const merged: ResolvedInstrument = {
		symbol: incoming.symbol,
		source: `${existing.source},${incoming.source}`,
	};
	const name = existing.name ?? incoming.name;
	const sector = existing.sector ?? incoming.sector;
	const industry = existing.industry ?? incoming.industry;
	const marketCap = existing.marketCap ?? incoming.marketCap;
	const avgVolume = existing.avgVolume ?? incoming.avgVolume;
	const price = existing.price ?? incoming.price;
	if (name !== undefined) merged.name = name;
	if (sector !== undefined) merged.sector = sector;
	if (industry !== undefined) merged.industry = industry;
	if (marketCap !== undefined) merged.marketCap = marketCap;
	if (avgVolume !== undefined) merged.avgVolume = avgVolume;
	if (price !== undefined) merged.price = price;
	return merged;
}

function composeFromSources(
	sourceResults: SourceResolutionResult[],
	allowedSymbols?: Set<string>,
): ResolvedInstrument[] {
	const symbolMap = new Map<string, ResolvedInstrument>();
	for (const result of sourceResults) {
		for (const instrument of result.instruments) {
			if (allowedSymbols && !allowedSymbols.has(instrument.symbol)) {
				continue;
			}
			const existing = symbolMap.get(instrument.symbol);
			symbolMap.set(
				instrument.symbol,
				existing ? mergeInstrumentMetadata(existing, instrument) : instrument,
			);
		}
	}
	return Array.from(symbolMap.values());
}

function composeUnion(sourceResults: SourceResolutionResult[]): ResolvedInstrument[] {
	return composeFromSources(sourceResults);
}

function buildIntersectionSymbolSet(sourceResults: SourceResolutionResult[]): Set<string> {
	const symbolSets = sourceResults.map(
		(result) => new Set(result.instruments.map((i) => i.symbol)),
	);
	const firstSet = symbolSets[0];
	if (!firstSet) {
		return new Set();
	}
	return symbolSets.slice(1).reduce<Set<string>>((acc, set) => acc.intersection(set), firstSet);
}

function composeIntersection(sourceResults: SourceResolutionResult[]): ResolvedInstrument[] {
	if (sourceResults.length === 0) {
		return [];
	}
	if (sourceResults.length === 1) {
		return sourceResults[0]?.instruments ?? [];
	}
	const intersection = buildIntersectionSymbolSet(sourceResults);
	return composeFromSources(sourceResults, intersection);
}

function applyMinFilter(
	instruments: ResolvedInstrument[],
	threshold: number,
	getValue: (instrument: ResolvedInstrument) => number,
	warningLabel: string,
	warnings: string[],
): ResolvedInstrument[] {
	if (threshold <= 0) {
		return instruments;
	}
	const before = instruments.length;
	const filtered = instruments.filter((instrument) => getValue(instrument) >= threshold);
	if (filtered.length < before) {
		warnings.push(`Filtered ${before - filtered.length} instruments below min ${warningLabel}`);
	}
	return filtered;
}

function applyMaxPriceFilter(
	instruments: ResolvedInstrument[],
	maxPrice: number | undefined,
	warnings: string[],
): ResolvedInstrument[] {
	if (maxPrice === undefined) {
		return instruments;
	}
	const before = instruments.length;
	const filtered = instruments.filter(
		(instrument) => (instrument.price ?? Number.POSITIVE_INFINITY) <= maxPrice,
	);
	if (filtered.length < before) {
		warnings.push(`Filtered ${before - filtered.length} instruments above max price`);
	}
	return filtered;
}

function applyTickerExclusions(
	instruments: ResolvedInstrument[],
	excludeTickers: string[],
	warnings: string[],
): ResolvedInstrument[] {
	if (excludeTickers.length === 0) {
		return instruments;
	}
	const excludeSet = new Set(excludeTickers.map((ticker) => ticker.toUpperCase()));
	const before = instruments.length;
	const filtered = instruments.filter(
		(instrument) => !excludeSet.has(instrument.symbol.toUpperCase()),
	);
	if (filtered.length < before) {
		warnings.push(`Excluded ${before - filtered.length} instruments by ticker blocklist`);
	}
	return filtered;
}

function applyIncludedSectors(
	instruments: ResolvedInstrument[],
	includeSectors: string[] | undefined,
	warnings: string[],
): ResolvedInstrument[] {
	if (!includeSectors || includeSectors.length === 0) {
		return instruments;
	}
	const includeSet = new Set(includeSectors.map((sector) => sector.toLowerCase()));
	const before = instruments.length;
	const filtered = instruments.filter(
		(instrument) => !!instrument.sector && includeSet.has(instrument.sector.toLowerCase()),
	);
	if (filtered.length < before) {
		warnings.push(`Filtered ${before - filtered.length} instruments not in included sectors`);
	}
	return filtered;
}

function applyExcludedSectors(
	instruments: ResolvedInstrument[],
	excludeSectors: string[] | undefined,
	warnings: string[],
): ResolvedInstrument[] {
	if (!excludeSectors || excludeSectors.length === 0) {
		return instruments;
	}
	const excludeSet = new Set(excludeSectors.map((sector) => sector.toLowerCase()));
	const before = instruments.length;
	const filtered = instruments.filter(
		(instrument) => !instrument.sector || !excludeSet.has(instrument.sector.toLowerCase()),
	);
	if (filtered.length < before) {
		warnings.push(`Excluded ${before - filtered.length} instruments by sector blocklist`);
	}
	return filtered;
}

function applyFilters(
	instruments: ResolvedInstrument[],
	filters: UniverseFilters | undefined,
): FilterResult {
	if (!filters) {
		return { instruments, warnings: [] };
	}
	const warnings: string[] = [];
	let filtered = [...instruments];
	filtered = applyMinFilter(
		filtered,
		filters.min_avg_volume,
		(item) => item.avgVolume ?? 0,
		"volume",
		warnings,
	);
	filtered = applyMinFilter(
		filtered,
		filters.min_market_cap,
		(item) => item.marketCap ?? 0,
		"market cap",
		warnings,
	);
	filtered = applyMinFilter(
		filtered,
		filters.min_price,
		(item) => item.price ?? 0,
		"price",
		warnings,
	);
	filtered = applyMaxPriceFilter(filtered, filters.max_price, warnings);
	filtered = applyTickerExclusions(filtered, filters.exclude_tickers, warnings);
	filtered = applyIncludedSectors(filtered, filters.include_sectors, warnings);
	filtered = applyExcludedSectors(filtered, filters.exclude_sectors, warnings);
	return { instruments: filtered, warnings };
}

function getDiversificationConfig(config: UniverseConfig): DiversificationConfig | undefined {
	return (config as UniverseConfig & { diversification?: DiversificationConfig }).diversification;
}

function limitByGrouping(
	instruments: ResolvedInstrument[],
	limit: number,
	getGroupKey: (instrument: ResolvedInstrument) => string,
): { instruments: ResolvedInstrument[]; removed: number } {
	const counts = new Map<string, number>();
	const limited: ResolvedInstrument[] = [];
	for (const instrument of instruments) {
		const key = getGroupKey(instrument);
		const count = counts.get(key) ?? 0;
		if (count >= limit) {
			continue;
		}
		limited.push(instrument);
		counts.set(key, count + 1);
	}
	return { instruments: limited, removed: instruments.length - limited.length };
}

function warnIfSectorCoverageTooLow(
	instruments: ResolvedInstrument[],
	minimumSectors: number,
	warnings: string[],
): void {
	const sectorsPresent = new Set(
		instruments
			.filter((instrument) => instrument.sector)
			.map((instrument) => instrument.sector as string),
	);
	if (sectorsPresent.size < minimumSectors) {
		warnings.push(
			`Warning: only ${sectorsPresent.size} sectors represented, below minimum of ${minimumSectors}`,
		);
	}
}

function applyDiversification(
	instruments: ResolvedInstrument[],
	config: UniverseConfig,
): FilterResult {
	const warnings: string[] = [];
	const diversification = getDiversificationConfig(config);
	if (!diversification) {
		return { instruments: [...instruments], warnings };
	}

	let filtered = [...instruments];
	if (diversification.maxPerSector && diversification.maxPerSector > 0) {
		const limited = limitByGrouping(
			filtered,
			diversification.maxPerSector,
			(instrument) => instrument.sector ?? "Unknown",
		);
		filtered = limited.instruments;
		if (limited.removed > 0) {
			warnings.push(
				`Diversification: removed ${limited.removed} instruments exceeding sector limits`,
			);
		}
	}

	if (diversification.maxPerIndustry && diversification.maxPerIndustry > 0) {
		const limited = limitByGrouping(
			filtered,
			diversification.maxPerIndustry,
			(instrument) => instrument.industry ?? "Unknown",
		);
		filtered = limited.instruments;
		if (limited.removed > 0) {
			warnings.push(
				`Diversification: removed ${limited.removed} instruments exceeding industry limits`,
			);
		}
	}

	if (diversification.minSectorsRepresented && diversification.minSectorsRepresented > 0) {
		warnIfSectorCoverageTooLow(filtered, diversification.minSectorsRepresented, warnings);
	}

	return { instruments: filtered, warnings };
}

function rankAndLimit(
	instruments: ResolvedInstrument[],
	maxInstruments: number,
): ResolvedInstrument[] {
	if (instruments.length <= maxInstruments) {
		return instruments;
	}
	return instruments
		.toSorted((a, b) => (b.avgVolume ?? 0) - (a.avgVolume ?? 0))
		.slice(0, maxInstruments);
}

function getEnabledSources(config: UniverseConfig): UniverseSource[] {
	return config.sources.filter((source: UniverseSource) => source.enabled);
}

async function resolveSources(
	enabledSources: UniverseSource[],
	options: UniverseResolverOptions,
): Promise<ResolutionOutput> {
	const sourceResults: SourceResolutionResult[] = [];
	const warnings: string[] = [];
	for (const source of enabledSources) {
		try {
			const result = await resolveSource(source, options);
			sourceResults.push(result);
			warnings.push(...result.warnings);
		} catch (error) {
			warnings.push(`Failed to resolve source ${source.name}: ${error}`);
		}
	}
	return { sourceResults, warnings };
}

function composeInstruments(
	composeMode: UniverseConfig["compose_mode"],
	sourceResults: SourceResolutionResult[],
): ResolvedInstrument[] {
	return composeMode === "intersection"
		? composeIntersection(sourceResults)
		: composeUnion(sourceResults);
}

function collectSectors(instruments: ResolvedInstrument[]): string[] {
	return [
		...new Set(
			instruments
				.filter((instrument) => instrument.sector)
				.map((instrument) => instrument.sector as string),
		),
	];
}

function buildStats(
	sourceResults: SourceResolutionResult[],
	afterComposition: number,
	afterFilters: number,
	afterDiversification: number,
	instruments: ResolvedInstrument[],
): UniverseStats {
	return {
		totalFromSources: sourceResults.reduce((sum, result) => sum + result.instruments.length, 0),
		afterComposition,
		afterFilters,
		afterDiversification,
		final: instruments.length,
		sectors: collectSectors(instruments),
	};
}

export async function resolveUniverse(
	config: UniverseConfig,
	options: UniverseResolverOptions = {},
): Promise<UniverseResolutionResult> {
	const enabledSources = getEnabledSources(config);
	if (enabledSources.length === 0) {
		throw new Error("No enabled sources in universe configuration");
	}

	const resolution = await resolveSources(enabledSources, options);
	if (resolution.sourceResults.length === 0) {
		throw new Error("All sources failed to resolve");
	}

	const composeMode = config.compose_mode;
	let instruments = composeInstruments(composeMode, resolution.sourceResults);
	const afterComposition = instruments.length;

	const filterResult = applyFilters(instruments, config.filters);
	instruments = filterResult.instruments;
	const afterFilters = instruments.length;

	const diversificationResult = applyDiversification(instruments, config);
	instruments = diversificationResult.instruments;
	const afterDiversification = instruments.length;

	instruments = rankAndLimit(instruments, config.max_instruments);
	const warnings = [
		...resolution.warnings,
		...filterResult.warnings,
		...diversificationResult.warnings,
	];
	const stats = buildStats(
		resolution.sourceResults,
		afterComposition,
		afterFilters,
		afterDiversification,
		instruments,
	);

	return {
		instruments,
		sourceResults: resolution.sourceResults,
		composeMode,
		resolvedAt: new Date().toISOString(),
		warnings,
		stats,
	};
}

export async function resolveUniverseSymbols(
	config: UniverseConfig,
	options: UniverseResolverOptions = {},
): Promise<string[]> {
	const result = await resolveUniverse(config, options);
	return result.instruments.map((instrument) => instrument.symbol);
}
