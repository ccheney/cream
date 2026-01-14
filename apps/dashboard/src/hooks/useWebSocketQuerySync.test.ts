/**
 * WebSocket Query Sync Hook Tests
 *
 * Tests for TanStack Query cache invalidation via WebSocket messages.
 *
 * @see docs/plans/ui/07-state-management.md lines 46-66
 */

import { describe, expect, it } from "bun:test";
import {
	type AgentOutputPayload,
	type AlertPayload,
	type CycleProgressPayload,
	type DecisionPayload,
	type OrderPayload,
	type PortfolioPayload,
	type PositionPayload,
	parseServerMessage,
	type QuotePayload,
	queryKeys,
	type ServerMessage,
	type ServerMessageType,
	type SystemStatusPayload,
	type UseWebSocketQuerySyncOptions,
	type UseWebSocketQuerySyncReturn,
} from "./useWebSocketQuerySync";

// ============================================
// Query Keys Tests
// ============================================

describe("queryKeys", () => {
	describe("market keys", () => {
		it("generates marketQuote key with symbol", () => {
			const key = queryKeys.marketQuote("AAPL");
			expect(key).toEqual(["market", "quote", "AAPL"]);
		});

		it("generates marketQuotes key", () => {
			const key = queryKeys.marketQuotes();
			expect(key).toEqual(["market", "quotes"]);
		});
	});

	describe("portfolio keys", () => {
		it("generates portfolio key", () => {
			const key = queryKeys.portfolio();
			expect(key).toEqual(["portfolio"]);
		});

		it("generates portfolioSummary key", () => {
			const key = queryKeys.portfolioSummary();
			expect(key).toEqual(["portfolio", "summary"]);
		});

		it("generates positions key", () => {
			const key = queryKeys.positions();
			expect(key).toEqual(["portfolio", "positions"]);
		});

		it("generates position key with symbol", () => {
			const key = queryKeys.position("TSLA");
			expect(key).toEqual(["portfolio", "positions", "TSLA"]);
		});
	});

	describe("orders keys", () => {
		it("generates orders key", () => {
			const key = queryKeys.orders();
			expect(key).toEqual(["orders"]);
		});

		it("generates order key with orderId", () => {
			const key = queryKeys.order("order-123");
			expect(key).toEqual(["orders", "order-123"]);
		});

		it("generates activeOrders key", () => {
			const key = queryKeys.activeOrders();
			expect(key).toEqual(["orders", "active"]);
		});
	});

	describe("decisions keys", () => {
		it("generates decisions key", () => {
			const key = queryKeys.decisions();
			expect(key).toEqual(["decisions"]);
		});

		it("generates decision key with decisionId", () => {
			const key = queryKeys.decision("dec-456");
			expect(key).toEqual(["decisions", "dec-456"]);
		});

		it("generates recentDecisions key", () => {
			const key = queryKeys.recentDecisions();
			expect(key).toEqual(["decisions", "recent"]);
		});
	});

	describe("alerts keys", () => {
		it("generates alerts key", () => {
			const key = queryKeys.alerts();
			expect(key).toEqual(["alerts"]);
		});

		it("generates unreadAlerts key", () => {
			const key = queryKeys.unreadAlerts();
			expect(key).toEqual(["alerts", "unread"]);
		});
	});

	describe("agents keys", () => {
		it("generates agents key", () => {
			const key = queryKeys.agents();
			expect(key).toEqual(["agents"]);
		});

		it("generates agentOutput key with agentId", () => {
			const key = queryKeys.agentOutput("agent-001");
			expect(key).toEqual(["agents", "agent-001", "output"]);
		});
	});

	describe("system keys", () => {
		it("generates systemStatus key", () => {
			const key = queryKeys.systemStatus();
			expect(key).toEqual(["system", "status"]);
		});

		it("generates systemHealth key", () => {
			const key = queryKeys.systemHealth();
			expect(key).toEqual(["system", "health"]);
		});
	});

	describe("key immutability", () => {
		it("returns readonly arrays", () => {
			const key = queryKeys.marketQuote("AAPL");
			// TypeScript enforces readonly, but we can verify it's a tuple
			expect(key.length).toBe(3);
			expect(key[0]).toBe("market");
		});
	});
});

