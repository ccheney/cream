import { describe, expect, it } from "bun:test";
import {
	AlertInsertSchema,
	CandleInsertSchema,
	DecisionInsertSchema,
	OrderInsertSchema,
} from "./index.js";

describe("DecisionInsertSchema", () => {
	const validDecision = {
		id: "550e8400-e29b-41d4-a716-446655440000",
		cycleId: "cycle-001",
		symbol: "AAPL",
		action: "BUY",
		direction: "LONG",
		size: 100,
		sizeUnit: "SHARES",
		entryPrice: 150.0,
		stopLoss: 145.0,
		takeProfit: 160.0,
		status: "PENDING",
		rationale: "Strong momentum with breakout above resistance",
		confidence: 0.85,
		createdAt: "2026-01-04T12:00:00Z",
		updatedAt: "2026-01-04T12:00:00Z",
	};

	it("accepts valid decision", () => {
		expect(DecisionInsertSchema.safeParse(validDecision).success).toBe(true);
	});

	it("accepts decision with null prices", () => {
		expect(
			DecisionInsertSchema.safeParse({
				...validDecision,
				entryPrice: null,
				stopLoss: null,
				takeProfit: null,
			}).success,
		).toBe(true);
	});

	it("rejects invalid action", () => {
		expect(DecisionInsertSchema.safeParse({ ...validDecision, action: "INVALID" }).success).toBe(
			false,
		);
	});

	it("rejects negative size", () => {
		expect(DecisionInsertSchema.safeParse({ ...validDecision, size: -100 }).success).toBe(false);
	});

	it("rejects confidence out of range", () => {
		expect(DecisionInsertSchema.safeParse({ ...validDecision, confidence: 1.5 }).success).toBe(
			false,
		);
		expect(DecisionInsertSchema.safeParse({ ...validDecision, confidence: -0.5 }).success).toBe(
			false,
		);
	});
});

describe("OrderInsertSchema", () => {
	const validOrder = {
		id: "550e8400-e29b-41d4-a716-446655440000",
		decisionId: "550e8400-e29b-41d4-a716-446655440001",
		symbol: "AAPL",
		side: "BUY",
		quantity: 100,
		orderType: "LIMIT",
		limitPrice: 150.0,
		stopPrice: null,
		status: "NEW",
		brokerOrderId: null,
		filledQuantity: 0,
		avgFillPrice: null,
		commission: 0,
		submittedAt: "2026-01-04T12:00:00Z",
		acceptedAt: null,
		filledAt: null,
		createdAt: "2026-01-04T12:00:00Z",
		updatedAt: "2026-01-04T12:00:00Z",
	};

	it("accepts valid order", () => {
		expect(OrderInsertSchema.safeParse(validOrder).success).toBe(true);
	});

	it("requires limitPrice for LIMIT orders", () => {
		expect(OrderInsertSchema.safeParse({ ...validOrder, limitPrice: null }).success).toBe(false);
	});

	it("requires stopPrice for STOP orders", () => {
		expect(
			OrderInsertSchema.safeParse({
				...validOrder,
				orderType: "STOP",
				stopPrice: null,
				limitPrice: null,
			}).success,
		).toBe(false);
	});

	it("accepts MARKET order without prices", () => {
		expect(
			OrderInsertSchema.safeParse({
				...validOrder,
				orderType: "MARKET",
				limitPrice: null,
			}).success,
		).toBe(true);
	});
});

describe("AlertInsertSchema", () => {
	const validAlert = {
		id: "550e8400-e29b-41d4-a716-446655440000",
		severity: "warning",
		alertType: "price_target",
		title: "AAPL hit target",
		message: "AAPL has reached the take-profit target of $160",
		source: "trading_system",
		acknowledged: false,
		acknowledgedAt: null,
		acknowledgedBy: null,
		metadata: { symbol: "AAPL", targetPrice: 160 },
		createdAt: "2026-01-04T12:00:00Z",
	};

	it("accepts valid alert", () => {
		expect(AlertInsertSchema.safeParse(validAlert).success).toBe(true);
	});

	it("rejects invalid severity", () => {
		expect(AlertInsertSchema.safeParse({ ...validAlert, severity: "extreme" }).success).toBe(false);
	});

	it("rejects empty title", () => {
		expect(AlertInsertSchema.safeParse({ ...validAlert, title: "" }).success).toBe(false);
	});
});

describe("CandleInsertSchema", () => {
	const validCandle = {
		id: "550e8400-e29b-41d4-a716-446655440000",
		symbol: "AAPL",
		timeframe: "1h",
		timestamp: "2026-01-04T12:00:00Z",
		open: 150.0,
		high: 152.0,
		low: 149.0,
		close: 151.5,
		volume: 1000000,
		vwap: 150.5,
		tradeCount: 5000,
	};

	it("accepts valid candle", () => {
		expect(CandleInsertSchema.safeParse(validCandle).success).toBe(true);
	});

	it("rejects candle where high < low", () => {
		expect(CandleInsertSchema.safeParse({ ...validCandle, high: 148.0, low: 150.0 }).success).toBe(
			false,
		);
	});

	it("rejects candle where high < open", () => {
		expect(CandleInsertSchema.safeParse({ ...validCandle, high: 149.0, open: 150.0 }).success).toBe(
			false,
		);
	});

	it("rejects candle where low > close", () => {
		expect(CandleInsertSchema.safeParse({ ...validCandle, low: 152.0, close: 151.5 }).success).toBe(
			false,
		);
	});
});
