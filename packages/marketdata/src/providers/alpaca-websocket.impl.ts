import { encode as msgpackEncode } from "@msgpack/msgpack";

import { parseWsMessage } from "./alpaca-websocket.handlers";
import { parseIncomingMessages } from "./alpaca-websocket.parsing";

export * from "./alpaca-websocket.schemas";

import {
	ALPACA_WS_ENDPOINTS,
	AlpacaConnectionState,
	type AlpacaWebSocketConfig,
	type AlpacaWsData,
	type AlpacaWsEvent,
	type AlpacaWsEventHandler,
} from "./alpaca-websocket.schemas";

// ============================================
// WebSocket Client
// ============================================

export class AlpacaWebSocketClient {
	private config: Required<AlpacaWebSocketConfig>;
	private ws: WebSocket | null = null;
	private state: AlpacaConnectionState = AlpacaConnectionState.DISCONNECTED;
	private eventHandlers: AlpacaWsEventHandler[] = [];
	private activeSubscriptions: {
		trades: Set<string>;
		quotes: Set<string>;
		bars: Set<string>;
		dailyBars: Set<string>;
		updatedBars: Set<string>;
		statuses: Set<string>;
		news: Set<string>;
	} = {
		trades: new Set(),
		quotes: new Set(),
		bars: new Set(),
		dailyBars: new Set(),
		updatedBars: new Set(),
		statuses: new Set(),
		news: new Set(),
	};
	private reconnectAttempts = 0;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private pingTimer: ReturnType<typeof setInterval> | null = null;
	private lastPongTime = 0;

	constructor(config: AlpacaWebSocketConfig) {
		this.config = {
			apiKey: config.apiKey,
			apiSecret: config.apiSecret,
			market: config.market ?? "stocks",
			feed: config.feed ?? "sip",
			autoReconnect: config.autoReconnect ?? true,
			maxReconnectAttempts: config.maxReconnectAttempts ?? 10,
			reconnectDelayMs: config.reconnectDelayMs ?? 1000,
			pingIntervalS: config.pingIntervalS ?? 30,
		};
	}

	private usesMsgpack(): boolean {
		return this.config.market === "options";
	}

	getState(): AlpacaConnectionState {
		return this.state;
	}

	isConnected(): boolean {
		return this.state === AlpacaConnectionState.AUTHENTICATED;
	}

	getSubscriptions(): {
		trades: string[];
		quotes: string[];
		bars: string[];
		dailyBars: string[];
		updatedBars: string[];
		statuses: string[];
		news: string[];
	} {
		return {
			trades: Array.from(this.activeSubscriptions.trades),
			quotes: Array.from(this.activeSubscriptions.quotes),
			bars: Array.from(this.activeSubscriptions.bars),
			dailyBars: Array.from(this.activeSubscriptions.dailyBars),
			updatedBars: Array.from(this.activeSubscriptions.updatedBars),
			statuses: Array.from(this.activeSubscriptions.statuses),
			news: Array.from(this.activeSubscriptions.news),
		};
	}

	private getEndpoint(): string {
		if (this.config.market === "stocks") {
			return ALPACA_WS_ENDPOINTS.stocks[this.config.feed];
		}
		if (this.config.market === "options") {
			return ALPACA_WS_ENDPOINTS.options.opra;
		}
		if (this.config.market === "news") {
			return ALPACA_WS_ENDPOINTS.news.default;
		}
		return ALPACA_WS_ENDPOINTS.crypto.us;
	}

	on(handler: AlpacaWsEventHandler): void {
		this.eventHandlers.push(handler);
	}

	off(handler: AlpacaWsEventHandler): void {
		this.eventHandlers = this.eventHandlers.filter((h) => h !== handler);
	}

	private emit(event: AlpacaWsEvent): void {
		for (const handler of this.eventHandlers) {
			try {
				void handler(event);
			} catch {
				// Handler errors must not crash the WebSocket client
			}
		}
	}

