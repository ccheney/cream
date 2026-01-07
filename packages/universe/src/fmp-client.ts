/**
 * FMP (Financial Modeling Prep) API Client
 *
 * Adapter for fetching index constituents, ETF holdings, and stock screener data.
 *
 * @see https://site.financialmodelingprep.com/developer/docs
 */

import type { IndexId } from "@cream/config";

// ============================================
// Types
// ============================================

/**
 * FMP API configuration
 */
export interface FMPClientConfig {
  /** API key */
  apiKey: string;
  /** Base URL (defaults to production) */
  baseUrl?: string;
  /** Request timeout in ms */
  timeout?: number;
  /** Retry configuration */
  retries?: number;
  /** Retry delay in ms */
  retryDelay?: number;
}

/**
 * Default FMP configuration
 */
const DEFAULT_CONFIG: Required<Omit<FMPClientConfig, "apiKey">> = {
  baseUrl: "https://financialmodelingprep.com/api/v3",
  timeout: 30000,
  retries: 3,
  retryDelay: 1000,
};

/**
 * Index constituent from FMP
 */
export interface FMPConstituent {
  symbol: string;
  name: string;
  sector: string;
  subSector?: string;
  headQuarter?: string;
  dateFirstAdded?: string;
  cik?: string;
  founded?: string;
}

/**
 * Historical index change from FMP
 */
export interface FMPHistoricalConstituent {
  dateAdded: string;
  addedSecurity: string;
  removedTicker: string;
  removedSecurity: string;
  symbol: string;
  reason: string;
}

/**
 * ETF holding from FMP
 */
export interface FMPETFHolding {
  asset: string;
  name: string;
  sharesNumber: number;
  weightPercentage: number;
  marketValue?: number;
  isin?: string;
  cusip?: string;
}

/**
 * Screener filter parameters
 */
export interface FMPScreenerFilters {
  marketCapMoreThan?: number;
  marketCapLowerThan?: number;
  volumeMoreThan?: number;
  volumeLowerThan?: number;
  priceMoreThan?: number;
  priceLowerThan?: number;
  betaMoreThan?: number;
  betaLowerThan?: number;
  dividendMoreThan?: number;
  dividendLowerThan?: number;
  sector?: string;
  industry?: string;
  country?: string;
  exchange?: string;
  isActivelyTrading?: boolean;
  isEtf?: boolean;
  limit?: number;
}

/**
 * Screener result from FMP
 */
export interface FMPScreenerResult {
  symbol: string;
  companyName: string;
  marketCap: number;
  sector: string;
  industry: string;
  beta: number;
  price: number;
  lastAnnualDividend: number;
  volume: number;
  exchange: string;
  exchangeShortName: string;
  country: string;
  isActivelyTrading: boolean;
  isEtf: boolean;
}

// ============================================
// FMP Client Implementation
// ============================================

/**
 * FMP API Client
 */
export class FMPClient {
  private readonly config: Required<FMPClientConfig>;

