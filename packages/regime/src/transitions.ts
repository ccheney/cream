/**
 * Regime Transition Detection
 *
 * Detects and logs regime transitions for monitoring and analysis.
 *
 * @see docs/plans/02-data-layer.md
 */

import type { RegimeLabel } from "@cream/config";

// ============================================
// Types
// ============================================

/**
 * Regime transition event.
 */
export interface RegimeTransition {
  /** Previous regime */
  fromRegime: RegimeLabel;
  /** New regime */
  toRegime: RegimeLabel;
  /** Timestamp of transition */
  timestamp: string;
  /** Symbol/instrument ID */
  instrumentId: string;
  /** Confidence in new regime */
  confidence: number;
  /** Duration in previous regime (number of observations) */
  previousRegimeDuration: number;
}

/**
 * Regime tracking state.
 */
export interface RegimeState {
  /** Current regime */
  currentRegime: RegimeLabel;
  /** When current regime started */
  regimeStartTime: string;
  /** Number of observations in current regime */
  observationCount: number;
  /** Recent regime history */
  history: Array<{
    regime: RegimeLabel;
    startTime: string;
    endTime: string;
    duration: number;
  }>;
}

/**
 * Transition detector configuration.
 */
export interface TransitionDetectorConfig {
  /** Minimum observations before transition is confirmed */
  minConfirmationObservations: number;
  /** Maximum history entries to keep */
  maxHistoryLength: number;
  /** Minimum confidence to trigger transition */
  minTransitionConfidence: number;
}

/**
 * Default transition detector configuration.
 */
export const DEFAULT_TRANSITION_CONFIG: TransitionDetectorConfig = {
  minConfirmationObservations: 2, // Require 2 consecutive observations
  maxHistoryLength: 100,
  minTransitionConfidence: 0.3,
};

// ============================================
// Transition Detector
// ============================================

/**
 * Regime transition detector.
 * Tracks regime state and detects transitions.
 */
export class RegimeTransitionDetector {
  private states: Map<string, RegimeState> = new Map();
  private pendingTransitions: Map<
    string,
    { regime: RegimeLabel; count: number; confidence: number }
  > = new Map();
  private config: TransitionDetectorConfig;

  constructor(config: TransitionDetectorConfig = DEFAULT_TRANSITION_CONFIG) {
    this.config = config;
  }

  /**
   * Update regime observation and detect transitions.
   *
   * @param instrumentId - Symbol/instrument identifier
   * @param regime - Observed regime
   * @param timestamp - Observation timestamp
   * @param confidence - Confidence in the observation
   * @returns Transition if one occurred, null otherwise
   */
  update(
    instrumentId: string,
    regime: RegimeLabel,
    timestamp: string,
    confidence: number
  ): RegimeTransition | null {
    // Get or initialize state
    let state = this.states.get(instrumentId);
    if (!state) {
      state = {
        currentRegime: regime,
        regimeStartTime: timestamp,
        observationCount: 1,
        history: [],
      };
      this.states.set(instrumentId, state);
      return null; // First observation, no transition
    }

    // Same regime - increment count
    if (regime === state.currentRegime) {
      state.observationCount++;
      this.pendingTransitions.delete(instrumentId);
      return null;
    }

    // Different regime - check if confidence is high enough
    if (confidence < this.config.minTransitionConfidence) {
      return null;
    }

    // Track pending transition
    let pending = this.pendingTransitions.get(instrumentId);
    if (!pending || pending.regime !== regime) {
      pending = { regime, count: 1, confidence };
      this.pendingTransitions.set(instrumentId, pending);
    } else {
      pending.count++;
      pending.confidence = Math.max(pending.confidence, confidence);
    }

    // Check if transition is confirmed
    if (pending.count >= this.config.minConfirmationObservations) {
      const transition: RegimeTransition = {
        fromRegime: state.currentRegime,
        toRegime: regime,
        timestamp,
        instrumentId,
        confidence: pending.confidence,
        previousRegimeDuration: state.observationCount,
      };

      // Update history
      state.history.push({
        regime: state.currentRegime,
        startTime: state.regimeStartTime,
        endTime: timestamp,
        duration: state.observationCount,
      });

      // Trim history if needed
      if (state.history.length > this.config.maxHistoryLength) {
        state.history = state.history.slice(-this.config.maxHistoryLength);
      }

      // Update state
      state.currentRegime = regime;
      state.regimeStartTime = timestamp;
      state.observationCount = 1;
      this.pendingTransitions.delete(instrumentId);

      return transition;
    }

    return null;
  }

