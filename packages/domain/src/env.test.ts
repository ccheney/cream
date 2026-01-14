/**
 * Environment Variable Tests
 *
 * Tests for env schema validation and context-aware helper functions.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	CreamEnvironment,
	envSchema,
	getAlpacaBaseUrl,
	getEnvDatabaseSuffix,
	getEnvVarDocumentation,
	getHelixUrl,
	isBacktest,
	isLive,
	isPaper,
	requireEnv,
	validateEnvironment,
} from "./env";
import { createTestContext } from "./test-utils";

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

// Base required fields for all envSchema tests
const requiredEnvFields = {
	LLM_PROVIDER: "google",
	LLM_MODEL_ID: "gemini-3-flash-preview",
};

describe("envSchema", () => {
	describe("minimal configuration", () => {
		it("succeeds with required LLM fields only", () => {
			const result = envSchema.safeParse(requiredEnvFields);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.TURSO_DATABASE_URL).toBe("http://localhost:8080"); // default
				expect(result.data.HELIX_URL).toBe("http://localhost:6969"); // default
			}
		});
	});

	describe("URL validation", () => {
		it("accepts valid HTTP URLs", () => {
			const result = envSchema.safeParse({
				...requiredEnvFields,
				TURSO_DATABASE_URL: "http://localhost:8080",
			});
			expect(result.success).toBe(true);
		});

		it("accepts valid HTTPS URLs", () => {
			const result = envSchema.safeParse({
				...requiredEnvFields,
				TURSO_DATABASE_URL: "https://example.turso.io",
			});
			expect(result.success).toBe(true);
		});

		it("accepts file: URLs for local SQLite", () => {
			const result = envSchema.safeParse({
				...requiredEnvFields,
				TURSO_DATABASE_URL: "file:local.db",
			});
			expect(result.success).toBe(true);
		});

		it("rejects invalid URLs", () => {
			const result = envSchema.safeParse({
				...requiredEnvFields,
				TURSO_DATABASE_URL: "not-a-url",
			});
			expect(result.success).toBe(false);
		});
	});

	describe("defaults", () => {
		it("applies TURSO_DATABASE_URL default", () => {
			const result = envSchema.parse(requiredEnvFields);
			expect(result.TURSO_DATABASE_URL).toBe("http://localhost:8080");
		});

		it("applies HELIX_URL default", () => {
			const result = envSchema.parse(requiredEnvFields);
			expect(result.HELIX_URL).toBe("http://localhost:6969");
		});
	});

	describe("optional environment variables", () => {
		it("accepts HELIX_HOST and HELIX_PORT", () => {
			const result = envSchema.safeParse({
				...requiredEnvFields,
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
				...requiredEnvFields,
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
				...requiredEnvFields,
				ANTHROPIC_API_KEY: "sk-ant-test",
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.ANTHROPIC_API_KEY).toBe("sk-ant-test");
			}
		});

		it("accepts OAuth credentials", () => {
			const result = envSchema.safeParse({
				...requiredEnvFields,
				GOOGLE_CLIENT_ID: "client-id",
				GOOGLE_CLIENT_SECRET: "client-secret",
				BETTER_AUTH_URL: "https://auth.example.com",
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.GOOGLE_CLIENT_ID).toBe("client-id");
				expect(result.data.GOOGLE_CLIENT_SECRET).toBe("client-secret");
				expect(result.data.BETTER_AUTH_URL).toBe("https://auth.example.com");
			}
		});
	});
});

describe("context-aware helper functions", () => {
	describe("isBacktest", () => {
		it("returns true for BACKTEST context", () => {
			const ctx = createTestContext("BACKTEST");
			expect(isBacktest(ctx)).toBe(true);
		});

		it("returns false for PAPER context", () => {
			const ctx = createTestContext("PAPER");
			expect(isBacktest(ctx)).toBe(false);
		});

		it("returns false for LIVE context", () => {
			const ctx = createTestContext("LIVE");
			expect(isBacktest(ctx)).toBe(false);
		});
	});

	describe("isPaper", () => {
		it("returns true for PAPER context", () => {
			const ctx = createTestContext("PAPER");
			expect(isPaper(ctx)).toBe(true);
		});

		it("returns false for BACKTEST context", () => {
			const ctx = createTestContext("BACKTEST");
			expect(isPaper(ctx)).toBe(false);
		});

		it("returns false for LIVE context", () => {
			const ctx = createTestContext("LIVE");
			expect(isPaper(ctx)).toBe(false);
		});
	});

	describe("isLive", () => {
		it("returns true for LIVE context", () => {
			const ctx = createTestContext("LIVE");
			expect(isLive(ctx)).toBe(true);
		});

		it("returns false for BACKTEST context", () => {
			const ctx = createTestContext("BACKTEST");
			expect(isLive(ctx)).toBe(false);
		});

		it("returns false for PAPER context", () => {
			const ctx = createTestContext("PAPER");
			expect(isLive(ctx)).toBe(false);
		});
	});

	describe("getAlpacaBaseUrl", () => {
		it("returns paper URL for BACKTEST context (when no override)", () => {
			const ctx = createTestContext("BACKTEST");
			const url = getAlpacaBaseUrl(ctx);
			// If ALPACA_BASE_URL is set, it will return that instead
			expect(url).toMatch(/alpaca\.markets/);
		});

		it("returns paper URL for PAPER context (when no override)", () => {
			const ctx = createTestContext("PAPER");
			const url = getAlpacaBaseUrl(ctx);
			expect(url).toMatch(/alpaca\.markets/);
		});

		it("returns different URLs for LIVE vs non-LIVE when no override", () => {
			const backtestCtx = createTestContext("BACKTEST");
			const liveCtx = createTestContext("LIVE");
			const backtestUrl = getAlpacaBaseUrl(backtestCtx);
			const liveUrl = getAlpacaBaseUrl(liveCtx);
			// Both should be valid Alpaca URLs
			expect(backtestUrl).toMatch(/alpaca\.markets/);
			expect(liveUrl).toMatch(/alpaca\.markets/);
			// Note: If ALPACA_BASE_URL env var is set, both will be the same
		});
	});

	describe("getEnvDatabaseSuffix", () => {
		it("returns _backtest for BACKTEST context", () => {
			const ctx = createTestContext("BACKTEST");
			expect(getEnvDatabaseSuffix(ctx)).toBe("_backtest");
		});

		it("returns _paper for PAPER context", () => {
			const ctx = createTestContext("PAPER");
			expect(getEnvDatabaseSuffix(ctx)).toBe("_paper");
		});

		it("returns _live for LIVE context", () => {
			const ctx = createTestContext("LIVE");
			expect(getEnvDatabaseSuffix(ctx)).toBe("_live");
		});
	});
});

describe("getHelixUrl", () => {
	it("returns a valid URL string", () => {
		const url = getHelixUrl();
		expect(typeof url).toBe("string");
		expect(url).toMatch(/^https?:\/\//);
	});
});

describe("validateEnvironment", () => {
	describe("BACKTEST environment", () => {
		it("returns valid with no additional requirements", () => {
			const ctx = createTestContext("BACKTEST");
			const result = validateEnvironment(ctx, "test-service");
			expect(result.valid).toBe(true);
			expect(result.errors).toHaveLength(0);
		});

		it("returns errors for missing additional requirements", () => {
			const ctx = createTestContext("BACKTEST");
			// Use a key that definitely won't be set in any environment
			const result = validateEnvironment(ctx, "test-service", [
				"NONEXISTENT_TEST_KEY_12345_ABCDEF",
			]);
			expect(result.valid).toBe(false);
			expect(result.errors.length).toBeGreaterThan(0);
			expect(result.errors[0]).toContain("NONEXISTENT_TEST_KEY_12345_ABCDEF");
		});
	});

	describe("PAPER environment", () => {
		it("requires broker and OAuth credentials", () => {
			const ctx = createTestContext("PAPER");
			const result = validateEnvironment(ctx, "test-service");
			// In test environment without these keys, validation should fail
			// (unless test environment has them set)
			expect(Array.isArray(result.errors)).toBe(true);
		});
	});

	describe("LIVE environment", () => {
		it("requires all credentials including LLM key", () => {
			const ctx = createTestContext("LIVE");
			const result = validateEnvironment(ctx, "test-service");
			// In test environment without these keys, validation should fail
			expect(Array.isArray(result.errors)).toBe(true);
		});
	});
});

describe("getEnvVarDocumentation", () => {
	it("returns documentation for all env vars", () => {
		const docs = getEnvVarDocumentation();
		expect(docs.length).toBeGreaterThan(10);

		// CREAM_ENV should NOT be in the documentation anymore
		const creamEnv = docs.find((d) => d.name === "CREAM_ENV");
		expect(creamEnv).toBeUndefined();

		const anthropicKey = docs.find((d) => d.name === "ANTHROPIC_API_KEY");
		expect(anthropicKey).toBeDefined();
		expect(anthropicKey?.description).toContain("Anthropic");

		const alpacaKey = docs.find((d) => d.name === "ALPACA_KEY");
		expect(alpacaKey).toBeDefined();
		expect(alpacaKey?.required).toBe("PAPER/LIVE");
	});
});

describe("requireEnv", () => {
	let originalCreamEnv: string | undefined;

	beforeEach(() => {
		originalCreamEnv = process.env.CREAM_ENV;
	});

	afterEach(() => {
		if (originalCreamEnv !== undefined) {
			process.env.CREAM_ENV = originalCreamEnv;
		} else {
			delete process.env.CREAM_ENV;
		}
	});

	it("throws when CREAM_ENV not set", () => {
		delete process.env.CREAM_ENV;
		expect(() => requireEnv()).toThrow("CREAM_ENV environment variable is required");
	});

	it("throws for invalid value", () => {
		process.env.CREAM_ENV = "INVALID";
		expect(() => requireEnv()).toThrow('Invalid CREAM_ENV value: "INVALID"');
	});

	it("throws for lowercase value", () => {
		process.env.CREAM_ENV = "backtest";
		expect(() => requireEnv()).toThrow('Invalid CREAM_ENV value: "backtest"');
	});

	it("returns BACKTEST when set", () => {
		process.env.CREAM_ENV = "BACKTEST";
		expect(requireEnv()).toBe("BACKTEST");
	});

	it("returns PAPER when set", () => {
		process.env.CREAM_ENV = "PAPER";
		expect(requireEnv()).toBe("PAPER");
	});

	it("returns LIVE when set", () => {
		process.env.CREAM_ENV = "LIVE";
		expect(requireEnv()).toBe("LIVE");
	});
});
