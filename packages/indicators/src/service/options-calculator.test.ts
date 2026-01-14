/**
 * Tests for OptionsCalculatorAdapter
 *
 * Tests the simplified OptionsCalculator interface that fetches
 * pre-calculated options indicators from a provider.
 *
 * Note: For tests of the actual options calculations (IV skew, PCR, VRP, etc.),
 * see the calculator tests in calculators/options/*.test.ts
 */

import { describe, expect, test } from "bun:test";
import type { OptionsDataProvider } from "./indicator-service";
import { createOptionsCalculator, OptionsCalculatorAdapter } from "./options-calculator";

// ============================================================
// Test Fixtures
// ============================================================

/**
 * Create a mock OptionsDataProvider with configurable return values
 */
function createMockProvider(options: {
	impliedVolatility?: number | null;
	ivSkew?: number | null;
	putCallRatio?: number | null;
}): OptionsDataProvider {
	return {
		async getImpliedVolatility() {
			return options.impliedVolatility ?? null;
		},
		async getIVSkew() {
			return options.ivSkew ?? null;
		},
		async getPutCallRatio() {
			return options.putCallRatio ?? null;
		},
	};
}

// ============================================================
// Tests
// ============================================================

describe("OptionsCalculatorAdapter", () => {
	describe("basic functionality", () => {
		test("returns null values when provider returns all nulls", async () => {
			const provider = createMockProvider({});
			const calculator = new OptionsCalculatorAdapter();

			const result = await calculator.calculate("AAPL", provider);

			expect(result.atm_iv).toBeNull();
			expect(result.iv_skew_25d).toBeNull();
			expect(result.put_call_ratio_volume).toBeNull();
		});

		test("returns ATM IV from provider", async () => {
			const provider = createMockProvider({ impliedVolatility: 0.25 });
			const calculator = new OptionsCalculatorAdapter();

			const result = await calculator.calculate("AAPL", provider);

			expect(result.atm_iv).toBe(0.25);
		});

		test("returns IV skew from provider", async () => {
			const provider = createMockProvider({ ivSkew: 0.03 });
			const calculator = new OptionsCalculatorAdapter();

			const result = await calculator.calculate("AAPL", provider);

			expect(result.iv_skew_25d).toBe(0.03);
		});

		test("returns put/call ratio from provider", async () => {
			const provider = createMockProvider({ putCallRatio: 0.85 });
			const calculator = new OptionsCalculatorAdapter();

			const result = await calculator.calculate("AAPL", provider);

			expect(result.put_call_ratio_volume).toBe(0.85);
		});

		test("returns all indicators when provider has data", async () => {
			const provider = createMockProvider({
				impliedVolatility: 0.3,
				ivSkew: 0.05,
				putCallRatio: 1.2,
			});
			const calculator = new OptionsCalculatorAdapter();

			const result = await calculator.calculate("AAPL", provider);

			expect(result.atm_iv).toBe(0.3);
			expect(result.iv_skew_25d).toBe(0.05);
			expect(result.put_call_ratio_volume).toBe(1.2);
		});
	});

	describe("null handling", () => {
		test("handles mixed null and non-null values", async () => {
			const provider = createMockProvider({
				impliedVolatility: 0.28,
				ivSkew: null,
				putCallRatio: 0.95,
			});
			const calculator = new OptionsCalculatorAdapter();

			const result = await calculator.calculate("TEST", provider);

			expect(result.atm_iv).toBe(0.28);
			expect(result.iv_skew_25d).toBeNull();
			expect(result.put_call_ratio_volume).toBe(0.95);
		});
	});

	describe("fields not provided by simple provider", () => {
		test("returns null for fields requiring raw options chain data", async () => {
			const provider = createMockProvider({
				impliedVolatility: 0.25,
				ivSkew: 0.03,
				putCallRatio: 0.85,
			});
			const calculator = new OptionsCalculatorAdapter();

			const result = await calculator.calculate("AAPL", provider);

			// These fields require raw options chain data
			expect(result.iv_put_25d).toBeNull();
			expect(result.iv_call_25d).toBeNull();
			expect(result.put_call_ratio_oi).toBeNull();
			expect(result.term_structure_slope).toBeNull();
			expect(result.front_month_iv).toBeNull();
			expect(result.back_month_iv).toBeNull();
			expect(result.vrp).toBeNull();
			expect(result.realized_vol_20d).toBeNull();
			expect(result.net_delta).toBeNull();
			expect(result.net_gamma).toBeNull();
			expect(result.net_theta).toBeNull();
			expect(result.net_vega).toBeNull();
		});
	});

	describe("factory function", () => {
		test("createOptionsCalculator returns an OptionsCalculatorAdapter", () => {
			const calculator = createOptionsCalculator();
			expect(calculator).toBeInstanceOf(OptionsCalculatorAdapter);
		});
	});

	describe("concurrent provider calls", () => {
		test("fetches all indicators in parallel", async () => {
			let callCount = 0;
			const provider: OptionsDataProvider = {
				async getImpliedVolatility() {
					callCount++;
					return 0.25;
				},
				async getIVSkew() {
					callCount++;
					return 0.03;
				},
				async getPutCallRatio() {
					callCount++;
					return 0.85;
				},
			};

			const calculator = new OptionsCalculatorAdapter();
			const result = await calculator.calculate("AAPL", provider);

			// All three methods should be called
			expect(callCount).toBe(3);
			expect(result.atm_iv).toBe(0.25);
			expect(result.iv_skew_25d).toBe(0.03);
			expect(result.put_call_ratio_volume).toBe(0.85);
		});
	});
});
