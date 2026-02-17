/**
 * usePollingFallback Hook
 *
 * Provides REST polling fallback when WebSocket is unavailable.
 * Automatically enables polling when WS is disconnected for >30 seconds.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 6.3
 */

"use client";

import {
	type Dispatch,
	type RefObject,
	type SetStateAction,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

export interface PollingEndpoint<T> {
	key: string;
	fetcher: () => Promise<T>;
	/** Polling interval in ms */
	interval: number;
	onData?: (data: T) => void;
	onError?: (error: Error) => void;
	enabled?: boolean;
}

export interface UsePollingFallbackOptions {
	wsConnected: boolean;
	/** Delay before enabling polling (ms) */
	disconnectThreshold?: number;
	endpoints?: PollingEndpoint<unknown>[];
}

export interface UsePollingFallbackReturn {
	isPolling: boolean;
	/** Seconds until polling activates (or 0 if active) */
	pollingActivatesIn: number;
	enablePolling: () => void;
	disablePolling: () => void;
	addEndpoint: <T>(endpoint: PollingEndpoint<T>) => void;
	removeEndpoint: (key: string) => void;
}

const DEFAULT_DISCONNECT_THRESHOLD = 30_000;

/**
 * Hook to provide REST polling fallback when WebSocket is unavailable.
 *
 * @example
 * ```tsx
 * const { isPolling, pollingActivatesIn } = usePollingFallback({
 *   wsConnected: connected,
 *   endpoints: [
 *     {
 *       key: "portfolio",
 *       fetcher: () => fetch("/api/portfolio").then(r => r.json()),
 *       interval: 5000,
 *       onData: (data) => updatePortfolio(data),
 *     },
 *   ],
 * });
 *
 * if (isPolling) {
 *   return <div>Using REST fallback due to connection issues</div>;
 * }
 * ```
 */
export function usePollingFallback(options: UsePollingFallbackOptions): UsePollingFallbackReturn {
	const {
		wsConnected,
		disconnectThreshold = DEFAULT_DISCONNECT_THRESHOLD,
		endpoints = [],
	} = options;

	const [isPolling, setIsPolling] = useState(false);
	const [pollingActivatesIn, setPollingActivatesIn] = useState(0);

	const endpointsRef = useRef<Map<string, PollingEndpoint<unknown>>>(new Map());
	const pollIntervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
	const disconnectedAtRef = useRef<number | null>(null);
	const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const activationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	usePollingEndpointSync(endpoints, endpointsRef);

	const pollingManager = useEndpointPollingManager(endpointsRef, pollIntervalsRef);
	const pollingControls = usePollingControls({
		pollingManager,
		setIsPolling,
	});
	const endpointActions = usePollingEndpointActions({
		isPolling,
		pollingManager,
		endpointsRef,
	});

	usePollingState({
		wsConnected,
		disconnectThreshold,
		isPolling,
		setPollingActivatesIn,
		disconnectedAtRef,
		countdownIntervalRef,
		activationTimeoutRef,
		enablePolling: pollingControls.enablePolling,
		disablePolling: pollingControls.disablePolling,
	});

	usePollingCleanup({
		activationTimeoutRef,
		countdownIntervalRef,
		stopAllPolling: pollingManager.stopAllPolling,
	});

	return {
		isPolling,
		pollingActivatesIn,
		enablePolling: pollingControls.enablePolling,
		disablePolling: pollingControls.disablePolling,
		addEndpoint: endpointActions.addEndpoint,
		removeEndpoint: endpointActions.removeEndpoint,
	};
}

export default usePollingFallback;

function usePollingEndpointSync(
	endpoints: PollingEndpoint<unknown>[],
	endpointsRef: RefObject<Map<string, PollingEndpoint<unknown>>>,
) {
	useEffect(() => {
		for (const endpoint of endpoints) {
			endpointsRef.current.set(endpoint.key, endpoint);
		}
	}, [endpoints, endpointsRef]);
}

function useEndpointPollingManager(
	endpointsRef: RefObject<Map<string, PollingEndpoint<unknown>>>,
	pollIntervalsRef: RefObject<Map<string, ReturnType<typeof setInterval>>>,
) {
	const startPollingEndpoint = useCallback(
		(endpoint: PollingEndpoint<unknown>) => {
			if (endpoint.enabled === false) {
				return;
			}

			const existing = pollIntervalsRef.current.get(endpoint.key);
			if (existing) {
				clearInterval(existing);
			}

			const poll = async () => {
				try {
					const data = await endpoint.fetcher();
					endpoint.onData?.(data);
				} catch (err) {
					const error = err instanceof Error ? err : new Error(String(err));
					endpoint.onError?.(error);
				}
			};

			poll();
			const intervalId = setInterval(poll, endpoint.interval);
			pollIntervalsRef.current.set(endpoint.key, intervalId);
		},
		[pollIntervalsRef],
	);

	const stopPollingEndpoint = useCallback(
		(key: string) => {
			const intervalId = pollIntervalsRef.current.get(key);
			if (intervalId) {
				clearInterval(intervalId);
				pollIntervalsRef.current.delete(key);
			}
		},
		[pollIntervalsRef],
	);

	const startAllPolling = useCallback(() => {
		for (const endpoint of endpointsRef.current.values()) {
			startPollingEndpoint(endpoint);
		}
	}, [endpointsRef, startPollingEndpoint]);

	const stopAllPolling = useCallback(() => {
		for (const key of pollIntervalsRef.current.keys()) {
			stopPollingEndpoint(key);
		}
	}, [pollIntervalsRef, stopPollingEndpoint]);

	return {
		startPollingEndpoint,
		stopPollingEndpoint,
		startAllPolling,
		stopAllPolling,
	};
}

function usePollingControls({
	pollingManager,
	setIsPolling,
}: {
	pollingManager: ReturnType<typeof useEndpointPollingManager>;
	setIsPolling: Dispatch<SetStateAction<boolean>>;
}) {
	const enablePolling = useCallback(() => {
		setIsPolling(true);
		pollingManager.startAllPolling();
	}, [pollingManager, setIsPolling]);

	const disablePolling = useCallback(() => {
		setIsPolling(false);
		pollingManager.stopAllPolling();
	}, [pollingManager, setIsPolling]);

	return { enablePolling, disablePolling };
}

function usePollingEndpointActions({
	isPolling,
	pollingManager,
	endpointsRef,
}: {
	isPolling: boolean;
	pollingManager: ReturnType<typeof useEndpointPollingManager>;
	endpointsRef: RefObject<Map<string, PollingEndpoint<unknown>>>;
}) {
	const addEndpoint = useCallback(
		<T>(endpoint: PollingEndpoint<T>) => {
			const castEndpoint = endpoint as PollingEndpoint<unknown>;
			endpointsRef.current.set(castEndpoint.key, castEndpoint);
			if (isPolling) {
				pollingManager.startPollingEndpoint(castEndpoint);
			}
		},
		[isPolling, pollingManager, endpointsRef],
	);

	const removeEndpoint = useCallback(
		(key: string) => {
			pollingManager.stopPollingEndpoint(key);
			endpointsRef.current.delete(key);
		},
		[pollingManager, endpointsRef],
	);

	return { addEndpoint, removeEndpoint };
}

type PollingStateConfig = {
	wsConnected: boolean;
	disconnectThreshold: number;
	isPolling: boolean;
	enablePolling: () => void;
	disablePolling: () => void;
	setPollingActivatesIn: Dispatch<SetStateAction<number>>;
	disconnectedAtRef: RefObject<number | null>;
	countdownIntervalRef: RefObject<ReturnType<typeof setInterval> | null>;
	activationTimeoutRef: RefObject<ReturnType<typeof setTimeout> | null>;
};

function startFallbackCountdown({
	disconnectThreshold,
	enablePolling,
	setPollingActivatesIn,
	disconnectedAtRef,
	countdownIntervalRef,
	activationTimeoutRef,
	onFinish,
}: {
	disconnectThreshold: number;
	enablePolling: () => void;
	setPollingActivatesIn: Dispatch<SetStateAction<number>>;
	disconnectedAtRef: RefObject<number | null>;
	countdownIntervalRef: RefObject<ReturnType<typeof setInterval> | null>;
	activationTimeoutRef: RefObject<ReturnType<typeof setTimeout> | null>;
	onFinish: () => void;
}) {
	disconnectedAtRef.current = Date.now();
	setPollingActivatesIn(Math.ceil(disconnectThreshold / 1000));

	countdownIntervalRef.current = setInterval(() => {
		const elapsed = Date.now() - (disconnectedAtRef.current ?? Date.now());
		const remaining = Math.max(0, Math.ceil((disconnectThreshold - elapsed) / 1000));
		setPollingActivatesIn(remaining);

		if (remaining <= 0) {
			onFinish();
		}
	}, 1000);

	activationTimeoutRef.current = setTimeout(() => {
		enablePolling();
	}, disconnectThreshold);
}

function useFallbackCountdownEffect({
	activationTimeoutRef,
	countdownIntervalRef,
	disconnectedAtRef,
	disconnectThreshold,
	enablePolling,
	setPollingActivatesIn,
	clearPollingTimers,
}: {
	activationTimeoutRef: RefObject<ReturnType<typeof setTimeout> | null>;
	countdownIntervalRef: RefObject<ReturnType<typeof setInterval> | null>;
	disconnectedAtRef: RefObject<number | null>;
	disconnectThreshold: number;
	enablePolling: () => void;
	setPollingActivatesIn: Dispatch<SetStateAction<number>>;
	clearPollingTimers: () => void;
}) {
	return useCallback(() => {
		startFallbackCountdown({
			disconnectThreshold,
			enablePolling,
			setPollingActivatesIn,
			disconnectedAtRef,
			countdownIntervalRef,
			activationTimeoutRef,
			onFinish: clearPollingTimers,
		});
	}, [
		activationTimeoutRef,
		countdownIntervalRef,
		clearPollingTimers,
		disconnectThreshold,
		disconnectedAtRef,
		enablePolling,
		setPollingActivatesIn,
	]);
}

function usePollingTimerCleanup({
	activationTimeoutRef,
	countdownIntervalRef,
}: {
	activationTimeoutRef: RefObject<ReturnType<typeof setTimeout> | null>;
	countdownIntervalRef: RefObject<ReturnType<typeof setInterval> | null>;
}) {
	return useCallback(() => {
		if (activationTimeoutRef.current) {
			clearTimeout(activationTimeoutRef.current);
			activationTimeoutRef.current = null;
		}
		if (countdownIntervalRef.current) {
			clearInterval(countdownIntervalRef.current);
			countdownIntervalRef.current = null;
		}
	}, [activationTimeoutRef, countdownIntervalRef]);
}

function usePollingConnectionEffect({
	wsConnected,
	disconnectedAtRef,
	isPolling,
	disablePolling,
	setPollingActivatesIn,
	clearPollingTimers,
	beginFallbackCountdown,
}: {
	wsConnected: boolean;
	disconnectedAtRef: RefObject<number | null>;
	isPolling: boolean;
	disablePolling: () => void;
	setPollingActivatesIn: Dispatch<SetStateAction<number>>;
	clearPollingTimers: () => void;
	beginFallbackCountdown: () => void;
}) {
	useEffect(() => {
		if (wsConnected) {
			disconnectedAtRef.current = null;
			setPollingActivatesIn(0);
			clearPollingTimers();
			if (isPolling) {
				disablePolling();
			}
			return;
		}

		if (disconnectedAtRef.current === null) {
			beginFallbackCountdown();
		}

		return clearPollingTimers;
	}, [
		wsConnected,
		disconnectedAtRef,
		isPolling,
		disablePolling,
		setPollingActivatesIn,
		clearPollingTimers,
		beginFallbackCountdown,
	]);
}

function usePollingState({
	wsConnected,
	disconnectThreshold,
	isPolling,
	enablePolling,
	disablePolling,
	setPollingActivatesIn,
	disconnectedAtRef,
	countdownIntervalRef,
	activationTimeoutRef,
}: PollingStateConfig) {
	const clearPollingTimers = usePollingTimerCleanup({
		activationTimeoutRef,
		countdownIntervalRef,
	});

	const beginFallbackCountdown = useFallbackCountdownEffect({
		activationTimeoutRef,
		countdownIntervalRef,
		disconnectedAtRef,
		disconnectThreshold,
		enablePolling,
		setPollingActivatesIn,
		clearPollingTimers,
	});

	usePollingConnectionEffect({
		wsConnected,
		disconnectedAtRef,
		isPolling,
		disablePolling,
		setPollingActivatesIn,
		clearPollingTimers,
		beginFallbackCountdown,
	});
}

function usePollingCleanup({
	activationTimeoutRef,
	countdownIntervalRef,
	stopAllPolling,
}: {
	activationTimeoutRef: RefObject<ReturnType<typeof setTimeout> | null>;
	countdownIntervalRef: RefObject<ReturnType<typeof setInterval> | null>;
	stopAllPolling: () => void;
}) {
	useEffect(() => {
		return () => {
			stopAllPolling();
			if (activationTimeoutRef.current) {
				clearTimeout(activationTimeoutRef.current);
				activationTimeoutRef.current = null;
			}
			if (countdownIntervalRef.current) {
				clearInterval(countdownIntervalRef.current);
				countdownIntervalRef.current = null;
			}
		};
	}, [activationTimeoutRef, countdownIntervalRef, stopAllPolling]);
}
