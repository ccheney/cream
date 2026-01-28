/**
 * Unified Prediction Markets Streaming Service
 *
 * Combines real-time streaming from Kalshi and Polymarket into a unified
 * event stream with automatic reconnection and database persistence.
 */

import type { PredictionMarketsConfig } from "@cream/config";
import {
	createKalshiWebSocketClient,
	type KalshiWebSocketClient,
	type KalshiWebSocketMessage,
} from "../providers/kalshi/websocket";
import {
	createPolymarketWebSocketClient,
	type PolymarketWebSocketClient,
	type PolymarketWebSocketMessage,
} from "../providers/polymarket/websocket";

// ============================================
// Types
// ============================================

export type Platform = "KALSHI" | "POLYMARKET";

export interface StreamingMarketUpdate {
	platform: Platform;
	ticker: string;
	timestamp: Date;
	bestBid?: number;
	bestAsk?: number;
	lastPrice?: number;
	volume?: number;
}

export interface StreamingConfig {
	/** Kalshi API key ID */
	kalshiApiKeyId?: string;
	/** Kalshi private key path */
	kalshiPrivateKeyPath?: string;
	/** Kalshi private key PEM */
	kalshiPrivateKeyPem?: string;
	/** Use Kalshi demo environment */
	kalshiDemo?: boolean;
	/** Enable Kalshi streaming */
	kalshiEnabled?: boolean;
	/** Enable Polymarket streaming */
	polymarketEnabled?: boolean;
	/** Market tickers to subscribe to (Kalshi) */
	kalshiTickers?: string[];
	/** Asset IDs to subscribe to (Polymarket) */
	polymarketAssetIds?: string[];
	/** Auto-reconnect on disconnect */
	autoReconnect?: boolean;
}

export type StreamingCallback = (update: StreamingMarketUpdate) => void;

// ============================================
// Unified Streaming Service
// ============================================

export class UnifiedStreamingService {
	private kalshiClient: KalshiWebSocketClient | null = null;
	private polymarketClient: PolymarketWebSocketClient | null = null;
	private readonly config: StreamingConfig;
	private callbacks: Set<StreamingCallback> = new Set();
	private isRunning = false;

	constructor(config: StreamingConfig) {
		this.config = config;
	}

	/**
	 * Start streaming from all enabled platforms
	 */
	async start(): Promise<void> {
		if (this.isRunning) {
			return;
		}
		this.isRunning = true;

		const promises: Promise<void>[] = [];

		// Start Kalshi streaming
		if (this.config.kalshiEnabled) {
			let privateKeyPem = this.config.kalshiPrivateKeyPem;
			if (!privateKeyPem && this.config.kalshiPrivateKeyPath) {
				privateKeyPem = await Bun.file(this.config.kalshiPrivateKeyPath).text();
			}

			this.kalshiClient = createKalshiWebSocketClient({
				apiKeyId: this.config.kalshiApiKeyId,
				privateKeyPem,
				demo: this.config.kalshiDemo,
				autoReconnect: this.config.autoReconnect ?? true,
			});

			this.kalshiClient.onConnect(() => {
				// Subscribe to tickers
				if (this.config.kalshiTickers?.length) {
					this.kalshiClient?.subscribe("ticker", this.config.kalshiTickers, (msg) => {
						this.handleKalshiMessage(msg);
					});
				}
			});

			this.kalshiClient.onDisconnect((_reason) => {});

			this.kalshiClient.onError((_error) => {});

			promises.push(this.kalshiClient.connect());
		}

		// Start Polymarket streaming
		if (this.config.polymarketEnabled) {
			this.polymarketClient = createPolymarketWebSocketClient({
				autoReconnect: this.config.autoReconnect ?? true,
			});

			this.polymarketClient.onConnect(() => {
				// Subscribe to asset IDs
				if (this.config.polymarketAssetIds?.length) {
					this.polymarketClient?.subscribe(this.config.polymarketAssetIds, (msg) => {
						this.handlePolymarketMessage(msg);
					});
				}
			});

			this.polymarketClient.onDisconnect((_reason) => {});

			this.polymarketClient.onError((_error) => {});

			promises.push(this.polymarketClient.connect());
		}

		await Promise.all(promises);
	}

	/**
	 * Stop all streaming connections
	 */
	stop(): void {
		this.isRunning = false;
		this.kalshiClient?.disconnect();
		this.polymarketClient?.disconnect();
		this.kalshiClient = null;
		this.polymarketClient = null;
	}

