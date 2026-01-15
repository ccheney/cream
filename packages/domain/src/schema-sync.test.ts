/**
 * Zod-Proto Schema Sync Tests
 *
 * Validates that Zod schemas correctly parse JSON that matches Protobuf definitions.
 * Prevents schema drift between TypeScript Zod schemas and Protobuf definitions.
 *
 * @see docs/plans/14-testing.md lines 236-270
 */

import { describe, expect, it } from "bun:test";

// Import Zod schemas from domain
import {
	Action,
	DecisionPlanSchema,
	DecisionSchema,
	InstrumentSchema,
	InstrumentType,
	OrderType,
	SizeUnit,
	StrategyFamily,
	TimeInForce,
} from "./decision.js";

// ============================================
// Helper: Load Proto Examples
// ============================================

/**
 * Load a JSON example from packages/proto/examples/
 */
async function loadProtoExample<T = unknown>(filename: string): Promise<T> {
	const examplesDir = `${import.meta.dir}/../../schema/examples`;
	return Bun.file(`${examplesDir}/${filename}`).json() as Promise<T>;
}

// ============================================
// Decision Schema Sync Tests
// ============================================

describe("Decision Schema Sync", () => {
	describe("Valid Examples", () => {
		it("validates equity decision from proto example", async () => {
			const example = await loadProtoExample("decision.json");
			const result = DecisionSchema.safeParse(example);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.instrument.instrumentType).toBe("EQUITY");
				expect(result.data.action).toBe("BUY");
				expect(result.data.confidence).toBe(0.78);
			}
		});

		it("validates option decision from proto example", async () => {
			const example = await loadProtoExample("option_decision.json");
			const result = DecisionSchema.safeParse(example);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.instrument.instrumentType).toBe("OPTION");
				expect(result.data.instrument.optionContract).toBeDefined();
				expect(result.data.instrument.optionContract?.optionType).toBe("CALL");
			}
		});
	});

	describe("Invalid Instrument Type", () => {
		it("rejects CRYPTO as instrument type", async () => {
			const invalid = {
				...(await loadProtoExample("decision.json")),
				instrument: {
					instrumentId: "BTC",
					instrumentType: "CRYPTO", // Invalid - not in enum
				},
			};

			const result = DecisionSchema.safeParse(invalid);
			expect(result.success).toBe(false);
		});

		it("rejects FUTURES as instrument type", async () => {
			const invalid = {
				...(await loadProtoExample("decision.json")),
				instrument: {
					instrumentId: "ES",
					instrumentType: "FUTURES", // Invalid
				},
			};

			const result = DecisionSchema.safeParse(invalid);
			expect(result.success).toBe(false);
		});
	});

	describe("Invalid Action", () => {
		it("rejects CLOSE as action", async () => {
			const example = await loadProtoExample("decision.json");
			const invalid = { ...example, action: "CLOSE" }; // Not in current enum

			const result = DecisionSchema.safeParse(invalid);
			expect(result.success).toBe(false);
		});

		it("rejects lowercase action", async () => {
			const example = await loadProtoExample("decision.json");
			const invalid = { ...example, action: "buy" }; // lowercase

			const result = DecisionSchema.safeParse(invalid);
			expect(result.success).toBe(false);
		});
	});

	describe("Missing Required Fields", () => {
		it("rejects decision without instrument", async () => {
			const example = await loadProtoExample("decision.json");
			const { instrument: _, ...invalid } = example as Record<string, unknown>;

			const result = DecisionSchema.safeParse(invalid);
			expect(result.success).toBe(false);
		});

		it("rejects decision without action", async () => {
			const example = await loadProtoExample("decision.json");
			const { action: _, ...invalid } = example as Record<string, unknown>;

			const result = DecisionSchema.safeParse(invalid);
			expect(result.success).toBe(false);
		});

		it("rejects decision without size", async () => {
			const example = await loadProtoExample("decision.json");
			const { size: _, ...invalid } = example as Record<string, unknown>;

			const result = DecisionSchema.safeParse(invalid);
			expect(result.success).toBe(false);
		});

		it("rejects decision without riskLevels", async () => {
			const example = await loadProtoExample("decision.json");
			const { riskLevels: _, ...invalid } = example as Record<string, unknown>;

			const result = DecisionSchema.safeParse(invalid);
			expect(result.success).toBe(false);
		});

		it("rejects decision without rationale", async () => {
			const example = await loadProtoExample("decision.json");
			const { rationale: _, ...invalid } = example as Record<string, unknown>;

			const result = DecisionSchema.safeParse(invalid);
			expect(result.success).toBe(false);
		});
	});

	describe("Invalid Field Types", () => {
		it("rejects string confidence instead of number", async () => {
			const example = await loadProtoExample("decision.json");
			const invalid = { ...example, confidence: "0.78" }; // string instead of number

			const result = DecisionSchema.safeParse(invalid);
			expect(result.success).toBe(false);
		});

		it("rejects negative quantity", async () => {
			const example = (await loadProtoExample("decision.json")) as Record<string, unknown>;
			const invalid = {
				...example,
				size: {
					...(example.size as Record<string, unknown>),
					quantity: -10,
				},
			};

			const result = DecisionSchema.safeParse(invalid);
			expect(result.success).toBe(false);
		});

		it("rejects confidence outside 0-1 range", async () => {
			const example = await loadProtoExample("decision.json");
			const invalid = { ...example, confidence: 1.5 }; // > 1

			const result = DecisionSchema.safeParse(invalid);
			expect(result.success).toBe(false);
		});
	});
});

