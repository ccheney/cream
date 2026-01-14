/**
 * Factor Zoo Service
 *
 * Implements dynamic factor combination and weight management following
 * AlphaForge Algorithm 2 methodology.
 *
 * @see https://arxiv.org/html/2406.18394v1 - AlphaForge paper
 * @see docs/plans/20-research-to-production-pipeline.md - Phase 7
 */

import type { Factor, FactorPerformance, FactorZooStats } from "@cream/domain";
import type { FactorZooRepository } from "@cream/storage";

/**
 * Factor Zoo configuration following AlphaForge parameters
 */
export interface FactorZooConfig {
	/** Minimum IC threshold for qualification (default: 0.02) */
	icThreshold: number;
	/** Minimum ICIR threshold for qualification (default: 0.3) */
	icirThreshold: number;
	/** Maximum number of factors in Mega-Alpha (default: 10) */
	maxFactors: number;
	/** Lookback period in days for performance assessment (default: 20) */
	lookbackDays: number;
	/** Decay threshold as fraction of peak IC (default: 0.5) */
	decayThreshold: number;
	/** Minimum days to measure decay (default: 20) */
	decayWindow: number;
}

export const DEFAULT_FACTOR_ZOO_CONFIG: FactorZooConfig = {
	icThreshold: 0.02,
	icirThreshold: 0.3,
	maxFactors: 10,
	lookbackDays: 20,
	decayThreshold: 0.5,
	decayWindow: 20,
};

/**
 * Qualifying factor with computed recent metrics
 */
export interface QualifyingFactor {
	factorId: string;
	recentIC: number;
	recentICIR: number;
	performanceHistory: FactorPerformance[];
}

/**
 * Mega-Alpha computation result
 */
export interface MegaAlphaResult {
	/** Combined signal value */
	value: number;
	/** Factor weights used */
	weights: Map<string, number>;
	/** Individual factor signals included */
	signals: Map<string, number>;
	/** Factors that contributed to the signal */
	contributingFactors: string[];
}

/**
 * Decay detection result for a factor
 */
export interface DecayCheckResult {
	factorId: string;
	isDecaying: boolean;
	peakIC: number;
	recentIC: number;
	decayRate: number;
	daysInDecay: number;
}

/**
 * Weight update result
 */
export interface WeightUpdateResult {
	/** Number of factors that qualified */
	qualifyingCount: number;
	/** Number of factors selected for Mega-Alpha */
	selectedCount: number;
	/** New weights assigned */
	weights: Map<string, number>;
	/** Factors that lost their weight (zeroed) */
	zeroedFactors: string[];
	/** Timestamp of update */
	updatedAt: string;
}

/**
 * Event emitter interface for research triggers
 */
export interface FactorZooEventEmitter {
	emit(event: string, data: unknown): Promise<void>;
}

/**
 * Factor Zoo Service
 *
 * Manages active factors and combines their signals into a Mega-Alpha
 * using AlphaForge's daily weight adjustment methodology.
 */
export class FactorZooService {
	private readonly config: FactorZooConfig;

	constructor(
		private readonly repository: FactorZooRepository,
		config?: Partial<FactorZooConfig>,
		private readonly eventEmitter?: FactorZooEventEmitter
	) {
		this.config = {
			...DEFAULT_FACTOR_ZOO_CONFIG,
			...config,
		};
	}