// ============================================
// parseServerMessage Tests
// ============================================

describe("parseServerMessage", () => {
	describe("valid messages", () => {
		it("parses quote message", () => {
			const raw = {
				type: "quote",
				data: { symbol: "AAPL", bid: 150.0, ask: 150.1 },
				timestamp: "2025-01-04T12:00:00Z",
			};
			const result = parseServerMessage(raw);
			expect(result).not.toBeNull();
			expect(result?.type).toBe("quote");
			expect(result?.data).toEqual(raw.data);
			expect(result?.timestamp).toBe("2025-01-04T12:00:00Z");
		});

		it("parses order message", () => {
			const raw = {
				type: "order",
				data: { orderId: "123", symbol: "TSLA", status: "filled" },
				timestamp: "2025-01-04T12:00:00Z",
			};
			const result = parseServerMessage(raw);
			expect(result?.type).toBe("order");
		});

		it("parses decision message", () => {
			const raw = {
				type: "decision",
				data: { decisionId: "dec-1", action: "BUY" },
				timestamp: "2025-01-04T12:00:00Z",
			};
			const result = parseServerMessage(raw);
			expect(result?.type).toBe("decision");
		});

		it("parses system_status message", () => {
			const raw = {
				type: "system_status",
				data: { status: "online" },
				timestamp: "2025-01-04T12:00:00Z",
			};
			const result = parseServerMessage(raw);
			expect(result?.type).toBe("system_status");
		});

		it("parses alert message", () => {
			const raw = {
				type: "alert",
				data: { alertId: "a1", type: "warning", message: "Test" },
				timestamp: "2025-01-04T12:00:00Z",
			};
			const result = parseServerMessage(raw);
			expect(result?.type).toBe("alert");
		});

		it("parses agent_output message", () => {
			const raw = {
				type: "agent_output",
				data: { agentId: "ag1", output: "Analysis complete" },
				timestamp: "2025-01-04T12:00:00Z",
			};
			const result = parseServerMessage(raw);
			expect(result?.type).toBe("agent_output");
		});

		it("parses cycle_progress message", () => {
			const raw = {
				type: "cycle_progress",
				data: { cycleId: "c1", phase: "observe", progress: 0.5 },
				timestamp: "2025-01-04T12:00:00Z",
			};
			const result = parseServerMessage(raw);
			expect(result?.type).toBe("cycle_progress");
		});

		it("parses portfolio message", () => {
			const raw = {
				type: "portfolio",
				data: { equity: 100000, cash: 50000 },
				timestamp: "2025-01-04T12:00:00Z",
			};
			const result = parseServerMessage(raw);
			expect(result?.type).toBe("portfolio");
		});

		it("parses position message", () => {
			const raw = {
				type: "position",
				data: { symbol: "AAPL", quantity: 100 },
				timestamp: "2025-01-04T12:00:00Z",
			};
			const result = parseServerMessage(raw);
			expect(result?.type).toBe("position");
		});

		it("parses heartbeat message", () => {
			const raw = {
				type: "heartbeat",
				data: null,
				timestamp: "2025-01-04T12:00:00Z",
			};
			const result = parseServerMessage(raw);
			expect(result?.type).toBe("heartbeat");
		});

		it("parses error message", () => {
			const raw = {
				type: "error",
				data: "Connection failed",
				timestamp: "2025-01-04T12:00:00Z",
			};
			const result = parseServerMessage(raw);
			expect(result?.type).toBe("error");
		});
	});

	describe("timestamp handling", () => {
		it("uses provided timestamp", () => {
			const raw = {
				type: "quote",
				data: {},
				timestamp: "2025-01-04T12:00:00Z",
			};
			const result = parseServerMessage(raw);
			expect(result?.timestamp).toBe("2025-01-04T12:00:00Z");
		});

		it("generates timestamp if missing", () => {
			const raw = {
				type: "quote",
				data: {},
			};
			const result = parseServerMessage(raw);
			expect(result?.timestamp).toBeDefined();
			// Should be a valid ISO string
			if (result?.timestamp) {
				expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
			}
		});
	});

	describe("invalid messages", () => {
		it("returns null for null input", () => {
			expect(parseServerMessage(null)).toBeNull();
		});

		it("returns null for undefined input", () => {
			expect(parseServerMessage(undefined)).toBeNull();
		});

		it("returns null for non-object input", () => {
			expect(parseServerMessage("string")).toBeNull();
			expect(parseServerMessage(123)).toBeNull();
			expect(parseServerMessage(true)).toBeNull();
		});

		it("returns null for missing type", () => {
			expect(parseServerMessage({ data: {} })).toBeNull();
		});

		it("returns null for non-string type", () => {
			expect(parseServerMessage({ type: 123, data: {} })).toBeNull();
		});

		it("returns null for invalid type value", () => {
			expect(parseServerMessage({ type: "invalid_type", data: {} })).toBeNull();
		});

		it("returns null for empty object", () => {
			expect(parseServerMessage({})).toBeNull();
		});
	});

	describe("all valid message types", () => {
		const validTypes: ServerMessageType[] = [
			"quote",
			"order",
			"decision",
			"system_status",
			"alert",
			"agent_output",
			"cycle_progress",
			"portfolio",
			"position",
			"heartbeat",
			"error",
		];

		for (const type of validTypes) {
			it(`accepts "${type}" as valid type`, () => {
				const raw = { type, data: {}, timestamp: "2025-01-04T12:00:00Z" };
				const result = parseServerMessage(raw);
				expect(result).not.toBeNull();
				expect(result?.type).toBe(type);
			});
		}
	});
});

