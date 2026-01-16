/**
 * Factor Zoo Repository (Drizzle ORM)
 *
 * Data access for the Factor Zoo system that manages alpha factors
 * throughout their lifecycle.
 *
 * @see docs/plans/20-research-to-production-pipeline.md
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type {
	DailyMetrics,
	Factor,
	FactorCorrelation,
	FactorPerformance,
	FactorStatus,
	FactorZooStats,
	Hypothesis,
	HypothesisStatus,
	NewFactor,
	NewHypothesis,
	NewResearchRun,
	ResearchBudgetStatus,
	ResearchPhase,
	ResearchRun,
	TargetRegime,
} from "@cream/domain";
import { getDb, type Database } from "../db";
import {
	factorCorrelations,
	factorPerformance,
	factors,
	hypotheses,
	researchRuns,
} from "../schema/factors";

// ============================================
// Row Mapping
// ============================================

type HypothesisRow = typeof hypotheses.$inferSelect;
type FactorRow = typeof factors.$inferSelect;
type PerformanceRow = typeof factorPerformance.$inferSelect;
type CorrelationRow = typeof factorCorrelations.$inferSelect;
type ResearchRunRow = typeof researchRuns.$inferSelect;

function parseJsonText<T>(text: string | null, defaultValue: T): T {
	if (!text) return defaultValue;
	try {
		return JSON.parse(text) as T;
	} catch {
		return defaultValue;
	}
}

function mapHypothesisRow(row: HypothesisRow): Hypothesis {
	return {
		hypothesisId: row.hypothesisId,
		title: row.title,
		economicRationale: row.economicRationale,
		marketMechanism: row.marketMechanism,
		targetRegime: row.targetRegime as Hypothesis["targetRegime"],
		falsificationCriteria: parseJsonText(row.falsificationCriteria, null),
		status: row.status as HypothesisStatus,
		iteration: row.iteration,
		parentHypothesisId: row.parentHypothesisId,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

function mapFactorRow(row: FactorRow): Factor {
	return {
		factorId: row.factorId,
		hypothesisId: row.hypothesisId,
		name: row.name,
		status: row.status as FactorStatus,
		version: row.version,
		author: row.author,
		pythonModule: row.pythonModule,
		typescriptModule: row.typescriptModule,
		symbolicLength: row.symbolicLength,
		parameterCount: row.parameterCount,
		featureCount: row.featureCount,
		originalityScore: row.originalityScore ? Number(row.originalityScore) : null,
		hypothesisAlignment: row.hypothesisAlignment ? Number(row.hypothesisAlignment) : null,
		stage1Sharpe: row.stage1Sharpe ? Number(row.stage1Sharpe) : null,
		stage1Ic: row.stage1Ic ? Number(row.stage1Ic) : null,
		stage1MaxDrawdown: row.stage1MaxDrawdown ? Number(row.stage1MaxDrawdown) : null,
		stage1CompletedAt: row.stage1CompletedAt?.toISOString() ?? null,
		stage2Pbo: row.stage2Pbo ? Number(row.stage2Pbo) : null,
		stage2DsrPvalue: row.stage2DsrPvalue ? Number(row.stage2DsrPvalue) : null,
		stage2Wfe: row.stage2Wfe ? Number(row.stage2Wfe) : null,
		stage2CompletedAt: row.stage2CompletedAt?.toISOString() ?? null,
		paperValidationPassed: row.paperValidationPassed === 1,
		paperStartDate: row.paperStartDate?.toISOString() ?? null,
		paperEndDate: row.paperEndDate?.toISOString() ?? null,
		paperRealizedSharpe: row.paperRealizedSharpe ? Number(row.paperRealizedSharpe) : null,
		paperRealizedIc: row.paperRealizedIc ? Number(row.paperRealizedIc) : null,
		currentWeight: row.currentWeight ? Number(row.currentWeight) : 0,
		lastIc: row.lastIc ? Number(row.lastIc) : null,
		decayRate: row.decayRate ? Number(row.decayRate) : null,
		targetRegimes: (row.targetRegimes as TargetRegime[] | null) ?? null,
		parityReport: parseJsonText<Record<string, unknown> | null>(row.parityReport, null),
		parityValidatedAt: row.parityValidatedAt?.toISOString() ?? null,
		createdAt: row.createdAt.toISOString(),
		promotedAt: row.promotedAt?.toISOString() ?? null,
		retiredAt: row.retiredAt?.toISOString() ?? null,
		lastUpdated: row.lastUpdated.toISOString(),
	};
}

function mapPerformanceRow(row: PerformanceRow): FactorPerformance {
	return {
		id: row.id,
		factorId: row.factorId,
		date: row.date.toISOString(),
		ic: Number(row.ic),
		icir: row.icir ? Number(row.icir) : null,
		sharpe: row.sharpe ? Number(row.sharpe) : null,
		weight: Number(row.weight),
		signalCount: row.signalCount,
		createdAt: row.createdAt.toISOString(),
	};
}

function mapCorrelationRow(row: CorrelationRow): FactorCorrelation {
	return {
		factorId1: row.factorId1,
		factorId2: row.factorId2,
		correlation: Number(row.correlation),
		computedAt: row.computedAt.toISOString(),
	};
}

function mapResearchRunRow(row: ResearchRunRow): ResearchRun {
	return {
		runId: row.runId,
		triggerType: row.triggerType as ResearchRun["triggerType"],
		triggerReason: row.triggerReason,
		phase: row.phase as ResearchPhase,
		currentIteration: row.currentIteration,
		hypothesisId: row.hypothesisId,
		factorId: row.factorId,
		prUrl: row.prUrl,
		errorMessage: row.errorMessage,
		tokensUsed: row.tokensUsed ?? 0,
		computeHours: row.computeHours ? Number(row.computeHours) : 0,
		startedAt: row.startedAt.toISOString(),
		completedAt: row.completedAt?.toISOString() ?? null,
	};
}

// ============================================
// Repository
// ============================================

export class FactorZooRepository {
	private db: Database;

	constructor(db?: Database) {
		this.db = db ?? getDb();
	}

	// ============================================
	// Hypothesis CRUD
	// ============================================

	async createHypothesis(input: NewHypothesis): Promise<Hypothesis> {
		const [row] = await this.db
			.insert(hypotheses)
			.values({
				hypothesisId: input.hypothesisId,
				title: input.title,
				economicRationale: input.economicRationale,
				marketMechanism: input.marketMechanism,
				targetRegime: input.targetRegime,
				falsificationCriteria: input.falsificationCriteria
					? JSON.stringify(input.falsificationCriteria)
					: null,
				status: input.status as typeof hypotheses.$inferInsert.status,
				iteration: input.iteration,
				parentHypothesisId: input.parentHypothesisId,
			})
			.returning();

		return mapHypothesisRow(row);
	}

	async findHypothesisById(id: string): Promise<Hypothesis | null> {
		const [row] = await this.db
			.select()
			.from(hypotheses)
			.where(eq(hypotheses.hypothesisId, id))
			.limit(1);

		return row ? mapHypothesisRow(row) : null;
	}

	async updateHypothesisStatus(id: string, status: HypothesisStatus): Promise<void> {
		await this.db
			.update(hypotheses)
			.set({
				status: status as typeof hypotheses.$inferInsert.status,
				updatedAt: new Date(),
			})
			.where(eq(hypotheses.hypothesisId, id));
	}

	async findHypothesesByStatus(status: HypothesisStatus): Promise<Hypothesis[]> {
		const rows = await this.db
			.select()
			.from(hypotheses)
			.where(eq(hypotheses.status, status as typeof hypotheses.$inferSelect.status));

		return rows.map(mapHypothesisRow);
	}

	// ============================================
	// Factor CRUD
	// ============================================

	async createFactor(input: NewFactor): Promise<Factor> {
		const [row] = await this.db
			.insert(factors)
			.values({
				factorId: input.factorId,
				hypothesisId: input.hypothesisId,
				name: input.name,
				status: input.status as typeof factors.$inferInsert.status,
				version: input.version,
				author: input.author,
				pythonModule: input.pythonModule,
				typescriptModule: input.typescriptModule,
				symbolicLength: input.symbolicLength,
				parameterCount: input.parameterCount,
				featureCount: input.featureCount,
				originalityScore: input.originalityScore?.toString(),
				hypothesisAlignment: input.hypothesisAlignment?.toString(),
				stage1Sharpe: input.stage1Sharpe?.toString(),
				stage1Ic: input.stage1Ic?.toString(),
				stage1MaxDrawdown: input.stage1MaxDrawdown?.toString(),
				stage1CompletedAt: input.stage1CompletedAt ? new Date(input.stage1CompletedAt) : null,
				stage2Pbo: input.stage2Pbo?.toString(),
				stage2DsrPvalue: input.stage2DsrPvalue?.toString(),
				stage2Wfe: input.stage2Wfe?.toString(),
				stage2CompletedAt: input.stage2CompletedAt ? new Date(input.stage2CompletedAt) : null,
				paperValidationPassed: input.paperValidationPassed ? 1 : 0,
				paperStartDate: input.paperStartDate ? new Date(input.paperStartDate) : null,
				paperEndDate: input.paperEndDate ? new Date(input.paperEndDate) : null,
				paperRealizedSharpe: input.paperRealizedSharpe?.toString(),
				paperRealizedIc: input.paperRealizedIc?.toString(),
				currentWeight: input.currentWeight?.toString() ?? "0.0",
				lastIc: input.lastIc?.toString(),
				decayRate: input.decayRate?.toString(),
				targetRegimes: input.targetRegimes ?? null,
				promotedAt: input.promotedAt ? new Date(input.promotedAt) : null,
				retiredAt: input.retiredAt ? new Date(input.retiredAt) : null,
			})
			.returning();

		return mapFactorRow(row);
	}

	async findFactorById(id: string): Promise<Factor | null> {
		const [row] = await this.db
			.select()
			.from(factors)
			.where(eq(factors.factorId, id))
			.limit(1);

		return row ? mapFactorRow(row) : null;
	}

	async findActiveFactors(): Promise<Factor[]> {
		const rows = await this.db
			.select()
			.from(factors)
			.where(eq(factors.status, "active"))
			.orderBy(desc(sql`${factors.currentWeight}::numeric`));

		return rows.map(mapFactorRow);
	}

	async findDecayingFactors(): Promise<Factor[]> {
		const rows = await this.db
			.select()
			.from(factors)
			.where(eq(factors.status, "decaying"))
			.orderBy(sql`${factors.decayRate}::numeric ASC`);

		return rows.map(mapFactorRow);
	}

	async findFactorsByStatus(status: FactorStatus): Promise<Factor[]> {
		const rows = await this.db
			.select()
			.from(factors)
			.where(eq(factors.status, status as typeof factors.$inferSelect.status));

		return rows.map(mapFactorRow);
	}

	async updateFactorStatus(id: string, status: FactorStatus): Promise<void> {
		const now = new Date();
		const updates: Record<string, unknown> = {
			status,
			lastUpdated: now,
		};

		if (status === "active") {
			updates.promotedAt = now;
		} else if (status === "retired") {
			updates.retiredAt = now;
		}

		await this.db
			.update(factors)
			.set(updates)
			.where(eq(factors.factorId, id));
	}

	async promote(factorId: string, parityReport?: Record<string, unknown>): Promise<void> {
		const now = new Date();

		if (parityReport) {
			await this.db
				.update(factors)
				.set({
					status: "active" as typeof factors.$inferInsert.status,
					promotedAt: now,
					parityReport: JSON.stringify(parityReport),
					parityValidatedAt: now,
					lastUpdated: now,
				})
				.where(eq(factors.factorId, factorId));
		} else {
			await this.updateFactorStatus(factorId, "active");
		}
	}

	async updateParityValidation(
		factorId: string,
		parityReport: Record<string, unknown>
	): Promise<void> {
		const now = new Date();

		await this.db
			.update(factors)
			.set({
				parityReport: JSON.stringify(parityReport),
				parityValidatedAt: now,
				lastUpdated: now,
			})
			.where(eq(factors.factorId, factorId));
	}

	async markDecaying(factorId: string, decayRate: number): Promise<void> {
		await this.db
			.update(factors)
			.set({
				status: "decaying" as typeof factors.$inferInsert.status,
				decayRate: decayRate.toString(),
				lastUpdated: new Date(),
			})
			.where(eq(factors.factorId, factorId));
	}

	async retire(factorId: string): Promise<void> {
		await this.updateFactorStatus(factorId, "retired");
	}

	async updateTargetRegimes(factorId: string, regimes: TargetRegime[]): Promise<void> {
		await this.db
			.update(factors)
			.set({
				targetRegimes: regimes,
				lastUpdated: new Date(),
			})
			.where(eq(factors.factorId, factorId));
	}

	async findFactorsByTargetRegime(regime: TargetRegime): Promise<Factor[]> {
		const rows = await this.db
			.select()
			.from(factors)
			.where(
				and(
					eq(factors.status, "active"),
					sql`${factors.targetRegimes} IS NOT NULL AND (
						${factors.targetRegimes}::jsonb @> ${JSON.stringify([regime])}::jsonb
						OR ${factors.targetRegimes}::jsonb @> '["all"]'::jsonb
					)`
				)
			);

		return rows.map(mapFactorRow);
	}

	async getRegimeCoverage(): Promise<Map<TargetRegime, Factor[]>> {
		const activeFactors = await this.findActiveFactors();
		const allRegimes: TargetRegime[] = ["bull", "bear", "sideways", "volatile"];
		const coverage = new Map<TargetRegime, Factor[]>();

		for (const regime of allRegimes) {
			coverage.set(regime, []);
		}

		for (const factor of activeFactors) {
			const regimes = factor.targetRegimes ?? [];
			for (const regime of regimes) {
				if (regime === "all") {
					for (const r of allRegimes) {
						coverage.get(r)?.push(factor);
					}
				} else {
					coverage.get(regime)?.push(factor);
				}
			}
		}

		return coverage;
	}

	// ============================================
	// Performance Tracking
	// ============================================

	async recordDailyPerformance(factorId: string, metrics: DailyMetrics): Promise<void> {
		const now = new Date();

		await this.db
			.insert(factorPerformance)
			.values({
				factorId,
				date: new Date(metrics.date),
				ic: metrics.ic.toString(),
				icir: metrics.icir?.toString(),
				sharpe: metrics.sharpe?.toString(),
				weight: (metrics.weight ?? 0).toString(),
				signalCount: metrics.signalCount ?? 0,
			})
			.onConflictDoUpdate({
				target: [factorPerformance.factorId, factorPerformance.date],
				set: {
					ic: metrics.ic.toString(),
					icir: metrics.icir?.toString(),
					sharpe: metrics.sharpe?.toString(),
					weight: (metrics.weight ?? 0).toString(),
					signalCount: metrics.signalCount ?? 0,
				},
			});

		await this.db
			.update(factors)
			.set({
				lastIc: metrics.ic.toString(),
				lastUpdated: now,
			})
			.where(eq(factors.factorId, factorId));
	}

	async getPerformanceHistory(factorId: string, days: number): Promise<FactorPerformance[]> {
		const rows = await this.db
			.select()
			.from(factorPerformance)
			.where(eq(factorPerformance.factorId, factorId))
			.orderBy(desc(factorPerformance.date))
			.limit(days);

		return rows.map(mapPerformanceRow);
	}

	// ============================================
	// Correlation Tracking
	// ============================================

	async updateCorrelations(correlations: FactorCorrelation[]): Promise<void> {
		const now = new Date();

		for (const corr of correlations) {
			const [id1, id2] =
				corr.factorId1 < corr.factorId2
					? [corr.factorId1, corr.factorId2]
					: [corr.factorId2, corr.factorId1];

			await this.db
				.insert(factorCorrelations)
				.values({
					factorId1: id1,
					factorId2: id2,
					correlation: corr.correlation.toString(),
					computedAt: now,
				})
				.onConflictDoUpdate({
					target: [factorCorrelations.factorId1, factorCorrelations.factorId2],
					set: {
						correlation: corr.correlation.toString(),
						computedAt: now,
					},
				});
		}
	}

	async getCorrelationMatrix(): Promise<Map<string, Map<string, number>>> {
		const activeFactorRows = await this.db
			.select({ factorId: factors.factorId })
			.from(factors)
			.where(eq(factors.status, "active"));

		const activeFactorIds = activeFactorRows.map((r) => r.factorId);

		if (activeFactorIds.length === 0) {
			return new Map();
		}

		const rows = await this.db
			.select()
			.from(factorCorrelations)
			.where(
				and(
					inArray(factorCorrelations.factorId1, activeFactorIds),
					inArray(factorCorrelations.factorId2, activeFactorIds)
				)
			);

		const matrix = new Map<string, Map<string, number>>();

		for (const row of rows) {
			const corr = mapCorrelationRow(row);

			let map1 = matrix.get(corr.factorId1);
			if (!map1) {
				map1 = new Map();
				matrix.set(corr.factorId1, map1);
			}
			let map2 = matrix.get(corr.factorId2);
			if (!map2) {
				map2 = new Map();
				matrix.set(corr.factorId2, map2);
			}

			map1.set(corr.factorId2, corr.correlation);
			map2.set(corr.factorId1, corr.correlation);
		}

		return matrix;
	}

	// ============================================
	// Weight Management
	// ============================================

	async updateWeights(weights: Map<string, number>): Promise<void> {
		const now = new Date();

		for (const [factorId, weight] of weights) {
			await this.db
				.update(factors)
				.set({
					currentWeight: weight.toString(),
					lastUpdated: now,
				})
				.where(eq(factors.factorId, factorId));
		}
	}

	async getActiveWeights(): Promise<Map<string, number>> {
		const rows = await this.db
			.select({
				factorId: factors.factorId,
				currentWeight: factors.currentWeight,
			})
			.from(factors)
			.where(eq(factors.status, "active"));

		const weights = new Map<string, number>();
		for (const row of rows) {
			weights.set(row.factorId, row.currentWeight ? Number(row.currentWeight) : 0);
		}
		return weights;
	}

	// ============================================
	// Research Runs
	// ============================================

	async createResearchRun(input: NewResearchRun): Promise<ResearchRun> {
		const [row] = await this.db
			.insert(researchRuns)
			.values({
				runId: input.runId,
				triggerType: input.triggerType as typeof researchRuns.$inferInsert.triggerType,
				triggerReason: input.triggerReason,
				phase: input.phase as typeof researchRuns.$inferInsert.phase,
				currentIteration: input.currentIteration,
				hypothesisId: input.hypothesisId,
				factorId: input.factorId,
				prUrl: input.prUrl,
				errorMessage: input.errorMessage,
				tokensUsed: input.tokensUsed,
				computeHours: input.computeHours?.toString() ?? "0.0",
				completedAt: input.completedAt ? new Date(input.completedAt) : null,
			})
			.returning();

		return mapResearchRunRow(row);
	}

	async findResearchRunById(id: string): Promise<ResearchRun | null> {
		const [row] = await this.db
			.select()
			.from(researchRuns)
			.where(eq(researchRuns.runId, id))
			.limit(1);

		return row ? mapResearchRunRow(row) : null;
	}

	async updateResearchRun(runId: string, updates: Partial<ResearchRun>): Promise<void> {
		const updateObj: Record<string, unknown> = {};

		if (updates.phase !== undefined) {
			updateObj.phase = updates.phase;
		}
		if (updates.currentIteration !== undefined) {
			updateObj.currentIteration = updates.currentIteration;
		}
		if (updates.hypothesisId !== undefined) {
			updateObj.hypothesisId = updates.hypothesisId;
		}
		if (updates.factorId !== undefined) {
			updateObj.factorId = updates.factorId;
		}
		if (updates.prUrl !== undefined) {
			updateObj.prUrl = updates.prUrl;
		}
		if (updates.errorMessage !== undefined) {
			updateObj.errorMessage = updates.errorMessage;
		}
		if (updates.tokensUsed !== undefined) {
			updateObj.tokensUsed = updates.tokensUsed;
		}
		if (updates.computeHours !== undefined) {
			updateObj.computeHours = updates.computeHours.toString();
		}
		if (updates.completedAt !== undefined) {
			updateObj.completedAt = updates.completedAt ? new Date(updates.completedAt) : null;
		}

		if (Object.keys(updateObj).length === 0) {
			return;
		}

		await this.db
			.update(researchRuns)
			.set(updateObj)
			.where(eq(researchRuns.runId, runId));
	}

	async findActiveResearchRuns(): Promise<ResearchRun[]> {
		const rows = await this.db
			.select()
			.from(researchRuns)
			.where(
				sql`${researchRuns.phase} NOT IN ('completed', 'failed')`
			)
			.orderBy(desc(researchRuns.startedAt));

		return rows.map(mapResearchRunRow);
	}

	async findLastCompletedResearchRun(): Promise<ResearchRun | null> {
		const [row] = await this.db
			.select()
			.from(researchRuns)
			.where(eq(researchRuns.phase, "completed"))
			.orderBy(desc(researchRuns.completedAt))
			.limit(1);

		return row ? mapResearchRunRow(row) : null;
	}

	async getResearchBudgetStatus(
		maxMonthlyTokens = 0,
		maxMonthlyComputeHours = 0
	): Promise<ResearchBudgetStatus> {
		const now = new Date();
		const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);

		const [result] = await this.db
			.select({
				totalTokens: sql<number>`COALESCE(SUM(${researchRuns.tokensUsed}), 0)::int`,
				totalCompute: sql<number>`COALESCE(SUM(${researchRuns.computeHours}::numeric), 0)`,
				runCount: sql<number>`COUNT(*)::int`,
			})
			.from(researchRuns)
			.where(sql`${researchRuns.startedAt} >= ${periodStart}`);

		const tokensUsedThisMonth = result?.totalTokens ?? 0;
		const computeHoursThisMonth = result?.totalCompute ?? 0;
		const runsThisMonth = result?.runCount ?? 0;

		const tokenExhausted = maxMonthlyTokens > 0 && tokensUsedThisMonth >= maxMonthlyTokens;
		const computeExhausted =
			maxMonthlyComputeHours > 0 && computeHoursThisMonth >= maxMonthlyComputeHours;
		const isExhausted = tokenExhausted || computeExhausted;

		return {
			tokensUsedThisMonth,
			computeHoursThisMonth,
			runsThisMonth,
			maxMonthlyTokens,
			maxMonthlyComputeHours,
			isExhausted,
			periodStart: periodStart.toISOString(),
		};
	}

	// ============================================
	// Statistics
	// ============================================

	async getStats(): Promise<FactorZooStats> {
		const [factorStatsResult, hypothesisStatsResult, avgIcResult, totalWeightResult] =
			await Promise.all([
				this.db
					.select({
						status: factors.status,
						count: sql<number>`COUNT(*)::int`,
					})
					.from(factors)
					.groupBy(factors.status),
				this.db
					.select({
						status: hypotheses.status,
						count: sql<number>`COUNT(*)::int`,
					})
					.from(hypotheses)
					.groupBy(hypotheses.status),
				this.db
					.select({
						avgIc: sql<number>`AVG(${factors.lastIc}::numeric)`,
					})
					.from(factors)
					.where(eq(factors.status, "active")),
				this.db
					.select({
						totalWeight: sql<number>`SUM(${factors.currentWeight}::numeric)`,
					})
					.from(factors)
					.where(eq(factors.status, "active")),
			]);

		const factorCounts: Record<string, number> = {};
		for (const row of factorStatsResult) {
			factorCounts[row.status] = row.count;
		}

		const hypothesisCounts: Record<string, number> = {};
		for (const row of hypothesisStatsResult) {
			hypothesisCounts[row.status] = row.count;
		}

		return {
			totalFactors: Object.values(factorCounts).reduce((a, b) => a + b, 0),
			activeFactors: factorCounts.active ?? 0,
			decayingFactors: factorCounts.decaying ?? 0,
			researchFactors: factorCounts.research ?? 0,
			retiredFactors: factorCounts.retired ?? 0,
			averageIc: avgIcResult[0]?.avgIc ?? 0,
			totalWeight: totalWeightResult[0]?.totalWeight ?? 0,
			hypothesesValidated: hypothesisCounts.validated ?? 0,
			hypothesesRejected: hypothesisCounts.rejected ?? 0,
		};
	}
}
