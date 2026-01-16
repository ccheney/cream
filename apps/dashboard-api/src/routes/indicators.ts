/**
 * Indicator Lab API Routes
 *
 * API endpoints for the Indicator Lab dashboard, providing access to
 * indicator status, validation reports, IC history, and trigger conditions.
 *
 * @see docs/plans/19-dynamic-indicator-synthesis.md (lines 1385-1396)
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getIndicatorsRepo, getRegimeLabelsRepo } from "../db.js";

// ============================================
// App Setup
// ============================================

const app = new OpenAPIHono();

// ============================================
// Schema Definitions
// ============================================

const IndicatorStatusEnum = z.enum(["staging", "paper", "production", "retired"]);
const IndicatorCategoryEnum = z.enum([
	"momentum",
	"trend",
	"volatility",
	"volume",
	"custom",
	"correlation",
	"regime",
	"microstructure",
]);

const IndicatorSummarySchema = z.object({
	id: z.string(),
	name: z.string(),
	category: z.string(),
	status: IndicatorStatusEnum,
	hypothesis: z.string(),
	generatedAt: z.string(),
	promotedAt: z.string().nullable(),
	retiredAt: z.string().nullable(),
});

const IndicatorDetailSchema = IndicatorSummarySchema.extend({
	economicRationale: z.string(),
	validationReport: z.any().nullable(),
	paperTradingReport: z.any().nullable(),
	paperTradingStart: z.string().nullable(),
	paperTradingEnd: z.string().nullable(),
	prUrl: z.string().nullable(),
	codeHash: z.string().nullable(),
	generatedBy: z.string(),
});

const ICHistoryEntrySchema = z.object({
	date: z.string(),
	icValue: z.number(),
	icStd: z.number(),
	decisionsUsedIn: z.number(),
	decisionsCorrect: z.number(),
});

const TriggerConditionsSchema = z.object({
	rollingIC30Day: z.number(),
	icDecayDays: z.number(),
	daysSinceLastAttempt: z.number(),
	activeIndicatorCount: z.number(),
	maxIndicatorCapacity: z.number(),
	regimeGapDetected: z.boolean(),
	currentRegime: z.string().nullable(),
});

const TriggerStatusSchema = z.object({
	shouldTrigger: z.boolean(),
	conditions: TriggerConditionsSchema,
	lastCheck: z.string(),
	recommendation: z.string(),
});

const ActivitySchema = z.object({
	type: z.enum(["generation", "promotion", "retirement", "paper_start"]),
	indicatorId: z.string(),
	name: z.string(),
	timestamp: z.string(),
	details: z.string().nullable(),
});

const PaperTradingIndicatorSchema = z.object({
	id: z.string(),
	name: z.string(),
	category: z.string(),
	paperTradingStart: z.string(),
	daysTrading: z.number(),
	signalsRecorded: z.number(),
	currentIC: z.number().nullable(),
	progress: z.number(),
});

// ============================================
// Helper Functions
// ============================================

/**
 * Calculate a simple Information Coefficient (Pearson correlation)
 */