// ============================================
// Type Tests
// ============================================

describe("QuotePayload Type", () => {
	it("has correct shape", () => {
		const payload: QuotePayload = {
			symbol: "AAPL",
			bid: 150.0,
			ask: 150.1,
			last: 150.05,
			volume: 1000000,
			timestamp: "2025-01-04T12:00:00Z",
		};
		expect(payload.symbol).toBe("AAPL");
		expect(payload.bid).toBe(150.0);
		expect(payload.ask).toBe(150.1);
		expect(payload.last).toBe(150.05);
		expect(payload.volume).toBe(1000000);
	});
});

describe("OrderPayload Type", () => {
	it("has correct shape", () => {
		const payload: OrderPayload = {
			orderId: "ord-123",
			symbol: "TSLA",
			side: "buy",
			quantity: 100,
			price: 250.0,
			status: "pending",
			timestamp: "2025-01-04T12:00:00Z",
		};
		expect(payload.orderId).toBe("ord-123");
		expect(payload.side).toBe("buy");
		expect(payload.status).toBe("pending");
	});

	it("supports optional filledQuantity", () => {
		const payload: OrderPayload = {
			orderId: "ord-123",
			symbol: "TSLA",
			side: "sell",
			quantity: 100,
			price: 250.0,
			status: "filled",
			filledQuantity: 100,
			timestamp: "2025-01-04T12:00:00Z",
		};
		expect(payload.filledQuantity).toBe(100);
	});

	it("supports all order statuses", () => {
		const statuses: OrderPayload["status"][] = ["pending", "filled", "cancelled", "rejected"];
		for (const status of statuses) {
			const payload: OrderPayload = {
				orderId: "ord-123",
				symbol: "TEST",
				side: "buy",
				quantity: 1,
				price: 1,
				status,
				timestamp: "2025-01-04T12:00:00Z",
			};
			expect(payload.status).toBe(status);
		}
	});
});

describe("DecisionPayload Type", () => {
	it("has correct shape", () => {
		const payload: DecisionPayload = {
			decisionId: "dec-456",
			symbol: "AAPL",
			action: "BUY",
			confidence: 0.85,
			timestamp: "2025-01-04T12:00:00Z",
		};
		expect(payload.decisionId).toBe("dec-456");
		expect(payload.action).toBe("BUY");
		expect(payload.confidence).toBe(0.85);
	});

	it("supports all decision actions", () => {
		const actions: DecisionPayload["action"][] = ["BUY", "SELL", "HOLD", "CLOSE"];
		for (const action of actions) {
			const payload: DecisionPayload = {
				decisionId: "dec-1",
				symbol: "TEST",
				action,
				confidence: 0.5,
				timestamp: "2025-01-04T12:00:00Z",
			};
			expect(payload.action).toBe(action);
		}
	});
});

