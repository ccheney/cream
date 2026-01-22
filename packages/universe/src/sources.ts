/**
 * Universe Source Resolvers
 *
 * Implements resolution logic for static source type.
 * Index, ETF holdings, and screener sources have been removed.
 *
 * @see docs/plans/11-configuration.md lines 362-467
 */

import type { StaticSource, UniverseSource } from "@cream/config";

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
	/** Point-in-time date for historical lookup */
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
 * Resolve any source type
 *
 * Note: Only static sources are currently supported. Index, ETF holdings, and screener
 * sources are stubbed with empty results pending Alpaca integration.
 */
export async function resolveSource(
	source: UniverseSource,
	_options: SourceResolverOptions = {},
): Promise<SourceResolutionResult> {
	switch (source.type) {
		case "static":
			return resolveStaticSource(source);
		case "index":
			throw new Error(
				`Index source "${source.name}" is not supported. Use static source with explicit tickers instead.`,
			);
		case "etf_holdings":
			throw new Error(
				`ETF holdings source "${source.name}" is not supported. Use static source with explicit tickers instead.`,
			);
		case "screener":
			throw new Error(
				`Screener source "${source.name}" is not supported. Use static source with explicit tickers instead.`,
			);
		default:
			throw new Error(`Unknown source type: ${(source as { type: string }).type}`);
	}
}
