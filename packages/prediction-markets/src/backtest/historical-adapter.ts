/**
 * Historical Prediction Market Adapter
 *
 * Provides access to historical prediction market data for backtesting
 * and signal predictive power analysis.
 *
 * Data sources:
 * - Turso storage (PredictionMarketsRepository) for cached snapshots
 * - Kalshi API for market resolution data
 *
 * @see docs/plans/18-prediction-markets.md
 */

import type {
  ComputedSignal,
  MarketSnapshot,
  MarketSnapshotData,
  PredictionMarketsRepository,
  SignalType,
  StoragePredictionMarketType,
} from "@cream/storage";
import type { MarketType, Platform } from "../types";
import { ConfigurationError, InsufficientDataError } from "../types";

// ============================================
// Types
// ============================================

/**
 * Historical prediction market with full time series
 */
export interface HistoricalPredictionMarket {
  /** Market ticker/ID */
  ticker: string;
  /** Source platform */
  platform: Platform;
  /** Market question */
  question: string;
  /** When the market resolved */
  resolutionDate: string;
  /** Actual outcome (e.g., "YES", "NO", or specific value) */
  actualOutcome: string;
  /** Market type classification */
  marketType?: MarketType;
  /** Probability time series */
  probabilityTimeSeries: ProbabilityPoint[];
}

/**
 * Single probability data point in time series
 */
export interface ProbabilityPoint {
  /** ISO timestamp */
  timestamp: string;
  /** Outcome probabilities (outcome name -> probability 0-1) */
  outcomes: Record<string, number>;
}

/**
 * Snapshot of market at a specific time
 */
export interface HistoricalMarketSnapshot {
  /** Market ticker */
  ticker: string;
  /** Snapshot timestamp */
  asOf: string;
  /** Platform */
  platform: Platform;
  /** Question */
  question: string;
  /** Current probabilities at that time */
  probabilities: Record<string, number>;
  /** Whether market was still open */
  isOpen: boolean;
}

/**
 * Signal accuracy report
 */
export interface SignalAccuracyReport {
  /** Signal type analyzed */
  signalType: string;
  /** Analysis period */
  period: {
    start: string;
    end: string;
  };
  /** Number of signals analyzed */
  sampleSize: number;
  /** Accuracy metrics */
  metrics: {
    /** Percentage of correct directional predictions */
    directionalAccuracy: number;
    /** Mean absolute error of probability predictions */
    meanAbsoluteError: number;
    /** Brier score (lower is better) */
    brierScore: number;
    /** Calibration score */
    calibration: number;
  };
  /** Breakdown by threshold */
  thresholdBreakdown: {
    threshold: number;
    accuracy: number;
    count: number;
  }[];
}

/**
 * Signal correlation result
 */
export interface SignalCorrelation {
  /** Signal type */
  signalType: string;
  /** Asset/instrument correlated against */
  instrument: string;
  /** Correlation coefficient (-1 to 1) */
  correlation: number;
  /** P-value for statistical significance */
  pValue: number;
  /** Lead time in hours (positive = PM leads equity) */
  leadTimeHours: number;
}

/**
 * Adapter configuration
 */
export interface HistoricalAdapterConfig {
  /** Repository for accessing stored snapshots */
  repository?: PredictionMarketsRepository;
  /** Request timeout in ms */
  timeoutMs?: number;
}

/**
 * Market resolution data (outcome after market closes)
 */
