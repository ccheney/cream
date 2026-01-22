/**
 * Tests for Data Validation Schemas
 *
 * @see storage.ts, helix.ts, validation.ts
 */

import { describe, expect, it } from "bun:test";
import { z } from "zod";
import {
	AlertInsertSchema,
	CandleInsertSchema,
	CitationNodeSchema,
	CitesEdgeSchema,
	coerceBool,
	coerceInt,
	containsSqlInjection,
	createTypeGuard,
	DatetimeSchema,
	DecisionInsertSchema,
	// HelixDB schemas
	EMBEDDING_DIMENSION,
	EmbeddingSchema,
	EquityTickerSchema,
	// Validation utilities
	formatValidationError,
	formatZodIssue,
	getErrorMessages,
	InvalidatesEdgeSchema,
	MemoryNodeSchema,
	OrderInsertSchema,
	parseWithDefaults,
	SupportsEdgeSchema,
	safeParse,
	safeString,
	sanitizeString,
	ThesisNodeSchema,
	TickerSymbolSchema,
	TransitionsEdgeSchema,
	UuidSchema,
	VectorSearchQuerySchema,
	validateBatch,
	validated,
	validatedSafe,
	validateThesisTransition,
} from "./index.js";

// ============================================
// Tests: Common Field Validators
// ============================================

describe("Common Field Validators", () => {
	describe("UuidSchema", () => {
		it("accepts valid UUIDs", () => {
			expect(UuidSchema.parse("550e8400-e29b-41d4-a716-446655440000")).toBeDefined();
			expect(UuidSchema.parse("f47ac10b-58cc-4372-a567-0e02b2c3d479")).toBeDefined();
		});

		it("rejects invalid UUIDs", () => {
			expect(() => UuidSchema.parse("not-a-uuid")).toThrow();
			expect(() => UuidSchema.parse("12345")).toThrow();
			expect(() => UuidSchema.parse("")).toThrow();
		});
	});

	describe("DatetimeSchema", () => {
		it("accepts valid ISO-8601 datetimes", () => {
			expect(DatetimeSchema.parse("2026-01-04T12:00:00Z")).toBeDefined();
			expect(DatetimeSchema.parse("2026-01-04T12:00:00.000Z")).toBeDefined();
		});

		it("rejects invalid datetimes", () => {
			expect(() => DatetimeSchema.parse("2026-01-04")).toThrow();
			expect(() => DatetimeSchema.parse("not-a-date")).toThrow();
		});
	});

	describe("TickerSymbolSchema", () => {
		it("accepts valid equity tickers", () => {
			expect(TickerSymbolSchema.parse("AAPL")).toBeDefined();
			expect(TickerSymbolSchema.parse("GOOGL")).toBeDefined();
			expect(TickerSymbolSchema.parse("A")).toBeDefined();
		});

		it("accepts valid option symbols", () => {
			expect(TickerSymbolSchema.parse("AAPL231215C00150000")).toBeDefined();
		});

		it("rejects invalid tickers", () => {
			expect(() => TickerSymbolSchema.parse("aapl")).toThrow(); // lowercase
			expect(() => TickerSymbolSchema.parse("AAPL ")).toThrow(); // space
			expect(() => TickerSymbolSchema.parse("")).toThrow(); // empty
		});
	});

	describe("EquityTickerSchema", () => {
		it("accepts valid equity tickers", () => {
			expect(EquityTickerSchema.parse("AAPL")).toBeDefined();
			expect(EquityTickerSchema.parse("A")).toBeDefined();
			expect(EquityTickerSchema.parse("GOOGL")).toBeDefined();
		});

		it("rejects tickers too long", () => {
			expect(() => EquityTickerSchema.parse("TOOLONG")).toThrow();
		});

		it("rejects numbers", () => {
			expect(() => EquityTickerSchema.parse("AAPL1")).toThrow();
		});
	});
});

// ============================================
// Tests: Storage Schemas
// ============================================

