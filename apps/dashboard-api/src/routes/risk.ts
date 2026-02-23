/**
 * Risk API Routes
 *
 * Routes for exposure, Greeks, VaR, and risk limits.
 * Returns real data from Alpaca positions + market data - NO mock data.
 *
 * Data Sources:
 * - Positions: Alpaca broker API (sole source of truth)
 * - Real-time prices: Alpaca/Polygon streaming
 * - Greeks: Alpaca Options Snapshot API
 * - Historical data: Polygon REST aggregates (for correlation/VaR)
 * - Limits: Config constraints
 *
 * Note: Does NOT require the Rust execution engine - that's for order routing only.
 *
 * @see docs/plans/ui/05-api-endpoints.md Risk section
 * @see docs/plans/ui/40-streaming-data-integration.md
 */

import { type Position as BrokerPosition, createAlpacaClient } from "@cream/broker";
import type { RuntimeConstraintsConfig } from "@cream/config";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getPortfolioSnapshotsRepo, getRuntimeConfigService } from "../db.js";
import { portfolioService } from "../services/portfolio.js";
import {
	type ConstraintsConfig,
	calculateExposure,
	calculateLimits,
	type ExposureLimits,
	getCorrelationMatrix,
	getVaRMetrics,
	type OptionsGreeksConstraints,
	type PositionForExposure,
} from "../services/risk/index.js";
import { getCurrentEnvironment } from "./system.js";

// ============================================
// App Setup
// ============================================

const app = new OpenAPIHono();

// ============================================
// Helpers
// ============================================

function isAlpacaConfigured(): boolean {
	return Boolean(Bun.env.ALPACA_KEY && Bun.env.ALPACA_SECRET);
}

async function getAlpacaPositions(): Promise<BrokerPosition[]> {
	if (!isAlpacaConfigured()) {
		throw new Error("ALPACA_KEY and ALPACA_SECRET must be configured for risk routes.");
	}

	const client = createAlpacaClient({
		apiKey: Bun.env.ALPACA_KEY as string,
		apiSecret: Bun.env.ALPACA_SECRET as string,
		environment: getCurrentEnvironment(),
	});

	return client.getPositions();
}

function mapToExposurePositions(positions: BrokerPosition[]): PositionForExposure[] {
	return positions.map((p) => ({
		symbol: p.symbol,
		side: (p.side === "long" ? "LONG" : "SHORT") as "LONG" | "SHORT",
		quantity: p.qty,
		marketValue: p.marketValue,
	}));
}

function resolveNav(latestSnapshot: { nav?: number } | null, positions: BrokerPosition[]): number {
	if (latestSnapshot?.nav && latestSnapshot.nav > 0) {
		return latestSnapshot.nav;
	}

	const navFromPositions = positions.reduce((sum, position) => sum + position.marketValue, 0);
	if (navFromPositions > 0) {
		return navFromPositions;
	}

	throw new Error("Unable to determine portfolio NAV from snapshots or broker positions.");
}

async function getRuntimeConstraints(): Promise<RuntimeConstraintsConfig> {
	const environment = getCurrentEnvironment();
	const runtimeConfigService = getRuntimeConfigService();
	const runtimeConfig = await runtimeConfigService.getActiveConfig(environment);
	return runtimeConfig.constraints;
}

function toExposureLimits(constraints: RuntimeConstraintsConfig, nav: number): ExposureLimits {
	return {
		maxGrossExposure: nav * constraints.portfolio.maxGrossExposure,
		maxNetExposure: nav * constraints.portfolio.maxNetExposure,
		maxConcentration: constraints.portfolio.maxConcentration,
	};
}

function toOptionsLimits(constraints: RuntimeConstraintsConfig): OptionsGreeksConstraints {
	return {
		max_delta_notional: constraints.options.maxDelta,
		max_gamma: constraints.options.maxGamma,
		max_vega: constraints.options.maxVega,
		max_theta: -Math.abs(constraints.options.maxTheta),
	};
}

function toLimitConstraints(constraints: RuntimeConstraintsConfig, nav: number): ConstraintsConfig {
	return {
		per_instrument: {
			max_units: constraints.perInstrument.maxShares,
			max_notional: constraints.perInstrument.maxNotional,
			max_pct_equity: constraints.perInstrument.maxPctEquity,
		},
		portfolio: {
			max_gross_notional: nav * constraints.portfolio.maxGrossExposure,
			max_net_notional: nav * constraints.portfolio.maxNetExposure,
			max_gross_pct_equity: constraints.portfolio.maxGrossExposure,
			max_net_pct_equity: constraints.portfolio.maxNetExposure,
		},
		options: toOptionsLimits(constraints),
	};
}

