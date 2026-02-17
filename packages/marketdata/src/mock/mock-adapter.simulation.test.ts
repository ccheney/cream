/**
 * Mock Adapter Error/Latency Simulation Tests
 */

import { describe, expect, it } from "bun:test";
import {
	createFailingMockAdapter,
	createFlakeMockAdapter,
	createMockAdapterWithLatency,
	MockApiError,
} from "./mock-adapter";

describe("Error Simulation", () => {
	it("should throw network error", async () => {
		const adapter = createFailingMockAdapter("NETWORK_ERROR");
		await expect(adapter.getCandles("AAPL")).rejects.toThrow(MockApiError);
	});

	it("should throw rate limit error with correct status code", async () => {
		const adapter = createFailingMockAdapter("RATE_LIMIT");
		try {
			await adapter.getQuote("AAPL");
			expect.unreachable("Should have thrown");
		} catch (error) {
			expect(error).toBeInstanceOf(MockApiError);
			expect((error as MockApiError).statusCode).toBe(429);
			expect((error as MockApiError).errorType).toBe("RATE_LIMIT");
		}
	});

	it("should throw auth error", async () => {
		const adapter = createFailingMockAdapter("AUTH_ERROR");
		try {
			await adapter.getAccount();
			expect.unreachable("Should have thrown");
		} catch (error) {
			expect(error).toBeInstanceOf(MockApiError);
			expect((error as MockApiError).statusCode).toBe(401);
		}
	});

	it("should throw intermittent errors based on probability", async () => {
		const adapter = createFlakeMockAdapter("SERVER_ERROR", 0.5);

		let errorCount = 0;
		let successCount = 0;

		for (let i = 0; i < 20; i++) {
			try {
				await adapter.getCandles("AAPL");
				successCount++;
			} catch {
				errorCount++;
			}
		}

		expect(errorCount + successCount).toBe(20);
	});
});

describe("Latency Simulation", () => {
	it("should add latency to requests", async () => {
		const adapter = createMockAdapterWithLatency(50);

		const start = Date.now();
		await adapter.getCandles("AAPL");
		const elapsed = Date.now() - start;

		expect(elapsed).toBeGreaterThanOrEqual(45);
	});
});