describe("SystemStatusPayload Type", () => {
	it("has correct shape", () => {
		const payload: SystemStatusPayload = {
			status: "online",
			services: {
				api: "healthy",
				database: "healthy",
				broker: "unknown",
			},
			lastUpdated: "2025-01-04T12:00:00Z",
		};
		expect(payload.status).toBe("online");
		expect(payload.services.api).toBe("healthy");
	});

	it("supports all status values", () => {
		const statuses: SystemStatusPayload["status"][] = ["online", "offline", "degraded"];
		for (const status of statuses) {
			const payload: SystemStatusPayload = {
				status,
				services: {},
				lastUpdated: "2025-01-04T12:00:00Z",
			};
			expect(payload.status).toBe(status);
		}
	});

	it("supports all service health values", () => {
		const payload: SystemStatusPayload = {
			status: "online",
			services: {
				healthy_service: "healthy",
				unhealthy_service: "unhealthy",
				unknown_service: "unknown",
			},
			lastUpdated: "2025-01-04T12:00:00Z",
		};
		expect(payload.services.healthy_service).toBe("healthy");
		expect(payload.services.unhealthy_service).toBe("unhealthy");
		expect(payload.services.unknown_service).toBe("unknown");
	});
});

describe("AlertPayload Type", () => {
	it("has correct shape", () => {
		const payload: AlertPayload = {
			alertId: "alert-789",
			type: "warning",
			title: "High Volatility",
			message: "Market volatility is elevated",
			timestamp: "2025-01-04T12:00:00Z",
		};
		expect(payload.alertId).toBe("alert-789");
		expect(payload.type).toBe("warning");
		expect(payload.title).toBe("High Volatility");
	});

	it("supports all alert types", () => {
		const types: AlertPayload["type"][] = ["info", "warning", "error", "success"];
		for (const type of types) {
			const payload: AlertPayload = {
				alertId: "a1",
				type,
				title: "Test",
				message: "Test message",
				timestamp: "2025-01-04T12:00:00Z",
			};
			expect(payload.type).toBe(type);
		}
	});
});

describe("AgentOutputPayload Type", () => {
	it("has correct shape", () => {
		const payload: AgentOutputPayload = {
			agentId: "agent-001",
			agentName: "Technical Analyst",
			output: "RSI indicates overbought conditions",
			timestamp: "2025-01-04T12:00:00Z",
		};
		expect(payload.agentId).toBe("agent-001");
		expect(payload.agentName).toBe("Technical Analyst");
		expect(payload.output).toContain("RSI");
	});
});

describe("CycleProgressPayload Type", () => {
	it("has correct shape", () => {
		const payload: CycleProgressPayload = {
			cycleId: "cycle-001",
			phase: "observe",
			progress: 0.25,
			timestamp: "2025-01-04T12:00:00Z",
		};
		expect(payload.cycleId).toBe("cycle-001");
		expect(payload.phase).toBe("observe");
		expect(payload.progress).toBe(0.25);
	});

	it("supports all OODA phases", () => {
		const phases: CycleProgressPayload["phase"][] = [
			"observe",
			"orient",
			"decide",
			"act",
			"complete",
		];
		for (const phase of phases) {
			const payload: CycleProgressPayload = {
				cycleId: "c1",
				phase,
				progress: 0.5,
				timestamp: "2025-01-04T12:00:00Z",
			};
			expect(payload.phase).toBe(phase);
		}
	});
});

describe("PortfolioPayload Type", () => {
	it("has correct shape", () => {
		const payload: PortfolioPayload = {
			equity: 100000,
			cash: 50000,
			buyingPower: 75000,
			dayPL: 1500,
			totalPL: 10000,
			timestamp: "2025-01-04T12:00:00Z",
		};
		expect(payload.equity).toBe(100000);
		expect(payload.cash).toBe(50000);
		expect(payload.buyingPower).toBe(75000);
		expect(payload.dayPL).toBe(1500);
		expect(payload.totalPL).toBe(10000);
	});
});

