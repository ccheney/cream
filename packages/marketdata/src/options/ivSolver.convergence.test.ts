import { expect, test } from "bun:test";

import { solveIV } from "./ivSolver";
import { blackScholesPrice } from "./ivSolver.test-helpers";

test("solveIV is deterministic across multiple runs", () => {
	const T = 30 / 365;
	const optionPrice = blackScholesPrice(100, 100, T, 0.05, 0.25, "CALL");
	const results: number[] = [];
	for (let i = 0; i < 10; i++) {
		results.push(
			solveIV({
				optionPrice,
				underlyingPrice: 100,
				strike: 100,
				timeToExpiration: T,
				optionType: "CALL",
				riskFreeRate: 0.05,
			}).impliedVolatility,
		);
	}
	expect(results.length).toBe(10);
	expect(new Set(results).size).toBe(1);
});

test("solveIV changes result with different risk-free rates", () => {
	const T = 180 / 365;
	const optionPrice = 8.5;
	const result1 = solveIV({
		optionPrice,
		underlyingPrice: 100,
		strike: 100,
		timeToExpiration: T,
		optionType: "CALL",
		riskFreeRate: 0.02,
	});
	const result2 = solveIV({
		optionPrice,
		underlyingPrice: 100,
		strike: 100,
		timeToExpiration: T,
		optionType: "CALL",
		riskFreeRate: 0.08,
	});
	expect(result1.impliedVolatility).not.toBeCloseTo(result2.impliedVolatility, 2);
});
