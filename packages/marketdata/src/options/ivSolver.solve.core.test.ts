import { expect, test } from "bun:test";

import { solveIV } from "./ivSolver";
import { blackScholesPrice } from "./ivSolver.test-helpers";

test("solveIV ATM call under typical conditions", () => {
	const T = 30 / 365;
	const knownIV = 0.25;
	const optionPrice = blackScholesPrice(100, 100, T, 0.05, knownIV, "CALL");
	const result = solveIV({
		optionPrice,
		underlyingPrice: 100,
		strike: 100,
		timeToExpiration: T,
		optionType: "CALL",
		riskFreeRate: 0.05,
	});
	expect(result.converged).toBe(true);
	expect(result.impliedVolatility).toBeCloseTo(knownIV, 4);
	expect(result.iterations).toBeLessThan(10);
});

test("solveIV ATM put under typical conditions", () => {
	const T = 30 / 365;
	const knownIV = 0.25;
	const optionPrice = blackScholesPrice(100, 100, T, 0.05, knownIV, "PUT");
	const result = solveIV({
		optionPrice,
		underlyingPrice: 100,
		strike: 100,
		timeToExpiration: T,
		optionType: "PUT",
		riskFreeRate: 0.05,
	});
	expect(result.converged).toBe(true);
	expect(result.impliedVolatility).toBeCloseTo(knownIV, 4);
});

test("solveIV ATM call with high volatility", () => {
	const T = 30 / 365;
	const knownIV = 0.6;
	const optionPrice = blackScholesPrice(100, 100, T, 0.05, knownIV, "CALL");
	const result = solveIV({
		optionPrice,
		underlyingPrice: 100,
		strike: 100,
		timeToExpiration: T,
		optionType: "CALL",
		riskFreeRate: 0.05,
	});
	expect(result.converged).toBe(true);
	expect(result.impliedVolatility).toBeCloseTo(knownIV, 4);
});

test("solveIV ATM call with low volatility", () => {
	const T = 30 / 365;
	const knownIV = 0.1;
	const optionPrice = blackScholesPrice(100, 100, T, 0.05, knownIV, "CALL");
	const result = solveIV({
		optionPrice,
		underlyingPrice: 100,
		strike: 100,
		timeToExpiration: T,
		optionType: "CALL",
		riskFreeRate: 0.05,
	});
	expect(result.converged).toBe(true);
	expect(result.impliedVolatility).toBeCloseTo(knownIV, 4);
});

test("solveIV OTM call (10% out of money)", () => {
	const T = 30 / 365;
	const knownIV = 0.3;
	const optionPrice = blackScholesPrice(100, 110, T, 0.05, knownIV, "CALL");
	const result = solveIV({
		optionPrice,
		underlyingPrice: 100,
		strike: 110,
		timeToExpiration: T,
		optionType: "CALL",
		riskFreeRate: 0.05,
	});
	expect(result.converged).toBe(true);
	expect(result.impliedVolatility).toBeCloseTo(knownIV, 3);
});

test("solveIV OTM put (10% out of money)", () => {
	const T = 30 / 365;
	const knownIV = 0.3;
	const optionPrice = blackScholesPrice(100, 90, T, 0.05, knownIV, "PUT");
	const result = solveIV({
		optionPrice,
		underlyingPrice: 100,
		strike: 90,
		timeToExpiration: T,
		optionType: "PUT",
		riskFreeRate: 0.05,
	});
	expect(result.converged).toBe(true);
	expect(result.impliedVolatility).toBeCloseTo(knownIV, 3);
});

test("solveIV ITM call (10% in money)", () => {
	const T = 30 / 365;
	const knownIV = 0.25;
	const optionPrice = blackScholesPrice(100, 90, T, 0.05, knownIV, "CALL");
	const result = solveIV({
		optionPrice,
		underlyingPrice: 100,
		strike: 90,
		timeToExpiration: T,
		optionType: "CALL",
		riskFreeRate: 0.05,
	});
	expect(result.converged).toBe(true);
	expect(result.impliedVolatility).toBeCloseTo(knownIV, 3);
});

test("solveIV ITM put (10% in money)", () => {
	const T = 30 / 365;
	const knownIV = 0.25;
	const optionPrice = blackScholesPrice(100, 110, T, 0.05, knownIV, "PUT");
	const result = solveIV({
		optionPrice,
		underlyingPrice: 100,
		strike: 110,
		timeToExpiration: T,
		optionType: "PUT",
		riskFreeRate: 0.05,
	});
	expect(result.converged).toBe(true);
	expect(result.impliedVolatility).toBeCloseTo(knownIV, 3);
});
