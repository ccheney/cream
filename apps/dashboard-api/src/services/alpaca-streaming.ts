/**
 * Alpaca Trade Updates WebSocket Service
 *
 * Connects to Alpaca's trading stream for real-time account and order updates.
 * This is separate from the market data stream - it provides order status updates.
 *
 * Endpoints:
 * - Paper: wss://paper-api.alpaca.markets/stream
 * - Live: wss://api.alpaca.markets/stream
 *
 * @see https://docs.alpaca.markets/docs/websocket-streaming
 * @see docs/plans/ui/40-streaming-data-integration.md Part 4.1
 */

import type { AlpacaTradeUpdateMessage } from "./alpaca-streaming.schemas.js";
import { AlpacaTradeUpdateMessageSchema } from "./alpaca-streaming.schemas.js";

export type {
	AlpacaAuthFailureMessage,
	AlpacaAuthSuccessMessage,
	AlpacaListeningMessage,
	AlpacaOrder,
	AlpacaStreamMessage,
	TradeUpdateEvent,
} from "./alpaca-streaming.schemas.js";
export {
	AlpacaAuthFailureMessageSchema,
	AlpacaAuthSuccessMessageSchema,
	AlpacaListeningMessageSchema,
	AlpacaOrderSchema,
	AlpacaTradeUpdateMessageSchema,
	TradeUpdateEventSchema,
} from "./alpaca-streaming.schemas.js";

// ============================================
// Constants & Endpoints
// ============================================

const ALPACA_TRADING_ENDPOINTS = {
	paper: "wss://paper-api.alpaca.markets/stream",
	live: "wss://api.alpaca.markets/stream",
} as const;

// ============================================
// Configuration Types
// ============================================

export interface AlpacaTradingStreamConfig {
	apiKey: string;
	apiSecret: string;
	/** Use paper or live endpoint (default: paper) */
	paper?: boolean;
	/** Enable auto-reconnect on disconnect (default: true) */
	autoReconnect?: boolean;
	/** Max reconnection attempts (default: 10) */
	maxReconnectAttempts?: number;
	/** Initial reconnection delay in ms (default: 1000) */
	reconnectDelayMs?: number;
	/** Max reconnection delay in ms (default: 30000) */
	maxReconnectDelayMs?: number;
	/** Heartbeat interval in ms (default: 30000) */
	heartbeatIntervalMs?: number;
	/** Heartbeat timeout in ms (default: 10000) */
	heartbeatTimeoutMs?: number;
}

export enum TradingStreamState {
	DISCONNECTED = "DISCONNECTED",
	CONNECTING = "CONNECTING",
	CONNECTED = "CONNECTED",
	AUTHENTICATING = "AUTHENTICATING",
	AUTHENTICATED = "AUTHENTICATED",
	ERROR = "ERROR",
}

export type TradingStreamEvent =
	| { type: "connected" }
	| { type: "authenticated" }
	| { type: "listening"; streams: string[] }
	| { type: "trade_update"; data: AlpacaTradeUpdateMessage["data"] }
	| { type: "error"; message: string }
	| { type: "disconnected"; reason: string }
	| { type: "reconnecting"; attempt: number }
	| { type: "heartbeat_sent" }
	| { type: "heartbeat_timeout" };

export type TradingStreamEventHandler = (event: TradingStreamEvent) => void | Promise<void>;

// ============================================
// WebSocket Service
// ============================================

/**
 * Alpaca Trading Stream WebSocket Service.
 *
 * Connects to Alpaca's trading stream for real-time order updates.
 * This is used to receive fill, cancel, and reject notifications.
 *
 * @example
 * ```typescript
 * const service = new AlpacaTradingStreamService({
 *   apiKey: Bun.env.ALPACA_KEY!,
 *   apiSecret: Bun.env.ALPACA_SECRET!,
 *   paper: true,
 * });
 *
 * service.on((event) => {
 *   if (event.type === 'trade_update') {
 *     console.log(`Order ${event.data.order.id}: ${event.data.event}`);
 *   }
 * });
 *
 * await service.connect();
 * service.subscribeTradeUpdates();
 * ```
 */
