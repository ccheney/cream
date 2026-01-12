/**
 * Indicator Service Factory
 *
 * Creates and configures the IndicatorService with all dependencies.
 * Uses lazy singleton pattern for efficient resource management.
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

import {
  createBatchRepositoryAdapters,
  createIndicatorCache,
  createLiquidityCalculator,
  createOptionsCalculator,
  createPriceCalculator,
  IndicatorService,
  type MarketDataProvider,
  type OHLCVBar,
  type Quote,
  type TursoCorporateActionsRepository,
  type TursoFundamentalsRepository,
  type TursoRepositories,
  type TursoSentimentRepository,
  type TursoShortInterestRepository,
} from "@cream/indicators";
import {
  type AlpacaMarketDataClient,
  createRealtimeOptionsProvider,
  type RealtimeOptionsProvider,
} from "@cream/marketdata";
import type { TursoClient } from "@cream/storage";
import { getDbClient } from "../db.js";
import { getAlpacaClient } from "../routes/market/types.js";

// ============================================
// Market Data Provider Adapter
// ============================================

/**
 * Adapts AlpacaMarketDataClient to the MarketDataProvider interface
 * expected by IndicatorService.
 */
class AlpacaMarketDataAdapter implements MarketDataProvider {
  constructor(private readonly client: AlpacaMarketDataClient) {}

  async getBars(symbol: string, limit: number): Promise<OHLCVBar[]> {
    // Calculate date range based on limit (assume daily bars need ~1.5x trading days)
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - Math.ceil(limit * 1.5));

    const bars = await this.client.getBars(
      symbol,
      "1Hour",
      from.toISOString().slice(0, 10),
      to.toISOString().slice(0, 10),
      limit
    );

    return bars.map((bar) => ({
      timestamp: new Date(bar.timestamp).getTime(),
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
    }));
  }

  async getQuote(symbol: string): Promise<Quote | null> {
    try {
      const snapshots = await this.client.getSnapshots([symbol]);
      const snapshot = snapshots.get(symbol);

      if (!snapshot) {
        return null;
      }

      return {
        timestamp: new Date(snapshot.latestQuote?.timestamp ?? Date.now()).getTime(),
        bidPrice: snapshot.latestQuote?.bidPrice ?? 0,
        bidSize: snapshot.latestQuote?.bidSize ?? 0,
        askPrice: snapshot.latestQuote?.askPrice ?? 0,
        askSize: snapshot.latestQuote?.askSize ?? 0,
      };
    } catch {
      return null;
    }
  }
}

// ============================================
// Turso Repository Adapters
// ============================================

/**
 * Creates Turso repository adapters from the database client.
 * These adapt the raw Turso queries to the repository interfaces.
 */
function createTursoRepositories(client: TursoClient): TursoRepositories {
  return {
    fundamentals: createFundamentalsRepo(client),
    shortInterest: createShortInterestRepo(client),
    sentiment: createSentimentRepo(client),
    corporateActions: createCorporateActionsRepo(client),
  };
}

function createFundamentalsRepo(client: TursoClient): TursoFundamentalsRepository {
  return {
    async findLatestBySymbol(symbol: string) {
      const rows = await client.execute(
        `SELECT * FROM fundamental_indicators
         WHERE symbol = ?
         ORDER BY date DESC
         LIMIT 1`,
        [symbol.toUpperCase()]
      );

      const row = rows[0];
      if (!row) {
        return null;
      }

      return {
        id: String(row.id),
        symbol: String(row.symbol),
        date: String(row.date),
        peRatioTtm: row.pe_ratio_ttm as number | null,
        peRatioForward: row.pe_ratio_forward as number | null,
        pbRatio: row.pb_ratio as number | null,
        evEbitda: row.ev_ebitda as number | null,
        earningsYield: row.earnings_yield as number | null,
        dividendYield: row.dividend_yield as number | null,
        cape10yr: row.cape_10yr as number | null,
        grossProfitability: row.gross_profitability as number | null,
        roe: row.roe as number | null,
        roa: row.roa as number | null,
        assetGrowth: row.asset_growth as number | null,
        accrualsRatio: row.accruals_ratio as number | null,
        cashFlowQuality: row.cash_flow_quality as number | null,
        beneishMScore: row.beneish_m_score as number | null,
        marketCap: row.market_cap as number | null,
        sector: row.sector as string | null,
        industry: row.industry as string | null,
        source: String(row.source ?? "FMP"),
        computedAt: String(row.computed_at),
      };
    },
  };
}

function createShortInterestRepo(client: TursoClient): TursoShortInterestRepository {
  return {
    async findLatestBySymbol(symbol: string) {
      const rows = await client.execute(
        `SELECT * FROM short_interest_indicators
         WHERE symbol = ?
         ORDER BY settlement_date DESC
         LIMIT 1`,
        [symbol.toUpperCase()]
      );

      const row = rows[0];
      if (!row) {
        return null;
      }

      return {
        id: String(row.id),
        symbol: String(row.symbol),
        settlementDate: String(row.settlement_date),
        shortInterest: row.short_interest as number,
        shortInterestRatio: row.short_interest_ratio as number | null,
        daysToCover: row.days_to_cover as number | null,
        shortPctFloat: row.short_pct_float as number | null,
        shortInterestChange: row.short_interest_change as number | null,
        source: String(row.source ?? "FINRA"),
        fetchedAt: String(row.fetched_at),
      };
    },
  };
}