function calculateSimpleIC(signals: number[], outcomes: number[]): number {
	if (signals.length === 0 || signals.length !== outcomes.length) {
		return 0;
	}

	const n = signals.length;
	const meanSignal = signals.reduce((a, b) => a + b, 0) / n;
	const meanOutcome = outcomes.reduce((a, b) => a + b, 0) / n;

	let numerator = 0;
	let denomSignal = 0;
	let denomOutcome = 0;

	for (let i = 0; i < n; i++) {
		const signal = signals[i];
		const outcome = outcomes[i];
		if (signal === undefined || outcome === undefined) {
			continue;
		}
		const diffSignal = signal - meanSignal;
		const diffOutcome = outcome - meanOutcome;
		numerator += diffSignal * diffOutcome;
		denomSignal += diffSignal * diffSignal;
		denomOutcome += diffOutcome * diffOutcome;
	}

	const denominator = Math.sqrt(denomSignal * denomOutcome);
	return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * Get trigger conditions from repositories
 */
async function getTriggerConditions(): Promise<{
	rollingIC30Day: number;
	icDecayDays: number;
	daysSinceLastAttempt: number;
	activeIndicatorCount: number;
	maxIndicatorCapacity: number;
	regimeGapDetected: boolean;
	currentRegime: string | null;
	regimeGapDetails?: string;
}> {
	const indicatorsRepo = getIndicatorsRepo();
	const regimeLabelsRepo = getRegimeLabelsRepo();

	// Get active indicator count
	const activeCount = await indicatorsRepo.getActiveCount();

	// Get recent IC values for rolling average
	const icValues = await indicatorsRepo.getRecentICValues(30);
	const rollingIC =
		icValues.length > 0 ? icValues.reduce((a, b) => a + b, 0) / icValues.length : 0;

	// Calculate IC decay (consecutive days below threshold)
	let icDecayDays = 0;
	for (const ic of icValues) {
		if (ic < 0.02) {
			icDecayDays++;
		} else {
			break;
		}
	}

	// Get last generation attempt
	const lastAttempt = await indicatorsRepo.getLastGenerationAttempt();
	const daysSinceLastAttempt = lastAttempt
		? Math.floor((Date.now() - new Date(lastAttempt).getTime()) / (24 * 60 * 60 * 1000))
		: 999;

	// Get current market regime from regime labels
	let currentRegime: string | null = null;
	let regimeGapDetected = false;
	let regimeGapDetails: string | undefined;

	try {
		const marketRegime = await regimeLabelsRepo.getLatestForSymbol("_MARKET");
		if (marketRegime) {
			currentRegime = marketRegime.regime;
			regimeGapDetected = marketRegime.confidence < 0.5;
			if (regimeGapDetected) {
				regimeGapDetails = `Low confidence (${(marketRegime.confidence * 100).toFixed(1)}%) in regime classification`;
			}
		} else {
			regimeGapDetected = true;
			regimeGapDetails = "No regime data available";
		}
	} catch {
		regimeGapDetected = true;
		regimeGapDetails = "Regime classification unavailable";
	}

	return {
		rollingIC30Day: rollingIC,
		icDecayDays,
		daysSinceLastAttempt,
		activeIndicatorCount: activeCount,
		maxIndicatorCapacity: 20,
		regimeGapDetected,
		currentRegime,
		regimeGapDetails,
	};
}

// ============================================
// Route Definitions
// ============================================

// GET /api/indicators - List all indicators
const listIndicatorsRoute = createRoute({
	method: "get",
	path: "/",
	request: {
		query: z.object({
			status: IndicatorStatusEnum.optional(),
			category: IndicatorCategoryEnum.optional(),
		}),
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({
						indicators: z.array(IndicatorSummarySchema),
					}),
				},
			},
			description: "List of indicators",
		},
	},
	tags: ["Indicators"],
});

app.openapi(listIndicatorsRoute, async (c) => {
	const { status, category } = c.req.valid("query");
	const repo = getIndicatorsRepo();

	const result = await repo.findMany({
		status: status as "staging" | "paper" | "production" | "retired" | undefined,
		category: category as "momentum" | "trend" | "volatility" | "volume" | "custom" | undefined,
	});

	// Sort by status priority then name
	const statusPriority: Record<string, number> = {
		production: 1,
		paper: 2,
		staging: 3,
		retired: 4,
	};

	const indicators = result.data
		.sort((a, b) => {
			const priorityA = statusPriority[a.status] ?? 5;
			const priorityB = statusPriority[b.status] ?? 5;
			if (priorityA !== priorityB) return priorityA - priorityB;
			return a.name.localeCompare(b.name);
		})
		.map((ind) => ({
			id: ind.id,
			name: ind.name,
			category: ind.category,
			status: ind.status as "staging" | "paper" | "production" | "retired",
			hypothesis: ind.hypothesis,
			generatedAt: ind.generatedAt,
			promotedAt: ind.promotedAt,
			retiredAt: ind.retiredAt,
		}));

	return c.json({ indicators });
});

// ============================================
// Static Routes (must be registered before /:id to avoid matching issues)
// ============================================