  constructor(config: FMPClientConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  /**
   * Make a request to the FMP API with retries
   */
  private async request<T>(
    endpoint: string,
    params: Record<string, string | number | boolean> = {}
  ): Promise<T> {
    const url = new URL(`${this.config.baseUrl}${endpoint}`);

    // Add API key
    url.searchParams.set("apikey", this.config.apiKey);

    // Add other params
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

        const response = await fetch(url.toString(), {
          method: "GET",
          signal: controller.signal,
          headers: {
            Accept: "application/json",
          },
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`FMP API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return data as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on 4xx errors (except 429)
        if (lastError.message.includes("4") && !lastError.message.includes("429")) {
          throw lastError;
        }

        // Wait before retry
        if (attempt < this.config.retries - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, this.config.retryDelay * (attempt + 1))
          );
        }
      }
    }

    throw lastError ?? new Error("FMP API request failed");
  }

  // ============================================
  // Index Constituents
  // ============================================

  /**
   * Get current constituents for an index
   */
  async getIndexConstituents(indexId: IndexId): Promise<FMPConstituent[]> {
    const endpoint = this.getIndexEndpoint(indexId);
    return this.request<FMPConstituent[]>(endpoint);
  }

  /**
   * Get historical constituent changes for an index
   */
  async getHistoricalConstituents(indexId: IndexId): Promise<FMPHistoricalConstituent[]> {
    const endpoint = this.getHistoricalIndexEndpoint(indexId);
    return this.request<FMPHistoricalConstituent[]>(endpoint);
  }

  /**
   * Get constituents as of a specific date (for survivorship-bias-free backtesting)
   */
  async getConstituentsAsOf(indexId: IndexId, asOfDate: Date): Promise<string[]> {
    // Get current constituents
    const current = await this.getIndexConstituents(indexId);
    const currentSymbols = new Set(current.map((c) => c.symbol));

    // Get historical changes
    const history = await this.getHistoricalConstituents(indexId);

    // Apply changes in reverse chronological order
    // biome-ignore lint/style/noNonNullAssertion: split always returns array
    const asOfDateStr = asOfDate.toISOString().split("T")[0]!;

    for (const change of history) {
      const changeDate = change.dateAdded;

      // If change happened after our target date, reverse it
      if (asOfDateStr && changeDate > asOfDateStr) {
        // Remove the added ticker
        if (change.symbol) {
          currentSymbols.delete(change.symbol);
        }
        // Re-add the removed ticker
        if (change.removedTicker) {
          currentSymbols.add(change.removedTicker);
        }
      }
    }

    return Array.from(currentSymbols);
  }

  private getIndexEndpoint(indexId: IndexId): string {
    switch (indexId) {
      case "SP500":
        return "/sp500_constituent";
      case "NASDAQ100":
        return "/nasdaq_constituent";
      case "DOWJONES":
        return "/dowjones_constituent";
      case "RUSSELL2000":
        // FMP doesn't have direct Russell 2000 - may need alternative
        return "/russell_2000_constituent";
      case "RUSSELL3000":
        return "/russell_3000_constituent";
      default:
        throw new Error(`Unsupported index: ${indexId}`);
    }
  }

  private getHistoricalIndexEndpoint(indexId: IndexId): string {
    switch (indexId) {
      case "SP500":
        return "/historical/sp500_constituent";
      case "NASDAQ100":
        return "/historical/nasdaq_constituent";
      case "DOWJONES":
        return "/historical/dowjones_constituent";
      default:
        throw new Error(`Historical data not available for index: ${indexId}`);
    }
  }

  // ============================================
  // ETF Holdings
  // ============================================

  /**
   * Get ETF holdings
   */
  async getETFHoldings(symbol: string): Promise<FMPETFHolding[]> {
    return this.request<FMPETFHolding[]>(`/etf-holder/${symbol}`);
  }

  // ============================================
  // Stock Screener
  // ============================================

  /**
   * Screen stocks based on filters
   */
  async screenStocks(filters: FMPScreenerFilters): Promise<FMPScreenerResult[]> {
    const params: Record<string, string | number | boolean> = {};

    if (filters.marketCapMoreThan) {
      params.marketCapMoreThan = filters.marketCapMoreThan;
    }
    if (filters.marketCapLowerThan) {
      params.marketCapLowerThan = filters.marketCapLowerThan;
    }
    if (filters.volumeMoreThan) {
      params.volumeMoreThan = filters.volumeMoreThan;
    }
    if (filters.volumeLowerThan) {
      params.volumeLowerThan = filters.volumeLowerThan;
    }
    if (filters.priceMoreThan) {
      params.priceMoreThan = filters.priceMoreThan;
    }
    if (filters.priceLowerThan) {
      params.priceLowerThan = filters.priceLowerThan;
    }
    if (filters.betaMoreThan) {
      params.betaMoreThan = filters.betaMoreThan;
    }
    if (filters.betaLowerThan) {
      params.betaLowerThan = filters.betaLowerThan;
    }
    if (filters.dividendMoreThan) {
      params.dividendMoreThan = filters.dividendMoreThan;
    }
    if (filters.dividendLowerThan) {
      params.dividendLowerThan = filters.dividendLowerThan;
    }
    if (filters.sector) {
      params.sector = filters.sector;
    }
    if (filters.industry) {
      params.industry = filters.industry;
    }
    if (filters.country) {
      params.country = filters.country;
    }
    if (filters.exchange) {
      params.exchange = filters.exchange;
    }
    if (filters.isActivelyTrading !== undefined) {
      params.isActivelyTrading = filters.isActivelyTrading;
    }
    if (filters.isEtf !== undefined) {
      params.isEtf = filters.isEtf;
    }
    if (filters.limit) {
      params.limit = filters.limit;
    }

    return this.request<FMPScreenerResult[]>("/stock-screener", params);
  }

  // ============================================
  // Company Profile (for metadata)
  // ============================================

  /**
   * Get company profile for sector/industry data
   */
  async getCompanyProfile(symbol: string): Promise<{
    symbol: string;
    companyName: string;
    sector: string;
    industry: string;
    mktCap: number;
    price: number;
    volAvg: number;
  } | null> {
    const profiles = await this.request<
      Array<{
        symbol: string;
        companyName: string;
        sector: string;
        industry: string;
        mktCap: number;
        price: number;
        volAvg: number;
      }>
    >(`/profile/${symbol}`);

    return profiles[0] ?? null;
  }

  /**
   * Get profiles for multiple symbols (batch)
   */
  async getCompanyProfiles(symbols: string[]): Promise<
    Map<
      string,
      {
        symbol: string;
        companyName: string;
        sector: string;
        industry: string;
        mktCap: number;
        price: number;
        volAvg: number;
      }
    >
  > {
    const results = new Map();

    // FMP allows batch requests with comma-separated symbols
    const batchSize = 50;
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      const profiles = await this.request<
        Array<{
          symbol: string;
          companyName: string;
          sector: string;
          industry: string;
          mktCap: number;
          price: number;
          volAvg: number;
        }>
      >(`/profile/${batch.join(",")}`);

      for (const profile of profiles) {
        results.set(profile.symbol, profile);
      }
    }

    return results;
  }

  // ============================================
  // Economic Calendar
  // ============================================

  /**
   * Get economic calendar events
   *
   * @param from - Start date (YYYY-MM-DD format)
   * @param to - End date (YYYY-MM-DD format)
   * @returns Economic calendar events
   */
  async getEconomicCalendar(from?: string, to?: string): Promise<FMPEconomicEvent[]> {
    const params: Record<string, string> = {};
    if (from) {
      params.from = from;
    }
    if (to) {
      params.to = to;
    }
    return this.request<FMPEconomicEvent[]>("/economic_calendar", params);
  }

  // ============================================
  // Stock News
  // ============================================

  /**
   * Get stock news for specific symbols
   *
   * @param symbols - Array of ticker symbols (max 5 recommended)
   * @param limit - Number of articles to return (default 50)
   * @returns Stock news articles
   */
  async getStockNews(symbols?: string[], limit = 50): Promise<FMPStockNews[]> {
    const params: Record<string, string | number> = { limit };
    if (symbols && symbols.length > 0) {
      params.tickers = symbols.join(",");
    }
    return this.request<FMPStockNews[]>("/stock_news", params);
  }

  /**
   * Get general market news (not symbol-specific)
   *
   * @param limit - Number of articles to return (default 50)
   * @returns General market news articles
   */
  async getGeneralNews(limit = 50): Promise<FMPStockNews[]> {
    return this.request<FMPStockNews[]>("/stock_news", { limit });
  }
}

/**
 * Economic calendar event from FMP
 */
export interface FMPEconomicEvent {
  date: string;
  country: string;
  event: string;
  actual?: number | null;
  previous?: number | null;
  estimate?: number | null;
  change?: number | null;
  changePercentage?: number | null;
  unit?: string;
  impact?: "Low" | "Medium" | "High";
}

/**
 * Stock news article from FMP
 */
export interface FMPStockNews {
  symbol: string;
  publishedDate: string;
  title: string;
  image: string;
  site: string;
  text: string;
  url: string;
}

/**
 * Create FMP client from environment
 */
export function createFMPClient(config?: Partial<FMPClientConfig>): FMPClient {
  const apiKey = config?.apiKey ?? process.env.FMP_KEY;

  if (!apiKey) {
    throw new Error("FMP_KEY environment variable is required");
  }

  return new FMPClient({
    apiKey,
    ...config,
  });
}
