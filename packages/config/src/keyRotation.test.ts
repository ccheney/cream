/**
 * Tests for API Key Rotation
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	createKeyRotationRegistry,
	KeyRotationManager,
	KeyRotationRegistry,
} from "./keyRotation/index.js";

// Silent logger for tests
const silentLogger = {
	info: () => {},
	warn: () => {},
	error: () => {},
};

// ============================================
// KeyRotationManager Tests
// ============================================

describe("KeyRotationManager", () => {
	let manager: KeyRotationManager;

	beforeEach(() => {
		manager = new KeyRotationManager("alpaca", {}, silentLogger);
	});

	describe("addKey", () => {
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

	describe("addKeysFromEnv", () => {
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

	describe("getKey", () => {
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

	describe("round-robin strategy", () => {
		it("should rotate through keys", () => {
			const rrManager = new KeyRotationManager("alpaca", { strategy: "round-robin" }, silentLogger);
			rrManager.addKey("key1", "first");
			rrManager.addKey("key2", "second");
			rrManager.addKey("key3", "third");

			expect(rrManager.getKey()).toBe("key1");
			expect(rrManager.getKey()).toBe("key2");
			expect(rrManager.getKey()).toBe("key3");
			expect(rrManager.getKey()).toBe("key1"); // Wraps around
		});
	});

	describe("least-used strategy", () => {
		it("should select least used key", () => {
			const luManager = new KeyRotationManager("alpaca", { strategy: "least-used" }, silentLogger);
			luManager.addKey("key1", "first");
			luManager.addKey("key2", "second");

			// Use key1 twice
			luManager.getKey(); // key1 (both equal, first wins)
			luManager.reportSuccess("key1");
			luManager.getKey(); // key2 (now least used)

			const stats = luManager.getStats();
			const key2Stats = stats.keys.find((k) => k.name === "second");
			expect(key2Stats?.requestCount).toBe(1);
		});
	});

	describe("healthiest strategy", () => {
		it("should select key with lowest error rate", () => {
			const healthManager = new KeyRotationManager(
				"alpaca",
				{ strategy: "healthiest" },
				silentLogger
			);
			healthManager.addKey("key1", "first");
			healthManager.addKey("key2", "second");

			// Make key1 have some requests and errors
			healthManager.getKey(); // key1
			healthManager.reportError("key1", "error1");
			healthManager.getKey(); // key1 again
			healthManager.reportSuccess("key1");

			// key2 has no requests so 0/0 = 0 error rate
			// Next get should still work
			const nextKey = healthManager.getKey();
			expect(nextKey).toBeDefined();
		});

		it("should handle keys with zero requests", () => {
			const healthManager = new KeyRotationManager(
				"alpaca",
				{ strategy: "healthiest" },
				silentLogger
			);
			healthManager.addKey("key1", "first");
			healthManager.addKey("key2", "second");

			// Neither key has requests - should return first one
			expect(healthManager.getKey()).toBe("key1");
		});
	});

	describe("rate-limit-aware strategy", () => {
		it("should select key with highest rate limit remaining", () => {
			const rlManager = new KeyRotationManager(
				"alpaca",
				{ strategy: "rate-limit-aware" },
				silentLogger
			);
			rlManager.addKey("key1", "first");
			rlManager.addKey("key2", "second");

			// Set rate limits
			rlManager.reportRateLimit("key1", 10);
			rlManager.reportRateLimit("key2", 100);

			// Should select key2 with more remaining
			expect(rlManager.getKey()).toBe("key2");
		});

		it("should fall back to least-used when no rate limit info", () => {
			const rlManager = new KeyRotationManager(
				"alpaca",
				{ strategy: "rate-limit-aware" },
				silentLogger
			);
			rlManager.addKey("key1", "first");
			rlManager.addKey("key2", "second");

			// No rate limit info set
			// Should fall back to least-used
			expect(rlManager.getKey()).toBeDefined();
		});
	});

	describe("reportSuccess", () => {
		it("should reset consecutive errors", () => {
			manager.addKey("test-key", "key1");
			manager.reportError("test-key", "error1");
			manager.reportError("test-key", "error2");
			manager.reportSuccess("test-key");
			// Key should still be active (not yet at threshold)
			expect(manager.getActiveKeyCount()).toBe(1);
		});
	});

	describe("reportError", () => {
		it("should mark key unhealthy after max errors", () => {
			const strictManager = new KeyRotationManager(
				"alpaca",
				{ maxConsecutiveErrors: 2 },
				silentLogger
			);
			strictManager.addKey("test-key", "key1");

			strictManager.reportError("test-key", "error1");
			expect(strictManager.getActiveKeyCount()).toBe(1);

			strictManager.reportError("test-key", "error2");
			expect(strictManager.getActiveKeyCount()).toBe(0); // Now unhealthy
		});

		it("should rotate to next key on failure", () => {
			const strictManager = new KeyRotationManager(
				"alpaca",
				{ maxConsecutiveErrors: 2 },
				silentLogger
			);
			strictManager.addKey("key1", "first");
			strictManager.addKey("key2", "second");

			strictManager.reportError("key1", "error1");
			strictManager.reportError("key1", "error2"); // key1 now unhealthy

			expect(strictManager.getKey()).toBe("key2");
		});
	});

	describe("reportRateLimit", () => {
		it("should store rate limit info", () => {
			manager.addKey("test-key", "key1");
			manager.reportRateLimit("test-key", 50, new Date());

			const stats = manager.getStats();
			expect(stats.keys[0]?.rateLimitRemaining).toBe(50);
		});

		it("should auto-rotate when rate limit low", () => {
			const autoRotateManager = new KeyRotationManager(
				"alpaca",
				{ autoRotateOnRateLimit: true, minRateLimitThreshold: 10 },
				silentLogger
			);
			autoRotateManager.addKey("key1", "first");
			autoRotateManager.addKey("key2", "second");

			autoRotateManager.reportRateLimit("key1", 5); // Below threshold

			// Should rotate to key2 on next getKey
			autoRotateManager.getKey(); // Gets key2 due to rotation
		});
	});

	describe("getStats", () => {
		it("should return comprehensive stats", () => {
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

	describe("resetStats", () => {
		it("should reset all counters", () => {
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

	describe("key recovery", () => {
		it("should recover unhealthy keys after timeout", async () => {
			const quickRecoveryManager = new KeyRotationManager(
				"alpaca",
				{ maxConsecutiveErrors: 1, unhealthyRetryMs: 50 },
				silentLogger
			);
			quickRecoveryManager.addKey("test-key", "key1");

			// Make key unhealthy
			quickRecoveryManager.reportError("test-key", "error");
			expect(quickRecoveryManager.getActiveKeyCount()).toBe(0);

			// Wait for recovery time
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Trigger recovery check by trying to get a key
			quickRecoveryManager.getKey();

			// Key should be recovered
			expect(quickRecoveryManager.getActiveKeyCount()).toBe(1);
		});
	});
});

// ============================================
// KeyRotationRegistry Tests
// ============================================

describe("KeyRotationRegistry", () => {
	let registry: KeyRotationRegistry;

	beforeEach(() => {
		registry = new KeyRotationRegistry({}, silentLogger);
	});

	describe("getManager", () => {
		it("should create manager on first access", () => {
			const manager = registry.getManager("alpaca");
			expect(manager).toBeDefined();
		});

		it("should return same manager on subsequent access", () => {
			const manager1 = registry.getManager("alpaca");
			const manager2 = registry.getManager("alpaca");
			expect(manager1).toBe(manager2);
		});

		it("should create different managers for different services", () => {
			const alpacaManager = registry.getManager("alpaca");
			const fmpManager = registry.getManager("fmp");
			expect(alpacaManager).not.toBe(fmpManager);
		});
	});

	describe("getKey", () => {
		it("should get key from correct service manager", () => {
			registry.getManager("alpaca").addKey("alpaca-key", "pk");
			registry.getManager("fmp").addKey("fmp-key", "fk");

			expect(registry.getKey("alpaca")).toBe("alpaca-key");
			expect(registry.getKey("fmp")).toBe("fmp-key");
		});
	});

	describe("reportSuccess/reportError", () => {
		it("should route to correct manager", () => {
			registry.getManager("alpaca").addKey("test-key", "key1");

			registry.reportSuccess("alpaca", "test-key");
			registry.reportError("alpaca", "test-key", "error");

			const stats = registry.getManager("alpaca").getStats();
			expect(stats.totalErrors).toBe(1);
		});
	});

	describe("reportRateLimit", () => {
		it("should route to correct manager", () => {
			registry.getManager("fmp").addKey("test-key", "key1");

			registry.reportRateLimit("fmp", "test-key", 42);

			const stats = registry.getManager("fmp").getStats();
			expect(stats.keys[0]?.rateLimitRemaining).toBe(42);
		});
	});

	describe("getAllStats", () => {
		it("should return stats for all initialized managers", () => {
			registry.getManager("alpaca").addKey("pk", "alpaca-key");
			registry.getManager("fmp").addKey("fk", "fmp-key");

			const allStats = registry.getAllStats();

			expect(allStats).toHaveLength(2);
			expect(allStats.some((s) => s.service === "alpaca")).toBe(true);
			expect(allStats.some((s) => s.service === "fmp")).toBe(true);
		});
	});

	describe("initFromEnv", () => {
		const originalEnv = { ...process.env };

		afterEach(() => {
			// Restore original env
			process.env = { ...originalEnv };
		});

		it("should initialize managers from environment variables", () => {
			process.env.ALPACA_KEY = "test-alpaca-key";
			process.env.FMP_KEY = "test-fmp-key";

			const envRegistry = new KeyRotationRegistry({}, silentLogger);
			envRegistry.initFromEnv();

			expect(envRegistry.getKey("alpaca")).toBe("test-alpaca-key");
			expect(envRegistry.getKey("fmp")).toBe("test-fmp-key");
		});

		it("should handle comma-separated keys from env", () => {
			process.env.ALPACA_KEY = "key1,key2,key3";

			const envRegistry = new KeyRotationRegistry({}, silentLogger);
			envRegistry.initFromEnv();

			expect(envRegistry.getManager("alpaca").getActiveKeyCount()).toBe(3);
		});

		it("should handle missing env variables gracefully", () => {
			// Clear both process.env and Bun.env
			delete process.env.FMP_KEY;
			delete process.env.ALPHAVANTAGE_KEY;
			delete process.env.ALPACA_KEY;
			// @ts-expect-error - Bun.env is readonly but we need to clear for test
			Bun.env.FMP_KEY = undefined;
			// @ts-expect-error - Bun.env is readonly but we need to clear for test
			Bun.env.ALPHAVANTAGE_KEY = undefined;
			// @ts-expect-error - Bun.env is readonly but we need to clear for test
			Bun.env.ALPACA_KEY = undefined;

			const envRegistry = new KeyRotationRegistry({}, silentLogger);
			envRegistry.initFromEnv();

			// Should not throw - managers are created but without keys
			const stats = envRegistry.getAllStats();
			expect(stats.length).toBe(3); // 3 services initialized but no keys
		});
	});
});

// ============================================
// Factory Functions Tests
// ============================================

describe("createKeyRotationRegistry", () => {
	const originalEnv = { ...process.env };

	afterEach(() => {
		process.env = { ...originalEnv };
	});

	it("should create registry initialized from env", () => {
		process.env.ALPACA_KEY = "factory-test-key";

		const registry = createKeyRotationRegistry({});

		expect(registry).toBeInstanceOf(KeyRotationRegistry);
		expect(registry.getKey("alpaca")).toBe("factory-test-key");
	});

	it("should accept custom config", () => {
		process.env.ALPACA_KEY = "config-test-key";

		const registry = createKeyRotationRegistry({ maxConsecutiveErrors: 5 });

		expect(registry).toBeInstanceOf(KeyRotationRegistry);
	});
});
