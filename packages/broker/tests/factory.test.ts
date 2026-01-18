/**
 * Broker Client Factory Tests
 */

import { describe, expect, test } from "bun:test";
import { createTestContext } from "@cream/domain";
import { createBrokerClient } from "../src/factory.js";

describe("createBrokerClient factory", () => {
	describe("PAPER environment", () => {
		test("throws error for PAPER without credentials", () => {
			const savedKey = Bun.env.ALPACA_KEY;
			const savedSecret = Bun.env.ALPACA_SECRET;
			delete Bun.env.ALPACA_KEY;
			delete Bun.env.ALPACA_SECRET;

			try {
				const ctx = createTestContext("PAPER");
				expect(() => createBrokerClient(ctx)).toThrow("ALPACA_KEY and ALPACA_SECRET are required");
			} finally {
				if (savedKey) {
					Bun.env.ALPACA_KEY = savedKey;
				}
				if (savedSecret) {
					Bun.env.ALPACA_SECRET = savedSecret;
				}
			}
		});

		test("creates Alpaca client for PAPER with valid credentials", () => {
			const ctx = createTestContext("PAPER");
			const client = createBrokerClient(ctx, {
				apiKey: "test-key",
				apiSecret: "test-secret",
			});
			expect(client.getEnvironment()).toBe("PAPER");
		});
	});

	describe("LIVE environment", () => {
		test("creates Alpaca client for LIVE with valid credentials", () => {
			const ctx = createTestContext("LIVE");
			const client = createBrokerClient(ctx, {
				apiKey: "test-key",
				apiSecret: "test-secret",
			});
			expect(client.getEnvironment()).toBe("LIVE");
		});
	});
});
