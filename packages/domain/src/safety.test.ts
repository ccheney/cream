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
		const ctx = createTestContext("BACKTEST");
		const orderId = generateOrderId(ctx);
		expect(orderId).toStartWith("BACKTEST-");
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
		const ctx = createTestContext("BACKTEST");
		const ids = new Set<string>();
		for (let i = 0; i < 100; i++) {
			ids.add(generateOrderId(ctx));
		}
		expect(ids.size).toBe(100);
	});

	it("validates order ID matches current context environment", () => {
		const ctx = createTestContext("BACKTEST");
		const orderId = generateOrderId(ctx);
		expect(() => validateOrderIdEnvironment(orderId, ctx)).not.toThrow();
	});

	it("rejects order ID from different environment", () => {
		const ctx = createTestContext("BACKTEST");
		const wrongEnvId = "LIVE-12345678-abcd1234";
		expect(() => validateOrderIdEnvironment(wrongEnvId, ctx)).toThrow(SafetyError);
	});

	it("includes traceId in SafetyError", () => {
		const ctx = createTestContext("BACKTEST");
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
	it("rejects production endpoint in BACKTEST environment", () => {
		const ctx = createTestContext("BACKTEST");
		expect(() => validateBrokerEndpoint("https://api.alpaca.markets", ctx)).toThrow(SafetyError);
	});

	it("rejects production endpoint in PAPER environment", () => {
		const ctx = createTestContext("PAPER");
		expect(() => validateBrokerEndpoint("https://api.alpaca.markets", ctx)).toThrow(SafetyError);
	});

	it("accepts paper endpoint in BACKTEST environment", () => {
		const ctx = createTestContext("BACKTEST");
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
		const ctx = createTestContext("BACKTEST");
		resetSafetyState(ctx);
	});

	it("isLiveConfirmed returns true in BACKTEST environment", () => {
		const ctx = createTestContext("BACKTEST");
		expect(isLiveConfirmed(ctx)).toBe(true);
	});

	it("isLiveConfirmed returns true in PAPER environment", () => {
		const ctx = createTestContext("PAPER");
		expect(isLiveConfirmed(ctx)).toBe(true);
	});

	it("requireLiveConfirmation does nothing in BACKTEST environment", () => {
		const ctx = createTestContext("BACKTEST");
		expect(() => requireLiveConfirmation("wrong-token", ctx)).not.toThrow();
	});

	it("requireLiveConfirmation does nothing in PAPER environment", () => {
		const ctx = createTestContext("PAPER");
		expect(() => requireLiveConfirmation("wrong-token", ctx)).not.toThrow();
	});

	it("preventAccidentalLiveExecution passes in BACKTEST environment", () => {
		const ctx = createTestContext("BACKTEST");
		expect(() => preventAccidentalLiveExecution(ctx)).not.toThrow();
	});

	it("preventAccidentalLiveExecution passes in PAPER environment", () => {
		const ctx = createTestContext("PAPER");
		expect(() => preventAccidentalLiveExecution(ctx)).not.toThrow();
	});
});

describe("State Isolation", () => {
	it("generates isolated database name for BACKTEST", () => {
		const ctx = createTestContext("BACKTEST");
		const dbName = getIsolatedDatabaseName("cream", ctx);
		expect(dbName).toBe("cream_backtest");
	});

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

	it("validates database isolation - rejects other environment databases in BACKTEST", () => {
		const ctx = createTestContext("BACKTEST");
		expect(() => validateDatabaseIsolation("file:cream_paper.db", ctx)).toThrow(SafetyError);
		expect(() => validateDatabaseIsolation("file:cream_live.db", ctx)).toThrow(SafetyError);
	});

	it("validates database isolation - rejects other environment databases in PAPER", () => {
		const ctx = createTestContext("PAPER");
		expect(() => validateDatabaseIsolation("file:cream_backtest.db", ctx)).toThrow(SafetyError);
		expect(() => validateDatabaseIsolation("file:cream_live.db", ctx)).toThrow(SafetyError);
	});

	it("allows database for current environment", () => {
		const backtestCtx = createTestContext("BACKTEST");
		expect(() => validateDatabaseIsolation("file:cream_backtest.db", backtestCtx)).not.toThrow();

		const paperCtx = createTestContext("PAPER");
		expect(() => validateDatabaseIsolation("file:cream_paper.db", paperCtx)).not.toThrow();

		const liveCtx = createTestContext("LIVE");
		expect(() => validateDatabaseIsolation("file:cream_live.db", liveCtx)).not.toThrow();
	});
});

