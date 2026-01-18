/**
 * Factor Zoo Routes
 *
 * API endpoints for visualizing Factor Zoo performance and validation funnel metrics.
 */

import type { Factor } from "@cream/domain";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getFactorZooRepo } from "../db.js";

const app = new OpenAPIHono();

// ============================================
// Schema Definitions
// ============================================

const PipelineStatusSchema = z.object({
	active: z.array(
		z.object({
			runId: z.string(),
			triggerType: z.string(),
			triggerReason: z.string(),
			phase: z.string(),
			currentIteration: z.number(),
			startedAt: z.string(),
		})
	),
	recentCompleted: z.number(),
	recentFailed: z.number(),
	avgDurationHours: z.number().nullable(),
});

const FactorZooSummarySchema = z.object({
	total: z.number(),
	active: z.number(),
	decaying: z.number(),
	research: z.number(),
	retired: z.number(),
	avgIc: z.number().nullable(),
	avgWeight: z.number().nullable(),
	totalWeight: z.number(),
});

const FactorPerformanceSchema = z.object({
	id: z.string(),
	factorId: z.string(),
	date: z.string(),
	ic: z.number(),
	icir: z.number().nullable(),
	sharpe: z.number().nullable(),
	weight: z.number(),
	signalCount: z.number(),
});

const ValidationFunnelSchema = z.object({
	ideas: z.number(),
	stage1: z.number(),
	stage2: z.number(),
	paper: z.number(),
	production: z.number(),
	passRates: z.object({
		stage1: z.number().nullable(),
		stage2: z.number().nullable(),
		paper: z.number().nullable(),
		production: z.number().nullable(),
	}),
});

const CostTrackingSchema = z.object({
	apiCost: z.number(),
	computeCost: z.number(),
	factorsProduced: z.number(),
	costPerFactor: z.number().nullable(),
	tokensUsed: z.number(),
	computeHours: z.number(),
});

const FactorDetailSchema = z.object({
	factorId: z.string(),
	hypothesisId: z.string().nullable(),
	name: z.string(),
	status: z.string(),
	version: z.number(),
	author: z.string(),
	currentWeight: z.number(),
	lastIc: z.number().nullable(),
	decayRate: z.number().nullable(),
	stage1Ic: z.number().nullable(),
	stage1Sharpe: z.number().nullable(),
	stage2Pbo: z.number().nullable(),
	paperRealizedIc: z.number().nullable(),
	paperRealizedSharpe: z.number().nullable(),
	createdAt: z.string(),
	promotedAt: z.string().nullable(),
});

const CorrelationEntrySchema = z.object({
	factorId1: z.string(),
	factorId2: z.string(),
	correlation: z.number(),
});

// ============================================
// Pipeline Status
// ============================================

const pipelinesRoute = createRoute({
	method: "get",
	path: "/pipelines",
	responses: {
		200: {
			content: { "application/json": { schema: PipelineStatusSchema } },
			description: "Pipeline status summary",
		},
	},
	tags: ["Factor Zoo"],
});

app.openapi(pipelinesRoute, async (c) => {
	const repo = await getFactorZooRepo();
	const activeRuns = await repo.findActiveResearchRuns();

	// Count recent completed/failed (would need additional repo method for full implementation)
	// For now, return active runs only
	return c.json({
		active: activeRuns.map((r) => ({
			runId: r.runId,
			triggerType: r.triggerType,
			triggerReason: r.triggerReason,
			phase: r.phase,
			currentIteration: r.currentIteration,
			startedAt: r.startedAt,
		})),
		recentCompleted: 0,
		recentFailed: 0,
		avgDurationHours: null,
	});
});

// ============================================
// Factor Zoo Summary
// ============================================

const factorZooSummaryRoute = createRoute({
	method: "get",
	path: "/factor-zoo",
	responses: {
		200: {
			content: { "application/json": { schema: FactorZooSummarySchema } },
			description: "Factor Zoo summary statistics",
		},
	},
	tags: ["Factor Zoo"],
});