describe("Storage Schemas", () => {
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
			const result = DecisionInsertSchema.safeParse(validDecision);
			expect(result.success).toBe(true);
		});

		it("accepts decision with null prices", () => {
			const result = DecisionInsertSchema.safeParse({
				...validDecision,
				entryPrice: null,
				stopLoss: null,
				takeProfit: null,
			});
			expect(result.success).toBe(true);
		});

		it("rejects invalid action", () => {
			const result = DecisionInsertSchema.safeParse({
				...validDecision,
				action: "INVALID",
			});
			expect(result.success).toBe(false);
		});

		it("rejects negative size", () => {
			const result = DecisionInsertSchema.safeParse({
				...validDecision,
				size: -100,
			});
			expect(result.success).toBe(false);
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
			const result = OrderInsertSchema.safeParse(validOrder);
			expect(result.success).toBe(true);
		});

		it("requires limitPrice for LIMIT orders", () => {
			const result = OrderInsertSchema.safeParse({
				...validOrder,
				limitPrice: null,
			});
			expect(result.success).toBe(false);
		});

		it("requires stopPrice for STOP orders", () => {
			const result = OrderInsertSchema.safeParse({
				...validOrder,
				orderType: "STOP",
				stopPrice: null,
				limitPrice: null,
			});
			expect(result.success).toBe(false);
		});

		it("accepts MARKET order without prices", () => {
			const result = OrderInsertSchema.safeParse({
				...validOrder,
				orderType: "MARKET",
				limitPrice: null,
			});
			expect(result.success).toBe(true);
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
			const result = AlertInsertSchema.safeParse(validAlert);
			expect(result.success).toBe(true);
		});

		it("rejects invalid severity", () => {
			const result = AlertInsertSchema.safeParse({
				...validAlert,
				severity: "extreme",
			});
			expect(result.success).toBe(false);
		});

		it("rejects empty title", () => {
			const result = AlertInsertSchema.safeParse({
				...validAlert,
				title: "",
			});
			expect(result.success).toBe(false);
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
			const result = CandleInsertSchema.safeParse(validCandle);
			expect(result.success).toBe(true);
		});

		it("rejects candle where high < low", () => {
			const result = CandleInsertSchema.safeParse({
				...validCandle,
				high: 148.0,
				low: 150.0,
			});
			expect(result.success).toBe(false);
		});

		it("rejects candle where high < open", () => {
			const result = CandleInsertSchema.safeParse({
				...validCandle,
				high: 149.0, // lower than open (150)
				open: 150.0,
			});
			expect(result.success).toBe(false);
		});

		it("rejects candle where low > close", () => {
			const result = CandleInsertSchema.safeParse({
				...validCandle,
				low: 152.0, // higher than close (151.5)
				close: 151.5,
			});
			expect(result.success).toBe(false);
		});
	});
});

// ============================================
// Tests: HelixDB Schemas
// ============================================