// GET /api/indicators/trigger-status - Get current trigger conditions
const getTriggerStatusRoute = createRoute({
	method: "get",
	path: "/trigger-status",
	responses: {
		200: {
			content: {
				"application/json": {
					schema: TriggerStatusSchema,
				},
			},
			description: "Current trigger status",
		},
	},
	tags: ["Indicators"],
});

app.openapi(getTriggerStatusRoute, async (c) => {
	const conditions = await getTriggerConditions();

	const shouldTrigger =
		conditions.daysSinceLastAttempt >= 30 &&
		conditions.activeIndicatorCount < conditions.maxIndicatorCapacity &&
		(conditions.rollingIC30Day < 0.02 || conditions.icDecayDays >= 5);

	let recommendation = "";
	if (shouldTrigger) {
		recommendation = `Indicator generation warranted: Rolling IC ${conditions.rollingIC30Day.toFixed(4)}, ${conditions.icDecayDays} days of decay.`;
	} else if (conditions.daysSinceLastAttempt < 30) {
		recommendation = `Cooldown active: ${30 - conditions.daysSinceLastAttempt} days remaining.`;
	} else if (conditions.rollingIC30Day >= 0.02) {
		recommendation = `Portfolio IC healthy at ${conditions.rollingIC30Day.toFixed(4)}, no generation needed.`;
	} else if (conditions.activeIndicatorCount >= conditions.maxIndicatorCapacity) {
		recommendation = `Indicator capacity reached (${conditions.activeIndicatorCount}/${conditions.maxIndicatorCapacity}).`;
	} else {
		recommendation = "No trigger conditions met.";
	}

	return c.json({
		shouldTrigger,
		conditions: {
			rollingIC30Day: conditions.rollingIC30Day,
			icDecayDays: conditions.icDecayDays,
			daysSinceLastAttempt: conditions.daysSinceLastAttempt,
			activeIndicatorCount: conditions.activeIndicatorCount,
			maxIndicatorCapacity: conditions.maxIndicatorCapacity,
			regimeGapDetected: conditions.regimeGapDetected,
			currentRegime: conditions.currentRegime,
		},
		lastCheck: new Date().toISOString(),
		recommendation,
	});
});

// POST /api/indicators/trigger-check - Force a trigger check
const forceTriggerCheckRoute = createRoute({
	method: "post",
	path: "/trigger-check",
	responses: {
		200: {
			content: {
				"application/json": {
					schema: TriggerStatusSchema,
				},
			},
			description: "Trigger check result",
		},
	},
	tags: ["Indicators"],
});

app.openapi(forceTriggerCheckRoute, async (c) => {
	const conditions = await getTriggerConditions();

	const shouldTrigger =
		conditions.daysSinceLastAttempt >= 30 &&
		conditions.activeIndicatorCount < conditions.maxIndicatorCapacity &&
		(conditions.rollingIC30Day < 0.02 || conditions.icDecayDays >= 5);

	let recommendation = "";
	if (shouldTrigger) {
		recommendation = `Indicator generation warranted: Rolling IC ${conditions.rollingIC30Day.toFixed(4)}, ${conditions.icDecayDays} days of decay.`;
	} else if (conditions.daysSinceLastAttempt < 30) {
		recommendation = `Cooldown active: ${30 - conditions.daysSinceLastAttempt} days remaining.`;
	} else if (conditions.rollingIC30Day >= 0.02) {
		recommendation = `Portfolio IC healthy at ${conditions.rollingIC30Day.toFixed(4)}, no generation needed.`;
	} else if (conditions.activeIndicatorCount >= conditions.maxIndicatorCapacity) {
		recommendation = `Indicator capacity reached (${conditions.activeIndicatorCount}/${conditions.maxIndicatorCapacity}).`;
	} else {
		recommendation = "No trigger conditions met.";
	}

	return c.json({
		shouldTrigger,
		conditions: {
			rollingIC30Day: conditions.rollingIC30Day,
			icDecayDays: conditions.icDecayDays,
			daysSinceLastAttempt: conditions.daysSinceLastAttempt,
			activeIndicatorCount: conditions.activeIndicatorCount,
			maxIndicatorCapacity: conditions.maxIndicatorCapacity,
			regimeGapDetected: conditions.regimeGapDetected,
			currentRegime: conditions.currentRegime,
		},
		lastCheck: new Date().toISOString(),
		recommendation,
	});
});

