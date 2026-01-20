/**
 * Run Recorder
 *
 * Records scheduled job runs in the database so they appear in the dashboard.
 * Used by the scheduler to log when automated runs start and complete.
 */

import { type Database, IndicatorSyncRunsRepository, type SyncRunType } from "@cream/storage";

export type WorkerService =
	| "macro_watch"
	| "newspaper"
	| "filings_sync"
	| "short_interest"
	| "sentiment"
	| "corporate_actions"
	| "economic_calendar";

export type RunStatus = "pending" | "running" | "completed" | "failed";

export interface RecordRunOptions {
	db: Database;
	service: WorkerService;
	environment: string;
}

export interface RunRecordResult {
	runId: string;
	startedAt: string;
}

export interface CompleteRunOptions {
	db: Database;
	runId: string;
	success: boolean;
	message?: string;
	processed?: number;
	failed?: number;
}

export async function recordRunStart(options: RecordRunOptions): Promise<RunRecordResult> {
	const { db, service, environment } = options;
	const repo = new IndicatorSyncRunsRepository(db);

	const run = await repo.create({
		runType: service as SyncRunType,
		environment,
	});

	return { runId: run.id, startedAt: run.startedAt };
}

export async function recordRunComplete(options: CompleteRunOptions): Promise<void> {
	const { db, runId, success, message, processed = 0, failed = 0 } = options;
	const repo = new IndicatorSyncRunsRepository(db);

	await repo.update(runId, {
		status: success ? "completed" : "failed",
		symbolsProcessed: processed,
		symbolsFailed: failed,
		errorMessage: message,
	});
}
