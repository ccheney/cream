"use client";

import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";
import { useAlert } from "@/stores/alert-store";
import {
	type ConnectionRecoveryRefs,
	useClearConnectionRecoveryTimers,
	useConnectionRecoveryActions,
	useConnectionRecoveryBackoff,
	useConnectionRecoveryEventHandlers,
	useConnectionRecoveryHeartbeat,
	useConnectionRecoveryRefs,
} from "./use-connection-recovery.core.internal";
import type {
	BackoffConfig,
	ConnectionError,
	ConnectionState,
	HeartbeatConfig,
} from "./use-connection-recovery.utils";
import { DEFAULT_BACKOFF, DEFAULT_HEARTBEAT } from "./use-connection-recovery.utils";

export interface UseConnectionRecoveryOptions {
	backoff?: BackoffConfig;
	heartbeat?: HeartbeatConfig;
	showToasts?: boolean;
	onConnect?: () => void;
	onDisconnect?: (error?: ConnectionError) => void;
	onRetry?: (attempt: number, delay: number) => void;
	onMaxRetriesExceeded?: () => void;
}

export interface UseConnectionRecoveryReturn {
	state: ConnectionState;
	error: ConnectionError | null;
	retryAttempt: number;
	retryCountdown: number | null;
	retry: () => void;
	reset: () => void;
	onConnected: () => void;
	onDisconnected: (error?: ConnectionError) => void;
	onError: (error: ConnectionError) => void;
	shouldRetry: () => boolean;
	getBackoffDelay: () => number;
	heartbeat: {
		start: () => void;
		stop: () => void;
		onPong: () => void;
		isAlive: boolean;
	};
}

type ConnectionRecoveryRuntime = {
	backoff: Required<BackoffConfig>;
	heartbeatCfg: Required<HeartbeatConfig>;
	showToasts: boolean;
	onConnect?: () => void;
	onDisconnect?: (error?: ConnectionError) => void;
	onRetry?: (attempt: number, delay: number) => void;
	onMaxRetriesExceeded?: () => void;
	alert: ReturnType<typeof useAlert>;
	state: ConnectionState;
	error: ConnectionError | null;
	retryAttempt: number;
	retryCountdown: number | null;
	heartbeatAlive: boolean;
	refs: ConnectionRecoveryRefs;
	clearTimers: () => void;
	setState: (state: ConnectionState) => void;
	setError: Dispatch<SetStateAction<ConnectionError | null>>;
	setRetryAttempt: Dispatch<SetStateAction<number>>;
	setRetryCountdown: Dispatch<SetStateAction<number | null>>;
	setHeartbeatAlive: Dispatch<SetStateAction<boolean>>;
};

function useConnectionRecoveryRuntime(
	options: UseConnectionRecoveryOptions,
): ConnectionRecoveryRuntime {
	const {
		backoff: backoffConfig,
		heartbeat: heartbeatConfig,
		showToasts = true,
		onConnect,
		onDisconnect,
		onRetry,
		onMaxRetriesExceeded,
	} = options;

	const backoff = { ...DEFAULT_BACKOFF, ...backoffConfig };
	const heartbeatCfg = { ...DEFAULT_HEARTBEAT, ...heartbeatConfig };
	const alert = useAlert();
	const [state, setState] = useState<ConnectionState>("disconnected");
	const [error, setError] = useState<ConnectionError | null>(null);
	const [retryAttempt, setRetryAttempt] = useState(0);
	const [retryCountdown, setRetryCountdown] = useState<number | null>(null);
	const [heartbeatAlive, setHeartbeatAlive] = useState(true);

	const refs = useConnectionRecoveryRefs();
	const clearTimers = useClearConnectionRecoveryTimers(refs);

	return {
		backoff,
		heartbeatCfg,
		showToasts,
		onConnect,
		onDisconnect,
		onRetry,
		onMaxRetriesExceeded,
		alert,
		state,
		error,
		retryAttempt,
		retryCountdown,
		heartbeatAlive,
		refs,
		clearTimers,
		setState,
		setError,
		setRetryAttempt,
		setRetryCountdown,
		setHeartbeatAlive,
	};
}

