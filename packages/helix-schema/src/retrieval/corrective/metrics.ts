/**
 * Logging and Metrics for Corrective Retrieval
 *
 * Functions for tracking correction performance and creating log entries.
 */

import type { CorrectionLogEntry, CorrectionMetrics, CorrectiveRetrievalResult } from "./types.js";

/**
 * Calculate metrics from correction log entries.
 *
 * @param entries - Correction log entries
 * @returns Aggregated metrics
 */
export function calculateCorrectionMetrics(entries: CorrectionLogEntry[]): CorrectionMetrics {
	if (entries.length === 0) {
		return {
			totalAttempts: 0,
			successfulCorrections: 0,
			failedCorrections: 0,
			avgAttemptsPerCorrection: 0,
			avgQualityImprovement: 0,
			avgCorrectionTimeMs: 0,
			strategySuccessRates: {
				broaden: { attempts: 0, successes: 0 },
				lower_threshold: { attempts: 0, successes: 0 },
				expand_query: { attempts: 0, successes: 0 },
			},
		};
	}

	const totalAttempts = entries.reduce((sum, e) => sum + e.attemptCount, 0);
	const successfulCorrections = entries.filter((e) => e.succeeded).length;
	const failedCorrections = entries.length - successfulCorrections;

	const avgAttemptsPerCorrection = totalAttempts / entries.length;

	const qualityImprovements = entries.map(
		(e) => e.finalQuality.overallScore - e.initialQuality.overallScore,
	);
	const avgQualityImprovement = qualityImprovements.reduce((sum, i) => sum + i, 0) / entries.length;

	const avgCorrectionTimeMs =
		entries.reduce((sum, e) => sum + e.correctionTimeMs, 0) / entries.length;

	return {
		totalAttempts,
		successfulCorrections,
		failedCorrections,
		avgAttemptsPerCorrection,
		avgQualityImprovement,
		avgCorrectionTimeMs,
		strategySuccessRates: {
			broaden: { attempts: 0, successes: 0 },
			lower_threshold: { attempts: 0, successes: 0 },
			expand_query: { attempts: 0, successes: 0 },
		},
	};
}

/**
 * Create a correction log entry from a corrective retrieval result.
 *
 * @param result - Corrective retrieval result
 * @param queryId - Optional query identifier
 * @returns Log entry
 */
export function createCorrectionLogEntry<T>(
	result: CorrectiveRetrievalResult<T>,
	queryId?: string,
): CorrectionLogEntry {
	return {
		timestamp: new Date(),
		queryId,
		initialQuality: result.initialQuality,
		finalQuality: result.finalQuality,
		attemptCount: result.attempts.length,
		succeeded: !result.finalQuality.needsCorrection,
		correctionTimeMs: result.correctionTimeMs ?? 0,
	};
}
