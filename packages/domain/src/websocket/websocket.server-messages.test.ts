import { describe, expect, it } from "bun:test";
import {
	AgentOutputMessageSchema,
	AlertMessageSchema,
	CycleProgressMessageSchema,
	ErrorMessageSchema,
	OrderMessageSchema,
	PongMessageSchema,
	QuoteMessageSchema,
	ScannerAlertMessageSchema,
	ScannerStatusMessageSchema,
	ServerMessageSchema,
	SystemStatusMessageSchema,
} from "./index.js";

describe("QuoteMessage", () => {
	it("validates valid quote message", () => {
		const msg = {
			type: "quote",
			data: {
				symbol: "AAPL",
				bid: 185,
				ask: 185.05,
				last: 185.02,
				volume: 1000000,
				timestamp: "2026-01-04T14:00:00Z",
			},
		};
		expect(QuoteMessageSchema.safeParse(msg).success).toBe(true);
	});

	it("rejects negative price", () => {
		const msg = {
			type: "quote",
			data: {
				symbol: "AAPL",
				bid: -10,
				ask: 185.05,
				last: 185.02,
				volume: 1000000,
				timestamp: "2026-01-04T14:00:00Z",
			},
		};
		expect(QuoteMessageSchema.safeParse(msg).success).toBe(false);
	});
});

describe("OrderMessage", () => {
	it("validates valid order message", () => {
		const msg = {
			type: "order",
			data: {
				id: "550e8400-e29b-41d4-a716-446655440000",
				symbol: "AAPL",
				side: "buy",
				orderType: "limit",
				status: "filled",
				quantity: 100,
				filledQty: 100,
				avgPrice: 185,
				timestamp: "2026-01-04T14:00:00Z",
			},
		};
		expect(OrderMessageSchema.safeParse(msg).success).toBe(true);
	});

	it("rejects invalid order status", () => {
		const msg = {
			type: "order",
			data: {
				id: "550e8400-e29b-41d4-a716-446655440000",
				symbol: "AAPL",
				side: "buy",
				orderType: "limit",
				status: "invalid_status",
				quantity: 100,
				filledQty: 0,
				timestamp: "2026-01-04T14:00:00Z",
			},
		};
		expect(OrderMessageSchema.safeParse(msg).success).toBe(false);
	});
});

describe("AgentOutputMessage", () => {
	it("validates valid agent output", () => {
		const msg = {
			type: "agent_output",
			data: {
				cycleId: "cycle-2026-01-04-14",
				agentType: "trader",
				status: "complete",
				output: "Bullish setup detected for AAPL",
				confidence: 0.78,
				timestamp: "2026-01-04T14:00:00Z",
			},
		};
		expect(AgentOutputMessageSchema.safeParse(msg).success).toBe(true);
	});

	it("rejects confidence > 1", () => {
		const msg = {
			type: "agent_output",
			data: {
				cycleId: "cycle-2026-01-04-14",
				agentType: "trader",
				status: "complete",
				output: "Test",
				confidence: 1.5,
				timestamp: "2026-01-04T14:00:00Z",
			},
		};
		expect(AgentOutputMessageSchema.safeParse(msg).success).toBe(false);
	});
});

describe("CycleProgressMessage", () => {
	it("validates valid cycle progress", () => {
		const msg = {
			type: "cycle_progress",
			data: {
				cycleId: "cycle-2026-01-04-14",
				phase: "decide",
				step: "Trader Agent",
				progress: 75,
				message: "Processing trader decision",
				timestamp: "2026-01-04T14:00:00Z",
			},
		};
		expect(CycleProgressMessageSchema.safeParse(msg).success).toBe(true);
	});

	it("rejects out-of-bounds progress", () => {
		expect(
			CycleProgressMessageSchema.safeParse({
				type: "cycle_progress",
				data: {
					cycleId: "cycle-2026-01-04-14",
					phase: "decide",
					step: "Test",
					progress: 150,
					message: "Test",
					timestamp: "2026-01-04T14:00:00Z",
				},
			}).success,
		).toBe(false);
		expect(
			CycleProgressMessageSchema.safeParse({
				type: "cycle_progress",
				data: {
					cycleId: "cycle-2026-01-04-14",
					phase: "decide",
					step: "Test",
					progress: -10,
					message: "Test",
					timestamp: "2026-01-04T14:00:00Z",
				},
			}).success,
		).toBe(false);
	});
});