export class AlpacaTradingStreamService {
	private config: Required<AlpacaTradingStreamConfig>;
	private ws: WebSocket | null = null;
	private state: TradingStreamState = TradingStreamState.DISCONNECTED;
	private eventHandlers: TradingStreamEventHandler[] = [];
	private reconnectAttempts = 0;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	private heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
	private awaitingHeartbeatResponse = false;

	constructor(config: AlpacaTradingStreamConfig) {
		this.config = {
			apiKey: config.apiKey,
			apiSecret: config.apiSecret,
			paper: config.paper ?? true,
			autoReconnect: config.autoReconnect ?? true,
			maxReconnectAttempts: config.maxReconnectAttempts ?? 10,
			reconnectDelayMs: config.reconnectDelayMs ?? 1000,
			maxReconnectDelayMs: config.maxReconnectDelayMs ?? 30000,
			heartbeatIntervalMs: config.heartbeatIntervalMs ?? 30000,
			heartbeatTimeoutMs: config.heartbeatTimeoutMs ?? 10000,
		};
	}

	/**
	 * Get current connection state.
	 */
	getState(): TradingStreamState {
		return this.state;
	}

	/**
	 * Check if connected and authenticated.
	 */
	isConnected(): boolean {
		return this.state === TradingStreamState.AUTHENTICATED;
	}

	/**
	 * Get WebSocket endpoint URL.
	 */
	private getEndpoint(): string {
		return this.config.paper ? ALPACA_TRADING_ENDPOINTS.paper : ALPACA_TRADING_ENDPOINTS.live;
	}

	/**
	 * Add an event handler.
	 */
	on(handler: TradingStreamEventHandler): void {
		this.eventHandlers.push(handler);
	}

	/**
	 * Remove an event handler.
	 */
	off(handler: TradingStreamEventHandler): void {
		this.eventHandlers = this.eventHandlers.filter((h) => h !== handler);
	}

	/**
	 * Emit event to all handlers.
	 */
	private emit(event: TradingStreamEvent): void {
		for (const handler of this.eventHandlers) {
			try {
				void handler(event);
			} catch {
				// Handler errors must not crash the WebSocket service
			}
		}
	}

	/**
	 * Connect to the trading stream.
	 */
	async connect(): Promise<void> {
		if (this.state !== TradingStreamState.DISCONNECTED) {
			throw new Error(`Cannot connect in state: ${this.state}`);
		}

		this.state = TradingStreamState.CONNECTING;
		const endpoint = this.getEndpoint();

		const { promise, resolve, reject } = Promise.withResolvers<void>();

		try {
			this.ws = new WebSocket(endpoint);

			this.ws.addEventListener("open", () => {
				this.state = TradingStreamState.CONNECTED;
				this.emit({ type: "connected" });
				this.authenticate();
			});

			this.ws.addEventListener("message", (event: MessageEvent) => {
				this.handleMessage(event.data, resolve);
			});

			this.ws.addEventListener("error", () => {
				const error = new Error("WebSocket connection error");
				this.handleError(error);
				if (this.state === TradingStreamState.CONNECTING) {
					reject(error);
				}
			});

			this.ws.addEventListener("close", (event: CloseEvent) => {
				this.handleClose(event.code, event.reason);
			});
		} catch (error) {
			this.state = TradingStreamState.ERROR;
			reject(error as Error);
		}

		return promise;
	}

	/**
	 * Send authentication message.
	 */
	private authenticate(): void {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			throw new Error("WebSocket not ready for authentication");
		}

