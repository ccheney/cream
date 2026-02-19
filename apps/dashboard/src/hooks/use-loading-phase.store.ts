import { create } from "zustand";
import type {
	LoaderFn,
	LoaderRegistration,
	LoadingPhase,
	LoadingPhaseState,
	PhaseStatus,
} from "./use-loading-phase";

type SetPhaseStatus = (phase: LoadingPhase, status: PhaseStatus, error?: Error | null) => void;

type SetLoaderStatus = (id: string, status: PhaseStatus, error?: Error | null) => void;

type LoadersByPhase = (phase: LoadingPhase) => LoaderRegistration[];

type LoadingPhaseStoreActions = {
	registerLoader: (id: string, phase: LoadingPhase, loader: LoaderFn) => void;
	unregisterLoader: (id: string) => void;
	getLoadersByPhase: (phase: LoadingPhase) => LoaderRegistration[];
	startLoading: () => Promise<void>;
	reset: () => void;
	markPhaseComplete: (phase: LoadingPhase) => void;
	markPhaseError: (phase: LoadingPhase, error: Error) => void;
};

const PHASE_ORDER: LoadingPhase[] = ["critical", "important", "deferred"];

const DEFAULT_PHASE_STATE: {
	status: PhaseStatus;
	startedAt: number | null;
	completedAt: number | null;
	error: Error | null;
} = {
	status: "pending",
	startedAt: null,
	completedAt: null,
	error: null,
};

const INITIAL_PHASES: Record<LoadingPhase, typeof DEFAULT_PHASE_STATE> = {
	critical: { ...DEFAULT_PHASE_STATE },
	important: { ...DEFAULT_PHASE_STATE },
	deferred: { ...DEFAULT_PHASE_STATE },
	"on-demand": { ...DEFAULT_PHASE_STATE },
};

const normalizeLoaderError = (error: unknown): Error =>
	error instanceof Error ? error : new Error(String(error));

async function executeLoadersForPhase(
	phase: LoadingPhase,
	getLoadersByPhase: LoadersByPhase,
	setPhaseStatus: SetPhaseStatus,
	setLoaderStatus: SetLoaderStatus,
) {
	setPhaseStatus(phase, "loading");

	const loaders = getLoadersByPhase(phase);
	if (loaders.length === 0) {
		setPhaseStatus(phase, "complete");
		return;
	}

	try {
		await Promise.all(
			loaders.map(async (registration) => {
				try {
					await registration.loader();
					setLoaderStatus(registration.id, "complete");
				} catch (error) {
					setLoaderStatus(registration.id, "error", normalizeLoaderError(error));
					throw error;
				}
			}),
		);
		setPhaseStatus(phase, "complete");
	} catch (error) {
		const normalizedError = normalizeLoaderError(error);
		setPhaseStatus(phase, "error", normalizedError);
		if (phase === "critical") {
			throw normalizedError;
		}
	}
}

async function runLoadingPhases({
	getLoadersByPhase,
	setPhaseStatus,
	setLoaderStatus,
}: {
	getLoadersByPhase: LoadersByPhase;
	setPhaseStatus: SetPhaseStatus;
	setLoaderStatus: SetLoaderStatus;
}) {
	for (const phase of PHASE_ORDER) {
		await executeLoadersForPhase(phase, getLoadersByPhase, setPhaseStatus, setLoaderStatus);
	}
}

function createSetPhaseStatus(
	set: (updater: (state: LoadingPhaseState) => Partial<LoadingPhaseState>) => void,
): SetPhaseStatus {
	return (phase, status, error = null) => {
		set((state) => ({
			currentPhase: phase,
			phases: {
				...state.phases,
				[phase]: {
					...state.phases[phase],
					status,
					...(status !== "loading" ? { error } : {}),
					...(status === "loading"
						? { startedAt: Date.now() }
						: status === "complete"
							? { completedAt: Date.now() }
							: {}),
				},
			},
		}));
	};
}