// GET /api/indicators/paper-trading - Get paper trading indicators
const getPaperTradingRoute = createRoute({
	method: "get",
	path: "/paper-trading",
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({
						indicators: z.array(PaperTradingIndicatorSchema),
					}),
				},
			},
			description: "Paper trading indicators with progress",
		},
	},
	tags: ["Indicators"],
});

app.openapi(getPaperTradingRoute, async (c) => {
	const repo = getIndicatorsRepo();
	const paperIndicators = await repo.findPaperTradingIndicators();

	const indicators = await Promise.all(
		paperIndicators.map(async (ind) => {
			const signalsRecorded = await repo.countPaperSignals(ind.id);
			const signalsWithOutcomes = await repo.getPaperSignalsWithOutcomes(ind.id);

			let currentIC: number | null = null;
			const validSignals = signalsWithOutcomes.filter((s) => s.outcome !== null);
			if (validSignals.length > 0) {
				currentIC = calculateSimpleIC(
					validSignals.map((s) => s.signal),
					validSignals.map((s) => s.outcome!)
				);
			}

			return {
				id: ind.id,
				name: ind.name,
				category: ind.category,
				paperTradingStart: ind.paperTradingStart ?? "",
				daysTrading: ind.daysTrading,
				signalsRecorded,
				currentIC,
				progress: Math.min((ind.daysTrading / 30) * 100, 100),
			};
		})
	);

	return c.json({ indicators });
});

// GET /api/indicators/activity - Get recent activity log
const getActivityRoute = createRoute({
	method: "get",
	path: "/activity",
	request: {
		query: z.object({
			limit: z.coerce.number().min(1).max(100).default(20),
		}),
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({
						activities: z.array(ActivitySchema),
					}),
				},
			},
			description: "Recent activity log",
		},
	},
	tags: ["Indicators"],
});

app.openapi(getActivityRoute, async (c) => {
	const { limit } = c.req.valid("query");
	const repo = getIndicatorsRepo();

	// Get all indicators to build activity list
	const result = await repo.findMany({}, { pageSize: 100 });

	// Build activity events from indicators
	type Activity = {
		type: "generation" | "promotion" | "retirement" | "paper_start";
		indicatorId: string;
		name: string;
		timestamp: string;
		details: string | null;
	};

	const activities: Activity[] = [];

	for (const ind of result.data) {
		if (ind.generatedAt) {
			activities.push({
				type: "generation",
				indicatorId: ind.id,
				name: ind.name,
				timestamp: ind.generatedAt,
				details: ind.hypothesis,
			});
		}
		if (ind.promotedAt) {
			activities.push({
				type: "promotion",
				indicatorId: ind.id,
				name: ind.name,
				timestamp: ind.promotedAt,
				details: ind.prUrl,
			});
		}
		if (ind.retiredAt) {
			activities.push({
				type: "retirement",
				indicatorId: ind.id,
				name: ind.name,
				timestamp: ind.retiredAt,
				details: ind.retirementReason,
			});
		}
		if (ind.paperTradingStart) {
			activities.push({
				type: "paper_start",
				indicatorId: ind.id,
				name: ind.name,
				timestamp: ind.paperTradingStart,
				details: "Started paper trading",
			});
		}
	}

	// Sort by timestamp descending and limit
	activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
	const limitedActivities = activities.slice(0, limit);

	return c.json({ activities: limitedActivities });
});

// GET /api/indicators/synthesis/status - Get synthesis pipeline status
const SynthesisPhaseSchema = z.enum([
	"gathering_context",
	"generating_hypothesis",
	"implementing",
	"validating",
	"initiating_paper_trading",
]);

