import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { EnvConfig } from "@cream/domain/env";
import {
  createAuditLog,
  sanitizeConfig,
  sanitizeEnv,
  validateLiveTradingSafety,
  validateStartupNoExit,
} from "./startup";

// Get directory of this test file
const __dirname = dirname(fileURLToPath(import.meta.url));
const configDir = join(__dirname, "..", "configs");

describe("sanitizeConfig", () => {
  it("redacts fields containing 'key'", () => {
    const config = {
      apiKey: "secret123",
      POLYGON_KEY: "abc123",
      name: "test",
    };
    const sanitized = sanitizeConfig(config) as Record<string, unknown>;
    expect(sanitized.apiKey).toBe("[REDACTED]");
    expect(sanitized.POLYGON_KEY).toBe("[REDACTED]");
    expect(sanitized.name).toBe("test");
  });

  it("redacts fields containing 'secret'", () => {
    const config = {
      clientSecret: "hidden",
      ALPACA_SECRET: "verysecret",
    };
    const sanitized = sanitizeConfig(config) as Record<string, unknown>;
    expect(sanitized.clientSecret).toBe("[REDACTED]");
    expect(sanitized.ALPACA_SECRET).toBe("[REDACTED]");
  });

  it("redacts fields containing 'token'", () => {
    const config = {
      authToken: "bearer123",
      TURSO_AUTH_TOKEN: "sqltoken",
    };
    const sanitized = sanitizeConfig(config) as Record<string, unknown>;
    expect(sanitized.authToken).toBe("[REDACTED]");
    expect(sanitized.TURSO_AUTH_TOKEN).toBe("[REDACTED]");
  });

  it("redacts fields containing 'password'", () => {
    const config = {
      password: "hunter2",
      dbPassword: "secret",
    };
    const sanitized = sanitizeConfig(config) as Record<string, unknown>;
    expect(sanitized.password).toBe("[REDACTED]");
    expect(sanitized.dbPassword).toBe("[REDACTED]");
  });

  it("marks missing sensitive values as [NOT SET]", () => {
    const config = {
      apiKey: undefined,
      secret: null,
      token: "",
    };
    const sanitized = sanitizeConfig(config) as Record<string, unknown>;
    expect(sanitized.apiKey).toBe("[NOT SET]");
    // null is falsy so will show [NOT SET]
    expect(sanitized.secret).toBe("[NOT SET]");
    expect(sanitized.token).toBe("[NOT SET]");
  });

  it("preserves non-sensitive values", () => {
    const config = {
      environment: "PAPER",
      broker: "ALPACA",
      port: 8080,
      enabled: true,
    };
    const sanitized = sanitizeConfig(config) as Record<string, unknown>;
    expect(sanitized.environment).toBe("PAPER");
    expect(sanitized.broker).toBe("ALPACA");
    expect(sanitized.port).toBe(8080);
    expect(sanitized.enabled).toBe(true);
  });

  it("recursively sanitizes nested objects", () => {
    const config = {
      api: {
        key: "secret",
        url: "https://example.com",
      },
      database: {
        connection: {
          password: "dbpass",
          host: "localhost",
        },
      },
    };
    const sanitized = sanitizeConfig(config) as Record<string, unknown>;
    const api = sanitized.api as Record<string, unknown>;
    const database = sanitized.database as Record<string, unknown>;
    const connection = database.connection as Record<string, unknown>;

    expect(api.key).toBe("[REDACTED]");
    expect(api.url).toBe("https://example.com");
    expect(connection.password).toBe("[REDACTED]");
    expect(connection.host).toBe("localhost");
  });

  it("sanitizes arrays", () => {
    const config = {
      items: [
        { apiKey: "key1", name: "first" },
        { apiKey: "key2", name: "second" },
      ],
    };
    const sanitized = sanitizeConfig(config) as Record<string, unknown>;
    const items = sanitized.items as Array<Record<string, unknown>>;

    expect(items[0].apiKey).toBe("[REDACTED]");
    expect(items[0].name).toBe("first");
    expect(items[1].apiKey).toBe("[REDACTED]");
    expect(items[1].name).toBe("second");
  });

  it("handles null and undefined", () => {
    expect(sanitizeConfig(null)).toBeNull();
    expect(sanitizeConfig(undefined)).toBeUndefined();
  });

  it("handles primitive types", () => {
    expect(sanitizeConfig("string")).toBe("string");
    expect(sanitizeConfig(123)).toBe(123);
    expect(sanitizeConfig(true)).toBe(true);
  });

  it("prevents infinite recursion with depth limit", () => {
    // Create deeply nested object
    let obj: Record<string, unknown> = { value: "leaf" };
    for (let i = 0; i < 20; i++) {
      obj = { nested: obj };
    }
    // Should not throw and should redact deeply nested content
    const result = sanitizeConfig(obj);
    expect(result).toBeDefined();
  });
});

