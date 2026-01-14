/**
 * Backtest Executor Service Tests
 *
 * Unit tests for the backtest executor and event handling.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import {
	type BacktestConfig,
	type BroadcastFn,
	type CompletedEvent,
	type EquityEvent,
	type ErrorEvent,
	handleEvent,
	type ProgressEvent,
	type TradeEvent,
} from "./backtest-executor";

// ============================================
// Mock Repository
// ============================================

function createMockRepo() {
	return {
		start: mock(() => Promise.resolve()),
		updateProgress: mock(() => Promise.resolve()),
		addTrade: mock(() => Promise.resolve()),
		addEquityPoint: mock(() => Promise.resolve()),
		complete: mock(() => Promise.resolve()),
		fail: mock(() => Promise.resolve()),
	};
}

// ============================================
// handleEvent Tests
// ============================================

describe("handleEvent", () => {
	let mockRepo: ReturnType<typeof createMockRepo>;
	let mockBroadcast: BroadcastFn;
	const backtestId = "test-backtest-123";

	beforeEach(() => {
		mockRepo = createMockRepo();
		mockBroadcast = mock(() => {});
	});

	afterEach(() => {
		mock.restore();
	});

	describe("progress event", () => {
		it("should update progress in database", async () => {
			const event: ProgressEvent = {
				type: "progress",
				pct: 50,
				phase: "running_simulation",
			};

			await handleEvent(backtestId, event, mockRepo as any, mockBroadcast);

			expect(mockRepo.updateProgress).toHaveBeenCalledWith(backtestId, 50);
		});

		it("should broadcast progress to WebSocket", async () => {
			const event: ProgressEvent = {
				type: "progress",
				pct: 75,
				phase: "calculating_metrics",
			};

			await handleEvent(backtestId, event, mockRepo as any, mockBroadcast);

			expect(mockBroadcast).toHaveBeenCalledWith(backtestId, {
				type: "backtest:progress",
				payload: { progressPct: 75, phase: "calculating_metrics" },
			});
		});

		it("should work without broadcast function", async () => {
			const event: ProgressEvent = {
				type: "progress",
				pct: 25,
				phase: "loading_data",
			};

			// Should not throw
			await handleEvent(backtestId, event, mockRepo as any);

			expect(mockRepo.updateProgress).toHaveBeenCalledWith(backtestId, 25);
		});
	});

	describe("trade event", () => {
		it("should add trade to database", async () => {
			const event: TradeEvent = {
				type: "trade",
				timestamp: "2024-01-15T10:00:00Z",
				symbol: "AAPL",
				action: "BUY",
				quantity: 100,
				entryPrice: 150.0,
				exitPrice: 155.0,
				pnl: 500,
				returnPct: 3.33,
			};

			await handleEvent(backtestId, event, mockRepo as any, mockBroadcast);

			expect(mockRepo.addTrade).toHaveBeenCalledWith(backtestId, {
				timestamp: "2024-01-15T10:00:00Z",
				symbol: "AAPL",
				action: "BUY",
				quantity: 100,
				price: 150.0,
				commission: 0,
				pnl: 500,
				pnlPct: 3.33,
				decisionRationale: null,
			});
		});

		it("should broadcast trade to WebSocket", async () => {
			const event: TradeEvent = {
				type: "trade",
				timestamp: "2024-01-15T10:00:00Z",
				symbol: "MSFT",
				action: "SELL",
				quantity: 50,
				entryPrice: 400.0,
				exitPrice: 380.0,
				pnl: -1000,
			};

			await handleEvent(backtestId, event, mockRepo as any, mockBroadcast);

			expect(mockBroadcast).toHaveBeenCalledWith(backtestId, {
				type: "backtest:trade",
				payload: event,
			});
		});

		it("should handle trade without returnPct", async () => {
			const event: TradeEvent = {
				type: "trade",
				timestamp: "2024-01-15T10:00:00Z",
				symbol: "GOOGL",
				action: "BUY",
				quantity: 10,
				entryPrice: 140.0,
				exitPrice: 145.0,
				pnl: 50,
			};

			await handleEvent(backtestId, event, mockRepo as any, mockBroadcast);

			expect(mockRepo.addTrade).toHaveBeenCalledWith(backtestId, {
				timestamp: "2024-01-15T10:00:00Z",
				symbol: "GOOGL",
				action: "BUY",
				quantity: 10,
				price: 140.0,
				commission: 0,
				pnl: 50,
				pnlPct: null,
				decisionRationale: null,
			});
		});

		it("should handle SHORT and COVER actions", async () => {
			const shortEvent: TradeEvent = {
				type: "trade",
				timestamp: "2024-01-15T10:00:00Z",
				symbol: "TSLA",
				action: "SHORT",
				quantity: 20,
				entryPrice: 200.0,
				exitPrice: 190.0,
				pnl: 200,
			};

			await handleEvent(backtestId, shortEvent, mockRepo as any, mockBroadcast);

			expect(mockRepo.addTrade).toHaveBeenCalledWith(
				backtestId,
				expect.objectContaining({ action: "SHORT" })
			);
		});
	});

	describe("equity event", () => {
		it("should add equity point to database", async () => {
			const event: EquityEvent = {
				type: "equity",
				timestamp: "2024-01-15T10:00:00Z",
				nav: 105000,
				drawdownPct: 2.5,
			};

			await handleEvent(backtestId, event, mockRepo as any, mockBroadcast);

			expect(mockRepo.addEquityPoint).toHaveBeenCalledWith(backtestId, {
				timestamp: "2024-01-15T10:00:00Z",
				nav: 105000,
				cash: 0,
				equity: 105000,
				drawdown: null,
				drawdownPct: 2.5,
				dayReturnPct: null,
				cumulativeReturnPct: null,
			});
		});

		it("should NOT broadcast equity events", async () => {
			const event: EquityEvent = {
				type: "equity",
				timestamp: "2024-01-15T10:00:00Z",
				nav: 110000,
				drawdownPct: 0,
			};

			await handleEvent(backtestId, event, mockRepo as any, mockBroadcast);

			// Equity events are not broadcast to avoid flooding
			expect(mockBroadcast).not.toHaveBeenCalled();
		});
	});

	describe("completed event", () => {
		it("should complete backtest in database with metrics", async () => {
			const event: CompletedEvent = {
				type: "completed",
				metrics: {
					totalReturn: 5000,
					sharpeRatio: 1.5,
					sortinoRatio: 2.0,
					maxDrawdown: 3.5,
					winRate: 0.65,
					profitFactor: 1.8,
					totalTrades: 50,
					totalFeesPaid: 100,
					startValue: 100000,
					endValue: 105000,
				},
			};

			await handleEvent(backtestId, event, mockRepo as any, mockBroadcast);

			expect(mockRepo.complete).toHaveBeenCalledWith(backtestId, {
				totalReturn: 5000,
				sharpeRatio: 1.5,
				sortinoRatio: 2.0,
				maxDrawdown: 3.5,
				winRate: 0.65,
				profitFactor: 1.8,
				totalTrades: 50,
				additionalMetrics: {
					totalFeesPaid: 100,
					startValue: 100000,
					endValue: 105000,
				},
			});
		});

		it("should broadcast completion to WebSocket", async () => {
			const event: CompletedEvent = {
				type: "completed",
				metrics: {
					totalReturn: 2500,
					sharpeRatio: 1.2,
					sortinoRatio: 1.5,
					maxDrawdown: 5.0,
					winRate: 0.55,
					profitFactor: 1.3,
					totalTrades: 30,
				},
			};

			await handleEvent(backtestId, event, mockRepo as any, mockBroadcast);

			expect(mockBroadcast).toHaveBeenCalledWith(backtestId, {
				type: "backtest:completed",
				payload: event.metrics,
			});
		});
	});

	describe("error event", () => {
		it("should mark backtest as failed in database", async () => {
			const event: ErrorEvent = {
				type: "error",
				message: "Insufficient data for backtest",
			};

			await handleEvent(backtestId, event, mockRepo as any, mockBroadcast);

			expect(mockRepo.fail).toHaveBeenCalledWith(backtestId, "Insufficient data for backtest");
		});

		it("should broadcast error to WebSocket", async () => {
			const event: ErrorEvent = {
				type: "error",
				message: "Memory allocation failed",
			};

			await handleEvent(backtestId, event, mockRepo as any, mockBroadcast);

			expect(mockBroadcast).toHaveBeenCalledWith(backtestId, {
				type: "backtest:error",
				payload: { message: "Memory allocation failed" },
			});
		});
	});
});

// ============================================
// executeBacktest Tests (Integration-like)
// ============================================

describe("executeBacktest", () => {
	// These tests would require mocking Bun.spawn which is complex
	// For full integration tests, see backtest-integration.test.ts

	describe("configuration validation", () => {
		it("should export correct types", async () => {
			const config: BacktestConfig = {
				backtestId: "test-123",
				dataPath: "/tmp/data.parquet",
				signalsPath: "/tmp/signals.parquet",
				initialCapital: 100000,
				slippageBps: 5,
				symbol: "SPY",
			};

			expect(config.backtestId).toBe("test-123");
			expect(config.initialCapital).toBe(100000);
		});

		it("should have optional fields", () => {
			const config: BacktestConfig = {
				backtestId: "test-456",
				dataPath: "/tmp/data.parquet",
				signalsPath: "/tmp/signals.parquet",
				initialCapital: 50000,
				slippageBps: 10,
			};

			// Optional fields should be undefined
			expect(config.commissionPerShare).toBeUndefined();
			expect(config.symbol).toBeUndefined();
		});
	});
});
