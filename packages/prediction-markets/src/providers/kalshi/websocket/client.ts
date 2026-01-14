/**
 * Kalshi WebSocket Client
 *
 * Real-time market data streaming from Kalshi prediction markets.
 * Supports orderbook deltas, price tickers, and trade notifications.
 *
 * @see https://docs.kalshi.com/websockets/introduction
 */

import * as fs from "node:fs";
import { generateAuthHeaders } from "./auth.js";
import { MarketStateCache } from "./cache.js";
import { handleMessage } from "./handlers.js";
import {
	addSubscription,
	createSubscribeCommand,
	createUnsubscribeCommand,
	removeSubscription,
	resubscribeAll,
} from "./subscriptions.js";
import type {
	ConnectionState,
	KalshiWebSocketCallback,
	KalshiWebSocketChannel,
	KalshiWebSocketConfig,
	ResolvedConfig,
} from "./types.js";
import {
	DEFAULT_RECONNECT_CONFIG,
	HEARTBEAT_INTERVAL_MS,
	KALSHI_DEMO_WEBSOCKET_URL,
	KALSHI_WEBSOCKET_URL,
} from "./types.js";

export class KalshiWebSocketClient {
	private ws: WebSocket | null = null;
	private messageId = 0;
	private connectionState: ConnectionState = "disconnected";
	private reconnectAttempts = 0;
	private reconnectTimer: Timer | null = null;
	private heartbeatTimer: Timer | null = null;
	private readonly config: ResolvedConfig;
	private readonly cache: MarketStateCache;

	private subscriptions: Map<string, Set<KalshiWebSocketCallback>> = new Map();
	private pendingSubscriptions: Map<string, Set<string>> = new Map();

	private onConnectCallbacks: Set<() => void> = new Set();
	private onDisconnectCallbacks: Set<(reason?: string) => void> = new Set();
	private onErrorCallbacks: Set<(error: Error) => void> = new Set();

	constructor(config: KalshiWebSocketConfig = {}) {
		let privateKeyPem = config.privateKeyPem ?? "";
		if (!privateKeyPem && config.privateKeyPath) {
			privateKeyPem = fs.readFileSync(config.privateKeyPath, "utf-8");
		}

		this.config = {
			apiKeyId: config.apiKeyId ?? "",
			privateKeyPem,
			demo: config.demo ?? false,
			autoReconnect: config.autoReconnect ?? true,
			cacheTtlMs: config.cacheTtlMs ?? 5 * 60 * 1000,
			reconnect: {
				initialDelayMs: config.reconnect?.initialDelayMs ?? DEFAULT_RECONNECT_CONFIG.initialDelayMs,
				maxDelayMs: config.reconnect?.maxDelayMs ?? DEFAULT_RECONNECT_CONFIG.maxDelayMs,
				backoffMultiplier:
					config.reconnect?.backoffMultiplier ?? DEFAULT_RECONNECT_CONFIG.backoffMultiplier,
				maxRetries: config.reconnect?.maxRetries ?? DEFAULT_RECONNECT_CONFIG.maxRetries,
			},
		};

		this.cache = new MarketStateCache(this.config.cacheTtlMs);
	}

	isAuthenticated(): boolean {
		return Boolean(this.config.apiKeyId && this.config.privateKeyPem);
	}

	getConnectionState(): ConnectionState {
		return this.connectionState;
	}

	getCache(): MarketStateCache {
		return this.cache;
	}

	async connect(): Promise<void> {
		if (this.connectionState === "connected" || this.connectionState === "connecting") {
			return;
		}

		this.connectionState = "connecting";
		const url = this.config.demo ? KALSHI_DEMO_WEBSOCKET_URL : KALSHI_WEBSOCKET_URL;

		const { promise, resolve, reject } = Promise.withResolvers<void>();
		try {
			const wsOptions = this.isAuthenticated()
				? { headers: generateAuthHeaders(this.config.apiKeyId, this.config.privateKeyPem) }
				: undefined;

			this.ws = new WebSocket(url, wsOptions);

			this.ws.onopen = () => {
				this.connectionState = "connected";
				this.reconnectAttempts = 0;
				this.startHeartbeat();
				this.resubscribe();
				for (const cb of this.onConnectCallbacks) {
					cb();
				}
				resolve();
			};

			this.ws.onclose = (event) => {
				this.handleDisconnect(event.reason);
			};

			this.ws.onerror = () => {
				const error = new Error("WebSocket connection error");
				for (const cb of this.onErrorCallbacks) {
					cb(error);
				}
				if (this.connectionState === "connecting") {
					reject(error);
				}
			};

			this.ws.onmessage = (event) => {
				handleMessage(event.data, {
					cache: this.cache,
					subscriptions: this.subscriptions,
				});
			};
		} catch (error) {
			this.connectionState = "disconnected";
			reject(error as Error);
		}
		return promise;
	}

