/**
 * Run Recorder
 *
 * Records scheduled job runs in the database so they appear in the dashboard.
 * Used by the scheduler to log when automated runs start and complete.
 */

import type { TursoClient } from "@cream/storage";

export type WorkerService =
	| "macro_watch"
	| "newspaper"
	| "filings_sync"
	| "short_interest"
	| "sentiment"
	| "corporate_actions";

export type RunStatus = "pending" | "running" | "completed" | "failed";

export interface RecordRunOptions {
	db: TursoClient;
	service: WorkerService;
	environment: string;
}

export interface RunRecordResult {
	runId: string;
	startedAt: string;
}

export interface CompleteRunOptions {
	db: TursoClient;
	runId: string;
	success: boolean;
	message?: string;
	processed?: number;
	failed?: number;
}

export async function recordRunStart(options: RecordRunOptions): Promise<RunRecordResult> {
	const { db, service, environment } = options;
	const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	const now = new Date().toISOString();

	await db.run(
		`INSERT INTO indicator_sync_runs
		 (id, run_type, started_at, status, symbols_processed, symbols_failed, environment, error_message)
		 VALUES (?, ?, ?, 'running', 0, 0, ?, NULL)`,
		[runId, service, now, environment]
	);

	return { runId, startedAt: now };
}

export async function recordRunComplete(options: CompleteRunOptions): Promise<void> {
	const { db, runId, success, message, processed = 0, failed = 0 } = options;
	const completedAt = new Date().toISOString();
	const status = success ? "completed" : "failed";

	await db.run(
		`UPDATE indicator_sync_runs
		 SET status = ?, completed_at = ?, symbols_processed = ?, symbols_failed = ?, error_message = ?
		 WHERE id = ?`,
		[status, completedAt, processed, failed, message ?? null, runId]
	);
}
