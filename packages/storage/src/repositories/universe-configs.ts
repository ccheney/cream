/**
 * Universe Configs Repository (Drizzle ORM)
 *
 * Data access for universe_configs table. Manages trading universe configuration
 * with draft/testing/active/archived workflow.
 */
import { and, desc, eq } from "drizzle-orm";
import { type Database, getDb } from "../db";
import { universeConfigs } from "../schema/config";
import { RepositoryError } from "./base";

// ============================================
// Types
// ============================================

export type UniverseSource = "static" | "index" | "screener";
export type UniverseConfigStatus = "draft" | "testing" | "active" | "archived";
export type UniverseEnvironment = "PAPER" | "LIVE";

export interface UniverseConfig {
	id: string;
	environment: UniverseEnvironment;
	source: UniverseSource;
	staticSymbols: string[] | null;
	indexSource: string | null;
	minVolume: number | null;
	minMarketCap: number | null;
	optionableOnly: boolean;
	includeList: string[];
	excludeList: string[];
	status: UniverseConfigStatus;
	createdAt: string;
	updatedAt: string;
}

export interface CreateUniverseConfigInput {
	id?: string;
	environment: UniverseEnvironment;
	source: UniverseSource;
	staticSymbols?: string[] | null;
	indexSource?: string | null;
	minVolume?: number | null;
	minMarketCap?: number | null;
	optionableOnly?: boolean;
	includeList?: string[];
	excludeList?: string[];
	status?: UniverseConfigStatus;
}

export interface UpdateUniverseConfigInput {
	source?: UniverseSource;
	staticSymbols?: string[] | null;
	indexSource?: string | null;
	minVolume?: number | null;
	minMarketCap?: number | null;
	optionableOnly?: boolean;
	includeList?: string[];
	excludeList?: string[];
}

// ============================================
// Row Mapping
// ============================================

type UniverseConfigRow = typeof universeConfigs.$inferSelect;
type UniverseConfigInsert = typeof universeConfigs.$inferInsert;

const UNIVERSE_DEFINED_OVERRIDE_FIELDS = [
	"source",
	"optionableOnly",
	"includeList",
	"excludeList",
] as const;

const UNIVERSE_NULLABLE_OVERRIDE_FIELDS = [
	"staticSymbols",
	"indexSource",
	"minVolume",
	"minMarketCap",
] as const;

const UNIVERSE_MUTABLE_FIELDS = [
	"source",
	"staticSymbols",
	"indexSource",
	"minVolume",
	"minMarketCap",
	"optionableOnly",
	"includeList",
	"excludeList",
] as const;

const UNIVERSE_DRAFT_DEFAULT_VALUES: Pick<
	CreateUniverseConfigInput,
	(typeof UNIVERSE_MUTABLE_FIELDS)[number]
> = {
	source: "static",
	staticSymbols: null,
	indexSource: null,
	minVolume: null,
	minMarketCap: null,
	optionableOnly: false,
	includeList: [],
	excludeList: [],
};

function applyUniverseUpdateFields(
	target: Partial<UniverseConfigInsert>,
	input: UpdateUniverseConfigInput,
): void {
	const mutableTarget = target as Record<string, unknown>;
	for (const field of UNIVERSE_MUTABLE_FIELDS) {
		const value = input[field];
		if (value !== undefined) {
			mutableTarget[field] = value;
		}
	}
}

function applyUniverseCreateOverrides(
	target: Partial<CreateUniverseConfigInput>,
	input: UpdateUniverseConfigInput,
): void {
	const mutableTarget = target as Record<string, unknown>;
	for (const field of UNIVERSE_DEFINED_OVERRIDE_FIELDS) {
		const value = input[field];
		if (value !== undefined) {
			mutableTarget[field] = value;
		}
	}

	for (const field of UNIVERSE_NULLABLE_OVERRIDE_FIELDS) {
		const value = input[field];
		if (value != null) {
			mutableTarget[field] = value;
		}
	}
}

function buildUniverseDraftUpdateData(
	input: UpdateUniverseConfigInput,
): Partial<UniverseConfigInsert> {
	const data: Partial<UniverseConfigInsert> = {
		updatedAt: new Date(),
	};

	applyUniverseUpdateFields(data, input);
	return data;
}

function buildUniverseDraftCreateInput(
	environment: UniverseEnvironment,
	input: UpdateUniverseConfigInput,
	activeConfig: UniverseConfig | null,
): CreateUniverseConfigInput {
	const draftInput: CreateUniverseConfigInput = {
		environment,
		status: "draft",
		...UNIVERSE_DRAFT_DEFAULT_VALUES,
	};

	if (activeConfig) {
		const mutableDraftInput = draftInput as unknown as Record<string, unknown>;
		const mutableActiveConfig = activeConfig as unknown as Record<string, unknown>;
		for (const field of UNIVERSE_MUTABLE_FIELDS) {
			mutableDraftInput[field] = mutableActiveConfig[field];
		}
	}

	applyUniverseCreateOverrides(draftInput, input);
	return draftInput;
}

