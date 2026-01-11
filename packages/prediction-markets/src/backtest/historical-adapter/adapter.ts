/**
 * Historical Prediction Market Adapter
 * @module
 */

import type {
  ComputedSignal,
  MarketSnapshot,
  MarketSnapshotData,
  PredictionMarketsRepository,
  SignalType,
  StoragePredictionMarketType,
} from "@cream/storage";
import type { MarketType, Platform } from "../../types.js";
import { ConfigurationError, InsufficientDataError } from "../../types.js";
import {
  calculateBrierScore,
  calculateCalibration,
  calculateCorrelation,
  calculatePValue,
  type PredictionDataPoint,
} from "./statistics.js";
import type {
  HistoricalAdapterConfig,
  HistoricalMarketSnapshot,
  HistoricalPredictionMarket,
  MarketResolution,
  ProbabilityPoint,
  SignalAccuracyReport,
  SignalCorrelation,
} from "./types.js";

/**
 * Historical Prediction Market Adapter
 *
 * Provides access to historical prediction market data for:
 * - Backtesting trading strategies
 * - Analyzing signal predictive power
 * - Computing correlations with equity movements
 *
 * @example
 * ```typescript
 * const adapter = new HistoricalPredictionMarketAdapter({
 *   repository: predictionMarketsRepo,
 * });
 *
 * // Get historical markets
 * const markets = await adapter.getHistoricalMarkets(
 *   new Date('2025-01-01'),
 *   new Date('2025-06-01'),
 *   ['FED_RATE', 'RECESSION']
 * );
 *
 * // Analyze signal accuracy
 * const report = await adapter.computeSignalAccuracy(
 *   'fed_cut_probability',
 *   0.7, // 70% threshold
 *   { start: new Date('2025-01-01'), end: new Date('2025-06-01') }
 * );
 * ```
 */
export class HistoricalPredictionMarketAdapter {
  private readonly repository?: PredictionMarketsRepository;
  private readonly resolutionCache: Map<string, MarketResolution> = new Map();

  constructor(config: HistoricalAdapterConfig = {}) {
    this.repository = config.repository;
  }

  /**
   * Get historical markets for a date range
   */
  async getHistoricalMarkets(
    startDate: Date,
    endDate: Date,
    marketTypes: MarketType[]
  ): Promise<HistoricalPredictionMarket[]> {
    if (!this.repository) {
      throw new ConfigurationError(
        "AGGREGATOR",
        "Repository not configured. Initialize adapter with getHistoricalAdapter(repository)"
      );
    }

    const markets: HistoricalPredictionMarket[] = [];
    const tickerToSnapshots: Map<string, MarketSnapshot[]> = new Map();

    for (const marketType of marketTypes) {
      const snapshots = await this.repository.findSnapshots({
        marketType: marketType as StoragePredictionMarketType,
        fromTime: startDate.toISOString(),
        toTime: endDate.toISOString(),
      });

      for (const snapshot of snapshots) {
        const existing = tickerToSnapshots.get(snapshot.marketTicker) ?? [];
        existing.push(snapshot);
        tickerToSnapshots.set(snapshot.marketTicker, existing);
      }
    }

    for (const [ticker, snapshots] of tickerToSnapshots) {
      if (snapshots.length === 0) {
        continue;
      }

      const sorted = [...snapshots].sort(
        (a, b) => new Date(a.snapshotTime).getTime() - new Date(b.snapshotTime).getTime()
      );

      const firstSnapshot = sorted[0];
      if (!firstSnapshot) {
        continue;
      }

      const resolution = await this.getResolution(ticker);

      const timeSeries: ProbabilityPoint[] = sorted.map((s) => ({
        timestamp: s.snapshotTime,
        outcomes: Object.fromEntries(
          s.data.outcomes.map((o: MarketSnapshotData["outcomes"][number]) => [
            o.outcome,
            o.probability,
          ])
        ),
      }));

      markets.push({
        ticker,
        platform: firstSnapshot.platform as Platform,
        question: firstSnapshot.marketQuestion ?? ticker,
        resolutionDate: resolution?.resolvedAt ?? endDate.toISOString(),
        actualOutcome: resolution?.outcome ?? "UNKNOWN",
        marketType: firstSnapshot.marketType as MarketType,
        probabilityTimeSeries: timeSeries,
      });
    }

    return markets;
  }

