/**
 * Unified Prediction Market Client
 *
 * Abstracts both Kalshi and Polymarket into a single interface for
 * cross-platform market data retrieval and signal aggregation.
 */

import type { PredictionMarketsConfig } from "@cream/config";
import type { PredictionMarketEvent, PredictionMarketScores } from "@cream/domain";
import { createKalshiClient, type KalshiClient } from "../providers/kalshi";
import { createPolymarketClient, type PolymarketClient } from "../providers/polymarket";
import {
  type ArbitrageAlert,
  ArbitrageDetector,
  type ArbitrageSummary,
} from "./arbitrage-detector";
import { MarketMatcher, type MatchedMarket } from "./market-matcher";

/**
 * Configuration for the unified client
 */
export interface UnifiedClientConfig {
  /** Whether to enable Kalshi integration */
  kalshiEnabled: boolean;
  /** Whether to enable Polymarket integration */
  polymarketEnabled: boolean;
  /** Minimum liquidity score to include markets */
  minLiquidityScore: number;
  /** Maximum age of markets to include (hours) */
  maxMarketAgeHours: number;
}

export const DEFAULT_UNIFIED_CONFIG: UnifiedClientConfig = {
  kalshiEnabled: true,
  polymarketEnabled: true,
  minLiquidityScore: 0.3,
  maxMarketAgeHours: 168, // 1 week
};

/**
 * Aggregated macro risk signals from prediction markets
 */
export interface MacroRiskSignals {
  /** Probability of Fed rate cut at next meeting */
  fedCutProbability?: number;
  /** Probability of Fed rate hike at next meeting */
  fedHikeProbability?: number;
  /** Probability of recession in next 12 months */
  recessionProbability12m?: number;
  /** Probability of government shutdown */
  shutdownProbability?: number;
  /** Overall macro uncertainty index (0-1) */
  macroUncertaintyIndex?: number;
  /** Policy event risk score (0-1) */
  policyEventRisk?: number;
  /** Market confidence score (inverse of uncertainty) */
  marketConfidence?: number;
  /** Timestamp of signal computation */
  timestamp: string;
  /** Number of markets used in computation */
  marketCount: number;
  /** Platforms contributing to signals */
  platforms: string[];
}

/**
 * Fed rate market data
 */
export interface FedRateMarket {
  ticker: string;
  platform: string;
  question: string;
  cutProbability: number;
  hikeProbability: number;
  holdProbability: number;
  meetingDate: string;
  liquidity: number;
}

/**
 * Economic indicator market data
 */
export interface EconomicDataMarket {
  ticker: string;
  platform: string;
  question: string;
  indicator: string;
  outcomes: Array<{
    label: string;
    probability: number;
  }>;
  releaseDate: string;
  liquidity: number;
}

/**
 * Unified client result with cross-platform data
 */
export interface UnifiedMarketData {
  events: PredictionMarketEvent[];
  matchedMarkets: MatchedMarket[];
  arbitrageAlerts: ArbitrageAlert[];
  arbitrageSummary: ArbitrageSummary;
  scores: PredictionMarketScores;
  signals: MacroRiskSignals;
}

/**
 * Unified Prediction Market Client
 *
 * Aggregates data from Kalshi and Polymarket into a single interface.
 */
export class UnifiedPredictionMarketClient {
  private readonly kalshi: KalshiClient | null;
  private readonly polymarket: PolymarketClient | null;
  private readonly matcher: MarketMatcher;
  private readonly arbitrageDetector: ArbitrageDetector;
  private readonly config: UnifiedClientConfig;

  constructor(
    platformConfig: PredictionMarketsConfig,
    unifiedConfig: Partial<UnifiedClientConfig> = {}
  ) {
    this.config = { ...DEFAULT_UNIFIED_CONFIG, ...unifiedConfig };
    this.matcher = new MarketMatcher();
    this.arbitrageDetector = new ArbitrageDetector();

    // Initialize Kalshi client if enabled and configured
    if (this.config.kalshiEnabled && platformConfig.kalshi?.enabled) {
      try {
        this.kalshi = createKalshiClient(platformConfig.kalshi);
      } catch {
        this.kalshi = null;
      }
    } else {
      this.kalshi = null;
    }

    // Initialize Polymarket client if enabled and configured
    if (this.config.polymarketEnabled && platformConfig.polymarket?.enabled) {
      try {
        this.polymarket = createPolymarketClient(platformConfig.polymarket);
      } catch {
        this.polymarket = null;
      }
    } else {
      this.polymarket = null;
    }
  }