	disconnect(): void {
		this.stopHeartbeat();
		this.stopReconnect();

		if (this.ws) {
			this.ws.close(1000, "Client disconnect");
			this.ws = null;
		}

		this.connectionState = "disconnected";
	}

	subscribe(
		channel: KalshiWebSocketChannel,
		tickers: string[],
		callback: KalshiWebSocketCallback
	): void {
		addSubscription(
			{ subscriptions: this.subscriptions, pendingSubscriptions: this.pendingSubscriptions },
			channel,
			tickers,
			callback,
			this.connectionState,
			(ch, t) => this.sendSubscription(ch, t)
		);
	}

	unsubscribe(
		channel: KalshiWebSocketChannel,
		tickers: string[],
		callback?: KalshiWebSocketCallback
	): void {
		removeSubscription(
			{ subscriptions: this.subscriptions, pendingSubscriptions: this.pendingSubscriptions },
			channel,
			tickers,
			callback,
			(ch, t) => this.sendUnsubscribe(ch, t)
		);
	}

	onConnect(callback: () => void): void {
		this.onConnectCallbacks.add(callback);
	}

	onDisconnect(callback: (reason?: string) => void): void {
		this.onDisconnectCallbacks.add(callback);
	}

	onError(callback: (error: Error) => void): void {
		this.onErrorCallbacks.add(callback);
	}

	private sendSubscription(channel: string, tickers: string[]): void {
		if (!this.ws || this.connectionState !== "connected") {
			return;
		}
		const message = createSubscribeCommand(++this.messageId, channel, tickers);
		this.ws.send(JSON.stringify(message));
	}

	private sendUnsubscribe(channel: string, tickers: string[]): void {
		if (!this.ws || this.connectionState !== "connected") {
			return;
		}
		const message = createUnsubscribeCommand(++this.messageId, channel, tickers);
		this.ws.send(JSON.stringify(message));
	}

	private handleDisconnect(reason?: string): void {
		this.stopHeartbeat();
		this.connectionState = "disconnected";
		for (const cb of this.onDisconnectCallbacks) {
			cb(reason);
		}

		if (this.config.autoReconnect) {
			this.scheduleReconnect();
		}
	}

	private scheduleReconnect(): void {
		if (this.reconnectAttempts >= this.config.reconnect.maxRetries) {
			const error = new Error(
				`Max reconnection attempts (${this.config.reconnect.maxRetries}) reached`
			);
			for (const cb of this.onErrorCallbacks) {
				cb(error);
			}
			return;
		}

		const delay = Math.min(
			this.config.reconnect.initialDelayMs *
				this.config.reconnect.backoffMultiplier ** this.reconnectAttempts,
			this.config.reconnect.maxDelayMs
		);

		this.connectionState = "reconnecting";
		this.reconnectAttempts++;

		this.reconnectTimer = setTimeout(async () => {
			try {
				await this.connect();
			} catch {
				this.scheduleReconnect();
			}
		}, delay);
	}

	private stopReconnect(): void {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		this.reconnectAttempts = 0;
	}

	private resubscribe(): void {
		resubscribeAll(
			{ subscriptions: this.subscriptions, pendingSubscriptions: this.pendingSubscriptions },
			(ch, t) => this.sendSubscription(ch, t)
		);
	}

	private startHeartbeat(): void {
		this.heartbeatTimer = setInterval(() => {
			if (this.ws && this.connectionState === "connected") {
				this.ws.send("heartbeat");
			}
		}, HEARTBEAT_INTERVAL_MS);
	}

	private stopHeartbeat(): void {
		if (this.heartbeatTimer) {
			clearInterval(this.heartbeatTimer);
			this.heartbeatTimer = null;
		}
	}
}

export function createKalshiWebSocketClient(config?: KalshiWebSocketConfig): KalshiWebSocketClient {
	return new KalshiWebSocketClient(config);
}