  /**
   * Get current regime for an instrument.
   */
  getCurrentRegime(instrumentId: string): RegimeLabel | null {
    return this.states.get(instrumentId)?.currentRegime ?? null;
  }

  /**
   * Get full state for an instrument.
   */
  getState(instrumentId: string): RegimeState | null {
    return this.states.get(instrumentId) ?? null;
  }

  /**
   * Get regime history for an instrument.
   */
  getHistory(instrumentId: string): RegimeState["history"] {
    return this.states.get(instrumentId)?.history ?? [];
  }

  /**
   * Reset state for an instrument.
   */
  reset(instrumentId: string): void {
    this.states.delete(instrumentId);
    this.pendingTransitions.delete(instrumentId);
  }

  /**
   * Reset all states.
   */
  resetAll(): void {
    this.states.clear();
    this.pendingTransitions.clear();
  }

  /**
   * Get all tracked instruments.
   */
  getTrackedInstruments(): string[] {
    return Array.from(this.states.keys());
  }

  /**
   * Export state for persistence.
   */
  exportState(): Map<string, RegimeState> {
    return new Map(this.states);
  }

  /**
   * Import state from persistence.
   */
  importState(states: Map<string, RegimeState>): void {
    this.states = new Map(states);
    this.pendingTransitions.clear();
  }
}

// ============================================
// Transition Analysis
// ============================================

/**
 * Analyze regime transitions for patterns.
 */
export function analyzeTransitions(transitions: RegimeTransition[]): {
  transitionCounts: Record<string, number>;
  averageDuration: Record<RegimeLabel, number>;
  mostCommonTransitions: Array<{ from: RegimeLabel; to: RegimeLabel; count: number }>;
} {
  const transitionCounts: Record<string, number> = {};
  const durations: Record<RegimeLabel, number[]> = {
    BULL_TREND: [],
    BEAR_TREND: [],
    RANGE: [],
    HIGH_VOL: [],
    LOW_VOL: [],
  };

  for (const t of transitions) {
    // Count transitions
    const key = `${t.fromRegime}->${t.toRegime}`;
    transitionCounts[key] = (transitionCounts[key] ?? 0) + 1;

    // Track durations
    durations[t.fromRegime].push(t.previousRegimeDuration);
  }

  // Calculate average durations
  const averageDuration: Record<RegimeLabel, number> = {
    BULL_TREND: 0,
    BEAR_TREND: 0,
    RANGE: 0,
    HIGH_VOL: 0,
    LOW_VOL: 0,
  };

  for (const regime of Object.keys(durations) as RegimeLabel[]) {
    const durs = durations[regime];
    if (durs.length > 0) {
      averageDuration[regime] = durs.reduce((a, b) => a + b, 0) / durs.length;
    }
  }

  // Find most common transitions
  const sortedTransitions = Object.entries(transitionCounts)
    .map(([key, count]) => {
      const [from, to] = key.split("->") as [RegimeLabel, RegimeLabel];
      return { from, to, count };
    })
    .sort((a, b) => b.count - a.count);

  return {
    transitionCounts,
    averageDuration,
    mostCommonTransitions: sortedTransitions.slice(0, 10),
  };
}

/**
 * Calculate transition probability matrix.
 */
export function calculateTransitionMatrix(
  transitions: RegimeTransition[]
): Record<RegimeLabel, Record<RegimeLabel, number>> {
  const regimes: RegimeLabel[] = ["BULL_TREND", "BEAR_TREND", "RANGE", "HIGH_VOL", "LOW_VOL"];
  const counts: Record<RegimeLabel, Record<RegimeLabel, number>> = {} as any;
  const totals: Record<RegimeLabel, number> = {} as any;

  // Initialize
  for (const from of regimes) {
    counts[from] = {} as Record<RegimeLabel, number>;
    totals[from] = 0;
    for (const to of regimes) {
      counts[from][to] = 0;
    }
  }

  // Count transitions
  for (const t of transitions) {
    counts[t.fromRegime][t.toRegime]++;
    totals[t.fromRegime]++;
  }

  // Convert to probabilities
  const matrix: Record<RegimeLabel, Record<RegimeLabel, number>> = {} as any;
  for (const from of regimes) {
    matrix[from] = {} as Record<RegimeLabel, number>;
    for (const to of regimes) {
      matrix[from][to] = totals[from] > 0 ? counts[from][to] / totals[from] : 0;
    }
  }

  return matrix;
}