		this.state = TradingStreamState.AUTHENTICATING;
		this.send({
			action: "authenticate",
			data: {
				key_id: this.config.apiKey,
				secret_key: this.config.apiSecret,
			},
		});
	}

	/**
	 * Subscribe to trade_updates stream.
	 */
	subscribeTradeUpdates(): void {
		if (!this.isConnected()) {
			throw new Error("Not authenticated. Call connect() first.");
		}

		this.send({
			action: "listen",
			data: {
				streams: ["trade_updates"],
			},
		});
	}

	/**
	 * Disconnect from the trading stream.
	 */
	disconnect(): void {
		this.clearTimers();

		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}

		this.state = TradingStreamState.DISCONNECTED;
		this.reconnectAttempts = 0;
	}

	/**
	 * Send a message over the WebSocket.
	 */
	private send(message: Record<string, unknown>): void {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			throw new Error("WebSocket not ready");
		}

		this.ws.send(JSON.stringify(message));
	}

	/**
	 * Handle incoming WebSocket messages.
	 */
	private handleMessage(data: string | ArrayBuffer, connectResolve?: () => void): void {
		// Track activity for heartbeat mechanism
		this.onActivity();

		try {
			const msg = this.parseIncomingMessage(data);
			this.handleStreamMessage(msg, connectResolve);
		} catch (error) {
			this.emit({
				type: "error",
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}

	private parseIncomingMessage(data: string | ArrayBuffer): Record<string, unknown> {
		const text = typeof data === "string" ? data : new TextDecoder().decode(data);
		return JSON.parse(text) as Record<string, unknown>;
	}

	private handleStreamMessage(msg: Record<string, unknown>, connectResolve?: () => void): void {
		const stream = msg.stream;
		if (stream === "authorization") {
			this.handleAuthorizationMessage(msg, connectResolve);
			return;
		}

		if (stream === "listening") {
			this.handleListeningMessage(msg);
			return;
		}

		if (stream === "trade_updates") {
			this.handleTradeUpdateMessage(msg);
		}
	}

	private handleAuthorizationMessage(
		msg: Record<string, unknown>,
		connectResolve?: () => void,
	): void {
		const authData = msg.data as { status: string; action: string };
		if (authData.status === "authorized") {
			this.handleAuthorized(connectResolve);
			return;
		}

		if (authData.status === "unauthorized") {
			this.state = TradingStreamState.ERROR;
			this.emit({ type: "error", message: "Authentication failed" });
		}
	}

	private handleAuthorized(connectResolve?: () => void): void {
		this.state = TradingStreamState.AUTHENTICATED;
		this.emit({ type: "authenticated" });
		this.startHeartbeat();
		this.reconnectAttempts = 0;

		// Auto-subscribe to trade_updates
		this.subscribeTradeUpdates();
		connectResolve?.();
	}

	private handleListeningMessage(msg: Record<string, unknown>): void {
		const listenData = msg.data as { streams: string[] };
		this.emit({ type: "listening", streams: listenData.streams });
	}

	private handleTradeUpdateMessage(msg: Record<string, unknown>): void {
		const parsed = AlpacaTradeUpdateMessageSchema.safeParse(msg);
		if (parsed.success) {
			this.emit({ type: "trade_update", data: parsed.data.data });
		}
	}

	/**
	 * Handle WebSocket errors.
	 */
	private handleError(error: Error): void {
		this.state = TradingStreamState.ERROR;
		this.emit({ type: "error", message: error.message });
	}

	/**
	 * Handle WebSocket close.
	 */
	private handleClose(code: number, reason: string): void {
		this.clearTimers();
		this.ws = null;

		const message = reason || `Connection closed with code ${code}`;
		this.emit({ type: "disconnected", reason: message });

		if (this.config.autoReconnect && this.reconnectAttempts < this.config.maxReconnectAttempts) {
			this.scheduleReconnect();
		} else {
			this.state = TradingStreamState.DISCONNECTED;
		}
	}

	/**
	 * Schedule a reconnection attempt with exponential backoff.
	 */
	private scheduleReconnect(): void {
		this.reconnectAttempts++;
		// Exponential backoff: 1s, 2s, 4s, 8s, 16s, up to maxReconnectDelayMs (default 30s)
		const delay = Math.min(
			this.config.reconnectDelayMs * 2 ** (this.reconnectAttempts - 1),
			this.config.maxReconnectDelayMs,
		);

		this.emit({ type: "reconnecting", attempt: this.reconnectAttempts });

		this.reconnectTimer = setTimeout(() => {
			this.state = TradingStreamState.DISCONNECTED;
			this.connect().catch(() => {
				if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
					this.scheduleReconnect();
				} else {
					this.state = TradingStreamState.DISCONNECTED;
					this.emit({
						type: "error",
						message: "Max reconnection attempts reached",
					});
				}
			});
		}, delay);
	}

	/**
	 * Start heartbeat mechanism to detect stale connections.
	 *
	 * Sends a ping every heartbeatIntervalMs (default 30s) and expects
	 * activity within heartbeatTimeoutMs (default 10s). If no activity
	 * is received, forces a reconnect.
	 */
	private startHeartbeat(): void {
		this.awaitingHeartbeatResponse = false;

		// Send heartbeat ping every heartbeatIntervalMs
		this.heartbeatTimer = setInterval(() => {
			if (this.ws && this.ws.readyState === WebSocket.OPEN) {
				this.sendHeartbeatPing();
			}
		}, this.config.heartbeatIntervalMs);
	}

	/**
	 * Send a heartbeat ping and start timeout timer.
	 */
	private sendHeartbeatPing(): void {
		if (this.awaitingHeartbeatResponse) {
			// Already waiting for a response, don't send another ping
			return;
		}

		this.awaitingHeartbeatResponse = true;
		this.emit({ type: "heartbeat_sent" });

		// Start timeout timer - if no activity within timeout, force reconnect
		this.heartbeatTimeoutTimer = setTimeout(() => {
			this.handleHeartbeatTimeout();
		}, this.config.heartbeatTimeoutMs);
	}

	/**
	 * Handle heartbeat timeout - force reconnect.
	 */
	private handleHeartbeatTimeout(): void {
		this.emit({ type: "heartbeat_timeout" });
		this.clearHeartbeatTimeoutTimer();
		this.awaitingHeartbeatResponse = false;

		// Force close and reconnect
		if (this.ws) {
			this.ws.close();
		}
	}

	/**
	 * Reset heartbeat state on activity.
	 * Called when any message is received from the server.
	 */
	private onActivity(): void {
		if (this.awaitingHeartbeatResponse) {
			this.awaitingHeartbeatResponse = false;
			this.clearHeartbeatTimeoutTimer();
		}
	}

	/**
	 * Clear heartbeat timeout timer.
	 */
	private clearHeartbeatTimeoutTimer(): void {
		if (this.heartbeatTimeoutTimer) {
			clearTimeout(this.heartbeatTimeoutTimer);
			this.heartbeatTimeoutTimer = null;
		}
	}

	/**
	 * Clear all timers.
	 */
	private clearTimers(): void {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}

		if (this.heartbeatTimer) {
			clearInterval(this.heartbeatTimer);
			this.heartbeatTimer = null;
		}

		this.clearHeartbeatTimeoutTimer();
		this.awaitingHeartbeatResponse = false;
	}
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create an Alpaca trading stream service from environment variables.
 */
export function createAlpacaTradingStreamFromEnv(paper = true): AlpacaTradingStreamService {
	const apiKey = Bun.env.ALPACA_KEY;
	const apiSecret = Bun.env.ALPACA_SECRET;

	if (!apiKey || !apiSecret) {
		throw new Error("ALPACA_KEY and ALPACA_SECRET environment variables are required");
	}

	return new AlpacaTradingStreamService({
		apiKey,
		apiSecret,
		paper,
	});
}

// ============================================
// Singleton Instance
// ============================================

let tradingStreamInstance: AlpacaTradingStreamService | null = null;

/**
 * Get the singleton trading stream service instance.
 * Creates and connects if not already initialized.
 */
export async function getTradingStreamService(paper = true): Promise<AlpacaTradingStreamService> {
	if (!tradingStreamInstance) {
		tradingStreamInstance = createAlpacaTradingStreamFromEnv(paper);
		await tradingStreamInstance.connect();
	}
	return tradingStreamInstance;
}

/**
 * Shutdown the singleton trading stream service.
 */
export function shutdownTradingStreamService(): void {
	if (tradingStreamInstance) {
		tradingStreamInstance.disconnect();
		tradingStreamInstance = null;
	}
}

export default AlpacaTradingStreamService;
