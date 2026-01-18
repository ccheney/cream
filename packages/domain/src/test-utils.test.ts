/**
 * Test Utilities Tests
 *
 * Tests for the ExecutionContext test helper functions.
 */

import { describe, expect, test } from "bun:test";
import { createTestContext, createTestContextWithConfig } from "./test-utils";

// UUID v4 regex pattern
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("createTestContext", () => {
	test("defaults to PAPER environment", () => {
		const ctx = createTestContext();
		expect(ctx.environment).toBe("PAPER");
	});

	test("source is always 'test'", () => {
		const ctx = createTestContext();
		expect(ctx.source).toBe("test");
	});

	test("environment can be overridden to PAPER", () => {
		const ctx = createTestContext("PAPER");
		expect(ctx.environment).toBe("PAPER");
		expect(ctx.source).toBe("test");
	});

	test("environment can be overridden to LIVE", () => {
		const ctx = createTestContext("LIVE");
		expect(ctx.environment).toBe("LIVE");
		expect(ctx.source).toBe("test");
	});

	test("generates valid UUID v4 traceId", () => {
		const ctx = createTestContext();
		expect(ctx.traceId).toMatch(UUID_V4_REGEX);
	});

	test("each call generates unique traceId", () => {
		const ctx1 = createTestContext();
		const ctx2 = createTestContext();
		expect(ctx1.traceId).not.toBe(ctx2.traceId);
	});

	test("configId is undefined by default", () => {
		const ctx = createTestContext();
		expect(ctx.configId).toBeUndefined();
	});

	test("returned context is frozen (immutable)", () => {
		const ctx = createTestContext();
		expect(Object.isFrozen(ctx)).toBe(true);
	});
});

describe("createTestContextWithConfig", () => {
	test("sets configId correctly", () => {
		const ctx = createTestContextWithConfig("PAPER", "config-v1.2.3");
		expect(ctx.configId).toBe("config-v1.2.3");
	});

	test("defaults to PAPER environment", () => {
		const ctx = createTestContextWithConfig(undefined, "config-abc");
		expect(ctx.environment).toBe("PAPER");
	});

	test("source is always 'test'", () => {
		const ctx = createTestContextWithConfig("PAPER", "config-xyz");
		expect(ctx.source).toBe("test");
	});

	test("environment can be overridden", () => {
		const ctx = createTestContextWithConfig("LIVE", "production-config");
		expect(ctx.environment).toBe("LIVE");
		expect(ctx.configId).toBe("production-config");
	});

	test("generates valid UUID v4 traceId", () => {
		const ctx = createTestContextWithConfig("PAPER", "config");
		expect(ctx.traceId).toMatch(UUID_V4_REGEX);
	});

	test("each call generates unique traceId", () => {
		const ctx1 = createTestContextWithConfig("PAPER", "config");
		const ctx2 = createTestContextWithConfig("PAPER", "config");
		expect(ctx1.traceId).not.toBe(ctx2.traceId);
	});

	test("returned context is frozen (immutable)", () => {
		const ctx = createTestContextWithConfig("PAPER", "config");
		expect(Object.isFrozen(ctx)).toBe(true);
	});
});

describe("usage patterns", () => {
	test("typical unit test pattern", () => {
		// Most unit tests just need default PAPER context
		const ctx = createTestContext();

		expect(ctx.environment).toBe("PAPER");
		expect(ctx.source).toBe("test");
		expect(ctx.traceId).toMatch(UUID_V4_REGEX);
	});

	test("testing environment-specific behavior pattern", () => {
		// Test that something behaves differently per environment
		const paperCtx = createTestContext("PAPER");
		const liveCtx = createTestContext("LIVE");

		// All have same source (test)
		expect(paperCtx.source).toBe("test");
		expect(liveCtx.source).toBe("test");

		// But different environments
		expect(paperCtx.environment).not.toBe(liveCtx.environment);
	});

	test("testing config-aware behavior pattern", () => {
		// Test something that depends on config version
		const ctx = createTestContextWithConfig("PAPER", "draft-2026-01-08");

		expect(ctx.environment).toBe("PAPER");
		expect(ctx.configId).toBe("draft-2026-01-08");
	});
});
