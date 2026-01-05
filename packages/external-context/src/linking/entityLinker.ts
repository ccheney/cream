/**
 * Entity Linker
 *
 * Maps company names to stock tickers using FMP company search API
 * and local alias lookup.
 */

import type { ExtractedEntity, EntityLink, FMPCompanySearch } from "../types.js";

/**
 * Entity linker configuration
 */
export interface EntityLinkerConfig {
  /** FMP API key */
  fmpApiKey?: string;
  /** FMP base URL */
  fmpBaseUrl?: string;
  /** Minimum confidence threshold (default: 0.5) */
  minConfidence?: number;
  /** Cache TTL in milliseconds (default: 1 hour) */
  cacheTtl?: number;
  /** Maximum API calls per batch (default: 10) */
  maxBatchSize?: number;
}

const DEFAULT_CONFIG: Required<EntityLinkerConfig> = {
  fmpApiKey: "",
  fmpBaseUrl: "https://financialmodelingprep.com/api/v3",
  minConfidence: 0.5,
  cacheTtl: 60 * 60 * 1000, // 1 hour
  maxBatchSize: 10,
};

/**
 * Common company name aliases mapping to tickers
 */
const COMPANY_ALIASES: Record<string, string> = {
  // Tech giants
  apple: "AAPL",
  "apple inc": "AAPL",
  "apple inc.": "AAPL",
  microsoft: "MSFT",
  "microsoft corp": "MSFT",
  "microsoft corporation": "MSFT",
  google: "GOOGL",
  alphabet: "GOOGL",
  "alphabet inc": "GOOGL",
  amazon: "AMZN",
  "amazon.com": "AMZN",
  "amazon.com inc": "AMZN",
  meta: "META",
  "meta platforms": "META",
  facebook: "META",
  nvidia: "NVDA",
  "nvidia corp": "NVDA",
  "nvidia corporation": "NVDA",
  tesla: "TSLA",
  "tesla inc": "TSLA",
  "tesla motors": "TSLA",
  netflix: "NFLX",
  "netflix inc": "NFLX",

  // Financial
  "jpmorgan": "JPM",
  "jp morgan": "JPM",
  "jpmorgan chase": "JPM",
  "goldman sachs": "GS",
  "goldman": "GS",
  "bank of america": "BAC",
  "bofa": "BAC",
  "morgan stanley": "MS",
  "wells fargo": "WFC",
  "citigroup": "C",
  "citi": "C",
  "berkshire hathaway": "BRK.B",
  "berkshire": "BRK.B",

  // Healthcare
  "johnson & johnson": "JNJ",
  "j&j": "JNJ",
  "pfizer": "PFE",
  "unitedhealth": "UNH",
  "unitedhealth group": "UNH",
  "eli lilly": "LLY",
  "lilly": "LLY",
  "abbvie": "ABBV",
  "merck": "MRK",
  "merck & co": "MRK",

  // Consumer
  "walmart": "WMT",
  "wal-mart": "WMT",
  "procter & gamble": "PG",
  "p&g": "PG",
  "coca-cola": "KO",
  "coke": "KO",
  "pepsi": "PEP",
  "pepsico": "PEP",
  "nike": "NKE",
  "nike inc": "NKE",
  "mcdonald's": "MCD",
  "mcdonalds": "MCD",

  // Industrial
  "boeing": "BA",
  "the boeing company": "BA",
  "caterpillar": "CAT",
  "3m": "MMM",
  "honeywell": "HON",
  "general electric": "GE",
  "ge": "GE",
  "lockheed martin": "LMT",
  "lockheed": "LMT",

  // Energy
  "exxon": "XOM",
  "exxonmobil": "XOM",
  "exxon mobil": "XOM",
  "chevron": "CVX",
  "conocophillips": "COP",

  // Telecom
  "at&t": "T",
  "verizon": "VZ",
  "t-mobile": "TMUS",

  // Semiconductor
  "intel": "INTC",
  "intel corp": "INTC",
  "amd": "AMD",
  "advanced micro devices": "AMD",
  "qualcomm": "QCOM",
  "broadcom": "AVGO",
  "texas instruments": "TXN",
  "ti": "TXN",
  "micron": "MU",
  "micron technology": "MU",
  "tsmc": "TSM",
  "taiwan semiconductor": "TSM",

  // Software
  "salesforce": "CRM",
  "oracle": "ORCL",
  "adobe": "ADBE",
  "servicenow": "NOW",
  "snowflake": "SNOW",
  "palantir": "PLTR",

  // Retail
  "costco": "COST",
  "target": "TGT",
  "home depot": "HD",
  "lowe's": "LOW",
  "lowes": "LOW",

  // Indices (for reference)
  "s&p 500": "SPY",
  "s&p": "SPY",
  "dow jones": "DIA",
  "nasdaq": "QQQ",
  "nasdaq 100": "QQQ",
  "russell 2000": "IWM",
};

/**
 * Cache entry
 */
interface CacheEntry {
  result: EntityLink | null;
  timestamp: number;
}

/**
 * Entity linker for mapping company names to tickers
 */
export class EntityLinker {
  private config: Required<EntityLinkerConfig>;
  private cache: Map<string, CacheEntry> = new Map();

  constructor(config: EntityLinkerConfig = {}) {
    const apiKey = config.fmpApiKey || process.env.FMP_KEY || "";
    this.config = { ...DEFAULT_CONFIG, ...config, fmpApiKey: apiKey };
  }