	async connect(): Promise<void> {
		if (this.state !== AlpacaConnectionState.DISCONNECTED) {
			throw new Error(`Cannot connect in state: ${this.state}`);
		}

		this.state = AlpacaConnectionState.CONNECTING;
		const endpoint = this.getEndpoint();

		const { promise, resolve, reject } = Promise.withResolvers<void>();
		try {
			this.ws = new WebSocket(endpoint);
			// Ensure binary data comes as ArrayBuffer (not Buffer) for consistent handling
			this.ws.binaryType = "arraybuffer";

			this.ws.addEventListener("open", () => {
				this.state = AlpacaConnectionState.CONNECTED;
			});

			this.ws.addEventListener("message", (event: MessageEvent) => {
				this.handleMessage(event.data, resolve);
			});

			this.ws.addEventListener("error", () => {
				const error = new Error("WebSocket connection error");
				this.handleError(error);
				if (this.state === AlpacaConnectionState.CONNECTING) {
					reject(error);
				}
			});

			this.ws.addEventListener("close", (event: CloseEvent) => {
				this.handleClose(event.code, event.reason);
			});

			// Note: Bun native WebSocket handles protocol-level ping/pong automatically
			// The lastPongTime tracking is maintained via message activity
			this.lastPongTime = Date.now();
		} catch (error) {
			this.state = AlpacaConnectionState.ERROR;
			reject(error as Error);
		}
		return promise;
	}

	private authenticate(): void {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			throw new Error("WebSocket not ready for authentication");
		}

