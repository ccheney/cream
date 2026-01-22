/**
 * Connection Recovery Hook
 *
 * Provides exponential backoff, retry logic, and error handling
 * for WebSocket and SSE connections.
 *
 * @see docs/plans/ui/31-realtime-patterns.md
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useAlert } from "@/stores/alert-store";

export type ConnectionState =
	| "connected"
	| "connecting"
	| "reconnecting"
	| "disconnected"
	| "error"
	| "offline";

export type ConnectionErrorType =
	| "network"
	| "timeout"
	| "unauthorized"
	| "forbidden"
	| "server_error"
	| "service_unavailable"
	| "unknown";

export interface ConnectionError {
	type: ConnectionErrorType;
	statusCode?: number;
	message: string;
	retryable: boolean;
	originalError?: Error;
}

export interface BackoffConfig {
	initialDelayMs?: number;
	maxDelayMs?: number;
	multiplier?: number;
	/** Range: 0-1 */
	jitterFactor?: number;
	maxRetries?: number;
}

export interface HeartbeatConfig {
	pingIntervalMs?: number;
	pongTimeoutMs?: number;
	deadTimeoutMs?: number;
}

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

const DEFAULT_BACKOFF: Required<BackoffConfig> = {
	initialDelayMs: 1000,
	maxDelayMs: 30000,
	multiplier: 2,
	jitterFactor: 0.2,
	maxRetries: 10,
};

const DEFAULT_HEARTBEAT: Required<HeartbeatConfig> = {
	pingIntervalMs: 30000,
	pongTimeoutMs: 5000,
	deadTimeoutMs: 60000,
};

export function calculateBackoffDelay(attempt: number, config: Required<BackoffConfig>): number {
	const { initialDelayMs, maxDelayMs, multiplier, jitterFactor } = config;

	// Exponential backoff: initialDelay * multiplier^attempt
	const exponentialDelay = initialDelayMs * multiplier ** attempt;
	const delay = Math.min(exponentialDelay, maxDelayMs);

	// Add jitter: ±jitterFactor
	const jitter = delay * jitterFactor * (Math.random() * 2 - 1);
	return Math.max(0, Math.round(delay + jitter));
}

/**
 * Classify HTTP status code into error type.
 */
export function classifyHttpError(statusCode: number): ConnectionErrorType {
	if (statusCode === 401) {
		return "unauthorized";
	}
	if (statusCode === 403) {
		return "forbidden";
	}
	if (statusCode >= 500 && statusCode < 600) {
		return statusCode === 503 ? "service_unavailable" : "server_error";
	}
	return "unknown";
}

/**
 * Create a ConnectionError from various error types.
 */
export function createConnectionError(error: unknown, statusCode?: number): ConnectionError {
	// Network errors
	if (error instanceof TypeError && error.message.includes("fetch")) {
		return {
			type: "network",
			message: "Network connection lost. Check your internet connection.",
			retryable: true,
			originalError: error,
		};
	}

	// Timeout errors
	if (
		error instanceof Error &&
		(error.name === "TimeoutError" || error.message.includes("timeout"))
	) {
		return {
			type: "timeout",
			message: "Connection timed out. Server may be slow or unavailable.",
			retryable: true,
			originalError: error,
		};
	}

	// HTTP status errors
	if (statusCode) {
		const type = classifyHttpError(statusCode);
		const messages: Record<ConnectionErrorType, string> = {
			unauthorized: "Session expired. Please log in again.",
			forbidden: "Access denied. You don't have permission.",
			server_error: "Server error. Our team has been notified.",
			service_unavailable: "Service temporarily unavailable. Retrying...",
			network: "Network connection lost.",
			timeout: "Connection timed out.",
			unknown: "An unexpected error occurred.",
		};

		return {
			type,
			statusCode,
			message: messages[type],
			retryable: type === "server_error" || type === "service_unavailable",
			originalError: error instanceof Error ? error : undefined,
		};
	}

	// Generic error
	return {
		type: "unknown",
		message: error instanceof Error ? error.message : "An unexpected error occurred.",
		retryable: true,
		originalError: error instanceof Error ? error : undefined,
	};
}

