import { expect, test } from "bun:test";

import { buildOptionSymbol, parseOptionSymbol, solveIVFromQuote, timeToExpiry } from "./ivSolver";
import { blackScholesPrice } from "./ivSolver.test-helpers";

test("solveIVFromQuote calculates IV from bid/ask spread", () => {
	const T = 30 / 365;
	const knownIV = 0.25;
	const midPrice = blackScholesPrice(100, 100, T, 0.05, knownIV, "CALL");
	const iv = solveIVFromQuote(midPrice - 0.1, midPrice + 0.1, 100, 100, T, "CALL", 0.05);
	expect(iv).not.toBeNull();
	expect(iv).toBeCloseTo(knownIV, 3);
});

test("solveIVFromQuote returns null for wide spreads", () => {
	expect(solveIVFromQuote(1, 3, 100, 100, 30 / 365, "CALL")).toBeNull();
});

test("solveIVFromQuote returns null for zero or invalid bid", () => {
	expect(solveIVFromQuote(0, 1, 100, 100, 30 / 365, "CALL")).toBeNull();
	expect(solveIVFromQuote(-1, 1, 100, 100, 30 / 365, "CALL")).toBeNull();
});

test("parseOptionSymbol parses standard call OCC symbol", () => {
	const parsed = parseOptionSymbol("AAPL240315C00172500");
	expect(parsed).not.toBeNull();
	expect(parsed?.root).toBe("AAPL");
	expect(parsed?.expiry).toBe("2024-03-15");
	expect(parsed?.type).toBe("CALL");
	expect(parsed?.strike).toBe(172.5);
});

test("parseOptionSymbol parses standard put OCC symbol", () => {
	const parsed = parseOptionSymbol("AAPL240315P00172500");
	expect(parsed).not.toBeNull();
	expect(parsed?.type).toBe("PUT");
	expect(parsed?.strike).toBe(172.5);
});

test("parseOptionSymbol parses long and single-letter roots", () => {
	expect(parseOptionSymbol("SPXW240327P04925000")?.root).toBe("SPXW");
	expect(parseOptionSymbol("X240315C00025000")?.root).toBe("X");
});

test("parseOptionSymbol parses fractional strike", () => {
	expect(parseOptionSymbol("AAPL240315C00172550")?.strike).toBe(172.55);
});

test("parseOptionSymbol rejects invalid symbols", () => {
	expect(parseOptionSymbol("AAPL")).toBeNull();
	expect(parseOptionSymbol("240315C00172500")).toBeNull();
});

test("buildOptionSymbol builds standard call symbol", () => {
	expect(buildOptionSymbol("AAPL", "2024-03-15", "CALL", 172.5)).toBe("AAPL240315C00172500");
});

test("buildOptionSymbol builds standard put symbol with uppercase root", () => {
	expect(buildOptionSymbol("aapl", "2024-03-15", "PUT", 172.5)).toBe("AAPL240315P00172500");
});

test("buildOptionSymbol supports Date expiry", () => {
	expect(buildOptionSymbol("AAPL", new Date("2024-03-15"), "CALL", 172.5)).toBe(
		"AAPL240315C00172500",
	);
});

test("buildOptionSymbol supports high and low strikes", () => {
	expect(buildOptionSymbol("SPX", "2024-03-27", "PUT", 4925)).toBe("SPX240327P04925000");
	expect(buildOptionSymbol("F", "2024-03-15", "CALL", 12.5)).toBe("F240315C00012500");
});

test("option symbol roundtrip parse(build(x)) equals x", () => {
	const original = { root: "AAPL", expiry: "2024-03-15", type: "CALL" as const, strike: 172.5 };
	const symbol = buildOptionSymbol(original.root, original.expiry, original.type, original.strike);
	const parsed = parseOptionSymbol(symbol);
	expect(parsed?.root).toBe(original.root);
	expect(parsed?.expiry).toBe(original.expiry);
	expect(parsed?.type).toBe(original.type);
	expect(parsed?.strike).toBe(original.strike);
});

test("timeToExpiry computes positive time for future date", () => {
	const futureDate = new Date();
	futureDate.setDate(futureDate.getDate() + 30);
	expect(timeToExpiry(futureDate)).toBeCloseTo(30 / 365.25, 2);
});

test("timeToExpiry returns zero for past date", () => {
	const pastDate = new Date();
	pastDate.setDate(pastDate.getDate() - 10);
	expect(timeToExpiry(pastDate)).toBe(0);
});

test("timeToExpiry accepts string date", () => {
	const futureDate = new Date();
	futureDate.setDate(futureDate.getDate() + 30);
	expect(timeToExpiry(futureDate.toISOString().slice(0, 10))).toBeGreaterThan(0);
});

test("timeToExpiry is approximately one year for 365 days", () => {
	const futureDate = new Date();
	futureDate.setDate(futureDate.getDate() + 365);
	expect(timeToExpiry(futureDate)).toBeCloseTo(1, 1);
});