describe("HelixDB Schemas", () => {
	describe("EmbeddingSchema", () => {
		it("accepts valid embedding", () => {
			const embedding = new Array(EMBEDDING_DIMENSION).fill(0.1);
			const result = EmbeddingSchema.safeParse(embedding);
			expect(result.success).toBe(true);
		});

		it("rejects wrong dimension", () => {
			const embedding = new Array(100).fill(0.1);
			const result = EmbeddingSchema.safeParse(embedding);
			expect(result.success).toBe(false);
		});

		it("rejects non-numeric values", () => {
			const embedding = new Array(EMBEDDING_DIMENSION).fill("not a number");
			const result = EmbeddingSchema.safeParse(embedding);
			expect(result.success).toBe(false);
		});
	});

	describe("MemoryNodeSchema", () => {
		const validMemory = {
			id: "550e8400-e29b-41d4-a716-446655440000",
			content: "AAPL showing strong momentum with RSI above 70",
			embedding: new Array(EMBEDDING_DIMENSION).fill(0.1),
			createdAt: "2026-01-04T12:00:00Z",
			agentType: "technical",
			cycleId: "cycle-001",
			symbol: "AAPL",
		};

		it("accepts valid memory node", () => {
			const result = MemoryNodeSchema.safeParse(validMemory);
			expect(result.success).toBe(true);
		});

		it("rejects invalid agent type", () => {
			const result = MemoryNodeSchema.safeParse({
				...validMemory,
				agentType: "invalid_agent",
			});
			expect(result.success).toBe(false);
		});
	});

	describe("CitationNodeSchema", () => {
		const validCitation = {
			id: "550e8400-e29b-41d4-a716-446655440000",
			url: "https://www.example.com/article",
			title: "Apple Reports Record Earnings",
			contentSnippet: "Apple Inc. reported record quarterly earnings...",
			relevanceScore: 0.85,
			source: "NEWS_API",
			fetchedAt: "2026-01-04T12:00:00Z",
			sentiment: 0.6,
		};

		it("accepts valid citation", () => {
			const result = CitationNodeSchema.safeParse(validCitation);
			expect(result.success).toBe(true);
		});

		it("rejects invalid URL", () => {
			const result = CitationNodeSchema.safeParse({
				...validCitation,
				url: "not-a-url",
			});
			expect(result.success).toBe(false);
		});

		it("rejects invalid source", () => {
			const result = CitationNodeSchema.safeParse({
				...validCitation,
				source: "INVALID_SOURCE",
			});
			expect(result.success).toBe(false);
		});
	});

	describe("ThesisNodeSchema", () => {
		const validThesis = {
			id: "550e8400-e29b-41d4-a716-446655440000",
			symbol: "AAPL",
			narrative:
				"Apple is positioned for growth due to strong iPhone sales and services revenue expansion",
			state: "WATCHING",
			createdAt: "2026-01-04T12:00:00Z",
			updatedAt: "2026-01-04T12:00:00Z",
			entryTrigger: "Break above $155 with volume",
			exitTrigger: "Close below $140",
			invalidation: "Revenue miss by > 10%",
			targetPrice: 175.0,
			stopPrice: 140.0,
			timeHorizon: "2-4 weeks",
			confidence: 0.75,
		};

		it("accepts valid thesis", () => {
			const result = ThesisNodeSchema.safeParse(validThesis);
			expect(result.success).toBe(true);
		});

		it("rejects invalid state", () => {
			const result = ThesisNodeSchema.safeParse({
				...validThesis,
				state: "INVALID_STATE",
			});
			expect(result.success).toBe(false);
		});

		it("rejects short narrative", () => {
			const result = ThesisNodeSchema.safeParse({
				...validThesis,
				narrative: "Too short",
			});
			expect(result.success).toBe(false);
		});
	});

	describe("Edge Schemas", () => {
		const baseEdge = {
			fromId: "550e8400-e29b-41d4-a716-446655440000",
			toId: "550e8400-e29b-41d4-a716-446655440001",
			createdAt: "2026-01-04T12:00:00Z",
		};

		it("validates CitesEdge", () => {
			const result = CitesEdgeSchema.safeParse({
				...baseEdge,
				relevanceScore: 0.85,
			});
			expect(result.success).toBe(true);
		});

		it("validates SupportsEdge", () => {
			const result = SupportsEdgeSchema.safeParse({
				...baseEdge,
				confidence: 0.9,
				reasoning: "Strong correlation observed",
			});
			expect(result.success).toBe(true);
		});

		it("validates InvalidatesEdge", () => {
			const result = InvalidatesEdgeSchema.safeParse({
				...baseEdge,
				reason: "Revenue missed expectations by 15%",
				severity: "major",
			});
			expect(result.success).toBe(true);
		});

		it("validates TransitionsEdge", () => {
			const result = TransitionsEdgeSchema.safeParse({
				...baseEdge,
				fromState: "WATCHING",
				toState: "ENTERED",
				timestamp: "2026-01-04T12:00:00Z",
				reason: "Entry trigger hit",
				triggeredBy: "price_action",
			});
			expect(result.success).toBe(true);
		});
	});

	describe("validateThesisTransition", () => {
		it("allows WATCHING -> ENTERED", () => {
			expect(validateThesisTransition("WATCHING", "ENTERED")).toBe(true);
		});

		it("allows WATCHING -> CLOSED", () => {
			expect(validateThesisTransition("WATCHING", "CLOSED")).toBe(true);
		});

		it("allows ENTERED -> EXITING", () => {
			expect(validateThesisTransition("ENTERED", "EXITING")).toBe(true);
		});

		it("allows INVALIDATED -> CLOSED", () => {
			expect(validateThesisTransition("INVALIDATED", "CLOSED")).toBe(true);
		});

		it("disallows CLOSED -> any", () => {
			expect(validateThesisTransition("CLOSED", "WATCHING")).toBe(false);
			expect(validateThesisTransition("CLOSED", "ENTERED")).toBe(false);
		});

		it("disallows WATCHING -> MANAGING (skips steps)", () => {
			expect(validateThesisTransition("WATCHING", "MANAGING")).toBe(false);
		});
	});

	describe("VectorSearchQuerySchema", () => {
		it("accepts valid search query", () => {
			const query = {
				embedding: new Array(EMBEDDING_DIMENSION).fill(0.1),
				topK: 10,
				minSimilarity: 0.7,
				filterAgentTypes: ["technical", "trader"],
				filterSymbols: ["AAPL", "GOOGL"],
			};
			const result = VectorSearchQuerySchema.safeParse(query);
			expect(result.success).toBe(true);
		});

		it("applies defaults", () => {
			const query = {
				embedding: new Array(EMBEDDING_DIMENSION).fill(0.1),
			};
			const result = VectorSearchQuerySchema.parse(query);
			expect(result.topK).toBe(10);
			expect(result.minSimilarity).toBe(0.7);
		});

		it("rejects topK out of range", () => {
			const query = {
				embedding: new Array(EMBEDDING_DIMENSION).fill(0.1),
				topK: 200,
			};
			const result = VectorSearchQuerySchema.safeParse(query);
			expect(result.success).toBe(false);
		});
	});
});