		this.state = AlpacaConnectionState.AUTHENTICATING;
		this.send({
			action: "auth",
			key: this.config.apiKey,
			secret: this.config.apiSecret,
		});
	}

	subscribe(
		channel: "trades" | "quotes" | "bars" | "dailyBars" | "updatedBars" | "statuses" | "news",
		symbols: string[],
	): void {
		if (!this.isConnected()) {
			throw new Error("Not authenticated. Call connect() first.");
		}

		// Validate: options quotes don't support wildcards
		if (this.config.market === "options" && channel === "quotes" && symbols.includes("*")) {
			throw new Error("Options quotes do not support wildcard (*) subscriptions");
		}

		this.send({
			action: "subscribe",
			[channel]: symbols,
		});

		for (const symbol of symbols) {
			this.activeSubscriptions[channel].add(symbol);
		}
	}

	unsubscribe(
		channel: "trades" | "quotes" | "bars" | "dailyBars" | "updatedBars" | "statuses" | "news",
		symbols: string[],
	): void {
		if (!this.isConnected()) {
			throw new Error("Not authenticated");
		}

		this.send({
			action: "unsubscribe",
			[channel]: symbols,
		});

		for (const symbol of symbols) {
			this.activeSubscriptions[channel].delete(symbol);
		}
	}

	disconnect(): void {
		this.clearTimers();

		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}

		this.state = AlpacaConnectionState.DISCONNECTED;
		this.reconnectAttempts = 0;
	}

	private send(message: Record<string, unknown>): void {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			throw new Error("WebSocket not ready");
		}

		if (this.usesMsgpack()) {
			// Options stream: send messages as msgpack binary
			const encoded = msgpackEncode(message);
			this.ws.send(encoded);
		} else {
			// Other streams: send as JSON
			this.ws.send(JSON.stringify(message));
		}
	}

	private parseMessage(data: AlpacaWsData): unknown[] {
		return parseIncomingMessages(data, this.usesMsgpack());
	}

	private processMessage(
		msgObj: Record<string, unknown>,
		connectResolve?: (value: undefined) => void,
	): void {
		const parsed = parseWsMessage(msgObj);
		if (!parsed) {
			return;
		}
		if (parsed.kind === "connected") {
			this.emit({ type: "connected" });
			this.authenticate();
			return;
		}
		if (parsed.kind === "authenticated") {
			this.state = AlpacaConnectionState.AUTHENTICATED;
			this.emit({ type: "authenticated" });
			this.startPing();
			this.reconnectAttempts = 0;
			this.resubscribe();
			connectResolve?.(undefined);
			return;
		}
		this.emit(parsed.event);
		if (parsed.event.type === "error" && [401, 402, 403, 404].includes(parsed.event.code)) {
			this.state = AlpacaConnectionState.ERROR;
		}
	}

	private handleMessage(data: AlpacaWsData, connectResolve?: (value: undefined) => void): void {
		this.lastPongTime = Date.now();
		try {
			const messages = this.parseMessage(data);
			for (const msg of messages) {
				if (typeof msg !== "object" || msg === null) {
					continue;
				}
				this.processMessage(msg as Record<string, unknown>, connectResolve);
			}
		} catch (error) {
			this.emit({
				type: "error",
				code: 500,
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}

	private resubscribe(): void {
		const trades = Array.from(this.activeSubscriptions.trades);
		const quotes = Array.from(this.activeSubscriptions.quotes);
		const bars = Array.from(this.activeSubscriptions.bars);
		const dailyBars = Array.from(this.activeSubscriptions.dailyBars);
		const updatedBars = Array.from(this.activeSubscriptions.updatedBars);
		const statuses = Array.from(this.activeSubscriptions.statuses);
		const news = Array.from(this.activeSubscriptions.news);

		const subscriptionMsg: Record<string, unknown> = { action: "subscribe" };

		if (trades.length > 0) {
			subscriptionMsg.trades = trades;
		}
		if (quotes.length > 0) {
			subscriptionMsg.quotes = quotes;
		}
		if (bars.length > 0) {
			subscriptionMsg.bars = bars;
		}
		if (dailyBars.length > 0) {
			subscriptionMsg.dailyBars = dailyBars;
		}
		if (updatedBars.length > 0) {
			subscriptionMsg.updatedBars = updatedBars;
		}
		if (statuses.length > 0) {
			subscriptionMsg.statuses = statuses;
		}
		if (news.length > 0) {
			subscriptionMsg.news = news;
		}

		// Only send if there are subscriptions
		if (Object.keys(subscriptionMsg).length > 1) {
			this.send(subscriptionMsg);
		}
	}

	private handleError(error: Error): void {
		this.state = AlpacaConnectionState.ERROR;
		this.emit({
			type: "error",
			code: 500,
			message: error.message,
		});
	}

	private handleClose(code: number, reason: string): void {
		this.clearTimers();
		this.ws = null;

		const message = reason || `Connection closed with code ${code}`;
		this.emit({ type: "disconnected", reason: message });

		if (this.config.autoReconnect && this.reconnectAttempts < this.config.maxReconnectAttempts) {
			this.scheduleReconnect();
		} else {
			this.state = AlpacaConnectionState.DISCONNECTED;
		}
	}

	private scheduleReconnect(): void {
		this.reconnectAttempts++;
		// Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s, 64s (max)
		const delay = Math.min(this.config.reconnectDelayMs * 2 ** (this.reconnectAttempts - 1), 64000);

		this.emit({ type: "reconnecting", attempt: this.reconnectAttempts });

		this.reconnectTimer = setTimeout(() => {
			this.state = AlpacaConnectionState.DISCONNECTED;
			this.connect().catch(() => {
				if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
					this.scheduleReconnect();
				} else {
					this.state = AlpacaConnectionState.DISCONNECTED;
					this.emit({
						type: "error",
						code: 500,
						message: "Max reconnection attempts reached",
					});
				}
			});
		}, delay);
	}

	private startPing(): void {
		this.lastPongTime = Date.now();

		this.pingTimer = setInterval(() => {
			if (this.ws && this.ws.readyState === WebSocket.OPEN) {
				const timeSinceLastActivity = Date.now() - this.lastPongTime;

				// Send keepalive if no activity for half the ping interval
				// This keeps the connection alive before server timeout
				if (timeSinceLastActivity > (this.config.pingIntervalS * 1000) / 2) {
					this.sendKeepalive();
				}

				// Close connection if no activity for 2x ping interval
				// (indicates server is not responding)
				if (timeSinceLastActivity > this.config.pingIntervalS * 2 * 1000) {
					this.ws.close();
				}
			}
		}, this.config.pingIntervalS * 1000);
	}

	private sendKeepalive(): void {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			return;
		}

		// Build subscription message from active subscriptions
		const trades = Array.from(this.activeSubscriptions.trades);
		const quotes = Array.from(this.activeSubscriptions.quotes);

		// Only send if we have active subscriptions
		if (trades.length === 0 && quotes.length === 0) {
			return;
		}

		const subscriptionMsg: Record<string, unknown> = { action: "subscribe" };
		if (trades.length > 0) {
			subscriptionMsg.trades = trades;
		}
		if (quotes.length > 0) {
			subscriptionMsg.quotes = quotes;
		}

		try {
			this.send(subscriptionMsg);
		} catch {
			// Ignore send failures - connection will be detected as stale
		}
	}

	private clearTimers(): void {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}

		if (this.pingTimer) {
			clearInterval(this.pingTimer);
			this.pingTimer = null;
		}
	}
}