const SynthesisTriggerConditionsSchema = z.object({
	regimeGapDetected: z.boolean(),
	currentRegime: z.string(),
	regimeGapDetails: z.string().optional(),
	closestIndicatorSimilarity: z.number(),
	rollingIC30Day: z.number(),
	icDecayDays: z.number(),
	existingIndicatorsUnderperforming: z.boolean(),
	daysSinceLastAttempt: z.number(),
	activeIndicatorCount: z.number(),
	maxIndicatorCapacity: z.number(),
	cooldownMet: z.boolean(),
	capacityAvailable: z.boolean(),
});

const SynthesisTriggerStatusSchema = z.object({
	shouldTrigger: z.boolean(),
	triggerReason: z.string().optional(),
	conditions: SynthesisTriggerConditionsSchema,
	summary: z.string(),
	recommendation: z.string(),
});

const ActiveSynthesisSchema = z.object({
	id: z.string(),
	name: z.string(),
	status: z.enum(["running", "completed", "failed"]),
	currentPhase: SynthesisPhaseSchema,
	startedAt: z.string(),
	triggeredByCycleId: z.string(),
	triggerReason: z.string(),
});

const SynthesisActivitySchema = z.object({
	indicatorName: z.string(),
	status: z.enum(["paper_trading_started", "validation_failed", "implementation_failed", "error"]),
	generatedAt: z.string(),
	success: z.boolean(),
});

const SynthesisStatusResponseSchema = z.object({
	triggerStatus: SynthesisTriggerStatusSchema.nullable(),
	activeSynthesis: ActiveSynthesisSchema.nullable(),
	recentActivity: z.array(SynthesisActivitySchema),
	lastEvaluatedAt: z.string().nullable(),
});

const getSynthesisStatusRoute = createRoute({
	method: "get",
	path: "/synthesis/status",
	responses: {
		200: {
			content: {
				"application/json": {
					schema: SynthesisStatusResponseSchema,
				},
			},
			description: "Synthesis pipeline status",
		},
	},
	tags: ["Indicators"],
});

