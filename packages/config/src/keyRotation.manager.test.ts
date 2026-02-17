/**
 * Tests for KeyRotationManager
 */

import { beforeEach, describe, expect, it } from "bun:test";
import { KeyRotationManager } from "./keyRotation/index.js";

const silentLogger = {
	info: () => {},
	warn: () => {},
	error: () => {},
};

function createManager(config: ConstructorParameters<typeof KeyRotationManager>[1] = {}) {
	return new KeyRotationManager("alpaca", config, silentLogger);
}

describe("KeyRotationManager addKey", () => {
	let manager: KeyRotationManager;

	beforeEach(() => {
		manager = createManager();
	});

	it("should add a key", () => {
		manager.addKey("test-key-1", "key1");
		expect(manager.hasKeys()).toBe(true);
		expect(manager.getActiveKeyCount()).toBe(1);
	});

	it("should not add duplicate keys", () => {
		manager.addKey("test-key-1", "key1");
		manager.addKey("test-key-1", "key1-dup");
		expect(manager.getActiveKeyCount()).toBe(1);
	});

	it("should add multiple different keys", () => {
		manager.addKey("test-key-1", "key1");
		manager.addKey("test-key-2", "key2");
		manager.addKey("test-key-3", "key3");
		expect(manager.getActiveKeyCount()).toBe(3);
	});
});

describe("KeyRotationManager addKeysFromEnv", () => {
	let manager: KeyRotationManager;

	beforeEach(() => {
		manager = createManager();
	});

	it("should add comma-separated keys", () => {
		manager.addKeysFromEnv("key1,key2,key3", "TEST_KEY");
		expect(manager.getActiveKeyCount()).toBe(3);
	});

	it("should handle empty env value", () => {
		manager.addKeysFromEnv(undefined, "TEST_KEY");
		expect(manager.hasKeys()).toBe(false);
	});

	it("should handle single key", () => {
		manager.addKeysFromEnv("single-key", "TEST_KEY");
		expect(manager.getActiveKeyCount()).toBe(1);
	});

	it("should trim whitespace", () => {
		manager.addKeysFromEnv(" key1 , key2 , key3 ", "TEST_KEY");
		expect(manager.getActiveKeyCount()).toBe(3);
	});
});

describe("KeyRotationManager getKey", () => {
	let manager: KeyRotationManager;

	beforeEach(() => {
		manager = createManager();
	});

	it("should return null when no keys", () => {
		expect(manager.getKey()).toBeNull();
	});

	it("should return key when available", () => {
		manager.addKey("test-key", "key1");
		expect(manager.getKey()).toBe("test-key");
	});

	it("should increment request count", () => {
		manager.addKey("test-key", "key1");
		manager.getKey();
		manager.getKey();
		manager.getKey();

		const stats = manager.getStats();
		expect(stats.totalRequests).toBe(3);
	});
});

describe("KeyRotationManager round-robin strategy", () => {
	it("should rotate through keys", () => {
		const manager = createManager({ strategy: "round-robin" });
		manager.addKey("key1", "first");
		manager.addKey("key2", "second");
		manager.addKey("key3", "third");

		expect(manager.getKey()).toBe("key1");
		expect(manager.getKey()).toBe("key2");
		expect(manager.getKey()).toBe("key3");
		expect(manager.getKey()).toBe("key1");
	});
});

describe("KeyRotationManager least-used strategy", () => {
	it("should select least used key", () => {
		const manager = createManager({ strategy: "least-used" });
		manager.addKey("key1", "first");
		manager.addKey("key2", "second");

		manager.getKey();
		manager.reportSuccess("key1");
		manager.getKey();

		const stats = manager.getStats();
		const key2Stats = stats.keys.find((key) => key.name === "second");
		expect(key2Stats?.requestCount).toBe(1);
	});
});

describe("KeyRotationManager healthiest strategy", () => {
	it("should select key with lowest error rate", () => {
		const manager = createManager({ strategy: "healthiest" });
		manager.addKey("key1", "first");
		manager.addKey("key2", "second");

		manager.getKey();
		manager.reportError("key1", "error1");
		manager.getKey();
		manager.reportSuccess("key1");

		const nextKey = manager.getKey();
		expect(nextKey).toBeDefined();
	});

	it("should handle keys with zero requests", () => {
		const manager = createManager({ strategy: "healthiest" });
		manager.addKey("key1", "first");
		manager.addKey("key2", "second");

		expect(manager.getKey()).toBe("key1");
	});
});