	/**
	 * Subscribe to streaming updates
	 */
	onUpdate(callback: StreamingCallback): void {
		this.callbacks.add(callback);
	}

	/**
	 * Unsubscribe from streaming updates
	 */
	offUpdate(callback: StreamingCallback): void {
		this.callbacks.delete(callback);
	}

	/**
	 * Add Kalshi tickers to subscription
	 */
	subscribeKalshiTickers(tickers: string[]): void {
		if (this.kalshiClient) {
			this.kalshiClient.subscribe("ticker", tickers, (msg) => {
				this.handleKalshiMessage(msg);
			});
		}
	}

	/**
	 * Add Polymarket asset IDs to subscription
	 */
	subscribePolymarketAssets(assetIds: string[]): void {
		if (this.polymarketClient) {
			this.polymarketClient.subscribe(assetIds, (msg) => {
				this.handlePolymarketMessage(msg);
			});
		}
	}

	/**
	 * Get current connection status
	 */
	getStatus(): { kalshi: string; polymarket: string } {
		return {
			kalshi: this.kalshiClient?.getConnectionState() ?? "disabled",
			polymarket: this.polymarketClient?.getConnectionState() ?? "disabled",
		};
	}

	private handleKalshiMessage(msg: KalshiWebSocketMessage): void {
		if (msg.type !== "ticker") {
			return;
		}

		const update: StreamingMarketUpdate = {
			platform: "KALSHI",
			ticker: msg.msg.market_ticker,
			timestamp: new Date(msg.msg.timestamp),
			bestBid: msg.msg.yes_bid,
			bestAsk: msg.msg.yes_ask,
			lastPrice: msg.msg.last_price,
			volume: msg.msg.volume,
		};

		this.emit(update);
	}

	private handlePolymarketMessage(msg: PolymarketWebSocketMessage): void {
		if (msg.event_type === "book") {
			const bestBid = msg.bids?.[0]?.price ? Number.parseFloat(msg.bids[0].price) : undefined;
			const bestAsk = msg.asks?.[0]?.price ? Number.parseFloat(msg.asks[0].price) : undefined;

			const update: StreamingMarketUpdate = {
				platform: "POLYMARKET",
				ticker: msg.asset_id,
				timestamp: new Date(Number.parseInt(msg.timestamp, 10)),
				bestBid,
				bestAsk,
			};

			this.emit(update);
		} else if (msg.event_type === "price_change") {
			for (const change of msg.price_changes) {
				const update: StreamingMarketUpdate = {
					platform: "POLYMARKET",
					ticker: change.asset_id,
					timestamp: new Date(Number.parseInt(msg.timestamp, 10)),
					bestBid: change.best_bid ? Number.parseFloat(change.best_bid) : undefined,
					bestAsk: change.best_ask ? Number.parseFloat(change.best_ask) : undefined,
				};

				this.emit(update);
			}
		} else if (msg.event_type === "last_trade_price") {
			const update: StreamingMarketUpdate = {
				platform: "POLYMARKET",
				ticker: msg.asset_id,
				timestamp: new Date(Number.parseInt(msg.timestamp, 10)),
				lastPrice: Number.parseFloat(msg.price),
			};

			this.emit(update);
		}
	}

	private emit(update: StreamingMarketUpdate): void {
		for (const callback of this.callbacks) {
			try {
				callback(update);
			} catch (_error) {}
		}
	}
}

/**
 * Create a unified streaming service from config
 */
export function createUnifiedStreamingService(config: StreamingConfig): UnifiedStreamingService {
	return new UnifiedStreamingService(config);
}

/**
 * Create streaming service from prediction markets config
 */
export function createStreamingServiceFromConfig(
	config: PredictionMarketsConfig,
	options?: {
		kalshiTickers?: string[];
		polymarketAssetIds?: string[];
	},
): UnifiedStreamingService {
	return new UnifiedStreamingService({
		kalshiEnabled: config.kalshi.enabled,
		kalshiApiKeyId: config.kalshi.api_key_id,
		kalshiPrivateKeyPath: config.kalshi.private_key_path,
		kalshiDemo: false,
		polymarketEnabled: config.polymarket.enabled,
		kalshiTickers: options?.kalshiTickers ?? [],
		polymarketAssetIds: options?.polymarketAssetIds ?? [],
		autoReconnect: true,
	});
}
