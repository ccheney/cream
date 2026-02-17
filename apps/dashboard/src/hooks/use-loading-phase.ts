/**
 * Loading Phase Hook
 *
 * Coordinates data loading in priority phases for optimal performance.
 *
 * **Priority Phases:**
 * 1. Critical (blocking): System status, user session
 * 2. Important (eager): Portfolio summary, alerts
 * 3. Deferred (lazy): Historical data, full position list
 * 4. On-demand: Decision details
 *
 * @see docs/plans/ui/08-realtime.md lines 86-93
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLoadingPhaseStore } from "./use-loading-phase.store";

// ============================================
// Types
// ============================================

/**
 * Loading phase priority levels.
 */
export type LoadingPhase = "critical" | "important" | "deferred" | "on-demand";

/**
 * Phase status.
 */
export type PhaseStatus = "pending" | "loading" | "complete" | "error";

/**
 * Loader function type.
 */
export type LoaderFn = () => Promise<void>;

/**
 * Loader registration.
 */
export interface LoaderRegistration {
	id: string;
	phase: LoadingPhase;
	loader: LoaderFn;
	status: PhaseStatus;
	error?: Error;
}

/**
 * Phase state in the store.
 */
export interface PhaseState {
	status: PhaseStatus;
	startedAt: number | null;
	completedAt: number | null;
	error: Error | null;
}

/**
 * Loading phase store state.
 */
export interface LoadingPhaseState {
	/** Current phase being loaded */
	currentPhase: LoadingPhase | null;

	/** Phase states */
	phases: Record<LoadingPhase, PhaseState>;

	/** Registered loaders */
	loaders: Map<string, LoaderRegistration>;

	/** Whether initial load is complete */
	isInitialLoadComplete: boolean;

	/** Register a loader */
	registerLoader: (id: string, phase: LoadingPhase, loader: LoaderFn) => void;

	/** Unregister a loader */
	unregisterLoader: (id: string) => void;

	/** Start loading phases */
	startLoading: () => Promise<void>;

	/** Get loaders for a phase */
	getLoadersByPhase: (phase: LoadingPhase) => LoaderRegistration[];

	/** Reset all state */
	reset: () => void;

	/** Mark phase as complete */
	markPhaseComplete: (phase: LoadingPhase) => void;

	/** Mark phase as error */
	markPhaseError: (phase: LoadingPhase, error: Error) => void;
}

// ============================================
// Hooks
// ============================================

/**
 * Hook return type for useLoadingPhase.
 */
export interface UseLoadingPhaseReturn {
	/** Current phase being loaded */
	currentPhase: LoadingPhase | null;

	/** Whether a specific phase is complete */
	isPhaseComplete: (phase: LoadingPhase) => boolean;

	/** Whether initial load is complete (critical + important + deferred) */
	isInitialLoadComplete: boolean;

	/** Whether critical phase is complete (app is usable) */
	isCriticalComplete: boolean;

	/** Whether important phase is complete */
	isImportantComplete: boolean;

	/** Get phase status */
	getPhaseStatus: (phase: LoadingPhase) => PhaseStatus;

	/** Get phase error if any */
	getPhaseError: (phase: LoadingPhase) => Error | null;

	/** Start loading all phases */
	startLoading: () => Promise<void>;

	/** Reset loading state */
	reset: () => void;
}

/**
 * Main loading phase hook.
 *
 * @example
 * ```tsx
 * function AppShell() {
 *   const {
 *     isCriticalComplete,
 *     isImportantComplete,
 *     isInitialLoadComplete,
 *     startLoading,
 *   } = useLoadingPhase();
 *
 *   useEffect(() => {
 *     startLoading();
 *   }, [startLoading]);
 *
 *   // Block render until critical data loads
 *   if (!isCriticalComplete) {
 *     return <FullPageLoader />;
 *   }
 *
 *   // Show skeleton for important data
 *   return (
 *     <Suspense fallback={<DashboardSkeleton />}>
 *       <Dashboard />
 *     </Suspense>
 *   );
 * }
 * ```
 */
export function useLoadingPhase(): UseLoadingPhaseReturn {
	const store = useLoadingPhaseStore();

	const isPhaseComplete = useCallback(
		(phase: LoadingPhase) => store.phases[phase].status === "complete",
		[store.phases],
	);

	const getPhaseStatus = useCallback(
		(phase: LoadingPhase) => store.phases[phase].status,
		[store.phases],
	);

	const getPhaseError = useCallback(
		(phase: LoadingPhase) => store.phases[phase].error,
		[store.phases],
	);

	return {
		currentPhase: store.currentPhase,
		isPhaseComplete,
		isInitialLoadComplete: store.isInitialLoadComplete,
		isCriticalComplete: store.phases.critical.status === "complete",
		isImportantComplete: store.phases.important.status === "complete",
		getPhaseStatus,
		getPhaseError,
		startLoading: store.startLoading,
		reset: store.reset,
	};
}

// ============================================
// Loader Registration Hook
// ============================================

