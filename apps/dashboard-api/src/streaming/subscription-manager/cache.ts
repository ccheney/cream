/**
 * Quote Cache Management
 *
 * Handles caching and TTL for options quotes.
 */

import { CACHE_TTL_MS } from "./constants.js";
import { quoteCache } from "./state.js";
import type { CachedQuote } from "./types.js";

/**
 * Get cached quote if still valid.
 */
export function getValidCachedQuote(contract: string): CachedQuote | null {
	const cached = quoteCache.get(contract);
	if (!cached) {
		return null;
	}

	const age = Date.now() - cached.cachedAt.getTime();
	if (age > CACHE_TTL_MS) {
		quoteCache.delete(contract);
		return null;
	}

	return cached;
}

/**
 * Get cached quote for a contract.
 */
export function getCachedQuote(contract: string): CachedQuote | null {
	return getValidCachedQuote(contract.toUpperCase());
}

/**
 * Clean expired cache entries.
 */
export function cleanExpiredCache(): number {
	const now = Date.now();
	let cleaned = 0;

	for (const [contract, cached] of quoteCache) {
		if (now - cached.cachedAt.getTime() > CACHE_TTL_MS) {
			quoteCache.delete(contract);
			cleaned++;
		}
	}

	return cleaned;
}

/**
 * Extract underlying symbol from OCC contract.
 */
export function extractUnderlying(contract: string): string {
	const symbol = contract.startsWith("O:") ? contract.slice(2) : contract;
	const dateStart = symbol.search(/\d/);
	return dateStart > 0 ? symbol.slice(0, dateStart) : symbol;
}
