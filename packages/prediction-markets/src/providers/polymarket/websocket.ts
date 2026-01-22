/**
 * Polymarket WebSocket Client
 *
 * Real-time market data streaming from Polymarket prediction markets.
 * Supports orderbook updates, price changes, and last trade prices.
 *
 * @see https://docs.polymarket.com/developers/CLOB/websocket/market-channel
 */

import { z } from "zod";

export const POLYMARKET_WEBSOCKET_URL = "wss://ws-subscriptions-clob.polymarket.com/ws/market";

/** Heartbeat interval in milliseconds */
export const HEARTBEAT_INTERVAL_MS = 30000;

/** Default reconnection settings */
export const DEFAULT_RECONNECT_CONFIG = {
	initialDelayMs: 1000,
	maxDelayMs: 30000,
	backoffMultiplier: 2,
	maxRetries: 10,
};

// ============================================
// Message Schemas
// ============================================

export const OrderSummarySchema = z.object({
	price: z.string(),
	size: z.string(),
});

export const BookMessageSchema = z.object({
	event_type: z.literal("book"),
	asset_id: z.string(),
	market: z.string(),
	timestamp: z.string(),
	hash: z.string().optional(),
	bids: z.array(OrderSummarySchema).optional(),
	asks: z.array(OrderSummarySchema).optional(),
});
export type BookMessage = z.infer<typeof BookMessageSchema>;

export const PriceChangeSchema = z.object({
	asset_id: z.string(),
	price: z.string(),
	size: z.string(),
	side: z.enum(["BUY", "SELL"]),
	hash: z.string().optional(),
	best_bid: z.string().optional(),
	best_ask: z.string().optional(),
});

export const PriceChangeMessageSchema = z.object({
	event_type: z.literal("price_change"),
	market: z.string(),
	timestamp: z.string(),
	price_changes: z.array(PriceChangeSchema),
});
export type PriceChangeMessage = z.infer<typeof PriceChangeMessageSchema>;

export const LastTradePriceMessageSchema = z.object({
	event_type: z.literal("last_trade_price"),
	asset_id: z.string(),
	market: z.string(),
	price: z.string(),
	timestamp: z.string(),
});
export type LastTradePriceMessage = z.infer<typeof LastTradePriceMessageSchema>;

export type PolymarketWebSocketMessage = BookMessage | PriceChangeMessage | LastTradePriceMessage;

// ============================================
// Market State Cache
// ============================================

export interface CachedMarketState {
	assetId: string;
	conditionId: string;
	bestBid?: number;
	bestAsk?: number;
	lastPrice?: number;
	lastUpdated: Date;
	expiresAt: Date;
}

export class MarketStateCache {
	private cache: Map<string, CachedMarketState> = new Map();
	private readonly ttlMs: number;

	constructor(ttlMs = 5 * 60 * 1000) {
		this.ttlMs = ttlMs;
	}

	updateFromBook(msg: BookMessage): void {
		const now = new Date();
		const existing = this.cache.get(msg.asset_id) ?? {
			assetId: msg.asset_id,
			conditionId: msg.market,
			lastUpdated: now,
			expiresAt: new Date(now.getTime() + this.ttlMs),
		};

		const bestBid = msg.bids?.[0]?.price ? Number.parseFloat(msg.bids[0].price) : existing.bestBid;
		const bestAsk = msg.asks?.[0]?.price ? Number.parseFloat(msg.asks[0].price) : existing.bestAsk;

		this.cache.set(msg.asset_id, {
			...existing,
			bestBid,
			bestAsk,
			lastUpdated: now,
			expiresAt: new Date(now.getTime() + this.ttlMs),
		});
	}

	updateFromPriceChange(msg: PriceChangeMessage): void {
		const now = new Date();
		for (const change of msg.price_changes) {
			const existing = this.cache.get(change.asset_id) ?? {
				assetId: change.asset_id,
				conditionId: msg.market,
				lastUpdated: now,
				expiresAt: new Date(now.getTime() + this.ttlMs),
			};

			this.cache.set(change.asset_id, {
				...existing,
				bestBid: change.best_bid ? Number.parseFloat(change.best_bid) : existing.bestBid,
				bestAsk: change.best_ask ? Number.parseFloat(change.best_ask) : existing.bestAsk,
				lastUpdated: now,
				expiresAt: new Date(now.getTime() + this.ttlMs),
			});
		}
	}

	updateFromLastTradePrice(msg: LastTradePriceMessage): void {
		const now = new Date();
		const existing = this.cache.get(msg.asset_id) ?? {
			assetId: msg.asset_id,
			conditionId: msg.market,
			lastUpdated: now,
			expiresAt: new Date(now.getTime() + this.ttlMs),
		};

		this.cache.set(msg.asset_id, {
			...existing,
			lastPrice: Number.parseFloat(msg.price),
			lastUpdated: now,
			expiresAt: new Date(now.getTime() + this.ttlMs),
		});
	}

	get(assetId: string): CachedMarketState | undefined {
		const entry = this.cache.get(assetId);
		if (!entry) {
			return undefined;
		}
		if (entry.expiresAt < new Date()) {
			this.cache.delete(assetId);
			return undefined;
		}
		return entry;
	}

	getAll(): CachedMarketState[] {
		const now = new Date();
		const results: CachedMarketState[] = [];
		for (const [assetId, entry] of this.cache.entries()) {
			if (entry.expiresAt < now) {
				this.cache.delete(assetId);
			} else {
				results.push(entry);
			}
		}
		return results;
	}