function createSentimentRepo(client: TursoClient): TursoSentimentRepository {
  return {
    async findLatestBySymbol(symbol: string) {
      const rows = await client.execute(
        `SELECT * FROM sentiment_indicators
         WHERE symbol = ?
         ORDER BY date DESC
         LIMIT 1`,
        [symbol.toUpperCase()]
      );

      const row = rows[0];
      if (!row) {
        return null;
      }

      return {
        id: String(row.id),
        symbol: String(row.symbol),
        date: String(row.date),
        sentimentScore: row.sentiment_score as number | null,
        sentimentStrength: row.sentiment_strength as number | null,
        newsVolume: row.news_volume as number | null,
        sentimentMomentum: row.sentiment_momentum as number | null,
        eventRiskFlag: Boolean(row.event_risk_flag),
        newsSentiment: row.news_sentiment as number | null,
        socialSentiment: row.social_sentiment as number | null,
        analystSentiment: row.analyst_sentiment as number | null,
        computedAt: String(row.computed_at),
      };
    },
  };
}

function createCorporateActionsRepo(client: TursoClient): TursoCorporateActionsRepository {
  return {
    async getForSymbol(symbol: string) {
      const rows = await client.execute(
        `SELECT * FROM corporate_actions_indicators
         WHERE symbol = ?
         ORDER BY date DESC`,
        [symbol.toUpperCase()]
      );

      return rows.map((row) => ({
        id: row.id as number | undefined,
        symbol: String(row.symbol),
        actionType: row.recent_split ? "SPLIT" : "DIVIDEND",
        exDate: String(row.date),
        recordDate: null,
        payDate: null,
        ratio: row.split_ratio ? Number.parseFloat(String(row.split_ratio)) : null,
        amount: row.trailing_dividend_yield as number | null,
        details: null,
        provider: "ALPACA",
        createdAt: undefined,
      }));
    },
    async getDividends(symbol: string) {
      const rows = await client.execute(
        `SELECT * FROM corporate_actions_indicators
         WHERE symbol = ? AND trailing_dividend_yield IS NOT NULL
         ORDER BY date DESC`,
        [symbol.toUpperCase()]
      );

      return rows.map((row) => ({
        id: row.id as number | undefined,
        symbol: String(row.symbol),
        actionType: "DIVIDEND",
        exDate: String(row.date),
        recordDate: null,
        payDate: null,
        ratio: null,
        amount: row.trailing_dividend_yield as number | null,
        details: null,
        provider: "ALPACA",
        createdAt: undefined,
      }));
    },
    async getSplits(symbol: string) {
      const rows = await client.execute(
        `SELECT * FROM corporate_actions_indicators
         WHERE symbol = ? AND recent_split = 1
         ORDER BY date DESC`,
        [symbol.toUpperCase()]
      );

      return rows.map((row) => ({
        id: row.id as number | undefined,
        symbol: String(row.symbol),
        actionType: "SPLIT",
        exDate: String(row.date),
        recordDate: null,
        payDate: null,
        ratio: row.split_ratio ? Number.parseFloat(String(row.split_ratio)) : null,
        amount: null,
        details: null,
        provider: "ALPACA",
        createdAt: undefined,
      }));
    },
  };
}

// ============================================
// Singleton Factory
// ============================================

let indicatorService: IndicatorService | null = null;
let optionsProvider: RealtimeOptionsProvider | null = null;
let initPromise: Promise<IndicatorService> | null = null;

/**
 * Get or create the IndicatorService singleton.
 * Thread-safe lazy initialization with all dependencies wired.
 */
export async function getIndicatorService(): Promise<IndicatorService> {
  if (indicatorService) {
    return indicatorService;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = initializeIndicatorService();

  try {
    indicatorService = await initPromise;
    return indicatorService;
  } catch (error) {
    initPromise = null;
    throw error;
  }
}

async function initializeIndicatorService(): Promise<IndicatorService> {
  // Get dependencies
  const alpacaClient = getAlpacaClient();
  const tursoClient = await getDbClient();

  // Create adapters
  const marketData = new AlpacaMarketDataAdapter(alpacaClient);
  const priceCalculator = createPriceCalculator();
  const liquidityCalculator = createLiquidityCalculator();
  const cache = createIndicatorCache();

  // Create Turso repository adapters
  const tursoRepos = createTursoRepositories(tursoClient);
  const batchRepos = createBatchRepositoryAdapters(tursoRepos);

  // Create realtime options data provider
  optionsProvider = await createRealtimeOptionsProvider(alpacaClient, {
    riskFreeRate: 0.05,
    maxDte: 60,
    minDte: 1,
  });

  // Create options calculator
  const optionsCalculator = createOptionsCalculator();

  // Create service with all dependencies
  const service = new IndicatorService(
    {
      marketData,
      priceCalculator,
      liquidityCalculator,
      optionsCalculator,
      cache,
      optionsData: optionsProvider,
      fundamentalRepo: batchRepos.fundamentalRepo,
      shortInterestRepo: batchRepos.shortInterestRepo,
      sentimentRepo: batchRepos.sentimentRepo,
      corporateActionsRepo: batchRepos.corporateActionsRepo,
    },
    {
      barsLookback: 200,
      includeBatchIndicators: true,
      includeOptionsIndicators: true,
      enableCache: true,
      bypassCache: false,
      batchConcurrency: 5,
    }
  );

  return service;
}

/**
 * Reset the service singleton (for testing).
 */
export function resetIndicatorService(): void {
  if (optionsProvider) {
    optionsProvider.disconnect();
    optionsProvider = null;
  }
  indicatorService = null;
  initPromise = null;
}
