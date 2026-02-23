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

const MIN_CLUSTER_RESPONSIBILITY = 1e-10;
const MIN_CLUSTER_VARIANCE = 1e-6;

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
			`Insufficient data: need at least ${config.k * 10} samples, got ${features.length}`,
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

function selectNextCenter(data: number[][], centers: number[][], rng: () => number): number[] {
	const distances = data.map((point) => {
		return Math.min(...centers.map((center) => squaredDistance(point, center)));
	});
	const totalDist = distances.reduce((a, b) => a + b, 0);
	const threshold = rng() * totalDist;

	let cumDist = 0;
	let nextIdx = 0;
	for (let i = 0; i < data.length; i++) {
		cumDist += distances[i] ?? 0;
		if (cumDist >= threshold) {
			nextIdx = i;
			break;
		}
	}
	const nextCenter = data[nextIdx];
	if (!nextCenter) {
		throw new Error(`Failed to select cluster center at index ${nextIdx}`);
	}
	return nextCenter;
}

function initializeClusters(data: number[][], k: number, seed: number): GMMCluster[] {
	if (data.length === 0) {
		throw new Error("Cannot initialize GMM clusters without training data");
	}
	if (k <= 0) {
		throw new Error(`Invalid GMM cluster count: ${k}`);
	}

	const rng = createSeededRandom(seed);
	const d = data[0]?.length;
	if (!d || d <= 0) {
		throw new Error("Cannot initialize GMM clusters with empty feature vectors");
	}

	const firstIdx = Math.floor(rng() * data.length);
	const firstCenter = data[firstIdx];
	if (!firstCenter) {
		throw new Error(`Failed to select initial cluster center at index ${firstIdx}`);
	}
	const centers: number[][] = [firstCenter];

	for (let c = 1; c < k; c++) {
		centers.push(selectNextCenter(data, centers, rng));
	}

	return centers
		.filter((center): center is number[] => center != null)
		.map((center, c) => ({
			index: c,
			mean: center,
			variance: new Array(d).fill(1),
			weight: 1 / k,
			regime: "RANGE" as const,
		}));
}

/**
 * Compute responsibilities (E-step).
 */
function computeResponsibilities(data: number[][], clusters: GMMCluster[]): number[][] {
	const n = data.length;
	const k = clusters.length;
	const responsibilities: number[][] = [];

	for (let i = 0; i < n; i++) {
		const point = data[i];
		if (!point) {
			continue;
		}
		const probs: number[] = [];
		let sum = 0;

		for (let c = 0; c < k; c++) {
			const cluster = clusters[c];
			if (!cluster) {
				continue;
			}
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
	clusters: GMMCluster[],
): void {
	if (data.length === 0) {
		throw new Error("Cannot update GMM clusters without data");
	}
	const sampleCount = data.length;
	const dimensions = data[0]?.length;
	if (!dimensions || dimensions <= 0) {
		throw new Error("Cannot update GMM clusters with empty feature vectors");
	}

	for (const [clusterIndex, cluster] of clusters.entries()) {
		const softCount = computeSoftCount(responsibilities, clusterIndex);
		if (softCount < MIN_CLUSTER_RESPONSIBILITY) {
			continue;
		}

		cluster.weight = softCount / sampleCount;
		const mean = computeClusterMean(data, responsibilities, clusterIndex, dimensions, softCount);
		cluster.mean = mean;
		cluster.variance = computeClusterVariance(
			data,
			responsibilities,
			clusterIndex,
			mean,
			dimensions,
			softCount,
		);
	}
}

function computeSoftCount(responsibilities: number[][], clusterIndex: number): number {
	return responsibilities.reduce((total, row) => total + (row?.[clusterIndex] ?? 0), 0);
}

function computeClusterMean(
	data: number[][],
	responsibilities: number[][],
	clusterIndex: number,
	dimensions: number,
	softCount: number,
): number[] {
	const mean = new Array(dimensions).fill(0);

	for (let sampleIndex = 0; sampleIndex < data.length; sampleIndex++) {
		const responsibility = responsibilities[sampleIndex]?.[clusterIndex] ?? 0;
		for (let featureIndex = 0; featureIndex < dimensions; featureIndex++) {
			mean[featureIndex] += responsibility * (data[sampleIndex]?.[featureIndex] ?? 0);
		}
	}

	return mean.map((value) => value / softCount);
}

function computeClusterVariance(
	data: number[][],
	responsibilities: number[][],
	clusterIndex: number,
	mean: number[],
	dimensions: number,
	softCount: number,
): number[] {
	const variance = new Array(dimensions).fill(0);

	for (let sampleIndex = 0; sampleIndex < data.length; sampleIndex++) {
		const responsibility = responsibilities[sampleIndex]?.[clusterIndex] ?? 0;
		for (let featureIndex = 0; featureIndex < dimensions; featureIndex++) {
			const delta = (data[sampleIndex]?.[featureIndex] ?? 0) - (mean[featureIndex] ?? 0);
			variance[featureIndex] += responsibility * delta ** 2;
		}
	}

	return variance.map((value) => Math.max(value / softCount, MIN_CLUSTER_VARIANCE));
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
	const sorted = clusters.toSorted((a, b) => (a.mean[1] ?? 0) - (b.mean[1] ?? 0));

	const lowestVol = sorted[0];
	const highestVol = sorted.at(-1);

	if (lowestVol) {
		lowestVol.regime = "LOW_VOL";
	}
	if (highestVol) {
		highestVol.regime = "HIGH_VOL";
	}

	const remaining = sorted.filter((c) => c !== lowestVol && c !== highestVol);
	remaining.sort((a, b) => (a.mean[3] ?? 0) - (b.mean[3] ?? 0));

	if (remaining.length >= 1) {
		const first = remaining[0];
		if (first) {
			first.regime = "BEAR_TREND";
		}
	}
	if (remaining.length >= 2) {
		const last = remaining.at(-1);
		if (last) {
			last.regime = "BULL_TREND";
		}
	}
	if (remaining.length >= 3) {
		for (let i = 1; i < remaining.length - 1; i++) {
			const cluster = remaining[i];
			if (cluster) {
				cluster.regime = "RANGE";
			}
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

	const latestFeature = features.at(-1);
	if (!latestFeature) {
		return null;
	}
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
		const prob = normalizedProbs[i] ?? 0;
		if (prob > maxProb) {
			maxProb = prob;
			maxIdx = i;
		}
	}

	const predictedCluster = model.clusters[maxIdx];
	if (!predictedCluster) {
		return null;
	}

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
	candles: OHLCVBar[],
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
			const prob = normalizedProbs[i] ?? 0;
			if (prob > maxProb) {
				maxProb = prob;
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
		const v = variance[i] ?? 1;
		const xi = x[i] ?? 0;
		const mi = mean[i] ?? 0;
		logProb -= 0.5 * Math.log(v);
		logProb -= (0.5 * (xi - mi) ** 2) / v;
	}

	return Math.exp(logProb);
}

/**
 * Compute squared Euclidean distance.
 */
function squaredDistance(a: number[], b: number[]): number {
	let sum = 0;
	for (let i = 0; i < a.length; i++) {
		const ai = a[i] ?? 0;
		const bi = b[i] ?? 0;
		sum += (ai - bi) ** 2;
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
