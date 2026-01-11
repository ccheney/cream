/**
 * Gaussian Mixture Model (GMM) Regime Classifier
 *
 * Data-driven regime classification using GMM clustering.
 * Discovers market regimes from features: returns, volatility, volume, trend.
 *
 * Algorithm:
 * 1. Extract features from candle data
 * 2. Fit GMM to find K clusters (default: 5 for our regime taxonomy)
 * 3. Map clusters to regime labels based on cluster characteristics
 * 4. Classify new observations by finding highest probability cluster
 *
 * @see docs/plans/02-data-layer.md
 */

import type { RegimeLabel } from "@cream/config";
import type { OHLCVBar } from "@cream/indicators";
import {
  DEFAULT_FEATURE_CONFIG,
  extractFeatures,
  type FeatureExtractionConfig,
  normalizeFeatures,
  normalizeFeatureVector,
  type RegimeFeatures,
} from "./features";

/**
 * GMM cluster parameters.
 */
export interface GMMCluster {
  /** Cluster index */
  index: number;
  /** Mean vector for the cluster */
  mean: number[];
  /** Covariance matrix (diagonal for simplicity) */
  variance: number[];
  /** Mixing weight (proportion of data in this cluster) */
  weight: number;
  /** Assigned regime label */
  regime: RegimeLabel;
}

/**
 * Trained GMM model.
 */
export interface GMMModel {
  /** Model version */
  version: string;
  /** Number of clusters */
  k: number;
  /** Cluster parameters */
  clusters: GMMCluster[];
  /** Feature normalization means */
  featureMeans: number[];
  /** Feature normalization stds */
  featureStds: number[];
  /** Training metadata */
  trainedAt: string;
  /** Number of training samples */
  trainingSamples: number;
  /** Final log-likelihood */
  logLikelihood: number;
  /** Configuration used for training */
  config: GMMConfig;
}

/**
 * GMM configuration.
 */
export interface GMMConfig {
  /** Number of clusters (default: 5) */
  k: number;
  /** Maximum EM iterations */
  maxIterations: number;
  /** Convergence tolerance */
  tolerance: number;
  /** Random seed for initialization */
  seed: number;
  /** Feature extraction config */
  featureConfig: FeatureExtractionConfig;
}

/**
 * Classification result.
 */
export interface GMMClassification {
  /** Classified regime label */
  regime: RegimeLabel;
  /** Confidence (highest cluster probability) */
  confidence: number;
  /** Probabilities for each cluster */
  clusterProbabilities: number[];
  /** Features used for classification */
  features: RegimeFeatures;
}

/**
 * Default GMM configuration.
 */
export const DEFAULT_GMM_CONFIG: GMMConfig = {
  k: 5, // Match our 5 regime taxonomy
  maxIterations: 100,
  tolerance: 1e-4,
  seed: 42,
  featureConfig: DEFAULT_FEATURE_CONFIG,
};

/**
 * Train a GMM model on candle data.
 *
 * @param candles - Historical candles for training
 * @param config - GMM configuration
 * @returns Trained GMM model
 */
export function trainGMM(candles: OHLCVBar[], config: GMMConfig = DEFAULT_GMM_CONFIG): GMMModel {
  const features = extractFeatures(candles, config.featureConfig);
  if (features.length < config.k * 10) {
    throw new Error(
      `Insufficient data: need at least ${config.k * 10} samples, got ${features.length}`
    );
  }

  const { normalized, means, stds } = normalizeFeatures(features);
  const clusters = initializeClusters(normalized, config.k, config.seed);

  let prevLogLikelihood = -Infinity;
  let logLikelihood = 0;

  for (let iter = 0; iter < config.maxIterations; iter++) {
    const responsibilities = computeResponsibilities(normalized, clusters);
    updateClusters(normalized, responsibilities, clusters);
    logLikelihood = computeLogLikelihood(normalized, clusters);

    if (Math.abs(logLikelihood - prevLogLikelihood) < config.tolerance) {
      break;
    }
    prevLogLikelihood = logLikelihood;
  }

  assignRegimeLabels(clusters);

  return {
    version: "1.0.0",
    k: config.k,
    clusters,
    featureMeans: means,
    featureStds: stds,
    trainedAt: new Date().toISOString(),
    trainingSamples: features.length,
    logLikelihood,
    config,
  };
}

/**
 * Initialize clusters using k-means++ style initialization.
 */
