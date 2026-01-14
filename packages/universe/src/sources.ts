/**
 * Universe Source Resolvers
 *
 * Implements resolution logic for each source type: static, index, ETF holdings, screener.
 *
 * @see docs/plans/11-configuration.md lines 362-467
 */

import type {
	ETFHoldingsSource,
	IndexSource,
	ScreenerSource,
	StaticSource,
	UniverseSource,
} from "@cream/config";

import { createFMPClient, type FMPClientConfig } from "./fmp-client.js";

// ============================================
// Types
// ============================================

/**
 * Resolved instrument with metadata
 */
export interface ResolvedInstrument {
	/** Ticker symbol */
	symbol: string;
	/** Company/ETF name */
	name?: string;
	/** Sector classification */
	sector?: string;
	/** Industry classification */
	industry?: string;
	/** Market capitalization */
	marketCap?: number;
	/** Average volume */
	avgVolume?: number;
	/** Current price */
	price?: number;
	/** Source that provided this instrument */
	source: string;
}

/**
 * Source resolution result
 */
export interface SourceResolutionResult {
	/** Source name */
	sourceName: string;
	/** Resolved instruments */
	instruments: ResolvedInstrument[];
	/** Resolution timestamp */
	resolvedAt: string;
	/** Any warnings during resolution */
	warnings: string[];
}

/**
 * Source resolver options
 */
export interface SourceResolverOptions {
	/** FMP client configuration */
	fmpConfig?: Partial<FMPClientConfig>;
	/** Point-in-time date for backtesting */
	asOfDate?: Date;
}

// ============================================
// Source Resolvers
// ============================================

/**
 * Resolve a static source
 */
export async function resolveStaticSource(source: StaticSource): Promise<SourceResolutionResult> {
	return {
		sourceName: source.name,
		instruments: source.tickers.map((ticker: string) => ({
			symbol: ticker.toUpperCase(),
			source: source.name,
		})),
		resolvedAt: new Date().toISOString(),
		warnings: [],
	};
}

/**
 * Resolve an index source
 */
export async function resolveIndexSource(
	source: IndexSource,
	options: SourceResolverOptions = {}
): Promise<SourceResolutionResult> {
	const warnings: string[] = [];

	// Only FMP is currently supported
	if (source.provider !== "fmp") {
		throw new Error(`Unsupported provider for index source: ${source.provider}`);
	}

	const client = createFMPClient(options.fmpConfig);

	let symbols: string[];
	let constituentsData: Array<{ symbol: string; name: string; sector: string }> = [];

	if (source.point_in_time && options.asOfDate) {
		symbols = await client.getConstituentsAsOf(source.index_id, options.asOfDate);
		warnings.push(
			`Using point-in-time constituents as of ${options.asOfDate.toISOString().split("T")[0]}`
		);
	} else {
		const constituents = await client.getIndexConstituents(source.index_id);
		constituentsData = constituents;
		symbols = constituents.map((c) => c.symbol);
	}

	const instruments: ResolvedInstrument[] = symbols.map((symbol: string) => {
		const constituent = constituentsData.find((c) => c.symbol === symbol);
		const inst: ResolvedInstrument = {
			symbol,
			source: source.name,
		};
		if (constituent?.name) {
			inst.name = constituent.name;
		}
		if (constituent?.sector) {
			inst.sector = constituent.sector;
		}
		return inst;
	});

	return {
		sourceName: source.name,
		instruments,
		resolvedAt: new Date().toISOString(),
		warnings,
	};
}

/**
 * Resolve an ETF holdings source
 */
