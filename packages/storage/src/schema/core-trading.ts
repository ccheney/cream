/**
 * Core Trading Tables
 *
 * decisions, agent_outputs, orders, positions, position_history,
 * portfolio_snapshots, config_versions, cycles, cycle_events
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
	serial,
	text,
	timestamp,
	unique,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import {
	agentTypeEnum,
	agentVoteEnum,
	cycleEventTypeEnum,
	cyclePhaseEnum,
	cycleStatusEnum,
	decisionActionEnum,
	decisionDirectionEnum,
	decisionStatusEnum,
	environmentEnum,
	orderSideEnum,
	orderStatusEnum,
	orderTypeEnum,
	positionSideEnum,
	positionStatusEnum,
	sizeUnitEnum,
	timeInForceEnum,
} from "./enums";

// decisions: Trading decisions from OODA loop
export const decisions = pgTable(
	"decisions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		cycleId: uuid("cycle_id").notNull(),
		symbol: text("symbol").notNull(),
		action: decisionActionEnum("action").notNull(),
		direction: decisionDirectionEnum("direction").notNull(),
		size: numeric("size", { precision: 14, scale: 4 }).notNull(),
		sizeUnit: sizeUnitEnum("size_unit").notNull().default("SHARES"),

		entryPrice: numeric("entry_price", { precision: 12, scale: 4 }),
		stopLoss: numeric("stop_loss", { precision: 12, scale: 4 }),
		takeProfit: numeric("take_profit", { precision: 12, scale: 4 }),
		stopPrice: numeric("stop_price", { precision: 12, scale: 4 }),
		targetPrice: numeric("target_price", { precision: 12, scale: 4 }),

		strategyFamily: text("strategy_family"),
		timeHorizon: text("time_horizon"),

		bullishFactors: jsonb("bullish_factors").$type<string[]>().default([]),
		bearishFactors: jsonb("bearish_factors").$type<string[]>().default([]),

		confidenceScore: numeric("confidence_score", { precision: 4, scale: 3 }),
		riskScore: numeric("risk_score", { precision: 4, scale: 3 }),
		metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

		status: decisionStatusEnum("status").notNull().default("pending"),
		rationale: text("rationale"),
		environment: environmentEnum("environment").notNull(),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		executedAt: timestamp("executed_at", { withTimezone: true }),
		closedAt: timestamp("closed_at", { withTimezone: true }),
	},
	(table) => [
		check("positive_size", sql`${table.size}::numeric > 0`),
		check(
			"valid_confidence",
			sql`${table.confidenceScore} IS NULL OR (${table.confidenceScore}::numeric >= 0 AND ${table.confidenceScore}::numeric <= 1)`,
		),
		check(
			"valid_risk",
			sql`${table.riskScore} IS NULL OR (${table.riskScore}::numeric >= 0 AND ${table.riskScore}::numeric <= 1)`,
		),
		index("idx_decisions_cycle_id").on(table.cycleId),
		index("idx_decisions_symbol").on(table.symbol),
		index("idx_decisions_status").on(table.status),
		index("idx_decisions_created_at").on(table.createdAt),
		index("idx_decisions_symbol_created").on(table.symbol, table.createdAt),
		index("idx_decisions_environment").on(table.environment),
	],
);

// agent_outputs: Agent votes and reasoning
export const agentOutputs = pgTable(
	"agent_outputs",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		decisionId: uuid("decision_id")
			.notNull()
			.references(() => decisions.id, { onDelete: "cascade" }),
		agentType: agentTypeEnum("agent_type").notNull(),
		vote: agentVoteEnum("vote").notNull(),
		confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull(),
		reasoningSummary: text("reasoning_summary"),
		fullReasoning: text("full_reasoning"),
		tokensUsed: integer("tokens_used"),
		latencyMs: integer("latency_ms"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		check(
			"valid_confidence",
			sql`${table.confidence}::numeric >= 0 AND ${table.confidence}::numeric <= 1`,
		),
		index("idx_agent_outputs_decision_id").on(table.decisionId),
		index("idx_agent_outputs_agent_type").on(table.agentType),
		index("idx_agent_outputs_decision_agent").on(
			table.decisionId,
			table.agentType,
		),
	],
);

// orders: Order submissions and lifecycle
export const orders = pgTable(
	"orders",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		decisionId: uuid("decision_id").references(() => decisions.id),
		symbol: text("symbol").notNull(),
		side: orderSideEnum("side").notNull(),
		qty: numeric("qty", { precision: 14, scale: 4 }).notNull(),
		orderType: orderTypeEnum("order_type").notNull(),
		limitPrice: numeric("limit_price", { precision: 12, scale: 4 }),
		stopPrice: numeric("stop_price", { precision: 12, scale: 4 }),
		timeInForce: timeInForceEnum("time_in_force").notNull().default("day"),
		status: orderStatusEnum("status").notNull().default("pending"),
		brokerOrderId: text("broker_order_id"),
		filledQty: numeric("filled_qty", { precision: 14, scale: 4 }).default("0"),
		filledAvgPrice: numeric("filled_avg_price", { precision: 12, scale: 4 }),
		commission: numeric("commission", { precision: 10, scale: 4 }),
		environment: environmentEnum("environment").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		submittedAt: timestamp("submitted_at", { withTimezone: true }),
		filledAt: timestamp("filled_at", { withTimezone: true }),
		cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
	},
	(table) => [
		check("positive_quantity", sql`${table.qty}::numeric > 0`),
		index("idx_orders_decision_id").on(table.decisionId),
		index("idx_orders_symbol").on(table.symbol),
		index("idx_orders_status").on(table.status),
		index("idx_orders_broker_order_id").on(table.brokerOrderId),
		index("idx_orders_created_at").on(table.createdAt),
		index("idx_orders_environment").on(table.environment),
	],
);

// positions: Current open positions
export const positions = pgTable(
	"positions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		symbol: text("symbol").notNull(),
		side: positionSideEnum("side").notNull(),
		qty: numeric("qty", { precision: 14, scale: 4 }).notNull(),
		avgEntry: numeric("avg_entry", { precision: 12, scale: 4 }).notNull(),
		currentPrice: numeric("current_price", { precision: 12, scale: 4 }),
		unrealizedPnl: numeric("unrealized_pnl", { precision: 14, scale: 2 }),
		unrealizedPnlPct: numeric("unrealized_pnl_pct", { precision: 8, scale: 4 }),
		realizedPnl: numeric("realized_pnl", { precision: 14, scale: 2 }).default(
			"0",
		),
		marketValue: numeric("market_value", { precision: 14, scale: 2 }),
		costBasis: numeric("cost_basis", { precision: 14, scale: 2 }),
		thesisId: uuid("thesis_id"),
		decisionId: uuid("decision_id").references(() => decisions.id),
		status: positionStatusEnum("status").notNull().default("open"),
		metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
		environment: environmentEnum("environment").notNull(),
		openedAt: timestamp("opened_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		closedAt: timestamp("closed_at", { withTimezone: true }),
	},
	(table) => [
		check("positive_quantity", sql`${table.qty}::numeric > 0`),
		check("positive_entry", sql`${table.avgEntry}::numeric > 0`),
		index("idx_positions_symbol").on(table.symbol),
		index("idx_positions_thesis_id").on(table.thesisId),
		index("idx_positions_decision_id").on(table.decisionId),
		index("idx_positions_status").on(table.status),
		index("idx_positions_environment").on(table.environment),
		uniqueIndex("idx_positions_symbol_env_open")
			.on(table.symbol, table.environment)
			.where(sql`${table.closedAt} IS NULL`),
	],
);

// position_history: Historical snapshots for P&L tracking
export const positionHistory = pgTable(
	"position_history",
	{
		id: serial("id").primaryKey(),
		positionId: uuid("position_id")
			.notNull()
			.references(() => positions.id, { onDelete: "cascade" }),
		timestamp: timestamp("timestamp", { withTimezone: true })
			.notNull()
			.defaultNow(),
		price: numeric("price", { precision: 12, scale: 4 }).notNull(),
		qty: numeric("qty", { precision: 14, scale: 4 }).notNull(),
		unrealizedPnl: numeric("unrealized_pnl", { precision: 14, scale: 2 }),
		marketValue: numeric("market_value", { precision: 14, scale: 2 }),
	},
	(table) => [
		index("idx_position_history_position_id").on(table.positionId),
		index("idx_position_history_timestamp").on(table.timestamp),
		index("idx_position_history_position_ts").on(
			table.positionId,
			table.timestamp,
		),
	],
);

// portfolio_snapshots: Point-in-time portfolio state
export const portfolioSnapshots = pgTable(
	"portfolio_snapshots",
	{
		id: serial("id").primaryKey(),
		timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
		environment: environmentEnum("environment").notNull(),
		nav: numeric("nav", { precision: 16, scale: 2 }).notNull(),
		cash: numeric("cash", { precision: 16, scale: 2 }).notNull(),
		equity: numeric("equity", { precision: 16, scale: 2 }).notNull(),
		grossExposure: numeric("gross_exposure", {
			precision: 8,
			scale: 4,
		}).notNull(),
		netExposure: numeric("net_exposure", { precision: 8, scale: 4 }).notNull(),
		longExposure: numeric("long_exposure", { precision: 8, scale: 4 }),
		shortExposure: numeric("short_exposure", { precision: 8, scale: 4 }),
		openPositions: integer("open_positions"),
		dayPnl: numeric("day_pnl", { precision: 14, scale: 2 }),
		dayReturnPct: numeric("day_return_pct", { precision: 8, scale: 4 }),
		totalReturnPct: numeric("total_return_pct", { precision: 8, scale: 4 }),
		maxDrawdown: numeric("max_drawdown", { precision: 8, scale: 4 }),
	},
	(table) => [
		unique("portfolio_snapshots_timestamp_env").on(
			table.timestamp,
			table.environment,
		),
		index("idx_portfolio_snapshots_timestamp").on(table.timestamp),
		index("idx_portfolio_snapshots_environment").on(table.environment),
	],
);

// config_versions: Version-controlled configuration
export const configVersions = pgTable(
	"config_versions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		environment: environmentEnum("environment").notNull(),
		configJson: jsonb("config_json")
			.$type<Record<string, unknown>>()
			.notNull(),
		description: text("description"),
		active: boolean("active").notNull().default(false),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		createdBy: text("created_by"),
	},
	(table) => [
		index("idx_config_versions_environment").on(table.environment),
		index("idx_config_versions_active").on(table.active),
		index("idx_config_versions_created_at").on(table.createdAt),
		uniqueIndex("idx_config_versions_env_active")
			.on(table.environment)
			.where(sql`${table.active} = true`),
	],
);

// cycles: Complete OODA cycle history with results
export const cycles = pgTable(
	"cycles",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		environment: environmentEnum("environment").notNull(),
		status: cycleStatusEnum("status").notNull().default("running"),

		startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		durationMs: integer("duration_ms"),

		currentPhase: cyclePhaseEnum("current_phase"),
		phaseStartedAt: timestamp("phase_started_at", { withTimezone: true }),

		totalSymbols: integer("total_symbols").default(0),
		completedSymbols: integer("completed_symbols").default(0),
		progressPct: numeric("progress_pct", { precision: 5, scale: 2 }).default(
			"0",
		),

		approved: boolean("approved"),
		iterations: integer("iterations"),
		decisionsCount: integer("decisions_count").default(0),
		ordersCount: integer("orders_count").default(0),

		decisionsJson: jsonb("decisions_json").$type<
			Array<{
				symbol: string;
				action: string;
				direction: string;
				confidence: number;
			}>
		>(),
		ordersJson: jsonb("orders_json").$type<
			Array<{
				orderId: string;
				symbol: string;
				side: string;
				quantity: number;
				status: string;
			}>
		>(),

		errorMessage: text("error_message"),
		errorStack: text("error_stack"),
		configVersion: text("config_version"),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index("idx_cycles_environment").on(table.environment),
		index("idx_cycles_status").on(table.status),
		index("idx_cycles_started_at").on(table.startedAt),
		index("idx_cycles_env_status").on(table.environment, table.status),
		index("idx_cycles_env_started").on(table.environment, table.startedAt),
	],
);

// cycle_events: Detailed event log for each cycle
export const cycleEvents = pgTable(
	"cycle_events",
	{
		id: serial("id").primaryKey(),
		cycleId: uuid("cycle_id")
			.notNull()
			.references(() => cycles.id, { onDelete: "cascade" }),
		eventType: cycleEventTypeEnum("event_type").notNull(),
		phase: cyclePhaseEnum("phase"),
		agentType: agentTypeEnum("agent_type"),
		symbol: text("symbol"),
		message: text("message"),
		dataJson: jsonb("data_json").$type<Record<string, unknown>>(),
		timestamp: timestamp("timestamp", { withTimezone: true })
			.notNull()
			.defaultNow(),
		durationMs: integer("duration_ms"),
	},
	(table) => [
		index("idx_cycle_events_cycle_id").on(table.cycleId),
		index("idx_cycle_events_type").on(table.eventType),
		index("idx_cycle_events_timestamp").on(table.timestamp),
		index("idx_cycle_events_agent").on(table.cycleId, table.agentType),
		index("idx_cycle_events_agent_event").on(
			table.cycleId,
			table.agentType,
			table.eventType,
		),
	],
);
