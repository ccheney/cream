/**
 * Indicator Batch Job Adapters
 *
 * Bridges between external data provider clients and the batch job interfaces.
 * These adapters implement the interfaces expected by @cream/indicators batch jobs.
 *
 * @see packages/indicators/src/batch
 */

import type {
  AlpacaCorporateAction,
  AlpacaCorporateActionsClient,
  ExtractedSentiment,
  FINRAClient,
  FINRAQueryRequest,
  FINRAShortInterestRecord,
  FMPBalanceSheet,
  FMPCashFlowStatement,
  FMPCompanyProfile,
  FMPIncomeStatement,
  FMPKeyMetrics,
  FundamentalsFMPClient,
  SentimentDataProvider,
  SharesOutstandingProvider,
} from "@cream/indicators";
import { z } from "zod";
import { log } from "../logger";

// ============================================
// FMP Client Adapter
// ============================================

const FMP_BASE_URL = "https://financialmodelingprep.com/api";
const FMP_VERSION = "v3";

/**
 * FMP API adapter implementing FundamentalsFMPClient interface.
 * Uses direct fetch calls with rate limiting.
 */
export class FMPClientAdapter implements FundamentalsFMPClient {
  private readonly apiKey: string;
  private lastRequestTime = 0;
  private readonly minRequestIntervalMs = 250; // ~4 req/sec to stay under limits

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async getKeyMetrics(
    symbol: string,
    params?: { period?: string; limit?: number }
  ): Promise<FMPKeyMetrics[]> {
    const url = new URL(`${FMP_BASE_URL}/${FMP_VERSION}/key-metrics/${symbol}`);
    url.searchParams.set("apikey", this.apiKey);
    if (params?.period) {
      url.searchParams.set("period", params.period);
    }
    if (params?.limit) {
      url.searchParams.set("limit", params.limit.toString());
    }

    return this.fetchWithRateLimit<FMPKeyMetrics[]>(url.toString());
  }

  async getIncomeStatement(
    symbol: string,
    params?: { period?: string; limit?: number }
  ): Promise<FMPIncomeStatement[]> {
    const url = new URL(`${FMP_BASE_URL}/${FMP_VERSION}/income-statement/${symbol}`);
    url.searchParams.set("apikey", this.apiKey);
    if (params?.period) {
      url.searchParams.set("period", params.period);
    }
    if (params?.limit) {
      url.searchParams.set("limit", params.limit.toString());
    }

    return this.fetchWithRateLimit<FMPIncomeStatement[]>(url.toString());
  }

  async getBalanceSheet(
    symbol: string,
    params?: { period?: string; limit?: number }
  ): Promise<FMPBalanceSheet[]> {
    const url = new URL(`${FMP_BASE_URL}/${FMP_VERSION}/balance-sheet-statement/${symbol}`);
    url.searchParams.set("apikey", this.apiKey);
    if (params?.period) {
      url.searchParams.set("period", params.period);
    }
    if (params?.limit) {
      url.searchParams.set("limit", params.limit.toString());
    }

    return this.fetchWithRateLimit<FMPBalanceSheet[]>(url.toString());
  }

  async getCashFlowStatement(
    symbol: string,
    params?: { period?: string; limit?: number }
  ): Promise<FMPCashFlowStatement[]> {
    const url = new URL(`${FMP_BASE_URL}/${FMP_VERSION}/cash-flow-statement/${symbol}`);
    url.searchParams.set("apikey", this.apiKey);
    if (params?.period) {
      url.searchParams.set("period", params.period);
    }
    if (params?.limit) {
      url.searchParams.set("limit", params.limit.toString());
    }

    return this.fetchWithRateLimit<FMPCashFlowStatement[]>(url.toString());
  }

  async getCompanyProfile(symbol: string): Promise<FMPCompanyProfile | null> {
    const url = new URL(`${FMP_BASE_URL}/${FMP_VERSION}/profile/${symbol}`);
    url.searchParams.set("apikey", this.apiKey);

    const profiles = await this.fetchWithRateLimit<FMPCompanyProfile[]>(url.toString());
    return profiles.length > 0 ? (profiles[0] ?? null) : null;
  }

