/**
 * Trading Config Repository (Drizzle ORM)
 *
 * Data access for trading_config table. Manages runtime trading configuration
 * with draft/testing/active/archived workflow and cross-environment promotion.
 */

import { type GlobalModel, getDefaultGlobalModel } from "@cream/domain";
import { and, desc, eq, max } from "drizzle-orm";
import { type Database, getDb } from "../db";
import { tradingConfig } from "../schema/config";
import { RepositoryError } from "./base";

// ============================================
// Types
// ============================================

export type TradingConfigStatus = "draft" | "testing" | "active" | "archived";
export type TradingEnvironment = "PAPER" | "LIVE";

export interface TradingConfig {
	id: string;
	environment: TradingEnvironment;
	version: number;

	// Consensus settings
	maxConsensusIterations: number;
	agentTimeoutMs: number;
	totalConsensusTimeoutMs: number;

	// Conviction thresholds
	convictionDeltaHold: number;
	convictionDeltaAction: number;

	// Position sizing
	highConvictionPct: number;
	mediumConvictionPct: number;
	lowConvictionPct: number;

	// Risk/reward
	minRiskRewardRatio: number;
	kellyFraction: number;

	// Schedule
	tradingCycleIntervalMs: number;
	predictionMarketsIntervalMs: number;

	// Global LLM model
	globalModel: GlobalModel;

	// Workflow
	status: TradingConfigStatus;
	createdAt: string;
	updatedAt: string;
	promotedFrom: string | null;
}

export interface CreateTradingConfigInput {
	id?: string;
	environment: TradingEnvironment;
	version?: number;

	// Consensus settings (optional - defaults provided)
	maxConsensusIterations?: number;
	agentTimeoutMs?: number;
	totalConsensusTimeoutMs?: number;

	// Conviction thresholds
	convictionDeltaHold?: number;
	convictionDeltaAction?: number;

	// Position sizing
	highConvictionPct?: number;
	mediumConvictionPct?: number;
	lowConvictionPct?: number;

	// Risk/reward
	minRiskRewardRatio?: number;
	kellyFraction?: number;

	// Schedule
	tradingCycleIntervalMs?: number;
	predictionMarketsIntervalMs?: number;

	// Global LLM model
	globalModel?: GlobalModel;

	// Workflow
	status?: TradingConfigStatus;
	promotedFrom?: string | null;
}

export interface UpdateTradingConfigInput {
	// Consensus settings
	maxConsensusIterations?: number;
	agentTimeoutMs?: number;
	totalConsensusTimeoutMs?: number;

	// Conviction thresholds
	convictionDeltaHold?: number;
	convictionDeltaAction?: number;

	// Position sizing
	highConvictionPct?: number;
	mediumConvictionPct?: number;
	lowConvictionPct?: number;

	// Risk/reward
	minRiskRewardRatio?: number;
	kellyFraction?: number;

	// Schedule
	tradingCycleIntervalMs?: number;
	predictionMarketsIntervalMs?: number;

	// Global LLM model
	globalModel?: GlobalModel;
}

// ============================================
// Row Mapping
// ============================================

type TradingConfigRow = typeof tradingConfig.$inferSelect;
type TradingConfigInsert = typeof tradingConfig.$inferInsert;

const TRADING_DIRECT_FIELDS = [
	"maxConsensusIterations",
	"agentTimeoutMs",
	"totalConsensusTimeoutMs",
	"tradingCycleIntervalMs",
	"predictionMarketsIntervalMs",
	"globalModel",
] as const;

const TRADING_DECIMAL_FIELDS = [
	"convictionDeltaHold",
	"convictionDeltaAction",
	"highConvictionPct",
	"mediumConvictionPct",
	"lowConvictionPct",
	"minRiskRewardRatio",
	"kellyFraction",
] as const;

function getTradingDefaultInsertValues(): Pick<
	TradingConfigInsert,
	(typeof TRADING_DIRECT_FIELDS)[number] | (typeof TRADING_DECIMAL_FIELDS)[number]
> {
	return {
		maxConsensusIterations: 3,
		agentTimeoutMs: 30000,
		totalConsensusTimeoutMs: 300000,
		tradingCycleIntervalMs: 3600000,
		predictionMarketsIntervalMs: 900000,
		globalModel: getDefaultGlobalModel(),
		convictionDeltaHold: "0.2",
		convictionDeltaAction: "0.3",
		highConvictionPct: "0.7",
		mediumConvictionPct: "0.5",
		lowConvictionPct: "0.25",
		minRiskRewardRatio: "1.5",
		kellyFraction: "0.5",
	};
}