	clear(): void {
		this.cache.clear();
	}
}

// ============================================
// WebSocket Client
// ============================================

export type PolymarketWebSocketCallback = (message: PolymarketWebSocketMessage) => void;
export type ConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting";

export interface PolymarketWebSocketConfig {
	/** Auto-reconnect on disconnect */
	autoReconnect?: boolean;
	/** Reconnection settings */
	reconnect?: {
		initialDelayMs?: number;
		maxDelayMs?: number;
		backoffMultiplier?: number;
		maxRetries?: number;
	};
	/** Cache TTL in milliseconds */
	cacheTtlMs?: number;
}

export class PolymarketWebSocketClient {
	private ws: WebSocket | null = null;
	private connectionState: ConnectionState = "disconnected";
	private reconnectAttempts = 0;
	private reconnectTimer: Timer | null = null;
	private heartbeatTimer: Timer | null = null;
	private readonly config: Required<Omit<PolymarketWebSocketConfig, "reconnect">> & {
		reconnect: Required<NonNullable<PolymarketWebSocketConfig["reconnect"]>>;
	};
	private readonly cache: MarketStateCache;

	// Subscription management
	private subscribedAssets: Set<string> = new Set();
	private pendingAssets: Set<string> = new Set();
	private callbacks: Set<PolymarketWebSocketCallback> = new Set();

	// Event listeners
	private onConnectCallbacks: Set<() => void> = new Set();
	private onDisconnectCallbacks: Set<(reason?: string) => void> = new Set();
	private onErrorCallbacks: Set<(error: Error) => void> = new Set();

	constructor(config: PolymarketWebSocketConfig = {}) {
		this.config = {
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

		const { promise, resolve, reject } = Promise.withResolvers<void>();
		try {
			this.ws = new WebSocket(POLYMARKET_WEBSOCKET_URL);

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
				this.handleMessage(event.data as string);
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

	/**
	 * Subscribe to market updates for specific asset IDs (token IDs)
	 */
	subscribe(assetIds: string[], callback: PolymarketWebSocketCallback): void {
		this.callbacks.add(callback);

		for (const assetId of assetIds) {
			if (this.subscribedAssets.has(assetId)) {
				continue;
			}

			if (this.connectionState === "connected" && this.ws) {
				this.sendSubscription([assetId]);
				this.subscribedAssets.add(assetId);
			} else {
				this.pendingAssets.add(assetId);
			}
		}
	}

	/**
	 * Unsubscribe from market updates
	 */
	unsubscribe(assetIds: string[], callback?: PolymarketWebSocketCallback): void {
		if (callback) {
			this.callbacks.delete(callback);
		}

		for (const assetId of assetIds) {
			this.subscribedAssets.delete(assetId);
			this.pendingAssets.delete(assetId);
		}
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

	private sendSubscription(assetIds: string[]): void {
		if (!this.ws || this.connectionState !== "connected") {
			return;
		}

		const message = {
			type: "market",
			assets_ids: assetIds,
		};

		this.ws.send(JSON.stringify(message));
	}

	private handleMessage(data: string): void {
		try {
			const parsed = JSON.parse(data);

			let message: PolymarketWebSocketMessage | null = null;

			if (parsed.event_type === "book") {
				const result = BookMessageSchema.safeParse(parsed);
				if (result.success) {
					this.cache.updateFromBook(result.data);
					message = result.data;
				}
			} else if (parsed.event_type === "price_change") {
				const result = PriceChangeMessageSchema.safeParse(parsed);
				if (result.success) {
					this.cache.updateFromPriceChange(result.data);
					message = result.data;
				}
			} else if (parsed.event_type === "last_trade_price") {
				const result = LastTradePriceMessageSchema.safeParse(parsed);
				if (result.success) {
					this.cache.updateFromLastTradePrice(result.data);
					message = result.data;
				}
			}

			if (message) {
				for (const cb of this.callbacks) {
					cb(message);
				}
			}
		} catch {
			// Ignore parse errors for ping/pong messages
		}
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
				`Max reconnection attempts (${this.config.reconnect.maxRetries}) reached`,
			);
			for (const cb of this.onErrorCallbacks) {
				cb(error);
			}
			return;
		}

		const delay = Math.min(
			this.config.reconnect.initialDelayMs *
				this.config.reconnect.backoffMultiplier ** this.reconnectAttempts,
			this.config.reconnect.maxDelayMs,
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
		// Subscribe to pending assets
		if (this.pendingAssets.size > 0) {
			this.sendSubscription([...this.pendingAssets]);
			for (const assetId of this.pendingAssets) {
				this.subscribedAssets.add(assetId);
			}
			this.pendingAssets.clear();
		}

		// Resubscribe to previously subscribed assets
		if (this.subscribedAssets.size > 0) {
			this.sendSubscription([...this.subscribedAssets]);
		}
	}

	private startHeartbeat(): void {
		this.heartbeatTimer = setInterval(() => {
			if (this.ws && this.connectionState === "connected") {
				// Polymarket uses ping/pong frames handled by the WebSocket protocol
				// We just need to keep the connection alive
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

export function createPolymarketWebSocketClient(
	config?: PolymarketWebSocketConfig,
): PolymarketWebSocketClient {
	return new PolymarketWebSocketClient(config);
}
