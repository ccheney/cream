import { describe, it, expect, beforeEach } from "bun:test";
import {
  generateOrderId,
  validateOrderIdEnvironment,
  validateBrokerEndpoint,
  requireLiveConfirmation,
  isLiveConfirmed,
  preventAccidentalLiveExecution,
  getIsolatedDatabaseName,
  validateDatabaseIsolation,
  auditLog,
  getAuditLog,
  clearAuditLog,
  recordCircuitFailure,
  isCircuitOpen,
  resetCircuit,
  requireCircuitClosed,
  SafetyError,
  resetSafetyState,
} from "./safety";
import { env } from "./env";

// Note: These tests run in BACKTEST environment (set via CREAM_ENV=BACKTEST)

describe("Order ID Namespacing", () => {
  it("generates order ID with correct environment prefix", () => {
    const orderId = generateOrderId();
    expect(orderId).toStartWith(`${env.CREAM_ENV}-`);
  });

  it("generates unique order IDs", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateOrderId());
    }
    expect(ids.size).toBe(100);
  });

  it("validates order ID matches current environment", () => {
    const orderId = generateOrderId();
    expect(() => validateOrderIdEnvironment(orderId)).not.toThrow();
  });

  it("rejects order ID from different environment", () => {
    const wrongEnvId = "LIVE-12345678-abcd1234";
    expect(() => validateOrderIdEnvironment(wrongEnvId)).toThrow(SafetyError);
  });
});

describe("Broker Endpoint Validation", () => {
  // In BACKTEST environment, should reject production endpoints
  it("rejects production endpoint in non-LIVE environment", () => {
    expect(() =>
      validateBrokerEndpoint("https://api.alpaca.markets")
    ).toThrow(SafetyError);
  });

  it("accepts paper endpoint in non-LIVE environment", () => {
    expect(() =>
      validateBrokerEndpoint("https://paper-api.alpaca.markets")
    ).not.toThrow();
  });
});

describe("Live Execution Guards", () => {
  beforeEach(() => {
    resetSafetyState();
  });

  it("isLiveConfirmed returns true in non-LIVE environment", () => {
    expect(isLiveConfirmed()).toBe(true);
  });

  it("requireLiveConfirmation does nothing in non-LIVE environment", () => {
    expect(() => requireLiveConfirmation("wrong-token")).not.toThrow();
  });

  it("preventAccidentalLiveExecution passes in non-LIVE environment", () => {
    expect(() => preventAccidentalLiveExecution()).not.toThrow();
  });
});

describe("State Isolation", () => {
  it("generates isolated database name", () => {
    const dbName = getIsolatedDatabaseName("cream");
    expect(dbName).toBe(`cream_${env.CREAM_ENV.toLowerCase()}`);
  });

  it("validates database isolation - rejects other environment databases", () => {
    // In BACKTEST, accessing PAPER or LIVE databases should fail
    expect(() =>
      validateDatabaseIsolation("file:cream_paper.db")
    ).toThrow(SafetyError);

    expect(() =>
      validateDatabaseIsolation("file:cream_live.db")
    ).toThrow(SafetyError);
  });

  it("allows database for current environment", () => {
    expect(() =>
      validateDatabaseIsolation("file:cream_backtest.db")
    ).not.toThrow();
  });
});

describe("Audit Logging", () => {
  beforeEach(() => {
    resetSafetyState();
  });

  it("logs operations with timestamp", () => {
    auditLog("TEST_OPERATION", { key: "value" });
    const log = getAuditLog();
    expect(log.length).toBe(1);
    expect(log[0]!.operation).toBe("TEST_OPERATION");
    expect(log[0]!.details.key).toBe("value");
    expect(log[0]!.timestamp).toBeDefined();
    expect(log[0]!.environment).toBe(env.CREAM_ENV);
  });

  it("clears audit log in BACKTEST environment", () => {
    auditLog("TEST", {});
    expect(getAuditLog().length).toBe(1);
    clearAuditLog();
    expect(getAuditLog().length).toBe(0);
  });
});

describe("Circuit Breaker", () => {
  beforeEach(() => {
    resetSafetyState();
  });

  it("starts with circuit closed", () => {
    expect(isCircuitOpen("test-circuit")).toBe(false);
  });

  it("opens circuit after threshold failures", () => {
    const error = new Error("Test failure");
    for (let i = 0; i < 5; i++) {
      recordCircuitFailure("test-circuit", error, 5);
    }
    expect(isCircuitOpen("test-circuit")).toBe(true);
  });

  it("resets circuit on success", () => {
    const error = new Error("Test failure");
    for (let i = 0; i < 5; i++) {
      recordCircuitFailure("reset-test", error, 5);
    }
    expect(isCircuitOpen("reset-test")).toBe(true);

    resetCircuit("reset-test");
    expect(isCircuitOpen("reset-test")).toBe(false);
  });

  it("throws when circuit is open", () => {
    const error = new Error("Test failure");
    for (let i = 0; i < 5; i++) {
      recordCircuitFailure("throw-test", error, 5);
    }
    expect(() => requireCircuitClosed("throw-test")).toThrow(SafetyError);
  });

  it("passes when circuit is closed", () => {
    expect(() => requireCircuitClosed("closed-circuit")).not.toThrow();
  });
});

describe("SafetyError", () => {
  it("has correct name and code", () => {
    const error = new SafetyError("Test message", "CIRCUIT_BREAKER_OPEN");
    expect(error.name).toBe("SafetyError");
    expect(error.code).toBe("CIRCUIT_BREAKER_OPEN");
    expect(error.message).toBe("Test message");
  });
});

describe("resetSafetyState", () => {
  it("resets all safety state in BACKTEST", () => {
    // Add some state
    auditLog("TEST", {});
    recordCircuitFailure("test", new Error("fail"), 5);

    resetSafetyState();

    expect(getAuditLog().length).toBe(0);
    expect(isCircuitOpen("test")).toBe(false);
  });
});
