"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";
import { useCallback, useEffect, useRef } from "react";
import type { useAlert } from "@/stores/alert-store";
import type {
	BackoffConfig,
	ConnectionError,
	ConnectionState,
} from "./use-connection-recovery.utils";
import { calculateBackoffDelay, getErrorMessage } from "./use-connection-recovery.utils";

export type IntervalRef = RefObject<ReturnType<typeof setInterval> | null>;
export type TimeoutRef = RefObject<ReturnType<typeof setTimeout> | null>;

export type ConnectionRecoveryRefs = {
	retryTimerRef: TimeoutRef;
	countdownTimerRef: IntervalRef;
	pingTimerRef: IntervalRef;
	pongTimerRef: TimeoutRef;
	deadTimerRef: TimeoutRef;
	lastPongRef: RefObject<number>;
};

export function useConnectionRecoveryRefs(): ConnectionRecoveryRefs {
	return {
		retryTimerRef: useRef<ReturnType<typeof setTimeout> | null>(null),
		countdownTimerRef: useRef<ReturnType<typeof setInterval> | null>(null),
		pingTimerRef: useRef<ReturnType<typeof setInterval> | null>(null),
		pongTimerRef: useRef<ReturnType<typeof setTimeout> | null>(null),
		deadTimerRef: useRef<ReturnType<typeof setTimeout> | null>(null),
		lastPongRef: useRef<number>(Date.now()),
	};
}

export function useClearConnectionRecoveryTimers(refs: ConnectionRecoveryRefs) {
	return useCallback(() => {
		if (refs.retryTimerRef.current) {
			clearTimeout(refs.retryTimerRef.current);
			refs.retryTimerRef.current = null;
		}

		if (refs.countdownTimerRef.current) {
			clearInterval(refs.countdownTimerRef.current);
			refs.countdownTimerRef.current = null;
		}

		if (refs.pingTimerRef.current) {
			clearInterval(refs.pingTimerRef.current);
			refs.pingTimerRef.current = null;
		}

		if (refs.pongTimerRef.current) {
			clearTimeout(refs.pongTimerRef.current);
			refs.pongTimerRef.current = null;
		}

		if (refs.deadTimerRef.current) {
			clearTimeout(refs.deadTimerRef.current);
			refs.deadTimerRef.current = null;
		}
	}, [refs]);
}

function useBackoffDelayCalculator({
	retryAttempt,
	backoff,
}: {
	retryAttempt: number;
	backoff: Required<BackoffConfig>;
}) {
	return useCallback(
		() =>
			calculateBackoffDelay(retryAttempt, {
				initialDelayMs: backoff.initialDelayMs,
				maxDelayMs: backoff.maxDelayMs,
				multiplier: backoff.multiplier,
				jitterFactor: backoff.jitterFactor,
				maxRetries: backoff.maxRetries,
			}),
		[retryAttempt, backoff],
	);
}

function useRetryDecision({
	error,
	retryAttempt,
	maxRetries,
}: {
	error: ConnectionError | null;
	retryAttempt: number;
	maxRetries: number;
}) {
	return useCallback(() => {
		if (!error) {
			return false;
		}
		if (!error.retryable) {
			return false;
		}
		return retryAttempt < maxRetries;
	}, [error, retryAttempt, maxRetries]);
}

function useCountdownScheduler(countdownTimerRef: IntervalRef) {
	return useCallback(() => {
		if (countdownTimerRef.current) {
			clearInterval(countdownTimerRef.current);
			countdownTimerRef.current = null;
		}
	}, [countdownTimerRef]);
}

export function useConnectionRecoveryBackoff({
	retryAttempt,
	error,
	backoff,
	setRetryAttempt,
	setRetryCountdown,
	showToasts,
	onRetry,
	onMaxRetriesExceeded,
	alert,
	retryTimerRef,
	countdownTimerRef,
}: {
	retryAttempt: number;
	error: ConnectionError | null;
	backoff: Required<BackoffConfig>;
	setRetryAttempt: Dispatch<SetStateAction<number>>;
	setRetryCountdown: Dispatch<SetStateAction<number | null>>;
	showToasts: boolean;
	onRetry?: (attempt: number, delay: number) => void;
	onMaxRetriesExceeded?: () => void;
	alert: ReturnType<typeof useAlert>;
	retryTimerRef: TimeoutRef;
	countdownTimerRef: IntervalRef;
}) {
	const getBackoffDelay = useBackoffDelayCalculator({ retryAttempt, backoff });
	const shouldRetry = useRetryDecision({
		error,
		retryAttempt,
		maxRetries: backoff.maxRetries,
	});
	const clearCountdown = useCountdownScheduler(countdownTimerRef);
	const scheduleRetry = useCallback(
		(retryFn: () => void) => {
			if (!shouldRetry()) {
				if (retryAttempt >= backoff.maxRetries) {
					onMaxRetriesExceeded?.();
					if (showToasts) {
						alert.warning(
							"Connection Failed",
							"Unable to reconnect after multiple attempts. Please refresh the page.",
						);
					}
				}
				return;
			}

			const delay = getBackoffDelay();
			setRetryCountdown(delay);

			countdownTimerRef.current = setInterval(() => {
				setRetryCountdown((previous) => {
					if (previous === null || previous <= 1000) {
						clearCountdown();
						return null;
					}
					return previous - 1000;
				});
			}, 1000);

			retryTimerRef.current = setTimeout(() => {
				setRetryAttempt((previous) => previous + 1);
				onRetry?.(retryAttempt + 1, delay);
				retryFn();
			}, delay);
		},
		[
			shouldRetry,
			retryAttempt,
			backoff.maxRetries,
			getBackoffDelay,
			setRetryAttempt,
			setRetryCountdown,
			onRetry,
			onMaxRetriesExceeded,
			showToasts,
			alert,
			retryTimerRef,
			clearCountdown,
			countdownTimerRef,
		],
	);

	return { getBackoffDelay, shouldRetry, scheduleRetry };
}

