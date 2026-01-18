/**
 * Safety Module Tests
 *
 * Tests for environment safety mechanisms with explicit ExecutionContext.
 */

import { beforeEach, describe, expect, it } from "bun:test";
import {
	auditLog,
	clearAuditLog,
	generateOrderId,
	getAuditLog,
	getIsolatedDatabaseName,
	isCircuitOpen,
	isLiveConfirmed,
	preventAccidentalLiveExecution,
	recordCircuitFailure,
	requireCircuitClosed,
	requireLiveConfirmation,
	resetCircuit,
	resetSafetyState,
	SafetyError,
	validateBrokerEndpoint,
	validateDatabaseIsolation,
	validateOrderIdEnvironment,
} from "./safety";
import { createTestContext } from "./test-utils";

describe("Order ID Namespacing", () => {
	it("generates order ID with correct environment prefix", () => {
		const ctx = createTestContext("PAPER");
		const orderId = generateOrderId(ctx);
		expect(orderId).toStartWith("PAPER-");
	});

	it("generates order ID with PAPER prefix", () => {
		const ctx = createTestContext("PAPER");
		const orderId = generateOrderId(ctx);
		expect(orderId).toStartWith("PAPER-");
	});

	it("generates order ID with LIVE prefix", () => {
		const ctx = createTestContext("LIVE");
		const orderId = generateOrderId(ctx);
		expect(orderId).toStartWith("LIVE-");
	});

	it("generates unique order IDs", () => {
		const ctx = createTestContext("PAPER");
		const ids = new Set<string>();
		for (let i = 0; i < 100; i++) {
			ids.add(generateOrderId(ctx));
		}
		expect(ids.size).toBe(100);
	});

	it("validates order ID matches current context environment", () => {
		const ctx = createTestContext("PAPER");
		const orderId = generateOrderId(ctx);
		expect(() => validateOrderIdEnvironment(orderId, ctx)).not.toThrow();
	});

	it("rejects order ID from different environment", () => {
		const ctx = createTestContext("PAPER");
		const wrongEnvId = "LIVE-12345678-abcd1234";
		expect(() => validateOrderIdEnvironment(wrongEnvId, ctx)).toThrow(SafetyError);
	});

	it("includes traceId in SafetyError", () => {
		const ctx = createTestContext("PAPER");
		const wrongEnvId = "LIVE-12345678-abcd1234";
		try {
			validateOrderIdEnvironment(wrongEnvId, ctx);
			expect.unreachable("Should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(SafetyError);
			expect((e as SafetyError).traceId).toBe(ctx.traceId);
		}
	});
});

describe("Broker Endpoint Validation", () => {
	it("rejects production endpoint in PAPER environment", () => {
		const ctx = createTestContext("PAPER");
		expect(() => validateBrokerEndpoint("https://api.alpaca.markets", ctx)).toThrow(SafetyError);
	});

	it("rejects production endpoint in PAPER environment", () => {
		const ctx = createTestContext("PAPER");
		expect(() => validateBrokerEndpoint("https://api.alpaca.markets", ctx)).toThrow(SafetyError);
	});

	it("accepts paper endpoint in PAPER environment", () => {
		const ctx = createTestContext("PAPER");
		expect(() => validateBrokerEndpoint("https://paper-api.alpaca.markets", ctx)).not.toThrow();
	});

	it("accepts paper endpoint in PAPER environment", () => {
		const ctx = createTestContext("PAPER");
		expect(() => validateBrokerEndpoint("https://paper-api.alpaca.markets", ctx)).not.toThrow();
	});

	it("accepts production endpoint in LIVE environment", () => {
		const ctx = createTestContext("LIVE");
		expect(() => validateBrokerEndpoint("https://api.alpaca.markets", ctx)).not.toThrow();
	});
});

describe("Live Execution Guards", () => {
	beforeEach(() => {
		const ctx = createTestContext("PAPER");
		resetSafetyState(ctx);
	});

	it("isLiveConfirmed returns true in PAPER environment", () => {
		const ctx = createTestContext("PAPER");
		expect(isLiveConfirmed(ctx)).toBe(true);
	});

	it("isLiveConfirmed returns true in PAPER environment", () => {
		const ctx = createTestContext("PAPER");
		expect(isLiveConfirmed(ctx)).toBe(true);
	});

	it("requireLiveConfirmation does nothing in PAPER environment", () => {
		const ctx = createTestContext("PAPER");
		expect(() => requireLiveConfirmation("wrong-token", ctx)).not.toThrow();
	});

	it("requireLiveConfirmation does nothing in PAPER environment", () => {
		const ctx = createTestContext("PAPER");
		expect(() => requireLiveConfirmation("wrong-token", ctx)).not.toThrow();
	});

	it("preventAccidentalLiveExecution passes in PAPER environment", () => {
		const ctx = createTestContext("PAPER");
		expect(() => preventAccidentalLiveExecution(ctx)).not.toThrow();
	});

	it("preventAccidentalLiveExecution passes in PAPER environment", () => {
		const ctx = createTestContext("PAPER");
		expect(() => preventAccidentalLiveExecution(ctx)).not.toThrow();
	});
});

describe("State Isolation", () => {
	it("generates isolated database name for PAPER", () => {
		const ctx = createTestContext("PAPER");
		const dbName = getIsolatedDatabaseName("cream", ctx);
		expect(dbName).toBe("cream_paper");
	});

	it("generates isolated database name for LIVE", () => {
		const ctx = createTestContext("LIVE");
		const dbName = getIsolatedDatabaseName("cream", ctx);
		expect(dbName).toBe("cream_live");
	});

	it("validates database isolation - rejects LIVE database in PAPER environment", () => {
		const ctx = createTestContext("PAPER");
		expect(() => validateDatabaseIsolation("file:cream_live.db", ctx)).toThrow(SafetyError);
	});

	it("validates database isolation - rejects PAPER database in LIVE environment", () => {
		const ctx = createTestContext("LIVE");
		expect(() => validateDatabaseIsolation("file:cream_paper.db", ctx)).toThrow(SafetyError);
	});

	it("allows database for current environment", () => {
		const paperCtx = createTestContext("PAPER");
		expect(() => validateDatabaseIsolation("file:cream_paper.db", paperCtx)).not.toThrow();

		const liveCtx = createTestContext("LIVE");
		expect(() => validateDatabaseIsolation("file:cream_live.db", liveCtx)).not.toThrow();
	});
});

describe("Audit Logging", () => {
	beforeEach(() => {
		const ctx = createTestContext("PAPER");
		resetSafetyState(ctx);
	});

	it("logs operations with timestamp and traceId", () => {
		const ctx = createTestContext("PAPER");
		auditLog("TEST_OPERATION", { key: "value" }, ctx);
		const log = getAuditLog();
		expect(log.length).toBe(1);
		expect(log[0]?.operation).toBe("TEST_OPERATION");
		expect(log[0]?.details.key).toBe("value");
		expect(log[0]?.timestamp).toBeDefined();
		expect(log[0]?.environment).toBe("PAPER");
		expect(log[0]?.traceId).toBe(ctx.traceId);
	});

	it("clears audit log in PAPER environment", () => {
		const ctx = createTestContext("PAPER");
		auditLog("TEST", {}, ctx);
		expect(getAuditLog().length).toBe(1);
		clearAuditLog(ctx);
		expect(getAuditLog().length).toBe(0);
	});

	it("throws when clearing audit log in LIVE environment", () => {
		const paperCtx = createTestContext("PAPER");
		auditLog("TEST", {}, paperCtx);

		const liveCtx = createTestContext("LIVE");
		expect(() => clearAuditLog(liveCtx)).toThrow(SafetyError);
	});
});

describe("Circuit Breaker", () => {
	beforeEach(() => {
		const ctx = createTestContext("PAPER");
		resetSafetyState(ctx);
	});

	it("starts with circuit closed", () => {
		expect(isCircuitOpen("test-circuit")).toBe(false);
	});

	it("opens circuit after threshold failures", () => {
		const ctx = createTestContext("PAPER");
		const error = new Error("Test failure");
		for (let i = 0; i < 5; i++) {
			recordCircuitFailure("test-circuit", error, ctx, 5);
		}
		expect(isCircuitOpen("test-circuit")).toBe(true);
	});

	it("resets circuit on success", () => {
		const ctx = createTestContext("PAPER");
		const error = new Error("Test failure");
		for (let i = 0; i < 5; i++) {
			recordCircuitFailure("reset-test", error, ctx, 5);
		}
		expect(isCircuitOpen("reset-test")).toBe(true);

		resetCircuit("reset-test", ctx);
		expect(isCircuitOpen("reset-test")).toBe(false);
	});

	it("throws when circuit is open", () => {
		const ctx = createTestContext("PAPER");
		const error = new Error("Test failure");
		for (let i = 0; i < 5; i++) {
			recordCircuitFailure("throw-test", error, ctx, 5);
		}
		expect(() => requireCircuitClosed("throw-test", ctx)).toThrow(SafetyError);
	});

	it("passes when circuit is closed", () => {
		const ctx = createTestContext("PAPER");
		expect(() => requireCircuitClosed("closed-circuit", ctx)).not.toThrow();
	});
});

describe("SafetyError", () => {
	it("has correct name and code", () => {
		const error = new SafetyError("Test message", "CIRCUIT_BREAKER_OPEN");
		expect(error.name).toBe("SafetyError");
		expect(error.code).toBe("CIRCUIT_BREAKER_OPEN");
		expect(error.message).toBe("Test message");
	});

	it("includes traceId when provided", () => {
		const traceId = "test-trace-id-123";
		const error = new SafetyError("Test message", "CIRCUIT_BREAKER_OPEN", traceId);
		expect(error.traceId).toBe(traceId);
	});
});

describe("resetSafetyState", () => {
	it("resets all safety state when called with test context", () => {
		const ctx = createTestContext("PAPER");

		// Add some state
		auditLog("TEST", {}, ctx);
		recordCircuitFailure("test", new Error("fail"), ctx, 5);

		resetSafetyState(ctx);

		expect(getAuditLog().length).toBe(0);
		expect(isCircuitOpen("test")).toBe(false);
	});
});
