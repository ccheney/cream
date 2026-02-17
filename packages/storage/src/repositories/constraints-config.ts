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
type ConstraintsConfigInsert = typeof constraintsConfig.$inferInsert;

const CONSTRAINTS_DIRECT_FIELDS = ["maxShares", "maxContracts", "maxPositions"] as const;
const CONSTRAINTS_DECIMAL_FIELDS = [
	"maxNotional",
	"maxPctEquity",
	"maxGrossExposure",
	"maxNetExposure",
	"maxConcentration",
	"maxCorrelation",
	"maxDrawdown",
	"maxRiskPerTrade",
	"maxSectorExposure",
	"maxDelta",
	"maxGamma",
	"maxVega",
	"maxTheta",
] as const;

const CONSTRAINTS_DEFAULT_INSERT_VALUES: Pick<
	ConstraintsConfigInsert,
	(typeof CONSTRAINTS_DIRECT_FIELDS)[number] | (typeof CONSTRAINTS_DECIMAL_FIELDS)[number]
> = {
	maxShares: 1000,
	maxContracts: 10,
	maxPositions: 10,
	maxNotional: "50000",
	maxPctEquity: "0.1",
	maxGrossExposure: "2",
	maxNetExposure: "1",
	maxConcentration: "0.25",
	maxCorrelation: "0.7",
	maxDrawdown: "0.15",
	maxRiskPerTrade: "0.02",
	maxSectorExposure: "0.3",
	maxDelta: "100",
	maxGamma: "50",
	maxVega: "1000",
	maxTheta: "500",
};

function applyConstraintsNumericFields(
	target: Partial<ConstraintsConfigInsert>,
	input: CreateConstraintsConfigInput | UpdateConstraintsConfigInput,
): void {
	for (const field of CONSTRAINTS_DIRECT_FIELDS) {
		const value = input[field];
		if (value !== undefined) {
			target[field] = value;
		}
	}

	for (const field of CONSTRAINTS_DECIMAL_FIELDS) {
		const value = input[field];
		if (value !== undefined) {
			target[field] = String(value);
		}
	}
}

function buildConstraintsCreateData(input: CreateConstraintsConfigInput): ConstraintsConfigInsert {
	const data: ConstraintsConfigInsert = {
		environment: input.environment,
		status: input.status ?? "draft",
		...CONSTRAINTS_DEFAULT_INSERT_VALUES,
	};

	applyConstraintsNumericFields(data, input);
	return data;
}

function buildConstraintsDraftUpdateData(
	input: UpdateConstraintsConfigInput,
): Partial<ConstraintsConfigInsert> {
	const data: Partial<ConstraintsConfigInsert> = {
		updatedAt: new Date(),
	};

	applyConstraintsNumericFields(data, input);
	return data;
}

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
			.values(buildConstraintsCreateData(input))
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
			const updateData = buildConstraintsDraftUpdateData(input);

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
