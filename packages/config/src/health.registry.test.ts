/**
 * Tests for HealthCheckRegistry behavior
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { HealthCheckRegistry } from "./health";

type ComponentStatus = "HEALTHY" | "DEGRADED" | "UNHEALTHY" | "UNKNOWN";

function createResult(component: string, status: ComponentStatus, message = "OK") {
	return {
		component,
		status,
		message,
		responseTimeMs: 1,
		timestamp: new Date().toISOString(),
	};
}

function createCheck(component: string, status: ComponentStatus, message = "OK", delayMs = 0) {
	return async () => {
		if (delayMs > 0) {
			await new Promise((resolve) => setTimeout(resolve, delayMs));
		}

		return createResult(component, status, message);
	};
}

describe("HealthCheckRegistry register and unregister", () => {
	let registry: HealthCheckRegistry;

	beforeEach(() => {
		registry = new HealthCheckRegistry();
	});

	afterEach(() => {
		registry.stopAutoCheck();
	});

	it("should register a component", async () => {
		registry.register({
			name: "test-component",
			check: createCheck("test-component", "HEALTHY"),
		});

		const result = await registry.checkComponent("test-component");
		expect(result.status).toBe("HEALTHY");
	});

	it("should unregister a component", () => {
		registry.register({
			name: "test-component",
			check: createCheck("test-component", "HEALTHY"),
		});

		expect(registry.unregister("test-component")).toBe(true);
		expect(registry.unregister("test-component")).toBe(false);
	});

	it("should return UNKNOWN for unregistered component", async () => {
		const result = await registry.checkComponent("unknown");

		expect(result.status).toBe("UNKNOWN");
		expect(result.message).toContain("not registered");
	});
});

describe("HealthCheckRegistry checkComponent", () => {
	let registry: HealthCheckRegistry;

	beforeEach(() => {
		registry = new HealthCheckRegistry();
	});

	afterEach(() => {
		registry.stopAutoCheck();
	});

	it("should track consecutive successes", async () => {
		let callCount = 0;
		registry.register({
			name: "counter",
			check: async () => {
				callCount++;
				return createResult("counter", "HEALTHY", `Call ${callCount}`);
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
			failureThreshold: 1,
		});

		const result = await registry.checkComponent("error-component");

		expect(result.status).toBe("UNHEALTHY");
		expect(result.message).toContain("Check failed");
	});
});

describe("HealthCheckRegistry checkComponent timeout", () => {
	let registry: HealthCheckRegistry;

	beforeEach(() => {
		registry = new HealthCheckRegistry();
	});

	afterEach(() => {
		registry.stopAutoCheck();
	});

	it("should handle timeout", async () => {
		registry.register({
			name: "slow-component",
			check: createCheck("slow-component", "HEALTHY", "OK", 100),
			timeoutMs: 10,
			failureThreshold: 1,
		});

		const result = await registry.checkComponent("slow-component");

		expect(result.status).toBe("UNHEALTHY");
		expect(result.message).toContain("timed out");
	});
});

describe("HealthCheckRegistry checkAll", () => {
	let registry: HealthCheckRegistry;

	beforeEach(() => {
		registry = new HealthCheckRegistry();
	});

	afterEach(() => {
		registry.stopAutoCheck();
	});

	it("should check all registered components", async () => {
		registry.register({ name: "comp1", check: createCheck("comp1", "HEALTHY") });
		registry.register({ name: "comp2", check: createCheck("comp2", "HEALTHY") });

		const health = await registry.checkAll();

		expect(health.components).toHaveLength(2);
		expect(health.healthyCount).toBe(2);
		expect(health.status).toBe("HEALTHY");
	});

	it("should report DEGRADED when some components fail", async () => {
		registry.register({ name: "healthy", check: createCheck("healthy", "HEALTHY") });
		registry.register({ name: "degraded", check: createCheck("degraded", "DEGRADED", "Slow") });

		const health = await registry.checkAll();

		expect(health.status).toBe("DEGRADED");
		expect(health.healthyCount).toBe(1);
		expect(health.degradedCount).toBe(1);
	});
});

describe("HealthCheckRegistry failure thresholds", () => {
	let registry: HealthCheckRegistry;

	beforeEach(() => {
		registry = new HealthCheckRegistry();
	});

	afterEach(() => {
		registry.stopAutoCheck();
	});

	it("should mark unhealthy after failure threshold", async () => {
		let failCount = 0;
		registry.register({
			name: "failing",
			check: async () => {
				failCount++;
				return createResult("failing", "UNHEALTHY", `Fail ${failCount}`);
			},
			failureThreshold: 3,
		});

		await registry.checkComponent("failing");
		let result = await registry.checkComponent("failing");
		expect(result.status).toBe("DEGRADED");

		result = await registry.checkComponent("failing");
		expect(result.status).toBe("UNHEALTHY");
	});

	it("should recover after success threshold", async () => {
		let healthy = false;
		registry.register({
			name: "recovering",
			check: async () =>
				createResult("recovering", healthy ? "HEALTHY" : "UNHEALTHY", healthy ? "OK" : "Failed"),
			failureThreshold: 2,
			successThreshold: 2,
		});

		await registry.checkComponent("recovering");
		let result = await registry.checkComponent("recovering");
		expect(result.status).toBe("UNHEALTHY");

		healthy = true;
		result = await registry.checkComponent("recovering");
		expect(["UNHEALTHY", "DEGRADED"]).toContain(result.status);

		result = await registry.checkComponent("recovering");
		expect(result.status).toBe("HEALTHY");
	});
});

describe("HealthCheckRegistry critical components", () => {
	let registry: HealthCheckRegistry;

	beforeEach(() => {
		registry = new HealthCheckRegistry();
	});

	afterEach(() => {
		registry.stopAutoCheck();
	});

	it("should report critical failure", async () => {
		registry.register({
			name: "critical-db",
			check: createCheck("critical-db", "UNHEALTHY", "Connection failed"),
			critical: true,
			failureThreshold: 1,
		});

		await registry.checkAll();

		expect(registry.hasCriticalFailure()).toBe(true);
	});

	it("should not report critical failure for non-critical components", async () => {
		registry.register({
			name: "optional-cache",
			check: createCheck("optional-cache", "UNHEALTHY", "Cache unavailable"),
			critical: false,
			failureThreshold: 1,
		});

		await registry.checkAll();

		expect(registry.hasCriticalFailure()).toBe(false);
	});
});

describe("HealthCheckRegistry history", () => {
	let registry: HealthCheckRegistry;

	beforeEach(() => {
		registry = new HealthCheckRegistry();
	});

	afterEach(() => {
		registry.stopAutoCheck();
	});

	it("should track health check history", async () => {
		registry.register({ name: "tracked", check: createCheck("tracked", "HEALTHY") });

		await registry.checkComponent("tracked");
		await registry.checkComponent("tracked");
		await registry.checkComponent("tracked");

		const history = registry.getHistory("tracked");
		expect(history).toHaveLength(3);
	});

	it("should clear history", async () => {
		registry.register({ name: "clearable", check: createCheck("clearable", "HEALTHY") });

		await registry.checkComponent("clearable");
		expect(registry.getHistory()).toHaveLength(1);

		registry.clearHistory();
		expect(registry.getHistory()).toHaveLength(0);
	});
});

describe("HealthCheckRegistry history size", () => {
	it("should limit history size", async () => {
		const smallRegistry = new HealthCheckRegistry({ historySize: 5 });
		smallRegistry.register({ name: "limited", check: createCheck("limited", "HEALTHY") });

		const checks = Array.from({ length: 10 }, () => smallRegistry.checkComponent("limited"));
		await Promise.all(checks);

		const history = smallRegistry.getHistory();
		expect(history.length).toBeLessThanOrEqual(5);

		smallRegistry.stopAutoCheck();
	});
});

describe("HealthCheckRegistry getSystemHealth", () => {
	let registry: HealthCheckRegistry;

	beforeEach(() => {
		registry = new HealthCheckRegistry();
	});

	afterEach(() => {
		registry.stopAutoCheck();
	});

	it("should return current health without running checks", async () => {
		registry.register({ name: "cached", check: createCheck("cached", "HEALTHY") });

		await registry.checkComponent("cached");
		const health = registry.getSystemHealth();

		expect(health.components).toHaveLength(1);
		expect(health.components[0]?.status).toBe("HEALTHY");
	});

	it("should return UNKNOWN for unchecked components", () => {
		registry.register({ name: "unchecked", check: createCheck("unchecked", "HEALTHY") });

		const health = registry.getSystemHealth();

		expect(health.components[0]?.status).toBe("UNKNOWN");
	});
});

describe("HealthCheckRegistry system health metadata", () => {
	let registry: HealthCheckRegistry;

	beforeEach(() => {
		registry = new HealthCheckRegistry();
	});

	afterEach(() => {
		registry.stopAutoCheck();
	});

	it("should include uptime", async () => {
		await new Promise((resolve) => setTimeout(resolve, 10));

		const health = registry.getSystemHealth();

		expect(health.uptimeSeconds).toBeGreaterThanOrEqual(0);
	});
});

describe("HealthCheckRegistry getUnhealthyComponents", () => {
	let registry: HealthCheckRegistry;

	beforeEach(() => {
		registry = new HealthCheckRegistry();
	});

	afterEach(() => {
		registry.stopAutoCheck();
	});

	it("should return list of unhealthy components", async () => {
		registry.register({ name: "healthy1", check: createCheck("healthy1", "HEALTHY") });
		registry.register({
			name: "unhealthy1",
			check: createCheck("unhealthy1", "UNHEALTHY", "Failed"),
			failureThreshold: 1,
		});

		await registry.checkAll();

		const unhealthy = registry.getUnhealthyComponents();
		expect(unhealthy).toContain("unhealthy1");
		expect(unhealthy).not.toContain("healthy1");
	});
});
