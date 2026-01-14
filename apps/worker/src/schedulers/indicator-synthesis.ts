/**
 * Indicator Synthesis Scheduler
 *
 * Runs daily (before market open) to check for synthesis triggers
 * independent of the hourly OODA cycle.
 *
 * Schedule: 6:00 AM ET on weekdays
 * Cron: 0 6 * * 1-5
 *
 * @see docs/plans/36-dynamic-indicator-synthesis-workflow.md
 */

import { createResearchTriggerService } from "@cream/agents";
import { type IndicatorSynthesisInput, indicatorSynthesisWorkflow } from "@cream/api";
import type { TriggerDetectionState } from "@cream/domain";
import {
	FactorZooRepository,
	RegimeLabelsRepository,
	type RegimeType,
	type TursoClient,
} from "@cream/storage";
import { Cron } from "croner";
import { log } from "../logger.js";

// ============================================
// Constants
// ============================================

const TIMEZONE = "America/New_York";

/** Cron: 6:00 AM ET on weekdays (Mon-Fri) */
const SYNTHESIS_CHECK_CRON = "0 6 * * 1-5";

// ============================================
// Types
// ============================================

export interface SynthesisSchedulerDependencies {
	db: TursoClient;
}

export interface SynthesisSchedulerState {
	lastRun: Date | null;
	lastTriggerResult: boolean;
	lastError: string | null;
	nextRun: Date | null;
	runCount: number;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Map regime_labels regime types to trigger detection regime types.
 * The regime_labels table uses lowercase with underscores, but the
 * TriggerDetectionState expects the string format used by activeRegimes.
 */
function mapRegimeToTriggerFormat(regime: RegimeType): string {
	const mapping: Record<RegimeType, string> = {
		bull_trend: "bull",
		bear_trend: "bear",
		range_bound: "sideways",
		high_volatility: "volatile",
		low_volatility: "low_vol",
		crisis: "crisis",
	};
	return mapping[regime] ?? regime;
}

/**
 * Get the current market regime from regime_labels table.
 */
async function getCurrentMarketRegime(db: TursoClient): Promise<string | null> {
	const regimeRepo = new RegimeLabelsRepository(db);
	const label = await regimeRepo.getMarketRegime("1d");

	if (!label) {
		return null;
	}

	return mapRegimeToTriggerFormat(label.regime);
}

/**
 * Get active regimes covered by production factors.
 * Queries the factors table for active factors and extracts their target regimes.
 */
async function getActiveRegimes(db: TursoClient): Promise<string[]> {
	const factorZooRepo = new FactorZooRepository(db);
	const activeFactors = await factorZooRepo.findActiveFactors();

	const regimeSet = new Set<string>();

	for (const factor of activeFactors) {
		const regimes = factor.targetRegimes ?? [];
		for (const regime of regimes) {
			if (regime === "all") {
				// "all" covers all regimes
				regimeSet.add("bull");
				regimeSet.add("bear");
				regimeSet.add("sideways");
				regimeSet.add("volatile");
			} else {
				regimeSet.add(regime);
			}
		}
	}

	return [...regimeSet];
}

/**
 * Generate a unique cycle ID for the synthesis workflow.
 */
function generateCycleId(): string {
	const now = new Date();
	const timestamp = now.toISOString().replace(/[:.]/g, "-");
	const random = Math.random().toString(36).substring(2, 8);
	return `synthesis-${timestamp}-${random}`;
}

// ============================================
// Scheduler Class
// ============================================

/**
 * Indicator Synthesis Scheduler
 *
 * Runs daily before market open to check if new indicators should be
 * synthesized based on regime gaps, alpha decay, or performance degradation.
 */
export class IndicatorSynthesisScheduler {
	private readonly db: TursoClient;
	private job: Cron | null = null;
	private state: SynthesisSchedulerState;

	constructor(deps: SynthesisSchedulerDependencies) {
		this.db = deps.db;
		this.state = {
			lastRun: null,
			lastTriggerResult: false,
			lastError: null,
			nextRun: null,
			runCount: 0,
		};
	}

	/**
	 * Start the scheduled job.
	 */
	start(): void {
		log.info({ cron: SYNTHESIS_CHECK_CRON, timezone: TIMEZONE }, "Starting synthesis scheduler");

		this.job = new Cron(SYNTHESIS_CHECK_CRON, { timezone: TIMEZONE }, async () => {
			await this.runCheck();
		});

		// Update next run time
		const nextRun = this.job.nextRun();
		if (nextRun) {
			this.state.nextRun = nextRun;
			log.info({ nextRun: nextRun.toISOString() }, "Synthesis check scheduled");
		}
	}

