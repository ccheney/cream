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
				"universe_configs"
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
				and(eq(universeConfigs.environment, environment), eq(universeConfigs.status, "active"))
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
				"universe_configs"
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
		input: UpdateUniverseConfigInput & { id?: string }
	): Promise<UniverseConfig> {
		const existingDraft = await this.getDraft(environment);

		if (existingDraft) {
			const updateData: Partial<typeof universeConfigs.$inferInsert> = {
				updatedAt: new Date(),
			};

			if (input.source !== undefined) {
				updateData.source = input.source;
			}
			if (input.staticSymbols !== undefined) {
				updateData.staticSymbols = input.staticSymbols;
			}
			if (input.indexSource !== undefined) {
				updateData.indexSource = input.indexSource;
			}
			if (input.minVolume !== undefined) {
				updateData.minVolume = input.minVolume;
			}
			if (input.minMarketCap !== undefined) {
				updateData.minMarketCap = input.minMarketCap;
			}
			if (input.optionableOnly !== undefined) {
				updateData.optionableOnly = input.optionableOnly;
			}
			if (input.includeList !== undefined) {
				updateData.includeList = input.includeList;
			}
			if (input.excludeList !== undefined) {
				updateData.excludeList = input.excludeList;
			}

			await this.db
				.update(universeConfigs)
				.set(updateData)
				.where(eq(universeConfigs.id, existingDraft.id));

			return this.findByIdOrThrow(existingDraft.id);
		}

		const activeConfig = await this.getActive(environment);

		return this.create({
			environment,
			source: input.source ?? activeConfig?.source ?? "static",
			staticSymbols: input.staticSymbols ?? activeConfig?.staticSymbols ?? null,
			indexSource: input.indexSource ?? activeConfig?.indexSource ?? null,
			minVolume: input.minVolume ?? activeConfig?.minVolume ?? null,
			minMarketCap: input.minMarketCap ?? activeConfig?.minMarketCap ?? null,
			optionableOnly: input.optionableOnly ?? activeConfig?.optionableOnly ?? false,
			includeList: input.includeList ?? activeConfig?.includeList ?? [],
			excludeList: input.excludeList ?? activeConfig?.excludeList ?? [],
			status: "draft",
		});
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
						eq(universeConfigs.status, "active")
					)
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
				"universe_configs"
			);
		}

		const result = await this.db
			.delete(universeConfigs)
			.where(eq(universeConfigs.id, id))
			.returning({ id: universeConfigs.id });

		return result.length > 0;
	}
}