function initializeClusters(data: number[][], k: number, seed: number): GMMCluster[] {
  const rng = createSeededRandom(seed);
  const n = data.length;
  const d = data[0]?.length ?? 4;
  const clusters: GMMCluster[] = [];

  const firstIdx = Math.floor(rng() * n);
  const firstCenter = data[firstIdx]?.slice() ?? new Array(d).fill(0);
  const centers: number[][] = [firstCenter];

  for (let c = 1; c < k; c++) {
    const distances = data.map((point) => {
      const minDist = Math.min(...centers.map((center) => squaredDistance(point, center)));
      return minDist;
    });
    const totalDist = distances.reduce((a, b) => a + b, 0);
    const threshold = rng() * totalDist;

    let cumDist = 0;
    let nextIdx = 0;
    for (let i = 0; i < n; i++) {
      cumDist += distances[i]!;
      if (cumDist >= threshold) {
        nextIdx = i;
        break;
      }
    }
    centers.push(data[nextIdx]?.slice() ?? new Array(d).fill(0));
  }

  for (let c = 0; c < k; c++) {
    clusters.push({
      index: c,
      mean: centers[c]!,
      variance: new Array(d).fill(1), // Start with unit variance
      weight: 1 / k,
      regime: "RANGE", // Default, will be assigned later
    });
  }

  return clusters;
}

/**
 * Compute responsibilities (E-step).
 */
function computeResponsibilities(data: number[][], clusters: GMMCluster[]): number[][] {
  const n = data.length;
  const k = clusters.length;
  const responsibilities: number[][] = [];

  for (let i = 0; i < n; i++) {
    const point = data[i]!;
    const probs: number[] = [];
    let sum = 0;

    for (let c = 0; c < k; c++) {
      const cluster = clusters[c]!;
      const prob = cluster.weight * gaussianPdf(point, cluster.mean, cluster.variance);
      probs.push(prob);
      sum += prob;
    }

    responsibilities.push(probs.map((p) => (sum > 0 ? p / sum : 1 / k)));
  }

  return responsibilities;
}

/**
 * Update cluster parameters (M-step).
 */
function updateClusters(
  data: number[][],
  responsibilities: number[][],
  clusters: GMMCluster[]
): void {
  const n = data.length;
  const k = clusters.length;
  const d = data[0]?.length ?? 4;

  for (let c = 0; c < k; c++) {
    const cluster = clusters[c]!;

    // Compute N_k (soft count)
    let nk = 0;
    for (let i = 0; i < n; i++) {
      nk += responsibilities[i]?.[c] ?? 0;
    }

    if (nk < 1e-10) {
      continue;
    }

    cluster.weight = nk / n;

    const newMean = new Array(d).fill(0);
    for (let i = 0; i < n; i++) {
      const r = responsibilities[i]?.[c] ?? 0;
      for (let j = 0; j < d; j++) {
        newMean[j] += r * (data[i]?.[j] ?? 0);
      }
    }
    for (let j = 0; j < d; j++) {
      newMean[j] /= nk;
    }
    cluster.mean = newMean;

    const newVariance = new Array(d).fill(0);
    for (let i = 0; i < n; i++) {
      const r = responsibilities[i]?.[c] ?? 0;
      for (let j = 0; j < d; j++) {
        newVariance[j] += r * ((data[i]?.[j] ?? 0) - (newMean[j] ?? 0)) ** 2;
      }
    }
    for (let j = 0; j < d; j++) {
      newVariance[j] = Math.max((newVariance[j] ?? 0) / nk, 1e-6); // Floor to avoid singularity
    }
    cluster.variance = newVariance;
  }
}

/**
 * Compute log-likelihood.
 */
function computeLogLikelihood(data: number[][], clusters: GMMCluster[]): number {
  let ll = 0;
  for (const point of data) {
    let pointProb = 0;
    for (const cluster of clusters) {
      pointProb += cluster.weight * gaussianPdf(point, cluster.mean, cluster.variance);
    }
    ll += Math.log(Math.max(pointProb, 1e-300));
  }
  return ll;
}

/**
 * Assign regime labels to clusters based on their characteristics.
 */