// ============================================
// Schema Definitions
// ============================================

const ExposureMetricsSchema = z.object({
	gross: z.object({
		current: z.number(),
		limit: z.number(),
		pct: z.number(),
	}),
	net: z.object({
		current: z.number(),
		limit: z.number(),
		pct: z.number(),
	}),
	long: z.number(),
	short: z.number(),
	concentrationMax: z.object({
		symbol: z.string(),
		pct: z.number(),
	}),
	sectorExposure: z.record(z.string(), z.number()),
});

const PositionGreeksSchema = z.object({
	symbol: z.string(),
	delta: z.number(),
	gamma: z.number(),
	vega: z.number(),
	theta: z.number(),
});

const GreeksSummarySchema = z.object({
	delta: z.object({ current: z.number(), limit: z.number() }),
	gamma: z.object({ current: z.number(), limit: z.number() }),
	vega: z.object({ current: z.number(), limit: z.number() }),
	theta: z.object({ current: z.number(), limit: z.number() }),
	byPosition: z.array(PositionGreeksSchema),
});

const CorrelationMatrixSchema = z.object({
	symbols: z.array(z.string()),
	matrix: z.array(z.array(z.number())),
	highCorrelationPairs: z.array(
		z.object({
			a: z.string(),
			b: z.string(),
			correlation: z.number(),
		}),
	),
});

const VaRMetricsSchema = z.object({
	oneDay95: z.number(),
	oneDay99: z.number(),
	tenDay95: z.number(),
	method: z.enum(["historical", "parametric"]),
});

const LimitStatusSchema = z.object({
	name: z.string(),
	category: z.enum(["per_instrument", "portfolio", "options"]),
	current: z.number(),
	limit: z.number(),
	utilization: z.number(),
	status: z.enum(["ok", "warning", "critical"]),
});

const ErrorSchema = z.object({
	error: z.string(),
	message: z.string(),
});

// ============================================
// Routes
// ============================================

// GET /exposure - Exposure metrics
const exposureRoute = createRoute({
	method: "get",
	path: "/exposure",
	responses: {
		200: {
			content: {
				"application/json": {
					schema: ExposureMetricsSchema,
				},
			},
			description: "Exposure metrics",
		},
	},
	tags: ["Risk"],
});

app.openapi(exposureRoute, async (c) => {
	const snapshotsRepo = getPortfolioSnapshotsRepo();
	const env = getCurrentEnvironment();

	// 1. Get Positions from Alpaca
	const positions = await getAlpacaPositions();

	// 2. Get NAV
	const latestSnapshot = await snapshotsRepo.getLatest(env);
	const nav = resolveNav(latestSnapshot, positions);
	const constraints = await getRuntimeConstraints();

	// 3. Map to PositionForExposure
	const positionsForExposure = mapToExposurePositions(positions);

	// 4. Calculate Exposure
	const metrics = calculateExposure({
		positions: positionsForExposure,
		nav,
		limits: toExposureLimits(constraints, nav),
	});

	return c.json(metrics, 200);
});

// GET /greeks - Options Greeks summary
const greeksRoute = createRoute({
	method: "get",
	path: "/greeks",
	responses: {
		200: {
			content: {
				"application/json": {
					schema: GreeksSummarySchema,
				},
			},
			description: "Greeks summary",
		},
	},
	tags: ["Risk"],
});

app.openapi(greeksRoute, async (c) => {
	const options = await portfolioService.getOptionsPositions();
	const constraints = await getRuntimeConstraints();
	const optionLimits = toOptionsLimits(constraints);

	let totalDeltaNotional = 0;
	let totalGamma = 0;
	let totalVega = 0;
	let totalTheta = 0;

	const byPosition = options.map((opt) => {
		const g = opt.greeks ?? { delta: 0, gamma: 0, vega: 0, theta: 0 };
		const multiplier = 100;
		const qty = opt.quantity; // signed (+ for long, - for short)

		// Greeks aggregation
		// Delta Notional = Delta * UnderlyingPrice * Multiplier * Quantity
		const positionDeltaNotional = g.delta * opt.underlyingPrice * multiplier * qty;

		// Gamma (Portfolio) = Gamma * Multiplier * Quantity
		// Note: Some definitions scale Gamma by price^2/100, but standard "Position Gamma" is usually just sum of contract gammas
		// If limit is 1000, it's likely total contract gamma units.
		const positionGamma = g.gamma * multiplier * qty;

		// Vega (Portfolio) = Vega * Multiplier * Quantity
		const positionVega = g.vega * multiplier * qty;

		// Theta (Portfolio) = Theta * Multiplier * Quantity
		const positionTheta = g.theta * multiplier * qty;

		totalDeltaNotional += positionDeltaNotional;
		totalGamma += positionGamma;
		totalVega += positionVega;
		totalTheta += positionTheta;

		return {
			symbol: opt.contractSymbol,
			delta: g.delta,
			gamma: g.gamma,
			vega: g.vega,
			theta: g.theta,
		};
	});

	return c.json({
		delta: { current: totalDeltaNotional, limit: optionLimits.max_delta_notional },
		gamma: { current: totalGamma, limit: optionLimits.max_gamma },
		vega: { current: totalVega, limit: optionLimits.max_vega },
		theta: { current: totalTheta, limit: optionLimits.max_theta },
		byPosition,
	});
});

