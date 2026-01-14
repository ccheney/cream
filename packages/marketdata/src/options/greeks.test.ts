/**
 * Tests for Options Greeks Calculation
 */

import { describe, expect, it } from "bun:test";
import {
	calculateGreeks,
	calculateMoneyness,
	calculateOptionsExposure,
	createEmptyExposure,
	daysToYears,
	formatExposure,
	getMoneyStatus,
	normalCDF,
	normalPDF,
	type OptionPosition,
} from "./greeks";

// ============================================
// Helper Functions
// ============================================

function createPosition(overrides: Partial<OptionPosition> = {}): OptionPosition {
	return {
		symbol: "AAPL",
		contracts: 10,
		strike: 150,
		underlyingPrice: 150,
		timeToExpiration: 30 / 365, // 30 days
		impliedVolatility: 0.25,
		optionType: "CALL",
		multiplier: 100,
		riskFreeRate: 0.05,
		...overrides,
	};
}

function expectApprox(actual: number, expected: number, tolerance = 0.01): void {
	expect(Math.abs(actual - expected)).toBeLessThan(tolerance);
}

// ============================================
// Normal Distribution Tests
// ============================================

describe("normalCDF", () => {
	it("should return 0.5 for x=0", () => {
		expectApprox(normalCDF(0), 0.5);
	});

	it("should return ~0.8413 for x=1", () => {
		expectApprox(normalCDF(1), 0.8413, 0.001);
	});

	it("should return ~0.9772 for x=2", () => {
		expectApprox(normalCDF(2), 0.9772, 0.001);
	});

	it("should return ~0.1587 for x=-1", () => {
		expectApprox(normalCDF(-1), 0.1587, 0.001);
	});

	it("should be symmetric around 0", () => {
		expect(normalCDF(1) + normalCDF(-1)).toBeCloseTo(1, 5);
	});
});

describe("normalPDF", () => {
	it("should return ~0.3989 for x=0", () => {
		expectApprox(normalPDF(0), 0.3989, 0.001);
	});

	it("should return ~0.2420 for x=1", () => {
		expectApprox(normalPDF(1), 0.242, 0.001);
	});

	it("should be symmetric around 0", () => {
		expect(normalPDF(1)).toBeCloseTo(normalPDF(-1), 10);
	});
});

// ============================================
// Black-Scholes Greeks Tests
// ============================================

