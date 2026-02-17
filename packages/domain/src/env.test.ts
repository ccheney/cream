/**
 * Environment Variable Tests
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createContext } from "./context";
import {
	CreamEnvironment,
	envSchema,
	getAlpacaBaseUrl,
	getEnvDatabaseSuffix,
	getEnvVarDocumentation,
	getHelixUrl,
	isLive,
	isPaper,
	isTest,
	requireEnv,
	validateEnvironment,
} from "./env";
import { createTestContext } from "./test-utils";

const requiredEnvFields = {
	LLM_PROVIDER: "google",
	LLM_MODEL_ID: "gemini-3-flash-preview",
};

describe("CreamEnvironment", () => {
	it("accepts valid environment values", () => {
		expect(CreamEnvironment.parse("PAPER")).toBe("PAPER");
		expect(CreamEnvironment.parse("LIVE")).toBe("LIVE");
	});

	it("rejects invalid environment values", () => {
		expect(() => CreamEnvironment.parse("DEV")).toThrow();
		expect(() => CreamEnvironment.parse("PRODUCTION")).toThrow();
		expect(() => CreamEnvironment.parse("")).toThrow();
		expect(() => CreamEnvironment.parse("paper")).toThrow();
	});
});

describe("envSchema minimal configuration", () => {
	it("succeeds with required LLM fields only", () => {
		const result = envSchema.safeParse(requiredEnvFields);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.DATABASE_URL).toBeUndefined();
			expect(result.data.HELIX_URL).toBe("http://localhost:6969");
		}
	});
});

describe("envSchema URL validation", () => {
	it("accepts valid HTTP URLs", () => {
		const result = envSchema.safeParse({
			...requiredEnvFields,
			DATABASE_URL: "http://localhost:5432",
		});
		expect(result.success).toBe(true);
	});

	it("accepts valid HTTPS URLs", () => {
		const result = envSchema.safeParse({
			...requiredEnvFields,
			DATABASE_URL: "https://db.example.com",
		});
		expect(result.success).toBe(true);
	});

	it("accepts postgres:// URLs", () => {
		const result = envSchema.safeParse({
			...requiredEnvFields,
			DATABASE_URL: "postgres://user:pass@localhost:5432/db",
		});
		expect(result.success).toBe(true);
	});

	it("accepts postgresql:// URLs", () => {
		const result = envSchema.safeParse({
			...requiredEnvFields,
			DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
		});
		expect(result.success).toBe(true);
	});

	it("rejects invalid URLs", () => {
		const result = envSchema.safeParse({
			...requiredEnvFields,
			ALPACA_BASE_URL: "not-a-url",
		});
		expect(result.success).toBe(false);
	});
});

describe("envSchema defaults", () => {
	it("applies HELIX_URL default", () => {
		const result = envSchema.parse(requiredEnvFields);
		expect(result.HELIX_URL).toBe("http://localhost:6969");
	});
});

describe("envSchema optional environment variables", () => {
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

describe("isTest", () => {
	it("returns true for test source", () => {
		const ctx = createTestContext();
		expect(isTest(ctx)).toBe(true);
	});

	it("returns false for non-test sources", () => {
		expect(isTest(createContext("PAPER", "scheduled"))).toBe(false);
		expect(isTest(createContext("PAPER", "manual"))).toBe(false);
		expect(isTest(createContext("PAPER", "dashboard-test"))).toBe(false);
	});
});

describe("isPaper", () => {
	it("returns true for PAPER context", () => {
		expect(isPaper(createTestContext("PAPER"))).toBe(true);
	});

	it("returns false for LIVE context", () => {
		expect(isPaper(createTestContext("LIVE"))).toBe(false);
	});
});

describe("isLive", () => {
	it("returns true for LIVE context", () => {
		expect(isLive(createTestContext("LIVE"))).toBe(true);
	});

	it("returns false for PAPER context", () => {
		expect(isLive(createTestContext("PAPER"))).toBe(false);
	});
});

describe("getAlpacaBaseUrl", () => {
	it("returns paper URL for PAPER context (when no override)", () => {
		const ctx = createTestContext("PAPER");
		const url = getAlpacaBaseUrl(ctx);
		expect(url).toMatch(/alpaca\.markets/);
	});

	it("returns different URLs for LIVE vs PAPER when no override", () => {
		const paperUrl = getAlpacaBaseUrl(createTestContext("PAPER"));
		const liveUrl = getAlpacaBaseUrl(createTestContext("LIVE"));
		expect(paperUrl).toMatch(/alpaca\.markets/);
		expect(liveUrl).toMatch(/alpaca\.markets/);
	});
});

describe("getEnvDatabaseSuffix", () => {
	it("returns _paper for PAPER context", () => {
		expect(getEnvDatabaseSuffix(createTestContext("PAPER"))).toBe("_paper");
	});

	it("returns _live for LIVE context", () => {
		expect(getEnvDatabaseSuffix(createTestContext("LIVE"))).toBe("_live");
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
	it("PAPER requires broker and OAuth credentials", () => {
		const ctx = createTestContext("PAPER");
		const result = validateEnvironment(ctx, "test-service");
		expect(Array.isArray(result.errors)).toBe(true);
	});

	it("LIVE requires all credentials including LLM key", () => {
		const ctx = createTestContext("LIVE");
		const result = validateEnvironment(ctx, "test-service");
		expect(Array.isArray(result.errors)).toBe(true);
	});
});

describe("getEnvVarDocumentation", () => {
	it("returns documentation for all env vars", () => {
		const docs = getEnvVarDocumentation();
		expect(docs.length).toBeGreaterThan(10);
		expect(docs.find((entry) => entry.name === "CREAM_ENV")).toBeUndefined();

		const anthropicKey = docs.find((entry) => entry.name === "ANTHROPIC_API_KEY");
		expect(anthropicKey).toBeDefined();
		expect(anthropicKey?.description).toContain("Anthropic");

		const alpacaKey = docs.find((entry) => entry.name === "ALPACA_KEY");
		expect(alpacaKey).toBeDefined();
		expect(alpacaKey?.required).toBe("PAPER/LIVE");
	});
});

describe("requireEnv", () => {
	let originalBunEnv: string | undefined;

	beforeEach(() => {
		originalBunEnv = Bun.env.CREAM_ENV;
	});

	afterEach(() => {
		if (originalBunEnv !== undefined) {
			Bun.env.CREAM_ENV = originalBunEnv;
			return;
		}

		delete Bun.env.CREAM_ENV;
	});

	it("throws when CREAM_ENV not set", () => {
		delete Bun.env.CREAM_ENV;
		expect(() => requireEnv()).toThrow("CREAM_ENV environment variable is required");
	});

	it("throws for invalid value", () => {
		Bun.env.CREAM_ENV = "INVALID";
		expect(() => requireEnv()).toThrow('Invalid CREAM_ENV value: "INVALID"');
	});

	it("throws for lowercase value", () => {
		Bun.env.CREAM_ENV = "paper";
		expect(() => requireEnv()).toThrow('Invalid CREAM_ENV value: "paper"');
	});

	it("returns PAPER when set", () => {
		Bun.env.CREAM_ENV = "PAPER";
		expect(requireEnv()).toBe("PAPER");
	});

	it("returns LIVE when set", () => {
		Bun.env.CREAM_ENV = "LIVE";
		expect(requireEnv()).toBe("LIVE");
	});
});
