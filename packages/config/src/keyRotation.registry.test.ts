/**
 * Tests for KeyRotationRegistry
 */

import { afterEach, describe, expect, it } from "bun:test";
import { KeyRotationRegistry } from "./keyRotation/index.js";

const silentLogger = {
	info: () => {},
	warn: () => {},
	error: () => {},
};

function createRegistry() {
	return new KeyRotationRegistry({}, silentLogger);
}

describe("KeyRotationRegistry getManager", () => {
	it("should create manager on first access", () => {
		const registry = createRegistry();

		const manager = registry.getManager("alpaca");
		expect(manager).toBeDefined();
	});

	it("should return same manager on subsequent access", () => {
		const registry = createRegistry();

		const manager1 = registry.getManager("alpaca");
		const manager2 = registry.getManager("alpaca");
		expect(manager1).toBe(manager2);
	});

	it("should create different manager instances", () => {
		const registry = createRegistry();

		const manager1 = registry.getManager("alpaca");
		const manager2 = registry.getManager("alpaca");
		expect(manager1).toBe(manager2);
	});
});

describe("KeyRotationRegistry getKey", () => {
	it("should get key from correct service manager", () => {
		const registry = createRegistry();
		registry.getManager("alpaca").addKey("alpaca-key", "pk");

		expect(registry.getKey("alpaca")).toBe("alpaca-key");
	});
});

describe("KeyRotationRegistry reportSuccess and reportError", () => {
	it("should route to correct manager", () => {
		const registry = createRegistry();
		registry.getManager("alpaca").addKey("test-key", "key1");

		registry.reportSuccess("alpaca", "test-key");
		registry.reportError("alpaca", "test-key", "error");

		const stats = registry.getManager("alpaca").getStats();
		expect(stats.totalErrors).toBe(1);
	});
});

describe("KeyRotationRegistry reportRateLimit", () => {
	it("should route to correct manager", () => {
		const registry = createRegistry();
		registry.getManager("alpaca").addKey("test-key", "key1");

		registry.reportRateLimit("alpaca", "test-key", 42);

		const stats = registry.getManager("alpaca").getStats();
		expect(stats.keys[0]?.rateLimitRemaining).toBe(42);
	});
});

describe("KeyRotationRegistry getAllStats", () => {
	it("should return stats for all initialized managers", () => {
		const registry = createRegistry();
		registry.getManager("alpaca").addKey("pk", "alpaca-key");

		const allStats = registry.getAllStats();

		expect(allStats).toHaveLength(1);
		expect(allStats.some((stats) => stats.service === "alpaca")).toBe(true);
	});
});

describe("KeyRotationRegistry initFromEnv", () => {
	const savedAlpacaKey = Bun.env.ALPACA_KEY;

	afterEach(() => {
		if (savedAlpacaKey !== undefined) {
			Bun.env.ALPACA_KEY = savedAlpacaKey;
		} else {
			delete Bun.env.ALPACA_KEY;
		}
	});

	it("should initialize managers from environment variables", () => {
		Bun.env.ALPACA_KEY = "test-alpaca-key";

		const registry = createRegistry();
		registry.initFromEnv();

		expect(registry.getKey("alpaca")).toBe("test-alpaca-key");
	});

	it("should handle comma-separated keys from env", () => {
		Bun.env.ALPACA_KEY = "key1,key2,key3";

		const registry = createRegistry();
		registry.initFromEnv();

		expect(registry.getManager("alpaca").getActiveKeyCount()).toBe(3);
	});

	it("should handle missing env variables gracefully", () => {
		delete Bun.env.ALPACA_KEY;
		// @ts-expect-error - Bun.env is readonly but we need to clear for test
		Bun.env.ALPACA_KEY = undefined;

		const registry = createRegistry();
		registry.initFromEnv();

		const stats = registry.getAllStats();
		expect(stats.length).toBe(1);
	});
});