  /**
   * Link entities to tickers
   */
  async linkEntities(entities: ExtractedEntity[]): Promise<EntityLink[]> {
    const results: EntityLink[] = [];

    // Filter to company entities only
    const companyEntities = entities.filter((e) => e.type === "company");

    for (const entity of companyEntities) {
      // If extraction already has ticker, use it
      if (entity.ticker) {
        results.push({
          entityName: entity.name,
          ticker: entity.ticker.toUpperCase(),
          confidence: 0.95,
          method: "exact",
        });
        continue;
      }

      // Try to link the entity
      const link = await this.linkEntity(entity.name);
      if (link && link.confidence >= this.config.minConfidence) {
        results.push(link);
      }
    }

    return results;
  }

  /**
   * Link a single entity name to ticker
   */
  async linkEntity(entityName: string): Promise<EntityLink | null> {
    const normalizedName = entityName.toLowerCase().trim();

    // Check cache first
    const cached = this.getCached(normalizedName);
    if (cached !== undefined) {
      return cached;
    }

    // Try local alias lookup (fastest)
    const aliasResult = this.lookupAlias(normalizedName);
    if (aliasResult) {
      this.setCache(normalizedName, aliasResult);
      return aliasResult;
    }

    // Try FMP API search (if API key available)
    if (this.config.fmpApiKey) {
      const fmpResult = await this.searchFMP(entityName);
      this.setCache(normalizedName, fmpResult);
      return fmpResult;
    }

    // No match found
    this.setCache(normalizedName, null);
    return null;
  }

  /**
   * Lookup in local alias map
   */
  private lookupAlias(normalizedName: string): EntityLink | null {
    // Exact match
    if (COMPANY_ALIASES[normalizedName]) {
      return {
        entityName: normalizedName,
        ticker: COMPANY_ALIASES[normalizedName],
        confidence: 0.95,
        method: "alias",
      };
    }

    // Partial match - check if name contains a known alias
    for (const [alias, ticker] of Object.entries(COMPANY_ALIASES)) {
      if (normalizedName.includes(alias) || alias.includes(normalizedName)) {
        return {
          entityName: normalizedName,
          ticker: ticker,
          confidence: 0.8,
          method: "alias",
        };
      }
    }

    return null;
  }

  /**
   * Search FMP API for company
   */
  private async searchFMP(query: string): Promise<EntityLink | null> {
    try {
      const url = new URL(`${this.config.fmpBaseUrl}/search`);
      url.searchParams.set("query", query);
      url.searchParams.set("limit", "5");
      url.searchParams.set("apikey", this.config.fmpApiKey);

      const response = await fetch(url.toString());
      if (!response.ok) {
        return null;
      }

      const results: FMPCompanySearch[] = await response.json();
      if (!results || results.length === 0) {
        return null;
      }

      // Find best match
      const bestMatch = this.findBestMatch(query, results);
      if (!bestMatch) {
        return null;
      }

      return {
        entityName: query,
        ticker: bestMatch.symbol,
        confidence: this.computeMatchConfidence(query, bestMatch),
        method: "fuzzy",
      };
    } catch {
      return null;
    }
  }

  /**
   * Find best matching result from FMP search
   */
  private findBestMatch(
    query: string,
    results: FMPCompanySearch[],
  ): FMPCompanySearch | null {
    const normalizedQuery = query.toLowerCase();

    // First, try exact name match
    for (const result of results) {
      if (result.name.toLowerCase() === normalizedQuery) {
        return result;
      }
    }

    // Try symbol match
    for (const result of results) {
      if (result.symbol.toLowerCase() === normalizedQuery) {
        return result;
      }
    }

    // Try partial match with highest relevance
    for (const result of results) {
      if (
        result.name.toLowerCase().includes(normalizedQuery) ||
        normalizedQuery.includes(result.name.toLowerCase())
      ) {
        return result;
      }
    }

    // Return first result as fallback (FMP ranks by relevance)
    return results[0] || null;
  }

  /**
   * Compute confidence for FMP match
   */
  private computeMatchConfidence(
    query: string,
    match: FMPCompanySearch,
  ): number {
    const normalizedQuery = query.toLowerCase();
    const normalizedName = match.name.toLowerCase();

    // Exact match
    if (normalizedName === normalizedQuery) {
      return 0.95;
    }

    // Contains full query
    if (normalizedName.includes(normalizedQuery)) {
      return 0.85;
    }

    // Query contains match name
    if (normalizedQuery.includes(normalizedName)) {
      return 0.8;
    }

    // Levenshtein-like similarity (simplified)
    const similarity = this.stringSimilarity(normalizedQuery, normalizedName);
    return 0.5 + similarity * 0.3;
  }

  /**
   * Simple string similarity (Jaccard-like)
   */
  private stringSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.split(/\s+/));
    const wordsB = new Set(b.split(/\s+/));

    let intersection = 0;
    for (const word of wordsA) {
      if (wordsB.has(word)) intersection++;
    }

    const union = wordsA.size + wordsB.size - intersection;
    return union > 0 ? intersection / union : 0;
  }

  /**
   * Get cached result
   */
  private getCached(key: string): EntityLink | null | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() - entry.timestamp > this.config.cacheTtl) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.result;
  }

  /**
   * Set cache entry
   */
  private setCache(key: string, result: EntityLink | null): void {
    this.cache.set(key, { result, timestamp: Date.now() });
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get tickers from entity links
   */
  static getTickers(links: EntityLink[]): string[] {
    return [...new Set(links.map((l) => l.ticker))];
  }
}

/**
 * Create entity linker with environment configuration
 */
export function createEntityLinker(config?: EntityLinkerConfig): EntityLinker {
  return new EntityLinker(config);
}