	/**
	 * Update weights daily based on recent factor performance.
	 * Implements AlphaForge Algorithm 2.
	 *
	 * Steps:
	 * 1. Filter to active factors meeting IC and ICIR thresholds
	 * 2. Rank by recent IC and select top N factors
	 * 3. Compute weights via IC-weighted average
	 * 4. Zero out non-qualifying factors
	 */
	async updateDailyWeights(): Promise<WeightUpdateResult> {
		const timestamp = new Date().toISOString();

		const activeFactors = await this.repository.findActiveFactors();

		if (activeFactors.length === 0) {
			return {
				qualifyingCount: 0,
				selectedCount: 0,
				weights: new Map(),
				zeroedFactors: [],
				updatedAt: timestamp,
			};
		}

		const qualifyingFactors: QualifyingFactor[] = [];

		for (const factor of activeFactors) {
			const history = await this.repository.getPerformanceHistory(
				factor.factorId,
				this.config.lookbackDays
			);

			if (history.length < Math.min(5, this.config.lookbackDays)) {
				// Don't zero - factors with insufficient history may qualify later
				continue;
			}

			const recentIC = this.computeRecentIC(history);
			const recentICIR = this.computeRecentICIR(history);

			if (recentIC >= this.config.icThreshold && recentICIR >= this.config.icirThreshold) {
				qualifyingFactors.push({
					factorId: factor.factorId,
					recentIC,
					recentICIR,
					performanceHistory: history,
				});
			}
		}

		if (qualifyingFactors.length === 0) {
			const zeroedFactors = activeFactors.map((f) => f.factorId);
			const zeroWeights = new Map(zeroedFactors.map((id) => [id, 0]));
			await this.repository.updateWeights(zeroWeights);

			return {
				qualifyingCount: 0,
				selectedCount: 0,
				weights: zeroWeights,
				zeroedFactors,
				updatedAt: timestamp,
			};
		}

		qualifyingFactors.sort((a, b) => b.recentIC - a.recentIC);
		const topFactors = qualifyingFactors.slice(0, this.config.maxFactors);
		const selectedIds = new Set(topFactors.map((f) => f.factorId));

		const totalIC = topFactors.reduce((sum, f) => sum + f.recentIC, 0);
		const newWeights = new Map<string, number>();

		for (const factor of topFactors) {
			const weight = totalIC > 0 ? factor.recentIC / totalIC : 1 / topFactors.length;
			newWeights.set(factor.factorId, weight);
		}

		const zeroedFactors: string[] = [];
		for (const factor of activeFactors) {
			if (!selectedIds.has(factor.factorId)) {
				newWeights.set(factor.factorId, 0);
				zeroedFactors.push(factor.factorId);
			}
		}

		await this.repository.updateWeights(newWeights);

		return {
			qualifyingCount: qualifyingFactors.length,
			selectedCount: topFactors.length,
			weights: newWeights,
			zeroedFactors,
			updatedAt: timestamp,
		};
	}

	/**
	 * Combine individual factor signals into Mega-Alpha.
	 * Uses weighted combination based on dynamic weights.
	 *
	 * @param signals - Map of factorId -> signal value
	 * @returns Combined Mega-Alpha result
	 */
	async computeMegaAlpha(signals: Map<string, number>): Promise<MegaAlphaResult> {
		const weights = await this.repository.getActiveWeights();
		let megaAlpha = 0;
		const contributingFactors: string[] = [];
		const includedSignals = new Map<string, number>();

		for (const [factorId, signal] of signals) {
			const weight = weights.get(factorId) ?? 0;
			if (weight > 0) {
				megaAlpha += weight * signal;
				contributingFactors.push(factorId);
				includedSignals.set(factorId, signal);
			}
		}

		return {
			value: megaAlpha,
			weights,
			signals: includedSignals,
			contributingFactors,
		};
	}

	/**
	 * Compute Mega-Alpha for multiple symbols
	 *
	 * @param symbolSignals - Map of symbol -> (factorId -> signal)
	 * @returns Map of symbol -> MegaAlphaResult
	 */
	async computeMegaAlphaForSymbols(
		symbolSignals: Map<string, Map<string, number>>
	): Promise<Map<string, MegaAlphaResult>> {
		const results = new Map<string, MegaAlphaResult>();
		const weights = await this.repository.getActiveWeights();

		for (const [symbol, signals] of symbolSignals) {
			let megaAlpha = 0;
			const contributingFactors: string[] = [];
			const includedSignals = new Map<string, number>();

			for (const [factorId, signal] of signals) {
				const weight = weights.get(factorId) ?? 0;
				if (weight > 0) {
					megaAlpha += weight * signal;
					contributingFactors.push(factorId);
					includedSignals.set(factorId, signal);
				}
			}

			results.set(symbol, {
				value: megaAlpha,
				weights,
				signals: includedSignals,
				contributingFactors,
			});
		}

		return results;
	}

