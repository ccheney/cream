/**
 * Contract Testing for Execution Service
 *
 * These tests validate that:
 * 1. TypeScript Zod schemas correctly define the execution service contracts
 * 2. Sample payloads conform to both TypeScript and proto definitions
 * 3. Schema changes are detected through fixture validation
 */

import { describe, expect, test } from "bun:test";
import { DecisionPlanSchema, InstrumentSchema } from "../decision";
import {
	AccountStateSchema,
	ConstraintCheckSchema,
	ExecutionAckSchema,
	PositionSchema,
	SubmitOrderRequestSchema,
	SubmitOrderResponseSchema,
} from "../execution";
import {
	FIXTURE_ACCOUNT_STATE,
	FIXTURE_CONSTRAINT_CHECK,
	FIXTURE_DECISION_PLAN,
	FIXTURE_EXECUTION_ACK,
	FIXTURE_INSTRUMENT,
	FIXTURE_OPTION_INSTRUMENT,
	FIXTURE_POSITION,
	FIXTURE_SUBMIT_ORDER_REQUEST,
	FIXTURE_SUBMIT_ORDER_RESPONSE,
	validateAllContracts,
	validateContract,
	validateHTTPContracts,
} from "./execution-contracts";

// ============================================
// Fixture Validation Tests
// ============================================

describe("Contract Fixtures", () => {
	describe("Instrument", () => {
		test("equity instrument fixture is valid", () => {
			const result = InstrumentSchema.safeParse(FIXTURE_INSTRUMENT);
			expect(result.success).toBe(true);
		});

		test("option instrument fixture is valid", () => {
			const result = InstrumentSchema.safeParse(FIXTURE_OPTION_INSTRUMENT);
			expect(result.success).toBe(true);
		});

		test("instrument requires symbol", () => {
			const result = InstrumentSchema.safeParse({ type: "EQUITY" });
			expect(result.success).toBe(false);
		});

		test("instrument requires valid type", () => {
			const result = InstrumentSchema.safeParse({ symbol: "AAPL", type: "INVALID" });
			expect(result.success).toBe(false);
		});
	});

	describe("AccountState", () => {
		test("account state fixture is valid", () => {
			const result = AccountStateSchema.safeParse(FIXTURE_ACCOUNT_STATE);
			expect(result.success).toBe(true);
		});

		test("account state requires accountId", () => {
			const { accountId, ...rest } = FIXTURE_ACCOUNT_STATE;
			const result = AccountStateSchema.safeParse(rest);
			expect(result.success).toBe(false);
		});

		test("account state requires non-negative equity", () => {
			const result = AccountStateSchema.safeParse({
				...FIXTURE_ACCOUNT_STATE,
				equity: -1000,
			});
			expect(result.success).toBe(false);
		});
	});

	describe("Position", () => {
		test("position fixture is valid", () => {
			const result = PositionSchema.safeParse(FIXTURE_POSITION);
			expect(result.success).toBe(true);
		});

		test("position allows negative quantity (short)", () => {
			const result = PositionSchema.safeParse({
				...FIXTURE_POSITION,
				quantity: -100,
			});
			expect(result.success).toBe(true);
		});

		test("position requires instrument", () => {
			const { instrument, ...rest } = FIXTURE_POSITION;
			const result = PositionSchema.safeParse(rest);
			expect(result.success).toBe(false);
		});
	});

	describe("ConstraintCheck", () => {
		test("constraint check fixture is valid", () => {
			const result = ConstraintCheckSchema.safeParse(FIXTURE_CONSTRAINT_CHECK);
			expect(result.success).toBe(true);
		});

		test("constraint check requires valid result", () => {
			const result = ConstraintCheckSchema.safeParse({
				...FIXTURE_CONSTRAINT_CHECK,
				result: "INVALID",
			});
			expect(result.success).toBe(false);
		});

		test("constraint check actualValue is optional", () => {
			const { actualValue, ...rest } = FIXTURE_CONSTRAINT_CHECK;
			const result = ConstraintCheckSchema.safeParse(rest);
			expect(result.success).toBe(true);
		});
	});

	describe("DecisionPlan", () => {
		test("decision plan fixture is valid", () => {
			const result = DecisionPlanSchema.safeParse(FIXTURE_DECISION_PLAN);
			expect(result.success).toBe(true);
		});

		test("decision plan requires cycleId", () => {
			const { cycleId, ...rest } = FIXTURE_DECISION_PLAN;
			const result = DecisionPlanSchema.safeParse(rest);
			expect(result.success).toBe(false);
		});

		test("decision plan requires at least empty decisions array", () => {
			const result = DecisionPlanSchema.safeParse({
				...FIXTURE_DECISION_PLAN,
				decisions: [],
			});
			expect(result.success).toBe(true);
		});
	});

	describe("SubmitOrderRequest", () => {
		test("submit order request fixture is valid", () => {
			const result = SubmitOrderRequestSchema.safeParse(FIXTURE_SUBMIT_ORDER_REQUEST);
			expect(result.success).toBe(true);
		});

		test("limit order requires limit price", () => {
			const result = SubmitOrderRequestSchema.safeParse({
				...FIXTURE_SUBMIT_ORDER_REQUEST,
				orderType: "LIMIT",
				limitPrice: undefined,
			});
			expect(result.success).toBe(false);
		});

		test("market order does not require limit price", () => {
			const result = SubmitOrderRequestSchema.safeParse({
				...FIXTURE_SUBMIT_ORDER_REQUEST,
				orderType: "MARKET",
				limitPrice: undefined,
			});
			expect(result.success).toBe(true);
		});

		test("requires positive quantity", () => {
			const result = SubmitOrderRequestSchema.safeParse({
				...FIXTURE_SUBMIT_ORDER_REQUEST,
				quantity: 0,
			});
			expect(result.success).toBe(false);
		});
	});

	describe("SubmitOrderResponse", () => {
		test("submit order response fixture is valid", () => {
			const result = SubmitOrderResponseSchema.safeParse(FIXTURE_SUBMIT_ORDER_RESPONSE);
			expect(result.success).toBe(true);
		});

		test("error message is optional", () => {
			const result = SubmitOrderResponseSchema.safeParse({
				...FIXTURE_SUBMIT_ORDER_RESPONSE,
				status: "REJECTED",
				errorMessage: "Insufficient funds",
			});
			expect(result.success).toBe(true);
		});
	});

	describe("ExecutionAck", () => {
		test("execution ack fixture is valid", () => {
			const result = ExecutionAckSchema.safeParse(FIXTURE_EXECUTION_ACK);
			expect(result.success).toBe(true);
		});

		test("filled quantity must be non-negative", () => {
			const result = ExecutionAckSchema.safeParse({
				...FIXTURE_EXECUTION_ACK,
				filledQuantity: -1,
			});
			expect(result.success).toBe(false);
		});
	});
});

