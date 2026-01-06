/**
 * Tests for Chaos Testing Framework
 */

import { describe, expect, it, beforeEach } from "bun:test";
import {
  ChaosEngine,
  ChaosError,
  ChaosTimeoutError,
  ChaosNetworkError,
  ChaosRateLimitError,
  ChaosServerError,
  ChaosConnectionResetError,
  ChaosPresets,
  createChaosMiddleware,
  runWithChaos,
} from "../src/chaos";

// Silent logger for tests
const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

// ============================================
// ChaosEngine Tests
// ============================================

describe("ChaosEngine", () => {
  let engine: ChaosEngine;

  beforeEach(() => {
    engine = new ChaosEngine({ logger: silentLogger });
  });

  describe("enable/disable", () => {
    it("should start disabled by default", () => {
      expect(engine.isEnabled()).toBe(false);
    });

    it("should enable chaos", () => {
      engine.enable();
      expect(engine.isEnabled()).toBe(true);
    });

    it("should disable chaos", () => {
      engine.enable();
      engine.disable();
      expect(engine.isEnabled()).toBe(false);
    });
  });

  describe("setFailureRate", () => {
    it("should set failure rate", () => {
      engine.setFailureRate(0.5);
      expect(engine.getFailureRate()).toBe(0.5);
    });

    it("should reject invalid rates", () => {
      expect(() => engine.setFailureRate(-0.1)).toThrow();
      expect(() => engine.setFailureRate(1.1)).toThrow();
    });
  });

  describe("wrap", () => {
    it("should pass through when disabled", async () => {
      const fn = async () => "success";
      const result = await engine.wrap(fn, "test-op");
      expect(result).toBe("success");
    });

    it("should pass through when rate is 0", async () => {
      engine.enable();
      engine.setFailureRate(0);

      const fn = async () => "success";
      const result = await engine.wrap(fn, "test-op");
      expect(result).toBe("success");
    });

    it("should inject failures when enabled with rate 1", async () => {
      const chaosEngine = new ChaosEngine({
        enabled: true,
        failureRate: 1,
        enabledFailures: ["network_error"],
        logger: silentLogger,
      });

      const fn = async () => "success";

      await expect(chaosEngine.wrap(fn, "test-op")).rejects.toThrow(ChaosNetworkError);
    });
  });

  describe("maybeInject", () => {
    it("should not inject when disabled", async () => {
      await expect(engine.maybeInject("test-op")).resolves.toBeUndefined();
    });

    it("should inject when enabled with rate 1", async () => {
      const chaosEngine = new ChaosEngine({
        enabled: true,
        failureRate: 1,
        enabledFailures: ["network_error"],
        logger: silentLogger,
      });

      await expect(chaosEngine.maybeInject("test-op")).rejects.toThrow(ChaosError);
    });
  });

  describe("forceInject", () => {
    it("should inject timeout", async () => {
      const chaosEngine = new ChaosEngine({
        timeoutMs: 10,
        logger: silentLogger,
      });

      await expect(chaosEngine.forceInject("timeout", "test")).rejects.toThrow(
        ChaosTimeoutError
      );
    });

    it("should inject network error", async () => {
      await expect(engine.forceInject("network_error", "test")).rejects.toThrow(
        ChaosNetworkError
      );
    });

    it("should inject rate limit", async () => {
      await expect(engine.forceInject("rate_limit", "test")).rejects.toThrow(
        ChaosRateLimitError
      );
    });

    it("should inject server error", async () => {
      await expect(engine.forceInject("server_error", "test")).rejects.toThrow(
        ChaosServerError
      );
    });

    it("should inject connection reset", async () => {
      await expect(engine.forceInject("connection_reset", "test")).rejects.toThrow(
        ChaosConnectionResetError
      );
    });
  });

  describe("corruptData", () => {
    it("should not corrupt when disabled", () => {
      const data = { price: 100, name: "test" };
      const result = engine.corruptData(data, "test-op");
      expect(result).toEqual(data);
    });

    it("should corrupt data when enabled with rate 1", () => {
      const chaosEngine = new ChaosEngine({
        enabled: true,
        failureRate: 1,
        enabledFailures: ["corrupt_response"],
        logger: silentLogger,
      });

      const data = { price: 100, name: "test", active: true };
      const result = chaosEngine.corruptData(data, "test-op");

      // Something should be different
      const changed =
        result.price !== data.price ||
        result.name !== data.name ||
        result.active !== data.active;

      expect(changed).toBe(true);
    });

    it("should corrupt numbers", () => {
      const chaosEngine = new ChaosEngine({
        enabled: true,
        failureRate: 1,
        enabledFailures: ["corrupt_response"],
        logger: silentLogger,
      });

      // Run multiple times to ensure we hit number corruption
      let foundCorruptedNumber = false;
      for (let i = 0; i < 50; i++) {
        const data = { value: 42 };
        const result = chaosEngine.corruptData(data, "test");
        if (result.value !== 42) {
          foundCorruptedNumber = true;
          break;
        }
      }
      expect(foundCorruptedNumber).toBe(true);
    });
  });

  describe("events", () => {
    it("should track chaos events", async () => {
      const chaosEngine = new ChaosEngine({
        enabled: true,
        failureRate: 1,
        enabledFailures: ["network_error"],
        logger: silentLogger,
      });

      try {
        await chaosEngine.wrap(async () => {}, "test-op");
      } catch {
        // Expected
      }

      const events = chaosEngine.getEvents();
      expect(events.length).toBe(1);
      expect(events[0]?.type).toBe("network_error");
      expect(events[0]?.operation).toBe("test-op");
    });

    it("should clear events", async () => {
      const chaosEngine = new ChaosEngine({
        enabled: true,
        failureRate: 1,
        enabledFailures: ["network_error"],
        logger: silentLogger,
      });

      try {
        await chaosEngine.wrap(async () => {}, "test-op");
      } catch {
        // Expected
      }

      chaosEngine.clearEvents();
      expect(chaosEngine.getEvents()).toHaveLength(0);
    });
  });
});