describe("AlertMessage", () => {
	it("validates valid alert", () => {
		const msg = {
			type: "alert",
			data: {
				id: "550e8400-e29b-41d4-a716-446655440000",
				severity: "warning",
				title: "Position Size Warning",
				message: "Position size exceeds recommended limit",
				timestamp: "2026-01-04T14:00:00Z",
			},
		};
		expect(AlertMessageSchema.safeParse(msg).success).toBe(true);
	});

	it("rejects invalid severity", () => {
		const msg = {
			type: "alert",
			data: {
				id: "550e8400-e29b-41d4-a716-446655440000",
				severity: "super_critical",
				title: "Test",
				message: "Test",
				timestamp: "2026-01-04T14:00:00Z",
			},
		};
		expect(AlertMessageSchema.safeParse(msg).success).toBe(false);
	});
});

describe("SystemStatusMessage", () => {
	it("validates valid system status", () => {
		const msg = {
			type: "system_status",
			data: {
				health: "healthy",
				uptimeSeconds: 3600,
				activeConnections: 5,
				services: {
					api: {
						status: "healthy",
						latencyMs: 50,
						lastCheck: "2026-01-04T14:00:00Z",
					},
				},
				environment: "PAPER",
				timestamp: "2026-01-04T14:00:00Z",
			},
		};
		expect(SystemStatusMessageSchema.safeParse(msg).success).toBe(true);
	});
});

describe("ScannerAlertMessage", () => {
	it("validates scanner alert message", () => {
		const msg = {
			type: "scanner_alert",
			data: {
				symbol: "NVDA",
				signals: ["volume_spike", "price_move"],
				price: 812.44,
				volume: 1245000,
				avgVolume: 410000,
				volumeRatio: 3.03,
				priceChangePct: 2.84,
				gapPct: 0.91,
				approxAtr: 14.2,
				timestamp: "2026-02-22T14:00:00Z",
			},
		};
		expect(ScannerAlertMessageSchema.safeParse(msg).success).toBe(true);
	});

	it("rejects scanner alert with empty signals", () => {
		expect(
			ScannerAlertMessageSchema.safeParse({
				type: "scanner_alert",
				data: {
					symbol: "NVDA",
					signals: [],
					price: 812.44,
					volume: 1245000,
					avgVolume: 410000,
					volumeRatio: 3.03,
					priceChangePct: 2.84,
					gapPct: 0.91,
					approxAtr: 14.2,
					timestamp: "2026-02-22T14:00:00Z",
				},
			}).success,
		).toBe(false);
	});
});

describe("ScannerStatusMessage", () => {
	it("validates scanner status message", () => {
		const msg = {
			type: "scanner_status",
			data: {
				active: true,
				symbolsTracked: 4389,
				totalAlerts: 1294,
				alertsLastHour: 53,
				configVersion: "scanner-v3",
				timestamp: "2026-02-22T14:00:00Z",
			},
		};
		expect(ScannerStatusMessageSchema.safeParse(msg).success).toBe(true);
	});
});

describe("PongMessage", () => {
	it("validates and rejects timestamp formats", () => {
		expect(
			PongMessageSchema.safeParse({ type: "pong", timestamp: "2026-01-04T14:00:00Z" }).success,
		).toBe(true);
		expect(
			PongMessageSchema.safeParse({ type: "pong", timestamp: "not-a-timestamp" }).success,
		).toBe(false);
	});
});

describe("ErrorMessage", () => {
	it("validates error message", () => {
		const msg = { type: "error", code: "INVALID_MESSAGE", message: "Could not parse message" };
		expect(ErrorMessageSchema.safeParse(msg).success).toBe(true);
	});
});

describe("ServerMessage discriminated union", () => {
	it("parses quote messages", () => {
		const msg = {
			type: "quote",
			data: {
				symbol: "AAPL",
				bid: 185,
				ask: 185.05,
				last: 185.02,
				volume: 1000000,
				timestamp: "2026-01-04T14:00:00Z",
			},
		};
		const result = ServerMessageSchema.safeParse(msg);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.type).toBe("quote");
		}
	});

	it("rejects unknown message type", () => {
		expect(ServerMessageSchema.safeParse({ type: "unknown_type" }).success).toBe(false);
	});
});
