/**
 * Indicators Repository (Drizzle ORM)
 *
 * @see docs/plans/19-dynamic-indicator-synthesis.md
 */
import { and, avg, count, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, type Database } from "../db";
import {
	indicatorIcHistory,
	indicators,
	indicatorTrials,
} from "../schema/indicators";
import { RepositoryError } from "./base";

// ============================================
// Types
// ============================================

export type IndicatorCategory = "momentum" | "trend" | "volatility" | "volume" | "custom";
export type IndicatorStatus = "staging" | "paper" | "production" | "retired";

export interface ValidationReport {
	trialsCount: number;
	rawSharpe: number;
	deflatedSharpe: number;
	probabilityOfOverfit: number;
	informationCoefficient: number;
	icStandardDev: number;
	maxDrawdown: number;
	calmarRatio?: number;
	sortinoRatio?: number;
	walkForwardPeriods: WalkForwardPeriod[];
	validatedAt: string;
}

export interface WalkForwardPeriod {
	startDate: string;
	endDate: string;
	inSampleSharpe: number;
	outOfSampleSharpe: number;
	informationCoefficient: number;
}

export interface PaperTradingReport {
	periodStart: string;
	periodEnd: string;
	tradingDays: number;
	realizedSharpe: number;
	expectedSharpe: number;
	sharpeTrackingError: number;
	realizedIC: number;
	expectedIC: number;
	signalsGenerated: number;
	profitableSignalRate: number;
	returnCorrelation: number;
	recommendation: "PROMOTE" | "EXTEND" | "RETIRE";
	generatedAt: string;
}

export interface TrialParameters {
	lookback?: number;
	smoothing?: number;
	upperThreshold?: number;
	lowerThreshold?: number;
	custom?: Record<string, unknown>;
}