  private async fetchWithRateLimit<T>(url: string): Promise<T> {
    // Respect rate limit
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.minRequestIntervalMs) {
      await new Promise((resolve) => setTimeout(resolve, this.minRequestIntervalMs - elapsed));
    }
    this.lastRequestTime = Date.now();

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`FMP API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }
}

// ============================================
// FINRA Client Adapter
// ============================================

const FINRA_API_URL = "https://api.finra.org/data/group/otcMarket/name/shortInterest";

/**
 * FINRA API adapter implementing FINRAClient interface.
 * Fetches short interest data from FINRA's public API.
 */
export class FINRAClientAdapter implements FINRAClient {
  async queryShortInterest(request?: FINRAQueryRequest): Promise<FINRAShortInterestRecord[]> {
    const response = await fetch(FINRA_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        fields: [
          "symbolCode",
          "issueName",
          "marketClassCode",
          "settlementDate",
          "currentShortPositionQuantity",
          "previousShortPositionQuantity",
          "changePreviousNumber",
          "changePercent",
          "averageDailyVolumeQuantity",
          "daysToCoverQuantity",
          "stockSplitFlag",
          "revisionFlag",
        ],
        compareFilters: request?.compareFilters?.map((f) => ({
          fieldName: f.fieldName,
          compareType: f.compareType,
          fieldValue: f.fieldValue,
        })),
        orFilters: request?.orFilters,
        limit: request?.limit ?? 100,
        offset: request?.offset ?? 0,
      }),
    });

    if (!response.ok) {
      throw new Error(`FINRA API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as Array<{
      symbolCode?: string;
      issueName?: string;
      marketClassCode?: string;
      settlementDate?: string;
      currentShortPositionQuantity?: number;
      previousShortPositionQuantity?: number;
      changePreviousNumber?: number;
      changePercent?: number;
      averageDailyVolumeQuantity?: number;
      daysToCoverQuantity?: number;
      stockSplitFlag?: string;
      revisionFlag?: string;
    }>;

    return data.map((record) => ({
      symbolCode: record.symbolCode ?? "",
      issueName: record.issueName ?? "",
      marketClassCode: record.marketClassCode ?? "",
      settlementDate: record.settlementDate ?? "",
      currentShortPositionQuantity: record.currentShortPositionQuantity ?? 0,
      previousShortPositionQuantity: record.previousShortPositionQuantity ?? null,
      changePreviousNumber: record.changePreviousNumber ?? null,
      changePercent: record.changePercent ?? null,
      averageDailyVolumeQuantity: record.averageDailyVolumeQuantity ?? null,
      daysToCoverQuantity: record.daysToCoverQuantity ?? null,
      stockSplitFlag: record.stockSplitFlag ?? null,
      revisionFlag: record.revisionFlag ?? null,
    }));
  }

  async getShortInterestBySymbols(
    symbols: string[],
    settlementDate?: string
  ): Promise<FINRAShortInterestRecord[]> {
    const filters: FINRAQueryRequest["compareFilters"] = [
      {
        fieldName: "symbolCode",
        compareType: "IN",
        fieldValue: symbols,
      },
    ];

    if (settlementDate) {
      filters.push({
        fieldName: "settlementDate",
        compareType: "EQUAL",
        fieldValue: settlementDate,
      });
    }

    return this.queryShortInterest({
      compareFilters: filters,
      limit: symbols.length * 2, // Allow for multiple records per symbol
    });
  }

  async getLatestSettlementDate(): Promise<string> {
    // Query latest records to find most recent settlement date
    const records = await this.queryShortInterest({ limit: 1 });
    if (records.length === 0) {
      throw new Error("No short interest records found to determine latest settlement date");
    }
    return records[0]?.settlementDate ?? "";
  }
}

// ============================================
// Shares Outstanding Provider Adapter
// ============================================

/**
 * Provides shares outstanding data using FMP API.
 */
export class SharesOutstandingAdapter implements SharesOutstandingProvider {
  private readonly fmpClient: FMPClientAdapter;

  constructor(fmpApiKey: string) {
    this.fmpClient = new FMPClientAdapter(fmpApiKey);
  }

  async getSharesData(
    symbol: string
  ): Promise<{ sharesOutstanding: number; floatShares: number | null } | null> {
    try {
      const profile = await this.fmpClient.getCompanyProfile(symbol);
      if (profile?.mktCap && profile.price && profile.price > 0) {
        const sharesOutstanding = Math.round(profile.mktCap / profile.price);
        // FMP doesn't provide float directly, we'd need additional data
        return {
          sharesOutstanding,
          floatShares: null,
        };
      }
      return null;
    } catch (error) {
      log.warn(
        { symbol, error: error instanceof Error ? error.message : String(error) },
        "Failed to get shares outstanding"
      );
      return null;
    }
  }
}

// ============================================
// Sentiment Data Provider Adapter
// ============================================

/**
 * Sentiment data provider using FMP stock news sentiment.
 */
