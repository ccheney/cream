/**
 * Tests for Secrets Management
 */

import { beforeEach, describe, expect, it } from "bun:test";
import {
  EncryptedFileSecretsProvider,
  EnvSecretsProvider,
  MemorySecretsProvider,
  SecretsManager,
  createEnvSecretsManager,
  createSecretsManager,
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

describe("EnvSecretsProvider", () => {
  it("should have correct name", () => {
    const provider = new EnvSecretsProvider();
    expect(provider.name).toBe("env");
  });

  it("should get value from environment", async () => {
    process.env.TEST_SECRET_KEY = "test-value";
    const provider = new EnvSecretsProvider();

    const value = await provider.get("TEST_SECRET_KEY");
    expect(value).toBe("test-value");

    delete process.env.TEST_SECRET_KEY;
  });

  it("should return null for missing key", async () => {
    const provider = new EnvSecretsProvider();
    const value = await provider.get("NONEXISTENT_KEY_12345");
    expect(value).toBeNull();
  });

  it("should check if key exists", async () => {
    process.env.TEST_HAS_KEY = "value";
    const provider = new EnvSecretsProvider();

    expect(await provider.has("TEST_HAS_KEY")).toBe(true);
    expect(await provider.has("NONEXISTENT_KEY_12345")).toBe(false);

    delete process.env.TEST_HAS_KEY;
  });

  it("should list keys with prefix", async () => {
    process.env.CREAM_TEST_A = "a";
    process.env.CREAM_TEST_B = "b";
    const provider = new EnvSecretsProvider("CREAM_TEST_");

    const keys = await provider.list();
    expect(keys).toContain("A");
    expect(keys).toContain("B");

    delete process.env.CREAM_TEST_A;
    delete process.env.CREAM_TEST_B;
  });

  it("should use prefix for get", async () => {
    process.env.PREFIX_SECRET = "prefixed-value";
    const provider = new EnvSecretsProvider("PREFIX_");

    const value = await provider.get("SECRET");
    expect(value).toBe("prefixed-value");

    delete process.env.PREFIX_SECRET;
  });

  it("should always pass health check", async () => {
    const provider = new EnvSecretsProvider();
    expect(await provider.healthCheck()).toBe(true);
  });
});

// ============================================
// MemorySecretsProvider Tests
// ============================================

describe("MemorySecretsProvider", () => {
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

  it("should list all keys", async () => {
    provider.set("A", "1");
    provider.set("B", "2");
    provider.set("C", "3");

    const keys = await provider.list();
    expect(keys.sort()).toEqual(["A", "B", "C"]);
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
// EncryptedFileSecretsProvider Tests
// ============================================

describe("EncryptedFileSecretsProvider", () => {
  it("should have correct name", () => {
    const provider = new EncryptedFileSecretsProvider("/tmp/secrets.enc", "password");
    expect(provider.name).toBe("encrypted-file");
  });

  it("should encrypt and decrypt secrets", () => {
    const secrets = {
      API_KEY: "secret-api-key",
      DB_PASSWORD: "super-secret-password",
    };
    const password = "test-encryption-password";

    // Encrypt
    const encrypted = EncryptedFileSecretsProvider.encrypt(secrets, password);
    expect(encrypted).toBeDefined();
    expect(typeof encrypted).toBe("string");

    // Should be base64
    expect(() => Buffer.from(encrypted, "base64")).not.toThrow();
  });

  it("should fail health check for missing file", async () => {
    const provider = new EncryptedFileSecretsProvider(
      "/nonexistent/path/secrets.enc",
      "password"
    );
    expect(await provider.healthCheck()).toBe(false);
  });
});

// ============================================
// SecretsManager Tests
// ============================================

describe("SecretsManager", () => {
  let memoryProvider: MemorySecretsProvider;
  let manager: SecretsManager;

  beforeEach(() => {
    memoryProvider = new MemorySecretsProvider({
      API_KEY: "primary-api-key",
      DB_PASSWORD: "db-secret",
    });
    manager = new SecretsManager({
      provider: memoryProvider,
      cacheTtlMs: 60000,
      auditEnabled: false,
      logger: silentLogger,
    });
  });

  describe("get", () => {
    it("should get secret from provider", async () => {
      const value = await manager.get("API_KEY");
      expect(value).toBe("primary-api-key");
    });

    it("should return null for missing secret", async () => {
      const value = await manager.get("MISSING_KEY");
      expect(value).toBeNull();
    });

    it("should cache secrets", async () => {
      // First call
      await manager.get("API_KEY");

      // Modify provider directly
      memoryProvider.set("API_KEY", "modified-value");

      // Should return cached value
      const cached = await manager.get("API_KEY");
      expect(cached).toBe("primary-api-key");
    });
  });

  describe("getOrThrow", () => {
    it("should return value if exists", async () => {
      const value = await manager.getOrThrow("API_KEY");
      expect(value).toBe("primary-api-key");
    });

    it("should throw if missing", async () => {
      expect(manager.getOrThrow("MISSING")).rejects.toThrow("Secret not found");
    });
  });

  describe("getMany", () => {
    it("should get multiple secrets", async () => {
      const secrets = await manager.getMany(["API_KEY", "DB_PASSWORD", "MISSING"]);

      expect(secrets.API_KEY).toBe("primary-api-key");
      expect(secrets.DB_PASSWORD).toBe("db-secret");
      expect(secrets.MISSING).toBeNull();
    });
  });

  describe("has", () => {
    it("should check if secret exists", async () => {
      expect(await manager.has("API_KEY")).toBe(true);
      expect(await manager.has("MISSING")).toBe(false);
    });
  });

  describe("refresh", () => {
    it("should refresh cached secret", async () => {
      // Cache the value
      await manager.get("API_KEY");

      // Modify provider
      memoryProvider.set("API_KEY", "new-value");

      // Refresh
      await manager.refresh("API_KEY");

      // Should get new value
      const value = await manager.get("API_KEY");
      expect(value).toBe("new-value");
    });
  });

  describe("clearCache", () => {
    it("should clear all cached secrets", async () => {
      // Cache some values
      await manager.get("API_KEY");
      await manager.get("DB_PASSWORD");

      expect(manager.getCacheStats().size).toBe(2);

      manager.clearCache();

      expect(manager.getCacheStats().size).toBe(0);
    });
  });

  describe("getCacheStats", () => {
    it("should return cache statistics", async () => {
      await manager.get("API_KEY");
      await manager.get("DB_PASSWORD");

      const stats = manager.getCacheStats();
      expect(stats.size).toBe(2);
      expect(stats.keys).toContain("API_KEY");
      expect(stats.keys).toContain("DB_PASSWORD");
    });
  });

  describe("healthCheck", () => {
    it("should check provider health", async () => {
      const health = await manager.healthCheck();
      expect(health.memory).toBe(true);
    });
  });

  describe("fallback providers", () => {
    it("should try fallback when primary fails", async () => {
      const fallback = new MemorySecretsProvider({
        FALLBACK_KEY: "fallback-value",
      });

      const managerWithFallback = new SecretsManager({
        provider: memoryProvider,
        fallbackProviders: [fallback],
        cacheTtlMs: 60000,
        auditEnabled: false,
        logger: silentLogger,
      });

      // Key only in fallback
      const value = await managerWithFallback.get("FALLBACK_KEY");
      expect(value).toBe("fallback-value");
    });

    it("should return null if all providers fail", async () => {
      const fallback = new MemorySecretsProvider({});

      const managerWithFallback = new SecretsManager({
        provider: memoryProvider,
        fallbackProviders: [fallback],
        cacheTtlMs: 60000,
        auditEnabled: false,
        logger: silentLogger,
      });

      const value = await managerWithFallback.get("NONEXISTENT");
      expect(value).toBeNull();
    });
  });

  describe("audit logging", () => {
    it("should call onAudit callback", async () => {
      const auditEvents: Array<{ action: string; key?: string }> = [];

      const auditManager = new SecretsManager({
        provider: memoryProvider,
        cacheTtlMs: 60000,
        auditEnabled: true,
        onAudit: (event) => auditEvents.push(event),
        logger: silentLogger,
      });

      await auditManager.get("API_KEY");

      expect(auditEvents.some((e) => e.action === "cache_miss")).toBe(true);
      expect(auditEvents.some((e) => e.action === "get")).toBe(true);
    });
  });

  describe("no cache mode", () => {
    it("should not cache when TTL is 0", async () => {
      const noCacheManager = new SecretsManager({
        provider: memoryProvider,
        cacheTtlMs: 0,
        auditEnabled: false,
        logger: silentLogger,
      });

      await noCacheManager.get("API_KEY");
      expect(noCacheManager.getCacheStats().size).toBe(0);
    });
  });
});

// ============================================
// Factory Functions Tests
// ============================================

describe("Factory Functions", () => {
  describe("createEnvSecretsManager", () => {
    it("should create manager with env provider", async () => {
      process.env.FACTORY_TEST_KEY = "factory-value";
      const manager = createEnvSecretsManager({ logger: silentLogger });

      const value = await manager.get("FACTORY_TEST_KEY");
      expect(value).toBe("factory-value");

      delete process.env.FACTORY_TEST_KEY;
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
        })
      ).toThrow("requires filePath and password");
    });

    it("should throw for encrypted-file without password", () => {
      expect(() =>
        createSecretsManager("encrypted-file", {
          filePath: "/tmp/secrets.enc",
        })
      ).toThrow("requires filePath and password");
    });

    it("should throw for unknown provider type", () => {
      expect(() =>
        // @ts-expect-error Testing invalid input
        createSecretsManager("unknown", {})
      ).toThrow("Unknown provider type");
    });
  });
});