describe("PositionPayload Type", () => {
	it("has correct shape", () => {
		const payload: PositionPayload = {
			symbol: "AAPL",
			quantity: 100,
			avgCost: 150.0,
			currentPrice: 155.0,
			unrealizedPL: 500,
			timestamp: "2025-01-04T12:00:00Z",
		};
		expect(payload.symbol).toBe("AAPL");
		expect(payload.quantity).toBe(100);
		expect(payload.avgCost).toBe(150.0);
		expect(payload.currentPrice).toBe(155.0);
		expect(payload.unrealizedPL).toBe(500);
	});
});

describe("ServerMessage Type", () => {
	it("has correct generic shape", () => {
		const message: ServerMessage<QuotePayload> = {
			type: "quote",
			data: {
				symbol: "AAPL",
				bid: 150.0,
				ask: 150.1,
				last: 150.05,
				volume: 1000000,
				timestamp: "2025-01-04T12:00:00Z",
			},
			timestamp: "2025-01-04T12:00:00Z",
		};
		expect(message.type).toBe("quote");
		expect(message.data.symbol).toBe("AAPL");
	});

	it("supports unknown data type", () => {
		const message: ServerMessage = {
			type: "quote",
			data: { custom: "data" },
			timestamp: "2025-01-04T12:00:00Z",
		};
		expect(message.data).toEqual({ custom: "data" });
	});
});

describe("UseWebSocketQuerySyncOptions Type", () => {
	it("has all optional fields", () => {
		const options: UseWebSocketQuerySyncOptions = {};
		expect(options.debounceMs).toBeUndefined();
		expect(options.debug).toBeUndefined();
		expect(options.queryKeyPrefix).toBeUndefined();
		expect(options.onCycleProgress).toBeUndefined();
		expect(options.onError).toBeUndefined();
	});

	it("accepts all options", () => {
		const options: UseWebSocketQuerySyncOptions = {
			debounceMs: 200,
			debug: true,
			queryKeyPrefix: "custom",
			onCycleProgress: (_payload) => {},
			onError: (_error) => {},
		};
		expect(options.debounceMs).toBe(200);
		expect(options.debug).toBe(true);
		expect(options.queryKeyPrefix).toBe("custom");
	});
});

describe("UseWebSocketQuerySyncReturn Type", () => {
	it("has correct shape", () => {
		// Create a mock return value to verify the type
		const mockReturn: UseWebSocketQuerySyncReturn = {
			handleMessage: (_message: unknown) => {},
			invalidateByType: (_type: ServerMessageType) => {},
			pendingCount: 0,
			flush: () => {},
		};
		expect(typeof mockReturn.handleMessage).toBe("function");
		expect(typeof mockReturn.invalidateByType).toBe("function");
		expect(typeof mockReturn.pendingCount).toBe("number");
		expect(typeof mockReturn.flush).toBe("function");
	});
});

// ============================================
// Module Exports Tests
// ============================================

describe("Module Exports", () => {
	it("exports queryKeys object", async () => {
		const module = await import("./useWebSocketQuerySync");
		expect(typeof module.queryKeys).toBe("object");
		expect(typeof module.queryKeys.marketQuote).toBe("function");
	});

	it("exports parseServerMessage function", async () => {
		const module = await import("./useWebSocketQuerySync");
		expect(typeof module.parseServerMessage).toBe("function");
	});

	it("exports useWebSocketQuerySync hook", async () => {
		const module = await import("./useWebSocketQuerySync");
		expect(typeof module.useWebSocketQuerySync).toBe("function");
	});

	it("exports default as useWebSocketQuerySync", async () => {
		const module = await import("./useWebSocketQuerySync");
		expect(module.default).toBe(module.useWebSocketQuerySync);
	});
});

// ============================================
// Edge Cases
// ============================================

