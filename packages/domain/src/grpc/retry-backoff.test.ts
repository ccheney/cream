import { describe, expect, it } from "bun:test";
import { RetryBackoff } from "./errors.js";

describe("RetryBackoff.nextDelay", () => {
	it("returns exponentially increasing delays", () => {
		const backoff = new RetryBackoff({
			baseDelayMs: 100,
			jitterFactor: 0,
		});

		expect(backoff.nextDelay()).toBe(100);
		expect(backoff.nextDelay()).toBe(200);
		expect(backoff.nextDelay()).toBe(400);
	});

	it("caps at maxDelayMs", () => {
		const backoff = new RetryBackoff({
			baseDelayMs: 100,
			maxDelayMs: 250,
			jitterFactor: 0,
		});

		backoff.nextDelay();
		backoff.nextDelay();
		const delay3 = backoff.nextDelay();

		expect(delay3).toBe(250);
	});

	it("applies jitter within expected range", () => {
		for (let i = 0; i < 50; i++) {
			const backoff = new RetryBackoff({
				baseDelayMs: 100,
				jitterFactor: 0.2,
			});
			const delay = backoff.nextDelay();
			expect(delay).toBeGreaterThanOrEqual(80);
			expect(delay).toBeLessThanOrEqual(120);
		}
	});
});

describe("RetryBackoff.reset", () => {
	it("resets attempt counter", () => {
		const backoff = new RetryBackoff({
			baseDelayMs: 100,
			jitterFactor: 0,
		});

		backoff.nextDelay();
		backoff.nextDelay();
		expect(backoff.getAttempt()).toBe(2);

		backoff.reset();

		expect(backoff.getAttempt()).toBe(0);
		expect(backoff.nextDelay()).toBe(100);
	});
});

describe("RetryBackoff.getAttempt", () => {
	it("returns current attempt number", () => {
		const backoff = new RetryBackoff();

		expect(backoff.getAttempt()).toBe(0);
		backoff.nextDelay();
		expect(backoff.getAttempt()).toBe(1);
		backoff.nextDelay();
		expect(backoff.getAttempt()).toBe(2);
	});
});
