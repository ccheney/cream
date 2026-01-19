/**
 * Factor Zoo Tables
 *
 * hypotheses, factors, factor_performance, factor_correlations,
 * research_runs, factor_weights, paper_signals
 */
import { sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	jsonb,
	numeric,
	pgTable,
	primaryKey,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import {
	factorStatusEnum,
	hypothesisStatusEnum,
	researchPhaseEnum,
	researchTriggerTypeEnum,
} from "./enums";

// hypotheses: Economic hypotheses driving factor creation
export const hypotheses = pgTable(
	"hypotheses",
	{
		hypothesisId: uuid("hypothesis_id").primaryKey().default(sql`uuidv7()`),
		title: text("title").notNull(),
		economicRationale: text("economic_rationale").notNull(),
		marketMechanism: text("market_mechanism").notNull(),
		targetRegime: text("target_regime"),
		falsificationCriteria: text("falsification_criteria"),
		status: hypothesisStatusEnum("status").notNull().default("proposed"),
		iteration: integer("iteration").notNull().default(1),
		parentHypothesisId: uuid("parent_hypothesis_id"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		index("idx_hypotheses_status").on(table.status),
		index("idx_hypotheses_parent").on(table.parentHypothesisId),
	]
);

// factors: Factor definitions and lifecycle
export const factors = pgTable(
	"factors",
	{
		factorId: uuid("factor_id").primaryKey().default(sql`uuidv7()`),
		hypothesisId: uuid("hypothesis_id").references(() => hypotheses.hypothesisId),
		name: text("name").notNull().unique(),
		status: factorStatusEnum("status").notNull().default("research"),
		version: integer("version").notNull().default(1),
		author: text("author").notNull().default("claude-code"),
		typescriptModule: text("typescript_module"),
		symbolicLength: integer("symbolic_length"),
		parameterCount: integer("parameter_count"),
		featureCount: integer("feature_count"),
		originalityScore: numeric("originality_score", { precision: 5, scale: 4 }),
		hypothesisAlignment: numeric("hypothesis_alignment", {
			precision: 5,
			scale: 4,
		}),

		// Stage 1 metrics
		stage1Sharpe: numeric("stage1_sharpe", { precision: 8, scale: 4 }),
		stage1Ic: numeric("stage1_ic", { precision: 6, scale: 4 }),
		stage1MaxDrawdown: numeric("stage1_max_drawdown", { precision: 6, scale: 4 }),
		stage1CompletedAt: timestamp("stage1_completed_at", { withTimezone: true }),

		// Stage 2 metrics
		stage2Pbo: numeric("stage2_pbo", { precision: 6, scale: 4 }),
		stage2DsrPvalue: numeric("stage2_dsr_pvalue", { precision: 6, scale: 4 }),
		stage2Wfe: numeric("stage2_wfe", { precision: 6, scale: 4 }),
		stage2CompletedAt: timestamp("stage2_completed_at", { withTimezone: true }),

		// Paper trading
		paperValidationPassed: integer("paper_validation_passed").default(0),
		paperStartDate: timestamp("paper_start_date", { withTimezone: true }),
		paperEndDate: timestamp("paper_end_date", { withTimezone: true }),
		paperRealizedSharpe: numeric("paper_realized_sharpe", {
			precision: 8,
			scale: 4,
		}),
		paperRealizedIc: numeric("paper_realized_ic", { precision: 6, scale: 4 }),

		// Runtime state
		currentWeight: numeric("current_weight", { precision: 6, scale: 4 }).default("0.0"),
		lastIc: numeric("last_ic", { precision: 6, scale: 4 }),
		decayRate: numeric("decay_rate", { precision: 6, scale: 4 }),

		// Target regimes (JSON array)
		targetRegimes: jsonb("target_regimes").$type<string[]>(),

		// Parity validation
		parityReport: text("parity_report"),
		parityValidatedAt: timestamp("parity_validated_at", { withTimezone: true }),

		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		promotedAt: timestamp("promoted_at", { withTimezone: true }),
		retiredAt: timestamp("retired_at", { withTimezone: true }),
		lastUpdated: timestamp("last_updated", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		check("positive_version", sql`${table.version} >= 1`),
		check(
			"valid_originality",
			sql`${table.originalityScore} IS NULL OR (${table.originalityScore}::numeric >= 0 AND ${table.originalityScore}::numeric <= 1)`
		),
		check(
			"valid_alignment",
			sql`${table.hypothesisAlignment} IS NULL OR (${table.hypothesisAlignment}::numeric >= 0 AND ${table.hypothesisAlignment}::numeric <= 1)`
		),
		check(
			"valid_stage1_ic",
			sql`${table.stage1Ic} IS NULL OR (${table.stage1Ic}::numeric >= -1 AND ${table.stage1Ic}::numeric <= 1)`
		),
		check(
			"valid_stage1_drawdown",
			sql`${table.stage1MaxDrawdown} IS NULL OR (${table.stage1MaxDrawdown}::numeric >= 0 AND ${table.stage1MaxDrawdown}::numeric <= 1)`
		),
		check(
			"valid_current_weight",
			sql`${table.currentWeight}::numeric >= 0 AND ${table.currentWeight}::numeric <= 1`
		),
		check(
			"valid_last_ic",
			sql`${table.lastIc} IS NULL OR (${table.lastIc}::numeric >= -1 AND ${table.lastIc}::numeric <= 1)`
		),
		check(
			"non_negative_decay",
			sql`${table.decayRate} IS NULL OR ${table.decayRate}::numeric >= 0`
		),
		index("idx_factors_status").on(table.status),
		index("idx_factors_hypothesis").on(table.hypothesisId),
		index("idx_factors_active")
			.on(table.status)
			.where(sql`${table.status} IN ('active', 'decaying')`),
	]
);

// factor_performance: Daily performance metrics
export const factorPerformance = pgTable(
	"factor_performance",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		factorId: uuid("factor_id")
			.notNull()
			.references(() => factors.factorId, { onDelete: "cascade" }),
		date: timestamp("date", { withTimezone: true }).notNull(),
		ic: numeric("ic", { precision: 6, scale: 4 }).notNull(),
		icir: numeric("icir", { precision: 8, scale: 4 }),
		sharpe: numeric("sharpe", { precision: 8, scale: 4 }),
		weight: numeric("weight", { precision: 6, scale: 4 }).notNull().default("0.0"),
		signalCount: integer("signal_count").notNull().default(0),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		check("valid_ic", sql`${table.ic}::numeric >= -1 AND ${table.ic}::numeric <= 1`),
		check("valid_weight", sql`${table.weight}::numeric >= 0 AND ${table.weight}::numeric <= 1`),
		check("non_negative_signals", sql`${table.signalCount} >= 0`),
		unique("factor_performance_factor_date").on(table.factorId, table.date),
		index("idx_factor_perf_factor_date").on(table.factorId, table.date),
	]
);

// factor_correlations: Pairwise correlations
export const factorCorrelations = pgTable(
	"factor_correlations",
	{
		factorId1: uuid("factor_id_1")
			.notNull()
			.references(() => factors.factorId, { onDelete: "cascade" }),
		factorId2: uuid("factor_id_2")
			.notNull()
			.references(() => factors.factorId, { onDelete: "cascade" }),
		correlation: numeric("correlation", { precision: 5, scale: 4 }).notNull(),
		computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		check(
			"valid_correlation",
			sql`${table.correlation}::numeric >= -1 AND ${table.correlation}::numeric <= 1`
		),
		primaryKey({ columns: [table.factorId1, table.factorId2] }),
	]
);

// research_runs: Track research pipeline executions
export const researchRuns = pgTable(
	"research_runs",
	{
		runId: uuid("run_id").primaryKey().default(sql`uuidv7()`),
		triggerType: researchTriggerTypeEnum("trigger_type").notNull(),
		triggerReason: text("trigger_reason").notNull(),
		phase: researchPhaseEnum("phase").notNull().default("idea"),
		currentIteration: integer("current_iteration").notNull().default(1),
		hypothesisId: uuid("hypothesis_id").references(() => hypotheses.hypothesisId),
		factorId: uuid("factor_id").references(() => factors.factorId),
		prUrl: text("pr_url"),
		errorMessage: text("error_message"),
		tokensUsed: integer("tokens_used").default(0),
		computeHours: numeric("compute_hours", { precision: 8, scale: 2 }).default("0.0"),
		startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
		completedAt: timestamp("completed_at", { withTimezone: true }),
	},
	(table) => [
		index("idx_research_runs_phase").on(table.phase),
		index("idx_research_runs_trigger").on(table.triggerType),
		index("idx_research_runs_hypothesis").on(table.hypothesisId),
		index("idx_research_runs_factor").on(table.factorId),
	]
);

// factor_weights: Current factor weights
export const factorWeights = pgTable(
	"factor_weights",
	{
		factorId: uuid("factor_id")
			.primaryKey()
			.references(() => factors.factorId, { onDelete: "cascade" }),
		weight: numeric("weight", { precision: 6, scale: 4 }).notNull().default("0.0"),
		lastIc: numeric("last_ic", { precision: 6, scale: 4 }),
		lastUpdated: timestamp("last_updated", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		check("valid_weight", sql`${table.weight}::numeric >= 0 AND ${table.weight}::numeric <= 1`),
		check(
			"valid_last_ic",
			sql`${table.lastIc} IS NULL OR (${table.lastIc}::numeric >= -1 AND ${table.lastIc}::numeric <= 1)`
		),
	]
);

// paper_signals: Paper trading signals for factors
export const paperSignals = pgTable(
	"paper_signals",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		factorId: uuid("factor_id")
			.notNull()
			.references(() => factors.factorId, { onDelete: "cascade" }),
		signalDate: timestamp("signal_date", { withTimezone: true }).notNull(),
		symbol: text("symbol").notNull(),
		signalValue: numeric("signal_value", { precision: 8, scale: 4 }).notNull(),
		direction: text("direction").notNull(),
		entryPrice: numeric("entry_price", { precision: 12, scale: 4 }),
		exitPrice: numeric("exit_price", { precision: 12, scale: 4 }),
		actualReturn: numeric("actual_return", { precision: 8, scale: 4 }),
		predictedReturn: numeric("predicted_return", { precision: 8, scale: 4 }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		check("positive_entry", sql`${table.entryPrice} IS NULL OR ${table.entryPrice}::numeric > 0`),
		check("positive_exit", sql`${table.exitPrice} IS NULL OR ${table.exitPrice}::numeric > 0`),
		unique("paper_signals_factor_date_symbol").on(table.factorId, table.signalDate, table.symbol),
		index("idx_paper_signals_factor").on(table.factorId),
		index("idx_paper_signals_date").on(table.signalDate),
		index("idx_paper_signals_factor_date").on(table.factorId, table.signalDate),
	]
);