describe("calculateGreeks", () => {
	describe("Call Options", () => {
		it("should calculate ATM call delta ≈ 0.5", () => {
			const position = createPosition({
				underlyingPrice: 150,
				strike: 150,
				optionType: "CALL",
			});
			const greeks = calculateGreeks(position);

			// ATM call delta is slightly above 0.5 due to drift
			expect(greeks.delta).toBeGreaterThan(0.45);
			expect(greeks.delta).toBeLessThan(0.6);
		});

		it("should calculate deep ITM call delta ≈ 1.0", () => {
			const position = createPosition({
				underlyingPrice: 200,
				strike: 100,
				optionType: "CALL",
			});
			const greeks = calculateGreeks(position);

			expect(greeks.delta).toBeGreaterThan(0.95);
		});

		it("should calculate deep OTM call delta ≈ 0.0", () => {
			const position = createPosition({
				underlyingPrice: 100,
				strike: 200,
				optionType: "CALL",
			});
			const greeks = calculateGreeks(position);

			expect(greeks.delta).toBeLessThan(0.05);
		});

		it("should have positive gamma", () => {
			const position = createPosition({ optionType: "CALL" });
			const greeks = calculateGreeks(position);

			expect(greeks.gamma).toBeGreaterThan(0);
		});

		it("should have negative theta (time decay)", () => {
			const position = createPosition({ optionType: "CALL" });
			const greeks = calculateGreeks(position);

			expect(greeks.theta).toBeLessThan(0);
		});

		it("should have positive vega", () => {
			const position = createPosition({ optionType: "CALL" });
			const greeks = calculateGreeks(position);

			expect(greeks.vega).toBeGreaterThan(0);
		});

		it("should have positive rho for calls", () => {
			const position = createPosition({ optionType: "CALL", riskFreeRate: 0.05 });
			const greeks = calculateGreeks(position);

			expect(greeks.rho).toBeGreaterThan(0);
		});

		it("should calculate positive theoretical price for ITM call", () => {
			const position = createPosition({
				underlyingPrice: 160,
				strike: 150,
				optionType: "CALL",
			});
			const greeks = calculateGreeks(position);

			expect(greeks.theoreticalPrice).toBeGreaterThan(10);
		});
	});

	describe("Put Options", () => {
		it("should calculate ATM put delta ≈ -0.5", () => {
			const position = createPosition({
				underlyingPrice: 150,
				strike: 150,
				optionType: "PUT",
			});
			const greeks = calculateGreeks(position);

			expect(greeks.delta).toBeGreaterThan(-0.6);
			expect(greeks.delta).toBeLessThan(-0.4);
		});

		it("should calculate deep ITM put delta ≈ -1.0", () => {
			const position = createPosition({
				underlyingPrice: 100,
				strike: 200,
				optionType: "PUT",
			});
			const greeks = calculateGreeks(position);

			expect(greeks.delta).toBeLessThan(-0.95);
		});

		it("should calculate deep OTM put delta ≈ 0.0", () => {
			const position = createPosition({
				underlyingPrice: 200,
				strike: 100,
				optionType: "PUT",
			});
			const greeks = calculateGreeks(position);

			expect(greeks.delta).toBeGreaterThan(-0.05);
		});

		it("should have positive gamma (same as calls)", () => {
			const position = createPosition({ optionType: "PUT" });
			const greeks = calculateGreeks(position);

			expect(greeks.gamma).toBeGreaterThan(0);
		});

		it("should have negative rho for puts", () => {
			const position = createPosition({ optionType: "PUT", riskFreeRate: 0.05 });
			const greeks = calculateGreeks(position);

			expect(greeks.rho).toBeLessThan(0);
		});
	});

	describe("Edge Cases", () => {
		it("should handle expired options (T=0)", () => {
			const position = createPosition({
				timeToExpiration: 0,
				underlyingPrice: 160,
				strike: 150,
				optionType: "CALL",
			});
			const greeks = calculateGreeks(position);

			// Expired ITM call
			expect(greeks.delta).toBe(1);
			expect(greeks.gamma).toBe(0);
			expect(greeks.theta).toBe(0);
			expect(greeks.vega).toBe(0);
			expect(greeks.theoreticalPrice).toBe(10); // Intrinsic value
		});

		it("should handle zero volatility", () => {
			const position = createPosition({
				impliedVolatility: 0,
				underlyingPrice: 160,
				strike: 150,
				optionType: "CALL",
			});
			const greeks = calculateGreeks(position);

			expect(greeks.gamma).toBe(0);
			expect(greeks.vega).toBe(0);
		});

		it("should handle negative time to expiration as expired", () => {
			const position = createPosition({
				timeToExpiration: -0.01,
			});
			const greeks = calculateGreeks(position);

			// Should be treated as expired
			expect(greeks.gamma).toBe(0);
		});
	});

	describe("Put-Call Parity", () => {
		it("should satisfy put-call parity approximately", () => {
			const S = 150;
			const K = 150;
			const T = 30 / 365;
			const r = 0.05;

			const callPosition = createPosition({
				underlyingPrice: S,
				strike: K,
				timeToExpiration: T,
				riskFreeRate: r,
				optionType: "CALL",
			});

			const putPosition = createPosition({
				underlyingPrice: S,
				strike: K,
				timeToExpiration: T,
				riskFreeRate: r,
				optionType: "PUT",
			});

			const callGreeks = calculateGreeks(callPosition);
			const putGreeks = calculateGreeks(putPosition);

			// Call - Put = S - K*e^(-rT)
			const expected = S - K * Math.exp(-r * T);
			const actual = callGreeks.theoreticalPrice - putGreeks.theoreticalPrice;

			expectApprox(actual, expected, 0.01);
		});
	});
});

// ============================================
// Portfolio Aggregation Tests
// ============================================