app.openapi(factorZooSummaryRoute, async (c) => {
	const repo = await getFactorZooRepo();
	const stats = await repo.getStats();
	const activeFactors = await repo.findActiveFactors();

	const avgWeight =
		activeFactors.length > 0
			? activeFactors.reduce((sum, f) => sum + f.currentWeight, 0) / activeFactors.length
			: null;

	return c.json({
		total: stats.totalFactors,
		active: stats.activeFactors,
		decaying: stats.decayingFactors,
		research: stats.researchFactors,
		retired: stats.retiredFactors,
		avgIc: stats.averageIc || null,
		avgWeight,
		totalWeight: stats.totalWeight,
	});
});

// ============================================
// Factor List
// ============================================

const factorListRoute = createRoute({
	method: "get",
	path: "/factors",
	request: {
		query: z.object({
			status: z.enum(["research", "validating", "active", "decaying", "retired"]).optional(),
		}),
	},
	responses: {
		200: {
			content: { "application/json": { schema: z.array(FactorDetailSchema) } },
			description: "List of factors",
		},
	},
	tags: ["Factor Zoo"],
});

app.openapi(factorListRoute, async (c) => {
	const { status } = c.req.valid("query");
	const repo = await getFactorZooRepo();

	let factors: Factor[];
	if (status) {
		factors = await repo.findFactorsByStatus(status);
	} else {
		// Get all factors by querying each status
		const [research, validating, active, decaying, retired] = await Promise.all([
			repo.findFactorsByStatus("research"),
			repo.findFactorsByStatus("validating"),
			repo.findFactorsByStatus("active"),
			repo.findFactorsByStatus("decaying"),
			repo.findFactorsByStatus("retired"),
		]);
		factors = [...research, ...validating, ...active, ...decaying, ...retired];
	}

	return c.json(
		factors.map((f) => ({
			factorId: f.factorId,
			hypothesisId: f.hypothesisId,
			name: f.name,
			status: f.status,
			version: f.version,
			author: f.author,
			currentWeight: f.currentWeight,
			lastIc: f.lastIc,
			decayRate: f.decayRate,
			stage1Ic: f.stage1Ic,
			stage1Sharpe: f.stage1Sharpe,
			stage2Pbo: f.stage2Pbo,
			paperRealizedIc: f.paperRealizedIc,
			paperRealizedSharpe: f.paperRealizedSharpe,
			createdAt: f.createdAt,
			promotedAt: f.promotedAt,
		}))
	);
});

// ============================================
// Factor Performance History
// ============================================

const factorPerformanceRoute = createRoute({
	method: "get",
	path: "/factors/:factorId/performance",
	request: {
		params: z.object({
			factorId: z.string(),
		}),
		query: z.object({
			days: z.coerce.number().min(1).max(365).default(30),
		}),
	},
	responses: {
		200: {
			content: { "application/json": { schema: z.array(FactorPerformanceSchema) } },
			description: "Factor performance history",
		},
		404: {
			description: "Factor not found",
		},
	},
	tags: ["Factor Zoo"],
});

app.openapi(factorPerformanceRoute, async (c) => {
	const { factorId } = c.req.valid("param");
	const { days } = c.req.valid("query");

	const repo = await getFactorZooRepo();
	const factor = await repo.findFactorById(factorId);

	if (!factor) {
		return c.json({ error: "Factor not found" }, 404);
	}

	const history = await repo.getPerformanceHistory(factorId, days);

	return c.json(
		history.map((p) => ({
			id: p.id,
			factorId: p.factorId,
			date: p.date,
			ic: p.ic,
			icir: p.icir,
			sharpe: p.sharpe,
			weight: p.weight,
			signalCount: p.signalCount,
		}))
	);
});

// ============================================
// Validation Funnel
// ============================================

const funnelRoute = createRoute({
	method: "get",
	path: "/funnel",
	request: {
		query: z.object({
			days: z.coerce.number().min(1).max(365).default(30),
		}),
	},
	responses: {
		200: {
			content: { "application/json": { schema: ValidationFunnelSchema } },
			description: "Validation funnel metrics",
		},
	},
	tags: ["Factor Zoo"],
});

