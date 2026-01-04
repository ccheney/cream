import { describe, expect, it } from "bun:test";
import { CreamBroker, CreamEnvironment, envSchema } from "./env";

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
        expect(messages).toContain("GOOGLE_API_KEY is required for LIVE environment");
      }
    });

    it("succeeds with all required credentials", () => {
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
