/**
 * Tests for Component Health Check System
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  createCustomHealthCheck,
  createHealthRegistry,
  createHttpHealthCheck,
  createMemoryHealthCheck,
  HealthCheckRegistry,
} from "./health";

// ============================================
// HealthCheckRegistry Tests
// ============================================

describe("HealthCheckRegistry", () => {
  let registry: HealthCheckRegistry;

  beforeEach(() => {
    registry = new HealthCheckRegistry();
  });

  afterEach(() => {
    registry.stopAutoCheck();
  });

  describe("register/unregister", () => {
    it("should register a component", async () => {
      registry.register({
        name: "test-component",
        check: async () => ({
          component: "test-component",
          status: "HEALTHY",
          message: "OK",
          responseTimeMs: 1,
          timestamp: new Date().toISOString(),
        }),
      });

      const result = await registry.checkComponent("test-component");
      expect(result.status).toBe("HEALTHY");
    });

    it("should unregister a component", () => {
      registry.register({
        name: "test-component",
        check: async () => ({
          component: "test-component",
          status: "HEALTHY",
          message: "OK",
          responseTimeMs: 1,
          timestamp: new Date().toISOString(),
        }),
      });

      const removed = registry.unregister("test-component");
      expect(removed).toBe(true);

      const removed2 = registry.unregister("test-component");
      expect(removed2).toBe(false);
    });

    it("should return UNKNOWN for unregistered component", async () => {
      const result = await registry.checkComponent("unknown");
      expect(result.status).toBe("UNKNOWN");
      expect(result.message).toContain("not registered");
    });
  });

  describe("checkComponent", () => {
    it("should track consecutive successes", async () => {
      let callCount = 0;
      registry.register({
        name: "counter",
        check: async () => {
          callCount++;
          return {
            component: "counter",
            status: "HEALTHY",
            message: `Call ${callCount}`,
            responseTimeMs: 1,
            timestamp: new Date().toISOString(),
          };
        },
      });

      await registry.checkComponent("counter");
      await registry.checkComponent("counter");
      await registry.checkComponent("counter");

      expect(callCount).toBe(3);
    });

    it("should handle check errors", async () => {
      registry.register({
        name: "error-component",
        check: async () => {
          throw new Error("Check failed");
        },
        failureThreshold: 1, // Mark unhealthy after 1 failure
      });

      const result = await registry.checkComponent("error-component");
      expect(result.status).toBe("UNHEALTHY");
      expect(result.message).toContain("Check failed");
    });

    it("should handle timeout", async () => {
      registry.register({
        name: "slow-component",
        check: async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return {
            component: "slow-component",
            status: "HEALTHY",
            message: "OK",
            responseTimeMs: 100,
            timestamp: new Date().toISOString(),
          };
        },
        timeoutMs: 10, // Very short timeout
        failureThreshold: 1, // Mark unhealthy after 1 failure
      });

      const result = await registry.checkComponent("slow-component");
      expect(result.status).toBe("UNHEALTHY");
      expect(result.message).toContain("timed out");
    });
  });

  describe("checkAll", () => {
    it("should check all registered components", async () => {
      registry.register({
        name: "comp1",
        check: async () => ({
          component: "comp1",
          status: "HEALTHY",
          message: "OK",
          responseTimeMs: 1,
          timestamp: new Date().toISOString(),
        }),
      });

      registry.register({
        name: "comp2",
        check: async () => ({
          component: "comp2",
          status: "HEALTHY",
          message: "OK",
          responseTimeMs: 1,
          timestamp: new Date().toISOString(),
        }),
      });

      const health = await registry.checkAll();

      expect(health.components).toHaveLength(2);
      expect(health.healthyCount).toBe(2);
      expect(health.status).toBe("HEALTHY");
    });

    it("should report DEGRADED when some components fail", async () => {
      registry.register({
        name: "healthy",
        check: async () => ({
          component: "healthy",
          status: "HEALTHY",
          message: "OK",
          responseTimeMs: 1,
          timestamp: new Date().toISOString(),
        }),
      });

      registry.register({
        name: "degraded",
        check: async () => ({
          component: "degraded",
          status: "DEGRADED",
          message: "Slow",
          responseTimeMs: 1,
          timestamp: new Date().toISOString(),
        }),
      });

      const health = await registry.checkAll();

      expect(health.status).toBe("DEGRADED");
      expect(health.healthyCount).toBe(1);
      expect(health.degradedCount).toBe(1);
    });
  });

  describe("failure thresholds", () => {
    it("should mark unhealthy after failure threshold", async () => {
      let failCount = 0;
      registry.register({
        name: "failing",
        check: async () => {
          failCount++;
          return {
            component: "failing",
            status: "UNHEALTHY",
            message: `Fail ${failCount}`,
            responseTimeMs: 1,
            timestamp: new Date().toISOString(),
          };
        },
        failureThreshold: 3,
      });

      // First two failures - should be DEGRADED
      await registry.checkComponent("failing");
      let result = await registry.checkComponent("failing");
      expect(result.status).toBe("DEGRADED");

      // Third failure - should be UNHEALTHY
      result = await registry.checkComponent("failing");
      expect(result.status).toBe("UNHEALTHY");
    });

    it("should recover after success threshold", async () => {
      let healthy = false;
      registry.register({
        name: "recovering",
        check: async () => ({
          component: "recovering",
          status: healthy ? "HEALTHY" : "UNHEALTHY",
          message: healthy ? "OK" : "Failed",
          responseTimeMs: 1,
          timestamp: new Date().toISOString(),
        }),
        failureThreshold: 2,
        successThreshold: 2,
      });

      // Fail twice - should become UNHEALTHY
      await registry.checkComponent("recovering");
      let result = await registry.checkComponent("recovering");
      expect(result.status).toBe("UNHEALTHY");

      // Start recovering
      healthy = true;
      result = await registry.checkComponent("recovering");
      // One success, but need 2 to recover - should stay UNHEALTHY/DEGRADED
      expect(["UNHEALTHY", "DEGRADED"]).toContain(result.status);

      // Second success - should now be HEALTHY
      result = await registry.checkComponent("recovering");
      expect(result.status).toBe("HEALTHY");
    });
  });

  describe("critical components", () => {
    it("should report critical failure", async () => {
      registry.register({
        name: "critical-db",
        check: async () => ({
          component: "critical-db",
          status: "UNHEALTHY",
          message: "Connection failed",
          responseTimeMs: 1,
          timestamp: new Date().toISOString(),
        }),
        critical: true,
        failureThreshold: 1,
      });

      await registry.checkAll();

      expect(registry.hasCriticalFailure()).toBe(true);
    });

    it("should not report critical failure for non-critical components", async () => {
      registry.register({
        name: "optional-cache",
        check: async () => ({
          component: "optional-cache",
          status: "UNHEALTHY",
          message: "Cache unavailable",
          responseTimeMs: 1,
          timestamp: new Date().toISOString(),
        }),
        critical: false,
        failureThreshold: 1,
      });

      await registry.checkAll();

      expect(registry.hasCriticalFailure()).toBe(false);
    });
  });

  describe("history", () => {
    it("should track health check history", async () => {
      registry.register({
        name: "tracked",
        check: async () => ({
          component: "tracked",
          status: "HEALTHY",
          message: "OK",
          responseTimeMs: 1,
          timestamp: new Date().toISOString(),
        }),
      });

      await registry.checkComponent("tracked");
      await registry.checkComponent("tracked");
      await registry.checkComponent("tracked");

      const history = registry.getHistory("tracked");
      expect(history).toHaveLength(3);
    });

    it("should limit history size", () => {
      const smallRegistry = new HealthCheckRegistry({ historySize: 5 });

      smallRegistry.register({
        name: "limited",
        check: async () => ({
          component: "limited",
          status: "HEALTHY",
          message: "OK",
          responseTimeMs: 1,
          timestamp: new Date().toISOString(),
        }),
      });

      // Run 10 checks
      const checks = Array.from({ length: 10 }, () => smallRegistry.checkComponent("limited"));

      Promise.all(checks).then(() => {
        const history = smallRegistry.getHistory();
        expect(history.length).toBeLessThanOrEqual(5);
      });
    });

    it("should clear history", async () => {
      registry.register({
        name: "clearable",
        check: async () => ({
          component: "clearable",
          status: "HEALTHY",
          message: "OK",
          responseTimeMs: 1,
          timestamp: new Date().toISOString(),
        }),
      });

      await registry.checkComponent("clearable");
      expect(registry.getHistory()).toHaveLength(1);

      registry.clearHistory();
      expect(registry.getHistory()).toHaveLength(0);
    });
  });

  describe("getSystemHealth", () => {
    it("should return current health without running checks", async () => {
      registry.register({
        name: "cached",
        check: async () => ({
          component: "cached",
          status: "HEALTHY",
          message: "OK",
          responseTimeMs: 1,
          timestamp: new Date().toISOString(),
        }),
      });

      // Run a check first
      await registry.checkComponent("cached");

      // Get cached health
      const health = registry.getSystemHealth();

      expect(health.components).toHaveLength(1);
      expect(health.components[0]?.status).toBe("HEALTHY");
    });

    it("should return UNKNOWN for unchecked components", () => {
      registry.register({
        name: "unchecked",
        check: async () => ({
          component: "unchecked",
          status: "HEALTHY",
          message: "OK",
          responseTimeMs: 1,
          timestamp: new Date().toISOString(),
        }),
      });

      const health = registry.getSystemHealth();

      expect(health.components[0]?.status).toBe("UNKNOWN");
    });

    it("should include uptime", async () => {
      // Wait a small amount
      await new Promise((resolve) => setTimeout(resolve, 10));

      const health = registry.getSystemHealth();

      expect(health.uptimeSeconds).toBeGreaterThanOrEqual(0);
    });
  });

  describe("getUnhealthyComponents", () => {
    it("should return list of unhealthy components", async () => {
      registry.register({
        name: "healthy1",
        check: async () => ({
          component: "healthy1",
          status: "HEALTHY",
          message: "OK",
          responseTimeMs: 1,
          timestamp: new Date().toISOString(),
        }),
      });

      registry.register({
        name: "unhealthy1",
        check: async () => ({
          component: "unhealthy1",
          status: "UNHEALTHY",
          message: "Failed",
          responseTimeMs: 1,
          timestamp: new Date().toISOString(),
        }),
        failureThreshold: 1,
      });

      await registry.checkAll();

      const unhealthy = registry.getUnhealthyComponents();
      expect(unhealthy).toContain("unhealthy1");
      expect(unhealthy).not.toContain("healthy1");
    });
  });
});

// ============================================
// Built-in Health Check Tests
// ============================================

describe("createHttpHealthCheck", () => {
  it("should create an HTTP health check", () => {
    const check = createHttpHealthCheck("api", "http://localhost:3000/health");

    expect(check.name).toBe("api");
    expect(typeof check.check).toBe("function");
  });

  it("should handle network errors gracefully", async () => {
    const check = createHttpHealthCheck("unreachable", "http://localhost:99999/health", {
      timeout: 100,
    });

    const result = await check.check();

    expect(result.status).toBe("UNHEALTHY");
    expect(result.component).toBe("unreachable");
  });
});

describe("createMemoryHealthCheck", () => {
  it("should create a memory health check", async () => {
    const check = createMemoryHealthCheck("memory");

    const result = await check.check();

    expect(result.component).toBe("memory");
    expect(["HEALTHY", "DEGRADED", "UNHEALTHY"]).toContain(result.status);
    expect(result.details).toHaveProperty("heapUsedMB");
    expect(result.details).toHaveProperty("heapTotalMB");
    expect(result.details).toHaveProperty("rssMB");
  });

  it("should report healthy under threshold", async () => {
    const check = createMemoryHealthCheck("memory", {
      warningThresholdMB: 10000, // Very high
      criticalThresholdMB: 20000,
    });

    const result = await check.check();

    expect(result.status).toBe("HEALTHY");
  });

  it("should report degraded when warning threshold exceeded", async () => {
    const check = createMemoryHealthCheck("memory", {
      warningThresholdMB: 0.001, // Extremely low to always trigger
      criticalThresholdMB: 20000,
    });

    const result = await check.check();

    expect(result.status).toBe("DEGRADED");
    expect(result.message).toContain("Warning");
  });

  it("should report unhealthy when critical threshold exceeded", async () => {
    const check = createMemoryHealthCheck("memory", {
      warningThresholdMB: 0.0001,
      criticalThresholdMB: 0.001, // Extremely low to always trigger
    });

    const result = await check.check();

    expect(result.status).toBe("UNHEALTHY");
    expect(result.message).toContain("Critical");
  });
});

describe("createCustomHealthCheck", () => {
  it("should create a custom health check", async () => {
    const check = createCustomHealthCheck("custom", async () => ({
      healthy: true,
      message: "All good",
      details: { custom: "value" },
    }));

    const result = await check.check();

    expect(result.component).toBe("custom");
    expect(result.status).toBe("HEALTHY");
    expect(result.message).toBe("All good");
    expect(result.details?.custom).toBe("value");
  });

  it("should handle unhealthy result", async () => {
    const check = createCustomHealthCheck("failing", async () => ({
      healthy: false,
      message: "Service down",
    }));

    const result = await check.check();

    expect(result.status).toBe("UNHEALTHY");
    expect(result.message).toBe("Service down");
  });

  it("should handle errors", async () => {
    const check = createCustomHealthCheck("error", async () => {
      throw new Error("Unexpected error");
    });

    const result = await check.check();

    expect(result.status).toBe("UNHEALTHY");
    expect(result.message).toBe("Unexpected error");
  });

  it("should use default messages", async () => {
    const check = createCustomHealthCheck("default", async () => ({
      healthy: true,
    }));

    const result = await check.check();

    expect(result.message).toBe("OK");
  });
});

// ============================================
// Factory Function Tests
// ============================================

describe("createHealthRegistry", () => {
  it("should create registry with default config", () => {
    const registry = createHealthRegistry();
    expect(registry).toBeInstanceOf(HealthCheckRegistry);
  });

  it("should create registry with custom config", () => {
    const registry = createHealthRegistry({
      defaultIntervalMs: 10000,
      historySize: 50,
    });

    expect(registry).toBeInstanceOf(HealthCheckRegistry);
  });
});

// ============================================
// Integration Tests
// ============================================

describe("Integration", () => {
  it("should handle complete health monitoring workflow", async () => {
    const registry = createHealthRegistry();

    // Register multiple components
    registry.register({
      name: "database",
      check: async () => ({
        component: "database",
        status: "HEALTHY",
        message: "Connected",
        responseTimeMs: 5,
        timestamp: new Date().toISOString(),
      }),
      critical: true,
    });

    registry.register({
      name: "cache",
      check: async () => ({
        component: "cache",
        status: "HEALTHY",
        message: "Available",
        responseTimeMs: 1,
        timestamp: new Date().toISOString(),
      }),
    });

    registry.register(createMemoryHealthCheck("memory"));

    // Check all components
    const health = await registry.checkAll();

    expect(health.healthyCount).toBe(3);
    expect(health.status).toBe("HEALTHY");
    expect(health.uptimeSeconds).toBeGreaterThanOrEqual(0);

    // Verify history
    const history = registry.getHistory();
    expect(history.length).toBe(3);

    // Verify no critical failures
    expect(registry.hasCriticalFailure()).toBe(false);
  });
});
