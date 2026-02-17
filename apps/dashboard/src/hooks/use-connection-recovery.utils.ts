"use client";

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

export const DEFAULT_BACKOFF: Required<BackoffConfig> = {
	initialDelayMs: 1000,
	maxDelayMs: 30000,
	multiplier: 2,
	jitterFactor: 0.2,
	maxRetries: 10,
};

export const DEFAULT_HEARTBEAT: Required<HeartbeatConfig> = {
	pingIntervalMs: 30000,
	pongTimeoutMs: 5000,
	deadTimeoutMs: 60000,
};

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

export interface ConnectionStatusInfo {
	text: string;
	color: "green" | "yellow" | "red" | "gray";
	isConnecting: boolean;
	retryText: string | null;
}

export function calculateBackoffDelay(attempt: number, config: Required<BackoffConfig>): number {
	const { initialDelayMs, maxDelayMs, multiplier, jitterFactor } = config;
	const exponentialDelay = initialDelayMs * multiplier ** attempt;
	const delay = Math.min(exponentialDelay, maxDelayMs);
	const jitter = delay * jitterFactor * (Math.random() * 2 - 1);
	return Math.max(0, Math.round(delay + jitter));
}

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

export function createConnectionError(error: unknown, statusCode?: number): ConnectionError {
	if (error instanceof TypeError && error.message.includes("fetch")) {
		return {
			type: "network",
			message: "Network connection lost. Check your internet connection.",
			retryable: true,
			originalError: error,
		};
	}

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

	return {
		type: "unknown",
		message: error instanceof Error ? error.message : "An unexpected error occurred.",
		retryable: true,
		originalError: error instanceof Error ? error : undefined,
	};
}

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