function mapUniverseConfigRow(row: UniverseConfigRow): UniverseConfig {
	return {
		id: row.id,
		environment: row.environment as UniverseEnvironment,
		source: row.source as UniverseSource,
		staticSymbols: row.staticSymbols as string[] | null,
		indexSource: row.indexSource,
		minVolume: row.minVolume,
		minMarketCap: row.minMarketCap,
		optionableOnly: row.optionableOnly,
		includeList: (row.includeList as string[]) ?? [],
		excludeList: (row.excludeList as string[]) ?? [],
		status: row.status as UniverseConfigStatus,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

// ============================================
// Repository
// ============================================

export class UniverseConfigsRepository {
	private db: Database;

	constructor(db?: Database) {
		this.db = db ?? getDb();
	}

	async create(input: CreateUniverseConfigInput): Promise<UniverseConfig> {
		const [row] = await this.db
			.insert(universeConfigs)
			.values({
				environment: input.environment,
				source: input.source,
				staticSymbols: input.staticSymbols ?? null,
				indexSource: input.indexSource ?? null,
				minVolume: input.minVolume ?? null,
				minMarketCap: input.minMarketCap ?? null,
				optionableOnly: input.optionableOnly ?? false,
				includeList: input.includeList ?? [],
				excludeList: input.excludeList ?? [],
				status: input.status ?? "draft",
			})
			.returning();

		if (!row) {
			throw new RepositoryError(
				"Failed to create universe config",
				"CONSTRAINT_VIOLATION",
				"universe_configs",
			);
		}
		return mapUniverseConfigRow(row);
	}

	async findById(id: string): Promise<UniverseConfig | null> {
		const [row] = await this.db
			.select()
			.from(universeConfigs)
			.where(eq(universeConfigs.id, id))
			.limit(1);

		return row ? mapUniverseConfigRow(row) : null;
	}

	async findByIdOrThrow(id: string): Promise<UniverseConfig> {
		const config = await this.findById(id);
		if (!config) {
			throw RepositoryError.notFound("universe_configs", id);
		}
		return config;
	}

	async getActive(environment: UniverseEnvironment): Promise<UniverseConfig | null> {
		const [row] = await this.db
			.select()
			.from(universeConfigs)
			.where(
				and(eq(universeConfigs.environment, environment), eq(universeConfigs.status, "active")),
			)
			.limit(1);

		return row ? mapUniverseConfigRow(row) : null;
	}

	async getActiveOrThrow(environment: UniverseEnvironment): Promise<UniverseConfig> {
		const config = await this.getActive(environment);
		if (!config) {
			throw new RepositoryError(
				`No active universe config found for environment '${environment}'. Run seed script.`,
				"NOT_FOUND",
				"universe_configs",
			);
		}
		return config;
	}

	async getDraft(environment: UniverseEnvironment): Promise<UniverseConfig | null> {
		const [row] = await this.db
			.select()
			.from(universeConfigs)
			.where(and(eq(universeConfigs.environment, environment), eq(universeConfigs.status, "draft")))
			.orderBy(desc(universeConfigs.createdAt))
			.limit(1);

		return row ? mapUniverseConfigRow(row) : null;
	}

	async saveDraft(
		environment: UniverseEnvironment,
		input: UpdateUniverseConfigInput & { id?: string },
	): Promise<UniverseConfig> {
		const existingDraft = await this.getDraft(environment);

		if (existingDraft) {
			const updateData = buildUniverseDraftUpdateData(input);

			await this.db
				.update(universeConfigs)
				.set(updateData)
				.where(eq(universeConfigs.id, existingDraft.id));

			return this.findByIdOrThrow(existingDraft.id);
		}

		const activeConfig = await this.getActive(environment);

		return this.create(buildUniverseDraftCreateInput(environment, input, activeConfig));
	}

	async setStatus(id: string, status: UniverseConfigStatus): Promise<UniverseConfig> {
		const config = await this.findByIdOrThrow(id);

		if (status === "active") {
			await this.db
				.update(universeConfigs)
				.set({ status: "archived", updatedAt: new Date() })
				.where(
					and(
						eq(universeConfigs.environment, config.environment),
						eq(universeConfigs.status, "active"),
					),
				);
		}

		await this.db
			.update(universeConfigs)
			.set({ status, updatedAt: new Date() })
			.where(eq(universeConfigs.id, id));

		return this.findByIdOrThrow(id);
	}

	async getHistory(environment: UniverseEnvironment, limit = 20): Promise<UniverseConfig[]> {
		const rows = await this.db
			.select()
			.from(universeConfigs)
			.where(eq(universeConfigs.environment, environment))
			.orderBy(desc(universeConfigs.createdAt))
			.limit(limit);

		return rows.map(mapUniverseConfigRow);
	}

	async delete(id: string): Promise<boolean> {
		const config = await this.findById(id);

		if (config?.status === "active") {
			throw new RepositoryError(
				"Cannot delete active universe config",
				"CONSTRAINT_VIOLATION",
				"universe_configs",
			);
		}

		const result = await this.db
			.delete(universeConfigs)
			.where(eq(universeConfigs.id, id))
			.returning({ id: universeConfigs.id });

		return result.length > 0;
	}
}
