/**
 * Statistical Helper Functions
 * @module
 */

/**
 * Prediction data point for statistical calculations
 */
export interface PredictionDataPoint {
	probability: number;
	occurred: boolean;
}

/**
 * Calculate Brier score for probability predictions
 * Brier Score = mean((probability - outcome)^2)
 * where outcome = 1 if event occurred, 0 otherwise
 * Lower is better (0 = perfect, 1 = worst)
 */
export function calculateBrierScore(predictions: PredictionDataPoint[]): number {
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
export function calculateCalibration(predictions: PredictionDataPoint[], numBins = 10): number {
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

	return totalWeight > 0 ? 1 - calibrationError / totalWeight : 0;
}

/**
 * Calculate Pearson correlation coefficient
 */
export function calculateCorrelation(x: number[], y: number[]): number {
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
export function calculatePValue(correlation: number, n: number): number {
	if (n <= 2) {
		return 1;
	}

	const t = (correlation * Math.sqrt(n - 2)) / Math.sqrt(1 - correlation * correlation);

	return Math.min(1, 2 * (1 - Math.min(0.5 + Math.abs(t) * 0.05, 0.999)));
}
