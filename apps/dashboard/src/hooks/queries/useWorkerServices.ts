/**
 * Worker Services Query Hooks
 *
 * TanStack Query hooks for fetching and triggering worker services.
 *
 * @see docs/plans/ui/35-worker-services-page.md
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { get, post } from "@/lib/api/client";
import { CACHE_TIMES, STALE_TIMES } from "@/lib/api/query-client";

// ============================================
// Types
// ============================================

export type WorkerService =
	| "macro_watch"
	| "newspaper"
	| "filings_sync"
	| "short_interest"
	| "sentiment"
	| "corporate_actions"
	| "prediction_markets";

export type RunStatus = "pending" | "running" | "completed" | "failed";

export interface LastRun {
	startedAt: string;
	completedAt: string | null;
	status: "completed" | "failed";
	result: string | null;
}

export interface ServiceStatus {
	name: WorkerService;
	displayName: string;
	status: "idle" | "running";
	lastRun: LastRun | null;
	nextRun: string | null;
}

export interface WorkerStatusResponse {
	services: ServiceStatus[];
}

export interface WorkerRun {
	id: string;
	service: WorkerService;
	status: RunStatus;
	startedAt: string;
	completedAt: string | null;
	duration: number | null;
	result: string | null;
	error: string | null;
}

export interface WorkerRunsResponse {
	runs: WorkerRun[];
	total: number;
}

export interface WorkerRunsFilters {
	limit?: number;
	service?: WorkerService;
	status?: RunStatus;
}

export interface TriggerServicePayload {
	symbols?: string[];
	priority?: "normal" | "high";
}

export interface TriggerResponse {
	runId: string;
	status: "started" | "already_running";
	message: string;
}

// Run Details Types
export interface MacroWatchEntry {
	id: string;
	timestamp: string;
	session: string;
	category: string;
	headline: string;
	symbols: string[];
	source: string;
}

export interface NewspaperData {
	id: string;
	date: string;
	compiledAt: string;
	sections: Record<string, unknown>;
	entryCount: number;
}

export interface IndicatorEntry {
	symbol: string;
	date: string;
	values: Record<string, string | number | null>;
}

export interface PredictionMarketSignal {
	signalType: string;
	signalValue: number;
	confidence: number | null;
	computedAt: string;
}

export type RunDetailsData =
	| { type: "macro_watch"; entries: MacroWatchEntry[] }
	| { type: "newspaper"; newspaper: NewspaperData | null }
	| { type: "indicators"; entries: IndicatorEntry[] }
	| {
			type: "prediction_markets";
			signals: PredictionMarketSignal[];
			snapshotCount: number;
			platforms: string[];
	  }
	| { type: "empty"; message: string };

export interface RunDetailsResponse {
	run: WorkerRun;
	data: RunDetailsData;
}

// ============================================
// Query Keys
// ============================================

export const workerServicesKeys = {
	all: ["workerServices"] as const,
	status: () => [...workerServicesKeys.all, "status"] as const,
	runs: (filters?: WorkerRunsFilters) =>
		filters
			? ([...workerServicesKeys.all, "runs", filters] as const)
			: ([...workerServicesKeys.all, "runs"] as const),
	run: (id: string) => [...workerServicesKeys.all, "run", id] as const,
	runDetails: (id: string) => [...workerServicesKeys.all, "runDetails", id] as const,
};

// ============================================
// Query Hooks
// ============================================

/**
 * Fetch status of all worker services.
 * Updates are pushed via WebSocket when subscribed to the "workers" channel.
 */
export function useWorkerServicesStatus() {
	return useQuery({
		queryKey: workerServicesKeys.status(),
		queryFn: async () => {
			const { data } = await get<WorkerStatusResponse>("/api/workers/status");
			return data;
		},
		staleTime: STALE_TIMES.DEFAULT,
		gcTime: CACHE_TIMES.DEFAULT,
	});
}

/**
 * Fetch recent worker runs with optional filters.
 * Updates are pushed via WebSocket when subscribed to the "workers" channel.
 */
export function useWorkerRuns(filters?: WorkerRunsFilters) {
	const params = new URLSearchParams();
	if (filters?.limit) {
		params.set("limit", String(filters.limit));
	}
	if (filters?.service) {
		params.set("service", filters.service);
	}
	if (filters?.status) {
		params.set("status", filters.status);
	}

	const queryString = params.toString();
	const url = queryString ? `/api/workers/runs?${queryString}` : "/api/workers/runs";

	return useQuery({
		queryKey: workerServicesKeys.runs(filters),
		queryFn: async () => {
			const { data } = await get<WorkerRunsResponse>(url);
			return data;
		},
		staleTime: STALE_TIMES.DEFAULT,
		gcTime: CACHE_TIMES.DEFAULT,
	});
}

/**
 * Fetch a single worker run by ID.
 */
export function useWorkerRun(id: string) {
	return useQuery({
		queryKey: workerServicesKeys.run(id),
		queryFn: async () => {
			const { data } = await get<{ run: WorkerRun }>(`/api/workers/runs/${id}`);
			return data.run;
		},
		staleTime: STALE_TIMES.DEFAULT,
		gcTime: CACHE_TIMES.DEFAULT,
		enabled: Boolean(id),
	});
}

/**
 * Trigger a worker service.
 */
export function useTriggerWorkerService() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			service,
			payload,
		}: {
			service: WorkerService;
			payload?: TriggerServicePayload;
		}) => {
			const { data } = await post<TriggerResponse>(
				`/api/workers/${service}/trigger`,
				payload ?? {},
			);
			return data;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: workerServicesKeys.all });
		},
	});
}

/**
 * Fetch detailed data for a specific worker run.
 * Only fetches when enabled (i.e., when the row is expanded).
 */
export function useWorkerRunDetails(id: string, enabled = false) {
	return useQuery({
		queryKey: workerServicesKeys.runDetails(id),
		queryFn: async () => {
			const { data } = await get<RunDetailsResponse>(`/api/workers/runs/${id}/details`);
			return data;
		},
		staleTime: STALE_TIMES.DEFAULT,
		gcTime: CACHE_TIMES.DEFAULT,
		enabled: Boolean(id) && enabled,
	});
}