  /**
   * Fetch and aggregate all market data
   */
  async getAllMarketData(
    marketTypes: Array<
      "FED_RATE" | "ECONOMIC_DATA" | "RECESSION" | "GEOPOLITICAL" | "REGULATORY" | "ELECTION"
    > = ["FED_RATE", "ECONOMIC_DATA", "RECESSION"]
  ): Promise<UnifiedMarketData> {
    const allEvents: PredictionMarketEvent[] = [];

    // Fetch from Kalshi
    if (this.kalshi) {
      try {
        const kalshiEvents = await this.kalshi.fetchMarkets(marketTypes);
        allEvents.push(...kalshiEvents);
      } catch {
        // Silently continue - individual platform failures shouldn't halt aggregation
      }
    }

    // Fetch from Polymarket
    if (this.polymarket) {
      try {
        const polymarketEvents = await this.polymarket.fetchMarkets(marketTypes);
        allEvents.push(...polymarketEvents);
      } catch {
        // Silently continue - individual platform failures shouldn't halt aggregation
      }
    }

    // Filter by liquidity
    const filteredEvents = allEvents.filter(
      (e) => (e.payload.liquidityScore ?? 0) >= this.config.minLiquidityScore
    );

    // Match markets across platforms
    const kalshiEvents = filteredEvents.filter((e) => e.payload.platform === "KALSHI");
    const polymarketEvents = filteredEvents.filter((e) => e.payload.platform === "POLYMARKET");
    const matchedMarkets = this.matcher.findMatches(kalshiEvents, polymarketEvents);

    // Detect arbitrage
    const arbitrageAlerts = this.arbitrageDetector.analyze(matchedMarkets);
    const arbitrageSummary = this.arbitrageDetector.getSummary(arbitrageAlerts);

    // Calculate scores
    const scores = this.calculateCombinedScores(filteredEvents);

    // Calculate signals
    const signals = this.calculateMacroRiskSignals(filteredEvents, scores);

    return {
      events: filteredEvents,
      matchedMarkets,
      arbitrageAlerts,
      arbitrageSummary,
      scores,
      signals,
    };
  }

  /**
   * Get Fed rate markets from all platforms
   */
  async getFedRateMarkets(): Promise<FedRateMarket[]> {
    const data = await this.getAllMarketData(["FED_RATE"]);
    return data.events
      .filter((e) => e.payload.marketType === "FED_RATE")
      .map((e) => this.toFedRateMarket(e));
  }

  /**
   * Get economic data markets for a specific indicator
   */
  async getEconomicDataMarkets(
    indicator: "CPI" | "GDP" | "NFP" | "PCE"
  ): Promise<EconomicDataMarket[]> {
    const data = await this.getAllMarketData(["ECONOMIC_DATA"]);
    return data.events
      .filter((e) => {
        const q = e.payload.marketQuestion.toLowerCase();
        switch (indicator) {
          case "CPI":
            return q.includes("cpi") || q.includes("inflation");
          case "GDP":
            return q.includes("gdp") || q.includes("growth");
          case "NFP":
            return q.includes("job") || q.includes("employment") || q.includes("payroll");
          case "PCE":
            return q.includes("pce") || q.includes("spending");
          default:
            return false;
        }
      })
      .map((e) => this.toEconomicDataMarket(e, indicator));
  }

  /**
   * Get macro risk signals from all platforms
   */
  async getMacroRiskSignals(): Promise<MacroRiskSignals> {
    const data = await this.getAllMarketData();
    return data.signals;
  }

  /**
   * Get arbitrage opportunities
   */
  async getArbitrageOpportunities(): Promise<ArbitrageAlert[]> {
    const data = await this.getAllMarketData();
    return data.arbitrageAlerts.filter((a) => a.type === "opportunity");
  }

  // ============================================
  // Private Methods
  // ============================================