app.openapi(getSynthesisStatusRoute, async (c) => {
	const repo = getIndicatorsRepo();
	const conditions = await getTriggerConditions();

	const cooldownMet = conditions.daysSinceLastAttempt >= 30;
	const capacityAvailable = conditions.activeIndicatorCount < 20;
	const existingIndicatorsUnderperforming =
		conditions.rollingIC30Day < 0.02 || conditions.icDecayDays >= 5;

	const shouldTrigger = cooldownMet && capacityAvailable && existingIndicatorsUnderperforming;

	let recommendation = "";
	let summary = "";
	let triggerReason: string | undefined;

	if (shouldTrigger) {
		triggerReason = conditions.regimeGapDetected
			? "regime_gap"
			: conditions.icDecayDays >= 5
				? "ic_decay"
				: "low_rolling_ic";
		summary = `Synthesis triggered: ${triggerReason === "regime_gap" ? "Regime gap detected" : `IC decay (${conditions.icDecayDays} days)`}`;
		recommendation = `Indicator generation warranted: Rolling IC ${conditions.rollingIC30Day.toFixed(4)}, ${conditions.icDecayDays} days of decay.`;
	} else if (!cooldownMet) {
		summary = `Cooldown active: ${30 - conditions.daysSinceLastAttempt} days remaining`;
		recommendation = `Cooldown active: ${30 - conditions.daysSinceLastAttempt} days remaining.`;
	} else if (!capacityAvailable) {
		summary = `Capacity reached: ${conditions.activeIndicatorCount}/${conditions.maxIndicatorCapacity}`;
		recommendation = `Indicator capacity reached (${conditions.activeIndicatorCount}/${conditions.maxIndicatorCapacity}).`;
	} else if (!existingIndicatorsUnderperforming) {
		summary = `Portfolio IC healthy at ${conditions.rollingIC30Day.toFixed(4)}`;
		recommendation = `Portfolio IC healthy at ${conditions.rollingIC30Day.toFixed(4)}, no generation needed.`;
	} else {
		summary = "No trigger conditions met";
		recommendation = "No trigger conditions met.";
	}

	const triggerStatus = {
		shouldTrigger,
		triggerReason,
		conditions: {
			regimeGapDetected: conditions.regimeGapDetected,
			currentRegime: conditions.currentRegime ?? "Unknown",
			regimeGapDetails: conditions.regimeGapDetails,
			closestIndicatorSimilarity: 0,
			rollingIC30Day: conditions.rollingIC30Day,
			icDecayDays: conditions.icDecayDays,
			existingIndicatorsUnderperforming,
			daysSinceLastAttempt: conditions.daysSinceLastAttempt,
			activeIndicatorCount: conditions.activeIndicatorCount,
			maxIndicatorCapacity: conditions.maxIndicatorCapacity,
			cooldownMet,
			capacityAvailable,
		},
		summary,
		recommendation,
	};

	// Check for active synthesis
	let activeSynthesis = null;
	const recentStaging = await repo.findRecentStagingIndicators(1);
	if (recentStaging.length > 0) {
		const ind = recentStaging[0]!;
		activeSynthesis = {
			id: ind.id,
			name: ind.name,
			status: "running" as const,
			currentPhase: "initiating_paper_trading" as const,
			startedAt: ind.generatedAt,
			triggeredByCycleId: ind.generatedBy ?? "unknown",
			triggerReason: triggerReason ?? "manual",
		};
	}

	// Get recent activity
	const result = await repo.findMany({}, { pageSize: 5 });
	const recentActivity = result.data.map((ind) => {
		let activityStatus:
			| "paper_trading_started"
			| "validation_failed"
			| "implementation_failed"
			| "error";
		let success = false;

		if (ind.status === "paper" || ind.status === "production") {
			activityStatus = "paper_trading_started";
			success = true;
		} else if (ind.status === "retired") {
			activityStatus = "validation_failed";
			success = false;
		} else if (ind.status === "staging") {
			activityStatus = "paper_trading_started";
			success = true;
		} else {
			activityStatus = "error";
			success = false;
		}

		return {
			indicatorName: ind.name,
			status: activityStatus,
			generatedAt: ind.generatedAt,
			success,
		};
	});

	return c.json({
		triggerStatus,
		activeSynthesis,
		recentActivity,
		lastEvaluatedAt: new Date().toISOString(),
	});
});

// GET /api/indicators/synthesis/history - Get synthesis attempt history
const SynthesisHistoryEntrySchema = z.object({
	id: z.string(),
	name: z.string(),
	category: z.string(),
	status: z.string(),
	hypothesis: z.string(),
	generatedAt: z.string(),
	paperTradingStart: z.string().nullable(),
	promotedAt: z.string().nullable(),
	retiredAt: z.string().nullable(),
	retirementReason: z.string().nullable(),
	ic: z.number().nullable(),
	triggerReason: z.string(),
});

const SynthesisHistoryResponseSchema = z.object({
	history: z.array(SynthesisHistoryEntrySchema),
});

const getSynthesisHistoryRoute = createRoute({
	method: "get",
	path: "/synthesis/history",
	request: {
		query: z.object({
			limit: z.coerce.number().min(1).max(100).default(20),
		}),
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: SynthesisHistoryResponseSchema,
				},
			},
			description: "Synthesis attempt history",
		},
	},
	tags: ["Indicators"],
});

function extractTriggerReason(ind: {
	generatedBy: string;
	hypothesis: string;
}): string {
	const generatedBy = ind.generatedBy ?? "";

	if (generatedBy.startsWith("synthesis-")) {
		return "synthesis";
	}
	if (generatedBy.startsWith("orient-")) {
		return "ooda_cycle";
	}

	const hypothesis = (ind.hypothesis ?? "").toLowerCase();
	if (hypothesis.includes("regime") || hypothesis.includes("market condition")) {
		return "regime_gap";
	}
	if (hypothesis.includes("decay") || hypothesis.includes("underperform")) {
		return "ic_decay";
	}

	return "manual";
}

