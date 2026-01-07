import { describe, expect, it } from "bun:test";
import {
  CreamBroker,
  CreamEnvironment,
  envSchema,
  getEnvVarDocumentation,
  getHelixUrl,
  validateEnvironment,
} from "./env";

describe("CreamEnvironment", () => {
  it("accepts valid environment values", () => {
    expect(CreamEnvironment.parse("BACKTEST")).toBe("BACKTEST");
    expect(CreamEnvironment.parse("PAPER")).toBe("PAPER");
    expect(CreamEnvironment.parse("LIVE")).toBe("LIVE");
  });

  it("rejects invalid environment values", () => {
    expect(() => CreamEnvironment.parse("DEV")).toThrow();
    expect(() => CreamEnvironment.parse("PRODUCTION")).toThrow();
    expect(() => CreamEnvironment.parse("")).toThrow();
    expect(() => CreamEnvironment.parse("backtest")).toThrow(); // case-sensitive
  });
});

describe("CreamBroker", () => {
  it("accepts valid broker values", () => {
    expect(CreamBroker.parse("ALPACA")).toBe("ALPACA");
  });

  it("rejects invalid broker values", () => {
    expect(() => CreamBroker.parse("IBKR")).toThrow();
    expect(() => CreamBroker.parse("")).toThrow();
  });
});

