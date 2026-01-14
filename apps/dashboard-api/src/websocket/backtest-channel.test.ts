/**
 * Backtest WebSocket Channel Tests
 *
 * Unit tests for backtest subscription management and broadcasting.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import {
	broadcastToBacktest,
	cleanupBacktestSubscriptions,
	getActiveBacktestIds,
	getBacktestSubscriberCount,
	getTotalBacktestSubscriptions,
	hasBacktestSubscribers,
	subscribeToBacktest,
	unsubscribeFromBacktest,
} from "./backtest-channel";

// ============================================
// Mock WebSocket
// ============================================

function createMockWebSocket() {
	return {
		send: mock(() => {}),
		close: mock(() => {}),
		readyState: 1, // OPEN
	} as unknown as Parameters<typeof subscribeToBacktest>[0];
}

// ============================================
// Test Suite
// ============================================

describe("Backtest Channel", () => {
	let ws1: ReturnType<typeof createMockWebSocket>;
	let ws2: ReturnType<typeof createMockWebSocket>;
	const backtestId1 = "test-backtest-001";
	const backtestId2 = "test-backtest-002";

	beforeEach(() => {
		ws1 = createMockWebSocket();
		ws2 = createMockWebSocket();
	});

	afterEach(() => {
		// Clean up all subscriptions between tests
		cleanupBacktestSubscriptions(ws1);
		cleanupBacktestSubscriptions(ws2);
	});

	describe("subscribeToBacktest", () => {
		it("should add connection to backtest subscribers", () => {
			expect(hasBacktestSubscribers(backtestId1)).toBe(false);

			subscribeToBacktest(ws1, backtestId1);

			expect(hasBacktestSubscribers(backtestId1)).toBe(true);
			expect(getBacktestSubscriberCount(backtestId1)).toBe(1);
		});

		it("should allow multiple connections to subscribe to same backtest", () => {
			subscribeToBacktest(ws1, backtestId1);
			subscribeToBacktest(ws2, backtestId1);

			expect(getBacktestSubscriberCount(backtestId1)).toBe(2);
		});

		it("should allow one connection to subscribe to multiple backtests", () => {
			subscribeToBacktest(ws1, backtestId1);
			subscribeToBacktest(ws1, backtestId2);

			expect(getBacktestSubscriberCount(backtestId1)).toBe(1);
			expect(getBacktestSubscriberCount(backtestId2)).toBe(1);
		});

		it("should not duplicate subscriptions", () => {
			subscribeToBacktest(ws1, backtestId1);
			subscribeToBacktest(ws1, backtestId1);

			expect(getBacktestSubscriberCount(backtestId1)).toBe(1);
		});
	});

	describe("unsubscribeFromBacktest", () => {
		it("should remove connection from backtest subscribers", () => {
			subscribeToBacktest(ws1, backtestId1);
			expect(hasBacktestSubscribers(backtestId1)).toBe(true);

			unsubscribeFromBacktest(ws1, backtestId1);

			expect(hasBacktestSubscribers(backtestId1)).toBe(false);
		});

		it("should handle unsubscribe when not subscribed", () => {
			// Should not throw
			unsubscribeFromBacktest(ws1, backtestId1);
			expect(hasBacktestSubscribers(backtestId1)).toBe(false);
		});

		it("should only remove specified backtest subscription", () => {
			subscribeToBacktest(ws1, backtestId1);
			subscribeToBacktest(ws1, backtestId2);

			unsubscribeFromBacktest(ws1, backtestId1);

			expect(hasBacktestSubscribers(backtestId1)).toBe(false);
			expect(hasBacktestSubscribers(backtestId2)).toBe(true);
		});

		it("should not affect other connections", () => {
			subscribeToBacktest(ws1, backtestId1);
			subscribeToBacktest(ws2, backtestId1);

			unsubscribeFromBacktest(ws1, backtestId1);

			expect(getBacktestSubscriberCount(backtestId1)).toBe(1);
			expect(hasBacktestSubscribers(backtestId1)).toBe(true);
		});
	});

	describe("cleanupBacktestSubscriptions", () => {
		it("should remove all subscriptions for a connection", () => {
			subscribeToBacktest(ws1, backtestId1);
			subscribeToBacktest(ws1, backtestId2);

			cleanupBacktestSubscriptions(ws1);

			expect(hasBacktestSubscribers(backtestId1)).toBe(false);
			expect(hasBacktestSubscribers(backtestId2)).toBe(false);
		});

		it("should not affect other connections", () => {
			subscribeToBacktest(ws1, backtestId1);
			subscribeToBacktest(ws2, backtestId1);

			cleanupBacktestSubscriptions(ws1);

			expect(hasBacktestSubscribers(backtestId1)).toBe(true);
			expect(getBacktestSubscriberCount(backtestId1)).toBe(1);
		});

		it("should handle cleanup when no subscriptions", () => {
			// Should not throw
			cleanupBacktestSubscriptions(ws1);
			expect(getTotalBacktestSubscriptions()).toBe(0);
		});
	});

	describe("broadcastToBacktest", () => {
		it("should send message to all subscribed connections", () => {
			subscribeToBacktest(ws1, backtestId1);
			subscribeToBacktest(ws2, backtestId1);

			const message = { type: "backtest:progress" as const, payload: { pct: 50 } };
			const sent = broadcastToBacktest(backtestId1, message);

			expect(sent).toBe(2);
			expect(ws1.send).toHaveBeenCalledWith(JSON.stringify(message));
			expect(ws2.send).toHaveBeenCalledWith(JSON.stringify(message));
		});

		it("should return 0 when no subscribers", () => {
			const message = { type: "backtest:completed" as const };
			const sent = broadcastToBacktest("nonexistent-backtest", message);

			expect(sent).toBe(0);
		});

		it("should only send to subscribed backtest", () => {
			subscribeToBacktest(ws1, backtestId1);
			subscribeToBacktest(ws2, backtestId2);

			const message = { type: "backtest:progress" as const, payload: { pct: 25 } };
			broadcastToBacktest(backtestId1, message);

			expect(ws1.send).toHaveBeenCalled();
			expect(ws2.send).not.toHaveBeenCalled();
		});

		it("should remove dead connections that throw on send", () => {
			const deadWs = createMockWebSocket();
			(deadWs.send as any).mockImplementation(() => {
				throw new Error("Connection closed");
			});

			subscribeToBacktest(ws1, backtestId1);
			subscribeToBacktest(deadWs, backtestId1);

			expect(getBacktestSubscriberCount(backtestId1)).toBe(2);

			const message = { type: "backtest:progress" as const };
			const sent = broadcastToBacktest(backtestId1, message);

			expect(sent).toBe(1);
			expect(getBacktestSubscriberCount(backtestId1)).toBe(1);
		});
	});

	describe("getBacktestSubscriberCount", () => {
		it("should return 0 for unknown backtest", () => {
			expect(getBacktestSubscriberCount("unknown")).toBe(0);
		});

		it("should return correct count", () => {
			subscribeToBacktest(ws1, backtestId1);
			expect(getBacktestSubscriberCount(backtestId1)).toBe(1);

			subscribeToBacktest(ws2, backtestId1);
			expect(getBacktestSubscriberCount(backtestId1)).toBe(2);
		});
	});

	describe("hasBacktestSubscribers", () => {
		it("should return false for unknown backtest", () => {
			expect(hasBacktestSubscribers("unknown")).toBe(false);
		});

		it("should return true when has subscribers", () => {
			subscribeToBacktest(ws1, backtestId1);
			expect(hasBacktestSubscribers(backtestId1)).toBe(true);
		});
	});

	describe("getTotalBacktestSubscriptions", () => {
		it("should return 0 when no subscriptions", () => {
			expect(getTotalBacktestSubscriptions()).toBe(0);
		});

		it("should count all subscriptions across backtests", () => {
			subscribeToBacktest(ws1, backtestId1);
			subscribeToBacktest(ws2, backtestId1);
			subscribeToBacktest(ws1, backtestId2);

			expect(getTotalBacktestSubscriptions()).toBe(3);
		});
	});

	describe("getActiveBacktestIds", () => {
		it("should return empty array when no subscriptions", () => {
			expect(getActiveBacktestIds()).toEqual([]);
		});

		it("should return all backtest IDs with subscribers", () => {
			subscribeToBacktest(ws1, backtestId1);
			subscribeToBacktest(ws2, backtestId2);

			const ids = getActiveBacktestIds();
			expect(ids).toContain(backtestId1);
			expect(ids).toContain(backtestId2);
			expect(ids.length).toBe(2);
		});

		it("should not include backtests after all unsubscribe", () => {
			subscribeToBacktest(ws1, backtestId1);
			unsubscribeFromBacktest(ws1, backtestId1);

			expect(getActiveBacktestIds()).toEqual([]);
		});
	});
});
