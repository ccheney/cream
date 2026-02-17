/**
 * Tests for WebSocket connection and reconnection
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import {
	createKalshiWebSocketClient,
	DEFAULT_RECONNECT_CONFIG,
	HEARTBEAT_INTERVAL_MS,
	KALSHI_DEMO_WEBSOCKET_URL,
	KALSHI_WEBSOCKET_URL,
	KalshiWebSocketClient,
} from "../index.js";
import {
	cleanupClients,
	createMockWebSocket,
	createMockWebSocketProxy,
	createTrackedClient,
	type MockWebSocketInstance,
	type MockWebSocketState,
} from "./fixtures.js";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function setupWebSocketHarness() {
	let originalWebSocket: typeof WebSocket;
	let mockState: MockWebSocketState;
	let mockWsProxy: MockWebSocketInstance;
	const testClients: KalshiWebSocketClient[] = [];

	beforeEach(() => {
		originalWebSocket = globalThis.WebSocket;
		mockState = { instance: null, send: mock(() => {}) };
		(globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket =
			createMockWebSocket(mockState);
		mockWsProxy = createMockWebSocketProxy(mockState);
		testClients.length = 0;
	});

	afterEach(() => {
		cleanupClients(testClients);
		globalThis.WebSocket = originalWebSocket;
	});

	return {
		getProxy: () => mockWsProxy,
		getTrackedClients: () => testClients,
	};
}

async function connectAndOpen(
	client: KalshiWebSocketClient,
	mockWsProxy: MockWebSocketInstance,
): Promise<void> {
	const connectPromise = client.connect();
	await wait(10);
	mockWsProxy.onopen?.(new Event("open"));
	await connectPromise;
}

describe("KalshiWebSocketClient initialization", () => {
	it("should initialize with default config", () => {
		const client = new KalshiWebSocketClient();
		expect(client.getConnectionState()).toBe("disconnected");
		expect(client.getCache()).toBeDefined();
	});

	it("should initialize with custom config", () => {
		const client = new KalshiWebSocketClient({
			demo: true,
			autoReconnect: false,
			cacheTtlMs: 60000,
			reconnect: { maxRetries: 5, initialDelayMs: 500 },
		});
		expect(client.getConnectionState()).toBe("disconnected");
	});

	it("should register event listeners", () => {
		const client = new KalshiWebSocketClient();
		let connectCalled = false;
		let disconnectCalled = false;
		let errorCalled = false;
		client.onConnect(() => {
			connectCalled = true;
		});
		client.onDisconnect(() => {
			disconnectCalled = true;
		});
		client.onError(() => {
			errorCalled = true;
		});
		expect(connectCalled).toBe(false);
		expect(disconnectCalled).toBe(false);
		expect(errorCalled).toBe(false);
	});
});

describe("Constants", () => {
	it("should have correct WebSocket URLs", () => {
		expect(KALSHI_WEBSOCKET_URL).toBe("wss://api.elections.kalshi.com/trade-api/ws/v2");
		expect(KALSHI_DEMO_WEBSOCKET_URL).toBe("wss://demo-api.kalshi.co/trade-api/ws/v2");
	});

	it("should have correct heartbeat interval", () => {
		expect(HEARTBEAT_INTERVAL_MS).toBe(10000);
	});

	it("should have correct default reconnect config", () => {
		expect(DEFAULT_RECONNECT_CONFIG.initialDelayMs).toBe(1000);
		expect(DEFAULT_RECONNECT_CONFIG.maxDelayMs).toBe(30000);
		expect(DEFAULT_RECONNECT_CONFIG.backoffMultiplier).toBe(2);
		expect(DEFAULT_RECONNECT_CONFIG.maxRetries).toBe(10);
	});
});

describe("createKalshiWebSocketClient", () => {
	it("should create a client with default config", () => {
		const client = createKalshiWebSocketClient();
		expect(client).toBeInstanceOf(KalshiWebSocketClient);
		expect(client.getConnectionState()).toBe("disconnected");
	});

	it("should create a client with custom config", () => {
		const client = createKalshiWebSocketClient({ demo: true, autoReconnect: false });
		expect(client).toBeInstanceOf(KalshiWebSocketClient);
	});
});

describe("KalshiWebSocketClient connect state", () => {
	const harness = setupWebSocketHarness();

	it("should transition to connected state on successful connection", async () => {
		const client = new KalshiWebSocketClient();
		await connectAndOpen(client, harness.getProxy());
		expect(client.getConnectionState()).toBe("connected");
	});

	it("should not connect if already connected", async () => {
		const client = new KalshiWebSocketClient();
		await connectAndOpen(client, harness.getProxy());
		await client.connect();
		expect(client.getConnectionState()).toBe("connected");
	});
});

describe("KalshiWebSocketClient connect callbacks", () => {
	const harness = setupWebSocketHarness();

	it("should call onConnect callbacks", async () => {
		const client = new KalshiWebSocketClient();
		const onConnectCb = mock(() => {});
		client.onConnect(onConnectCb);
		await connectAndOpen(client, harness.getProxy());
		expect(onConnectCb).toHaveBeenCalled();
	});

	it("should call onError callbacks on connection error", async () => {
		const client = new KalshiWebSocketClient();
		const onErrorCb = mock(() => {});
		client.onError(onErrorCb);
		const connectPromise = client.connect();
		await wait(10);
		harness.getProxy().onerror?.(new Event("error"));
		await expect(connectPromise).rejects.toThrow();
		expect(onErrorCb).toHaveBeenCalled();
	});
});

describe("KalshiWebSocketClient disconnect", () => {
	const harness = setupWebSocketHarness();

	it("should transition to disconnected state", async () => {
		const client = new KalshiWebSocketClient({ autoReconnect: false });
		await connectAndOpen(client, harness.getProxy());
		client.disconnect();
		expect(client.getConnectionState()).toBe("disconnected");
	});

	it("should call onDisconnect callbacks", async () => {
		const client = new KalshiWebSocketClient({ autoReconnect: false });
		const onDisconnectCb = mock(() => {});
		client.onDisconnect(onDisconnectCb);
		await connectAndOpen(client, harness.getProxy());
		harness.getProxy().onclose?.({ reason: "Client disconnect" } as CloseEvent);
		expect(onDisconnectCb).toHaveBeenCalled();
	});
});

describe("KalshiWebSocketClient reconnection behavior", () => {
	const harness = setupWebSocketHarness();

	it("should auto-reconnect on disconnect when enabled", async () => {
		const client = createTrackedClient(harness.getTrackedClients(), {
			autoReconnect: true,
			reconnect: { initialDelayMs: 10, maxRetries: 2 },
		});
		await connectAndOpen(client, harness.getProxy());
		harness.getProxy().onclose?.({ reason: "Connection lost" } as CloseEvent);
		expect(client.getConnectionState()).toBe("reconnecting");
	});

	it("should not auto-reconnect when disabled", async () => {
		const client = createTrackedClient(harness.getTrackedClients(), { autoReconnect: false });
		await connectAndOpen(client, harness.getProxy());
		harness.getProxy().onclose?.({ reason: "Connection lost" } as CloseEvent);
		expect(client.getConnectionState()).toBe("disconnected");
	});
});

describe("KalshiWebSocketClient reconnection errors", () => {
	const harness = setupWebSocketHarness();

	it("should call onError when max retries exceeded", async () => {
		const client = createTrackedClient(harness.getTrackedClients(), {
			autoReconnect: true,
			reconnect: { initialDelayMs: 1, maxRetries: 0 },
		});
		const onErrorCb = mock(() => {});
		client.onError(onErrorCb);
		await connectAndOpen(client, harness.getProxy());
		harness.getProxy().onclose?.({ reason: "Connection lost" } as CloseEvent);
		await wait(100);
		expect(onErrorCb).toHaveBeenCalled();
	});
});