// ============================================
// DecisionPlan Schema Sync Tests
// ============================================

describe("DecisionPlan Schema Sync", () => {
	describe("Valid Examples", () => {
		it("validates decision plan from proto example", async () => {
			const example = await loadProtoExample("decision_plan.json");
			const result = DecisionPlanSchema.safeParse(example);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.cycleId).toBeDefined();
				expect(result.data.environment).toBe("PAPER");
				expect(result.data.decisions).toHaveLength(1);
			}
		});
	});

	describe("Invalid Environment", () => {
		it("rejects PRODUCTION as environment", async () => {
			const example = await loadProtoExample("decision_plan.json");
			const invalid = { ...example, environment: "PRODUCTION" }; // Not in enum

			const result = DecisionPlanSchema.safeParse(invalid);
			expect(result.success).toBe(false);
		});

		it("accepts all valid environments", async () => {
			const example = await loadProtoExample("decision_plan.json");

			for (const env of ["BACKTEST", "PAPER", "LIVE"]) {
				const valid = { ...example, environment: env };
				const result = DecisionPlanSchema.safeParse(valid);
				expect(result.success).toBe(true);
			}
		});
	});

	describe("Missing Required Fields", () => {
		it("rejects plan without cycleId", async () => {
			const example = await loadProtoExample("decision_plan.json");
			const { cycleId: _, ...invalid } = example as Record<string, unknown>;

			const result = DecisionPlanSchema.safeParse(invalid);
			expect(result.success).toBe(false);
		});

		it("rejects plan without decisions array", async () => {
			const example = await loadProtoExample("decision_plan.json");
			const { decisions: _, ...invalid } = example as Record<string, unknown>;

			const result = DecisionPlanSchema.safeParse(invalid);
			expect(result.success).toBe(false);
		});
	});
});

// ============================================
// Instrument Schema Sync Tests
// ============================================

describe("Instrument Schema Sync", () => {
	it("validates equity instrument", () => {
		const instrument = {
			instrumentId: "MSFT",
			instrumentType: "EQUITY",
		};

		const result = InstrumentSchema.safeParse(instrument);
		expect(result.success).toBe(true);
	});

	it("validates option instrument with contract details", () => {
		const instrument = {
			instrumentId: "AAPL250117C00200000",
			instrumentType: "OPTION",
			optionContract: {
				underlying: "AAPL",
				expiration: "2025-01-17",
				strike: 200,
				optionType: "CALL",
			},
		};

		const result = InstrumentSchema.safeParse(instrument);
		expect(result.success).toBe(true);
	});

	it("rejects option without contract details", () => {
		const instrument = {
			instrumentId: "AAPL250117C00200000",
			instrumentType: "OPTION",
			// Missing optionContract
		};

		const result = InstrumentSchema.safeParse(instrument);
		expect(result.success).toBe(false);
	});

	it("rejects empty instrument ID", () => {
		const instrument = {
			instrumentId: "",
			instrumentType: "EQUITY",
		};

		const result = InstrumentSchema.safeParse(instrument);
		expect(result.success).toBe(false);
	});
});

// ============================================
// Enum Sync Tests
// ============================================

describe("Enum Sync", () => {
	describe("Action enum", () => {
		it("accepts all valid actions", () => {
			const validActions = ["BUY", "SELL", "HOLD", "INCREASE", "REDUCE", "NO_TRADE"];
			for (const action of validActions) {
				expect(() => Action.parse(action)).not.toThrow();
			}
		});

		it("rejects invalid actions", () => {
			const invalidActions = ["CLOSE", "CANCEL", "MODIFY", "buy", ""];
			for (const action of invalidActions) {
				expect(() => Action.parse(action)).toThrow();
			}
		});
	});

	describe("InstrumentType enum", () => {
		it("accepts EQUITY and OPTION", () => {
			expect(() => InstrumentType.parse("EQUITY")).not.toThrow();
			expect(() => InstrumentType.parse("OPTION")).not.toThrow();
		});

		it("rejects CRYPTO, FUTURES, FOREX", () => {
			expect(() => InstrumentType.parse("CRYPTO")).toThrow();
			expect(() => InstrumentType.parse("FUTURES")).toThrow();
			expect(() => InstrumentType.parse("FOREX")).toThrow();
		});
	});

	describe("SizeUnit enum", () => {
		it("accepts SHARES and CONTRACTS", () => {
			expect(() => SizeUnit.parse("SHARES")).not.toThrow();
			expect(() => SizeUnit.parse("CONTRACTS")).not.toThrow();
		});
	});

	describe("OrderType enum", () => {
		it("accepts LIMIT and MARKET", () => {
			expect(() => OrderType.parse("LIMIT")).not.toThrow();
			expect(() => OrderType.parse("MARKET")).not.toThrow();
		});
	});

	describe("TimeInForce enum", () => {
		it("accepts all valid TIF values", () => {
			const valid = ["DAY", "GTC", "IOC", "FOK"];
			for (const tif of valid) {
				expect(() => TimeInForce.parse(tif)).not.toThrow();
			}
		});
	});

	describe("StrategyFamily enum", () => {
		it("accepts all valid strategy families", () => {
			const valid = ["TREND", "MEAN_REVERSION", "EVENT_DRIVEN", "VOLATILITY", "RELATIVE_VALUE"];
			for (const family of valid) {
				expect(() => StrategyFamily.parse(family)).not.toThrow();
			}
		});
	});
});
