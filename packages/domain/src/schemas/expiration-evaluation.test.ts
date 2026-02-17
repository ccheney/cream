import { describe, expect, it } from "bun:test";
import { ExpirationEvaluationSchema, type ExpiringPosition } from "./expiration.js";

function createPosition(overrides: Partial<ExpiringPosition>): ExpiringPosition {
	return {
		positionId: "pos-123",
		osiSymbol: "AAPL  260117C00150000",
		underlyingSymbol: "AAPL",
		expirationDate: "2026-01-17",
		strike: 150,
		right: "CALL",
		quantity: 1,
		underlyingPrice: 155,
		dte: 5,
		positionType: "LONG_OPTION",
		moneyness: "ITM",
		distanceFromStrike: 5,
		isPinRisk: false,
		isExpirationDay: false,
		...overrides,
	};
}

describe("ExpirationEvaluationSchema", () => {
	it("validates a complete evaluation", () => {
		const evaluation = {
			position: createPosition({
				quantity: -1,
				underlyingPrice: 150.25,
				dte: 0.5,
				positionType: "SHORT_UNCOVERED",
				moneyness: "ATM",
				distanceFromStrike: 0.25,
				isPinRisk: true,
				isExpirationDay: true,
			}),
			action: "CLOSE",
			reason: "PIN_RISK",
			priority: 9,
			explanation: "Short CALL within $0.50 of strike - pin risk at expiration",
			deadline: "2026-01-17T15:00:00.000Z",
			isForced: true,
		};
		const result = ExpirationEvaluationSchema.safeParse(evaluation);
		expect(result.success).toBe(true);
	});

	it("enforces priority to the 1-10 range", () => {
		const validEvaluation = {
			position: createPosition({}),
			action: "CLOSE",
			reason: "MINIMUM_DTE",
			priority: 5,
			explanation: "test",
			isForced: false,
		};

		expect(ExpirationEvaluationSchema.safeParse({ ...validEvaluation, priority: 0 }).success).toBe(
			false,
		);
		expect(ExpirationEvaluationSchema.safeParse({ ...validEvaluation, priority: 11 }).success).toBe(
			false,
		);
		expect(ExpirationEvaluationSchema.safeParse(validEvaluation).success).toBe(true);
	});
});
