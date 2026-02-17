import { expect, test } from "bun:test";

import { calculateOptionsExposure } from "./greeks";
import { createPosition, createRealisticPortfolio } from "./greeks.test-helpers";

test("calculateOptionsExposure handles realistic portfolio", () => {
	const exposure = calculateOptionsExposure(createRealisticPortfolio());
	expect(exposure.positionCount).toBe(3);
	expect(exposure.totalContracts).toBe(18);
	expect(exposure.bySymbol.size).toBe(2);
	expect(exposure.deltaNotional).toBeGreaterThan(0);
	expect(exposure.totalTheta).toBeLessThan(0);
});

test("calculateOptionsExposure keeps non-delta greeks in delta-hedged style setup", () => {
	const callPosition = createPosition({
		contracts: 10,
		strike: 150,
		underlyingPrice: 150,
		optionType: "CALL",
	});
	const exposure = calculateOptionsExposure([callPosition]);
	expect(exposure.totalGamma).toBeGreaterThan(0);
	expect(exposure.totalVega).toBeGreaterThan(0);
	expect(exposure.totalTheta).toBeLessThan(0);
	expect(Math.abs(exposure.deltaNotional)).toBeGreaterThan(0);
});
