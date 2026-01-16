/**
 * Dashboard Tables
 *
 * alerts, system_state, backtests, backtest_trades, backtest_equity
 */
import { sql } from "drizzle-orm";
import {
	boolean,
	index,
	integer,
	jsonb,
	numeric,
	pgTable,
	serial,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import {
	alertSeverityEnum,
	backtestStatusEnum,
	environmentEnum,
	systemStatusEnum,
} from "./enums";

// alerts: System and trading alerts
export const alerts = pgTable(
	"alerts",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		severity: alertSeverityEnum("severity").notNull(),
		type: text("type").notNull(),
		title: text("title").notNull(),
		message: text("message").notNull(),
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
		acknowledged: boolean("acknowledged").notNull().default(false),
		acknowledgedBy: text("acknowledged_by"),
		acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
		environment: environmentEnum("environment").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		expiresAt: timestamp("expires_at", { withTimezone: true }),
	},
	(table) => [
		index("idx_alerts_severity").on(table.severity),
		index("idx_alerts_type").on(table.type),
		index("idx_alerts_acknowledged").on(table.acknowledged),
		index("idx_alerts_created_at").on(table.createdAt),
		index("idx_alerts_environment").on(table.environment),
		index("idx_alerts_unack_env")
			.on(table.environment, table.acknowledged)
			.where(sql`${table.acknowledged} = false`),
	],
);

// system_state: Current system state per environment
export const systemState = pgTable("system_state", {
	environment: environmentEnum("environment").primaryKey(),
	status: systemStatusEnum("status").notNull().default("stopped"),
	lastCycleId: uuid("last_cycle_id"),
	lastCycleTime: timestamp("last_cycle_time", { withTimezone: true }),
	currentPhase: text("current_phase"),
	phaseStartedAt: timestamp("phase_started_at", { withTimezone: true }),
	nextCycleAt: timestamp("next_cycle_at", { withTimezone: true }),
	errorMessage: text("error_message"),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

// backtests: Backtest configurations and results
export const backtests = pgTable(
	"backtests",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		name: text("name").notNull(),
		description: text("description"),
		startDate: timestamp("start_date", { withTimezone: true }).notNull(),
		endDate: timestamp("end_date", { withTimezone: true }).notNull(),
		initialCapital: numeric("initial_capital", {
			precision: 16,
			scale: 2,
		}).notNull(),
		universe: text("universe"),
		configJson: jsonb("config_json").$type<Record<string, unknown>>(),
		status: backtestStatusEnum("status").notNull().default("pending"),
		progressPct: numeric("progress_pct", { precision: 5, scale: 2 }).default(
			"0",
		),

		// Performance metrics
		totalReturn: numeric("total_return", { precision: 8, scale: 4 }),
		cagr: numeric("cagr", { precision: 8, scale: 4 }),
		sharpeRatio: numeric("sharpe_ratio", { precision: 8, scale: 4 }),
		sortinoRatio: numeric("sortino_ratio", { precision: 8, scale: 4 }),
		calmarRatio: numeric("calmar_ratio", { precision: 8, scale: 4 }),
		maxDrawdown: numeric("max_drawdown", { precision: 8, scale: 4 }),
		winRate: numeric("win_rate", { precision: 5, scale: 4 }),
		profitFactor: numeric("profit_factor", { precision: 8, scale: 4 }),
		totalTrades: integer("total_trades"),
		avgTradePnl: numeric("avg_trade_pnl", { precision: 14, scale: 2 }),
		metricsJson: jsonb("metrics_json").$type<Record<string, unknown>>(),

		errorMessage: text("error_message"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		startedAt: timestamp("started_at", { withTimezone: true }),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		createdBy: text("created_by"),
	},
	(table) => [
		index("idx_backtests_status").on(table.status),
		index("idx_backtests_start_date").on(table.startDate),
		index("idx_backtests_created_at").on(table.createdAt),
	],
);

// backtest_trades: Individual trades from backtests
export const backtestTrades = pgTable(
	"backtest_trades",
	{
		id: serial("id").primaryKey(),
		backtestId: uuid("backtest_id")
			.notNull()
			.references(() => backtests.id, { onDelete: "cascade" }),
		timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
		symbol: text("symbol").notNull(),
		action: text("action").notNull(),
		qty: numeric("qty", { precision: 14, scale: 4 }).notNull(),
		price: numeric("price", { precision: 12, scale: 4 }).notNull(),
		commission: numeric("commission", { precision: 10, scale: 4 }).default("0"),
		pnl: numeric("pnl", { precision: 14, scale: 2 }),
		pnlPct: numeric("pnl_pct", { precision: 8, scale: 4 }),
		decisionRationale: text("decision_rationale"),
	},
	(table) => [
		index("idx_backtest_trades_backtest_id").on(table.backtestId),
		index("idx_backtest_trades_timestamp").on(table.timestamp),
		index("idx_backtest_trades_symbol").on(table.symbol),
		index("idx_backtest_trades_bt_ts").on(table.backtestId, table.timestamp),
	],
);

// backtest_equity: Equity curve for visualization
export const backtestEquity = pgTable(
	"backtest_equity",
	{
		id: serial("id").primaryKey(),
		backtestId: uuid("backtest_id")
			.notNull()
			.references(() => backtests.id, { onDelete: "cascade" }),
		timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
		nav: numeric("nav", { precision: 16, scale: 2 }).notNull(),
		cash: numeric("cash", { precision: 16, scale: 2 }).notNull(),
		equity: numeric("equity", { precision: 16, scale: 2 }).notNull(),
		drawdown: numeric("drawdown", { precision: 14, scale: 2 }),
		drawdownPct: numeric("drawdown_pct", { precision: 8, scale: 4 }),
		dayReturnPct: numeric("day_return_pct", { precision: 8, scale: 4 }),
		cumulativeReturnPct: numeric("cumulative_return_pct", {
			precision: 8,
			scale: 4,
		}),
	},
	(table) => [
		index("idx_backtest_equity_backtest_id").on(table.backtestId),
		index("idx_backtest_equity_timestamp").on(table.timestamp),
		index("idx_backtest_equity_bt_ts").on(table.backtestId, table.timestamp),
	],
);
