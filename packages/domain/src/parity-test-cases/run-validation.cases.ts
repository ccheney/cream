import { describe, expect, test } from "bun:test";

import { runParityValidation } from "../parity";

describe("runParityValidation", () => {
	test("approves when all checks pass", () => {
		const result = runParityValidation({
			researchRegistry: {
				createdAt: "2026-01-04T00:00:00Z",
				environment: "PAPER",
				indicators: {
					sma: { id: "sma", version: "1.0.0", introducedAt: "2026-01-01T00:00:00Z" },
				},
			},
			liveRegistry: {
				createdAt: "2026-01-04T00:00:00Z",
				environment: "LIVE",
				indicators: {
					sma: { id: "sma", version: "1.0.0", introducedAt: "2026-01-01T00:00:00Z" },
				},
			},
			candles: [
				{
					timestamp: "2026-01-04T09:00:00Z",
					open: 100,
					high: 105,
					low: 99,
					close: 103,
					volume: 1000,
				},
			],
			decisionTimestamp: "2026-01-04T10:00:00Z",
		});

		expect(result.passed).toBe(true);
		expect(result.recommendation).toBe("APPROVE_FOR_LIVE");
		expect(result.blockingIssues).toHaveLength(0);
	});

	test("blocks on version mismatches", () => {
		const result = runParityValidation({
			researchRegistry: {
				createdAt: "2026-01-04T00:00:00Z",
				environment: "PAPER",
				indicators: {
					sma: { id: "sma", version: "1.0.0", introducedAt: "2026-01-01T00:00:00Z" },
				},
			},
			liveRegistry: {
				createdAt: "2026-01-04T00:00:00Z",
				environment: "LIVE",
				indicators: {
					sma: { id: "sma", version: "2.0.0", introducedAt: "2026-01-01T00:00:00Z" },
				},
			},
		});

		expect(result.passed).toBe(false);
		expect(result.recommendation).toBe("NOT_READY");
		expect(result.blockingIssues.length).toBeGreaterThan(0);
	});
});

describe("runParityValidation", () => {
	test("blocks on look-ahead bias", () => {
		const result = runParityValidation({
			candles: [
				{
					timestamp: "2026-01-04T12:00:00Z",
					open: 100,
					high: 105,
					low: 99,
					close: 103,
					volume: 1000,
				},
			],
			decisionTimestamp: "2026-01-04T10:00:00Z",
		});

		expect(result.passed).toBe(false);
		expect(result.recommendation).toBe("NOT_READY");
		expect(result.blockingIssues.some((issue) => issue.includes("Look-ahead"))).toBe(true);
	});

	test("needs investigation when fill model diverges", () => {
		const result = runParityValidation({
			researchFills: [
				{
					orderId: "1",
					symbol: "AAPL",
					side: "buy",
					requestedQty: 100,
					filledQty: 100,
					orderType: "market",
					slippageBps: 2,
				},
			],
			liveFills: [
				{
					orderId: "1",
					symbol: "AAPL",
					side: "buy",
					requestedQty: 100,
					filledQty: 100,
					orderType: "market",
					slippageBps: 30,
				},
			],
		});

		expect(result.warnings.length).toBeGreaterThan(0);
	});

	test("records validation timestamp", () => {
		const before = new Date().toISOString();
		const result = runParityValidation({});
		const after = new Date().toISOString();

		expect(result.validatedAt >= before).toBe(true);
		expect(result.validatedAt <= after).toBe(true);
	});
});
