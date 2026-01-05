/**
 * GMM Classifier Tests
 */

import { describe, expect, it } from "bun:test";
import type { Candle } from "@cream/indicators";
import {
  calculateMean,
  calculateStd,
  calculateZScore,
  extractFeatures,
  extractSingleFeature,
  getMinimumCandleCount,
  normalizeFeatures,
  normalizeFeatureVector,
} from "../src/features";
import {
  classifySeriesWithGMM,
  classifyWithGMM,
  DEFAULT_GMM_CONFIG,
  deserializeGMMModel,
  serializeGMMModel,
  trainGMM,
} from "../src/gmmClassifier";
import {
  analyzeTransitions,
  calculateTransitionMatrix,
  RegimeTransitionDetector,
  type RegimeTransition,
} from "../src/transitions";

// ============================================
// Test Data Generation
// ============================================

function createCandle(
  timestamp: string,
  close: number,
  volume = 1000000,
  overrides: Partial<Candle> = {}
): Candle {
  return {
    symbol: "TEST",
    timeframe: "1d",
    timestamp,
    open: close * 0.995,
    high: close * 1.01,
    low: close * 0.99,
    close,
    volume,
    ...overrides,
  };
}

function generateTrendingCandles(
  startPrice: number,
  direction: "up" | "down",
  count: number,
  volatility = 0.01
): Candle[] {
  const candles: Candle[] = [];
  let price = startPrice;
  const baseDate = new Date("2024-01-01");

  for (let i = 0; i < count; i++) {
    // Add trend with some noise
    const drift = direction === "up" ? 0.002 : -0.002;
    const noise = (Math.random() - 0.5) * volatility;
    price = price * (1 + drift + noise);

    const date = new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000);
    candles.push(createCandle(date.toISOString(), price));
  }

  return candles;
}

function generateRangeBoundCandles(basePrice: number, count: number, volatility = 0.01): Candle[] {
  const candles: Candle[] = [];
  const baseDate = new Date("2024-01-01");

  for (let i = 0; i < count; i++) {
    // Mean-reverting around base price
    const deviation = (Math.random() - 0.5) * volatility * 2;
    const price = basePrice * (1 + deviation);

    const date = new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000);
    candles.push(createCandle(date.toISOString(), price));
  }

  return candles;
}

function generateHighVolatilityCandles(basePrice: number, count: number): Candle[] {
  const candles: Candle[] = [];
  let price = basePrice;
  const baseDate = new Date("2024-01-01");

  for (let i = 0; i < count; i++) {
    // High volatility swings
    const swing = (Math.random() - 0.5) * 0.08; // 4% swings
    price = price * (1 + swing);

    const date = new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000);
    candles.push(createCandle(date.toISOString(), price, 2000000)); // Higher volume
  }

  return candles;
}

function generateLowVolatilityCandles(basePrice: number, count: number): Candle[] {
  const candles: Candle[] = [];
  let price = basePrice;
  const baseDate = new Date("2024-01-01");

  for (let i = 0; i < count; i++) {
    // Very small movements
    const move = (Math.random() - 0.5) * 0.002; // 0.1% moves
    price = price * (1 + move);

    const date = new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000);
    candles.push(createCandle(date.toISOString(), price, 500000)); // Lower volume
  }

  return candles;
}

// ============================================
// Feature Extraction Tests
// ============================================

