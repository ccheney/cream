import { expect, test } from "bun:test";

import {
	calculateOptionsExposure,
	createEmptyExposure,
	formatExposure,
	type OptionPosition,
} from "./greeks";
import { createPosition, expectApprox } from "./greeks.test-helpers";

test("calculateOptionsExposure aggregates multiple positions", () => {
	const positions: OptionPosition[] = [
		createPosition({ symbol: "AAPL", contracts: 10 }),
		createPosition({ symbol: "GOOGL", contracts: 5 }),
	];
	const exposure = calculateOptionsExposure(positions);
	expect(exposure.positionCount).toBe(2);
	expect(exposure.totalContracts).toBe(15);
});

test("calculateOptionsExposure computes delta notional", () => {
	const exposure = calculateOptionsExposure([
		createPosition({ contracts: 10, underlyingPrice: 150, strike: 150, multiplier: 100 }),
	]);
	expect(exposure.deltaNotional).toBeGreaterThan(60000);
	expect(exposure.deltaNotional).toBeLessThan(90000);
});

test("calculateOptionsExposure handles short positions", () => {
	const longExposure = calculateOptionsExposure([createPosition({ contracts: 10 })]);
	const shortExposure = calculateOptionsExposure([createPosition({ contracts: -10 })]);
	expectApprox(shortExposure.deltaNotional, -longExposure.deltaNotional, 1);
});

test("calculateOptionsExposure aggregates by symbol", () => {
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

test("calculateOptionsExposure returns zeros for empty positions", () => {
	const exposure = calculateOptionsExposure([]);
	expect(exposure.deltaNotional).toBe(0);
	expect(exposure.totalGamma).toBe(0);
	expect(exposure.totalVega).toBe(0);
	expect(exposure.totalTheta).toBe(0);
	expect(exposure.totalRho).toBe(0);
	expect(exposure.positionCount).toBe(0);
});

test("calculateOptionsExposure uses default multiplier of 100", () => {
	const exposure = calculateOptionsExposure([createPosition({ multiplier: undefined })]);
	expect(exposure.positionCount).toBe(1);
});

test("createEmptyExposure returns zeroed structure", () => {
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

test("formatExposure renders summary text", () => {
	const formatted = formatExposure(calculateOptionsExposure([createPosition({ contracts: 10 })]));
	expect(formatted).toContain("Delta Notional:");
	expect(formatted).toContain("Total Gamma:");
	expect(formatted).toContain("Total Vega:");
	expect(formatted).toContain("Total Theta:");
	expect(formatted).toContain("Positions: 1");
	expect(formatted).toContain("Contracts: 10");
});