export function useConnectionRecoveryEventHandlers({
	clearTimers,
	setState,
	setError,
	setRetryAttempt,
	setRetryCountdown,
	setHeartbeatAlive,
	onConnect,
	onDisconnect,
	showToasts,
	alert,
}: {
	clearTimers: () => void;
	setState: (state: ConnectionState) => void;
	setError: Dispatch<SetStateAction<ConnectionError | null>>;
	setRetryAttempt: Dispatch<SetStateAction<number>>;
	setRetryCountdown: Dispatch<SetStateAction<number | null>>;
	setHeartbeatAlive: Dispatch<SetStateAction<boolean>>;
	onConnect?: () => void;
	onDisconnect?: (error?: ConnectionError) => void;
	showToasts: boolean;
	alert: ReturnType<typeof useAlert>;
}) {
	const handleConnected = useCallback(() => {
		clearTimers();
		setState("connected");
		setError(null);
		setRetryAttempt(0);
		setRetryCountdown(null);
		setHeartbeatAlive(true);
		onConnect?.();
	}, [
		clearTimers,
		onConnect,
		setError,
		setHeartbeatAlive,
		setRetryAttempt,
		setRetryCountdown,
		setState,
	]);

	const handleDisconnected = useCallback(
		(connectionError?: ConnectionError) => {
			clearTimers();
			setState(connectionError ? "error" : "disconnected");
			if (connectionError) {
				setError(connectionError);
				if (showToasts && connectionError.type !== "unauthorized") {
					alert.warning("Disconnected", getErrorMessage(connectionError));
				}
			}
			onDisconnect?.(connectionError);
		},
		[clearTimers, showToasts, alert, onDisconnect, setError, setState],
	);

	const handleError = useCallback(
		(connectionError: ConnectionError) => {
			setError(connectionError);
			setState("error");
			if (!connectionError.retryable && showToasts) {
				if (connectionError.type === "unauthorized") {
					alert.critical("Session Expired", "Please log in again to continue.");
				} else {
					alert.warning("Connection Error", getErrorMessage(connectionError));
				}
			}
		},
		[alert, showToasts, setError, setState],
	);

	return { handleConnected, handleDisconnected, handleError };
}

export function useConnectionRecoveryHeartbeat({
	deadTimerRef,
	pingTimerRef,
	pongTimerRef,
	lastPongRef,
	setHeartbeatAlive,
	heartbeatTimeoutMs,
	handleDisconnected,
}: {
	deadTimerRef: TimeoutRef;
	pingTimerRef: IntervalRef;
	pongTimerRef: TimeoutRef;
	lastPongRef: RefObject<number>;
	setHeartbeatAlive: Dispatch<SetStateAction<boolean>>;
	heartbeatTimeoutMs: number;
	handleDisconnected: (error: ConnectionError) => void;
}) {
	const stopHeartbeat = useCallback(() => {
		if (pingTimerRef.current) {
			clearInterval(pingTimerRef.current);
			pingTimerRef.current = null;
		}
		if (pongTimerRef.current) {
			clearTimeout(pongTimerRef.current);
			pongTimerRef.current = null;
		}
		if (deadTimerRef.current) {
			clearTimeout(deadTimerRef.current);
			deadTimerRef.current = null;
		}
	}, [pingTimerRef, pongTimerRef, deadTimerRef]);

	const startHeartbeat = useCallback(() => {
		lastPongRef.current = Date.now();
		setHeartbeatAlive(true);
		deadTimerRef.current = setTimeout(() => {
			setHeartbeatAlive(false);
			handleDisconnected({
				type: "timeout",
				message: "Connection appears to be dead. Reconnecting...",
				retryable: true,
			});
		}, heartbeatTimeoutMs);
	}, [deadTimerRef, heartbeatTimeoutMs, handleDisconnected, lastPongRef, setHeartbeatAlive]);

	const onPong = useCallback(() => {
		lastPongRef.current = Date.now();
		setHeartbeatAlive(true);
		if (deadTimerRef.current) {
			clearTimeout(deadTimerRef.current);
		}
		deadTimerRef.current = setTimeout(() => {
			setHeartbeatAlive(false);
		}, heartbeatTimeoutMs);
	}, [deadTimerRef, heartbeatTimeoutMs, lastPongRef, setHeartbeatAlive]);

	return { startHeartbeat, stopHeartbeat, onPong };
}

export function useConnectionRecoveryActions({
	clearTimers,
	setRetryCountdown,
	setState,
	setError,
	setRetryAttempt,
	setHeartbeatAlive,
}: {
	clearTimers: () => void;
	setRetryCountdown: Dispatch<SetStateAction<number | null>>;
	setState: (state: ConnectionState) => void;
	setError: Dispatch<SetStateAction<ConnectionError | null>>;
	setRetryAttempt: Dispatch<SetStateAction<number>>;
	setHeartbeatAlive: Dispatch<SetStateAction<boolean>>;
}) {
	const retry = useCallback(() => {
		clearTimers();
		setRetryCountdown(null);
		setState("reconnecting");
	}, [clearTimers, setRetryCountdown, setState]);

	const reset = useCallback(() => {
		clearTimers();
		setState("disconnected");
		setError(null);
		setRetryAttempt(0);
		setRetryCountdown(null);
		setHeartbeatAlive(true);
	}, [clearTimers, setError, setHeartbeatAlive, setRetryAttempt, setRetryCountdown, setState]);

	useEffect(() => clearTimers, [clearTimers]);

	return { retry, reset };
}