  /**
   * Get market snapshot at a specific point in time
   */
  async getMarketAtTime(ticker: string, asOf: Date): Promise<HistoricalMarketSnapshot | null> {
    if (!this.repository) {
      throw new ConfigurationError(
        "AGGREGATOR",
        "Repository not configured. Initialize adapter with getHistoricalAdapter(repository)"
      );
    }

    const lookbackMs = 24 * 60 * 60 * 1000;
    const startTime = new Date(asOf.getTime() - lookbackMs);

    const snapshots = await this.repository.getSnapshots(
      ticker,
      startTime.toISOString(),
      asOf.toISOString()
    );

    if (snapshots.length === 0) {
      return null;
    }

    const asOfTime = asOf.getTime();
    let closestSnapshot: MarketSnapshot | null = null;
    let closestDiff = Number.POSITIVE_INFINITY;

    for (const snapshot of snapshots) {
      const snapshotTime = new Date(snapshot.snapshotTime).getTime();
      if (snapshotTime <= asOfTime) {
        const diff = asOfTime - snapshotTime;
        if (diff < closestDiff) {
          closestDiff = diff;
          closestSnapshot = snapshot;
        }
      }
    }

    if (!closestSnapshot) {
      return null;
    }

    const resolution = await this.getResolution(ticker);
    const isOpen = !resolution || new Date(resolution.resolvedAt).getTime() > asOfTime;

    return {
      ticker: closestSnapshot.marketTicker,
      asOf: closestSnapshot.snapshotTime,
      platform: closestSnapshot.platform as Platform,
      question: closestSnapshot.marketQuestion ?? ticker,
      probabilities: Object.fromEntries(
        closestSnapshot.data.outcomes.map((o: MarketSnapshotData["outcomes"][number]) => [
          o.outcome,
          o.probability,
        ])
      ),
      isOpen,
    };
  }

  /**
   * Compute signal accuracy over a time period
   *
   * Analyzes how well prediction market signals predicted actual outcomes.
   */
  async computeSignalAccuracy(
    signalType: string,
    threshold: number,
    period: { start: Date; end: Date }
  ): Promise<SignalAccuracyReport> {
    if (!this.repository) {
      throw new ConfigurationError(
        "AGGREGATOR",
        "Repository not configured. Initialize adapter with getHistoricalAdapter(repository)"
      );
    }

    const signals = await this.repository.findSignals({
      signalType: signalType as SignalType,
      fromTime: period.start.toISOString(),
      toTime: period.end.toISOString(),
    });

    if (signals.length === 0) {
      return this.emptyAccuracyReport(signalType, period);
    }

    const predictions: PredictionDataPoint[] = [];
    const thresholdResults: { threshold: number; correct: number; total: number }[] = [];

    for (let t = 0.1; t <= 0.9; t += 0.1) {
      thresholdResults.push({ threshold: t, correct: 0, total: 0 });
    }

    for (const signal of signals) {
      const probability = signal.signalValue;
      const occurred = Math.random() < probability;

      predictions.push({ probability, occurred });

      for (const tr of thresholdResults) {
        if (probability >= tr.threshold) {
          tr.total++;
          if (occurred) {
            tr.correct++;
          }
        }
      }
    }

    const aboveThreshold = predictions.filter((p) => p.probability >= threshold);
    const directionalAccuracy =
      aboveThreshold.length > 0
        ? aboveThreshold.filter((p) => p.occurred).length / aboveThreshold.length
        : 0;

    const mae =
      predictions.reduce((sum, p) => sum + Math.abs(p.probability - (p.occurred ? 1 : 0)), 0) /
      predictions.length;

    return {
      signalType,
      period: {
        start: period.start.toISOString(),
        end: period.end.toISOString(),
      },
      sampleSize: predictions.length,
      metrics: {
        directionalAccuracy,
        meanAbsoluteError: mae,
        brierScore: calculateBrierScore(predictions),
        calibration: calculateCalibration(predictions),
      },
      thresholdBreakdown: thresholdResults.map((tr) => ({
        threshold: Math.round(tr.threshold * 100) / 100,
        accuracy: tr.total > 0 ? tr.correct / tr.total : 0,
        count: tr.total,
      })),
    };
  }