/**
 * Get user-friendly error message with guidance.
 */
export function getErrorMessage(error: ConnectionError): string {
	switch (error.type) {
		case "network":
			return "Connection lost. Check your internet and try again.";
		case "timeout":
			return "Server is not responding. Retrying...";
		case "unauthorized":
			return "Your session has expired. Please log in again.";
		case "forbidden":
			return "You don't have access to this resource.";
		case "server_error":
			return "Server error. We're working on it.";
		case "service_unavailable":
			return "Service temporarily unavailable. Retrying shortly...";
		default:
			return error.message || "Something went wrong. Please try again.";
	}
}

// ============================================
// Hook Implementation
// ============================================

export function useConnectionRecovery(
	options: UseConnectionRecoveryOptions = {},
): UseConnectionRecoveryReturn {
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

	// State
	const [state, setState] = useState<ConnectionState>("disconnected");
	const [error, setError] = useState<ConnectionError | null>(null);
	const [retryAttempt, setRetryAttempt] = useState(0);
	const [retryCountdown, setRetryCountdown] = useState<number | null>(null);
	const [heartbeatAlive, setHeartbeatAlive] = useState(true);

	// Refs for timers
	const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const pongTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const deadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const lastPongRef = useRef<number>(Date.now());

	// Cleanup function
	const clearTimers = useCallback(() => {
		if (retryTimerRef.current) {
			clearTimeout(retryTimerRef.current);
			retryTimerRef.current = null;
		}
		if (countdownTimerRef.current) {
			clearInterval(countdownTimerRef.current);
			countdownTimerRef.current = null;
		}
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
	}, []);

	// Get backoff delay
	const getBackoffDelay = useCallback(() => {
		return calculateBackoffDelay(retryAttempt, {
			initialDelayMs: backoff.initialDelayMs,
			maxDelayMs: backoff.maxDelayMs,
			multiplier: backoff.multiplier,
			jitterFactor: backoff.jitterFactor,
			maxRetries: backoff.maxRetries,
		});
	}, [
		retryAttempt,
		backoff.initialDelayMs,
		backoff.maxDelayMs,
		backoff.multiplier,
		backoff.jitterFactor,
		backoff.maxRetries,
	]);

	// Check if should retry
	const shouldRetry = useCallback(() => {
		if (!error) {
			return false;
		}
		if (!error.retryable) {
			return false;
		}
		if (retryAttempt >= backoff.maxRetries) {
			return false;
		}
		return true;
	}, [error, retryAttempt, backoff.maxRetries]);

	// Schedule retry
	const _scheduleRetry = useCallback(
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

			// Countdown timer (updates every second)
			countdownTimerRef.current = setInterval(() => {
				setRetryCountdown((prev) => {
					if (prev === null || prev <= 1000) {
						if (countdownTimerRef.current) {
							clearInterval(countdownTimerRef.current);
						}
						return null;
					}
					return prev - 1000;
				});
			}, 1000);

			// Retry timer
			retryTimerRef.current = setTimeout(() => {
				setRetryAttempt((prev) => prev + 1);
				onRetry?.(retryAttempt + 1, delay);
				retryFn();
			}, delay);
		},
		[
			shouldRetry,
			getBackoffDelay,
			retryAttempt,
			backoff.maxRetries,
			onRetry,
			onMaxRetriesExceeded,
			showToasts,
			alert,
		],
	);

	// Handle successful connection
	const handleConnected = useCallback(() => {
		clearTimers();
		setState("connected");
		setError(null);
		setRetryAttempt(0);
		setRetryCountdown(null);
		setHeartbeatAlive(true);
		lastPongRef.current = Date.now();
		onConnect?.();
	}, [clearTimers, onConnect]);

	// Handle disconnection
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
		[clearTimers, showToasts, alert, onDisconnect],
	);

	// Handle error
	const handleError = useCallback(
		(connectionError: ConnectionError) => {
			setError(connectionError);
			setState("error");

			// Non-retryable errors get immediate feedback
			if (!connectionError.retryable) {
				if (showToasts) {
					if (connectionError.type === "unauthorized") {
						alert.critical("Session Expired", "Please log in again to continue.");
					} else {
						alert.warning("Connection Error", getErrorMessage(connectionError));
					}
				}
			}
		},
		[showToasts, alert],
	);

	// Manual retry
	const retry = useCallback(() => {
		clearTimers();
		setRetryCountdown(null);
		setState("reconnecting");
	}, [clearTimers]);

	// Reset state
	const reset = useCallback(() => {
		clearTimers();
		setState("disconnected");
		setError(null);
		setRetryAttempt(0);
		setRetryCountdown(null);
		setHeartbeatAlive(true);
	}, [clearTimers]);

	// Heartbeat handlers
	const startHeartbeat = useCallback(() => {
		lastPongRef.current = Date.now();
		setHeartbeatAlive(true);

		// Dead timer - no pong for deadTimeoutMs
		deadTimerRef.current = setTimeout(() => {
			setHeartbeatAlive(false);
			handleDisconnected({
				type: "timeout",
				message: "Connection appears to be dead. Reconnecting...",
				retryable: true,
			});
		}, heartbeatCfg.deadTimeoutMs);
	}, [heartbeatCfg.deadTimeoutMs, handleDisconnected]);

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
	}, []);

	const onPong = useCallback(() => {
		lastPongRef.current = Date.now();
		setHeartbeatAlive(true);

		// Reset dead timer
		if (deadTimerRef.current) {
			clearTimeout(deadTimerRef.current);
		}
		deadTimerRef.current = setTimeout(() => {
			setHeartbeatAlive(false);
		}, heartbeatCfg.deadTimeoutMs);
	}, [heartbeatCfg.deadTimeoutMs]);

	// Cleanup on unmount
	useEffect(() => {
		return clearTimers;
	}, [clearTimers]);

	return {
		state,
		error,
		retryAttempt,
		retryCountdown,
		retry,
		reset,
		onConnected: handleConnected,
		onDisconnected: handleDisconnected,
		onError: handleError,
		shouldRetry,
		getBackoffDelay,
		heartbeat: {
			start: startHeartbeat,
			stop: stopHeartbeat,
			onPong,
			isAlive: heartbeatAlive,
		},
	};
}

