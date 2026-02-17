import { expect } from "bun:test";

import type { OptionPosition } from "./greeks";

export function createPosition(overrides: Partial<OptionPosition> = {}): OptionPosition {
	return {
		symbol: "AAPL",
		contracts: 10,
		strike: 150,
		underlyingPrice: 150,
		timeToExpiration: 30 / 365,
		impliedVolatility: 0.25,
		optionType: "CALL",
		multiplier: 100,
		riskFreeRate: 0.05,
		...overrides,
	};
}

export function createRealisticPortfolio(): OptionPosition[] {
	return [
		createPosition({
			symbol: "AAPL",
			contracts: 10,
			strike: 150,
			underlyingPrice: 155,
			timeToExpiration: 30 / 365,
			impliedVolatility: 0.25,
			optionType: "CALL",
		}),
		createPosition({
			symbol: "AAPL",
			contracts: -5,
			strike: 145,
			underlyingPrice: 155,
			timeToExpiration: 30 / 365,
			impliedVolatility: 0.28,
			optionType: "PUT",
		}),
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
}

export function expectApprox(actual: number, expected: number, tolerance = 0.01): void {
	expect(Math.abs(actual - expected)).toBeLessThan(tolerance);
}