// ============================================
// Chaos Error Tests
// ============================================

describe("Chaos Errors", () => {
  describe("ChaosTimeoutError", () => {
    it("should have correct properties", () => {
      const error = new ChaosTimeoutError("test-op", 5000);
      expect(error.name).toBe("ChaosTimeoutError");
      expect(error.chaosType).toBe("timeout");
      expect(error.operation).toBe("test-op");
      expect(error.message).toContain("5000");
    });
  });

  describe("ChaosNetworkError", () => {
    it("should have correct properties", () => {
      const error = new ChaosNetworkError("test-op");
      expect(error.name).toBe("ChaosNetworkError");
      expect(error.chaosType).toBe("network_error");
      expect(error.message).toContain("Network error");
    });
  });

  describe("ChaosRateLimitError", () => {
    it("should have correct properties", () => {
      const error = new ChaosRateLimitError("test-op", 60000);
      expect(error.name).toBe("ChaosRateLimitError");
      expect(error.chaosType).toBe("rate_limit");
      expect(error.retryAfterMs).toBe(60000);
    });
  });

  describe("ChaosServerError", () => {
    it("should have correct properties", () => {
      const error = new ChaosServerError("test-op", 503);
      expect(error.name).toBe("ChaosServerError");
      expect(error.chaosType).toBe("server_error");
      expect(error.statusCode).toBe(503);
    });

    it("should default to 500", () => {
      const error = new ChaosServerError("test-op");
      expect(error.statusCode).toBe(500);
    });
  });

  describe("ChaosConnectionResetError", () => {
    it("should have correct properties", () => {
      const error = new ChaosConnectionResetError("test-op");
      expect(error.name).toBe("ChaosConnectionResetError");
      expect(error.chaosType).toBe("connection_reset");
      expect(error.message).toContain("reset");
    });
  });
});

// ============================================
// createChaosMiddleware Tests
// ============================================

describe("createChaosMiddleware", () => {
  it("should create a middleware function", () => {
    const engine = new ChaosEngine({ logger: silentLogger });
    const middleware = createChaosMiddleware(engine);
    expect(typeof middleware).toBe("function");
  });

  it("should wrap functions", async () => {
    const engine = new ChaosEngine({ logger: silentLogger });
    const middleware = createChaosMiddleware(engine);

    const result = await middleware(async () => "success", "test-op");
    expect(result).toBe("success");
  });
});

// ============================================
// runWithChaos Tests
// ============================================

describe("runWithChaos", () => {
  it("should run multiple iterations", async () => {
    const engine = new ChaosEngine({
      enabled: true,
      failureRate: 0.5,
      enabledFailures: ["network_error"],
      logger: silentLogger,
    });

    const result = await runWithChaos(
      engine,
      async () => "success",
      "test-op",
      20
    );

    expect(result.iterations).toBe(20);
    expect(result.successCount + result.failureCount).toBe(20);
    // With 50% failure rate, we should have some of each
    expect(result.successCount).toBeGreaterThan(0);
    expect(result.failureCount).toBeGreaterThan(0);
  });

  it("should track failures by type", async () => {
    const engine = new ChaosEngine({
      enabled: true,
      failureRate: 1,
      enabledFailures: ["network_error"],
      logger: silentLogger,
    });

    const result = await runWithChaos(
      engine,
      async () => "success",
      "test-op",
      10
    );

    expect(result.failuresByType["network_error"]).toBe(10);
  });
});

// ============================================
// ChaosPresets Tests
// ============================================

describe("ChaosPresets", () => {
  it("should create light preset", () => {
    const config = ChaosPresets.light();
    expect(config.enabled).toBe(true);
    expect(config.failureRate).toBe(0.05);
  });

  it("should create moderate preset", () => {
    const config = ChaosPresets.moderate();
    expect(config.failureRate).toBe(0.15);
    expect(config.enabledFailures).toContain("rate_limit");
  });

  it("should create heavy preset", () => {
    const config = ChaosPresets.heavy();
    expect(config.failureRate).toBe(0.30);
    expect(config.enabledFailures).toContain("connection_reset");
  });

  it("should create networkIssues preset", () => {
    const config = ChaosPresets.networkIssues();
    expect(config.enabledFailures).toContain("timeout");
    expect(config.enabledFailures).toContain("network_error");
    expect(config.enabledFailures).not.toContain("rate_limit");
  });

  it("should create rateLimiting preset", () => {
    const config = ChaosPresets.rateLimiting();
    expect(config.enabledFailures).toEqual(["rate_limit"]);
    expect(config.rateLimitRetryAfterMs).toBe(30000);
  });

  it("should create dataCorruption preset", () => {
    const config = ChaosPresets.dataCorruption();
    expect(config.enabledFailures).toEqual(["corrupt_response"]);
  });

  it("should work with ChaosEngine", async () => {
    const engine = new ChaosEngine({
      ...ChaosPresets.light(),
      logger: silentLogger,
    });

    expect(engine.isEnabled()).toBe(true);
    expect(engine.getFailureRate()).toBe(0.05);
  });
});
