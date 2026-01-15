/**
 * Indicator Scheduler Types
 */

import type {
	AlpacaCorporateActionsClient,
	BatchJobResult,
	FINRAClient,
	SentimentDataProvider,
	SharesOutstandingProvider,
} from "@cream/indicators";
import type {
	CorporateActionsRepository,
	SentimentRepository,
	ShortInterestRepository,
} from "@cream/storage";
import { z } from "zod";

export const JobStatusSchema = z.enum(["idle", "running", "error", "disabled"]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const JobNameSchema = z.enum(["shortInterest", "sentiment", "corporateActions"]);
export type JobName = z.infer<typeof JobNameSchema>;

export interface JobState {
	status: JobStatus;
	lastRun: Date | null;
	lastResult: BatchJobResult | null;
	lastError: string | null;
	nextRun: Date | null;
	runCount: number;
}

export interface IndicatorSchedulerConfig {
	enabled: {
		shortInterest: boolean;
		sentiment: boolean;
		corporateActions: boolean;
	};
	jobConfigs?: {
		shortInterest?: { rateLimitDelayMs?: number };
		sentiment?: { rateLimitDelayMs?: number };
		corporateActions?: { rateLimitDelayMs?: number };
	};
}

export interface IndicatorSchedulerDependencies {
	finraClient: FINRAClient;
	sharesProvider: SharesOutstandingProvider;
	sentimentProvider: SentimentDataProvider;
	alpacaClient: AlpacaCorporateActionsClient;
	shortInterestRepo: ShortInterestRepository;
	sentimentRepo: SentimentRepository;
	corporateActionsRepo: CorporateActionsRepository;
	getSymbols: () => string[];
}

export const TIMEZONE = "America/New_York";

export const CRON_SCHEDULES = {
	shortInterest: "0 18 * * *",
	sentiment: "0 9-16 * * 1-5",
	corporateActions: "0 6 * * *",
} as const;

export function createDefaultConfig(): IndicatorSchedulerConfig {
	return {
		enabled: {
			shortInterest: true,
			sentiment: true,
			corporateActions: true,
		},
	};
}