// GET /correlation - Correlation matrix
const correlationRoute = createRoute({
	method: "get",
	path: "/correlation",
	responses: {
		200: {
			content: {
				"application/json": {
					schema: CorrelationMatrixSchema,
				},
			},
			description: "Correlation matrix",
		},
		503: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Risk service unavailable",
		},
	},
	tags: ["Risk"],
});

app.openapi(correlationRoute, async (c) => {
	// Get positions from Alpaca
	const positions = await getAlpacaPositions();

	// Extract unique symbols
	const symbols = [...new Set(positions.map((p) => p.symbol))];

	if (symbols.length === 0) {
		return c.json(
			{
				symbols: [],
				matrix: [],
				highCorrelationPairs: [],
			},
			200,
		);
	}

	// Calculate correlation matrix
	const result = await getCorrelationMatrix({
		symbols,
		lookbackDays: 60,
		threshold: 0.7,
	});

	return c.json(result, 200);
});

// GET /var - Value at Risk
const varRoute = createRoute({
	method: "get",
	path: "/var",
	responses: {
		200: {
			content: {
				"application/json": {
					schema: VaRMetricsSchema,
				},
			},
			description: "VaR metrics",
		},
		503: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Risk service unavailable",
		},
	},
	tags: ["Risk"],
});

app.openapi(varRoute, async (c) => {
	// Get positions from Alpaca
	const snapshotsRepo = getPortfolioSnapshotsRepo();
	const env = getCurrentEnvironment();
	const positions = await getAlpacaPositions();

	// Get NAV from latest snapshot (or calculate from positions)
	const latestSnapshot = await snapshotsRepo.getLatest(env);
	const nav = latestSnapshot?.nav ?? positions.reduce((sum, p) => sum + p.marketValue, 0);

	// Convert positions for VaR calculation
	const positionsForVaR = mapToExposurePositions(positions);

	// Calculate VaR metrics
	const varMetrics = await getVaRMetrics({
		positions: positionsForVaR,
		nav,
		lookbackDays: 252, // 1 year of data
	});

	return c.json(varMetrics, 200);
});

// GET /limits - Limit utilization
const limitsRoute = createRoute({
	method: "get",
	path: "/limits",
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.array(LimitStatusSchema),
				},
			},
			description: "Limit statuses",
		},
		503: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Risk service unavailable",
		},
	},
	tags: ["Risk"],
});

app.openapi(limitsRoute, async (c) => {
	// Get positions from Alpaca
	const snapshotsRepo = getPortfolioSnapshotsRepo();
	const env = getCurrentEnvironment();
	const positions = await getAlpacaPositions();

	// Get NAV from latest snapshot (or calculate from positions)
	const latestSnapshot = await snapshotsRepo.getLatest(env);
	const nav = resolveNav(latestSnapshot, positions);

	// Convert positions for exposure calculation
	const positionsForExposure = mapToExposurePositions(positions);
	const constraints = await getRuntimeConstraints();

	// Calculate exposure metrics
	const exposure = calculateExposure({
		positions: positionsForExposure,
		nav,
		limits: toExposureLimits(constraints, nav),
	});

	// Calculate limit statuses
	// Note: Greeks are omitted here because this route currently computes limit status from position
	// exposure only.
	const limits = calculateLimits({
		exposure,
		positions: positionsForExposure,
		nav,
		constraints: toLimitConstraints(constraints, nav),
	});

	return c.json(limits, 200);
});

// ============================================
// Export
// ============================================

export const riskRoutes = app;
export default riskRoutes;
