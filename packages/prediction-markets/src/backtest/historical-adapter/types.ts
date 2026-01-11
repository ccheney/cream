/**
 * Historical Prediction Market Adapter Types
 * @module
 */

import type { PredictionMarketsRepository } from "@cream/storage";
import type { MarketType, Platform } from "../../types.js";

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
  outcome: string;
  platform: Platform;
}