// ============================================
// Tests: Validation Utilities
// ============================================

describe("Validation Utilities", () => {
	describe("formatValidationError", () => {
		it("formats Zod error correctly", () => {
			const schema = z.object({
				name: z.string().min(1),
				age: z.number().positive(),
			});

			const result = schema.safeParse({ name: "", age: -5 });
			expect(result.success).toBe(false);

			if (!result.success) {
				const formatted = formatValidationError(result.error);
				expect(formatted.type).toBe("validation_error");
				expect(formatted.fields.length).toBe(2);
				expect(formatted.timestamp).toBeDefined();
			}
		});
	});

	describe("formatZodIssue", () => {
		it("formats issue with path", () => {
			// Test with a real Zod error to get the actual issue format
			const schema = z.object({ user: z.object({ name: z.string() }) });
			const result = schema.safeParse({ user: { name: 123 } });
			expect(result.success).toBe(false);
			if (!result.success) {
				const formatted = formatZodIssue(result.error.issues[0]);
				expect(formatted.path).toBe("user.name");
				expect(formatted.code).toBe("invalid_type");
				expect(formatted.expected).toBe("string");
			}
		});
	});

	describe("getErrorMessages", () => {
		it("returns concatenated error messages", () => {
			const schema = z.object({
				a: z.string(),
				b: z.number(),
			});

			const result = schema.safeParse({ a: 123, b: "not a number" });
			expect(result.success).toBe(false);

			if (!result.success) {
				const messages = getErrorMessages(result.error);
				expect(messages).toContain("a:");
				expect(messages).toContain("b:");
			}
		});
	});

	describe("safeParse", () => {
		it("returns success with data for valid input", () => {
			const schema = z.object({ name: z.string() });
			const result = safeParse(schema, { name: "test" });

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.name).toBe("test");
			}
		});

		it("returns error for invalid input", () => {
			const schema = z.object({ name: z.string() });
			const result = safeParse(schema, { name: 123 });

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.type).toBe("validation_error");
			}
		});
	});

	describe("parseWithDefaults", () => {
		it("applies default values", () => {
			const schema = z.object({
				name: z.string(),
				count: z.number().default(10),
			});

			const result = parseWithDefaults(schema, { name: "test" });
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.count).toBe(10);
			}
		});
	});
});

// ============================================
// Tests: SQL Injection Prevention
// ============================================

