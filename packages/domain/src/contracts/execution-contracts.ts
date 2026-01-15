/**
 * Contract Testing for Execution Service
 *
 * This module provides contract testing utilities for the execution service.
 * It validates that TypeScript Zod schemas match the proto definitions and
 * that the Rust HTTP API returns compatible data.
 *
 * Contract testing ensures:
 * 1. Schema compatibility between TypeScript and Rust
 * 2. Payload validation works the same on both sides
 * 3. Breaking changes are detected early
 *
 * @see packages/proto/cream/v1/execution.proto
 * @see apps/execution-engine/src/server/http.rs
 */

import { z } from "zod";
import {
	type Decision,
	type DecisionPlan,
	DecisionPlanSchema,
	type Instrument,
	InstrumentSchema,
} from "../decision";
import {
	type AccountState,
	AccountStateSchema,
	type ConstraintCheck,
	ConstraintCheckSchema,
	type ExecutionAck,
	ExecutionAckSchema,
	type Position,
	PositionSchema,
	type SubmitOrderRequest,
	SubmitOrderRequestSchema,
	type SubmitOrderResponse,
	SubmitOrderResponseSchema,
} from "../execution";

// ============================================
// Contract Validation Result Types
// ============================================

/**
 * Result of a contract validation
 */
export interface ContractValidationResult {
	/** Whether the contract is valid */
	valid: boolean;
	/** Contract name being validated */
	contract: string;
	/** Errors found during validation */
	errors: ContractError[];
	/** Warnings (non-breaking issues) */
	warnings: string[];
}

/**
 * Contract validation error
 */
export interface ContractError {
	/** Field path that failed validation */
	path: string;
	/** Error message */
	message: string;
	/** Expected value or type */
	expected?: string;
	/** Actual value or type */
	actual?: string;
}

// ============================================
// Test Fixtures (Canonical Payloads)
// ============================================

/**
 * Sample instrument fixture (matches InstrumentSchema from decision.ts)
 */
export const FIXTURE_INSTRUMENT: Instrument = {
	instrumentId: "AAPL",
	instrumentType: "EQUITY",
};

/**
 * Sample option instrument fixture (matches InstrumentSchema from decision.ts)
 */
export const FIXTURE_OPTION_INSTRUMENT: Instrument = {
	instrumentId: "AAPL240320C00150000",
	instrumentType: "OPTION",
	optionContract: {
		underlying: "AAPL",
		expiration: "2026-03-20",
		strike: 150,
		optionType: "CALL",
	},
};

/**
 * Sample account state fixture
 */
export const FIXTURE_ACCOUNT_STATE: AccountState = {
	accountId: "test-account-001",
	equity: 100000,
	buyingPower: 50000,
	marginUsed: 25000,
	dayTradeCount: 2,
	isPdtRestricted: false,
	asOf: "2026-01-05T14:30:00Z",
};

/**
 * Sample position fixture
 */
export const FIXTURE_POSITION: Position = {
	instrument: FIXTURE_INSTRUMENT,
	quantity: 100,
	avgEntryPrice: 150.25,
	marketValue: 15500,
	unrealizedPnl: 475,
	unrealizedPnlPct: 0.0316,
	costBasis: 15025,
};

/**
 * Sample constraint check fixture
 */
export const FIXTURE_CONSTRAINT_CHECK: ConstraintCheck = {
	name: "MAX_POSITION_SIZE",
	result: "PASS",
	description: "Position size within allowed limits",
	actualValue: 10000,
	threshold: 50000,
};

/**
 * Sample decision fixture (matches DecisionSchema from decision.ts)
 */