app.openapi(getSynthesisHistoryRoute, async (c) => {
	const { limit } = c.req.valid("query");
	const repo = getIndicatorsRepo();

	const result = await repo.findMany({}, { pageSize: limit });

	const history = await Promise.all(
		result.data.map(async (ind) => {
			const avgIC = await repo.getAverageIC(ind.id, 30);

			return {
				id: ind.id,
				name: ind.name,
				category: ind.category,
				status: ind.status,
				hypothesis: ind.hypothesis,
				generatedAt: ind.generatedAt,
				paperTradingStart: ind.paperTradingStart,
				promotedAt: ind.promotedAt,
				retiredAt: ind.retiredAt,
				retirementReason: ind.retirementReason,
				ic: avgIC,
				triggerReason: extractTriggerReason({
					generatedBy: ind.generatedBy,
					hypothesis: ind.hypothesis,
				}),
			};
		})
	);

	return c.json({ history });
});

// POST /api/indicators/synthesis/trigger - Manually trigger indicator synthesis
const SynthesisTriggerRequestSchema = z.object({
	reason: z.string().optional().default("Manual trigger"),
	regime: z.string().optional().default("UNKNOWN"),
});

const SynthesisTriggerResponseSchema = z.object({
	success: z.boolean(),
	indicatorId: z.string().optional(),
	indicatorName: z.string().optional(),
	status: z.enum([
		"paper_trading_started",
		"validation_failed",
		"implementation_failed",
		"hypothesis_failed",
		"error",
	]),
	message: z.string(),
	phases: z.object({
		hypothesisGenerated: z.boolean(),
		implementationSucceeded: z.boolean(),
		validationPassed: z.boolean(),
		paperTradingStarted: z.boolean(),
	}),
});

const triggerSynthesisRoute = createRoute({
	method: "post",
	path: "/synthesis/trigger",
	request: {
		body: {
			content: {
				"application/json": {
					schema: SynthesisTriggerRequestSchema,
				},
			},
		},
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: SynthesisTriggerResponseSchema,
				},
			},
			description: "Synthesis workflow result",
		},
		500: {
			content: {
				"application/json": {
					schema: z.object({
						error: z.string(),
					}),
				},
			},
			description: "Synthesis workflow failed",
		},
	},
	tags: ["Indicators"],
});

// @ts-expect-error - Hono OpenAPI multi-response type inference limitation
app.openapi(triggerSynthesisRoute, async (c) => {
	const { reason, regime } = c.req.valid("json");

	const { indicatorSynthesisWorkflow } = await import("@cream/api");

	const cycleId = `manual-${Date.now()}`;
	const conditions = await getTriggerConditions();

	try {
		const run = await indicatorSynthesisWorkflow.createRun();
		const workflowResult = await run.start({
			inputData: {
				triggerReason: reason,
				currentRegime: regime,
				rollingIC30Day: conditions.rollingIC30Day,
				icDecayDays: conditions.icDecayDays,
				cycleId,
			},
		});

		if (workflowResult.status !== "success") {
			throw new HTTPException(500, { message: "Workflow execution failed" });
		}

		const output = (workflowResult as { result?: Record<string, unknown> }).result as
			| {
					success?: boolean;
					indicatorId?: string;
					indicatorName?: string;
					status?: string;
					message?: string;
					phases?: {
						hypothesisGenerated: boolean;
						implementationSucceeded: boolean;
						validationPassed: boolean;
						paperTradingStarted: boolean;
					};
			  }
			| undefined;

		if (!output) {
			throw new HTTPException(500, { message: "Workflow returned no output" });
		}

		return c.json({
			success: output.success ?? false,
			indicatorId: output.indicatorId,
			indicatorName: output.indicatorName,
			status:
				(output.status as
					| "paper_trading_started"
					| "validation_failed"
					| "implementation_failed"
					| "hypothesis_failed"
					| "error") ?? "error",
			message: output.message ?? "Unknown result",
			phases: output.phases ?? {
				hypothesisGenerated: false,
				implementationSucceeded: false,
				validationPassed: false,
				paperTradingStarted: false,
			},
		});
	} catch (error) {
		if (error instanceof HTTPException) {
			throw error;
		}
		throw new HTTPException(500, {
			message: error instanceof Error ? error.message : "Workflow execution failed",
		});
	}
});