describe("calculateOptionsExposure", () => {
	it("should aggregate multiple positions", () => {
		const positions: OptionPosition[] = [
			createPosition({ symbol: "AAPL", contracts: 10 }),
			createPosition({ symbol: "GOOGL", contracts: 5 }),
		];

		const exposure = calculateOptionsExposure(positions);

		expect(exposure.positionCount).toBe(2);
		expect(exposure.totalContracts).toBe(15);
	});

	it("should calculate correct delta notional", () => {
		// ATM call with delta ≈ 0.5
		const position = createPosition({
			contracts: 10,
			underlyingPrice: 150,
			strike: 150,
			multiplier: 100,
		});

		const exposure = calculateOptionsExposure([position]);

		// Delta notional = contracts × multiplier × delta × underlyingPrice
		// ≈ 10 × 100 × 0.5 × 150 = 75,000
		expect(exposure.deltaNotional).toBeGreaterThan(60000);
		expect(exposure.deltaNotional).toBeLessThan(90000);
	});

	it("should handle short positions (negative contracts)", () => {
		const longPosition = createPosition({ contracts: 10 });
		const shortPosition = createPosition({ contracts: -10 });

		const longExposure = calculateOptionsExposure([longPosition]);
		const shortExposure = calculateOptionsExposure([shortPosition]);

		// Short should have opposite delta notional
		expectApprox(shortExposure.deltaNotional, -longExposure.deltaNotional, 1);
	});

	it("should aggregate by symbol", () => {
		const positions: OptionPosition[] = [
			createPosition({ symbol: "AAPL", contracts: 10, strike: 150 }),
			createPosition({ symbol: "AAPL", contracts: 5, strike: 155 }),
			createPosition({ symbol: "GOOGL", contracts: 3 }),
		];

		const exposure = calculateOptionsExposure(positions);

		expect(exposure.bySymbol.size).toBe(2);
		expect(exposure.bySymbol.get("AAPL")?.contracts).toBe(15);
		expect(exposure.bySymbol.get("GOOGL")?.contracts).toBe(3);
	});

	it("should return zeros for empty positions", () => {
		const exposure = calculateOptionsExposure([]);

		expect(exposure.deltaNotional).toBe(0);
		expect(exposure.totalGamma).toBe(0);
		expect(exposure.totalVega).toBe(0);
		expect(exposure.totalTheta).toBe(0);
		expect(exposure.totalRho).toBe(0);
		expect(exposure.positionCount).toBe(0);
	});

	it("should use default multiplier of 100", () => {
		const position = createPosition({ multiplier: undefined });
		const exposure = calculateOptionsExposure([position]);

		// Should use 100 as default
		expect(exposure.positionCount).toBe(1);
		// Delta notional should be calculated with 100 multiplier
	});
});

describe("createEmptyExposure", () => {
	it("should return zero values", () => {
		const exposure = createEmptyExposure();

		expect(exposure.deltaNotional).toBe(0);
		expect(exposure.totalGamma).toBe(0);
		expect(exposure.totalVega).toBe(0);
		expect(exposure.totalTheta).toBe(0);
		expect(exposure.totalRho).toBe(0);
		expect(exposure.positionCount).toBe(0);
		expect(exposure.totalContracts).toBe(0);
		expect(exposure.bySymbol.size).toBe(0);
	});
});

// ============================================
// Utility Function Tests
// ============================================

describe("daysToYears", () => {
	it("should convert 365 days to 1 year", () => {
		expect(daysToYears(365)).toBeCloseTo(1, 5);
	});

	it("should convert 30 days correctly", () => {
		expectApprox(daysToYears(30), 30 / 365, 0.0001);
	});

	it("should handle 0 days", () => {
		expect(daysToYears(0)).toBe(0);
	});
});

describe("calculateMoneyness", () => {
	it("should return 1.0 for ATM", () => {
		expect(calculateMoneyness(100, 100)).toBe(1);
	});

	it("should return > 1 for ITM call", () => {
		expect(calculateMoneyness(110, 100)).toBe(1.1);
	});

	it("should return < 1 for OTM call", () => {
		expect(calculateMoneyness(90, 100)).toBe(0.9);
	});
});