export class SentimentDataAdapter implements SentimentDataProvider {
  private readonly apiKey: string;
  private readonly minRequestIntervalMs = 250;
  private lastRequestTime = 0;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async getSentimentData(
    symbols: string[],
    _startDate: string,
    _endDate: string
  ): Promise<ExtractedSentiment[]> {
    const results: ExtractedSentiment[] = [];

    for (const symbol of symbols) {
      try {
        // Rate limit
        const now = Date.now();
        const elapsed = now - this.lastRequestTime;
        if (elapsed < this.minRequestIntervalMs) {
          await new Promise((resolve) => setTimeout(resolve, this.minRequestIntervalMs - elapsed));
        }
        this.lastRequestTime = Date.now();

        // Get news sentiment from FMP
        const url = new URL(`${FMP_BASE_URL}/${FMP_VERSION}/stock_news`);
        url.searchParams.set("tickers", symbol);
        url.searchParams.set("limit", "20");
        url.searchParams.set("apikey", this.apiKey);

        const response = await fetch(url.toString());
        if (!response.ok) {
          continue;
        }

        const news = (await response.json()) as Array<{
          symbol: string;
          publishedDate: string;
          title: string;
          text: string;
          site: string;
        }>;

        for (const item of news) {
          // Simple sentiment classification based on keywords
          const text = `${item.title} ${item.text}`.toLowerCase();
          let sentiment: "bullish" | "bearish" | "neutral" = "neutral";
          let confidence = 0.5;

          const positiveWords = ["beat", "upgrade", "growth", "profit", "gain", "bullish", "buy"];
          const negativeWords = [
            "miss",
            "downgrade",
            "loss",
            "decline",
            "bearish",
            "sell",
            "warning",
          ];

          const positiveCount = positiveWords.filter((w) => text.includes(w)).length;
          const negativeCount = negativeWords.filter((w) => text.includes(w)).length;

          if (positiveCount > negativeCount) {
            sentiment = "bullish";
            confidence = Math.min(0.9, 0.5 + positiveCount * 0.1);
          } else if (negativeCount > positiveCount) {
            sentiment = "bearish";
            confidence = Math.min(0.9, 0.5 + negativeCount * 0.1);
          }

          results.push({
            symbol: item.symbol,
            sourceType: "news",
            sentiment,
            confidence,
            eventTime: new Date(item.publishedDate),
          });
        }
      } catch (error) {
        log.warn(
          { symbol, error: error instanceof Error ? error.message : String(error) },
          "Failed to fetch sentiment data"
        );
      }
    }

    return results;
  }

  async getHistoricalSentiment(
    _symbol: string,
    _lookbackDays: number
  ): Promise<Array<{ date: string; score: number }>> {
    // For now, return empty array - historical sentiment would require
    // stored data or additional API calls
    return [];
  }
}

// ============================================
// Alpaca Corporate Actions Adapter
// ============================================

const ALPACA_BASE_URL = "https://data.alpaca.markets/v1beta1/corporate-actions";

/**
 * Response schema for Alpaca corporate actions API.
 */
const AlpacaCorporateActionsResponseSchema = z.object({
  corporate_actions: z.record(
    z.string(),
    z.array(
      z.object({
        corporate_action_type: z.string(),
        symbol: z.string(),
        ex_date: z.string(),
        record_date: z.string().nullable(),
        payment_date: z.string().nullable(),
        cash: z.number().optional(),
        new_rate: z.number().optional(),
        old_rate: z.number().optional(),
        description: z.string().optional(),
      })
    )
  ),
});

/**
 * Alpaca Markets corporate actions API adapter.
 */
export class AlpacaCorporateActionsAdapter implements AlpacaCorporateActionsClient {
  private readonly apiKey: string;
  private readonly apiSecret: string;

