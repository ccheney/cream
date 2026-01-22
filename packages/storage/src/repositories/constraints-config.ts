/**
 * Constraints Config Repository (Drizzle ORM)
 *
 * Data access for constraints_config table. Manages risk limits configuration
 * with draft/testing/active/archived workflow.
 */
import { and, desc, eq } from "drizzle-orm";
import { type Database, getDb } from "../db";
import { constraintsConfig } from "../schema/config";
import { RepositoryError } from "./base";

// ============================================
// Types
// ============================================

export type ConstraintsConfigStatus = "draft" | "testing" | "active" | "archived";
export type ConstraintsEnvironment = "PAPER" | "LIVE";

export interface PerInstrumentLimits {
	maxShares: number;
	maxContracts: number;
	maxNotional: number;
	maxPctEquity: number;
}

export interface PortfolioLimits {
	maxGrossExposure: number;
	maxNetExposure: number;
	maxConcentration: number;
	maxCorrelation: number;
	maxDrawdown: number;
	maxRiskPerTrade: number;
	maxSectorExposure: number;
	maxPositions: number;
}

export interface OptionsLimits {
	maxDelta: number;
	maxGamma: number;
	maxVega: number;
	maxTheta: number;
}

export interface ConstraintsConfig {
	id: string;
	environment: ConstraintsEnvironment;
	perInstrument: PerInstrumentLimits;
	portfolio: PortfolioLimits;
	options: OptionsLimits;
	status: ConstraintsConfigStatus;
	createdAt: string;
	updatedAt: string;
}

export interface CreateConstraintsConfigInput {
	id?: string;
	environment: ConstraintsEnvironment;
	maxShares?: number;
	maxContracts?: number;
	maxNotional?: number;
	maxPctEquity?: number;
	maxGrossExposure?: number;
	maxNetExposure?: number;
	maxConcentration?: number;
	maxCorrelation?: number;
	maxDrawdown?: number;
	maxRiskPerTrade?: number;
	maxSectorExposure?: number;
	maxPositions?: number;
	maxDelta?: number;
	maxGamma?: number;
	maxVega?: number;
	maxTheta?: number;
	status?: ConstraintsConfigStatus;
}

export interface UpdateConstraintsConfigInput {
	maxShares?: number;
	maxContracts?: number;
	maxNotional?: number;
	maxPctEquity?: number;
	maxGrossExposure?: number;
	maxNetExposure?: number;
	maxConcentration?: number;
	maxCorrelation?: number;
	maxDrawdown?: number;
	maxRiskPerTrade?: number;
	maxSectorExposure?: number;
	maxPositions?: number;
	maxDelta?: number;
	maxGamma?: number;
	maxVega?: number;
	maxTheta?: number;
}

// ============================================
// Row Mapping
// ============================================

type ConstraintsConfigRow = typeof constraintsConfig.$inferSelect;

