/**
 * Tests for Component Health Check System (factories + integration)
 */

import { describe, expect, it } from "bun:test";
import {
	createCustomHealthCheck,
	createHealthRegistry,
	createHttpHealthCheck,
	createMemoryHealthCheck,
	HealthCheckRegistry,
} from "./health";

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
			warningThresholdMB: 10000,
			criticalThresholdMB: 20000,
		});

		const result = await check.check();

		expect(result.status).toBe("HEALTHY");
	});
});

describe("createMemoryHealthCheck thresholds", () => {
	it("should report degraded when warning threshold exceeded", async () => {
		const check = createMemoryHealthCheck("memory", {
			warningThresholdMB: 0.001,
			criticalThresholdMB: 20000,
		});

		const result = await check.check();

		expect(result.status).toBe("DEGRADED");
		expect(result.message).toContain("Warning");
	});

	it("should report unhealthy when critical threshold exceeded", async () => {
		const check = createMemoryHealthCheck("memory", {
			warningThresholdMB: 0.0001,
			criticalThresholdMB: 0.001,
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
});

describe("createCustomHealthCheck defaults and error handling", () => {
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

describe("Health integration", () => {
	it("should handle complete health monitoring workflow", async () => {
		const registry = createHealthRegistry();

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

		const health = await registry.checkAll();

		expect(health.healthyCount).toBe(3);
		expect(health.status).toBe("HEALTHY");
		expect(health.uptimeSeconds).toBeGreaterThanOrEqual(0);

		const history = registry.getHistory();
		expect(history.length).toBe(3);
		expect(registry.hasCriticalFailure()).toBe(false);
	});
});
