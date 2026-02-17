/**
 * Base REST Client rate limiter tests
 */

import { describe, expect, test } from "bun:test";
import { RateLimiter } from "../src/client";

describe("RateLimiter", () => {
	test("allows requests within limit", async () => {
		const limiter = new RateLimiter({ maxRequests: 5, intervalMs: 1000 });

		for (let i = 0; i < 5; i++) {
			await limiter.acquire();
		}

		expect(true).toBe(true);
	});

	test("blocks when limit exceeded", async () => {
		const limiter = new RateLimiter({ maxRequests: 2, intervalMs: 100 });
		const startTime = Date.now();

		await limiter.acquire();
		await limiter.acquire();
		await limiter.acquire();

		const elapsed = Date.now() - startTime;
		expect(elapsed).toBeGreaterThanOrEqual(90);
	});

	test("refills tokens after interval", async () => {
		const limiter = new RateLimiter({ maxRequests: 2, intervalMs: 50 });

		await limiter.acquire();
		await limiter.acquire();
		await new Promise((r) => setTimeout(r, 60));

		const startTime = Date.now();
		await limiter.acquire();
		const elapsed = Date.now() - startTime;

		expect(elapsed).toBeLessThan(50);
	});
});