// ============================================
// Parameterized Routes (after static routes)
// ============================================

// GET /api/indicators/:id - Get indicator detail
const getIndicatorRoute = createRoute({
	method: "get",
	path: "/:id",
	request: {
		params: z.object({
			id: z.string(),
		}),
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({
						indicator: IndicatorDetailSchema,
					}),
				},
			},
			description: "Indicator detail",
		},
		404: {
			content: {
				"application/json": {
					schema: z.object({
						error: z.string(),
					}),
				},
			},
			description: "Indicator not found",
		},
	},
	tags: ["Indicators"],
});

// @ts-expect-error - Hono OpenAPI multi-response type inference limitation
app.openapi(getIndicatorRoute, async (c) => {
	const { id } = c.req.valid("param");
	const repo = getIndicatorsRepo();

	const ind = await repo.findById(id);
	if (!ind) {
		throw new HTTPException(404, { message: "Indicator not found" });
	}

	const indicator = {
		id: ind.id,
		name: ind.name,
		category: ind.category,
		status: ind.status as "staging" | "paper" | "production" | "retired",
		hypothesis: ind.hypothesis,
		economicRationale: ind.economicRationale,
		generatedAt: ind.generatedAt,
		generatedBy: ind.generatedBy,
		promotedAt: ind.promotedAt,
		retiredAt: ind.retiredAt,
		validationReport: ind.validationReport,
		paperTradingReport: ind.paperTradingReport,
		paperTradingStart: ind.paperTradingStart,
		paperTradingEnd: ind.paperTradingEnd,
		prUrl: ind.prUrl,
		codeHash: ind.codeHash,
	};

	return c.json({ indicator });
});

// GET /api/indicators/:id/ic-history - Get IC history
const getICHistoryRoute = createRoute({
	method: "get",
	path: "/:id/ic-history",
	request: {
		params: z.object({
			id: z.string(),
		}),
		query: z.object({
			days: z.coerce.number().min(1).max(365).default(30),
		}),
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({
						history: z.array(ICHistoryEntrySchema),
					}),
				},
			},
			description: "IC history for indicator",
		},
	},
	tags: ["Indicators"],
});

app.openapi(getICHistoryRoute, async (c) => {
	const { id } = c.req.valid("param");
	const { days } = c.req.valid("query");
	const repo = getIndicatorsRepo();

	const icHistory = await repo.findICHistoryByIndicatorId(id, { limit: days });

	const history = icHistory.map((entry) => ({
		date: entry.date,
		icValue: entry.icValue,
		icStd: entry.icStd,
		decisionsUsedIn: entry.decisionsUsedIn,
		decisionsCorrect: entry.decisionsCorrect,
	}));

	return c.json({ history });
});

// POST /api/indicators/:id/retire - Retire an indicator
const retireIndicatorRoute = createRoute({
	method: "post",
	path: "/:id/retire",
	request: {
		params: z.object({
			id: z.string(),
		}),
		body: {
			content: {
				"application/json": {
					schema: z.object({
						reason: z.string().optional(),
					}),
				},
			},
		},
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({
						success: z.boolean(),
					}),
				},
			},
			description: "Indicator retired successfully",
		},
		404: {
			content: {
				"application/json": {
					schema: z.object({
						error: z.string(),
					}),
				},
			},
			description: "Indicator not found",
		},
	},
	tags: ["Indicators"],
});

// @ts-expect-error - Hono OpenAPI multi-response type inference limitation
app.openapi(retireIndicatorRoute, async (c) => {
	const { id } = c.req.valid("param");
	const { reason } = c.req.valid("json");
	const repo = getIndicatorsRepo();

	const ind = await repo.findById(id);
	if (!ind) {
		throw new HTTPException(404, { message: "Indicator not found or already retired" });
	}

	if (ind.status === "retired") {
		throw new HTTPException(404, { message: "Indicator not found or already retired" });
	}

	await repo.retire(id, reason ?? "Manual retirement");

	return c.json({ success: true });
});

// ============================================
// Export
// ============================================

export default app;
