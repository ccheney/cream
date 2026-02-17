/**
 * Tests for Secrets Management Providers and Factories
 */

import { beforeEach, describe, expect, it } from "bun:test";
import {
	createEnvSecretsManager,
	createSecretsManager,
	EnvSecretsProvider,
	MemorySecretsProvider,
} from "./secrets";

// Silent logger for tests
const silentLogger = {
	info: () => {},
	warn: () => {},
	error: () => {},
};

// ============================================
// EnvSecretsProvider Tests
// ============================================

describe("EnvSecretsProvider core behavior", () => {
	it("should have correct name", () => {
		const provider = new EnvSecretsProvider();
		expect(provider.name).toBe("env");
	});

	it("should get value from environment", async () => {
		Bun.env.TEST_SECRET_KEY = "test-value";
		const provider = new EnvSecretsProvider();

		const value = await provider.get("TEST_SECRET_KEY");
		expect(value).toBe("test-value");

		delete Bun.env.TEST_SECRET_KEY;
	});

	it("should return null for missing key", async () => {
		const provider = new EnvSecretsProvider();
		const value = await provider.get("NONEXISTENT_KEY_12345");
		expect(value).toBeNull();
	});

	it("should always pass health check", async () => {
		const provider = new EnvSecretsProvider();
		expect(await provider.healthCheck()).toBe(true);
	});
});

describe("EnvSecretsProvider prefix behavior", () => {
	it("should check if key exists", async () => {
		Bun.env.TEST_HAS_KEY = "value";
		const provider = new EnvSecretsProvider();

		expect(await provider.has("TEST_HAS_KEY")).toBe(true);
		expect(await provider.has("NONEXISTENT_KEY_12345")).toBe(false);

		delete Bun.env.TEST_HAS_KEY;
	});

	it("should list keys with prefix", async () => {
		Bun.env.CREAM_TEST_A = "a";
		Bun.env.CREAM_TEST_B = "b";
		const provider = new EnvSecretsProvider("CREAM_TEST_");

		const keys = await provider.list();
		expect(keys).toContain("A");
		expect(keys).toContain("B");

		delete Bun.env.CREAM_TEST_A;
		delete Bun.env.CREAM_TEST_B;
	});

	it("should use prefix for get", async () => {
		Bun.env.PREFIX_SECRET = "prefixed-value";
		const provider = new EnvSecretsProvider("PREFIX_");

		const value = await provider.get("SECRET");
		expect(value).toBe("prefixed-value");

		delete Bun.env.PREFIX_SECRET;
	});
});

// ============================================
// MemorySecretsProvider Tests
// ============================================

describe("MemorySecretsProvider basic operations", () => {
	let provider: MemorySecretsProvider;

	beforeEach(() => {
		provider = new MemorySecretsProvider();
	});

	it("should have correct name", () => {
		expect(provider.name).toBe("memory");
	});

	it("should initialize with secrets", async () => {
		const p = new MemorySecretsProvider({ KEY1: "value1", KEY2: "value2" });
		expect(await p.get("KEY1")).toBe("value1");
		expect(await p.get("KEY2")).toBe("value2");
	});

	it("should set and get secrets", async () => {
		provider.set("MY_KEY", "my-value");
		expect(await provider.get("MY_KEY")).toBe("my-value");
	});

	it("should return null for missing key", async () => {
		expect(await provider.get("MISSING")).toBeNull();
	});

	it("should check if key exists", async () => {
		provider.set("EXISTS", "yes");
		expect(await provider.has("EXISTS")).toBe(true);
		expect(await provider.has("MISSING")).toBe(false);
	});
});

describe("MemorySecretsProvider collection operations", () => {
	let provider: MemorySecretsProvider;

	beforeEach(() => {
		provider = new MemorySecretsProvider();
	});

	it("should list all keys", async () => {
		provider.set("A", "1");
		provider.set("B", "2");
		provider.set("C", "3");

		const keys = await provider.list();
		expect(keys.toSorted()).toEqual(["A", "B", "C"]);
	});

	it("should delete secrets", async () => {
		provider.set("TO_DELETE", "value");
		expect(await provider.has("TO_DELETE")).toBe(true);

		provider.delete("TO_DELETE");
		expect(await provider.has("TO_DELETE")).toBe(false);
	});

	it("should clear all secrets", async () => {
		provider.set("A", "1");
		provider.set("B", "2");
		provider.clear();

		expect(await provider.list()).toEqual([]);
	});

	it("should always pass health check", async () => {
		expect(await provider.healthCheck()).toBe(true);
	});
});

// ============================================
// Factory Functions Tests
// ============================================

describe("Factory Functions", () => {
	describe("createEnvSecretsManager", () => {
		it("should create manager with env provider", async () => {
			Bun.env.FACTORY_TEST_KEY = "factory-value";
			const manager = createEnvSecretsManager({ logger: silentLogger });

			const value = await manager.get("FACTORY_TEST_KEY");
			expect(value).toBe("factory-value");

			delete Bun.env.FACTORY_TEST_KEY;
		});
	});

	describe("createSecretsManager", () => {
		it("should create env provider", () => {
			const manager = createSecretsManager("env", {
				envPrefix: "TEST_",
				config: { logger: silentLogger },
			});
			expect(manager).toBeDefined();
		});

		it("should create memory provider", async () => {
			const manager = createSecretsManager("memory", {
				initialSecrets: { KEY: "value" },
				config: { logger: silentLogger },
			});

			const value = await manager.get("KEY");
			expect(value).toBe("value");
		});

		it("should create encrypted-file provider", () => {
			const manager = createSecretsManager("encrypted-file", {
				filePath: "/tmp/secrets.enc",
				password: "secret-password",
				config: { logger: silentLogger },
			});
			expect(manager).toBeDefined();
		});

		it("should throw for encrypted-file without filePath", () => {
			expect(() =>
				createSecretsManager("encrypted-file", {
					password: "password",
				}),
			).toThrow("requires filePath and password");
		});

		it("should throw for encrypted-file without password", () => {
			expect(() =>
				createSecretsManager("encrypted-file", {
					filePath: "/tmp/secrets.enc",
				}),
			).toThrow("requires filePath and password");
		});

		it("should throw for unknown provider type", () => {
			expect(() =>
				// @ts-expect-error Testing invalid input
				createSecretsManager("unknown", {}),
			).toThrow("Unknown provider type");
		});
	});
});
