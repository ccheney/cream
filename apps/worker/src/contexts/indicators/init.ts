/**
 * Indicator Scheduler Initialization
 *
 * Factory for creating and configuring the indicator batch scheduler.
 */

import {
	CorporateActionsRepository,
	SentimentRepository,
	ShortInterestRepository,
	type TursoClient,
} from "@cream/storage";
import { log } from "../../shared/logger.js";
import {
	createAlpacaCorporateActionsFromEnv,
	createFINRAClient,
	createSentimentProviderFromEnv,
} from "./adapters/index.js";
import { IndicatorBatchScheduler } from "./batch-scheduler.js";
import {
	createStubAlpacaClient,
	createStubSentimentProvider,
	createStubSharesProvider,
} from "./stubs.js";
import { createDefaultConfig } from "./types.js";

export interface IndicatorSchedulerInitDeps {
	db: TursoClient;
	getSymbols: () => string[];
}

export interface IndicatorSchedulerInitResult {
	scheduler: IndicatorBatchScheduler;
	config: {
		shortInterest: boolean;
		sentiment: boolean;
		corporateActions: boolean;
	};
}

function hasAlpacaCredentials(): boolean {
	return !!(
		(process.env.ALPACA_KEY ?? Bun.env.ALPACA_KEY) &&
		(process.env.ALPACA_SECRET ?? Bun.env.ALPACA_SECRET)
	);
}

export function initIndicatorScheduler(
	deps: IndicatorSchedulerInitDeps
): IndicatorSchedulerInitResult | null {
	const hasAlpacaKeys = hasAlpacaCredentials();

	if (!hasAlpacaKeys) {
		log.warn({}, "Indicator batch scheduler disabled: ALPACA_KEY/ALPACA_SECRET not configured");
		return null;
	}

	const shortInterestRepo = new ShortInterestRepository(deps.db);
	const sentimentRepo = new SentimentRepository(deps.db);
	const corporateActionsRepo = new CorporateActionsRepository(deps.db);

	const schedulerConfig = createDefaultConfig();
	schedulerConfig.enabled.shortInterest = true;
	schedulerConfig.enabled.sentiment = hasAlpacaKeys;
	schedulerConfig.enabled.corporateActions = hasAlpacaKeys;

	const finraClient = createFINRAClient();
	const sharesProvider = createStubSharesProvider();
	const sentimentProvider = hasAlpacaKeys
		? createSentimentProviderFromEnv()
		: createStubSentimentProvider();
	const alpacaClient = hasAlpacaKeys
		? createAlpacaCorporateActionsFromEnv()
		: createStubAlpacaClient();

	const scheduler = new IndicatorBatchScheduler(
		{
			finraClient,
			sharesProvider,
			sentimentProvider,
			alpacaClient,
			shortInterestRepo,
			sentimentRepo,
			corporateActionsRepo,
			getSymbols: deps.getSymbols,
		},
		schedulerConfig
	);

	return {
		scheduler,
		config: {
			shortInterest: schedulerConfig.enabled.shortInterest,
			sentiment: schedulerConfig.enabled.sentiment,
			corporateActions: schedulerConfig.enabled.corporateActions,
		},
	};
}

export function startIndicatorScheduler(
	deps: IndicatorSchedulerInitDeps
): IndicatorBatchScheduler | null {
	try {
		const result = initIndicatorScheduler(deps);
		if (!result) {
			return null;
		}

		result.scheduler.start();
		log.info(result.config, "Indicator batch scheduler started");

		return result.scheduler;
	} catch (error) {
		log.error(
			{ error: error instanceof Error ? error.message : String(error) },
			"Failed to initialize indicator batch scheduler"
		);
		return null;
	}
}