describe("Feature Extraction", () => {
  describe("calculateMean", () => {
    it("calculates mean correctly", () => {
      expect(calculateMean([1, 2, 3, 4, 5])).toBe(3);
    });

    it("returns 0 for empty array", () => {
      expect(calculateMean([])).toBe(0);
    });
  });

  describe("calculateStd", () => {
    it("calculates standard deviation correctly", () => {
      const std = calculateStd([2, 4, 4, 4, 5, 5, 7, 9]);
      expect(std).toBeCloseTo(2, 1);
    });

    it("returns 0 for single element", () => {
      expect(calculateStd([5])).toBe(0);
    });

    it("returns 0 for empty array", () => {
      expect(calculateStd([])).toBe(0);
    });
  });

  describe("calculateZScore", () => {
    it("calculates z-score correctly", () => {
      const sample = [10, 20, 30, 40, 50];
      const zScore = calculateZScore(50, sample);
      expect(zScore).toBeGreaterThan(1);
    });

    it("returns 0 for zero std", () => {
      const sample = [5, 5, 5, 5, 5];
      expect(calculateZScore(6, sample)).toBe(0);
    });
  });

  describe("extractFeatures", () => {
    it("extracts features from candles", () => {
      const candles = generateTrendingCandles(100, "up", 50);
      const features = extractFeatures(candles);

      expect(features.length).toBeGreaterThan(0);
      expect(features[0]).toHaveProperty("returns");
      expect(features[0]).toHaveProperty("volatility");
      expect(features[0]).toHaveProperty("volumeZScore");
      expect(features[0]).toHaveProperty("trendStrength");
    });

    it("returns empty for insufficient data", () => {
      const candles = generateTrendingCandles(100, "up", 5);
      const features = extractFeatures(candles);
      expect(features.length).toBe(0);
    });
  });

  describe("extractSingleFeature", () => {
    it("extracts single feature for latest candle", () => {
      const candles = generateTrendingCandles(100, "up", 50);
      const feature = extractSingleFeature(candles);

      expect(feature).not.toBeNull();
      expect(feature!.timestamp).toBe(candles[candles.length - 1]!.timestamp);
    });
  });

  describe("getMinimumCandleCount", () => {
    it("returns correct minimum", () => {
      const min = getMinimumCandleCount();
      expect(min).toBe(21); // 20 + 1
    });
  });

  describe("normalizeFeatures", () => {
    it("normalizes features to zero mean and unit variance", () => {
      const candles = generateTrendingCandles(100, "up", 100);
      const features = extractFeatures(candles);
      const { normalized, means, stds } = normalizeFeatures(features);

      expect(normalized.length).toBe(features.length);
      expect(means.length).toBe(4);
      expect(stds.length).toBe(4);

      // Check normalized data has approximately zero mean
      const normalizedMean = normalized.reduce((sum, row) => sum + row[0]!, 0) / normalized.length;
      expect(Math.abs(normalizedMean)).toBeLessThan(0.1);
    });
  });
});

// ============================================
// GMM Classifier Tests
// ============================================