// ============================================
// Contract Validation Tests
// ============================================

describe("Contract Validation", () => {
	describe("validateContract", () => {
		test("returns valid for correct payload", () => {
			const result = validateContract(InstrumentSchema, FIXTURE_INSTRUMENT, "TestInstrument");
			expect(result.valid).toBe(true);
			expect(result.errors.length).toBe(0);
		});

		test("returns invalid for incorrect payload", () => {
			const result = validateContract(InstrumentSchema, { invalid: "data" }, "TestInstrument");
			expect(result.valid).toBe(false);
			expect(result.errors.length).toBeGreaterThan(0);
		});

		test("includes contract name in result", () => {
			const result = validateContract(InstrumentSchema, FIXTURE_INSTRUMENT, "MyContract");
			expect(result.contract).toBe("MyContract");
		});
	});

	describe("validateAllContracts", () => {
		test("all contracts pass validation", () => {
			const results = validateAllContracts();

			const failedContracts = results.filter((r) => !r.valid);

			if (failedContracts.length > 0) {
				for (const failed of failedContracts) {
					for (const _error of failed.errors) {
					}
				}
			}

			expect(failedContracts.length).toBe(0);
		});

		test("validates expected number of contracts", () => {
			const results = validateAllContracts();
			expect(results.length).toBeGreaterThanOrEqual(9);
		});
	});

	describe("validateHTTPContracts", () => {
		test("all HTTP contracts pass validation", () => {
			const results = validateHTTPContracts();

			const failedContracts = results.filter((r) => !r.valid);

			if (failedContracts.length > 0) {
				for (const failed of failedContracts) {
					for (const _error of failed.errors) {
					}
				}
			}

			expect(failedContracts.length).toBe(0);
		});
	});
});