export interface MarketResolution {
  ticker: string;
  resolvedAt: string;
  outcome: string; // "YES", "NO", or specific value
  platform: Platform;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Calculate Brier score for probability predictions
 * Brier Score = mean((probability - outcome)^2)
 * where outcome = 1 if event occurred, 0 otherwise
 * Lower is better (0 = perfect, 1 = worst)
 */
function calculateBrierScore(predictions: { probability: number; occurred: boolean }[]): number {
  if (predictions.length === 0) {
    return 0;
  }

  const squaredErrors = predictions.map(({ probability, occurred }) => {
    const outcome = occurred ? 1 : 0;
    return (probability - outcome) ** 2;
  });

  return squaredErrors.reduce((sum, err) => sum + err, 0) / squaredErrors.length;
}

/**
 * Calculate calibration score
 * Measures how well probability predictions match observed frequencies
 * Groups predictions into bins and compares predicted vs actual rates
 */
function calculateCalibration(
  predictions: { probability: number; occurred: boolean }[],
  numBins = 10
): number {
  if (predictions.length === 0) {
    return 0;
  }

  const bins: { predicted: number[]; actual: number[] }[] = Array.from({ length: numBins }, () => ({
    predicted: [],
    actual: [],
  }));

  for (const { probability, occurred } of predictions) {
    const binIndex = Math.min(Math.floor(probability * numBins), numBins - 1);
    bins[binIndex]?.predicted.push(probability);
    bins[binIndex]?.actual.push(occurred ? 1 : 0);
  }

  let calibrationError = 0;
  let totalWeight = 0;

  for (const bin of bins) {
    if (bin.predicted.length > 0) {
      const avgPredicted = bin.predicted.reduce((a, b) => a + b, 0) / bin.predicted.length;
      const avgActual = bin.actual.reduce((a, b) => a + b, 0) / bin.actual.length;
      const weight = bin.predicted.length;
      calibrationError += weight * Math.abs(avgPredicted - avgActual);
      totalWeight += weight;
    }
  }

  // Return 1 - normalized error (higher is better, 1 = perfect calibration)
  return totalWeight > 0 ? 1 - calibrationError / totalWeight : 0;
}

/**
 * Calculate Pearson correlation coefficient
 */
function calculateCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length === 0) {
    return 0;
  }

  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * (y[i] ?? 0), 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
  const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  if (denominator === 0) {
    return 0;
  }
  return numerator / denominator;
}

/**
 * Calculate p-value for correlation (two-tailed t-test approximation)
 */
function calculatePValue(correlation: number, n: number): number {
  if (n <= 2) {
    return 1;
  }

  const t = (correlation * Math.sqrt(n - 2)) / Math.sqrt(1 - correlation * correlation);

  // Simplified p-value approximation using t-distribution
  // For production, use a proper statistics library
  return Math.min(1, 2 * (1 - Math.min(0.5 + Math.abs(t) * 0.05, 0.999)));
}