  /**
   * Calculate combined scores from all events
   */
  private calculateCombinedScores(events: PredictionMarketEvent[]): PredictionMarketScores {
    const scores: PredictionMarketScores = {};

    // Aggregate scores from each platform
    const kalshiEvents = events.filter((e) => e.payload.platform === "KALSHI");
    const polymarketEvents = events.filter((e) => e.payload.platform === "POLYMARKET");

    let kalshiScores: PredictionMarketScores = {};
    let polymarketScores: PredictionMarketScores = {};

    if (kalshiEvents.length > 0 && this.kalshi) {
      kalshiScores = this.kalshi.calculateScores(kalshiEvents);
    }
    if (polymarketEvents.length > 0 && this.polymarket) {
      polymarketScores = this.polymarket.calculateScores(polymarketEvents);
    }

    // Average scores where both platforms have data
    const avgOrValue = (a?: number, b?: number): number | undefined => {
      if (a !== undefined && b !== undefined) {
        return (a + b) / 2;
      }
      return a ?? b;
    };

    scores.fedCutProbability = avgOrValue(
      kalshiScores.fedCutProbability,
      polymarketScores.fedCutProbability
    );
    scores.fedHikeProbability = avgOrValue(
      kalshiScores.fedHikeProbability,
      polymarketScores.fedHikeProbability
    );
    scores.recessionProbability12m = avgOrValue(
      kalshiScores.recessionProbability12m,
      polymarketScores.recessionProbability12m
    );
    scores.macroUncertaintyIndex = avgOrValue(
      kalshiScores.macroUncertaintyIndex,
      polymarketScores.macroUncertaintyIndex
    );

    return scores;
  }

  /**
   * Calculate macro risk signals
   */
  private calculateMacroRiskSignals(
    events: PredictionMarketEvent[],
    scores: PredictionMarketScores
  ): MacroRiskSignals {
    const platforms = new Set(events.map((e) => e.payload.platform));

    // Calculate policy event risk
    const policyEvents = events.filter((e) =>
      ["FED_RATE", "GEOPOLITICAL", "REGULATORY"].includes(e.payload.marketType)
    );
    const policyEventRisk =
      policyEvents.length > 0
        ? policyEvents.reduce((sum, e) => {
            // Risk increases with uncertainty (probability close to 0.5)
            const outcomes = e.payload.outcomes;
            const maxProb = Math.max(...outcomes.map((o) => o.probability));
            return sum + (1 - Math.abs(maxProb - 0.5) * 2);
          }, 0) / policyEvents.length
        : undefined;

    // Calculate market confidence (inverse of uncertainty)
    const marketConfidence =
      scores.macroUncertaintyIndex !== undefined ? 1 - scores.macroUncertaintyIndex : undefined;

    return {
      fedCutProbability: scores.fedCutProbability,
      fedHikeProbability: scores.fedHikeProbability,
      recessionProbability12m: scores.recessionProbability12m,
      macroUncertaintyIndex: scores.macroUncertaintyIndex,
      policyEventRisk,
      marketConfidence,
      timestamp: new Date().toISOString(),
      marketCount: events.length,
      platforms: [...platforms],
    };
  }

  /**
   * Convert event to FedRateMarket
   */
  private toFedRateMarket(event: PredictionMarketEvent): FedRateMarket {
    const outcomes = event.payload.outcomes;
    let cutProb = 0;
    let hikeProb = 0;
    let holdProb = 0;

    for (const outcome of outcomes) {
      const label = outcome.outcome.toLowerCase();
      if (label.includes("cut") || label.includes("decrease")) {
        cutProb += outcome.probability;
      } else if (label.includes("hike") || label.includes("increase")) {
        hikeProb += outcome.probability;
      } else if (
        label.includes("hold") ||
        label.includes("unchanged") ||
        label.includes("no change")
      ) {
        holdProb += outcome.probability;
      }
    }

    return {
      ticker: event.payload.marketTicker,
      platform: event.payload.platform,
      question: event.payload.marketQuestion,
      cutProbability: cutProb,
      hikeProbability: hikeProb,
      holdProbability: holdProb,
      meetingDate: event.eventTime,
      liquidity: event.payload.liquidityScore ?? 0,
    };
  }

  /**
   * Convert event to EconomicDataMarket
   */
  private toEconomicDataMarket(
    event: PredictionMarketEvent,
    indicator: string
  ): EconomicDataMarket {
    return {
      ticker: event.payload.marketTicker,
      platform: event.payload.platform,
      question: event.payload.marketQuestion,
      indicator,
      outcomes: event.payload.outcomes.map((o) => ({
        label: o.outcome,
        probability: o.probability,
      })),
      releaseDate: event.eventTime,
      liquidity: event.payload.liquidityScore ?? 0,
    };
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a unified client from config
 */
export function createUnifiedClient(
  config: PredictionMarketsConfig
): UnifiedPredictionMarketClient {
  return new UnifiedPredictionMarketClient(config);
}
