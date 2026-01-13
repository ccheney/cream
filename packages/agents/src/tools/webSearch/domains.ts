/**
 * Web Search Domain Mapping
 *
 * Maps source types to domain arrays for search filtering.
 */

import type { WebSearchSource } from "./types.js";

export const DOMAIN_MAP: Record<WebSearchSource, string[]> = {
  all: [],
  reddit: ["reddit.com"],
  x: ["x.com"],
  substack: ["substack.com"],
  blogs: ["medium.com", "seekingalpha.com", "zerohedge.com", "thestreet.com"],
  news: ["reuters.com", "bloomberg.com", "cnbc.com", "wsj.com", "ft.com", "marketwatch.com"],
  financial: ["seekingalpha.com", "investopedia.com", "fool.com", "barrons.com", "tradingview.com"],
};

/**
 * Build domain filter array from source types
 */
export function buildDomainFilter(sources: WebSearchSource[]): string[] {
  if (sources.length === 0 || sources.includes("all")) {
    return [];
  }

  const domains = new Set<string>();
  for (const source of sources) {
    for (const domain of DOMAIN_MAP[source]) {
      domains.add(domain);
    }
  }

  return Array.from(domains);
}