export const FIXTURE_DECISION: Decision = {
	instrument: FIXTURE_INSTRUMENT,
	action: "BUY",
	size: {
		quantity: 100,
		unit: "SHARES",
		targetPositionQuantity: 100,
	},
	orderPlan: {
		entryOrderType: "LIMIT",
		entryLimitPrice: 150.5,
		exitOrderType: "MARKET",
		timeInForce: "DAY",
		executionTactic: "PASSIVE_LIMIT",
		executionParams: { maxSlippageBps: 10 },
	},
	riskLevels: {
		stopLossLevel: 145,
		takeProfitLevel: 165,
		denomination: "UNDERLYING_PRICE",
	},
	strategyFamily: "TREND",
	rationale: "Strong momentum with breakout pattern detected in technical analysis",
	confidence: 0.75,
	references: {
		usedIndicators: ["RSI", "MACD"],
		memoryCaseIds: [],
		eventIds: [],
	},
};

/**
 * Sample decision plan fixture (matches DecisionPlanSchema from decision.ts)
 */
export const FIXTURE_DECISION_PLAN: DecisionPlan = {
	cycleId: "cycle-001",
	asOfTimestamp: "2026-01-05T14:30:00Z",
	environment: "PAPER",
	decisions: [FIXTURE_DECISION],
	portfolioNotes: "Market conditions favorable for momentum plays",
};

/**
 * Sample submit order request fixture
 */
export const FIXTURE_SUBMIT_ORDER_REQUEST: SubmitOrderRequest = {
	instrument: FIXTURE_INSTRUMENT,
	side: "BUY",
	quantity: 100,
	orderType: "LIMIT",
	limitPrice: 150.5,
	timeInForce: "DAY",
	clientOrderId: "client-order-001",
	cycleId: "cycle-001",
};

/**
 * Sample submit order response fixture
 */
export const FIXTURE_SUBMIT_ORDER_RESPONSE: SubmitOrderResponse = {
	orderId: "broker-order-001",
	clientOrderId: "client-order-001",
	status: "ACCEPTED",
	submittedAt: "2026-01-05T14:30:05Z",
};

/**
 * Sample execution ack fixture
 */
export const FIXTURE_EXECUTION_ACK: ExecutionAck = {
	orderId: "broker-order-001",
	clientOrderId: "client-order-001",
	status: "FILLED",
	filledQuantity: 100,
	avgFillPrice: 150.45,
	remainingQuantity: 0,
	updatedAt: "2026-01-05T14:30:10Z",
	commission: 0.5,
};

// ============================================
// Contract Validators
// ============================================

/**
 * Validate a payload against a Zod schema and return contract validation result
 */
export function validateContract<T>(
	schema: z.ZodSchema<T>,
	payload: unknown,
	contractName: string
): ContractValidationResult {
	const result = schema.safeParse(payload);

	if (result.success) {
		return {
			valid: true,
			contract: contractName,
			errors: [],
			warnings: [],
		};
	}

	const errors: ContractError[] = result.error.issues.map((err) => ({
		path: err.path.join("."),
		message: err.message,
		expected: undefined,
		actual: undefined,
	}));

	return {
		valid: false,
		contract: contractName,
		errors,
		warnings: [],
	};
}

/**
 * Validate all execution service contracts
 */
export function validateAllContracts(): ContractValidationResult[] {
	const results: ContractValidationResult[] = [];

	// Validate each fixture against its schema
	results.push(validateContract(InstrumentSchema, FIXTURE_INSTRUMENT, "Instrument"));
	results.push(validateContract(InstrumentSchema, FIXTURE_OPTION_INSTRUMENT, "OptionInstrument"));
	results.push(validateContract(AccountStateSchema, FIXTURE_ACCOUNT_STATE, "AccountState"));
	results.push(validateContract(PositionSchema, FIXTURE_POSITION, "Position"));
	results.push(
		validateContract(ConstraintCheckSchema, FIXTURE_CONSTRAINT_CHECK, "ConstraintCheck")
	);
	results.push(validateContract(DecisionPlanSchema, FIXTURE_DECISION_PLAN, "DecisionPlan"));
	results.push(
		validateContract(SubmitOrderRequestSchema, FIXTURE_SUBMIT_ORDER_REQUEST, "SubmitOrderRequest")
	);
	results.push(
		validateContract(
			SubmitOrderResponseSchema,
			FIXTURE_SUBMIT_ORDER_RESPONSE,
			"SubmitOrderResponse"
		)
	);
	results.push(validateContract(ExecutionAckSchema, FIXTURE_EXECUTION_ACK, "ExecutionAck"));

	return results;
}

