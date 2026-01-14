/**
 * IV Solver Tests
 *
 * Tests for implied volatility calculation using Newton-Raphson with bisection fallback.
 *
 * Test cases derived from:
 * - Hull, J.C. (2018). Options, Futures, and Other Derivatives
 * - Known Black-Scholes solutions
 * - Edge cases from production experience
 *
 * @see https://medium.com/hypervolatility/extracting-implied-volatility-newton-raphson-secant-and-bisection-approaches-fae83c779e56
 * @see https://www.quantstart.com/articles/Implied-Volatility-in-C-using-Template-Functions-and-Newton-Raphson/
 */

import { describe, expect, test } from "bun:test";
import { calculateGreeks } from "./greeks";
import {
	buildOptionSymbol,
	parseOptionSymbol,
	solveIV,
	solveIVFromQuote,
	timeToExpiry,
} from "./ivSolver";

// ============================================================
// TEST HELPERS
// ============================================================

/**
 * Calculate Black-Scholes price for verification.
 * Uses our existing Greeks calculator which includes theoretical price.
 */
function blackScholesPrice(
	S: number,
	K: number,
	T: number,
	r: number,
	sigma: number,
	optionType: "CALL" | "PUT"
): number {
	const greeks = calculateGreeks({
		symbol: "TEST",
		contracts: 1,
		strike: K,
		underlyingPrice: S,
		timeToExpiration: T,
		impliedVolatility: sigma,
		optionType,
		riskFreeRate: r,
	});
	return greeks.theoreticalPrice;
}

// ============================================================
// CORE IV SOLVER TESTS
// ============================================================