function createSetLoaderStatus(
	set: (updater: (state: LoadingPhaseState) => Partial<LoadingPhaseState>) => void,
): SetLoaderStatus {
	return (id, status, error) => {
		set((state) => {
			const updatedLoaders = new Map(state.loaders);
			const loader = updatedLoaders.get(id);
			if (!loader) {
				return {};
			}

			updatedLoaders.set(id, {
				...loader,
				status,
				error: error ?? loader.error ?? undefined,
			});
			return { loaders: updatedLoaders };
		});
	};
}

function createRegisterLoader(
	set: (updater: (state: LoadingPhaseState) => Partial<LoadingPhaseState>) => void,
) {
	return (id: string, phase: LoadingPhase, loader: LoaderFn) => {
		set((state) => {
			const loaders = new Map(state.loaders);
			loaders.set(id, {
				id,
				phase,
				loader,
				status: "pending",
			});
			return { loaders };
		});
	};
}

function createUnregisterLoader(
	set: (updater: (state: LoadingPhaseState) => Partial<LoadingPhaseState>) => void,
) {
	return (id: string) => {
		set((state) => {
			const loaders = new Map(state.loaders);
			loaders.delete(id);
			return { loaders };
		});
	};
}

function createGetLoadersByPhase(get: () => LoadingPhaseState): LoadersByPhase {
	return (phase) => {
		const { loaders } = get();
		return Array.from(loaders.values()).filter((entry) => entry.phase === phase);
	};
}

function createStartLoading(
	set: (
		updater:
			| ((state: LoadingPhaseState) => Partial<LoadingPhaseState>)
			| Partial<LoadingPhaseState>,
	) => void,
	get: () => LoadingPhaseState & LoadingPhaseStoreActions,
) {
	return async () => {
		const setPhaseStatus = createSetPhaseStatus(set);
		const setLoaderStatus = createSetLoaderStatus(set);
		try {
			await runLoadingPhases({
				getLoadersByPhase: get().getLoadersByPhase,
				setPhaseStatus,
				setLoaderStatus,
			});

			set({
				currentPhase: null,
				isInitialLoadComplete: true,
			});
		} catch {
			// stop on critical-phase error without throwing
		}
	};
}

function createResetStore(
	set: (
		updater:
			| ((state: LoadingPhaseState) => Partial<LoadingPhaseState>)
			| Partial<LoadingPhaseState>,
	) => void,
) {
	return () => {
		set({
			currentPhase: null,
			phases: { ...INITIAL_PHASES },
			loaders: new Map(),
			isInitialLoadComplete: false,
		});
	};
}

function createMarkPhaseComplete(
	set: (updater: (state: LoadingPhaseState) => Partial<LoadingPhaseState>) => void,
) {
	return (phase: LoadingPhase) => {
		set((state) => ({
			phases: {
				...state.phases,
				[phase]: {
					...state.phases[phase],
					status: "complete",
					completedAt: Date.now(),
				},
			},
		}));
	};
}

function createMarkPhaseError(
	set: (updater: (state: LoadingPhaseState) => Partial<LoadingPhaseState>) => void,
) {
	return (phase: LoadingPhase, error: Error) => {
		set((state) => ({
			phases: {
				...state.phases,
				[phase]: {
					...state.phases[phase],
					status: "error",
					error,
				},
			},
		}));
	};
}

export const useLoadingPhaseStore = create<LoadingPhaseState>((set, get) => {
	const actions: LoadingPhaseStoreActions = {
		registerLoader: createRegisterLoader(set),
		unregisterLoader: createUnregisterLoader(set),
		getLoadersByPhase: createGetLoadersByPhase(get),
		startLoading: createStartLoading(set, get),
		reset: createResetStore(set),
		markPhaseComplete: createMarkPhaseComplete(set),
		markPhaseError: createMarkPhaseError(set),
	};

	return {
		currentPhase: null,
		phases: { ...INITIAL_PHASES },
		loaders: new Map(),
		isInitialLoadComplete: false,
		...actions,
	};
});
