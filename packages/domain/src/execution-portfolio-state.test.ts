import { describe, expect, test } from "bun:test";
import { PortfolioStateSchema } from "./execution";

const validAccountState = {
	accountId: "ACC-001",
	equity: 100000.0,
	buyingPower: 50000.0,
	marginUsed: 25000.0,
	dayTradeCount: 2,
	isPdtRestricted: false,
	asOf: "2026-01-05T10:00:00Z",
};

const validPosition = {
	instrument: {
		instrumentId: "AAPL",
		instrumentType: "EQUITY" as const,
	},
	quantity: 100,
	avgEntryPrice: 150.0,
	marketValue: 18000.0,
	unrealizedPnl: 3000.0,
	unrealizedPnlPct: 20.0,
	costBasis: 15000.0,
};

const validPortfolioState = {
	account: validAccountState,
	positions: [validPosition],
	totalMarketValue: 118000.0,
	grossExposure: 18000.0,
	netExposure: 18000.0,
	asOf: "2026-01-05T10:00:00Z",
};

describe("PortfolioStateSchema valid cases", () => {
	test("accepts valid portfolio state", () => {
		const result = PortfolioStateSchema.safeParse(validPortfolioState);
		expect(result.success).toBe(true);
	});

	test("accepts empty positions array", () => {
		const result = PortfolioStateSchema.safeParse({
			...validPortfolioState,
			positions: [],
			grossExposure: 0,
			netExposure: 0,
		});
		expect(result.success).toBe(true);
	});

	test("accepts negative net exposure (short positions)", () => {
		const result = PortfolioStateSchema.safeParse({
			...validPortfolioState,
			netExposure: -5000.0,
		});
		expect(result.success).toBe(true);
	});

	test("rejects negative gross exposure", () => {
		const result = PortfolioStateSchema.safeParse({
			...validPortfolioState,
			grossExposure: -100.0,
		});
		expect(result.success).toBe(false);
	});
});

describe("PortfolioStateSchema required fields", () => {
	test("requires account state", () => {
		const { account: _, ...invalid } = validPortfolioState;
		const result = PortfolioStateSchema.safeParse(invalid);
		expect(result.success).toBe(false);
	});

	test("requires positions array", () => {
		const { positions: _, ...invalid } = validPortfolioState;
		const result = PortfolioStateSchema.safeParse(invalid);
		expect(result.success).toBe(false);
	});
});