describe("envSchema", () => {
  describe("BACKTEST environment", () => {
    it("succeeds with minimal configuration", () => {
      const result = envSchema.safeParse({
        CREAM_ENV: "BACKTEST",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.CREAM_ENV).toBe("BACKTEST");
        expect(result.data.CREAM_BROKER).toBe("ALPACA"); // default
        expect(result.data.TURSO_DATABASE_URL).toBe("http://localhost:8080"); // default
      }
    });

    it("does not require API keys", () => {
      const result = envSchema.safeParse({
        CREAM_ENV: "BACKTEST",
        // No API keys
      });
      expect(result.success).toBe(true);
    });
  });

  describe("PAPER environment", () => {
    it("requires broker credentials", () => {
      const result = envSchema.safeParse({
        CREAM_ENV: "PAPER",
        // Missing ALPACA_KEY and ALPACA_SECRET
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issues = result.error.issues;
        const messages = issues.map((e) => e.message);
        expect(messages).toContain("ALPACA_KEY is required for PAPER environment");
        expect(messages).toContain("ALPACA_SECRET is required for PAPER environment");
      }
    });

    it("succeeds with broker credentials", () => {
      const result = envSchema.safeParse({
        CREAM_ENV: "PAPER",
        ALPACA_KEY: "test-key",
        ALPACA_SECRET: "test-secret",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("LIVE environment", () => {
    it("requires all credentials", () => {
      const result = envSchema.safeParse({
        CREAM_ENV: "LIVE",
        // Missing everything
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issues = result.error.issues;
        const messages = issues.map((e) => e.message);
        expect(messages).toContain("ALPACA_KEY is required for LIVE environment");
        expect(messages).toContain("ALPACA_SECRET is required for LIVE environment");
        expect(messages).toContain("POLYGON_KEY is required for LIVE environment");
        expect(messages).toContain("DATABENTO_KEY is required for LIVE environment");
        // Now requires at least one of ANTHROPIC_API_KEY or GOOGLE_API_KEY
        expect(messages).toContain(
          "ANTHROPIC_API_KEY or GOOGLE_API_KEY is required for LIVE environment"
        );
      }
    });

    it("succeeds with all required credentials (using Anthropic)", () => {
      const result = envSchema.safeParse({
        CREAM_ENV: "LIVE",
        ALPACA_KEY: "test-key",
        ALPACA_SECRET: "test-secret",
        POLYGON_KEY: "polygon-key",
        DATABENTO_KEY: "databento-key",
        ANTHROPIC_API_KEY: "anthropic-key",
      });
      expect(result.success).toBe(true);
    });

    it("succeeds with all required credentials (using Google)", () => {
      const result = envSchema.safeParse({
        CREAM_ENV: "LIVE",
        ALPACA_KEY: "test-key",
        ALPACA_SECRET: "test-secret",
        POLYGON_KEY: "polygon-key",
        DATABENTO_KEY: "databento-key",
        GOOGLE_API_KEY: "google-key",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("URL validation", () => {
    it("accepts valid HTTP URLs", () => {
      const result = envSchema.safeParse({
        CREAM_ENV: "BACKTEST",
        TURSO_DATABASE_URL: "http://localhost:8080",
      });
      expect(result.success).toBe(true);
    });

    it("accepts valid HTTPS URLs", () => {
      const result = envSchema.safeParse({
        CREAM_ENV: "BACKTEST",
        TURSO_DATABASE_URL: "https://example.turso.io",
      });
      expect(result.success).toBe(true);
    });

    it("accepts file: URLs for local SQLite", () => {
      const result = envSchema.safeParse({
        CREAM_ENV: "BACKTEST",
        TURSO_DATABASE_URL: "file:local.db",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid URLs", () => {
      const result = envSchema.safeParse({
        CREAM_ENV: "BACKTEST",
        TURSO_DATABASE_URL: "not-a-url",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("defaults", () => {
    it("applies CREAM_BROKER default", () => {
      const result = envSchema.parse({
        CREAM_ENV: "BACKTEST",
      });
      expect(result.CREAM_BROKER).toBe("ALPACA");
    });

    it("applies TURSO_DATABASE_URL default", () => {
      const result = envSchema.parse({
        CREAM_ENV: "BACKTEST",
      });
      expect(result.TURSO_DATABASE_URL).toBe("http://localhost:8080");
    });

    it("applies HELIX_URL default", () => {
      const result = envSchema.parse({
        CREAM_ENV: "BACKTEST",
      });
      expect(result.HELIX_URL).toBe("http://localhost:6969");
    });
  });
});

describe("missing CREAM_ENV", () => {
  it("fails validation when CREAM_ENV is missing", () => {
    const result = envSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("LIVE environment LLM requirements", () => {
  it("requires at least one LLM API key", () => {
    const result = envSchema.safeParse({
      CREAM_ENV: "LIVE",
      ALPACA_KEY: "test-key",
      ALPACA_SECRET: "test-secret",
      POLYGON_KEY: "polygon-key",
      DATABENTO_KEY: "databento-key",
      // No LLM keys
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((e) => e.message);
      expect(messages).toContain(
        "ANTHROPIC_API_KEY or GOOGLE_API_KEY is required for LIVE environment"
      );
    }
  });

  it("succeeds with ANTHROPIC_API_KEY only", () => {
    const result = envSchema.safeParse({
      CREAM_ENV: "LIVE",
      ALPACA_KEY: "test-key",
      ALPACA_SECRET: "test-secret",
      POLYGON_KEY: "polygon-key",
      DATABENTO_KEY: "databento-key",
      ANTHROPIC_API_KEY: "anthropic-key",
    });
    expect(result.success).toBe(true);
  });

  it("succeeds with GOOGLE_API_KEY only", () => {
    const result = envSchema.safeParse({
      CREAM_ENV: "LIVE",
      ALPACA_KEY: "test-key",
      ALPACA_SECRET: "test-secret",
      POLYGON_KEY: "polygon-key",
      DATABENTO_KEY: "databento-key",
      GOOGLE_API_KEY: "google-key",
    });
    expect(result.success).toBe(true);
  });
});

describe("new environment variables", () => {
  it("accepts HELIX_HOST and HELIX_PORT", () => {
    const result = envSchema.safeParse({
      CREAM_ENV: "BACKTEST",
      HELIX_HOST: "localhost",
      HELIX_PORT: "6969",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.HELIX_HOST).toBe("localhost");
      expect(result.data.HELIX_PORT).toBe(6969);
    }
  });

  it("accepts Kalshi credentials", () => {
    const result = envSchema.safeParse({
      CREAM_ENV: "BACKTEST",
      KALSHI_API_KEY_ID: "key-id",
      KALSHI_PRIVATE_KEY_PATH: "/path/to/key",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.KALSHI_API_KEY_ID).toBe("key-id");
      expect(result.data.KALSHI_PRIVATE_KEY_PATH).toBe("/path/to/key");
    }
  });

  it("accepts ANTHROPIC_API_KEY", () => {
    const result = envSchema.safeParse({
      CREAM_ENV: "BACKTEST",
      ANTHROPIC_API_KEY: "sk-ant-test",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ANTHROPIC_API_KEY).toBe("sk-ant-test");
    }
  });
});

describe("getHelixUrl", () => {
  it("returns HELIX_URL when set", () => {
    // This test uses the actual env, so we just verify the function exists
    const url = getHelixUrl();
    expect(typeof url).toBe("string");
    expect(url).toMatch(/^https?:\/\//);
  });
});

describe("validateEnvironment", () => {
  it("returns valid for BACKTEST with no additional requirements", () => {
    const result = validateEnvironment("test-service");
    expect(result.valid).toBe(true);
    expect(result.environment).toBe("BACKTEST");
  });

  it("returns errors for missing additional requirements", () => {
    // Use KALSHI keys which are very unlikely to be set in test environment
    const result = validateEnvironment("test-service", ["KALSHI_API_KEY_ID"]);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("KALSHI_API_KEY_ID");
  });
});

describe("getEnvVarDocumentation", () => {
  it("returns documentation for all env vars", () => {
    const docs = getEnvVarDocumentation();
    expect(docs.length).toBeGreaterThan(10);

    const creamEnv = docs.find((d) => d.name === "CREAM_ENV");
    expect(creamEnv).toBeDefined();
    expect(creamEnv?.required).toBe(true);

    const anthropicKey = docs.find((d) => d.name === "ANTHROPIC_API_KEY");
    expect(anthropicKey).toBeDefined();
    expect(anthropicKey?.description).toContain("Anthropic");
  });
});