function createRecoveryBackoff(runtime: ConnectionRecoveryRuntime) {
	return useConnectionRecoveryBackoff({
		retryAttempt: runtime.retryAttempt,
		error: runtime.error,
		backoff: runtime.backoff,
		setRetryAttempt: runtime.setRetryAttempt,
		setRetryCountdown: runtime.setRetryCountdown,
		showToasts: runtime.showToasts,
		onRetry: runtime.onRetry,
		onMaxRetriesExceeded: runtime.onMaxRetriesExceeded,
		alert: runtime.alert,
		retryTimerRef: runtime.refs.retryTimerRef,
		countdownTimerRef: runtime.refs.countdownTimerRef,
	});
}

function createRecoveryEventHandlers(runtime: ConnectionRecoveryRuntime) {
	return useConnectionRecoveryEventHandlers({
		clearTimers: runtime.clearTimers,
		setState: runtime.setState,
		setError: runtime.setError,
		setRetryAttempt: runtime.setRetryAttempt,
		setRetryCountdown: runtime.setRetryCountdown,
		setHeartbeatAlive: runtime.setHeartbeatAlive,
		onConnect: runtime.onConnect,
		onDisconnect: runtime.onDisconnect,
		showToasts: runtime.showToasts,
		alert: runtime.alert,
	});
}

function createRecoveryHeartbeat(
	runtime: ConnectionRecoveryRuntime,
	handleDisconnected: (error?: ConnectionError) => void,
) {
	const { startHeartbeat, stopHeartbeat, onPong } = useConnectionRecoveryHeartbeat({
		deadTimerRef: runtime.refs.deadTimerRef,
		pingTimerRef: runtime.refs.pingTimerRef,
		pongTimerRef: runtime.refs.pongTimerRef,
		lastPongRef: runtime.refs.lastPongRef,
		setHeartbeatAlive: runtime.setHeartbeatAlive,
		heartbeatTimeoutMs: runtime.heartbeatCfg.deadTimeoutMs,
		handleDisconnected,
	});

	return {
		start: startHeartbeat,
		stop: stopHeartbeat,
		onPong,
		isAlive: runtime.heartbeatAlive,
	};
}

function createRecoveryActions(runtime: ConnectionRecoveryRuntime) {
	return useConnectionRecoveryActions({
		clearTimers: runtime.clearTimers,
		setRetryCountdown: runtime.setRetryCountdown,
		setState: runtime.setState,
		setError: runtime.setError,
		setRetryAttempt: runtime.setRetryAttempt,
		setHeartbeatAlive: runtime.setHeartbeatAlive,
	});
}

function buildRecoveryLifecycle(runtime: ConnectionRecoveryRuntime) {
	const { getBackoffDelay, shouldRetry } = createRecoveryBackoff(runtime);
	const { handleConnected, handleDisconnected, handleError } = createRecoveryEventHandlers(runtime);
	const heartbeat = createRecoveryHeartbeat(runtime, handleDisconnected);
	const actions = createRecoveryActions(runtime);

	return {
		getBackoffDelay,
		shouldRetry,
		handleConnected,
		handleDisconnected,
		handleError,
		heartbeat,
		retry: actions.retry,
		reset: actions.reset,
	};
}

function useConnectionRecoveryCore(options: UseConnectionRecoveryOptions = {}) {
	const runtime = useConnectionRecoveryRuntime(options);
	const lifecycle = buildRecoveryLifecycle(runtime);

	return { ...runtime, ...lifecycle };
}

export function useConnectionRecovery(
	options: UseConnectionRecoveryOptions = {},
): UseConnectionRecoveryReturn {
	const recovery = useConnectionRecoveryCore(options);

	return {
		state: recovery.state,
		error: recovery.error,
		retryAttempt: recovery.retryAttempt,
		retryCountdown: recovery.retryCountdown,
		retry: recovery.retry,
		reset: recovery.reset,
		onConnected: recovery.handleConnected,
		onDisconnected: recovery.handleDisconnected,
		onError: recovery.handleError,
		shouldRetry: recovery.shouldRetry,
		getBackoffDelay: recovery.getBackoffDelay,
		heartbeat: recovery.heartbeat,
	};
}

export default useConnectionRecovery;
