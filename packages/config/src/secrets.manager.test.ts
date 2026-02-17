import { describe, expect, it } from "bun:test";
import { MemorySecretsProvider, SecretsManager } from "./secrets";

const silentLogger = {
	info: () => {},
	warn: () => {},
	error: () => {},
};

const createManagerWithMemoryProvider = () => {
	const provider = new MemorySecretsProvider({
		API_KEY: "primary-api-key",
		DB_PASSWORD: "db-secret",
	});

	const manager = new SecretsManager({
		provider,
		cacheTtlMs: 60000,
		auditEnabled: false,
		logger: silentLogger,
	});

	return { provider, manager };
};

describe("SecretsManager get", () => {
	it("should get secret from provider", async () => {
		const { manager } = createManagerWithMemoryProvider();
		const value = await manager.get("API_KEY");
		expect(value).toBe("primary-api-key");
	});

	it("should return null for missing secret", async () => {
		const { manager } = createManagerWithMemoryProvider();
		const value = await manager.get("MISSING_KEY");
		expect(value).toBeNull();
	});

	it("should cache secrets", async () => {
		const { provider, manager } = createManagerWithMemoryProvider();
		await manager.get("API_KEY");

		provider.set("API_KEY", "modified-value");

		const cached = await manager.get("API_KEY");
		expect(cached).toBe("primary-api-key");
	});
});

describe("SecretsManager retrieval helpers", () => {
	it("should return value from getOrThrow if key exists", async () => {
		const { manager } = createManagerWithMemoryProvider();
		const value = await manager.getOrThrow("API_KEY");
		expect(value).toBe("primary-api-key");
	});

	it("should throw from getOrThrow if key is missing", async () => {
		const { manager } = createManagerWithMemoryProvider();
		expect(manager.getOrThrow("MISSING")).rejects.toThrow("Secret not found");
	});

	it("should get multiple secrets", async () => {
		const { manager } = createManagerWithMemoryProvider();
		const secrets = await manager.getMany(["API_KEY", "DB_PASSWORD", "MISSING"]);

		expect(secrets.API_KEY).toBe("primary-api-key");
		expect(secrets.DB_PASSWORD).toBe("db-secret");
		expect(secrets.MISSING).toBeNull();
	});

	it("should check if secret exists", async () => {
		const { manager } = createManagerWithMemoryProvider();
		expect(await manager.has("API_KEY")).toBe(true);
		expect(await manager.has("MISSING")).toBe(false);
	});
});

describe("SecretsManager cache controls", () => {
	it("should refresh cached secret", async () => {
		const { provider, manager } = createManagerWithMemoryProvider();
		await manager.get("API_KEY");

		provider.set("API_KEY", "new-value");
		await manager.refresh("API_KEY");

		const value = await manager.get("API_KEY");
		expect(value).toBe("new-value");
	});

	it("should clear all cached secrets", async () => {
		const { manager } = createManagerWithMemoryProvider();
		await manager.get("API_KEY");
		await manager.get("DB_PASSWORD");

		expect(manager.getCacheStats().size).toBe(2);
		manager.clearCache();
		expect(manager.getCacheStats().size).toBe(0);
	});

	it("should return cache statistics", async () => {
		const { manager } = createManagerWithMemoryProvider();
		await manager.get("API_KEY");
		await manager.get("DB_PASSWORD");

		const stats = manager.getCacheStats();
		expect(stats.size).toBe(2);
		expect(stats.keys).toContain("API_KEY");
		expect(stats.keys).toContain("DB_PASSWORD");
	});

	it("should not cache when TTL is 0", async () => {
		const { provider } = createManagerWithMemoryProvider();
		const noCacheManager = new SecretsManager({
			provider,
			cacheTtlMs: 0,
			auditEnabled: false,
			logger: silentLogger,
		});

		await noCacheManager.get("API_KEY");
		expect(noCacheManager.getCacheStats().size).toBe(0);
	});
});

describe("SecretsManager providers and health", () => {
	it("should check provider health", async () => {
		const { manager } = createManagerWithMemoryProvider();
		const health = await manager.healthCheck();
		expect(health.memory).toBe(true);
	});

	it("should try fallback when primary misses key", async () => {
		const { provider } = createManagerWithMemoryProvider();
		const fallback = new MemorySecretsProvider({
			FALLBACK_KEY: "fallback-value",
		});

		const managerWithFallback = new SecretsManager({
			provider,
			fallbackProviders: [fallback],
			cacheTtlMs: 60000,
			auditEnabled: false,
			logger: silentLogger,
		});

		const value = await managerWithFallback.get("FALLBACK_KEY");
		expect(value).toBe("fallback-value");
	});

	it("should return null if all providers miss key", async () => {
		const { provider } = createManagerWithMemoryProvider();
		const fallback = new MemorySecretsProvider({});

		const managerWithFallback = new SecretsManager({
			provider,
			fallbackProviders: [fallback],
			cacheTtlMs: 60000,
			auditEnabled: false,
			logger: silentLogger,
		});

		const value = await managerWithFallback.get("NONEXISTENT");
		expect(value).toBeNull();
	});
});

describe("SecretsManager audit logging", () => {
	it("should call onAudit callback", async () => {
		const { provider } = createManagerWithMemoryProvider();
		const auditEvents: Array<{ action: string; key?: string }> = [];

		const auditManager = new SecretsManager({
			provider,
			cacheTtlMs: 60000,
			auditEnabled: true,
			onAudit: (event) => auditEvents.push(event),
			logger: silentLogger,
		});

		await auditManager.get("API_KEY");
		expect(auditEvents.some((event) => event.action === "cache_miss")).toBe(true);
		expect(auditEvents.some((event) => event.action === "get")).toBe(true);
	});
});
