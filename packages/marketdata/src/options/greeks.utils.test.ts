import { expect, test } from "bun:test";

import { calculateMoneyness, daysToYears, getMoneyStatus } from "./greeks";
import { expectApprox } from "./greeks.test-helpers";

test("daysToYears converts 365 days to one year", () => {
	expect(daysToYears(365)).toBeCloseTo(1, 5);
});

test("daysToYears converts 30 days", () => {
	expectApprox(daysToYears(30), 30 / 365, 0.0001);
});

test("daysToYears handles zero", () => {
	expect(daysToYears(0)).toBe(0);
});

test("calculateMoneyness returns 1.0 for ATM", () => {
	expect(calculateMoneyness(100, 100)).toBe(1);
});

test("calculateMoneyness is above one for ITM calls", () => {
	expect(calculateMoneyness(110, 100)).toBe(1.1);
});

test("calculateMoneyness is below one for OTM calls", () => {
	expect(calculateMoneyness(90, 100)).toBe(0.9);
});

test("getMoneyStatus classifies calls", () => {
	expect(getMoneyStatus(110, 100, "CALL")).toBe("ITM");
	expect(getMoneyStatus(90, 100, "CALL")).toBe("OTM");
	expect(getMoneyStatus(100, 100, "CALL")).toBe("ATM");
});

test("getMoneyStatus classifies puts", () => {
	expect(getMoneyStatus(90, 100, "PUT")).toBe("ITM");
	expect(getMoneyStatus(110, 100, "PUT")).toBe("OTM");
	expect(getMoneyStatus(100, 100, "PUT")).toBe("ATM");
});

test("getMoneyStatus uses ATM threshold", () => {
	expect(getMoneyStatus(101, 100, "CALL")).toBe("ATM");
	expect(getMoneyStatus(103, 100, "CALL")).toBe("ITM");
});
