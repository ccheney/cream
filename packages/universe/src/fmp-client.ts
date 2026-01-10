/**
 * FMP (Financial Modeling Prep) API Client
 *
 * Adapter for fetching index constituents, ETF holdings, and stock screener data.
 *
 * @see https://site.financialmodelingprep.com/developer/docs
 */

import type { IndexId } from "@cream/config";

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

const DEFAULT_CONFIG: Required<Omit<FMPClientConfig, "apiKey">> = {
  baseUrl: "https://financialmodelingprep.com/api/v3",
  timeout: 30000,
  retries: 3,
  retryDelay: 1000,
};

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

export interface FMPHistoricalConstituent {
  dateAdded: string;
  addedSecurity: string;
  removedTicker: string;
  removedSecurity: string;
  symbol: string;
  reason: string;
}

export interface FMPETFHolding {
  asset: string;
  name: string;
  sharesNumber: number;
  weightPercentage: number;
  marketValue?: number;
  isin?: string;
  cusip?: string;
}

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

export class FMPClient {
  private readonly config: Required<FMPClientConfig>;

  constructor(config: FMPClientConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  private async request<T>(
    endpoint: string,
    params: Record<string, string | number | boolean> = {}
  ): Promise<T> {
    const url = new URL(`${this.config.baseUrl}${endpoint}`);
    url.searchParams.set("apikey", this.config.apiKey);

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

        // Don't retry on 4xx client errors (except 429 rate limiting)
        if (lastError.message.includes("4") && !lastError.message.includes("429")) {
          throw lastError;
        }

        if (attempt < this.config.retries - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, this.config.retryDelay * (attempt + 1))
          );
        }
      }
    }

    throw lastError ?? new Error("FMP API request failed");
  }

  async getIndexConstituents(indexId: IndexId): Promise<FMPConstituent[]> {
    const endpoint = this.getIndexEndpoint(indexId);
    return this.request<FMPConstituent[]>(endpoint);
  }

  async getHistoricalConstituents(indexId: IndexId): Promise<FMPHistoricalConstituent[]> {
    const endpoint = this.getHistoricalIndexEndpoint(indexId);
    return this.request<FMPHistoricalConstituent[]>(endpoint);
  }

  /**
   * Reconstructs index composition at a historical date for survivorship-bias-free backtesting.
   * Works backward from current constituents, reversing additions/removals that occurred after asOfDate.
   */
  async getConstituentsAsOf(indexId: IndexId, asOfDate: Date): Promise<string[]> {
    const current = await this.getIndexConstituents(indexId);
    const currentSymbols = new Set(current.map((c) => c.symbol));
    const history = await this.getHistoricalConstituents(indexId);

    // biome-ignore lint/style/noNonNullAssertion: split always returns array
    const asOfDateStr = asOfDate.toISOString().split("T")[0]!;

    for (const change of history) {
      if (asOfDateStr && change.dateAdded > asOfDateStr) {
        if (change.symbol) {
          currentSymbols.delete(change.symbol);
        }
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
        // FMP Russell 2000 endpoint has limited coverage; consider using screener as fallback
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

  async getETFHoldings(symbol: string): Promise<FMPETFHolding[]> {
    return this.request<FMPETFHolding[]>(`/etf-holder/${symbol}`);
  }

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

    // FMP profile endpoint accepts up to 50 comma-separated symbols per request
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

  async getStockNews(symbols?: string[], limit = 50): Promise<FMPStockNews[]> {
    const params: Record<string, string | number> = { limit };
    if (symbols && symbols.length > 0) {
      params.tickers = symbols.join(",");
    }
    return this.request<FMPStockNews[]>("/stock_news", params);
  }

  async getGeneralNews(limit = 50): Promise<FMPStockNews[]> {
    return this.request<FMPStockNews[]>("/stock_news", { limit });
  }

  async getEarningsTranscript(
    symbol: string,
    year?: number,
    quarter?: number
  ): Promise<FMPEarningsTranscript[]> {
    const params: Record<string, string | number> = {};
    if (year !== undefined) {
      params.year = year;
    }
    if (quarter !== undefined) {
      params.quarter = quarter;
    }
    return this.request<FMPEarningsTranscript[]>(`/earning_call_transcript/${symbol}`, params);
  }
}

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

export interface FMPStockNews {
  symbol: string;
  publishedDate: string;
  title: string;
  image: string;
  site: string;
  text: string;
  url: string;
}

export interface FMPEarningsTranscript {
  symbol: string;
  quarter: number;
  year: number;
  date: string;
  content: string;
}

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