	/**
	 * Stop the scheduled job.
	 */
	stop(): void {
		if (this.job) {
			this.job.stop();
			this.job = null;
			log.info({}, "Synthesis scheduler stopped");
		}
	}

	/**
	 * Get current scheduler state.
	 */
	getState(): SynthesisSchedulerState {
		// Update next run from job if available
		if (this.job) {
			const nextRun = this.job.nextRun();
			if (nextRun) {
				this.state.nextRun = nextRun;
			}
		}
		return { ...this.state };
	}

	/**
	 * Manually trigger a synthesis check.
	 */
	async triggerCheck(): Promise<boolean> {
		log.info({}, "Manually triggering synthesis check");
		return this.runCheck();
	}

	/**
	 * Run the synthesis trigger check.
	 *
	 * 1. Get current market regime
	 * 2. Get active regimes from production factors
	 * 3. Check if research should be triggered
	 * 4. If triggered, launch synthesis workflow
	 */
	private async runCheck(): Promise<boolean> {
		const startTime = Date.now();
		this.state.runCount++;
		this.state.lastRun = new Date();
		this.state.lastError = null;

		log.info({ runCount: this.state.runCount }, "Running synthesis trigger check");

		try {
			// Get current market regime
			const currentRegime = await getCurrentMarketRegime(this.db);
			if (!currentRegime) {
				log.warn({}, "No market regime found, skipping synthesis check");
				this.state.lastTriggerResult = false;
				return false;
			}

			// Get active regimes covered by production factors
			const activeRegimes = await getActiveRegimes(this.db);

			log.info(
				{ currentRegime, activeRegimes, activeRegimeCount: activeRegimes.length },
				"Regime context gathered"
			);

			// Create trigger detection state
			const triggerState: TriggerDetectionState = {
				currentRegime,
				activeRegimes,
				activeFactorIds: [], // Will be populated by service if needed
				timestamp: new Date().toISOString(),
			};

			// Check if research should be triggered
			const factorZooRepo = new FactorZooRepository(this.db);
			const triggerService = createResearchTriggerService({ factorZoo: factorZooRepo });
			const result = await triggerService.shouldTriggerResearch(triggerState);

			const durationMs = Date.now() - startTime;

			if (result.shouldTrigger && result.trigger) {
				log.info(
					{
						triggerType: result.trigger.type,
						severity: result.trigger.severity,
						suggestedFocus: result.trigger.suggestedFocus,
						durationMs,
					},
					"Synthesis trigger detected, launching workflow"
				);

				// Launch synthesis workflow
				const cycleId = generateCycleId();
				const workflowInput: IndicatorSynthesisInput = {
					triggerReason: result.trigger.type,
					currentRegime,
					regimeGapDetails:
						result.trigger.type === "REGIME_GAP"
							? (result.trigger.metadata?.uncoveredRegimes as string[])?.join(", ")
							: undefined,
					rollingIC30Day: 0, // Will be calculated by workflow
					icDecayDays: 0, // Will be calculated by workflow
					cycleId,
				};

				// Execute workflow asynchronously
				const run = await indicatorSynthesisWorkflow.createRun();
				run
					.start({
						inputData: workflowInput,
					})
					.catch((error) => {
						log.error(
							{ cycleId, error: error instanceof Error ? error.message : String(error) },
							"Synthesis workflow failed"
						);
					});

				this.state.lastTriggerResult = true;
				return true;
			}

			log.info(
				{
					shouldTrigger: result.shouldTrigger,
					blockedReasons: result.blockingCheck?.reasons,
					durationMs,
				},
				"Synthesis trigger check completed, no trigger"
			);

			this.state.lastTriggerResult = false;
			return false;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.state.lastError = errorMessage;
			this.state.lastTriggerResult = false;

			log.error({ error: errorMessage }, "Synthesis trigger check failed");
			return false;
		}
	}
}

// ============================================
// Factory Function
// ============================================

/**
 * Create an IndicatorSynthesisScheduler instance.
 */
export function createIndicatorSynthesisScheduler(
	deps: SynthesisSchedulerDependencies
): IndicatorSynthesisScheduler {
	return new IndicatorSynthesisScheduler(deps);
}

/**
 * Create and start the synthesis scheduler.
 * Convenience function for worker initialization.
 */
export function startIndicatorSynthesisScheduler(db: TursoClient): IndicatorSynthesisScheduler {
	const scheduler = createIndicatorSynthesisScheduler({ db });
	scheduler.start();
	return scheduler;
}
