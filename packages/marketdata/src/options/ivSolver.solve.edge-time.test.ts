import { expect, test } from "bun:test";

import { solveIV } from "./ivSolver";
import { blackScholesPrice } from "./ivSolver.test-helpers";

test("solveIV short-dated option (7 days)", () => {
	const T = 7 / 365;
	const knownIV = 0.35;
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
	expect(result.impliedVolatility).toBeCloseTo(knownIV, 3);
});

test("solveIV long-dated option (180 days)", () => {
	const T = 180 / 365;
	const knownIV = 0.28;
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

test("solveIV LEAPS option (365 days)", () => {
	const T = 365 / 365;
	const knownIV = 0.22;
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

test("solveIV returns 0 for expired option", () => {
	const result = solveIV({
		optionPrice: 5,
		underlyingPrice: 100,
		strike: 100,
		timeToExpiration: 0,
		optionType: "CALL",
	});
	expect(result.converged).toBe(true);
	expect(result.impliedVolatility).toBe(0);
	expect(result.iterations).toBe(0);
});

test("solveIV returns minimum IV for zero option price", () => {
	const result = solveIV({
		optionPrice: 0,
		underlyingPrice: 100,
		strike: 100,
		timeToExpiration: 30 / 365,
		optionType: "CALL",
	});
	expect(result.impliedVolatility).toBe(0.001);
});

test("solveIV rejects prices below intrinsic value", () => {
	const result = solveIV({
		optionPrice: 5,
		underlyingPrice: 110,
		strike: 100,
		timeToExpiration: 30 / 365,
		optionType: "CALL",
	});
	expect(result.converged).toBe(false);
	expect(result.impliedVolatility).toBe(0.001);
});

test("solveIV converges at very high volatility", () => {
	const T = 30 / 365;
	const knownIV = 1.5;
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
	expect(result.impliedVolatility).toBeCloseTo(knownIV, 2);
});

test("solveIV stays bounded for deep OTM option", () => {
	const T = 30 / 365;
	const knownIV = 0.3;
	const optionPrice = blackScholesPrice(100, 125, T, 0.05, knownIV, "CALL");
	const result = solveIV({
		optionPrice,
		underlyingPrice: 100,
		strike: 125,
		timeToExpiration: T,
		optionType: "CALL",
		riskFreeRate: 0.05,
	});
	expect(result.impliedVolatility).toBeGreaterThan(0.1);
	expect(result.impliedVolatility).toBeLessThan(1);
});

test("solveIV real-world AAPL-like weekly option", () => {
	const T = 5 / 365;
	const knownIV = 0.22;
	const optionPrice = blackScholesPrice(175, 177.5, T, 0.05, knownIV, "CALL");
	const result = solveIV({
		optionPrice,
		underlyingPrice: 175,
		strike: 177.5,
		timeToExpiration: T,
		optionType: "CALL",
		riskFreeRate: 0.05,
	});
	expect(result.converged).toBe(true);
	expect(result.impliedVolatility).toBeCloseTo(knownIV, 3);
});

test("solveIV real-world SPY-like monthly option", () => {
	const T = 30 / 365;
	const knownIV = 0.15;
	const optionPrice = blackScholesPrice(500, 505, T, 0.05, knownIV, "CALL");
	const result = solveIV({
		optionPrice,
		underlyingPrice: 500,
		strike: 505,
		timeToExpiration: T,
		optionType: "CALL",
		riskFreeRate: 0.05,
	});
	expect(result.converged).toBe(true);
	expect(result.impliedVolatility).toBeCloseTo(knownIV, 3);
});

test("solveIV real-world high-IV meme stock scenario", () => {
	const T = 14 / 365;
	const knownIV = 1.2;
	const optionPrice = blackScholesPrice(25, 30, T, 0.05, knownIV, "CALL");
	const result = solveIV({
		optionPrice,
		underlyingPrice: 25,
		strike: 30,
		timeToExpiration: T,
		optionType: "CALL",
		riskFreeRate: 0.05,
	});
	expect(result.converged).toBe(true);
	expect(result.impliedVolatility).toBeCloseTo(knownIV, 2);
});
