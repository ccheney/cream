/**
 * Config Versions Repository (Drizzle ORM)
 *
 * Data access for config_versions table. Manages version-controlled
 * configuration with activation/deactivation tracking.
 */
import { and, desc, eq } from "drizzle-orm";
import { type Database, getDb } from "../db";
import { configVersions } from "../schema/core-trading";
import { RepositoryError } from "./base";

// ============================================
// Types
// ============================================

export interface ConfigVersion {
	id: string;
	environment: string;
	config: Record<string, unknown>;
	description: string | null;
	active: boolean;
	createdAt: string;
	createdBy: string | null;
	activatedAt: string | null;
	deactivatedAt: string | null;
}

export interface CreateConfigVersionInput {
	id?: string;
	environment: string;
	config: Record<string, unknown>;
	description?: string | null;
	createdBy?: string | null;
}

// ============================================
// Row Mapping
// ============================================

type ConfigVersionRow = typeof configVersions.$inferSelect;

function mapConfigVersionRow(row: ConfigVersionRow): ConfigVersion {
	return {
		id: row.id,
		environment: row.environment,
		config: row.configJson ?? {},
		description: row.description,
		active: row.active,
		createdAt: row.createdAt.toISOString(),
		createdBy: row.createdBy,
		activatedAt: row.activatedAt?.toISOString() ?? null,
		deactivatedAt: row.deactivatedAt?.toISOString() ?? null,
	};
}

// ============================================
// Repository
// ============================================

export class ConfigVersionsRepository {
	private db: Database;

	constructor(db?: Database) {
		this.db = db ?? getDb();
	}

	async create(input: CreateConfigVersionInput): Promise<ConfigVersion> {
		const [row] = await this.db
			.insert(configVersions)
			.values({
				environment: input.environment as "BACKTEST" | "PAPER" | "LIVE",
				configJson: input.config,
				description: input.description ?? null,
				active: false,
				createdBy: input.createdBy ?? null,
			})
			.returning();

		if (!row) {
			throw new Error("Failed to create config version");
		}
		return mapConfigVersionRow(row);
	}

	async findById(id: string): Promise<ConfigVersion | null> {
		const [row] = await this.db
			.select()
			.from(configVersions)
			.where(eq(configVersions.id, id))
			.limit(1);

		return row ? mapConfigVersionRow(row) : null;
	}

	async findByIdOrThrow(id: string): Promise<ConfigVersion> {
		const config = await this.findById(id);
		if (!config) {
			throw RepositoryError.notFound("config_versions", id);
		}
		return config;
	}

	async getActive(environment: string): Promise<ConfigVersion | null> {
		const [row] = await this.db
			.select()
			.from(configVersions)
			.where(
				and(
					eq(configVersions.environment, environment as "BACKTEST" | "PAPER" | "LIVE"),
					eq(configVersions.active, true)
				)
			)
			.limit(1);

		return row ? mapConfigVersionRow(row) : null;
	}

	async getActiveOrThrow(environment: string): Promise<ConfigVersion> {
		const config = await this.getActive(environment);
		if (!config) {
			throw new RepositoryError(
				`No active config found for environment '${environment}'`,
				"NOT_FOUND",
				"config_versions"
			);
		}
		return config;
	}

	async findByEnvironment(environment: string, limit = 20): Promise<ConfigVersion[]> {
		const rows = await this.db
			.select()
			.from(configVersions)
			.where(eq(configVersions.environment, environment as "BACKTEST" | "PAPER" | "LIVE"))
			.orderBy(desc(configVersions.createdAt))
			.limit(limit);

		return rows.map(mapConfigVersionRow);
	}

	async activate(id: string): Promise<ConfigVersion> {
		const config = await this.findByIdOrThrow(id);
		const now = new Date();

		await this.db
			.update(configVersions)
			.set({ active: false, deactivatedAt: now })
			.where(
				and(
					eq(configVersions.environment, config.environment as "BACKTEST" | "PAPER" | "LIVE"),
					eq(configVersions.active, true)
				)
			);

		await this.db
			.update(configVersions)
			.set({ active: true, activatedAt: now })
			.where(eq(configVersions.id, id));

		return this.findByIdOrThrow(id);
	}

	async deactivate(id: string): Promise<ConfigVersion> {
		const config = await this.findById(id);
		if (!config) {
			throw RepositoryError.notFound("config_versions", id);
		}

		await this.db
			.update(configVersions)
			.set({ active: false, deactivatedAt: new Date() })
			.where(eq(configVersions.id, id));

		return this.findByIdOrThrow(id);
	}

	async compare(
		id1: string,
		id2: string
	): Promise<{
		config1: ConfigVersion;
		config2: ConfigVersion;
		differences: { path: string; value1: unknown; value2: unknown }[];
	}> {
		const config1 = await this.findByIdOrThrow(id1);
		const config2 = await this.findByIdOrThrow(id2);

		const differences: { path: string; value1: unknown; value2: unknown }[] = [];
		const allKeys = new Set(Object.keys(config1.config)).union(
			new Set(Object.keys(config2.config))
		);

		for (const key of allKeys) {
			const v1 = config1.config[key];
			const v2 = config2.config[key];

			if (JSON.stringify(v1) !== JSON.stringify(v2)) {
				differences.push({ path: key, value1: v1, value2: v2 });
			}
		}

		return { config1, config2, differences };
	}

	async delete(id: string): Promise<boolean> {
		const config = await this.findById(id);

		if (config?.active) {
			throw new RepositoryError(
				"Cannot delete active config version",
				"CONSTRAINT_VIOLATION",
				"config_versions"
			);
		}

		const result = await this.db
			.delete(configVersions)
			.where(eq(configVersions.id, id))
			.returning({ id: configVersions.id });

		return result.length > 0;
	}

	async getHistory(
		environment: string,
		limit = 50
	): Promise<{
		versions: ConfigVersion[];
		activationHistory: { id: string; activatedAt: string; deactivatedAt: string | null }[];
	}> {
		const versions = await this.findByEnvironment(environment, limit);

		const activationHistory = versions
			.filter((v): v is ConfigVersion & { activatedAt: string } => v.activatedAt !== null)
			.map((v) => ({
				id: v.id,
				activatedAt: v.activatedAt,
				deactivatedAt: v.deactivatedAt,
			}))
			.sort((a, b) => b.activatedAt.localeCompare(a.activatedAt));

		return { versions, activationHistory };
	}
}
