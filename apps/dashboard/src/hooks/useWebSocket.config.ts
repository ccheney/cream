export type ConnectionState = "connecting" | "connected" | "disconnected" | "reconnecting";

export interface ReconnectionConfig {
	/** Maximum reconnection attempts (default: 10) */
	maxAttempts: number;

	/** Initial delay in ms (default: 1000) */
	initialDelay: number;

	/** Maximum delay in ms (default: 30000) */
	maxDelay: number;

	/** Backoff multiplier (default: 1.5) */
	backoffMultiplier: number;
}

export interface HeartbeatConfig {
	/** Ping interval in ms (default: 30000) */
	pingInterval: number;

	/** Pong timeout in ms (default: 60000) */
	pongTimeout: number;
}

export interface UseWebSocketOptions {
	/** WebSocket URL */
	url: string;

	/** Authentication token */
	token?: string;

	/** Message handler */
	onMessage?: (data: unknown) => void;

	/** Connection handler */
	onConnect?: () => void;

	/** Disconnection handler */
	onDisconnect?: () => void;

	/** Error handler */
	onError?: (error: Error) => void;

	/** Reconnection configuration */
	reconnection?: Partial<ReconnectionConfig>;

	/** Heartbeat configuration */
	heartbeat?: Partial<HeartbeatConfig>;

	/** Auto-connect on mount (default: true) */
	autoConnect?: boolean;
}

export interface UseWebSocketReturn {
	/** Current connection state */
	connectionState: ConnectionState;

	/** Whether connected */
	connected: boolean;

	/** Whether reconnecting */
	reconnecting: boolean;

	/** Current reconnection attempt */
	reconnectAttempts: number;

	/** Max reconnection attempts */
	maxReconnectAttempts: number;

	/** Seconds until next reconnection attempt */
	nextRetryIn: number | null;

	/** Send a message */
	send: (data: unknown) => boolean;

	/** Send a typed message */
	sendMessage: (type: string, payload: unknown) => boolean;

	/** Subscribe to channels */
	subscribe: (channels: string[]) => void;

	/** Unsubscribe from channels */
	unsubscribe: (channels: string[]) => void;

	/** Subscribe to symbols */
	subscribeSymbols: (symbols: string[]) => void;

	/** Unsubscribe from symbols */
	unsubscribeSymbols: (symbols: string[]) => void;

	/** Subscribe to options contracts */
	subscribeOptions: (contracts: string[]) => void;

	/** Unsubscribe from options contracts */
	unsubscribeOptions: (contracts: string[]) => void;

	/** Connect manually */
	connect: () => void;

	/** Disconnect manually */
	disconnect: () => void;

	/** Last error */
	lastError: Error | null;

	/** Current subscribed channels */
	subscribedChannels: string[];

	/** Current subscribed symbols */
	subscribedSymbols: string[];

	/** Current subscribed options contracts */
	subscribedContracts: string[];
}

const DEFAULT_RECONNECTION: ReconnectionConfig = {
	maxAttempts: 10,
	initialDelay: 1000,
	maxDelay: 30000,
	backoffMultiplier: 1.5,
};

const DEFAULT_HEARTBEAT: HeartbeatConfig = {
	pingInterval: 30000,
	pongTimeout: 60000,
};

/**
 * Jitter prevents reconnection storms when many clients reconnect simultaneously.
 */
export function calculateBackoffDelay(
	attempt: number,
	config: ReconnectionConfig,
	enableJitter = false,
): number {
	const baseDelay = config.initialDelay * config.backoffMultiplier ** attempt;
	if (enableJitter) {
		// Add jitter: 50% to 100% of the calculated delay
		const jitter = 0.5 + Math.random() * 0.5;
		return Math.min(baseDelay * jitter, config.maxDelay);
	}
	return Math.min(baseDelay, config.maxDelay);
}

export function createWebSocketUrl(baseUrl: string, token?: string): string {
	if (!token) {
		return baseUrl;
	}
	const separator = baseUrl.includes("?") ? "&" : "?";
	return `${baseUrl}${separator}token=${encodeURIComponent(token)}`;
}

export { DEFAULT_HEARTBEAT, DEFAULT_RECONNECTION };
