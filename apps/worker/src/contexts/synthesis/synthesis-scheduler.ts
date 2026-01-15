/**
 * Indicator Synthesis Scheduler
 *
 * Runs daily (before market open) to check for synthesis triggers
 * independent of the hourly OODA cycle.
 *
 * Schedule: 6:00 AM ET on weekdays
 * Cron: 0 6 * * 1-5
 */

import { createResearchTriggerService } from "@cream/agents";
import { type IndicatorSynthesisInput, indicatorSynthesisWorkflow } from "@cream/api";
import type { TriggerDetectionState } from "@cream/domain";
import { FactorZooRepository, RegimeLabelsRepository, type TursoClient } from "@cream/storage";
import { Cron } from "croner";
import { log } from "../../shared/logger.js";
import { mapRegimeToTriggerFormat } from "./regime-mapper.js";

// ============================================
// Constants
// ============================================

const TIMEZONE = "America/New_York";
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

async function getCurrentMarketRegime(db: TursoClient): Promise<string | null> {
	const regimeRepo = new RegimeLabelsRepository(db);
	const label = await regimeRepo.getMarketRegime("1d");

	if (!label) {
		return null;
	}

	return mapRegimeToTriggerFormat(label.regime);
}

async function getActiveRegimes(db: TursoClient): Promise<string[]> {
	const factorZooRepo = new FactorZooRepository(db);
	const activeFactors = await factorZooRepo.findActiveFactors();

	const regimeSet = new Set<string>();

	for (const factor of activeFactors) {
		const regimes = factor.targetRegimes ?? [];
		for (const regime of regimes) {
			if (regime === "all") {
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

function generateCycleId(): string {
	const now = new Date();
	const timestamp = now.toISOString().replace(/[:.]/g, "-");
	const random = Math.random().toString(36).substring(2, 8);
	return `synthesis-${timestamp}-${random}`;
}

// ============================================
// Scheduler Class
// ============================================

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

	start(): void {
		log.info({ cron: SYNTHESIS_CHECK_CRON, timezone: TIMEZONE }, "Starting synthesis scheduler");

		this.job = new Cron(SYNTHESIS_CHECK_CRON, { timezone: TIMEZONE }, async () => {
			await this.runCheck();
		});

		const nextRun = this.job.nextRun();
		if (nextRun) {
			this.state.nextRun = nextRun;
			log.info({ nextRun: nextRun.toISOString() }, "Synthesis check scheduled");
		}
	}

	stop(): void {
		if (this.job) {
			this.job.stop();
			this.job = null;
			log.info({}, "Synthesis scheduler stopped");
		}
	}

	getState(): SynthesisSchedulerState {
		if (this.job) {
			const nextRun = this.job.nextRun();
			if (nextRun) {
				this.state.nextRun = nextRun;
			}
		}
		return { ...this.state };
	}

	async triggerCheck(): Promise<boolean> {
		log.info({}, "Manually triggering synthesis check");
		return this.runCheck();
	}

	private async runCheck(): Promise<boolean> {
		const startTime = Date.now();
		this.state.runCount++;
		this.state.lastRun = new Date();
		this.state.lastError = null;

		log.info({ runCount: this.state.runCount }, "Running synthesis trigger check");

		try {
			const currentRegime = await getCurrentMarketRegime(this.db);
			if (!currentRegime) {
				log.warn({}, "No market regime found, skipping synthesis check");
				this.state.lastTriggerResult = false;
				return false;
			}

			const activeRegimes = await getActiveRegimes(this.db);

			log.info(
				{ currentRegime, activeRegimes, activeRegimeCount: activeRegimes.length },
				"Regime context gathered"
			);

			const triggerState: TriggerDetectionState = {
				currentRegime,
				activeRegimes,
				activeFactorIds: [],
				timestamp: new Date().toISOString(),
			};

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

				const cycleId = generateCycleId();
				const workflowInput: IndicatorSynthesisInput = {
					triggerReason: result.trigger.type,
					currentRegime,
					regimeGapDetails:
						result.trigger.type === "REGIME_GAP"
							? (result.trigger.metadata?.uncoveredRegimes as string[])?.join(", ")
							: undefined,
					rollingIC30Day: 0,
					icDecayDays: 0,
					cycleId,
				};

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
// Factory Functions
// ============================================

export function createIndicatorSynthesisScheduler(
	deps: SynthesisSchedulerDependencies
): IndicatorSynthesisScheduler {
	return new IndicatorSynthesisScheduler(deps);
}

export function startIndicatorSynthesisScheduler(db: TursoClient): IndicatorSynthesisScheduler {
	const scheduler = createIndicatorSynthesisScheduler({ db });
	scheduler.start();
	return scheduler;
}
