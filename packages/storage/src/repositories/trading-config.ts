/**
 * Trading Config Repository
 *
 * Data access for trading_config table. Manages runtime trading configuration
 * with draft/testing/active/archived workflow and cross-environment promotion.
 *
 * @see docs/plans/22-self-service-dashboard.md (Phase 1)
 */

import { DEFAULT_GLOBAL_MODEL, type GlobalModel } from "@cream/domain";
import type { Row, TursoClient } from "../turso.js";
import { RepositoryError } from "./base.js";

// ============================================
// Types
// ============================================

/**
 * Trading configuration status
 */
export type TradingConfigStatus = "draft" | "testing" | "active" | "archived";

/**
 * Trading environment
 */
export type TradingEnvironment = "BACKTEST" | "PAPER" | "LIVE";

/**
 * Trading configuration entity
 */
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

/**
 * Create trading config input
 */
export interface CreateTradingConfigInput {
	id: string;
	environment: TradingEnvironment;
	version: number;

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

/**
 * Update trading config input (partial)
 */
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
// Row Mapper
// ============================================

function mapTradingConfigRow(row: Row): TradingConfig {
	return {
		id: row.id as string,
		environment: row.environment as TradingEnvironment,
		version: row.version as number,

		// Consensus settings
		maxConsensusIterations: row.max_consensus_iterations as number,
		agentTimeoutMs: row.agent_timeout_ms as number,
		totalConsensusTimeoutMs: row.total_consensus_timeout_ms as number,

		// Conviction thresholds
		convictionDeltaHold: row.conviction_delta_hold as number,
		convictionDeltaAction: row.conviction_delta_action as number,

		// Position sizing
		highConvictionPct: row.high_conviction_pct as number,
		mediumConvictionPct: row.medium_conviction_pct as number,
		lowConvictionPct: row.low_conviction_pct as number,

		// Risk/reward
		minRiskRewardRatio: row.min_risk_reward_ratio as number,
		kellyFraction: row.kelly_fraction as number,

		// Schedule
		tradingCycleIntervalMs: row.trading_cycle_interval_ms as number,
		predictionMarketsIntervalMs: row.prediction_markets_interval_ms as number,

		// Global LLM model
		globalModel: (row.global_model as GlobalModel) ?? DEFAULT_GLOBAL_MODEL,

		// Workflow
		status: row.status as TradingConfigStatus,
		createdAt: row.created_at as string,
		updatedAt: row.updated_at as string,
		promotedFrom: row.promoted_from as string | null,
	};
}

// ============================================
// Repository
// ============================================

/**
 * Trading config repository
 */
export class TradingConfigRepository {
	private readonly table = "trading_config";

	constructor(private readonly client: TursoClient) {}