describe("SQL Injection Prevention", () => {
	describe("containsSqlInjection", () => {
		it("detects SQL injection patterns", () => {
			expect(containsSqlInjection("'; DROP TABLE users; --")).toBe(true);
			expect(containsSqlInjection("1 OR 1=1")).toBe(true);
			expect(containsSqlInjection("admin'--")).toBe(true);
			expect(containsSqlInjection("SELECT * FROM users")).toBe(false); // No injection chars
		});

		it("accepts safe strings", () => {
			expect(containsSqlInjection("John Doe")).toBe(false);
			expect(containsSqlInjection("user@example.com")).toBe(false);
			expect(containsSqlInjection("AAPL")).toBe(false);
		});
	});

	describe("safeString", () => {
		it("rejects SQL injection attempts", () => {
			const SafeNameSchema = safeString(1, 100);
			expect(() => SafeNameSchema.parse("admin'; DROP TABLE users; --")).toThrow();
		});

		it("accepts safe strings", () => {
			const SafeNameSchema = safeString(1, 100);
			expect(SafeNameSchema.parse("John Doe")).toBe("John Doe");
		});
	});

	describe("sanitizeString", () => {
		it("escapes dangerous characters", () => {
			expect(sanitizeString("O'Brien")).toBe("O''Brien");
			expect(sanitizeString('Say "Hello"')).toBe('Say ""Hello""');
			expect(sanitizeString("DROP; TABLE")).toBe("DROP TABLE");
		});
	});
});

// ============================================
// Tests: Validation Decorators
// ============================================

describe("Validation Decorators", () => {
	describe("validated", () => {
		it("validates before executing function", async () => {
			const schema = z.object({ value: z.number().positive() });
			const fn = validated(schema, (data) => data.value * 2);

			expect(await fn({ value: 5 })).toBe(10);
			await expect(fn({ value: -5 })).rejects.toThrow();
		});
	});

	describe("validatedSafe", () => {
		it("returns result instead of throwing", async () => {
			const schema = z.object({ value: z.number().positive() });
			const fn = validatedSafe(schema, (data) => data.value * 2);

			const successResult = await fn({ value: 5 });
			expect(successResult.success).toBe(true);
			if (successResult.success) {
				expect(successResult.data).toBe(10);
			}

			const errorResult = await fn({ value: -5 });
			expect(errorResult.success).toBe(false);
		});
	});
});

// ============================================
// Tests: Batch Validation
// ============================================

describe("Batch Validation", () => {
	describe("validateBatch", () => {
		it("separates valid and invalid items", () => {
			const schema = z.object({ value: z.number().positive() });
			const items = [{ value: 1 }, { value: -1 }, { value: 2 }, { value: -2 }];

			const result = validateBatch(schema, items);

			expect(result.valid.length).toBe(2);
			expect(result.invalid.length).toBe(2);
			expect(result.invalid[0].index).toBe(1);
			expect(result.invalid[1].index).toBe(3);
		});
	});
});

// ============================================
// Tests: Type Guards
// ============================================

describe("Type Guards", () => {
	describe("createTypeGuard", () => {
		it("creates working type guard", () => {
			const schema = z.object({ name: z.string() });
			const isValid = createTypeGuard(schema);

			expect(isValid({ name: "test" })).toBe(true);
			expect(isValid({ name: 123 })).toBe(false);
			expect(isValid(null)).toBe(false);
		});
	});
});

// ============================================
// Tests: Coercion
// ============================================

describe("Coercion", () => {
	describe("coerceInt", () => {
		it("coerces string to int", () => {
			const schema = z.object({ page: coerceInt(1) });
			const result = schema.parse({ page: "5" });
			expect(result.page).toBe(5);
		});

		it("uses default for NaN", () => {
			const schema = z.object({ page: coerceInt(1) });
			const result = schema.parse({ page: "not-a-number" });
			expect(result.page).toBe(1);
		});
	});

	describe("coerceBool", () => {
		it("coerces to boolean", () => {
			const schema = z.object({ active: coerceBool(false) });

			expect(schema.parse({ active: "true" }).active).toBe(true);
			expect(schema.parse({ active: "false" }).active).toBe(false);
			expect(schema.parse({ active: 1 }).active).toBe(true);
			expect(schema.parse({ active: 0 }).active).toBe(false);
		});
	});
});
