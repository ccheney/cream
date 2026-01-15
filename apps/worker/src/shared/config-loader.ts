/**
 * Configuration Loader
 *
 * Handles loading and reloading runtime configuration from the database.
 */

import type { FullRuntimeConfig, RuntimeEnvironment } from "@cream/config";
import { getRuntimeConfigService, resetRuntimeConfigService } from "./database.js";
import { log } from "./logger.js";

export async function loadConfig(environment: RuntimeEnvironment): Promise<FullRuntimeConfig> {
	const configService = await getRuntimeConfigService();
	return configService.getActiveConfig(environment);
}

export interface ReloadConfigDeps {
	environment: RuntimeEnvironment;
	getOldIntervals: () => {
		tradingCycleIntervalMs: number;
		predictionMarketsIntervalMs: number;
	};
	setConfig: (config: FullRuntimeConfig) => void;
	getNewIntervals: () => {
		tradingCycleIntervalMs: number;
		predictionMarketsIntervalMs: number;
	};
	onIntervalsChanged: () => void;
}

export async function reloadConfig(deps: ReloadConfigDeps): Promise<void> {
	log.info({}, "Reloading configuration");

	resetRuntimeConfigService();

	const oldIntervals = deps.getOldIntervals();
	const newConfig = await loadConfig(deps.environment);
	deps.setConfig(newConfig);
	const newIntervals = deps.getNewIntervals();

	const tradingIntervalChanged =
		oldIntervals.tradingCycleIntervalMs !== newIntervals.tradingCycleIntervalMs;
	const predictionIntervalChanged =
		oldIntervals.predictionMarketsIntervalMs !== newIntervals.predictionMarketsIntervalMs;

	if (tradingIntervalChanged || predictionIntervalChanged) {
		log.info({}, "Intervals changed, rescheduling");
		deps.onIntervalsChanged();
	}

	log.info({}, "Configuration reloaded");
}
