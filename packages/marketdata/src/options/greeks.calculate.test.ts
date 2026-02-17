import { expect, test } from "bun:test";

import { calculateGreeks } from "./greeks";
import { createPosition, expectApprox } from "./greeks.test-helpers";

test("calculateGreeks ATM call delta is near 0.5", () => {
	const greeks = calculateGreeks(
		createPosition({ underlyingPrice: 150, strike: 150, optionType: "CALL" }),
	);
	expect(greeks.delta).toBeGreaterThan(0.45);
	expect(greeks.delta).toBeLessThan(0.6);
});

test("calculateGreeks deep ITM call delta is near 1", () => {
	const greeks = calculateGreeks(
		createPosition({ underlyingPrice: 200, strike: 100, optionType: "CALL" }),
	);
	expect(greeks.delta).toBeGreaterThan(0.95);
});

test("calculateGreeks deep OTM call delta is near 0", () => {
	const greeks = calculateGreeks(
		createPosition({ underlyingPrice: 100, strike: 200, optionType: "CALL" }),
	);
	expect(greeks.delta).toBeLessThan(0.05);
});

test("calculateGreeks call has positive gamma, positive vega, negative theta, positive rho", () => {
	const greeks = calculateGreeks(createPosition({ optionType: "CALL", riskFreeRate: 0.05 }));
	expect(greeks.gamma).toBeGreaterThan(0);
	expect(greeks.vega).toBeGreaterThan(0);
	expect(greeks.theta).toBeLessThan(0);
	expect(greeks.rho).toBeGreaterThan(0);
});

test("calculateGreeks ITM call has positive theoretical price", () => {
	const greeks = calculateGreeks(
		createPosition({ underlyingPrice: 160, strike: 150, optionType: "CALL" }),
	);
	expect(greeks.theoreticalPrice).toBeGreaterThan(10);
});

test("calculateGreeks ATM put delta is near -0.5", () => {
	const greeks = calculateGreeks(
		createPosition({ underlyingPrice: 150, strike: 150, optionType: "PUT" }),
	);
	expect(greeks.delta).toBeGreaterThan(-0.6);
	expect(greeks.delta).toBeLessThan(-0.4);
});

test("calculateGreeks deep ITM put delta is near -1", () => {
	const greeks = calculateGreeks(
		createPosition({ underlyingPrice: 100, strike: 200, optionType: "PUT" }),
	);
	expect(greeks.delta).toBeLessThan(-0.95);
});

test("calculateGreeks deep OTM put delta is near 0", () => {
	const greeks = calculateGreeks(
		createPosition({ underlyingPrice: 200, strike: 100, optionType: "PUT" }),
	);
	expect(greeks.delta).toBeGreaterThan(-0.05);
});

test("calculateGreeks put has positive gamma and negative rho", () => {
	const greeks = calculateGreeks(createPosition({ optionType: "PUT", riskFreeRate: 0.05 }));
	expect(greeks.gamma).toBeGreaterThan(0);
	expect(greeks.rho).toBeLessThan(0);
});

test("calculateGreeks handles expired options", () => {
	const greeks = calculateGreeks(
		createPosition({
			timeToExpiration: 0,
			underlyingPrice: 160,
			strike: 150,
			optionType: "CALL",
		}),
	);
	expect(greeks.delta).toBe(1);
	expect(greeks.gamma).toBe(0);
	expect(greeks.theta).toBe(0);
	expect(greeks.vega).toBe(0);
	expect(greeks.theoreticalPrice).toBe(10);
});

test("calculateGreeks handles zero volatility", () => {
	const greeks = calculateGreeks(
		createPosition({ impliedVolatility: 0, underlyingPrice: 160, strike: 150, optionType: "CALL" }),
	);
	expect(greeks.gamma).toBe(0);
	expect(greeks.vega).toBe(0);
});

test("calculateGreeks treats negative time as expired", () => {
	const greeks = calculateGreeks(createPosition({ timeToExpiration: -0.01 }));
	expect(greeks.gamma).toBe(0);
});

test("calculateGreeks satisfies put-call parity", () => {
	const S = 150;
	const K = 150;
	const T = 30 / 365;
	const r = 0.05;
	const callGreeks = calculateGreeks(
		createPosition({
			underlyingPrice: S,
			strike: K,
			timeToExpiration: T,
			riskFreeRate: r,
			optionType: "CALL",
		}),
	);
	const putGreeks = calculateGreeks(
		createPosition({
			underlyingPrice: S,
			strike: K,
			timeToExpiration: T,
			riskFreeRate: r,
			optionType: "PUT",
		}),
	);
	const expected = S - K * Math.exp(-r * T);
	const actual = callGreeks.theoreticalPrice - putGreeks.theoreticalPrice;
	expectApprox(actual, expected, 0.01);
});
