/**
 * Shared fixtures and helpers for Kalshi WebSocket tests
 */

import { mock } from "bun:test";
import { KalshiWebSocketClient } from "../index.js";

/**
 * Mock WebSocket instance that tracks handlers and provides test utilities
 */
export interface MockWebSocketInstance {
	onopen: ((ev: Event) => void) | null;
	onclose: ((ev: CloseEvent) => void) | null;
	onerror: ((ev: Event) => void) | null;
	onmessage: ((ev: MessageEvent) => void) | null;
	readyState: number;
	send: ReturnType<typeof mock>;
	close: ReturnType<typeof mock>;
}

/**
 * State container for mock WebSocket
 */
export interface MockWebSocketState {
	instance: MockWebSocketInstance | null;
	send: ReturnType<typeof mock>;
}

/**
 * Creates a mock WebSocket class for testing
 */
export function createMockWebSocket(state: MockWebSocketState): typeof WebSocket {
	state.send = mock(() => {});
	state.instance = null;

	class MockWebSocket {
		onopen: ((ev: Event) => void) | null = null;
		onclose: ((ev: CloseEvent) => void) | null = null;
		onerror: ((ev: Event) => void) | null = null;
		onmessage: ((ev: MessageEvent) => void) | null = null;
		readyState = 0;
		send = state.send;
		close = mock(() => {});

		constructor(_url: string) {
			state.instance = this;
		}
	}

	return MockWebSocket as unknown as typeof WebSocket;
}

/**
 * Creates a proxy that forwards to the current mock WebSocket instance
 */
export function createMockWebSocketProxy(state: MockWebSocketState): MockWebSocketInstance {
	return {
		get onopen() {
			return state.instance?.onopen ?? null;
		},
		set onopen(val) {
			if (state.instance) {
				state.instance.onopen = val;
			}
		},
		get onclose() {
			return state.instance?.onclose ?? null;
		},
		set onclose(val) {
			if (state.instance) {
				state.instance.onclose = val;
			}
		},
		get onerror() {
			return state.instance?.onerror ?? null;
		},
		set onerror(val) {
			if (state.instance) {
				state.instance.onerror = val;
			}
		},
		get onmessage() {
			return state.instance?.onmessage ?? null;
		},
		set onmessage(val) {
			if (state.instance) {
				state.instance.onmessage = val;
			}
		},
		send: state.send,
		close: mock(() => {}),
		readyState: 0,
	};
}

/**
 * Helper to create clients and track them for cleanup
 */
export function createTrackedClient(
	clients: KalshiWebSocketClient[],
	config?: ConstructorParameters<typeof KalshiWebSocketClient>[0],
): KalshiWebSocketClient {
	const client = new KalshiWebSocketClient(config);
	clients.push(client);
	return client;
}

/**
 * Cleanup all tracked clients
 */
export function cleanupClients(clients: KalshiWebSocketClient[]): void {
	for (const client of clients) {
		client.disconnect();
	}
	clients.length = 0;
}

/**
 * Helper to connect a client with mock WebSocket
 */
export async function connectClient(
	client: KalshiWebSocketClient,
	mockWs: MockWebSocketInstance,
): Promise<void> {
	const connectPromise = client.connect();
	await new Promise((resolve) => setTimeout(resolve, 10));
	if (mockWs.onopen) {
		mockWs.onopen(new Event("open"));
	}
	await connectPromise;
}

/**
 * Sample ticker message for tests
 */
export function createTickerMessage(
	ticker: string,
	overrides: Record<string, unknown> = {},
): { type: string; msg: Record<string, unknown> } {
	return {
		type: "ticker",
		msg: {
			market_ticker: ticker,
			yes_bid: 55,
			yes_ask: 57,
			last_price: 56,
			timestamp: new Date().toISOString(),
			...overrides,
		},
	};
}

/**
 * Sample orderbook delta message for tests
 */
export function createOrderbookDeltaMessage(
	ticker: string,
	overrides: Record<string, unknown> = {},
): { type: string; msg: Record<string, unknown> } {
	return {
		type: "orderbook_delta",
		msg: {
			market_ticker: ticker,
			side: "yes",
			price: 55,
			delta: 100,
			timestamp: new Date().toISOString(),
			...overrides,
		},
	};
}

/**
 * Sample trade message for tests
 */
export function createTradeMessage(
	ticker: string,
	overrides: Record<string, unknown> = {},
): { type: string; msg: Record<string, unknown> } {
	return {
		type: "trade",
		msg: {
			trade_id: "trade123",
			market_ticker: ticker,
			side: "yes",
			count: 10,
			yes_price: 56,
			no_price: 44,
			timestamp: new Date().toISOString(),
			...overrides,
		},
	};
}

/**
 * Sample market lifecycle message for tests
 */
export function createMarketLifecycleMessage(
	ticker: string,
	status: string,
): { type: string; msg: Record<string, unknown> } {
	return {
		type: "market_lifecycle_v2",
		msg: {
			market_ticker: ticker,
			status,
			timestamp: new Date().toISOString(),
		},
	};
}
