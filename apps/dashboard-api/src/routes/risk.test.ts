import { describe, expect, it, mock, spyOn } from "bun:test";
import { Hono } from "hono";
import * as db from "../db";

type ExposureResponse = {
	gross: number;
	net: number;
	long: number;
	short: number;
};

type GreeksResponse = {
	delta: { current: number };
	gamma: { current: number };
	vega: { current: number };
	byPosition: Array<{ symbol: string }>;
};

// Mock system state
mock.module("./system", () => ({
	systemState: { environment: "PAPER" },
	getCurrentEnvironment: () => "PAPER",
}));

// Mock marketdata to avoid loading real clients
mock.module("@cream/marketdata", () => ({
	createAlpacaClientFromEnv: () => ({
		getOptionSnapshots: mock(() => Promise.resolve(new Map())),
		getSnapshots: mock(() => Promise.resolve(new Map())),
	}),
	parseOptionTicker: () => undefined,
	isAlpacaConfigured: () => false,
}));

// Mock routes/system for portfolio service
mock.module("../routes/system", () => ({
	getCurrentEnvironment: () => "PAPER",
}));

// Import after mocks are set up
const { portfolioService } = await import("../services/portfolio");
const { riskRoutes } = await import("./risk");

describe("Risk Routes", () => {
	const app = new Hono();
	app.route("/", riskRoutes);

	it("GET /exposure returns 200 with metrics", async () => {
		// Mock DB
		const mockPositionsRepo = {
			findOpen: mock(() =>
				Promise.resolve([
					{
						symbol: "AAPL",
						side: "LONG",
						quantity: 10,
						marketValue: 1500,
						costBasis: 1400,
					},
				]),
			),
		};
		const mockSnapshotsRepo = {
			getLatest: mock(() => Promise.resolve({ nav: 100000 })),
		};

		spyOn(db, "getPositionsRepo").mockReturnValue(
			mockPositionsRepo as unknown as ReturnType<typeof db.getPositionsRepo>,
		);
		spyOn(db, "getPortfolioSnapshotsRepo").mockReturnValue(
			mockSnapshotsRepo as unknown as ReturnType<typeof db.getPortfolioSnapshotsRepo>,
		);

		const res = await app.request("/exposure");
		expect(res.status).toBe(200);

		const data = (await res.json()) as ExposureResponse;
		expect(data.gross).toBeDefined();
		expect(data.net).toBeDefined();
		expect(data.long).toBe(1500);
		expect(data.short).toBe(0);
	});

	it("GET /greeks returns 200 with summary", async () => {
		// Mock PortfolioService
		spyOn(portfolioService, "getOptionsPositions").mockResolvedValue([
			{
				contractSymbol: "AAPL240119C00150000",
				underlying: "AAPL",
				underlyingPrice: 150,
				expiration: "2024-01-19",
				strike: 150,
				right: "CALL",
				quantity: 10,
				avgCost: 5.0,
				currentPrice: 5.5,
				marketValue: 5500,
				unrealizedPnl: 500,
				unrealizedPnlPct: 10,
				greeks: { delta: 0.5, gamma: 0.05, theta: -0.1, vega: 0.2 },
			},
		]);

		const res = await app.request("/greeks");
		expect(res.status).toBe(200);

		const data = (await res.json()) as GreeksResponse;
		// Delta Notional = 0.5 (delta) * 150 (price) * 100 (mult) * 10 (qty) = 75000
		expect(data.delta.current).toBe(75000);
		// Gamma = 0.05 * 100 * 10 = 50
		expect(data.gamma.current).toBe(50);
		// Vega = 0.2 * 100 * 10 = 200
		expect(data.vega.current).toBe(200);

		expect(data.byPosition).toHaveLength(1);
		const firstPosition = data.byPosition[0];
		if (!firstPosition) {
			throw new Error("Expected byPosition entry");
		}
		expect(firstPosition.symbol).toBe("AAPL240119C00150000");
	});
});