  constructor(apiKey: string, apiSecret: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  async getCorporateActions(params: {
    symbol?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
  }): Promise<AlpacaCorporateAction[]> {
    const url = new URL(ALPACA_BASE_URL);
    if (params.symbol) {
      url.searchParams.set("symbols", params.symbol);
    }
    if (params.startDate) {
      url.searchParams.set("start", params.startDate);
    }
    if (params.endDate) {
      url.searchParams.set("end", params.endDate);
    }
    if (params.limit) {
      url.searchParams.set("limit", params.limit.toString());
    }

    const response = await fetch(url.toString(), {
      headers: {
        "APCA-API-KEY-ID": this.apiKey,
        "APCA-API-SECRET-KEY": this.apiSecret,
      },
    });

    if (!response.ok) {
      throw new Error(`Alpaca API error: ${response.status} ${response.statusText}`);
    }

    const data = AlpacaCorporateActionsResponseSchema.parse(await response.json());
    return this.flattenCorporateActions(data.corporate_actions);
  }

  async getCorporateActionsForSymbols(
    symbols: string[],
    startDate: string,
    endDate: string
  ): Promise<AlpacaCorporateAction[]> {
    const url = new URL(ALPACA_BASE_URL);
    url.searchParams.set("symbols", symbols.join(","));
    url.searchParams.set("start", startDate);
    url.searchParams.set("end", endDate);

    const response = await fetch(url.toString(), {
      headers: {
        "APCA-API-KEY-ID": this.apiKey,
        "APCA-API-SECRET-KEY": this.apiSecret,
      },
    });

    if (!response.ok) {
      throw new Error(`Alpaca API error: ${response.status} ${response.statusText}`);
    }

    const data = AlpacaCorporateActionsResponseSchema.parse(await response.json());
    return this.flattenCorporateActions(data.corporate_actions);
  }

  private flattenCorporateActions(
    actions: z.infer<typeof AlpacaCorporateActionsResponseSchema>["corporate_actions"]
  ): AlpacaCorporateAction[] {
    const results: AlpacaCorporateAction[] = [];

    for (const [_type, items] of Object.entries(actions)) {
      for (const item of items) {
        // Map Alpaca action type to our expected format
        let actionType: AlpacaCorporateAction["corporate_action_type"];
        switch (item.corporate_action_type.toLowerCase()) {
          case "dividend":
          case "cash_dividend":
            actionType = "Dividend";
            break;
          case "special_dividend":
            actionType = "SpecialDividend";
            break;
          case "stock_split":
          case "forward_split":
            actionType = "Split";
            break;
          case "reverse_split":
            actionType = "ReverseSplit";
            break;
          case "spinoff":
          case "spin_off":
            actionType = "Spinoff";
            break;
          case "merger":
            actionType = "Merger";
            break;
          case "acquisition":
            actionType = "Acquisition";
            break;
          case "name_change":
          case "symbol_change":
            actionType = "NameChange";
            break;
          default:
            actionType = "Dividend"; // Default fallback
        }

        // Calculate value based on action type
        let value = 0;
        if (item.cash !== undefined) {
          value = item.cash;
        } else if (item.new_rate !== undefined && item.old_rate !== undefined) {
          value = item.old_rate !== 0 ? item.new_rate / item.old_rate : 1;
        }

        results.push({
          corporate_action_type: actionType,
          symbol: item.symbol,
          ex_date: item.ex_date,
          record_date: item.record_date,
          payment_date: item.payment_date,
          value,
          description: item.description,
        });
      }
    }

    return results;
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create FMP client adapter from environment.
 */
export function createFMPClientFromEnv(): FMPClientAdapter {
  const apiKey = process.env.FMP_KEY ?? Bun.env.FMP_KEY;
  if (!apiKey) {
    throw new Error("FMP_KEY environment variable is required for fundamentals batch job");
  }
  return new FMPClientAdapter(apiKey);
}

/**
 * Create FINRA client adapter.
 */
export function createFINRAClient(): FINRAClientAdapter {
  return new FINRAClientAdapter();
}

/**
 * Create shares outstanding provider from environment.
 */
export function createSharesOutstandingProviderFromEnv(): SharesOutstandingAdapter {
  const apiKey = process.env.FMP_KEY ?? Bun.env.FMP_KEY;
  if (!apiKey) {
    throw new Error("FMP_KEY environment variable is required for shares outstanding provider");
  }
  return new SharesOutstandingAdapter(apiKey);
}

/**
 * Create sentiment data provider from environment.
 */
export function createSentimentProviderFromEnv(): SentimentDataAdapter {
  const apiKey = process.env.FMP_KEY ?? Bun.env.FMP_KEY;
  if (!apiKey) {
    throw new Error("FMP_KEY environment variable is required for sentiment provider");
  }
  return new SentimentDataAdapter(apiKey);
}

/**
 * Create Alpaca corporate actions adapter from environment.
 */
export function createAlpacaCorporateActionsFromEnv(): AlpacaCorporateActionsAdapter {
  const apiKey = process.env.ALPACA_KEY ?? Bun.env.ALPACA_KEY;
  const apiSecret = process.env.ALPACA_SECRET ?? Bun.env.ALPACA_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error(
      "ALPACA_KEY and ALPACA_SECRET environment variables are required for corporate actions batch job"
    );
  }
  return new AlpacaCorporateActionsAdapter(apiKey, apiSecret);
}