describe("GMM Classifier", () => {
  describe("trainGMM", () => {
    it("trains a GMM model", () => {
      // Generate mixed regime data
      const candles = [
        ...generateTrendingCandles(100, "up", 100),
        ...generateTrendingCandles(150, "down", 100),
        ...generateRangeBoundCandles(120, 100),
      ];

      const model = trainGMM(candles);

      expect(model.k).toBe(5);
      expect(model.clusters.length).toBe(5);
      expect(model.featureMeans.length).toBe(4);
      expect(model.featureStds.length).toBe(4);
      expect(model.trainingSamples).toBeGreaterThan(0);
    });

    it("throws for insufficient data", () => {
      const candles = generateTrendingCandles(100, "up", 30);

      expect(() => trainGMM(candles)).toThrow("Insufficient data");
    });

    it("assigns regime labels to clusters", () => {
      const candles = [
        ...generateTrendingCandles(100, "up", 150),
        ...generateTrendingCandles(200, "down", 150),
        ...generateHighVolatilityCandles(150, 150),
      ];

      const model = trainGMM(candles);

      const regimeLabels = model.clusters.map((c) => c.regime);
      expect(regimeLabels).toContain("BULL_TREND");
      expect(regimeLabels).toContain("BEAR_TREND");
      expect(regimeLabels).toContain("HIGH_VOL");
    });
  });

  describe("classifyWithGMM", () => {
    it("classifies candles with trained model", () => {
      const trainingCandles = [
        ...generateTrendingCandles(100, "up", 150),
        ...generateTrendingCandles(200, "down", 150),
        ...generateRangeBoundCandles(150, 150),
      ];

      const model = trainGMM(trainingCandles);

      const testCandles = generateTrendingCandles(100, "up", 50);
      const result = classifyWithGMM(model, testCandles);

      expect(result).not.toBeNull();
      expect(result!.regime).toBeDefined();
      expect(result!.confidence).toBeGreaterThan(0);
      expect(result!.clusterProbabilities.length).toBe(5);
    });

    it("returns null for insufficient test data", () => {
      const trainingCandles = generateTrendingCandles(100, "up", 300);
      const model = trainGMM(trainingCandles);

      const testCandles = generateTrendingCandles(100, "up", 5);
      const result = classifyWithGMM(model, testCandles);

      expect(result).toBeNull();
    });
  });

  describe("classifySeriesWithGMM", () => {
    it("classifies a series of candles", () => {
      const trainingCandles = [
        ...generateTrendingCandles(100, "up", 150),
        ...generateTrendingCandles(200, "down", 150),
        ...generateRangeBoundCandles(150, 150),
      ];

      const model = trainGMM(trainingCandles);

      const testCandles = generateTrendingCandles(100, "up", 100);
      const results = classifySeriesWithGMM(model, testCandles);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty("regime");
      expect(results[0]).toHaveProperty("timestamp");
    });
  });

  describe("Model Serialization", () => {
    it("serializes and deserializes model", () => {
      const candles = generateTrendingCandles(100, "up", 300);
      const model = trainGMM(candles);

      const json = serializeGMMModel(model);
      expect(typeof json).toBe("string");

      const restored = deserializeGMMModel(json);
      expect(restored.k).toBe(model.k);
      expect(restored.clusters.length).toBe(model.clusters.length);
      expect(restored.featureMeans).toEqual(model.featureMeans);
    });
  });
});

// ============================================
// Transition Detection Tests
// ============================================

describe("Regime Transition Detector", () => {
  it("detects regime transitions", () => {
    const detector = new RegimeTransitionDetector({ minConfirmationObservations: 2, maxHistoryLength: 100, minTransitionConfidence: 0.3 });

    // First observation
    let transition = detector.update("AAPL", "BULL_TREND", "2024-01-01", 0.8);
    expect(transition).toBeNull();

    // Same regime
    transition = detector.update("AAPL", "BULL_TREND", "2024-01-02", 0.8);
    expect(transition).toBeNull();

    // Different regime (first signal)
    transition = detector.update("AAPL", "BEAR_TREND", "2024-01-03", 0.7);
    expect(transition).toBeNull();

    // Different regime (confirmed)
    transition = detector.update("AAPL", "BEAR_TREND", "2024-01-04", 0.7);
    expect(transition).not.toBeNull();
    expect(transition!.fromRegime).toBe("BULL_TREND");
    expect(transition!.toRegime).toBe("BEAR_TREND");
  });

  it("tracks current regime", () => {
    const detector = new RegimeTransitionDetector();

    detector.update("AAPL", "BULL_TREND", "2024-01-01", 0.8);
    expect(detector.getCurrentRegime("AAPL")).toBe("BULL_TREND");

    detector.update("AAPL", "BEAR_TREND", "2024-01-02", 0.8);
    detector.update("AAPL", "BEAR_TREND", "2024-01-03", 0.8);
    expect(detector.getCurrentRegime("AAPL")).toBe("BEAR_TREND");
  });

  it("maintains regime history", () => {
    const detector = new RegimeTransitionDetector();

    detector.update("AAPL", "BULL_TREND", "2024-01-01", 0.8);
    detector.update("AAPL", "BULL_TREND", "2024-01-02", 0.8);
    detector.update("AAPL", "BEAR_TREND", "2024-01-03", 0.8);
    detector.update("AAPL", "BEAR_TREND", "2024-01-04", 0.8);

    const history = detector.getHistory("AAPL");
    expect(history.length).toBe(1);
    expect(history[0]!.regime).toBe("BULL_TREND");
    expect(history[0]!.duration).toBe(2);
  });

  it("rejects low confidence transitions", () => {
    const detector = new RegimeTransitionDetector({ minConfirmationObservations: 2, maxHistoryLength: 100, minTransitionConfidence: 0.5 });

    detector.update("AAPL", "BULL_TREND", "2024-01-01", 0.8);

    // Low confidence transition should be ignored
    let transition = detector.update("AAPL", "BEAR_TREND", "2024-01-02", 0.3);
    expect(transition).toBeNull();

    transition = detector.update("AAPL", "BEAR_TREND", "2024-01-03", 0.3);
    expect(transition).toBeNull();

    expect(detector.getCurrentRegime("AAPL")).toBe("BULL_TREND");
  });

  it("resets state for instrument", () => {
    const detector = new RegimeTransitionDetector();

    detector.update("AAPL", "BULL_TREND", "2024-01-01", 0.8);
    expect(detector.getCurrentRegime("AAPL")).toBe("BULL_TREND");

    detector.reset("AAPL");
    expect(detector.getCurrentRegime("AAPL")).toBeNull();
  });

  it("exports and imports state", () => {
    const detector1 = new RegimeTransitionDetector();
    detector1.update("AAPL", "BULL_TREND", "2024-01-01", 0.8);
    detector1.update("MSFT", "BEAR_TREND", "2024-01-01", 0.7);

    const state = detector1.exportState();

    const detector2 = new RegimeTransitionDetector();
    detector2.importState(state);

    expect(detector2.getCurrentRegime("AAPL")).toBe("BULL_TREND");
    expect(detector2.getCurrentRegime("MSFT")).toBe("BEAR_TREND");
  });
});