describe("Audit Logging", () => {
	beforeEach(() => {
		const ctx = createTestContext("BACKTEST");
		resetSafetyState(ctx);
	});

	it("logs operations with timestamp and traceId", () => {
		const ctx = createTestContext("BACKTEST");
		auditLog("TEST_OPERATION", { key: "value" }, ctx);
		const log = getAuditLog();
		expect(log.length).toBe(1);
		expect(log[0]?.operation).toBe("TEST_OPERATION");
		expect(log[0]?.details.key).toBe("value");
		expect(log[0]?.timestamp).toBeDefined();
		expect(log[0]?.environment).toBe("BACKTEST");
		expect(log[0]?.traceId).toBe(ctx.traceId);
	});

	it("clears audit log in BACKTEST environment", () => {
		const ctx = createTestContext("BACKTEST");
		auditLog("TEST", {}, ctx);
		expect(getAuditLog().length).toBe(1);
		clearAuditLog(ctx);
		expect(getAuditLog().length).toBe(0);
	});

	it("throws when clearing audit log in LIVE environment", () => {
		const backtestCtx = createTestContext("BACKTEST");
		auditLog("TEST", {}, backtestCtx);

		const liveCtx = createTestContext("LIVE");
		expect(() => clearAuditLog(liveCtx)).toThrow(SafetyError);
	});
});

describe("Circuit Breaker", () => {
	beforeEach(() => {
		const ctx = createTestContext("BACKTEST");
		resetSafetyState(ctx);
	});

	it("starts with circuit closed", () => {
		expect(isCircuitOpen("test-circuit")).toBe(false);
	});

	it("opens circuit after threshold failures", () => {
		const ctx = createTestContext("BACKTEST");
		const error = new Error("Test failure");
		for (let i = 0; i < 5; i++) {
			recordCircuitFailure("test-circuit", error, ctx, 5);
		}
		expect(isCircuitOpen("test-circuit")).toBe(true);
	});

	it("resets circuit on success", () => {
		const ctx = createTestContext("BACKTEST");
		const error = new Error("Test failure");
		for (let i = 0; i < 5; i++) {
			recordCircuitFailure("reset-test", error, ctx, 5);
		}
		expect(isCircuitOpen("reset-test")).toBe(true);

		resetCircuit("reset-test", ctx);
		expect(isCircuitOpen("reset-test")).toBe(false);
	});

	it("throws when circuit is open", () => {
		const ctx = createTestContext("BACKTEST");
		const error = new Error("Test failure");
		for (let i = 0; i < 5; i++) {
			recordCircuitFailure("throw-test", error, ctx, 5);
		}
		expect(() => requireCircuitClosed("throw-test", ctx)).toThrow(SafetyError);
	});

	it("passes when circuit is closed", () => {
		const ctx = createTestContext("BACKTEST");
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
	it("resets all safety state in BACKTEST", () => {
		const ctx = createTestContext("BACKTEST");

		// Add some state
		auditLog("TEST", {}, ctx);
		recordCircuitFailure("test", new Error("fail"), ctx, 5);

		resetSafetyState(ctx);

		expect(getAuditLog().length).toBe(0);
		expect(isCircuitOpen("test")).toBe(false);
	});

	it("throws when called in PAPER environment", () => {
		const ctx = createTestContext("PAPER");
		expect(() => resetSafetyState(ctx)).toThrow(SafetyError);
	});

	it("throws when called in LIVE environment", () => {
		const ctx = createTestContext("LIVE");
		expect(() => resetSafetyState(ctx)).toThrow(SafetyError);
	});
});