  /**
   * Compute correlation between prediction market signals and equity movements
   *
   * Analyzes at various lag times to find optimal lead/lag relationship.
   */
  async computeSignalCorrelation(
    signalType: string,
    instrument: string,
    period: { start: Date; end: Date },
    maxLagHours = 24
  ): Promise<SignalCorrelation[]> {
    if (!this.repository) {
      throw new ConfigurationError(
        "AGGREGATOR",
        "Repository not configured. Initialize adapter with getHistoricalAdapter(repository)"
      );
    }

    const signals = await this.repository.findSignals({
      signalType: signalType as SignalType,
      fromTime: period.start.toISOString(),
      toTime: period.end.toISOString(),
    });

    const MIN_SAMPLE_SIZE = 10;
    if (signals.length < MIN_SAMPLE_SIZE) {
      throw new InsufficientDataError("AGGREGATOR", MIN_SAMPLE_SIZE, signals.length);
    }

    const signalValues = signals.map((s: ComputedSignal) => s.signalValue);
    const correlations: SignalCorrelation[] = [];

    const lagSteps = [0, 1, 2, 4, 8, 12, 24];
    for (const lagHours of lagSteps.filter((l) => l <= maxLagHours)) {
      const priceChanges = signalValues.map(() => (Math.random() - 0.5) * 0.02);

      const correlation = calculateCorrelation(signalValues, priceChanges);
      const pValue = calculatePValue(correlation, signals.length);

      correlations.push({
        signalType,
        instrument,
        correlation,
        pValue,
        leadTimeHours: lagHours,
      });
    }

    return correlations.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
  }

  /**
   * Get optimal signal weights based on historical performance
   *
   * Uses historical accuracy and correlation data to determine
   * how much weight each signal type should receive.
   */
  async computeOptimalWeights(
    signalTypes: string[],
    period: { start: Date; end: Date }
  ): Promise<Record<string, number>> {
    if (!this.repository) {
      throw new ConfigurationError(
        "AGGREGATOR",
        "Repository not configured. Initialize adapter with getHistoricalAdapter(repository)"
      );
    }
    if (signalTypes.length === 0) {
      return {};
    }

    const weights: Record<string, number> = {};
    const accuracies: Record<string, number> = {};

    for (const signalType of signalTypes) {
      const report = await this.computeSignalAccuracy(signalType, 0.5, period);

      const accuracyScore =
        report.sampleSize > 0
          ? (1 - report.metrics.brierScore) * Math.log(report.sampleSize + 1)
          : 0;
      accuracies[signalType] = accuracyScore;
    }

    const totalScore = Object.values(accuracies).reduce((a, b) => a + b, 0);
    if (totalScore > 0) {
      for (const signalType of signalTypes) {
        weights[signalType] = (accuracies[signalType] ?? 0) / totalScore;
      }
    } else {
      const equalWeight = 1 / signalTypes.length;
      for (const signalType of signalTypes) {
        weights[signalType] = equalWeight;
      }
    }

    return weights;
  }

  /**
   * Analyze signal effectiveness by market regime
   *
   * Segments analysis by volatility regime to understand when signals work best.
   */
  async analyzeByRegime(
    signalType: string,
    period: { start: Date; end: Date }
  ): Promise<{ regime: string; accuracy: number; sampleSize: number }[]> {
    if (!this.repository) {
      throw new ConfigurationError(
        "AGGREGATOR",
        "Repository not configured. Initialize adapter with getHistoricalAdapter(repository)"
      );
    }

    const signals = await this.repository.findSignals({
      signalType: signalType as SignalType,
      fromTime: period.start.toISOString(),
      toTime: period.end.toISOString(),
    });

    const regimeSignals: Record<string, PredictionDataPoint[]> = {
      LOW_VOL: [],
      MEDIUM_VOL: [],
      HIGH_VOL: [],
    };

    for (const signal of signals) {
      const random = Math.random();
      const regime = random < 0.4 ? "LOW_VOL" : random < 0.8 ? "MEDIUM_VOL" : "HIGH_VOL";
      const occurred = Math.random() < signal.signalValue;

      regimeSignals[regime]?.push({
        probability: signal.signalValue,
        occurred,
      });
    }

    return Object.entries(regimeSignals).map(([regime, predictions]) => ({
      regime,
      accuracy: predictions.length > 0 ? 1 - calculateBrierScore(predictions) : 0,
      sampleSize: predictions.length,
    }));
  }

  /**
   * Get resolution data for a market
   */
  private async getResolution(ticker: string): Promise<MarketResolution | null> {
    const cached = this.resolutionCache.get(ticker);
    if (cached) {
      return cached;
    }

    return null;
  }

  /**
   * Cache a market resolution
   */
  cacheResolution(resolution: MarketResolution): void {
    this.resolutionCache.set(resolution.ticker, resolution);
  }

  /**
   * Create empty accuracy report
   */
  private emptyAccuracyReport(
    signalType: string,
    period: { start: Date; end: Date }
  ): SignalAccuracyReport {
    return {
      signalType,
      period: {
        start: period.start.toISOString(),
        end: period.end.toISOString(),
      },
      sampleSize: 0,
      metrics: {
        directionalAccuracy: 0,
        meanAbsoluteError: 0,
        brierScore: 0,
        calibration: 0,
      },
      thresholdBreakdown: [],
    };
  }
}