/**
 * Options for usePhaseLoader.
 */
export interface UsePhaseLoaderOptions {
	/** Whether to auto-register on mount (default: true) */
	autoRegister?: boolean;
	/** Unique ID for the loader */
	id?: string;
}

/**
 * Hook for registering a loader in a specific phase.
 *
 * @example
 * ```tsx
 * function SystemStatusLoader() {
 *   const { data, refetch } = useSystemStatus();
 *
 *   // Register as critical loader
 *   usePhaseLoader("critical", async () => {
 *     await refetch();
 *   }, { id: "system-status" });
 *
 *   return null; // Just a loader component
 * }
 * ```
 */
export function usePhaseLoader(
	phase: LoadingPhase,
	loader: LoaderFn,
	options: UsePhaseLoaderOptions = {},
): void {
	const { autoRegister = true, id } = options;
	const store = useLoadingPhaseStore();
	const loaderRef = useRef(loader);

	// Generate stable ID
	const loaderId = useMemo(() => id ?? `loader-${Math.random().toString(36).slice(2, 9)}`, [id]);

	// Keep loader ref updated
	useEffect(() => {
		loaderRef.current = loader;
	}, [loader]);

	// Register loader
	useEffect(() => {
		if (autoRegister) {
			store.registerLoader(loaderId, phase, () => loaderRef.current());
		}

		return () => {
			store.unregisterLoader(loaderId);
		};
	}, [autoRegister, loaderId, phase, store]);
}

// ============================================
// On-Demand Loader Hook
// ============================================

/**
 * Return type for useOnDemandLoader.
 */
export interface UseOnDemandLoaderReturn<T> {
	/** Loaded data */
	data: T | null;
	/** Loading state */
	isLoading: boolean;
	/** Error state */
	error: Error | null;
	/** Trigger the load */
	load: () => Promise<T>;
	/** Reset the loader */
	reset: () => void;
}

async function executeOnDemandLoad<T>(
	loaderRef: { current: () => Promise<T> },
	loadState: {
		setData: (data: T | null) => void;
		setIsLoading: (isLoading: boolean) => void;
		setError: (error: Error | null) => void;
	},
) {
	loadState.setIsLoading(true);
	loadState.setError(null);

	try {
		const result = await loaderRef.current();
		loadState.setData(result);
		return result;
	} catch (e) {
		const err = e instanceof Error ? e : new Error(String(e));
		loadState.setError(err);
		throw err;
	} finally {
		loadState.setIsLoading(false);
	}
}

function resetOnDemandLoaderState<T>({
	setData,
	setIsLoading,
	setError,
}: {
	setData: (data: T | null) => void;
	setIsLoading: (isLoading: boolean) => void;
	setError: (error: Error | null) => void;
}) {
	setData(null);
	setIsLoading(false);
	setError(null);
}

/**
 * Hook for on-demand loading (e.g., when navigating to detail views).
 *
 * @example
 * ```tsx
 * function DecisionDetail({ id }: { id: string }) {
 *   const { data, isLoading, load } = useOnDemandLoader(
 *     () => fetchDecisionDetail(id)
 *   );
 *
 *   useEffect(() => {
 *     load();
 *   }, [load, id]);
 *
 *   if (isLoading) return <DetailSkeleton />;
 *   if (!data) return null;
 *
 *   return <DecisionContent decision={data} />;
 * }
 * ```
 */
export function useOnDemandLoader<T>(loader: () => Promise<T>): UseOnDemandLoaderReturn<T> {
	const [data, setData] = useState<T | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);
	const loaderRef = useRef(loader);

	// Keep loader ref updated
	useEffect(() => {
		loaderRef.current = loader;
	}, [loader]);

	const load = useCallback(async () => {
		return executeOnDemandLoad(loaderRef, {
			setData,
			setIsLoading,
			setError,
		});
	}, []);

	const reset = useCallback(() => {
		resetOnDemandLoaderState({ setData, setIsLoading, setError });
	}, []);

	return {
		data,
		isLoading,
		error,
		load,
		reset,
	};
}

// ============================================
// Suspense Boundary Helper
// ============================================

/**
 * Create a resource for React Suspense integration.
 *
 * @example
 * ```tsx
 * const portfolioResource = createSuspenseResource(() => fetchPortfolio());
 *
 * function Portfolio() {
 *   const portfolio = portfolioResource.read();
 *   return <PortfolioDisplay data={portfolio} />;
 * }
 * ```
 */
export function createSuspenseResource<T>(loader: () => Promise<T>) {
	let status: "pending" | "success" | "error" = "pending";
	let result: T;
	let error: Error;

	const promise = loader().then(
		(data) => {
			status = "success";
			result = data;
		},
		(e) => {
			status = "error";
			error = e instanceof Error ? e : new Error(String(e));
		},
	);

	return {
		read(): T {
			switch (status) {
				case "pending":
					throw promise;
				case "error":
					throw error;
				case "success":
					return result;
			}
		},
	};
}

// ============================================
// Exports
// ============================================

export default useLoadingPhase;