// ============================================
// Schema Compatibility Tests
// ============================================

describe("Schema Compatibility", () => {
	test("OrderStatus enum has expected values", () => {
		// These should match execution.proto OrderStatus enum
		const expectedStatuses = [
			"PENDING",
			"ACCEPTED",
			"PARTIAL_FILL",
			"FILLED",
			"CANCELLED",
			"REJECTED",
			"EXPIRED",
		];

		for (const status of expectedStatuses) {
			const result = SubmitOrderResponseSchema.safeParse({
				...FIXTURE_SUBMIT_ORDER_RESPONSE,
				status,
			});
			expect(result.success).toBe(true);
		}
	});

	test("OrderSide enum has expected values", () => {
		// These should match execution.proto OrderSide enum
		const expectedSides = ["BUY", "SELL"];

		for (const side of expectedSides) {
			const result = SubmitOrderRequestSchema.safeParse({
				...FIXTURE_SUBMIT_ORDER_REQUEST,
				side,
			});
			expect(result.success).toBe(true);
		}
	});

	test("InstrumentType enum has expected values", () => {
		// These should match common.proto InstrumentType enum
		const expectedTypes = ["EQUITY", "OPTION"];

		for (const type of expectedTypes) {
			const result = InstrumentSchema.safeParse({
				...FIXTURE_INSTRUMENT,
				type,
			});
			expect(result.success).toBe(true);
		}
	});

	test("ConstraintResult enum has expected values", () => {
		// These should match execution.proto ConstraintResult enum
		const expectedResults = ["PASS", "FAIL", "WARN"];

		for (const constraintResult of expectedResults) {
			const result = ConstraintCheckSchema.safeParse({
				...FIXTURE_CONSTRAINT_CHECK,
				result: constraintResult,
			});
			expect(result.success).toBe(true);
		}
	});
});

// ============================================
// Round-Trip Serialization Tests
// ============================================

describe("Serialization Round-Trip", () => {
	test("account state survives JSON round-trip", () => {
		const json = JSON.stringify(FIXTURE_ACCOUNT_STATE);
		const parsed = JSON.parse(json);
		const result = AccountStateSchema.safeParse(parsed);
		expect(result.success).toBe(true);
	});

	test("position survives JSON round-trip", () => {
		const json = JSON.stringify(FIXTURE_POSITION);
		const parsed = JSON.parse(json);
		const result = PositionSchema.safeParse(parsed);
		expect(result.success).toBe(true);
	});

	test("decision plan survives JSON round-trip", () => {
		const json = JSON.stringify(FIXTURE_DECISION_PLAN);
		const parsed = JSON.parse(json);
		const result = DecisionPlanSchema.safeParse(parsed);
		expect(result.success).toBe(true);
	});

	test("execution ack survives JSON round-trip", () => {
		const json = JSON.stringify(FIXTURE_EXECUTION_ACK);
		const parsed = JSON.parse(json);
		const result = ExecutionAckSchema.safeParse(parsed);
		expect(result.success).toBe(true);
	});
});

// ============================================
// Error Message Quality Tests
// ============================================

describe("Error Message Quality", () => {
	test("provides clear error for missing required field", () => {
		const result = AccountStateSchema.safeParse({});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues.length).toBeGreaterThan(0);
			// Error should mention the missing field
			const hasFieldPath = result.error.issues.some((e) => e.path.length > 0);
			expect(hasFieldPath).toBe(true);
		}
	});

	test("provides clear error for invalid type", () => {
		const result = AccountStateSchema.safeParse({
			...FIXTURE_ACCOUNT_STATE,
			equity: "not-a-number",
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			const equityError = result.error.issues.find((e) => e.path.includes("equity"));
			expect(equityError).toBeDefined();
		}
	});

	test("provides clear error for invalid enum value", () => {
		const result = ConstraintCheckSchema.safeParse({
			...FIXTURE_CONSTRAINT_CHECK,
			result: "INVALID_RESULT",
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			const resultError = result.error.issues.find((e) => e.path.includes("result"));
			expect(resultError).toBeDefined();
		}
	});
});