function mapConstraintsConfigRow(row: ConstraintsConfigRow): ConstraintsConfig {
	return {
		id: row.id,
		environment: row.environment as ConstraintsEnvironment,

		perInstrument: {
			maxShares: row.maxShares,
			maxContracts: row.maxContracts,
			maxNotional: Number(row.maxNotional),
			maxPctEquity: Number(row.maxPctEquity),
		},

		portfolio: {
			maxGrossExposure: Number(row.maxGrossExposure),
			maxNetExposure: Number(row.maxNetExposure),
			maxConcentration: Number(row.maxConcentration),
			maxCorrelation: Number(row.maxCorrelation),
			maxDrawdown: Number(row.maxDrawdown),
			maxRiskPerTrade: Number(row.maxRiskPerTrade),
			maxSectorExposure: Number(row.maxSectorExposure),
			maxPositions: row.maxPositions,
		},

		options: {
			maxDelta: Number(row.maxDelta),
			maxGamma: Number(row.maxGamma),
			maxVega: Number(row.maxVega),
			maxTheta: Number(row.maxTheta),
		},

		status: row.status as ConstraintsConfigStatus,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

// ============================================
// Repository
// ============================================

export class ConstraintsConfigRepository {
	private db: Database;

	constructor(db?: Database) {
		this.db = db ?? getDb();
	}

	async create(input: CreateConstraintsConfigInput): Promise<ConstraintsConfig> {
		const [row] = await this.db
			.insert(constraintsConfig)
			.values({
				environment: input.environment,
				maxShares: input.maxShares ?? 1000,
				maxContracts: input.maxContracts ?? 10,
				maxNotional: String(input.maxNotional ?? 50000),
				maxPctEquity: String(input.maxPctEquity ?? 0.1),
				maxGrossExposure: String(input.maxGrossExposure ?? 2.0),
				maxNetExposure: String(input.maxNetExposure ?? 1.0),
				maxConcentration: String(input.maxConcentration ?? 0.25),
				maxCorrelation: String(input.maxCorrelation ?? 0.7),
				maxDrawdown: String(input.maxDrawdown ?? 0.15),
				maxRiskPerTrade: String(input.maxRiskPerTrade ?? 0.02),
				maxSectorExposure: String(input.maxSectorExposure ?? 0.3),
				maxPositions: input.maxPositions ?? 10,
				maxDelta: String(input.maxDelta ?? 100),
				maxGamma: String(input.maxGamma ?? 50),
				maxVega: String(input.maxVega ?? 1000),
				maxTheta: String(input.maxTheta ?? 500),
				status: input.status ?? "draft",
			})
			.returning();

		if (!row) {
			throw new Error("Failed to create constraints config");
		}
		return mapConstraintsConfigRow(row);
	}

	async findById(id: string): Promise<ConstraintsConfig | null> {
		const [row] = await this.db
			.select()
			.from(constraintsConfig)
			.where(eq(constraintsConfig.id, id))
			.limit(1);

		return row ? mapConstraintsConfigRow(row) : null;
	}

	async findByIdOrThrow(id: string): Promise<ConstraintsConfig> {
		const config = await this.findById(id);
		if (!config) {
			throw RepositoryError.notFound("constraints_config", id);
		}
		return config;
	}

	async getActive(environment: ConstraintsEnvironment): Promise<ConstraintsConfig | null> {
		const [row] = await this.db
			.select()
			.from(constraintsConfig)
			.where(
				and(eq(constraintsConfig.environment, environment), eq(constraintsConfig.status, "active")),
			)
			.limit(1);

		return row ? mapConstraintsConfigRow(row) : null;
	}

	async getActiveOrThrow(environment: ConstraintsEnvironment): Promise<ConstraintsConfig> {
		const config = await this.getActive(environment);
		if (!config) {
			throw new RepositoryError(
				`No active constraints config found for environment '${environment}'. Run seed script.`,
				"NOT_FOUND",
				"constraints_config",
			);
		}
		return config;
	}

	async getDraft(environment: ConstraintsEnvironment): Promise<ConstraintsConfig | null> {
		const [row] = await this.db
			.select()
			.from(constraintsConfig)
			.where(
				and(eq(constraintsConfig.environment, environment), eq(constraintsConfig.status, "draft")),
			)
			.orderBy(desc(constraintsConfig.createdAt))
			.limit(1);

		return row ? mapConstraintsConfigRow(row) : null;
	}

	async saveDraft(
		environment: ConstraintsEnvironment,
		input: UpdateConstraintsConfigInput & { id?: string },
	): Promise<ConstraintsConfig> {
		const existingDraft = await this.getDraft(environment);

		if (existingDraft) {
			const updateData: Partial<typeof constraintsConfig.$inferInsert> = {
				updatedAt: new Date(),
			};

			if (input.maxShares !== undefined) {
				updateData.maxShares = input.maxShares;
			}
			if (input.maxContracts !== undefined) {
				updateData.maxContracts = input.maxContracts;
			}
			if (input.maxNotional !== undefined) {
				updateData.maxNotional = String(input.maxNotional);
			}
			if (input.maxPctEquity !== undefined) {
				updateData.maxPctEquity = String(input.maxPctEquity);
			}
			if (input.maxGrossExposure !== undefined) {
				updateData.maxGrossExposure = String(input.maxGrossExposure);
			}
			if (input.maxNetExposure !== undefined) {
				updateData.maxNetExposure = String(input.maxNetExposure);
			}
			if (input.maxConcentration !== undefined) {
				updateData.maxConcentration = String(input.maxConcentration);
			}
			if (input.maxCorrelation !== undefined) {
				updateData.maxCorrelation = String(input.maxCorrelation);
			}
			if (input.maxDrawdown !== undefined) {
				updateData.maxDrawdown = String(input.maxDrawdown);
			}
			if (input.maxRiskPerTrade !== undefined) {
				updateData.maxRiskPerTrade = String(input.maxRiskPerTrade);
			}
			if (input.maxSectorExposure !== undefined) {
				updateData.maxSectorExposure = String(input.maxSectorExposure);
			}
			if (input.maxPositions !== undefined) {
				updateData.maxPositions = input.maxPositions;
			}
			if (input.maxDelta !== undefined) {
				updateData.maxDelta = String(input.maxDelta);
			}
			if (input.maxGamma !== undefined) {
				updateData.maxGamma = String(input.maxGamma);
			}
			if (input.maxVega !== undefined) {
				updateData.maxVega = String(input.maxVega);
			}
			if (input.maxTheta !== undefined) {
				updateData.maxTheta = String(input.maxTheta);
			}

			await this.db
				.update(constraintsConfig)
				.set(updateData)
				.where(eq(constraintsConfig.id, existingDraft.id));

			return this.findByIdOrThrow(existingDraft.id);
		}

		return this.create({
			environment,
			status: "draft",
			...input,
		});
	}

	async setStatus(id: string, status: ConstraintsConfigStatus): Promise<ConstraintsConfig> {
		const config = await this.findByIdOrThrow(id);

		if (status === "active") {
			await this.db
				.update(constraintsConfig)
				.set({ status: "archived", updatedAt: new Date() })
				.where(
					and(
						eq(constraintsConfig.environment, config.environment),
						eq(constraintsConfig.status, "active"),
					),
				);
		}

		await this.db
			.update(constraintsConfig)
			.set({ status, updatedAt: new Date() })
			.where(eq(constraintsConfig.id, id));

		return this.findByIdOrThrow(id);
	}

	async getHistory(environment: ConstraintsEnvironment, limit = 20): Promise<ConstraintsConfig[]> {
		const rows = await this.db
			.select()
			.from(constraintsConfig)
			.where(eq(constraintsConfig.environment, environment))
			.orderBy(desc(constraintsConfig.createdAt))
			.limit(limit);

		return rows.map(mapConstraintsConfigRow);
	}

	async delete(id: string): Promise<boolean> {
		const config = await this.findById(id);

		if (config?.status === "active") {
			throw new RepositoryError(
				"Cannot delete active constraints config",
				"CONSTRAINT_VIOLATION",
				"constraints_config",
			);
		}

		const result = await this.db
			.delete(constraintsConfig)
			.where(eq(constraintsConfig.id, id))
			.returning({ id: constraintsConfig.id });

		return result.length > 0;
	}
}