function assignRegimeLabels(clusters: GMMCluster[]): void {
  // Feature indices: 0=returns, 1=volatility, 2=volumeZScore, 3=trendStrength
  const sorted = [...clusters].sort((a, b) => a.mean[1]! - b.mean[1]!);

  const lowestVol = sorted[0]!;
  const highestVol = sorted[sorted.length - 1]!;

  lowestVol.regime = "LOW_VOL";
  highestVol.regime = "HIGH_VOL";

  const remaining = sorted.filter((c) => c !== lowestVol && c !== highestVol);
  remaining.sort((a, b) => a.mean[3]! - b.mean[3]!);

  if (remaining.length >= 1) {
    remaining[0]!.regime = "BEAR_TREND";
  }
  if (remaining.length >= 2) {
    remaining[remaining.length - 1]!.regime = "BULL_TREND";
  }
  if (remaining.length >= 3) {
    for (let i = 1; i < remaining.length - 1; i++) {
      remaining[i]!.regime = "RANGE";
    }
  }
}

/**
 * Classify candles using a trained GMM model.
 *
 * @param model - Trained GMM model
 * @param candles - Candles to classify
 * @returns Classification result
 */
export function classifyWithGMM(model: GMMModel, candles: OHLCVBar[]): GMMClassification | null {
  const features = extractFeatures(candles, model.config.featureConfig);
  if (features.length === 0) {
    return null;
  }

  const latestFeature = features[features.length - 1]!;
  const normalized = normalizeFeatureVector(latestFeature, model.featureMeans, model.featureStds);

  const probs: number[] = [];
  let sum = 0;
  for (const cluster of model.clusters) {
    const prob = cluster.weight * gaussianPdf(normalized, cluster.mean, cluster.variance);
    probs.push(prob);
    sum += prob;
  }

  const normalizedProbs = probs.map((p) => (sum > 0 ? p / sum : 1 / model.k));

  let maxProb = 0;
  let maxIdx = 0;
  for (let i = 0; i < normalizedProbs.length; i++) {
    if (normalizedProbs[i]! > maxProb) {
      maxProb = normalizedProbs[i]!;
      maxIdx = i;
    }
  }

  const predictedCluster = model.clusters[maxIdx]!;

  return {
    regime: predictedCluster.regime,
    confidence: maxProb,
    clusterProbabilities: normalizedProbs,
    features: latestFeature,
  };
}

/**
 * Classify multiple time points and return regime time series.
 */
export function classifySeriesWithGMM(
  model: GMMModel,
  candles: OHLCVBar[]
): Array<GMMClassification & { timestamp: string }> {
  const features = extractFeatures(candles, model.config.featureConfig);
  const results: Array<GMMClassification & { timestamp: string }> = [];

  for (const feature of features) {
    const normalized = normalizeFeatureVector(feature, model.featureMeans, model.featureStds);

    const probs: number[] = [];
    let sum = 0;
    for (const cluster of model.clusters) {
      const prob = cluster.weight * gaussianPdf(normalized, cluster.mean, cluster.variance);
      probs.push(prob);
      sum += prob;
    }

    const normalizedProbs = probs.map((p) => (sum > 0 ? p / sum : 1 / model.k));

    let maxProb = 0;
    let maxIdx = 0;
    for (let i = 0; i < normalizedProbs.length; i++) {
      if (normalizedProbs[i]! > maxProb) {
        maxProb = normalizedProbs[i]!;
        maxIdx = i;
      }
    }

    const cluster = model.clusters[maxIdx];
    if (cluster) {
      results.push({
        regime: cluster.regime,
        confidence: maxProb,
        clusterProbabilities: normalizedProbs,
        features: feature,
        timestamp: feature.timestamp,
      });
    }
  }

  return results;
}

/**
 * Serialize GMM model to JSON string.
 */
export function serializeGMMModel(model: GMMModel): string {
  return JSON.stringify(model);
}

/**
 * Deserialize GMM model from JSON string.
 */
export function deserializeGMMModel(json: string): GMMModel {
  return JSON.parse(json) as GMMModel;
}

/**
 * Compute Gaussian PDF with diagonal covariance.
 */
function gaussianPdf(x: number[], mean: number[], variance: number[]): number {
  const d = x.length;
  let logProb = -0.5 * d * Math.log(2 * Math.PI);

  for (let i = 0; i < d; i++) {
    logProb -= 0.5 * Math.log(variance[i]!);
    logProb -= (0.5 * (x[i]! - mean[i]!) ** 2) / variance[i]!;
  }

  return Math.exp(logProb);
}

/**
 * Compute squared Euclidean distance.
 */
function squaredDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i]! - b[i]!) ** 2;
  }
  return sum;
}

/**
 * Create a seeded random number generator.
 */
function createSeededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}