	/**
	 * Check all active factors for alpha decay.
	 * Factors showing consistent decay are marked for review/retirement.
	 */
	async checkDecay(): Promise<DecayCheckResult[]> {
		const activeFactors = await this.repository.findActiveFactors();
		const results: DecayCheckResult[] = [];

		for (const factor of activeFactors) {
			const history = await this.repository.getPerformanceHistory(
				factor.factorId,
				this.config.decayWindow
			);

			if (history.length < this.config.decayWindow) {
				continue;
			}

			const icValues = history.map((h) => h.ic);
			const peakIC = Math.max(...icValues);
			const recentIC = this.computeRecentIC(history);

			const isDecaying = recentIC < peakIC * this.config.decayThreshold;
			const decayRate = isDecaying ? (peakIC - recentIC) / this.config.decayWindow : 0;

			let daysInDecay = 0;
			const sortedHistory = history.toSorted(
				(a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
			);
			for (const h of sortedHistory) {
				if (h.ic < peakIC * this.config.decayThreshold) {
					daysInDecay++;
				} else {
					break;
				}
			}

			results.push({
				factorId: factor.factorId,
				isDecaying,
				peakIC,
				recentIC,
				decayRate,
				daysInDecay,
			});

			if (isDecaying) {
				await this.repository.markDecaying(factor.factorId, decayRate);

				if (this.eventEmitter) {
					await this.eventEmitter.emit("factor_decay", {
						factorId: factor.factorId,
						hypothesisId: factor.hypothesisId,
						decayRate,
						peakIC,
						recentIC,
						suggestedFocus: `Replace decaying factor ${factor.name} targeting hypothesis ${factor.hypothesisId}`,
					});
				}
			}
		}

		return results;
	}

	/**
	 * Check a single factor for decay
	 */
	async checkFactorDecay(factorId: string): Promise<DecayCheckResult | null> {
		const factor = await this.repository.findFactorById(factorId);
		if (!factor || factor.status !== "active") {
			return null;
		}

		const history = await this.repository.getPerformanceHistory(factorId, this.config.decayWindow);

		if (history.length < this.config.decayWindow) {
			return null;
		}

		const icValues = history.map((h) => h.ic);
		const peakIC = Math.max(...icValues);
		const recentIC = this.computeRecentIC(history);

		const isDecaying = recentIC < peakIC * this.config.decayThreshold;
		const decayRate = isDecaying ? (peakIC - recentIC) / this.config.decayWindow : 0;

		return {
			factorId,
			isDecaying,
			peakIC,
			recentIC,
			decayRate,
			daysInDecay: 0, // Not computed for single factor check
		};
	}

	/**
	 * Get all active factors with their current weights
	 */
	async getActiveFactors(): Promise<Factor[]> {
		return this.repository.findActiveFactors();
	}

	/**
	 * Get factors currently in decay status
	 */
	async getDecayingFactors(): Promise<Factor[]> {
		return this.repository.findDecayingFactors();
	}

	/**
	 * Get current weights for all active factors
	 */
	async getCurrentWeights(): Promise<Map<string, number>> {
		return this.repository.getActiveWeights();
	}

	/**
	 * Get Factor Zoo statistics
	 */
	async getStats(): Promise<FactorZooStats> {
		return this.repository.getStats();
	}

	/**
	 * Get qualifying factors (those meeting IC/ICIR thresholds)
	 */
	async getQualifyingFactors(): Promise<QualifyingFactor[]> {
		const activeFactors = await this.repository.findActiveFactors();
		const qualifyingFactors: QualifyingFactor[] = [];

		for (const factor of activeFactors) {
			const history = await this.repository.getPerformanceHistory(
				factor.factorId,
				this.config.lookbackDays
			);

			if (history.length < 5) {
				continue;
			}

			const recentIC = this.computeRecentIC(history);
			const recentICIR = this.computeRecentICIR(history);

			if (recentIC >= this.config.icThreshold && recentICIR >= this.config.icirThreshold) {
				qualifyingFactors.push({
					factorId: factor.factorId,
					recentIC,
					recentICIR,
					performanceHistory: history,
				});
			}
		}

		return qualifyingFactors;
	}

	/**
	 * Get correlation matrix for portfolio optimization
	 */
	async getCorrelationMatrix(): Promise<Map<string, Map<string, number>>> {
		return this.repository.getCorrelationMatrix();
	}

	private computeRecentIC(history: FactorPerformance[]): number {
		if (history.length === 0) {
			return 0;
		}
		const sum = history.reduce((acc, h) => acc + h.ic, 0);
		return sum / history.length;
	}

	private computeRecentICIR(history: FactorPerformance[]): number {
		if (history.length < 2) {
			return 0;
		}

		const icValues = history.map((h) => h.ic);
		const mean = icValues.reduce((a, b) => a + b, 0) / icValues.length;
		const variance = icValues.reduce((sum, x) => sum + (x - mean) ** 2, 0) / icValues.length;
		const std = Math.sqrt(variance);

		return std > 0 ? mean / std : 0;
	}
}

export interface FactorZooDependencies {
	factorZoo: FactorZooRepository;
	eventEmitter?: FactorZooEventEmitter;
}

/**
 * Create a Factor Zoo Service with dependencies
 */
export function createFactorZooService(
	deps: FactorZooDependencies,
	config?: Partial<FactorZooConfig>
): FactorZooService {
	return new FactorZooService(deps.factorZoo, config, deps.eventEmitter);
}