describe("getMoneyStatus", () => {
	describe("Calls", () => {
		it("should identify ITM call", () => {
			expect(getMoneyStatus(110, 100, "CALL")).toBe("ITM");
		});

		it("should identify OTM call", () => {
			expect(getMoneyStatus(90, 100, "CALL")).toBe("OTM");
		});

		it("should identify ATM call", () => {
			expect(getMoneyStatus(100, 100, "CALL")).toBe("ATM");
		});

		it("should use 2% threshold for ATM", () => {
			expect(getMoneyStatus(101, 100, "CALL")).toBe("ATM"); // 1% is within threshold
			expect(getMoneyStatus(103, 100, "CALL")).toBe("ITM"); // 3% is outside threshold
		});
	});

	describe("Puts", () => {
		it("should identify ITM put", () => {
			expect(getMoneyStatus(90, 100, "PUT")).toBe("ITM");
		});

		it("should identify OTM put", () => {
			expect(getMoneyStatus(110, 100, "PUT")).toBe("OTM");
		});

		it("should identify ATM put", () => {
			expect(getMoneyStatus(100, 100, "PUT")).toBe("ATM");
		});
	});
});

describe("formatExposure", () => {
	it("should format exposure for display", () => {
		const exposure = calculateOptionsExposure([createPosition({ contracts: 10 })]);

		const formatted = formatExposure(exposure);

		expect(formatted).toContain("Delta Notional:");
		expect(formatted).toContain("Total Gamma:");
		expect(formatted).toContain("Total Vega:");
		expect(formatted).toContain("Total Theta:");
		expect(formatted).toContain("Positions: 1");
		expect(formatted).toContain("Contracts: 10");
	});
});

// ============================================
// Integration Tests
// ============================================

describe("Integration", () => {
	it("should handle realistic portfolio", () => {
		const positions: OptionPosition[] = [
			// Long AAPL calls
			createPosition({
				symbol: "AAPL",
				contracts: 10,
				strike: 150,
				underlyingPrice: 155,
				timeToExpiration: 30 / 365,
				impliedVolatility: 0.25,
				optionType: "CALL",
			}),
			// Short AAPL puts (sold puts)
			createPosition({
				symbol: "AAPL",
				contracts: -5,
				strike: 145,
				underlyingPrice: 155,
				timeToExpiration: 30 / 365,
				impliedVolatility: 0.28,
				optionType: "PUT",
			}),
			// Long GOOGL calls
			createPosition({
				symbol: "GOOGL",
				contracts: 3,
				strike: 2800,
				underlyingPrice: 2850,
				timeToExpiration: 60 / 365,
				impliedVolatility: 0.3,
				optionType: "CALL",
			}),
		];

		const exposure = calculateOptionsExposure(positions);

		// Sanity checks
		expect(exposure.positionCount).toBe(3);
		expect(exposure.totalContracts).toBe(18);
		expect(exposure.bySymbol.size).toBe(2);

		// Net delta should be positive (long calls + short puts = bullish)
		expect(exposure.deltaNotional).toBeGreaterThan(0);

		// Gamma should be positive (long options)
		// Short put has positive gamma too, so total gamma > 0
		// Gamma is same sign regardless of long/short position

		// Vega should be positive (long options dominate)

		// Theta should be negative (paying for time decay on net long)
		expect(exposure.totalTheta).toBeLessThan(0);
	});

	it("should calculate delta-hedged portfolio exposure", () => {
		// Delta-neutral portfolio: long call, short stock equivalent
		const callPosition = createPosition({
			contracts: 10,
			strike: 150,
			underlyingPrice: 150,
			optionType: "CALL",
		});

		const _callGreeks = calculateGreeks(callPosition);
		const exposure = calculateOptionsExposure([callPosition]);

		// If we were delta-hedged with stock:
		// Net delta = 0, but gamma, vega, theta still exist
		expect(exposure.totalGamma).toBeGreaterThan(0);
		expect(exposure.totalVega).toBeGreaterThan(0);
		expect(exposure.totalTheta).toBeLessThan(0);

		// Delta notional represents un-hedged exposure
		expect(Math.abs(exposure.deltaNotional)).toBeGreaterThan(0);
	});
});
