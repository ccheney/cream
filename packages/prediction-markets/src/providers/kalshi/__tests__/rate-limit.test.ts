/**
 * Tests for KalshiClient rate limiting
 */

import { beforeEach, describe, expect, it } from "bun:test";
import { KalshiClient } from "../client.js";
import { mockGetMarkets, resetMocks, resetToDefaultImplementations } from "./fixtures.js";

describe("KalshiClient enforceRateLimit", () => {
	beforeEach(() => {
		resetMocks();
		resetToDefaultImplementations();
	});

	it("should not delay first request", async () => {
		const client = new KalshiClient({
			apiKeyId: "test-key",
			privateKeyPem: "test-pem",
			tier: "basic",
		});

		const start = Date.now();
		await client.fetchMarkets(["RECESSION"]);
		const elapsed = Date.now() - start;

		expect(elapsed).toBeLessThan(500);
	});

	it("should work with different tiers", async () => {
		const basicClient = new KalshiClient({
			apiKeyId: "test-key",
			privateKeyPem: "test-pem",
			tier: "basic",
		});

		const primeClient = new KalshiClient({
			apiKeyId: "test-key",
			privateKeyPem: "test-pem",
			tier: "prime",
		});

		await basicClient.fetchMarkets(["RECESSION"]);
		await primeClient.fetchMarkets(["RECESSION"]);

		expect(mockGetMarkets).toHaveBeenCalled();
	});
});