export async function resolveETFHoldingsSource(
	source: ETFHoldingsSource,
	options: SourceResolverOptions = {}
): Promise<SourceResolutionResult> {
	const warnings: string[] = [];

	// Only FMP is currently supported
	if (source.provider !== "fmp") {
		throw new Error(`Unsupported provider for ETF holdings: ${source.provider}`);
	}

	const client = createFMPClient(options.fmpConfig);

	const etfSymbols: string[] = source.etf_symbol ? [source.etf_symbol] : (source.etf_symbols ?? []);

	if (etfSymbols.length === 0) {
		throw new Error("ETF holdings source requires etf_symbol or etf_symbols");
	}

	const allHoldings: ResolvedInstrument[] = [];

	for (const etfSymbol of etfSymbols) {
		const holdings = await client.getETFHoldings(etfSymbol);

		let filteredHoldings = holdings.filter((h) => h.weightPercentage >= source.min_weight_pct);

		filteredHoldings.sort((a, b) => b.weightPercentage - a.weightPercentage);

		if (source.top_n !== null && source.top_n !== undefined) {
			filteredHoldings = filteredHoldings.slice(0, source.top_n);
		}

		for (const holding of filteredHoldings) {
			allHoldings.push({
				symbol: holding.asset,
				name: holding.name,
				source: `${source.name}:${etfSymbol}`,
			});
		}
	}

	const seen = new Set<string>();
	const instruments = allHoldings.filter((h) => {
		if (seen.has(h.symbol)) {
			return false;
		}
		seen.add(h.symbol);
		return true;
	});

	return {
		sourceName: source.name,
		instruments,
		resolvedAt: new Date().toISOString(),
		warnings,
	};
}

/**
 * Resolve a screener source
 */
export async function resolveScreenerSource(
	source: ScreenerSource,
	options: SourceResolverOptions = {}
): Promise<SourceResolutionResult> {
	const warnings: string[] = [];

	// Only FMP is currently supported
	if (source.provider !== "fmp") {
		throw new Error(`Unsupported provider for screener: ${source.provider}`);
	}

	const client = createFMPClient(options.fmpConfig);

	const filters = source.filters as Record<string, unknown>;
	const fmpFilters: Parameters<typeof client.screenStocks>[0] = {
		limit: source.limit,
	};

	if (filters.market_cap_min) {
		fmpFilters.marketCapMoreThan = Number(filters.market_cap_min);
	}
	if (filters.market_cap_max) {
		fmpFilters.marketCapLowerThan = Number(filters.market_cap_max);
	}
	if (filters.volume_avg_min) {
		fmpFilters.volumeMoreThan = Number(filters.volume_avg_min);
	}
	if (filters.price_min) {
		fmpFilters.priceMoreThan = Number(filters.price_min);
	}
	if (filters.price_max) {
		fmpFilters.priceLowerThan = Number(filters.price_max);
	}
	if (filters.sector) {
		fmpFilters.sector = String(filters.sector);
	}
	if (filters.is_etf !== undefined) {
		fmpFilters.isEtf = Boolean(filters.is_etf);
	}
	if (filters.is_actively_trading !== undefined) {
		fmpFilters.isActivelyTrading = Boolean(filters.is_actively_trading);
	}

	// Handle exchange array (FMP takes comma-separated)
	if (Array.isArray(filters.exchange)) {
		fmpFilters.exchange = filters.exchange.join(",");
	}

	const results = await client.screenStocks(fmpFilters);

	if (source.sort_by) {
		results.sort((a, b) => {
			let aVal: number;
			let bVal: number;

			switch (source.sort_by) {
				case "volume":
					aVal = a.volume;
					bVal = b.volume;
					break;
				case "market_cap":
					aVal = a.marketCap;
					bVal = b.marketCap;
					break;
				default:
					aVal = 0;
					bVal = 0;
			}

			return source.sort_order === "asc" ? aVal - bVal : bVal - aVal;
		});
	}

	const instruments: ResolvedInstrument[] = results.map((r) => ({
		symbol: r.symbol,
		name: r.companyName,
		sector: r.sector,
		industry: r.industry,
		marketCap: r.marketCap,
		avgVolume: r.volume,
		price: r.price,
		source: source.name,
	}));

	return {
		sourceName: source.name,
		instruments,
		resolvedAt: new Date().toISOString(),
		warnings,
	};
}

/**
 * Resolve any source type
 */
export async function resolveSource(
	source: UniverseSource,
	options: SourceResolverOptions = {}
): Promise<SourceResolutionResult> {
	switch (source.type) {
		case "static":
			return resolveStaticSource(source);
		case "index":
			return resolveIndexSource(source, options);
		case "etf_holdings":
			return resolveETFHoldingsSource(source, options);
		case "screener":
			return resolveScreenerSource(source, options);
		default:
			throw new Error(`Unknown source type: ${(source as { type: string }).type}`);
	}
}