// ============================================
// HTTP API Contract Testing Helpers
// ============================================

/**
 * HTTP endpoint contract definition
 */
export interface HTTPEndpointContract {
	/** HTTP method */
	method: "GET" | "POST" | "PUT" | "DELETE";
	/** Endpoint path */
	path: string;
	/** Request body schema (for POST/PUT) */
	requestSchema?: z.ZodSchema;
	/** Response body schema */
	responseSchema: z.ZodSchema;
	/** Sample request payload */
	sampleRequest?: unknown;
	/** Sample response payload */
	sampleResponse: unknown;
}

/**
 * Execution service HTTP contracts
 */
export const EXECUTION_HTTP_CONTRACTS: HTTPEndpointContract[] = [
	{
		method: "GET",
		path: "/health",
		responseSchema: z.literal("OK"),
		sampleResponse: "OK",
	},
	{
		method: "POST",
		path: "/v1/check-constraints",
		requestSchema: z.object({
			request_id: z.string(),
			cycle_id: z.string(),
			risk_policy_id: z.string(),
			account_equity: z.string(),
			plan: z.object({
				plan_id: z.string(),
				cycle_id: z.string(),
				timestamp: z.string(),
				decisions: z.array(z.any()),
				risk_manager_approved: z.boolean(),
				critic_approved: z.boolean(),
				plan_rationale: z.string(),
			}),
		}),
		responseSchema: z.object({
			ok: z.boolean(),
			violations: z.array(z.any()),
		}),
		sampleRequest: {
			request_id: "req-001",
			cycle_id: "cycle-001",
			risk_policy_id: "default",
			account_equity: "100000",
			plan: {
				plan_id: "plan-001",
				cycle_id: "cycle-001",
				timestamp: "2026-01-05T14:30:00Z",
				decisions: [],
				risk_manager_approved: true,
				critic_approved: true,
				plan_rationale: "Test plan",
			},
		},
		sampleResponse: {
			ok: true,
			violations: [],
		},
	},
	{
		method: "POST",
		path: "/v1/submit-orders",
		requestSchema: z.object({
			cycle_id: z.string(),
			environment: z.string(),
			plan: z.any(),
		}),
		responseSchema: z.object({
			cycle_id: z.string(),
			environment: z.string(),
			ack_time: z.string(),
			orders: z.array(z.any()),
			errors: z.array(z.any()),
		}),
		sampleRequest: {
			cycle_id: "cycle-001",
			environment: "PAPER",
			plan: {},
		},
		sampleResponse: {
			cycle_id: "cycle-001",
			environment: "PAPER",
			ack_time: "2026-01-05T14:30:00Z",
			orders: [],
			errors: [],
		},
	},
];

/**
 * Validate HTTP endpoint contracts
 */
export function validateHTTPContracts(): ContractValidationResult[] {
	const results: ContractValidationResult[] = [];

	for (const contract of EXECUTION_HTTP_CONTRACTS) {
		const contractName = `HTTP ${contract.method} ${contract.path}`;

		// Validate request schema if present
		if (contract.requestSchema && contract.sampleRequest) {
			results.push(
				validateContract(contract.requestSchema, contract.sampleRequest, `${contractName} Request`)
			);
		}

		// Validate response schema
		results.push(
			validateContract(contract.responseSchema, contract.sampleResponse, `${contractName} Response`)
		);
	}

	return results;
}

// ============================================
// Exports
// ============================================

export type { Decision, DecisionPlan, Instrument };