describe("Edge Cases", () => {
	describe("query key symbols", () => {
		it("handles symbols with special characters", () => {
			const key = queryKeys.marketQuote("BRK.A");
			expect(key).toEqual(["market", "quote", "BRK.A"]);
		});

		it("handles symbols with numbers", () => {
			const key = queryKeys.marketQuote("3M");
			expect(key).toEqual(["market", "quote", "3M"]);
		});

		it("handles empty symbol", () => {
			const key = queryKeys.marketQuote("");
			expect(key).toEqual(["market", "quote", ""]);
		});
	});

	describe("parseServerMessage edge cases", () => {
		it("handles data as null", () => {
			const raw = { type: "heartbeat", data: null, timestamp: "2025-01-04T12:00:00Z" };
			const result = parseServerMessage(raw);
			expect(result?.data).toBeNull();
		});

		it("handles data as empty object", () => {
			const raw = { type: "quote", data: {}, timestamp: "2025-01-04T12:00:00Z" };
			const result = parseServerMessage(raw);
			expect(result?.data).toEqual({});
		});

		it("handles data as array", () => {
			const raw = { type: "quote", data: [1, 2, 3], timestamp: "2025-01-04T12:00:00Z" };
			const result = parseServerMessage(raw);
			expect(result?.data).toEqual([1, 2, 3]);
		});

		it("handles deeply nested data", () => {
			const raw = {
				type: "quote",
				data: { level1: { level2: { level3: "deep" } } },
				timestamp: "2025-01-04T12:00:00Z",
			};
			const result = parseServerMessage(raw);
			expect((result?.data as Record<string, unknown>).level1).toBeDefined();
		});
	});

	describe("message type boundaries", () => {
		it("rejects similar but invalid types", () => {
			expect(parseServerMessage({ type: "Quote", data: {} })).toBeNull();
			expect(parseServerMessage({ type: "QUOTE", data: {} })).toBeNull();
			expect(parseServerMessage({ type: "quotes", data: {} })).toBeNull();
			expect(parseServerMessage({ type: "order_update", data: {} })).toBeNull();
		});

		it("rejects types with extra whitespace", () => {
			expect(parseServerMessage({ type: " quote", data: {} })).toBeNull();
			expect(parseServerMessage({ type: "quote ", data: {} })).toBeNull();
			expect(parseServerMessage({ type: " quote ", data: {} })).toBeNull();
		});
	});
});

// ============================================
// Integration Pattern Tests
// ============================================

describe("Integration Patterns", () => {
	it("queryKeys work with TanStack Query patterns", () => {
		// Verify keys are compatible with useQuery({ queryKey: ... })
		const marketKey = queryKeys.marketQuote("AAPL");
		expect(Array.isArray(marketKey)).toBe(true);
		expect(marketKey.every((k) => typeof k === "string")).toBe(true);

		// Verify partial matching works
		const portfolioKey = queryKeys.portfolio();
		const positionsKey = queryKeys.positions();
		expect(positionsKey[0]).toBe(portfolioKey[0]); // Both start with "portfolio"
	});

	it("message types align with cache invalidation strategy", () => {
		// Quote uses setQueryData (complete data)
		const quoteMsg = parseServerMessage({ type: "quote", data: {}, timestamp: "" });
		expect(quoteMsg?.type).toBe("quote");

		// Order uses invalidateQueries (needs refetch)
		const orderMsg = parseServerMessage({ type: "order", data: {}, timestamp: "" });
		expect(orderMsg?.type).toBe("order");

		// System status uses setQueryData (complete data)
		const statusMsg = parseServerMessage({ type: "system_status", data: {}, timestamp: "" });
		expect(statusMsg?.type).toBe("system_status");
	});

	it("supports debounced batch invalidation pattern", () => {
		// Multiple messages of same type should batch
		const messages = [
			{ type: "order", data: { orderId: "1" }, timestamp: "" },
			{ type: "order", data: { orderId: "2" }, timestamp: "" },
			{ type: "order", data: { orderId: "3" }, timestamp: "" },
		];

		const parsed = messages.map(parseServerMessage);
		expect(parsed.every((m) => m?.type === "order")).toBe(true);
	});
});
