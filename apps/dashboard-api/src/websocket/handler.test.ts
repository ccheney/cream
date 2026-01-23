/**
 * WebSocket Handler Tests
 *
 * Tests for connection management, message routing, and broadcasting.
 *
 * @see docs/plans/ui/06-websocket.md
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { requireArrayItem } from "@cream/test-utils";
import {
	broadcast,
	broadcastAll,
	broadcastQuote,
	type ConnectionMetadata,
	closeAllConnections,
	closeStaleConnections,
	createConnectionMetadata,
	getConnectionCount,
	getConnectionIds,
	handleClose,
	handleMessage,
	handleOpen,
	sendError,
	sendMessage,
	startHeartbeat,
	stopHeartbeat,
	type WebSocketWithMetadata,
} from "./handler.js";

// ============================================
// Mock WebSocket
// ============================================

interface MockWebSocket {
	data: ConnectionMetadata;
	sentMessages: string[];
	closed: boolean;
	closeCode?: number;
	closeReason?: string;
	send: (message: string) => void;
	close: (code?: number, reason?: string) => void;
}

function createMockWebSocket(metadata?: Partial<ConnectionMetadata>): MockWebSocket {
	const defaultMetadata = createConnectionMetadata("test-user");
	const ws: MockWebSocket = {
		data: { ...defaultMetadata, ...metadata },
		sentMessages: [],
		closed: false,
		send(message: string) {
			this.sentMessages.push(message);
		},
		close(code?: number, reason?: string) {
			this.closed = true;
			this.closeCode = code;
			this.closeReason = reason;
		},
	};
	return ws;
}

// ============================================
// Setup
// ============================================

beforeEach(() => {
	closeAllConnections();
});

afterEach(() => {
	stopHeartbeat();
});

// ============================================
// Connection Metadata Tests
// ============================================

describe("createConnectionMetadata", () => {
	it("creates metadata with unique connection ID", () => {
		const meta1 = createConnectionMetadata("user-1");
		const meta2 = createConnectionMetadata("user-2");

		expect(meta1.connectionId).not.toBe(meta2.connectionId);
	});

	it("sets correct user ID", () => {
		const meta = createConnectionMetadata("test-user");
		expect(meta.userId).toBe("test-user");
	});

	it("initializes empty channels and symbols", () => {
		const meta = createConnectionMetadata("test-user");
		expect(meta.channels.size).toBe(0);
		expect(meta.symbols.size).toBe(0);
	});

	it("sets connection timestamps", () => {
		const before = new Date();
		const meta = createConnectionMetadata("test-user");
		const after = new Date();

		expect(meta.connectedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
		expect(meta.connectedAt.getTime()).toBeLessThanOrEqual(after.getTime());
		expect(meta.lastPing.getTime()).toBeGreaterThanOrEqual(before.getTime());
	});
});

// ============================================
// Connection Lifecycle Tests
// ============================================

describe("Connection Lifecycle", () => {
	it("handleOpen registers connection", () => {
		const ws = createMockWebSocket();
		handleOpen(ws as unknown as WebSocketWithMetadata);

		expect(getConnectionCount()).toBe(1);
		expect(getConnectionIds()).toContain(ws.data.connectionId);
	});

	it("handleOpen sends welcome message", () => {
		const ws = createMockWebSocket();
		handleOpen(ws as unknown as WebSocketWithMetadata);

		expect(ws.sentMessages).toHaveLength(1);
		const message = JSON.parse(requireArrayItem(ws.sentMessages, 0, "sent message"));
		expect(message.type).toBe("system_status");
		expect(message.data.health).toBe("healthy");
	});

	it("handleClose removes connection", () => {
		const ws = createMockWebSocket();
		handleOpen(ws as unknown as WebSocketWithMetadata);
		expect(getConnectionCount()).toBe(1);

		handleClose(ws as unknown as WebSocketWithMetadata, 1000, "Normal close");
		expect(getConnectionCount()).toBe(0);
	});
});

// ============================================
// Message Handling Tests
// ============================================

describe("handleMessage", () => {
	it("handles subscribe message", () => {
		const ws = createMockWebSocket();
		handleOpen(ws as unknown as WebSocketWithMetadata);

		handleMessage(
			ws as unknown as WebSocketWithMetadata,
			JSON.stringify({ type: "subscribe", channels: ["orders", "alerts"] }),
		);

		expect(ws.data.channels.has("orders")).toBe(true);
		expect(ws.data.channels.has("alerts")).toBe(true);

		// Check confirmation sent
		const lastIndex = ws.sentMessages.length - 1;
		const lastMessage = JSON.parse(requireArrayItem(ws.sentMessages, lastIndex, "sent message"));
		expect(lastMessage.type).toBe("subscribed");
	});

	it("handles unsubscribe message", () => {
		const ws = createMockWebSocket();
		ws.data.channels.add("orders");
		ws.data.channels.add("alerts");
		handleOpen(ws as unknown as WebSocketWithMetadata);

		handleMessage(
			ws as unknown as WebSocketWithMetadata,
			JSON.stringify({ type: "unsubscribe", channels: ["orders"] }),
		);

		expect(ws.data.channels.has("orders")).toBe(false);
		expect(ws.data.channels.has("alerts")).toBe(true);
	});

	it("handles subscribe_symbols message", () => {
		const ws = createMockWebSocket();
		handleOpen(ws as unknown as WebSocketWithMetadata);

		handleMessage(
			ws as unknown as WebSocketWithMetadata,
			JSON.stringify({ type: "subscribe_symbols", symbols: ["AAPL", "msft"] }),
		);

		expect(ws.data.symbols.has("AAPL")).toBe(true);
		expect(ws.data.symbols.has("MSFT")).toBe(true); // Uppercased
		expect(ws.data.channels.has("quotes")).toBe(true); // Auto-subscribed
	});

	it("handles ping message", () => {
		const ws = createMockWebSocket();
		handleOpen(ws as unknown as WebSocketWithMetadata);
		ws.sentMessages = []; // Clear welcome message

		handleMessage(ws as unknown as WebSocketWithMetadata, JSON.stringify({ type: "ping" }));

		expect(ws.sentMessages).toHaveLength(1);
		const message = JSON.parse(requireArrayItem(ws.sentMessages, 0, "sent message"));
		expect(message.type).toBe("pong");
		expect(message.timestamp).toBeDefined();
	});

	it("handles invalid JSON", () => {
		const ws = createMockWebSocket();
		handleOpen(ws as unknown as WebSocketWithMetadata);
		ws.sentMessages = [];

		handleMessage(ws as unknown as WebSocketWithMetadata, "not json");

		expect(ws.sentMessages).toHaveLength(1);
		const message = JSON.parse(requireArrayItem(ws.sentMessages, 0, "sent message"));
		expect(message.type).toBe("error");
		expect(message.message).toContain("Invalid JSON");
	});

	it("handles invalid message schema", () => {
		const ws = createMockWebSocket();
		handleOpen(ws as unknown as WebSocketWithMetadata);
		ws.sentMessages = [];

		handleMessage(ws as unknown as WebSocketWithMetadata, JSON.stringify({ type: "invalid_type" }));

		expect(ws.sentMessages).toHaveLength(1);
		const message = JSON.parse(requireArrayItem(ws.sentMessages, 0, "sent message"));
		expect(message.type).toBe("error");
	});

	it("handles invalid channel name", () => {
		const ws = createMockWebSocket();
		handleOpen(ws as unknown as WebSocketWithMetadata);
		ws.sentMessages = [];

		handleMessage(
			ws as unknown as WebSocketWithMetadata,
			JSON.stringify({ type: "subscribe", channels: ["invalid_channel"] }),
		);

		// Should send error for invalid channel
		const messages = ws.sentMessages.map((m) => JSON.parse(m));
		expect(messages.some((m) => m.type === "error")).toBe(true);
	});

	it("updates lastPing on message", () => {
		const ws = createMockWebSocket();
		const oldPing = new Date(Date.now() - 10000);
		ws.data.lastPing = oldPing;
		handleOpen(ws as unknown as WebSocketWithMetadata);

		handleMessage(ws as unknown as WebSocketWithMetadata, JSON.stringify({ type: "ping" }));

		expect(ws.data.lastPing.getTime()).toBeGreaterThan(oldPing.getTime());
	});
});

// ============================================
// Broadcasting Tests
// ============================================

describe("Broadcasting", () => {
	it("broadcast sends to subscribed connections only", () => {
		const ws1 = createMockWebSocket();
		ws1.data.channels.add("orders");
		handleOpen(ws1 as unknown as WebSocketWithMetadata);

		const ws2 = createMockWebSocket();
		ws2.data.channels.add("alerts");
		handleOpen(ws2 as unknown as WebSocketWithMetadata);

		// Clear welcome messages
		ws1.sentMessages = [];
		ws2.sentMessages = [];

		const sent = broadcast("orders", {
			type: "order",
			data: {
				id: "00000000-0000-0000-0000-000000000001",
				symbol: "AAPL",
				side: "buy",
				orderType: "market",
				status: "filled",
				quantity: 100,
				filledQty: 100,
				timestamp: new Date().toISOString(),
			},
		});

		expect(sent).toBe(1);
		expect(ws1.sentMessages).toHaveLength(1);
		expect(ws2.sentMessages).toHaveLength(0);
	});

	it("broadcastQuote sends to symbol subscribers only", () => {
		const ws1 = createMockWebSocket();
		ws1.data.channels.add("quotes");
		ws1.data.symbols.add("AAPL");
		handleOpen(ws1 as unknown as WebSocketWithMetadata);

		const ws2 = createMockWebSocket();
		ws2.data.channels.add("quotes");
		ws2.data.symbols.add("MSFT");
		handleOpen(ws2 as unknown as WebSocketWithMetadata);

		ws1.sentMessages = [];
		ws2.sentMessages = [];

		const sent = broadcastQuote("AAPL", {
			type: "quote",
			data: {
				symbol: "AAPL",
				bid: 149.5,
				ask: 150.5,
				last: 150,
				volume: 1000000,
				timestamp: new Date().toISOString(),
			},
		});

		expect(sent).toBe(1);
		expect(ws1.sentMessages).toHaveLength(1);
		expect(ws2.sentMessages).toHaveLength(0);
	});

	it("broadcastAll sends to all connections", () => {
		const ws1 = createMockWebSocket();
		handleOpen(ws1 as unknown as WebSocketWithMetadata);

		const ws2 = createMockWebSocket();
		handleOpen(ws2 as unknown as WebSocketWithMetadata);

		ws1.sentMessages = [];
		ws2.sentMessages = [];

		const sent = broadcastAll({
			type: "system_status",
			data: {
				health: "healthy",
				uptimeSeconds: 100,
				activeConnections: 2,
				services: {},
				environment: "PAPER",
				timestamp: new Date().toISOString(),
			},
		});

		expect(sent).toBe(2);
		expect(ws1.sentMessages).toHaveLength(1);
		expect(ws2.sentMessages).toHaveLength(1);
	});
});

// ============================================
// Message Sending Tests
// ============================================

describe("sendMessage", () => {
	it("sends JSON message", () => {
		const ws = createMockWebSocket();

		sendMessage(ws as unknown as WebSocketWithMetadata, {
			type: "pong",
			timestamp: new Date().toISOString(),
		});

		expect(ws.sentMessages).toHaveLength(1);
		const message = JSON.parse(requireArrayItem(ws.sentMessages, 0, "sent message"));
		expect(message.type).toBe("pong");
	});
});

describe("sendError", () => {
	it("sends error message", () => {
		const ws = createMockWebSocket();

		sendError(ws as unknown as WebSocketWithMetadata, "Test error");

		expect(ws.sentMessages).toHaveLength(1);
		const message = JSON.parse(requireArrayItem(ws.sentMessages, 0, "sent message"));
		expect(message.type).toBe("error");
		expect(message.message).toBe("Test error");
	});
});

// ============================================
// Stale Connection Cleanup Tests
// ============================================

describe("Stale Connection Cleanup", () => {
	it("closeStaleConnections removes old connections", () => {
		const ws = createMockWebSocket();
		ws.data.lastPing = new Date(Date.now() - 120000); // 2 minutes ago
		handleOpen(ws as unknown as WebSocketWithMetadata);

		expect(getConnectionCount()).toBe(1);

		const closed = closeStaleConnections();

		expect(closed).toBe(1);
		expect(getConnectionCount()).toBe(0);
	});

	it("closeStaleConnections keeps fresh connections", () => {
		const ws = createMockWebSocket();
		ws.data.lastPing = new Date(); // Just now
		handleOpen(ws as unknown as WebSocketWithMetadata);

		const closed = closeStaleConnections();

		expect(closed).toBe(0);
		expect(getConnectionCount()).toBe(1);
	});
});

// ============================================
// Graceful Shutdown Tests
// ============================================

describe("Graceful Shutdown", () => {
	it("closeAllConnections closes all connections", () => {
		const ws1 = createMockWebSocket();
		handleOpen(ws1 as unknown as WebSocketWithMetadata);

		const ws2 = createMockWebSocket();
		handleOpen(ws2 as unknown as WebSocketWithMetadata);

		expect(getConnectionCount()).toBe(2);

		closeAllConnections("Test shutdown");

		expect(getConnectionCount()).toBe(0);
	});
});

// ============================================
// Heartbeat Tests
// ============================================

describe("Heartbeat", () => {
	it("startHeartbeat and stopHeartbeat work without error", () => {
		expect(() => startHeartbeat()).not.toThrow();
		expect(() => stopHeartbeat()).not.toThrow();
	});
});