function applyTradingConfigFields(
	target: Partial<TradingConfigInsert>,
	input: CreateTradingConfigInput | UpdateTradingConfigInput,
): void {
	const mutableTarget = target as Record<string, unknown>;
	for (const field of TRADING_DIRECT_FIELDS) {
		const value = input[field];
		if (value !== undefined) {
			mutableTarget[field] = value;
		}
	}

	for (const field of TRADING_DECIMAL_FIELDS) {
		const value = input[field];
		if (value !== undefined) {
			mutableTarget[field] = String(value);
		}
	}
}

function buildTradingCreateData(
	input: CreateTradingConfigInput,
	version: number,
): TradingConfigInsert {
	const data: TradingConfigInsert = {
		environment: input.environment,
		version,
		status: input.status ?? "draft",
		promotedFrom: input.promotedFrom ?? null,
		...getTradingDefaultInsertValues(),
	};

	applyTradingConfigFields(data, input);
	return data;
}

function buildTradingDraftUpdateData(
	input: UpdateTradingConfigInput,
): Partial<TradingConfigInsert> {
	const data: Partial<TradingConfigInsert> = {
		updatedAt: new Date(),
	};

	applyTradingConfigFields(data, input);
	return data;
}

function mapTradingConfigRow(row: TradingConfigRow): TradingConfig {
	return {
		id: row.id,
		environment: row.environment as TradingEnvironment,
		version: row.version,

		maxConsensusIterations: row.maxConsensusIterations ?? 3,
		agentTimeoutMs: row.agentTimeoutMs ?? 30000,
		totalConsensusTimeoutMs: row.totalConsensusTimeoutMs ?? 300000,

		convictionDeltaHold: Number(row.convictionDeltaHold ?? "0.2"),
		convictionDeltaAction: Number(row.convictionDeltaAction ?? "0.3"),

		highConvictionPct: Number(row.highConvictionPct ?? "0.7"),
		mediumConvictionPct: Number(row.mediumConvictionPct ?? "0.5"),
		lowConvictionPct: Number(row.lowConvictionPct ?? "0.25"),

		minRiskRewardRatio: Number(row.minRiskRewardRatio ?? "1.5"),
		kellyFraction: Number(row.kellyFraction ?? "0.5"),

		tradingCycleIntervalMs: row.tradingCycleIntervalMs ?? 3600000,
		predictionMarketsIntervalMs: row.predictionMarketsIntervalMs ?? 900000,

		globalModel: (row.globalModel as GlobalModel) ?? getDefaultGlobalModel(),

		status: row.status as TradingConfigStatus,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
		promotedFrom: row.promotedFrom,
	};
}

// ============================================
// Repository
// ============================================

export class TradingConfigRepository {
	private db: Database;

	constructor(db?: Database) {
		this.db = db ?? getDb();
	}

	async create(input: CreateTradingConfigInput): Promise<TradingConfig> {
		const version = input.version ?? (await this.getNextVersion(input.environment));

		const [row] = await this.db
			.insert(tradingConfig)
			.values(buildTradingCreateData(input, version))
			.returning();

		if (!row) {
			throw new RepositoryError(
				"Failed to create trading config",
				"CONSTRAINT_VIOLATION",
				"trading_config",
			);
		}
		return mapTradingConfigRow(row);
	}

	async findById(id: string): Promise<TradingConfig | null> {
		const [row] = await this.db
			.select()
			.from(tradingConfig)
			.where(eq(tradingConfig.id, id))
			.limit(1);

		return row ? mapTradingConfigRow(row) : null;
	}

	async findByIdOrThrow(id: string): Promise<TradingConfig> {
		const config = await this.findById(id);
		if (!config) {
			throw RepositoryError.notFound("trading_config", id);
		}
		return config;
	}

	async getActive(environment: TradingEnvironment): Promise<TradingConfig | null> {
		const [row] = await this.db
			.select()
			.from(tradingConfig)
			.where(and(eq(tradingConfig.environment, environment), eq(tradingConfig.status, "active")))
			.limit(1);

		return row ? mapTradingConfigRow(row) : null;
	}

	async getActiveOrThrow(environment: TradingEnvironment): Promise<TradingConfig> {
		const config = await this.getActive(environment);
		if (!config) {
			throw new RepositoryError(
				`No active trading config found for environment '${environment}'. Run seed script.`,
				"NOT_FOUND",
				"trading_config",
			);
		}
		return config;
	}

	async getDraft(environment: TradingEnvironment): Promise<TradingConfig | null> {
		const [row] = await this.db
			.select()
			.from(tradingConfig)
			.where(and(eq(tradingConfig.environment, environment), eq(tradingConfig.status, "draft")))
			.orderBy(desc(tradingConfig.createdAt))
			.limit(1);

		return row ? mapTradingConfigRow(row) : null;
	}

