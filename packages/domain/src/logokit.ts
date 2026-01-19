/**
 * LogoKit URL Builder
 *
 * Utilities for generating company logo URLs via LogoKit API.
 * Used for source attribution in grounding agent, positions, and decisions.
 *
 * @see docs/plans/ui/33-logo-integration.md
 */

/**
 * Extract domain from URL, removing www. prefix.
 */
export function extractDomain(url: string): string | null {
	try {
		const parsed = new URL(url);
		return parsed.hostname.replace(/^www\./, "");
	} catch {
		return null;
	}
}

/**
 * Build LogoKit URL for a domain.
 * Returns null if no API key is configured.
 */
export function buildLogoUrl(domain: string, apiKey: string | undefined): string | null {
	if (!apiKey || !domain) {
		return null;
	}
	return `https://img.logokit.com/${encodeURIComponent(domain)}?token=${apiKey}`;
}

/**
 * Build LogoKit URL for a ticker symbol.
 * Uses /ticker/ path for stock symbol lookup.
 */
export function buildTickerLogoUrl(ticker: string, apiKey: string | undefined): string | null {
	if (!apiKey || !ticker) {
		return null;
	}
	return `https://img.logokit.com/ticker/${encodeURIComponent(ticker.toUpperCase())}?token=${apiKey}`;
}

/**
 * Extract domain and build logo URL from a source URL.
 * Convenience function for streaming source attribution.
 */
export function getSourceLogoInfo(
	url: string,
	apiKey: string | undefined
): { domain: string; logoUrl: string | null } | null {
	const domain = extractDomain(url);
	if (!domain) {
		return null;
	}
	return {
		domain,
		logoUrl: buildLogoUrl(domain, apiKey),
	};
}
