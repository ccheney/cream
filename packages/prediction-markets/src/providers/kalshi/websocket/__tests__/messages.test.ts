/**
 * Tests for WebSocket message handling
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { KalshiWebSocketClient } from "../index.js";
import {
	cleanupClients,
	connectClient,
	createMarketLifecycleMessage,
	createMockWebSocket,
	createMockWebSocketProxy,
	createOrderbookDeltaMessage,
	createTickerMessage,
	createTradeMessage,
	type MockWebSocketInstance,
	type MockWebSocketState,
} from "./fixtures.js";

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
	};
}

async function createConnectedClient(
	mockWsProxy: MockWebSocketInstance,
): Promise<KalshiWebSocketClient> {
	const client = new KalshiWebSocketClient();
	await connectClient(client, mockWsProxy);
	return client;
}

function emitMessage(mockWsProxy: MockWebSocketInstance, message: unknown): void {
	mockWsProxy.onmessage?.({ data: JSON.stringify(message) } as MessageEvent);
}

describe("KalshiWebSocketClient message handling ticker", () => {
	const harness = setupWebSocketHarness();

	it("should handle ticker messages and update cache", async () => {
		const client = await createConnectedClient(harness.getProxy());
		client.subscribe(
			"ticker",
			["KXFED-26JAN29"],
			mock(() => {}),
		);
		emitMessage(harness.getProxy(), createTickerMessage("KXFED-26JAN29"));
		const state = client.getCache().get("KXFED-26JAN29");
		expect(state?.yesBid).toBe(55);
		expect(state?.yesAsk).toBe(57);
		expect(state?.lastPrice).toBe(56);
	});

	it("should notify subscribers on ticker message", async () => {
		const client = await createConnectedClient(harness.getProxy());
		const callback = mock(() => {});
		client.subscribe("ticker", ["KXFED-26JAN29"], callback);
		emitMessage(harness.getProxy(), createTickerMessage("KXFED-26JAN29"));
		expect(callback).toHaveBeenCalled();
	});
});

describe("KalshiWebSocketClient message handling other channels", () => {
	const harness = setupWebSocketHarness();

	it("should handle orderbook delta messages", async () => {
		const client = await createConnectedClient(harness.getProxy());
		const callback = mock(() => {});
		client.subscribe("orderbook_delta", ["KXFED-26JAN29"], callback);
		emitMessage(harness.getProxy(), createOrderbookDeltaMessage("KXFED-26JAN29"));
		expect(callback).toHaveBeenCalled();
	});

	it("should handle trade messages", async () => {
		const client = await createConnectedClient(harness.getProxy());
		const callback = mock(() => {});
		client.subscribe("trade", [], callback);
		emitMessage(harness.getProxy(), createTradeMessage("KXFED-26JAN29"));
		expect(callback).toHaveBeenCalled();
	});

	it("should handle market lifecycle messages", async () => {
		const client = await createConnectedClient(harness.getProxy());
		const callback = mock(() => {});
		client.subscribe("market_lifecycle_v2", ["KXFED-26JAN29"], callback);
		emitMessage(harness.getProxy(), createMarketLifecycleMessage("KXFED-26JAN29", "closed"));
		expect(callback).toHaveBeenCalled();
	});
});

describe("KalshiWebSocketClient message validation", () => {
	const harness = setupWebSocketHarness();

	it("should ignore invalid JSON messages", async () => {
		const client = await createConnectedClient(harness.getProxy());
		harness.getProxy().onmessage?.({ data: "not valid json" } as MessageEvent);
		expect(client.getConnectionState()).toBe("connected");
	});

	it("should ignore invalid message types", async () => {
		const client = await createConnectedClient(harness.getProxy());
		const callback = mock(() => {});
		client.subscribe("ticker", ["KXFED-26JAN29"], callback);
		emitMessage(harness.getProxy(), { type: "unknown", msg: {} });
		expect(callback).not.toHaveBeenCalled();
	});
});