describe("solveIV", () => {
	describe("ATM options (near 50 delta)", () => {
		test("ATM call - typical market conditions", () => {
			// S=100, K=100, T=30 days, r=5%, known IV=25%
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

		test("ATM put - typical market conditions", () => {
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

		test("ATM call - high volatility (60%)", () => {
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

		test("ATM call - low volatility (10%)", () => {
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
	});

	describe("OTM options (25 delta region)", () => {
		test("OTM call - 10% out of the money", () => {
			// S=100, K=110, T=30 days
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

		test("OTM put - 10% out of the money", () => {
			// S=100, K=90, T=30 days
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
	});

	describe("ITM options", () => {
		test("ITM call - 10% in the money", () => {
			// S=100, K=90, T=30 days
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

		test("ITM put - 10% in the money", () => {
			// S=100, K=110, T=30 days
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
	});

	describe("different time horizons", () => {
		test("short-dated option (7 days)", () => {
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

		test("long-dated option (180 days)", () => {
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

		test("LEAPS (365 days)", () => {
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
	});

	describe("edge cases", () => {
		test("expired option (T=0) returns IV=0", () => {
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

		test("zero price returns minimum IV", () => {
			const result = solveIV({
				optionPrice: 0,
				underlyingPrice: 100,
				strike: 100,
				timeToExpiration: 30 / 365,
				optionType: "CALL",
			});

			expect(result.impliedVolatility).toBe(0.001);
		});

		test("price below intrinsic value returns minimum IV (bad data)", () => {
			// ITM call with intrinsic value of $10, but price is $5
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

		test("very high IV (100%+) converges", () => {
			const T = 30 / 365;
			const knownIV = 1.5; // 150%
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

		test("deep OTM option (20%+ away)", () => {
			// Deep OTM call - this is where Newton-Raphson can struggle
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

			// May not converge perfectly for very deep OTM, but should be reasonable
			expect(result.impliedVolatility).toBeGreaterThan(0.1);
			expect(result.impliedVolatility).toBeLessThan(1.0);
		});
	});

	describe("real-world scenarios", () => {
		test("AAPL-like option ($175 stock, weekly)", () => {
			// Typical AAPL weekly option scenario
			const T = 5 / 365; // 5 days to expiry
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

		test("SPY-like option ($500 stock, monthly)", () => {
			// Typical SPY monthly option scenario
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

		test("high-IV stock (meme stock scenario)", () => {
			// High IV stock like GME/AMC
			const T = 14 / 365;
			const knownIV = 1.2; // 120% IV
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
	});
});

// ============================================================
// SOLVE IV FROM QUOTE TESTS
// ============================================================

describe("solveIVFromQuote", () => {
	test("calculates IV from bid/ask spread", () => {
		const T = 30 / 365;
		const knownIV = 0.25;
		const midPrice = blackScholesPrice(100, 100, T, 0.05, knownIV, "CALL");

		// Create bid/ask around mid
		const bidPrice = midPrice - 0.1;
		const askPrice = midPrice + 0.1;

		const iv = solveIVFromQuote(bidPrice, askPrice, 100, 100, T, "CALL", 0.05);

		expect(iv).not.toBeNull();
		expect(iv).toBeCloseTo(knownIV, 3);
	});

	test("returns null for wide spread (>50%)", () => {
		// Very wide spread - unreliable quote
		const iv = solveIVFromQuote(1.0, 3.0, 100, 100, 30 / 365, "CALL");

		expect(iv).toBeNull();
	});

	test("returns null for zero bid", () => {
		const iv = solveIVFromQuote(0, 1.0, 100, 100, 30 / 365, "CALL");

		expect(iv).toBeNull();
	});

	test("returns null for invalid prices", () => {
		const iv = solveIVFromQuote(-1, 1.0, 100, 100, 30 / 365, "CALL");

		expect(iv).toBeNull();
	});
});

// ============================================================
// OPTION SYMBOL PARSING TESTS
// ============================================================

describe("parseOptionSymbol", () => {
	test("parses standard OCC symbol - call", () => {
		const parsed = parseOptionSymbol("AAPL240315C00172500");

		expect(parsed).not.toBeNull();
		expect(parsed?.root).toBe("AAPL");
		expect(parsed?.expiry).toBe("2024-03-15");
		expect(parsed?.type).toBe("CALL");
		expect(parsed?.strike).toBe(172.5);
	});

	test("parses standard OCC symbol - put", () => {
		const parsed = parseOptionSymbol("AAPL240315P00172500");

		expect(parsed).not.toBeNull();
		expect(parsed?.root).toBe("AAPL");
		expect(parsed?.expiry).toBe("2024-03-15");
		expect(parsed?.type).toBe("PUT");
		expect(parsed?.strike).toBe(172.5);
	});

	test("parses SPX option (long root)", () => {
		const parsed = parseOptionSymbol("SPXW240327P04925000");

		expect(parsed).not.toBeNull();
		expect(parsed?.root).toBe("SPXW");
		expect(parsed?.expiry).toBe("2024-03-27");
		expect(parsed?.type).toBe("PUT");
		expect(parsed?.strike).toBe(4925);
	});

	test("parses single-letter root", () => {
		const parsed = parseOptionSymbol("X240315C00025000");

		expect(parsed).not.toBeNull();
		expect(parsed?.root).toBe("X");
		expect(parsed?.strike).toBe(25);
	});

	test("parses fractional strike", () => {
		const parsed = parseOptionSymbol("AAPL240315C00172550");

		expect(parsed).not.toBeNull();
		expect(parsed?.strike).toBe(172.55);
	});

	test("returns null for invalid symbol (too short)", () => {
		const parsed = parseOptionSymbol("AAPL");

		expect(parsed).toBeNull();
	});

	test("returns null for empty root", () => {
		const parsed = parseOptionSymbol("240315C00172500");

		expect(parsed).toBeNull();
	});
});

// ============================================================
// OPTION SYMBOL BUILDING TESTS
// ============================================================

describe("buildOptionSymbol", () => {
	test("builds standard OCC symbol - call", () => {
		const symbol = buildOptionSymbol("AAPL", "2024-03-15", "CALL", 172.5);

		expect(symbol).toBe("AAPL240315C00172500");
	});

	test("builds standard OCC symbol - put", () => {
		const symbol = buildOptionSymbol("aapl", "2024-03-15", "PUT", 172.5);

		expect(symbol).toBe("AAPL240315P00172500");
	});

	test("builds symbol from Date object", () => {
		const symbol = buildOptionSymbol("AAPL", new Date("2024-03-15"), "CALL", 172.5);

		expect(symbol).toBe("AAPL240315C00172500");
	});

	test("builds symbol with high strike", () => {
		const symbol = buildOptionSymbol("SPX", "2024-03-27", "PUT", 4925);

		expect(symbol).toBe("SPX240327P04925000");
	});

	test("builds symbol with low strike", () => {
		const symbol = buildOptionSymbol("F", "2024-03-15", "CALL", 12.5);

		expect(symbol).toBe("F240315C00012500");
	});

	test("roundtrip: parse(build(x)) = x", () => {
		const original = { root: "AAPL", expiry: "2024-03-15", type: "CALL" as const, strike: 172.5 };
		const symbol = buildOptionSymbol(
			original.root,
			original.expiry,
			original.type,
			original.strike
		);
		const parsed = parseOptionSymbol(symbol);

		expect(parsed?.root).toBe(original.root);
		expect(parsed?.expiry).toBe(original.expiry);
		expect(parsed?.type).toBe(original.type);
		expect(parsed?.strike).toBe(original.strike);
	});
});

// ============================================================
// TIME TO EXPIRY TESTS
// ============================================================

describe("timeToExpiry", () => {
	test("calculates time to future date", () => {
		const futureDate = new Date();
		futureDate.setDate(futureDate.getDate() + 30);

		const T = timeToExpiry(futureDate);

		// Should be approximately 30/365.25
		expect(T).toBeCloseTo(30 / 365.25, 2);
	});

	test("returns 0 for past date", () => {
		const pastDate = new Date();
		pastDate.setDate(pastDate.getDate() - 10);

		const T = timeToExpiry(pastDate);

		expect(T).toBe(0);
	});

	test("accepts string date", () => {
		const futureDate = new Date();
		futureDate.setDate(futureDate.getDate() + 30);
		const dateStr = futureDate.toISOString().slice(0, 10);

		const T = timeToExpiry(dateStr);

		expect(T).toBeGreaterThan(0);
	});

	test("returns approximately 1 for date 365 days out", () => {
		const futureDate = new Date();
		futureDate.setDate(futureDate.getDate() + 365);

		const T = timeToExpiry(futureDate);

		expect(T).toBeCloseTo(1, 1);
	});
});

// ============================================================
// CONVERGENCE VERIFICATION TESTS
// ============================================================

describe("convergence verification", () => {
	test("solver is consistent across multiple runs", () => {
		const T = 30 / 365;
		const optionPrice = blackScholesPrice(100, 100, T, 0.05, 0.25, "CALL");

		const results: number[] = [];
		for (let i = 0; i < 10; i++) {
			const result = solveIV({
				optionPrice,
				underlyingPrice: 100,
				strike: 100,
				timeToExpiration: T,
				optionType: "CALL",
				riskFreeRate: 0.05,
			});
			results.push(result.impliedVolatility);
		}

		// All results should be identical
		expect(results.length).toBe(10);
		const first = results[0]!;
		for (const iv of results) {
			expect(iv).toBe(first);
		}
	});

	test("different risk-free rates produce different IVs for same price", () => {
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
});