// ============================================
// Transition Analysis Tests
// ============================================

describe("Transition Analysis", () => {
  describe("analyzeTransitions", () => {
    it("analyzes transition patterns", () => {
      const transitions: RegimeTransition[] = [
        { fromRegime: "BULL_TREND", toRegime: "RANGE", timestamp: "2024-01-01", instrumentId: "AAPL", confidence: 0.8, previousRegimeDuration: 10 },
        { fromRegime: "RANGE", toRegime: "BEAR_TREND", timestamp: "2024-01-02", instrumentId: "AAPL", confidence: 0.7, previousRegimeDuration: 5 },
        { fromRegime: "BULL_TREND", toRegime: "RANGE", timestamp: "2024-01-03", instrumentId: "MSFT", confidence: 0.9, previousRegimeDuration: 15 },
      ];

      const analysis = analyzeTransitions(transitions);

      expect(analysis.transitionCounts["BULL_TREND->RANGE"]).toBe(2);
      expect(analysis.averageDuration.BULL_TREND).toBe(12.5); // (10 + 15) / 2
      expect(analysis.mostCommonTransitions.length).toBeGreaterThan(0);
    });
  });

  describe("calculateTransitionMatrix", () => {
    it("calculates transition probability matrix", () => {
      const transitions: RegimeTransition[] = [
        { fromRegime: "BULL_TREND", toRegime: "RANGE", timestamp: "2024-01-01", instrumentId: "AAPL", confidence: 0.8, previousRegimeDuration: 10 },
        { fromRegime: "BULL_TREND", toRegime: "BEAR_TREND", timestamp: "2024-01-02", instrumentId: "AAPL", confidence: 0.7, previousRegimeDuration: 5 },
        { fromRegime: "RANGE", toRegime: "BULL_TREND", timestamp: "2024-01-03", instrumentId: "AAPL", confidence: 0.9, previousRegimeDuration: 15 },
      ];

      const matrix = calculateTransitionMatrix(transitions);

      expect(matrix.BULL_TREND.RANGE).toBe(0.5); // 1/2
      expect(matrix.BULL_TREND.BEAR_TREND).toBe(0.5); // 1/2
      expect(matrix.RANGE.BULL_TREND).toBe(1); // 1/1
    });
  });
});