describe("sanitizeEnv", () => {
  it("redacts all sensitive environment variables", () => {
    const mockEnv: EnvConfig = {
      CREAM_ENV: "PAPER",
      CREAM_BROKER: "ALPACA",
      TURSO_DATABASE_URL: "http://localhost:8080",
      HELIX_URL: "http://localhost:6969",
      POLYGON_KEY: "abc123",
      DATABENTO_KEY: "xyz789",
      FMP_KEY: "fmp123",
      ALPACA_KEY: "alpaca123",
      ALPACA_SECRET: "alpacasecret",
      GOOGLE_API_KEY: "google123",
    };

    const sanitized = sanitizeEnv(mockEnv);

    // Non-sensitive fields preserved
    expect(sanitized.CREAM_ENV).toBe("PAPER");
    expect(sanitized.CREAM_BROKER).toBe("ALPACA");
    expect(sanitized.TURSO_DATABASE_URL).toBe("http://localhost:8080");
    expect(sanitized.HELIX_URL).toBe("http://localhost:6969");

    // Sensitive fields redacted
    expect(sanitized.POLYGON_KEY).toBe("[REDACTED]");
    expect(sanitized.DATABENTO_KEY).toBe("[REDACTED]");
    expect(sanitized.FMP_KEY).toBe("[REDACTED]");
    expect(sanitized.ALPACA_KEY).toBe("[REDACTED]");
    expect(sanitized.ALPACA_SECRET).toBe("[REDACTED]");
    expect(sanitized.GOOGLE_API_KEY).toBe("[REDACTED]");
  });

  it("marks missing sensitive values as [NOT SET]", () => {
    const mockEnv: EnvConfig = {
      CREAM_ENV: "BACKTEST",
      CREAM_BROKER: "ALPACA",
      TURSO_DATABASE_URL: "file:local.db",
      HELIX_URL: "http://localhost:6969",
      // All API keys undefined
    };

    const sanitized = sanitizeEnv(mockEnv);
    expect(sanitized.POLYGON_KEY).toBe("[NOT SET]");
    expect(sanitized.ALPACA_KEY).toBe("[NOT SET]");
  });
});

describe("validateLiveTradingSafety", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Clear LIVE_TRADING_APPROVED
    delete process.env.LIVE_TRADING_APPROVED;
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
  });

  it("fails without LIVE_TRADING_APPROVED", () => {
    const result = validateLiveTradingSafety();
    expect(result.approved).toBe(false);
    expect(result.errors).toContain(
      "LIVE trading requires LIVE_TRADING_APPROVED=true environment variable"
    );
  });

  it("passes with LIVE_TRADING_APPROVED=true", () => {
    process.env.LIVE_TRADING_APPROVED = "true";
    const result = validateLiveTradingSafety();
    // Note: Other checks may still fail depending on env configuration
    expect(
      result.errors.includes(
        "LIVE trading requires LIVE_TRADING_APPROVED=true environment variable"
      )
    ).toBe(false);
  });

  it("fails if LIVE_TRADING_APPROVED is not exactly 'true'", () => {
    process.env.LIVE_TRADING_APPROVED = "yes";
    const result = validateLiveTradingSafety();
    expect(result.approved).toBe(false);
    expect(result.errors).toContain(
      "LIVE trading requires LIVE_TRADING_APPROVED=true environment variable"
    );
  });
});

describe("createAuditLog", () => {
  it("creates audit log with timestamp and service name", () => {
    const mockResult = {
      success: true,
      env: {
        CREAM_ENV: "PAPER" as const,
        CREAM_BROKER: "ALPACA" as const,
        TURSO_DATABASE_URL: "file:local.db",
        HELIX_URL: "http://localhost:6969",
        POLYGON_KEY: "abc123",
      } as EnvConfig,
      errors: [],
      warnings: ["some warning"],
    };

    const audit = createAuditLog("test-service", mockResult);

    expect(audit.service).toBe("test-service");
    expect(audit.environment).toBe("PAPER");
    expect(audit.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(audit.errors).toEqual([]);
    expect(audit.warnings).toEqual(["some warning"]);
    // Env should be sanitized
    expect(audit.env.POLYGON_KEY).toBe("[REDACTED]");
    expect(audit.env.CREAM_ENV).toBe("PAPER");
  });

  it("includes sanitized config when present", () => {
    const mockResult = {
      success: true,
      env: {
        CREAM_ENV: "BACKTEST" as const,
        CREAM_BROKER: "ALPACA" as const,
        TURSO_DATABASE_URL: "file:local.db",
        HELIX_URL: "http://localhost:6969",
      } as EnvConfig,
      config: {
        core: {
          environment: "BACKTEST" as const,
          llm: {
            model_id: "gemini-3-pro-preview",
          },
        },
      },
      errors: [],
      warnings: [],
    };

    const audit = createAuditLog("test-service", mockResult);
    expect(audit.config).toBeDefined();
  });

  it("omits config when not present", () => {
    const mockResult = {
      success: false,
      env: {
        CREAM_ENV: "BACKTEST" as const,
        CREAM_BROKER: "ALPACA" as const,
        TURSO_DATABASE_URL: "file:local.db",
        HELIX_URL: "http://localhost:6969",
      } as EnvConfig,
      errors: ["config load failed"],
      warnings: [],
    };

    const audit = createAuditLog("test-service", mockResult);
    expect(audit.config).toBeUndefined();
  });
});

describe("validateStartupNoExit", () => {
  // configDir is now defined at module level using __dirname

  it("detects environment mismatch between env and config", async () => {
    // CREAM_ENV is BACKTEST but default.yaml has PAPER
    const result = await validateStartupNoExit("test-service", configDir);

    // Should fail due to environment mismatch
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes("Environment mismatch"))).toBe(true);
  });

  it("includes audit log in result even on failure", async () => {
    const result = await validateStartupNoExit("api-server", configDir);

    expect(result.audit.service).toBe("api-server");
    expect(result.audit.timestamp).toBeDefined();
    expect(result.audit.environment).toBe(result.env.CREAM_ENV);
  });

  it("handles config loading errors", async () => {
    // Try to load from a directory without config files
    const result = await validateStartupNoExit("test-service", "/nonexistent/config/dir");

    // Should fail due to config loading error
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// Note: Tests for validateLiveTradingSafety checks on ALPACA_BASE_URL and
// TURSO_DATABASE_URL are not included because the `env` object from @cream/domain/env
// is parsed at module import time and cannot be modified in tests.
// Lines 154-160 are covered in integration tests when running with actual LIVE env.