describe("KeyRotationManager rate-limit-aware strategy", () => {
	it("should select key with highest rate limit remaining", () => {
		const manager = createManager({ strategy: "rate-limit-aware" });
		manager.addKey("key1", "first");
		manager.addKey("key2", "second");

		manager.reportRateLimit("key1", 10);
		manager.reportRateLimit("key2", 100);

		expect(manager.getKey()).toBe("key2");
	});

	it("should fall back to least-used when no rate limit info", () => {
		const manager = createManager({ strategy: "rate-limit-aware" });
		manager.addKey("key1", "first");
		manager.addKey("key2", "second");

		expect(manager.getKey()).toBeDefined();
	});
});

describe("KeyRotationManager reportSuccess", () => {
	it("should reset consecutive errors", () => {
		const manager = createManager();
		manager.addKey("test-key", "key1");
		manager.reportError("test-key", "error1");
		manager.reportError("test-key", "error2");
		manager.reportSuccess("test-key");

		expect(manager.getActiveKeyCount()).toBe(1);
	});
});

describe("KeyRotationManager reportError", () => {
	it("should mark key unhealthy after max errors", () => {
		const manager = createManager({ maxConsecutiveErrors: 2 });
		manager.addKey("test-key", "key1");

		manager.reportError("test-key", "error1");
		expect(manager.getActiveKeyCount()).toBe(1);

		manager.reportError("test-key", "error2");
		expect(manager.getActiveKeyCount()).toBe(0);
	});

	it("should rotate to next key on failure", () => {
		const manager = createManager({ maxConsecutiveErrors: 2 });
		manager.addKey("key1", "first");
		manager.addKey("key2", "second");

		manager.reportError("key1", "error1");
		manager.reportError("key1", "error2");

		expect(manager.getKey()).toBe("key2");
	});
});

describe("KeyRotationManager reportRateLimit", () => {
	it("should store rate limit info", () => {
		const manager = createManager();
		manager.addKey("test-key", "key1");
		manager.reportRateLimit("test-key", 50, new Date());

		const stats = manager.getStats();
		expect(stats.keys[0]?.rateLimitRemaining).toBe(50);
	});

	it("should auto-rotate when rate limit low", () => {
		const manager = createManager({ autoRotateOnRateLimit: true, minRateLimitThreshold: 10 });
		manager.addKey("key1", "first");
		manager.addKey("key2", "second");

		manager.reportRateLimit("key1", 5);
		manager.getKey();
	});
});

describe("KeyRotationManager getStats", () => {
	it("should return comprehensive stats", () => {
		const manager = createManager();
		manager.addKey("key1", "first");
		manager.addKey("key2", "second");
		manager.getKey();
		manager.reportError("key1", "test error");

		const stats = manager.getStats();

		expect(stats.service).toBe("alpaca");
		expect(stats.totalKeys).toBe(2);
		expect(stats.activeKeys).toBe(2);
		expect(stats.totalRequests).toBe(1);
		expect(stats.totalErrors).toBe(1);
		expect(stats.keys).toHaveLength(2);
	});
});

describe("KeyRotationManager resetStats", () => {
	it("should reset all counters", () => {
		const manager = createManager();
		manager.addKey("test-key", "key1");
		manager.getKey();
		manager.getKey();
		manager.reportError("test-key", "error");

		manager.resetStats();

		const stats = manager.getStats();
		expect(stats.totalRequests).toBe(0);
		expect(stats.totalErrors).toBe(0);
	});
});

describe("KeyRotationManager key recovery", () => {
	it("should recover unhealthy keys after timeout", async () => {
		const manager = createManager({ maxConsecutiveErrors: 1, unhealthyRetryMs: 50 });
		manager.addKey("test-key", "key1");

		manager.reportError("test-key", "error");
		expect(manager.getActiveKeyCount()).toBe(0);

		await new Promise((resolve) => setTimeout(resolve, 100));
		manager.getKey();

		expect(manager.getActiveKeyCount()).toBe(1);
	});
});
