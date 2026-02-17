/**
 * Base REST Client default config tests
 */

import { describe, expect, test } from "bun:test";
import { DEFAULT_RATE_LIMIT, DEFAULT_RETRY } from "../src/client";

describe("Default Configuration", () => {
	test("has reasonable rate limit defaults", () => {
		expect(DEFAULT_RATE_LIMIT.maxRequests).toBe(100);
		expect(DEFAULT_RATE_LIMIT.intervalMs).toBe(60000);
	});

	test("has reasonable retry defaults", () => {
		expect(DEFAULT_RETRY.maxRetries).toBe(3);
		expect(DEFAULT_RETRY.initialDelayMs).toBe(1000);
		expect(DEFAULT_RETRY.maxDelayMs).toBe(30000);
		expect(DEFAULT_RETRY.backoffMultiplier).toBe(2);
	});
});