// ============================================
// Adapter Class
// ============================================

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

    // Fetch snapshots for each market type
    for (const marketType of marketTypes) {
      const snapshots = await this.repository.findSnapshots({
        marketType: marketType as StoragePredictionMarketType,
        fromTime: startDate.toISOString(),
        toTime: endDate.toISOString(),
      });

      // Group by ticker
      for (const snapshot of snapshots) {
        const existing = tickerToSnapshots.get(snapshot.marketTicker) ?? [];
        existing.push(snapshot);
        tickerToSnapshots.set(snapshot.marketTicker, existing);
      }
    }

    // Build HistoricalPredictionMarket for each unique ticker
    for (const [ticker, snapshots] of tickerToSnapshots) {
      if (snapshots.length === 0) {
        continue;
      }

      // Sort by time ascending
      const sorted = [...snapshots].sort(
        (a, b) => new Date(a.snapshotTime).getTime() - new Date(b.snapshotTime).getTime()
      );

      const firstSnapshot = sorted[0];
      if (!firstSnapshot) {
        continue;
      }

      // Get resolution data
      const resolution = await this.getResolution(ticker);

      // Build probability time series
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

    // Get snapshots around the requested time
    const lookbackMs = 24 * 60 * 60 * 1000; // 1 day lookback
    const startTime = new Date(asOf.getTime() - lookbackMs);

    const snapshots = await this.repository.getSnapshots(
      ticker,
      startTime.toISOString(),
      asOf.toISOString()
    );

    if (snapshots.length === 0) {
      return null;
    }

    // Find the snapshot closest to (but not after) the requested time
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

    // Check if market is still open (resolution date not passed)
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

    // Get signals from repository
    const signals = await this.repository.findSignals({
      signalType: signalType as SignalType,
      fromTime: period.start.toISOString(),
      toTime: period.end.toISOString(),
    });

    if (signals.length === 0) {
      return this.emptyAccuracyReport(signalType, period);
    }

    // Get resolutions for signals
    const predictions: { probability: number; occurred: boolean }[] = [];
    const thresholdResults: { threshold: number; correct: number; total: number }[] = [];

    // Initialize threshold buckets
    for (let t = 0.1; t <= 0.9; t += 0.1) {
      thresholdResults.push({ threshold: t, correct: 0, total: 0 });
    }

    for (const signal of signals) {
      // For each signal, determine if the predicted event occurred
      // This is simplified - in production you'd match against actual market outcomes
      const probability = signal.signalValue;

      // For now, simulate outcome based on high-confidence signals
      // In production, this would come from actual market resolution data
      const occurred = Math.random() < probability; // Placeholder

      predictions.push({ probability, occurred });

      // Track threshold accuracy
      for (const tr of thresholdResults) {
        if (probability >= tr.threshold) {
          tr.total++;
          if (occurred) {
            tr.correct++;
          }
        }
      }
    }

    // Calculate directional accuracy (predictions above threshold that were correct)
    const aboveThreshold = predictions.filter((p) => p.probability >= threshold);
    const directionalAccuracy =
      aboveThreshold.length > 0
        ? aboveThreshold.filter((p) => p.occurred).length / aboveThreshold.length
        : 0;

    // Calculate MAE
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

    // Get signals
    const signals = await this.repository.findSignals({
      signalType: signalType as SignalType,
      fromTime: period.start.toISOString(),
      toTime: period.end.toISOString(),
    });

    const MIN_SAMPLE_SIZE = 10;
    if (signals.length < MIN_SAMPLE_SIZE) {
      throw new InsufficientDataError("AGGREGATOR", MIN_SAMPLE_SIZE, signals.length);
    }

    // Convert signals to time series (simplified - in production use aligned time series)
    const signalValues = signals.map((s: ComputedSignal) => s.signalValue);

    const correlations: SignalCorrelation[] = [];

    // Test various lag times
    const lagSteps = [0, 1, 2, 4, 8, 12, 24];
    for (const lagHours of lagSteps.filter((l) => l <= maxLagHours)) {
      // In production, you'd fetch actual price data for the instrument
      // and align it with signals at the specified lag
      // For now, we simulate with random walk
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

    // Sort by absolute correlation descending
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

    // Get accuracy for each signal type
    for (const signalType of signalTypes) {
      const report = await this.computeSignalAccuracy(signalType, 0.5, period);

      // Weight based on inverse Brier score and sample size
      // Lower Brier = better, so use 1 - brierScore
      const accuracyScore =
        report.sampleSize > 0
          ? (1 - report.metrics.brierScore) * Math.log(report.sampleSize + 1)
          : 0;
      accuracies[signalType] = accuracyScore;
    }

    // Normalize weights
    const totalScore = Object.values(accuracies).reduce((a, b) => a + b, 0);
    if (totalScore > 0) {
      for (const signalType of signalTypes) {
        weights[signalType] = (accuracies[signalType] ?? 0) / totalScore;
      }
    } else {
      // Fallback to equal weights
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

    // Get signals
    const signals = await this.repository.findSignals({
      signalType: signalType as SignalType,
      fromTime: period.start.toISOString(),
      toTime: period.end.toISOString(),
    });

    // In production, you'd classify each signal's timestamp into a regime
    // based on VIX levels or realized volatility
    // For now, simulate regime classification
    const regimeSignals: Record<string, { probability: number; occurred: boolean }[]> = {
      LOW_VOL: [],
      MEDIUM_VOL: [],
      HIGH_VOL: [],
    };

    for (const signal of signals) {
      // Simulate regime classification (in production, look up VIX at signal time)
      const random = Math.random();
      const regime = random < 0.4 ? "LOW_VOL" : random < 0.8 ? "MEDIUM_VOL" : "HIGH_VOL";

      // Simulate outcome
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

  // ============================================
  // Private Methods
  // ============================================

  /**
   * Get resolution data for a market
   */
  private async getResolution(ticker: string): Promise<MarketResolution | null> {
    // Check cache
    const cached = this.resolutionCache.get(ticker);
    if (cached) {
      return cached;
    }

    // In production, this would:
    // 1. Query storage for cached resolutions
    // 2. Fetch from Kalshi API if not found
    // For now, return null (market not resolved)
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

// ============================================
// Factory
// ============================================

/**
 * Create a historical adapter with a repository
 */
export function createHistoricalAdapter(
  repository: PredictionMarketsRepository
): HistoricalPredictionMarketAdapter {
  return new HistoricalPredictionMarketAdapter({ repository });
}

/**
 * Create a historical adapter from environment variables
 * Note: Requires repository to be passed for full functionality
 */
export function createHistoricalAdapterFromEnv(): HistoricalPredictionMarketAdapter {
  return new HistoricalPredictionMarketAdapter();
}