// ============================================
// Connection Status Component Hook
// ============================================

export interface ConnectionStatusInfo {
	/** Status text to display */
	text: string;
	/** Status color */
	color: "green" | "yellow" | "red" | "gray";
	/** Is currently connecting/reconnecting */
	isConnecting: boolean;
	/** Retry countdown text (e.g., "Retrying in 5s") */
	retryText: string | null;
}

export function useConnectionStatusInfo(
	state: ConnectionState,
	retryCountdown: number | null,
	retryAttempt: number,
): ConnectionStatusInfo {
	const isConnecting = state === "connecting" || state === "reconnecting";

	let text: string;
	let color: ConnectionStatusInfo["color"];

	switch (state) {
		case "connected":
			text = "Connected";
			color = "green";
			break;
		case "connecting":
			text = "Connecting...";
			color = "yellow";
			break;
		case "reconnecting":
			text = `Reconnecting (attempt ${retryAttempt})...`;
			color = "yellow";
			break;
		case "disconnected":
			text = "Disconnected";
			color = "gray";
			break;
		case "error":
			text = "Connection Error";
			color = "red";
			break;
		case "offline":
			text = "Offline";
			color = "red";
			break;
		default:
			text = "Unknown";
			color = "gray";
	}

	const retryText =
		retryCountdown !== null ? `Retrying in ${Math.ceil(retryCountdown / 1000)}s...` : null;

	return { text, color, isConnecting, retryText };
}

// ============================================
// Exports
// ============================================

export default useConnectionRecovery;