	async saveDraft(
		environment: TradingEnvironment,
		input: UpdateTradingConfigInput & { id?: string; version?: number },
	): Promise<TradingConfig> {
		const existingDraft = await this.getDraft(environment);

		if (existingDraft) {
			const updateData = buildTradingDraftUpdateData(input);

			await this.db
				.update(tradingConfig)
				.set(updateData)
				.where(eq(tradingConfig.id, existingDraft.id));

			return this.findByIdOrThrow(existingDraft.id);
		}

		const activeConfig = await this.getActive(environment);
		const nextVersion = activeConfig ? activeConfig.version + 1 : 1;

		return this.create({
			environment,
			version: input.version ?? nextVersion,
			status: "draft",
			...input,
		});
	}

	async setStatus(id: string, status: TradingConfigStatus): Promise<TradingConfig> {
		const config = await this.findByIdOrThrow(id);

		if (status === "active") {
			await this.db
				.update(tradingConfig)
				.set({ status: "archived", updatedAt: new Date() })
				.where(
					and(
						eq(tradingConfig.environment, config.environment),
						eq(tradingConfig.status, "active"),
					),
				);
		}

		await this.db
			.update(tradingConfig)
			.set({ status, updatedAt: new Date() })
			.where(eq(tradingConfig.id, id));

		return this.findByIdOrThrow(id);
	}

	async getHistory(environment: TradingEnvironment, limit = 20): Promise<TradingConfig[]> {
		const rows = await this.db
			.select()
			.from(tradingConfig)
			.where(eq(tradingConfig.environment, environment))
			.orderBy(desc(tradingConfig.version), desc(tradingConfig.createdAt))
			.limit(limit);

		return rows.map(mapTradingConfigRow);
	}

	async compare(
		id1: string,
		id2: string,
	): Promise<{
		config1: TradingConfig;
		config2: TradingConfig;
		differences: { field: string; value1: unknown; value2: unknown }[];
	}> {
		const config1 = await this.findByIdOrThrow(id1);
		const config2 = await this.findByIdOrThrow(id2);

		const fieldsToCompare: (keyof TradingConfig)[] = [
			"maxConsensusIterations",
			"agentTimeoutMs",
			"totalConsensusTimeoutMs",
			"convictionDeltaHold",
			"convictionDeltaAction",
			"highConvictionPct",
			"mediumConvictionPct",
			"lowConvictionPct",
			"minRiskRewardRatio",
			"kellyFraction",
			"tradingCycleIntervalMs",
			"predictionMarketsIntervalMs",
			"globalModel",
		];

		const differences: { field: string; value1: unknown; value2: unknown }[] = [];

		for (const field of fieldsToCompare) {
			if (config1[field] !== config2[field]) {
				differences.push({
					field,
					value1: config1[field],
					value2: config2[field],
				});
			}
		}

		return { config1, config2, differences };
	}

	async promote(sourceId: string, targetEnvironment: TradingEnvironment): Promise<TradingConfig> {
		const source = await this.findByIdOrThrow(sourceId);

		if (source.status !== "active") {
			throw new RepositoryError(
				`Cannot promote config with status '${source.status}'. Only active configs can be promoted.`,
				"CONSTRAINT_VIOLATION",
				"trading_config",
			);
		}

		const targetActive = await this.getActive(targetEnvironment);
		const nextVersion = targetActive ? targetActive.version + 1 : 1;

		return this.create({
			environment: targetEnvironment,
			version: nextVersion,
			maxConsensusIterations: source.maxConsensusIterations,
			agentTimeoutMs: source.agentTimeoutMs,
			totalConsensusTimeoutMs: source.totalConsensusTimeoutMs,
			convictionDeltaHold: source.convictionDeltaHold,
			convictionDeltaAction: source.convictionDeltaAction,
			highConvictionPct: source.highConvictionPct,
			mediumConvictionPct: source.mediumConvictionPct,
			lowConvictionPct: source.lowConvictionPct,
			minRiskRewardRatio: source.minRiskRewardRatio,
			kellyFraction: source.kellyFraction,
			tradingCycleIntervalMs: source.tradingCycleIntervalMs,
			predictionMarketsIntervalMs: source.predictionMarketsIntervalMs,
			globalModel: source.globalModel,
			status: "draft",
			promotedFrom: sourceId,
		});
	}

	async delete(id: string): Promise<boolean> {
		const config = await this.findById(id);

		if (config?.status === "active") {
			throw new RepositoryError(
				"Cannot delete active trading config",
				"CONSTRAINT_VIOLATION",
				"trading_config",
			);
		}

		const result = await this.db
			.delete(tradingConfig)
			.where(eq(tradingConfig.id, id))
			.returning({ id: tradingConfig.id });

		return result.length > 0;
	}

	async getNextVersion(environment: TradingEnvironment): Promise<number> {
		const result = await this.db
			.select({ maxVersion: max(tradingConfig.version) })
			.from(tradingConfig)
			.where(eq(tradingConfig.environment, environment));

		return (result[0]?.maxVersion ?? 0) + 1;
	}
}