	/**
	 * Create a new trading config version
	 */
	async create(input: CreateTradingConfigInput): Promise<TradingConfig> {
		const now = new Date().toISOString();

		try {
			await this.client.run(
				`INSERT INTO ${this.table} (
          id, environment, version,
          max_consensus_iterations, agent_timeout_ms, total_consensus_timeout_ms,
          conviction_delta_hold, conviction_delta_action,
          high_conviction_pct, medium_conviction_pct, low_conviction_pct,
          min_risk_reward_ratio, kelly_fraction,
          trading_cycle_interval_ms, prediction_markets_interval_ms,
          global_model,
          status, created_at, updated_at, promoted_from
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					input.id,
					input.environment,
					input.version,
					input.maxConsensusIterations ?? 3,
					input.agentTimeoutMs ?? 30000,
					input.totalConsensusTimeoutMs ?? 300000,
					input.convictionDeltaHold ?? 0.2,
					input.convictionDeltaAction ?? 0.3,
					input.highConvictionPct ?? 0.7,
					input.mediumConvictionPct ?? 0.5,
					input.lowConvictionPct ?? 0.25,
					input.minRiskRewardRatio ?? 1.5,
					input.kellyFraction ?? 0.5,
					input.tradingCycleIntervalMs ?? 3600000,
					input.predictionMarketsIntervalMs ?? 900000,
					input.globalModel ?? DEFAULT_GLOBAL_MODEL,
					input.status ?? "draft",
					now,
					now,
					input.promotedFrom ?? null,
				]
			);
		} catch (error) {
			throw RepositoryError.fromSqliteError(this.table, error as Error);
		}

		return this.findById(input.id) as Promise<TradingConfig>;
	}

	/**
	 * Find trading config by ID
	 */
	async findById(id: string): Promise<TradingConfig | null> {
		const row = await this.client.get<Row>(`SELECT * FROM ${this.table} WHERE id = ?`, [id]);

		return row ? mapTradingConfigRow(row) : null;
	}

	/**
	 * Find trading config by ID, throw if not found
	 */
	async findByIdOrThrow(id: string): Promise<TradingConfig> {
		const config = await this.findById(id);
		if (!config) {
			throw RepositoryError.notFound(this.table, id);
		}
		return config;
	}

	/**
	 * Get active config for environment
	 */
	async getActive(environment: TradingEnvironment): Promise<TradingConfig | null> {
		const row = await this.client.get<Row>(
			`SELECT * FROM ${this.table} WHERE environment = ? AND status = 'active'`,
			[environment]
		);

		return row ? mapTradingConfigRow(row) : null;
	}

	/**
	 * Get active config, throw if not found
	 */
	async getActiveOrThrow(environment: TradingEnvironment): Promise<TradingConfig> {
		const config = await this.getActive(environment);
		if (!config) {
			throw new RepositoryError(
				`No active trading config found for environment '${environment}'. Run seed script.`,
				"NOT_FOUND",
				this.table
			);
		}
		return config;
	}

	/**
	 * Get draft config for editing
	 */
	async getDraft(environment: TradingEnvironment): Promise<TradingConfig | null> {
		const row = await this.client.get<Row>(
			`SELECT * FROM ${this.table} WHERE environment = ? AND status = 'draft' ORDER BY created_at DESC LIMIT 1`,
			[environment]
		);

		return row ? mapTradingConfigRow(row) : null;
	}

	/**
	 * Save draft config (update existing draft or create new one)
	 */
	async saveDraft(
		environment: TradingEnvironment,
		input: UpdateTradingConfigInput & { id?: string; version?: number }
	): Promise<TradingConfig> {
		const existingDraft = await this.getDraft(environment);
		const now = new Date().toISOString();

		if (existingDraft) {
			// Update existing draft
			const updateFields: string[] = [];
			const updateValues: unknown[] = [];

			if (input.maxConsensusIterations !== undefined) {
				updateFields.push("max_consensus_iterations = ?");
				updateValues.push(input.maxConsensusIterations);
			}
			if (input.agentTimeoutMs !== undefined) {
				updateFields.push("agent_timeout_ms = ?");
				updateValues.push(input.agentTimeoutMs);
			}
			if (input.totalConsensusTimeoutMs !== undefined) {
				updateFields.push("total_consensus_timeout_ms = ?");
				updateValues.push(input.totalConsensusTimeoutMs);
			}
			if (input.convictionDeltaHold !== undefined) {
				updateFields.push("conviction_delta_hold = ?");
				updateValues.push(input.convictionDeltaHold);
			}
			if (input.convictionDeltaAction !== undefined) {
				updateFields.push("conviction_delta_action = ?");
				updateValues.push(input.convictionDeltaAction);
			}
			if (input.highConvictionPct !== undefined) {
				updateFields.push("high_conviction_pct = ?");
				updateValues.push(input.highConvictionPct);
			}
			if (input.mediumConvictionPct !== undefined) {
				updateFields.push("medium_conviction_pct = ?");
				updateValues.push(input.mediumConvictionPct);
			}
			if (input.lowConvictionPct !== undefined) {
				updateFields.push("low_conviction_pct = ?");
				updateValues.push(input.lowConvictionPct);
			}
			if (input.minRiskRewardRatio !== undefined) {
				updateFields.push("min_risk_reward_ratio = ?");
				updateValues.push(input.minRiskRewardRatio);
			}
			if (input.kellyFraction !== undefined) {
				updateFields.push("kelly_fraction = ?");
				updateValues.push(input.kellyFraction);
			}
			if (input.tradingCycleIntervalMs !== undefined) {
				updateFields.push("trading_cycle_interval_ms = ?");
				updateValues.push(input.tradingCycleIntervalMs);
			}
			if (input.predictionMarketsIntervalMs !== undefined) {
				updateFields.push("prediction_markets_interval_ms = ?");
				updateValues.push(input.predictionMarketsIntervalMs);
			}
			if (input.globalModel !== undefined) {
				updateFields.push("global_model = ?");
				updateValues.push(input.globalModel);
			}

			if (updateFields.length > 0) {
				updateFields.push("updated_at = ?");
				updateValues.push(now);
				updateValues.push(existingDraft.id);

				await this.client.run(
					`UPDATE ${this.table} SET ${updateFields.join(", ")} WHERE id = ?`,
					updateValues
				);
			}

			return this.findByIdOrThrow(existingDraft.id);
		} else {
			// Create new draft based on active config or defaults
			const activeConfig = await this.getActive(environment);
			const nextVersion = activeConfig ? activeConfig.version + 1 : 1;

			return this.create({
				id: input.id ?? `tc_${environment.toLowerCase()}_v${nextVersion}_${Date.now()}`,
				environment,
				version: input.version ?? nextVersion,
				status: "draft",
				...input,
			});
		}
	}

	/**
	 * Update config status
	 */
	async setStatus(id: string, status: TradingConfigStatus): Promise<TradingConfig> {
		const config = await this.findByIdOrThrow(id);
		const now = new Date().toISOString();

		// If setting to active, archive current active config
		if (status === "active") {
			await this.client.run(
				`UPDATE ${this.table} SET status = 'archived', updated_at = ? WHERE environment = ? AND status = 'active'`,
				[now, config.environment]
			);
		}

		await this.client.run(`UPDATE ${this.table} SET status = ?, updated_at = ? WHERE id = ?`, [
			status,
			now,
			id,
		]);

		return this.findByIdOrThrow(id);
	}

	/**
	 * Get version history for environment
	 */
	async getHistory(environment: TradingEnvironment, limit = 20): Promise<TradingConfig[]> {
		const rows = await this.client.execute<Row>(
			`SELECT * FROM ${this.table} WHERE environment = ? ORDER BY version DESC, created_at DESC LIMIT ?`,
			[environment, limit]
		);

		return rows.map(mapTradingConfigRow);
	}

	/**
	 * Compare two config versions
	 */
	async compare(
		id1: string,
		id2: string
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

	/**
	 * Promote a config from one environment to another
	 * (e.g., PAPER → LIVE)
	 */
	async promote(sourceId: string, targetEnvironment: TradingEnvironment): Promise<TradingConfig> {
		const source = await this.findByIdOrThrow(sourceId);

		// Source must be active to promote
		if (source.status !== "active") {
			throw new RepositoryError(
				`Cannot promote config with status '${source.status}'. Only active configs can be promoted.`,
				"CONSTRAINT_VIOLATION",
				this.table
			);
		}

		// Get the current active config for the target environment to determine version
		const targetActive = await this.getActive(targetEnvironment);
		const nextVersion = targetActive ? targetActive.version + 1 : 1;

		// Create new config in target environment
		const newConfig = await this.create({
			id: `tc_${targetEnvironment.toLowerCase()}_v${nextVersion}_${Date.now()}`,
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

		return newConfig;
	}

	/**
	 * Delete a config (cannot delete active)
	 */
	async delete(id: string): Promise<boolean> {
		const config = await this.findById(id);

		if (config?.status === "active") {
			throw new RepositoryError(
				"Cannot delete active trading config",
				"CONSTRAINT_VIOLATION",
				this.table
			);
		}

		const result = await this.client.run(`DELETE FROM ${this.table} WHERE id = ?`, [id]);

		return result.changes > 0;
	}

	/**
	 * Get the next version number for an environment
	 */
	async getNextVersion(environment: TradingEnvironment): Promise<number> {
		const row = await this.client.get<{ max_version: number | null }>(
			`SELECT MAX(version) as max_version FROM ${this.table} WHERE environment = ?`,
			[environment]
		);

		return (row?.max_version ?? 0) + 1;
	}
}