app.openapi(funnelRoute, async (c) => {
	const repo = await getFactorZooRepo();

	// Get counts by status
	const [research, validating, active] = await Promise.all([
		repo.findFactorsByStatus("research"),
		repo.findFactorsByStatus("validating"),
		repo.findFactorsByStatus("active"),
	]);

	// Ideas = research factors
	// Stage 1 = validating (passed initial screen)
	// Stage 2 = has stage2 completion
	// Paper = has paper validation
	// Production = active

	const ideas = research.length + validating.length + active.length;
	const stage1 = validating.filter((f) => f.stage1CompletedAt).length + active.length;
	const stage2 = validating.filter((f) => f.stage2CompletedAt).length + active.length;
	const paper = active.filter((f) => f.paperValidationPassed).length;
	const production = active.length;

	return c.json({
		ideas,
		stage1,
		stage2,
		paper,
		production,
		passRates: {
			stage1: ideas > 0 ? (stage1 / ideas) * 100 : null,
			stage2: stage1 > 0 ? (stage2 / stage1) * 100 : null,
			paper: stage2 > 0 ? (paper / stage2) * 100 : null,
			production: paper > 0 ? (production / paper) * 100 : null,
		},
	});
});

// ============================================
// Cost Tracking
// ============================================

const costsRoute = createRoute({
	method: "get",
	path: "/costs",
	request: {
		query: z.object({
			days: z.coerce.number().min(1).max(365).default(30),
		}),
	},
	responses: {
		200: {
			content: { "application/json": { schema: CostTrackingSchema } },
			description: "Research cost tracking",
		},
	},
	tags: ["Factor Zoo"],
});

app.openapi(costsRoute, async (c) => {
	// Cost tracking requires aggregating from research runs
	// For now, return placeholder that can be expanded
	const repo = await getFactorZooRepo();
	const activeRuns = await repo.findActiveResearchRuns();

	const tokensUsed = activeRuns.reduce((sum, r) => sum + r.tokensUsed, 0);
	const computeHours = activeRuns.reduce((sum, r) => sum + r.computeHours, 0);

	const apiCost = tokensUsed * 0.00001; // Rough estimate
	const computeCost = computeHours * 0.5; // $0.50 per compute hour

	const factorsProduced = activeRuns.filter((r) => r.phase === "completed" && r.factorId).length;

	return c.json({
		apiCost: Math.round(apiCost * 100) / 100,
		computeCost: Math.round(computeCost * 100) / 100,
		factorsProduced,
		costPerFactor:
			factorsProduced > 0
				? Math.round(((apiCost + computeCost) / factorsProduced) * 100) / 100
				: null,
		tokensUsed,
		computeHours: Math.round(computeHours * 100) / 100,
	});
});

// ============================================
// Factor Correlations
// ============================================

const correlationsRoute = createRoute({
	method: "get",
	path: "/correlations",
	responses: {
		200: {
			content: { "application/json": { schema: z.array(CorrelationEntrySchema) } },
			description: "Factor correlation matrix",
		},
	},
	tags: ["Factor Zoo"],
});

app.openapi(correlationsRoute, async (c) => {
	const repo = await getFactorZooRepo();
	const matrix = await repo.getCorrelationMatrix();

	// Convert Map to array of entries
	const entries: { factorId1: string; factorId2: string; correlation: number }[] = [];

	for (const [factorId1, correlations] of matrix) {
		for (const [factorId2, correlation] of correlations) {
			// Only add each pair once (factorId1 < factorId2)
			if (factorId1 < factorId2) {
				entries.push({ factorId1, factorId2, correlation });
			}
		}
	}

	return c.json(entries);
});

// ============================================
// Decaying Factors Alert
// ============================================

const decayingFactorsRoute = createRoute({
	method: "get",
	path: "/factors/decaying",
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.array(
						z.object({
							factorId: z.string(),
							name: z.string(),
							decayRate: z.number().nullable(),
							lastIc: z.number().nullable(),
							daysDecaying: z.number().nullable(),
						})
					),
				},
			},
			description: "List of decaying factors",
		},
	},
	tags: ["Factor Zoo"],
});

app.openapi(decayingFactorsRoute, async (c) => {
	const repo = await getFactorZooRepo();
	const decaying = await repo.findDecayingFactors();

	return c.json(
		decaying.map((f) => ({
			factorId: f.factorId,
			name: f.name,
			decayRate: f.decayRate,
			lastIc: f.lastIc,
			daysDecaying: null, // Would need to track when decay started
		}))
	);
});

export default app;
