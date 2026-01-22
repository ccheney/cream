/**
 * Runtime Configuration Tables
 *
 * trading_config, agent_configs, universe_configs, constraints_config
 */
import { sql } from "drizzle-orm";
import {
	boolean,
	check,
	index,
	integer,
	jsonb,
	numeric,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { agentTypeEnum, configStatusEnum, environmentEnum, universeSourceEnum } from "./enums";

// trading_config: Global trading configuration per environment
export const tradingConfig = pgTable(
	"trading_config",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		environment: environmentEnum("environment").notNull(),
		version: integer("version").notNull(),

		// Consensus settings
		maxConsensusIterations: integer("max_consensus_iterations").default(3),
		agentTimeoutMs: integer("agent_timeout_ms").default(30000),
		totalConsensusTimeoutMs: integer("total_consensus_timeout_ms").default(300000),

		// Conviction thresholds
		convictionDeltaHold: numeric("conviction_delta_hold", {
			precision: 4,
			scale: 3,
		}).default("0.2"),
		convictionDeltaAction: numeric("conviction_delta_action", {
			precision: 4,
			scale: 3,
		}).default("0.3"),

		// Position sizing
		highConvictionPct: numeric("high_conviction_pct", {
			precision: 4,
			scale: 3,
		}).default("0.7"),
		mediumConvictionPct: numeric("medium_conviction_pct", {
			precision: 4,
			scale: 3,
		}).default("0.5"),
		lowConvictionPct: numeric("low_conviction_pct", {
			precision: 4,
			scale: 3,
		}).default("0.25"),

		// Risk/reward
		minRiskRewardRatio: numeric("min_risk_reward_ratio", {
			precision: 4,
			scale: 2,
		}).default("1.5"),
		kellyFraction: numeric("kelly_fraction", { precision: 4, scale: 3 }).default("0.5"),

		// Schedule (milliseconds)
		tradingCycleIntervalMs: integer("trading_cycle_interval_ms").default(3600000),
		predictionMarketsIntervalMs: integer("prediction_markets_interval_ms").default(900000),

		// Global LLM model selection
		globalModel: text("global_model").notNull().default("gemini-3-flash-preview"),

		// Workflow status
		status: configStatusEnum("status").notNull().default("draft"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
		promotedFrom: uuid("promoted_from"),
	},
	(table) => [
		check(
			"valid_kelly",
			sql`${table.kellyFraction}::numeric > 0 AND ${table.kellyFraction}::numeric <= 1`,
		),
		index("idx_trading_config_environment").on(table.environment),
		index("idx_trading_config_status").on(table.status),
		index("idx_trading_config_env_status").on(table.environment, table.status),
		index("idx_trading_config_created_at").on(table.createdAt),
		uniqueIndex("idx_trading_config_env_active")
			.on(table.environment)
			.where(sql`${table.status} = 'active'`),
	],
);

// agent_configs: Per-agent configuration
export const agentConfigs = pgTable(
	"agent_configs",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		environment: environmentEnum("environment").notNull(),
		agentType: agentTypeEnum("agent_type").notNull(),
		systemPromptOverride: text("system_prompt_override"),
		enabled: boolean("enabled").notNull().default(true),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		index("idx_agent_configs_environment").on(table.environment),
		index("idx_agent_configs_agent_type").on(table.agentType),
		uniqueIndex("idx_agent_configs_env_agent").on(table.environment, table.agentType),
	],
);

// universe_configs: Trading universe configuration
export const universeConfigs = pgTable(
	"universe_configs",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		environment: environmentEnum("environment").notNull(),
		source: universeSourceEnum("source").notNull(),

		// Static symbols (JSON array)
		staticSymbols: jsonb("static_symbols").$type<string[]>(),

		// Index source configuration
		indexSource: text("index_source"),

		// Screener filters
		minVolume: integer("min_volume"),
		minMarketCap: integer("min_market_cap"),
		optionableOnly: boolean("optionable_only").notNull().default(false),

		// Include/exclude lists (JSON arrays)
		includeList: jsonb("include_list").$type<string[]>().default([]),
		excludeList: jsonb("exclude_list").$type<string[]>().default([]),

		// Workflow status
		status: configStatusEnum("status").notNull().default("draft"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		index("idx_universe_configs_environment").on(table.environment),
		index("idx_universe_configs_status").on(table.status),
		index("idx_universe_configs_env_status").on(table.environment, table.status),
		uniqueIndex("idx_universe_configs_env_active")
			.on(table.environment)
			.where(sql`${table.status} = 'active'`),
	],
);

// constraints_config: Risk limits configuration
export const constraintsConfig = pgTable(
	"constraints_config",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		environment: environmentEnum("environment").notNull(),

		// Per-instrument limits
		maxShares: integer("max_shares").notNull().default(1000),
		maxContracts: integer("max_contracts").notNull().default(10),
		maxNotional: numeric("max_notional", { precision: 14, scale: 2 }).notNull().default("50000"),
		maxPctEquity: numeric("max_pct_equity", { precision: 4, scale: 3 }).notNull().default("0.1"),

		// Portfolio limits
		maxGrossExposure: numeric("max_gross_exposure", { precision: 4, scale: 2 })
			.notNull()
			.default("2.0"),
		maxNetExposure: numeric("max_net_exposure", { precision: 4, scale: 2 })
			.notNull()
			.default("1.0"),
		maxConcentration: numeric("max_concentration", { precision: 4, scale: 3 })
			.notNull()
			.default("0.25"),
		maxCorrelation: numeric("max_correlation", { precision: 4, scale: 3 }).notNull().default("0.7"),
		maxDrawdown: numeric("max_drawdown", { precision: 4, scale: 3 }).notNull().default("0.15"),

		// Position limits
		maxRiskPerTrade: numeric("max_risk_per_trade", { precision: 4, scale: 3 })
			.notNull()
			.default("0.02"),
		maxSectorExposure: numeric("max_sector_exposure", { precision: 4, scale: 3 })
			.notNull()
			.default("0.30"),
		maxPositions: integer("max_positions").notNull().default(10),

		// Options greeks limits
		maxDelta: numeric("max_delta", { precision: 8, scale: 2 }).notNull().default("100"),
		maxGamma: numeric("max_gamma", { precision: 8, scale: 2 }).notNull().default("50"),
		maxVega: numeric("max_vega", { precision: 10, scale: 2 }).notNull().default("1000"),
		maxTheta: numeric("max_theta", { precision: 10, scale: 2 }).notNull().default("500"),

		// Workflow status
		status: configStatusEnum("status").notNull().default("draft"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		check("valid_exposure", sql`${table.maxGrossExposure}::numeric > 0`),
		index("idx_constraints_config_environment").on(table.environment),
		index("idx_constraints_config_status").on(table.status),
		index("idx_constraints_config_env_status").on(table.environment, table.status),
		uniqueIndex("idx_constraints_config_env_active")
			.on(table.environment)
			.where(sql`${table.status} = 'active'`),
	],
);
