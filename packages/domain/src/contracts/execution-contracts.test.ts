/**
 * Contract Testing for Execution Service
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

describe("Instrument fixtures", () => {
	test("equity instrument fixture is valid", () => {
		expect(InstrumentSchema.safeParse(FIXTURE_INSTRUMENT).success).toBe(true);
	});

	test("option instrument fixture is valid", () => {
		expect(InstrumentSchema.safeParse(FIXTURE_OPTION_INSTRUMENT).success).toBe(true);
	});

	test("instrument requires symbol", () => {
		expect(InstrumentSchema.safeParse({ type: "EQUITY" }).success).toBe(false);
	});

	test("instrument requires valid type", () => {
		expect(InstrumentSchema.safeParse({ symbol: "AAPL", type: "INVALID" }).success).toBe(false);
	});
});

describe("AccountState fixtures", () => {
	test("account state fixture is valid", () => {
		expect(AccountStateSchema.safeParse(FIXTURE_ACCOUNT_STATE).success).toBe(true);
	});

	test("account state requires accountId", () => {
		const { accountId, ...rest } = FIXTURE_ACCOUNT_STATE;
		expect(AccountStateSchema.safeParse(rest).success).toBe(false);
	});

	test("account state requires non-negative equity", () => {
		expect(
			AccountStateSchema.safeParse({
				...FIXTURE_ACCOUNT_STATE,
				equity: -1000,
			}).success,
		).toBe(false);
	});
});

describe("Position fixtures", () => {
	test("position fixture is valid", () => {
		expect(PositionSchema.safeParse(FIXTURE_POSITION).success).toBe(true);
	});

	test("position allows negative quantity (short)", () => {
		expect(
			PositionSchema.safeParse({
				...FIXTURE_POSITION,
				quantity: -100,
			}).success,
		).toBe(true);
	});

	test("position requires instrument", () => {
		const { instrument, ...rest } = FIXTURE_POSITION;
		expect(PositionSchema.safeParse(rest).success).toBe(false);
	});
});

describe("ConstraintCheck fixtures", () => {
	test("constraint check fixture is valid", () => {
		expect(ConstraintCheckSchema.safeParse(FIXTURE_CONSTRAINT_CHECK).success).toBe(true);
	});

	test("constraint check requires valid result", () => {
		expect(
			ConstraintCheckSchema.safeParse({
				...FIXTURE_CONSTRAINT_CHECK,
				result: "INVALID",
			}).success,
		).toBe(false);
	});

	test("constraint check actualValue is optional", () => {
		const { actualValue, ...rest } = FIXTURE_CONSTRAINT_CHECK;
		expect(ConstraintCheckSchema.safeParse(rest).success).toBe(true);
	});
});

describe("DecisionPlan fixtures", () => {
	test("decision plan fixture is valid", () => {
		expect(DecisionPlanSchema.safeParse(FIXTURE_DECISION_PLAN).success).toBe(true);
	});

	test("decision plan requires cycleId", () => {
		const { cycleId, ...rest } = FIXTURE_DECISION_PLAN;
		expect(DecisionPlanSchema.safeParse(rest).success).toBe(false);
	});

	test("decision plan accepts empty decisions array", () => {
		expect(
			DecisionPlanSchema.safeParse({
				...FIXTURE_DECISION_PLAN,
				decisions: [],
			}).success,
		).toBe(true);
	});
});

describe("SubmitOrderRequest fixtures", () => {
	test("submit order request fixture is valid", () => {
		expect(SubmitOrderRequestSchema.safeParse(FIXTURE_SUBMIT_ORDER_REQUEST).success).toBe(true);
	});

	test("limit order requires limit price", () => {
		expect(
			SubmitOrderRequestSchema.safeParse({
				...FIXTURE_SUBMIT_ORDER_REQUEST,
				orderType: "LIMIT",
				limitPrice: undefined,
			}).success,
		).toBe(false);
	});

	test("market order does not require limit price", () => {
		expect(
			SubmitOrderRequestSchema.safeParse({
				...FIXTURE_SUBMIT_ORDER_REQUEST,
				orderType: "MARKET",
				limitPrice: undefined,
			}).success,
		).toBe(true);
	});

	test("requires positive quantity", () => {
		expect(
			SubmitOrderRequestSchema.safeParse({
				...FIXTURE_SUBMIT_ORDER_REQUEST,
				quantity: 0,
			}).success,
		).toBe(false);
	});
});

describe("SubmitOrderResponse fixtures", () => {
	test("submit order response fixture is valid", () => {
		expect(SubmitOrderResponseSchema.safeParse(FIXTURE_SUBMIT_ORDER_RESPONSE).success).toBe(true);
	});

	test("error message is optional", () => {
		expect(
			SubmitOrderResponseSchema.safeParse({
				...FIXTURE_SUBMIT_ORDER_RESPONSE,
				status: "REJECTED",
				errorMessage: "Insufficient funds",
			}).success,
		).toBe(true);
	});
});

describe("ExecutionAck fixtures", () => {
	test("execution ack fixture is valid", () => {
		expect(ExecutionAckSchema.safeParse(FIXTURE_EXECUTION_ACK).success).toBe(true);
	});

	test("filled quantity must be non-negative", () => {
		expect(
			ExecutionAckSchema.safeParse({
				...FIXTURE_EXECUTION_ACK,
				filledQuantity: -1,
			}).success,
		).toBe(false);
	});
});

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
		expect(validateContract(InstrumentSchema, FIXTURE_INSTRUMENT, "MyContract").contract).toBe(
			"MyContract",
		);
	});
});

describe("validateAllContracts", () => {
	test("all contracts pass validation", () => {
		const results = validateAllContracts();
		const failedContracts = results.filter((result) => !result.valid);
		expect(failedContracts.length).toBe(0);
	});

	test("validates expected number of contracts", () => {
		expect(validateAllContracts().length).toBeGreaterThanOrEqual(9);
	});
});

describe("validateHTTPContracts", () => {
	test("all HTTP contracts pass validation", () => {
		const results = validateHTTPContracts();
		const failedContracts = results.filter((result) => !result.valid);
		expect(failedContracts.length).toBe(0);
	});
});

describe("Schema Compatibility", () => {
	test("OrderStatus enum has expected values", () => {
		for (const status of [
			"PENDING",
			"ACCEPTED",
			"PARTIAL_FILL",
			"FILLED",
			"CANCELLED",
			"REJECTED",
			"EXPIRED",
		]) {
			expect(
				SubmitOrderResponseSchema.safeParse({
					...FIXTURE_SUBMIT_ORDER_RESPONSE,
					status,
				}).success,
			).toBe(true);
		}
	});

	test("OrderSide enum has expected values", () => {
		for (const side of ["BUY", "SELL"]) {
			expect(
				SubmitOrderRequestSchema.safeParse({
					...FIXTURE_SUBMIT_ORDER_REQUEST,
					side,
				}).success,
			).toBe(true);
		}
	});

	test("InstrumentType enum has expected values", () => {
		for (const type of ["EQUITY", "OPTION"]) {
			expect(
				InstrumentSchema.safeParse({
					...FIXTURE_INSTRUMENT,
					type,
				}).success,
			).toBe(true);
		}
	});

	test("ConstraintResult enum has expected values", () => {
		for (const constraintResult of ["PASS", "FAIL", "WARN"]) {
			expect(
				ConstraintCheckSchema.safeParse({
					...FIXTURE_CONSTRAINT_CHECK,
					result: constraintResult,
				}).success,
			).toBe(true);
		}
	});
});

describe("Serialization Round-Trip", () => {
	test("account state survives JSON round-trip", () => {
		const parsed = JSON.parse(JSON.stringify(FIXTURE_ACCOUNT_STATE));
		expect(AccountStateSchema.safeParse(parsed).success).toBe(true);
	});

	test("position survives JSON round-trip", () => {
		const parsed = JSON.parse(JSON.stringify(FIXTURE_POSITION));
		expect(PositionSchema.safeParse(parsed).success).toBe(true);
	});

	test("decision plan survives JSON round-trip", () => {
		const parsed = JSON.parse(JSON.stringify(FIXTURE_DECISION_PLAN));
		expect(DecisionPlanSchema.safeParse(parsed).success).toBe(true);
	});

	test("execution ack survives JSON round-trip", () => {
		const parsed = JSON.parse(JSON.stringify(FIXTURE_EXECUTION_ACK));
		expect(ExecutionAckSchema.safeParse(parsed).success).toBe(true);
	});
});

describe("Error Message Quality", () => {
	test("provides clear error for missing required field", () => {
		const result = AccountStateSchema.safeParse({});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues.length).toBeGreaterThan(0);
			expect(result.error.issues.some((issue) => issue.path.length > 0)).toBe(true);
		}
	});

	test("provides clear error for invalid type", () => {
		const result = AccountStateSchema.safeParse({
			...FIXTURE_ACCOUNT_STATE,
			equity: "not-a-number",
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues.find((issue) => issue.path.includes("equity"))).toBeDefined();
		}
	});

	test("provides clear error for invalid enum value", () => {
		const result = ConstraintCheckSchema.safeParse({
			...FIXTURE_CONSTRAINT_CHECK,
			result: "INVALID_RESULT",
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues.find((issue) => issue.path.includes("result"))).toBeDefined();
		}
	});
});