export interface Indicator {
	id: string;
	name: string;
	category: IndicatorCategory;
	status: IndicatorStatus;
	hypothesis: string;
	economicRationale: string;
	generatedAt: string;
	generatedBy: string;
	codeHash: string | null;
	astSignature: string | null;
	validationReport: ValidationReport | null;
	paperTradingStart: string | null;
	paperTradingEnd: string | null;
	paperTradingReport: PaperTradingReport | null;
	promotedAt: string | null;
	prUrl: string | null;
	mergedAt: string | null;
	retiredAt: string | null;
	retirementReason: string | null;
	similarTo: string | null;
	replaces: string | null;
	parityReport: Record<string, unknown> | null;
	parityValidatedAt: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface IndicatorTrial {
	id: string;
	indicatorId: string;
	trialNumber: number;
	hypothesis: string;
	parameters: TrialParameters;
	sharpeRatio: number | null;
	informationCoefficient: number | null;
	maxDrawdown: number | null;
	calmarRatio: number | null;
	sortinoRatio: number | null;
	selected: boolean;
	createdAt: string;
}

export interface IndicatorICHistory {
	id: string;
	indicatorId: string;
	date: string;
	icValue: number;
	icStd: number;
	decisionsUsedIn: number;
	decisionsCorrect: number;
	createdAt: string;
}

export interface CreateIndicatorInput {
	id?: string;
	name: string;
	category: IndicatorCategory;
	hypothesis: string;
	economicRationale: string;
	generatedBy: string;
	codeHash?: string;
	astSignature?: string;
	similarTo?: string;
	replaces?: string;
}

export interface CreateIndicatorTrialInput {
	id?: string;
	indicatorId: string;
	trialNumber: number;
	hypothesis: string;
	parameters: TrialParameters;
}

export interface CreateIndicatorICHistoryInput {
	id?: string;
	indicatorId: string;
	date: string;
	icValue: number;
	icStd: number;
	decisionsUsedIn?: number;
	decisionsCorrect?: number;
}

export interface IndicatorFilters {
	status?: IndicatorStatus | IndicatorStatus[];
	category?: IndicatorCategory;
	generatedBy?: string;
	codeHash?: string;
}

export interface ICHistoryFilters {
	startDate?: string;
	endDate?: string;
	limit?: number;
}

export interface PaginationOptions {
	page?: number;
	pageSize?: number;
}

export interface PaginatedResult<T> {
	data: T[];
	total: number;
	page: number;
	pageSize: number;
	totalPages: number;
}

// ============================================
// Row Mapping
// ============================================

type IndicatorRow = typeof indicators.$inferSelect;
type TrialRow = typeof indicatorTrials.$inferSelect;
type ICHistoryRow = typeof indicatorIcHistory.$inferSelect;

function parseJsonReport<T>(value: string | null): T | null {
	if (!value) return null;
	try {
		return JSON.parse(value) as T;
	} catch {
		return null;
	}
}

function mapIndicatorRow(row: IndicatorRow): Indicator {
	return {
		id: row.id,
		name: row.name,
		category: row.category as IndicatorCategory,
		status: row.status as IndicatorStatus,
		hypothesis: row.hypothesis,
		economicRationale: row.economicRationale,
		generatedAt: row.generatedAt.toISOString(),
		generatedBy: row.generatedBy,
		codeHash: row.codeHash,
		astSignature: row.astSignature,
		validationReport: parseJsonReport<ValidationReport>(row.validationReport),
		paperTradingStart: row.paperTradingStart?.toISOString() ?? null,
		paperTradingEnd: row.paperTradingEnd?.toISOString() ?? null,
		paperTradingReport: parseJsonReport<PaperTradingReport>(row.paperTradingReport),
		promotedAt: row.promotedAt?.toISOString() ?? null,
		prUrl: row.prUrl,
		mergedAt: row.mergedAt?.toISOString() ?? null,
		retiredAt: row.retiredAt?.toISOString() ?? null,
		retirementReason: row.retirementReason,
		similarTo: row.similarTo,
		replaces: row.replaces,
		parityReport: parseJsonReport<Record<string, unknown>>(row.parityReport),
		parityValidatedAt: row.parityValidatedAt?.toISOString() ?? null,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

function mapTrialRow(row: TrialRow): IndicatorTrial {
	return {
		id: row.id,
		indicatorId: row.indicatorId,
		trialNumber: row.trialNumber,
		hypothesis: row.hypothesis,
		parameters: row.parameters as TrialParameters,
		sharpeRatio: row.sharpeRatio ? Number(row.sharpeRatio) : null,
		informationCoefficient: row.informationCoefficient ? Number(row.informationCoefficient) : null,
		maxDrawdown: row.maxDrawdown ? Number(row.maxDrawdown) : null,
		calmarRatio: row.calmarRatio ? Number(row.calmarRatio) : null,
		sortinoRatio: row.sortinoRatio ? Number(row.sortinoRatio) : null,
		selected: row.selected,
		createdAt: row.createdAt.toISOString(),
	};
}

function mapICHistoryRow(row: ICHistoryRow): IndicatorICHistory {
	return {
		id: row.id,
		indicatorId: row.indicatorId,
		date: row.date.toISOString(),
		icValue: Number(row.icValue),
		icStd: Number(row.icStd),
		decisionsUsedIn: row.decisionsUsedIn,
		decisionsCorrect: row.decisionsCorrect,
		createdAt: row.createdAt.toISOString(),
	};
}

// ============================================
// Repository
// ============================================

export class IndicatorsRepository {
	private db: Database;

	constructor(db?: Database) {
		this.db = db ?? getDb();
	}

	async create(input: CreateIndicatorInput): Promise<Indicator> {
		const [row] = await this.db
			.insert(indicators)
			.values({
				name: input.name,
				category: input.category,
				status: "staging",
				hypothesis: input.hypothesis,
				economicRationale: input.economicRationale,
				generatedAt: new Date(),
				generatedBy: input.generatedBy,
				codeHash: input.codeHash ?? null,
				astSignature: input.astSignature ?? null,
				similarTo: input.similarTo ?? null,
				replaces: input.replaces ?? null,
			})
			.returning();

		return mapIndicatorRow(row);
	}

	async findById(id: string): Promise<Indicator | null> {
		const [row] = await this.db
			.select()
			.from(indicators)
			.where(eq(indicators.id, id))
			.limit(1);

		return row ? mapIndicatorRow(row) : null;
	}

	async findByIdOrThrow(id: string): Promise<Indicator> {
		const indicator = await this.findById(id);
		if (!indicator) {
			throw RepositoryError.notFound("indicators", id);
		}
		return indicator;
	}

	async findByName(name: string): Promise<Indicator | null> {
		const [row] = await this.db
			.select()
			.from(indicators)
			.where(eq(indicators.name, name))
			.limit(1);

		return row ? mapIndicatorRow(row) : null;
	}

	async findByCodeHash(codeHash: string): Promise<Indicator | null> {
		const [row] = await this.db
			.select()
			.from(indicators)
			.where(eq(indicators.codeHash, codeHash))
			.limit(1);

		return row ? mapIndicatorRow(row) : null;
	}

	async findMany(
		filters?: IndicatorFilters,
		pagination?: PaginationOptions
	): Promise<PaginatedResult<Indicator>> {
		const conditions = [];

		if (filters?.status) {
			if (Array.isArray(filters.status)) {
				conditions.push(inArray(indicators.status, filters.status));
			} else {
				conditions.push(eq(indicators.status, filters.status));
			}
		}
		if (filters?.category) {
			conditions.push(eq(indicators.category, filters.category));
		}
		if (filters?.generatedBy) {
			conditions.push(eq(indicators.generatedBy, filters.generatedBy));
		}
		if (filters?.codeHash) {
			conditions.push(eq(indicators.codeHash, filters.codeHash));
		}

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
		const page = pagination?.page ?? 1;
		const pageSize = pagination?.pageSize ?? 50;
		const offset = (page - 1) * pageSize;

		const [countResult] = await this.db
			.select({ count: count() })
			.from(indicators)
			.where(whereClause);

		const rows = await this.db
			.select()
			.from(indicators)
			.where(whereClause)
			.orderBy(desc(indicators.createdAt))
			.limit(pageSize)
			.offset(offset);

		const total = countResult?.count ?? 0;

		return {
			data: rows.map(mapIndicatorRow),
			total,
			page,
			pageSize,
			totalPages: Math.ceil(total / pageSize),
		};
	}

	async findActive(): Promise<Indicator[]> {
		const rows = await this.db
			.select()
			.from(indicators)
			.where(inArray(indicators.status, ["paper", "production"]))
			.orderBy(desc(indicators.createdAt));

		return rows.map(mapIndicatorRow);
	}

	async findProduction(): Promise<Indicator[]> {
		const rows = await this.db
			.select()
			.from(indicators)
			.where(eq(indicators.status, "production"))
			.orderBy(desc(indicators.createdAt));

		return rows.map(mapIndicatorRow);
	}

	async updateStatus(id: string, status: IndicatorStatus): Promise<Indicator> {
		const [row] = await this.db
			.update(indicators)
			.set({ status, updatedAt: new Date() })
			.where(eq(indicators.id, id))
			.returning();

		if (!row) {
			throw RepositoryError.notFound("indicators", id);
		}

		return mapIndicatorRow(row);
	}

	async saveValidationReport(id: string, report: ValidationReport): Promise<Indicator> {
		const [row] = await this.db
			.update(indicators)
			.set({
				validationReport: JSON.stringify(report),
				updatedAt: new Date(),
			})
			.where(eq(indicators.id, id))
			.returning();

		if (!row) {
			throw RepositoryError.notFound("indicators", id);
		}

		return mapIndicatorRow(row);
	}

	async startPaperTrading(id: string, startTimestamp: string): Promise<Indicator> {
		const [row] = await this.db
			.update(indicators)
			.set({
				status: "paper",
				paperTradingStart: new Date(startTimestamp),
				updatedAt: new Date(),
			})
			.where(eq(indicators.id, id))
			.returning();

		if (!row) {
			throw RepositoryError.notFound("indicators", id);
		}

		return mapIndicatorRow(row);
	}

	async endPaperTrading(
		id: string,
		endTimestamp: string,
		report: PaperTradingReport
	): Promise<Indicator> {
		const [row] = await this.db
			.update(indicators)
			.set({
				paperTradingEnd: new Date(endTimestamp),
				paperTradingReport: JSON.stringify(report),
				updatedAt: new Date(),
			})
			.where(eq(indicators.id, id))
			.returning();

		if (!row) {
			throw RepositoryError.notFound("indicators", id);
		}

		return mapIndicatorRow(row);
	}

	async promote(
		id: string,
		prUrl: string,
		parityReport?: Record<string, unknown>
	): Promise<Indicator> {
		const now = new Date();
		const updateData: Partial<typeof indicators.$inferInsert> = {
			status: "production",
			promotedAt: now,
			prUrl,
			updatedAt: now,
		};

		if (parityReport) {
			updateData.parityReport = JSON.stringify(parityReport);
			updateData.parityValidatedAt = now;
		}

		const [row] = await this.db
			.update(indicators)
			.set(updateData)
			.where(eq(indicators.id, id))
			.returning();

		if (!row) {
			throw RepositoryError.notFound("indicators", id);
		}

		return mapIndicatorRow(row);
	}

	async updateParityValidation(
		id: string,
		parityReport: Record<string, unknown>
	): Promise<Indicator> {
		const now = new Date();

		const [row] = await this.db
			.update(indicators)
			.set({
				parityReport: JSON.stringify(parityReport),
				parityValidatedAt: now,
				updatedAt: now,
			})
			.where(eq(indicators.id, id))
			.returning();

		if (!row) {
			throw RepositoryError.notFound("indicators", id);
		}

		return mapIndicatorRow(row);
	}

	async markMerged(id: string): Promise<Indicator> {
		const now = new Date();

		const [row] = await this.db
			.update(indicators)
			.set({ mergedAt: now, updatedAt: now })
			.where(eq(indicators.id, id))
			.returning();

		if (!row) {
			throw RepositoryError.notFound("indicators", id);
		}

		return mapIndicatorRow(row);
	}

	async retire(id: string, reason: string): Promise<Indicator> {
		const now = new Date();

		const [row] = await this.db
			.update(indicators)
			.set({
				status: "retired",
				retiredAt: now,
				retirementReason: reason,
				updatedAt: now,
			})
			.where(eq(indicators.id, id))
			.returning();

		if (!row) {
			throw RepositoryError.notFound("indicators", id);
		}

		return mapIndicatorRow(row);
	}

	async delete(id: string): Promise<boolean> {
		const result = await this.db
			.delete(indicators)
			.where(eq(indicators.id, id))
			.returning({ id: indicators.id });

		return result.length > 0;
	}

	// ============================================
	// Trials CRUD
	// ============================================

	async createTrial(input: CreateIndicatorTrialInput): Promise<IndicatorTrial> {
		const [row] = await this.db
			.insert(indicatorTrials)
			.values({
				indicatorId: input.indicatorId,
				trialNumber: input.trialNumber,
				hypothesis: input.hypothesis,
				parameters: input.parameters,
			})
			.returning();

		return mapTrialRow(row);
	}

	async findTrialById(id: string): Promise<IndicatorTrial | null> {
		const [row] = await this.db
			.select()
			.from(indicatorTrials)
			.where(eq(indicatorTrials.id, id))
			.limit(1);

		return row ? mapTrialRow(row) : null;
	}

	async findTrialsByIndicatorId(indicatorId: string): Promise<IndicatorTrial[]> {
		const rows = await this.db
			.select()
			.from(indicatorTrials)
			.where(eq(indicatorTrials.indicatorId, indicatorId))
			.orderBy(indicatorTrials.trialNumber);

		return rows.map(mapTrialRow);
	}

	async updateTrialResults(
		id: string,
		results: {
			sharpeRatio?: number;
			informationCoefficient?: number;
			maxDrawdown?: number;
			calmarRatio?: number;
			sortinoRatio?: number;
		}
	): Promise<IndicatorTrial> {
		const updateData: Partial<typeof indicatorTrials.$inferInsert> = {};

		if (results.sharpeRatio !== undefined) {
			updateData.sharpeRatio = String(results.sharpeRatio);
		}
		if (results.informationCoefficient !== undefined) {
			updateData.informationCoefficient = String(results.informationCoefficient);
		}
		if (results.maxDrawdown !== undefined) {
			updateData.maxDrawdown = String(results.maxDrawdown);
		}
		if (results.calmarRatio !== undefined) {
			updateData.calmarRatio = String(results.calmarRatio);
		}
		if (results.sortinoRatio !== undefined) {
			updateData.sortinoRatio = String(results.sortinoRatio);
		}

		if (Object.keys(updateData).length === 0) {
			const trial = await this.findTrialById(id);
			if (!trial) {
				throw RepositoryError.notFound("indicator_trials", id);
			}
			return trial;
		}

		const [row] = await this.db
			.update(indicatorTrials)
			.set(updateData)
			.where(eq(indicatorTrials.id, id))
			.returning();

		if (!row) {
			throw RepositoryError.notFound("indicator_trials", id);
		}

		return mapTrialRow(row);
	}

	async selectTrial(id: string): Promise<IndicatorTrial> {
		const trial = await this.findTrialById(id);
		if (!trial) {
			throw RepositoryError.notFound("indicator_trials", id);
		}

		// Deselect all trials for this indicator
		await this.db
			.update(indicatorTrials)
			.set({ selected: false })
			.where(eq(indicatorTrials.indicatorId, trial.indicatorId));

		// Select this trial
		const [row] = await this.db
			.update(indicatorTrials)
			.set({ selected: true })
			.where(eq(indicatorTrials.id, id))
			.returning();

		return mapTrialRow(row);
	}

	async getTrialCount(indicatorId: string): Promise<number> {
		const [result] = await this.db
			.select({ count: count() })
			.from(indicatorTrials)
			.where(eq(indicatorTrials.indicatorId, indicatorId));

		return result?.count ?? 0;
	}

	// ============================================
	// IC History CRUD
	// ============================================

	async recordICHistory(input: CreateIndicatorICHistoryInput): Promise<IndicatorICHistory> {
		const [row] = await this.db
			.insert(indicatorIcHistory)
			.values({
				indicatorId: input.indicatorId,
				date: new Date(input.date),
				icValue: String(input.icValue),
				icStd: String(input.icStd),
				decisionsUsedIn: input.decisionsUsedIn ?? 0,
				decisionsCorrect: input.decisionsCorrect ?? 0,
			})
			.returning();

		return mapICHistoryRow(row);
	}

	async findICHistoryById(id: string): Promise<IndicatorICHistory | null> {
		const [row] = await this.db
			.select()
			.from(indicatorIcHistory)
			.where(eq(indicatorIcHistory.id, id))
			.limit(1);

		return row ? mapICHistoryRow(row) : null;
	}

	async findICHistoryByIndicatorId(
		indicatorId: string,
		filters?: ICHistoryFilters
	): Promise<IndicatorICHistory[]> {
		const conditions = [eq(indicatorIcHistory.indicatorId, indicatorId)];

		if (filters?.startDate) {
			conditions.push(
				sql`${indicatorIcHistory.date} >= ${new Date(filters.startDate)}`
			);
		}
		if (filters?.endDate) {
			conditions.push(
				sql`${indicatorIcHistory.date} <= ${new Date(filters.endDate)}`
			);
		}

		let query = this.db
			.select()
			.from(indicatorIcHistory)
			.where(and(...conditions))
			.orderBy(desc(indicatorIcHistory.date));

		if (filters?.limit) {
			query = query.limit(filters.limit);
		}

		const rows = await query;
		return rows.map(mapICHistoryRow);
	}

	async getAverageIC(indicatorId: string, days?: number): Promise<number | null> {
		let query;

		if (days) {
			// Get average of most recent N entries
			const subquery = this.db
				.select({ icValue: indicatorIcHistory.icValue })
				.from(indicatorIcHistory)
				.where(eq(indicatorIcHistory.indicatorId, indicatorId))
				.orderBy(desc(indicatorIcHistory.date))
				.limit(days);

			const [result] = await this.db
				.select({ avgIc: sql<string>`AVG(sub.ic_value::numeric)` })
				.from(sql`(${subquery}) as sub`);

			return result?.avgIc ? Number(result.avgIc) : null;
		} else {
			const [result] = await this.db
				.select({ avgIc: sql<string>`AVG(${indicatorIcHistory.icValue}::numeric)` })
				.from(indicatorIcHistory)
				.where(eq(indicatorIcHistory.indicatorId, indicatorId));

			return result?.avgIc ? Number(result.avgIc) : null;
		}
	}
}
