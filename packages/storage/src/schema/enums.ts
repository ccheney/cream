/**
 * PostgreSQL Enums for Cream Trading System
 *
 * Type-safe enum definitions using Drizzle's pgEnum.
 * These provide compile-time and runtime type safety for categorical columns.
 */
import { pgEnum } from "drizzle-orm/pg-core";

// Environment enum (used across all environment-scoped tables)
export const environmentEnum = pgEnum("environment", ["PAPER", "LIVE"]);

// Decision-related enums
export const decisionActionEnum = pgEnum("decision_action", [
	"BUY",
	"SELL",
	"HOLD",
	"CLOSE",
	"INCREASE",
	"REDUCE",
	"NO_TRADE",
]);

export const decisionDirectionEnum = pgEnum("decision_direction", ["LONG", "SHORT", "FLAT"]);

export const decisionStatusEnum = pgEnum("decision_status", [
	"pending",
	"approved",
	"rejected",
	"executed",
	"cancelled",
	"expired",
]);

export const sizeUnitEnum = pgEnum("size_unit", ["SHARES", "CONTRACTS", "DOLLARS", "PCT_EQUITY"]);

// Agent-related enums
export const agentTypeEnum = pgEnum("agent_type", [
	"grounding_agent",
	"news_analyst",
	"fundamentals_analyst",
	"bullish_researcher",
	"bearish_researcher",
	"trader",
	"risk_manager",
	"critic",
]);

export const agentVoteEnum = pgEnum("agent_vote", ["APPROVE", "REJECT", "ABSTAIN"]);

// Order-related enums
export const orderSideEnum = pgEnum("order_side", ["buy", "sell"]);

export const orderTypeEnum = pgEnum("order_type", ["market", "limit", "stop", "stop_limit"]);

export const orderStatusEnum = pgEnum("order_status", [
	"pending",
	"submitted",
	"accepted",
	"partial_fill",
	"filled",
	"cancelled",
	"rejected",
	"expired",
]);

export const timeInForceEnum = pgEnum("time_in_force", ["day", "gtc", "ioc", "fok"]);

// Position-related enums
export const positionSideEnum = pgEnum("position_side", ["long", "short"]);

export const positionStatusEnum = pgEnum("position_status", ["open", "closed", "pending"]);

// Cycle-related enums
export const cycleStatusEnum = pgEnum("cycle_status", ["running", "completed", "failed"]);

export const cyclePhaseEnum = pgEnum("cycle_phase", [
	"observe",
	"orient",
	"decide",
	"act",
	"complete",
]);

export const cycleEventTypeEnum = pgEnum("cycle_event_type", [
	"phase_change",
	"agent_start",
	"agent_complete",
	"decision",
	"order",
	"error",
	"progress",
	"tool_call",
	"tool_result",
	"reasoning_delta",
	"text_delta",
]);

// Alert-related enums
export const alertSeverityEnum = pgEnum("alert_severity", ["info", "warning", "error", "critical"]);

// Config status enum (shared across config tables)
export const configStatusEnum = pgEnum("config_status", ["draft", "testing", "active", "archived"]);

// Market data enums
export const timeframeEnum = pgEnum("timeframe", ["1m", "5m", "15m", "1h", "1d"]);

export const corporateActionTypeEnum = pgEnum("corporate_action_type", [
	"split",
	"dividend",
	"merger",
	"spinoff",
]);

export const regimeEnum = pgEnum("regime", ["trending_up", "trending_down", "ranging", "volatile"]);

// Universe-related enums
export const universeSourceEnum = pgEnum("universe_source", ["static", "index", "screener"]);

export const indexIdEnum = pgEnum("index_id", ["SP500", "NDX100", "DJIA"]);

export const tickerChangeTypeEnum = pgEnum("ticker_change_type", [
	"rename",
	"merger",
	"spinoff",
	"delisted",
]);

// External data enums
export const predictionMarketPlatformEnum = pgEnum("prediction_market_platform", [
	"kalshi",
	"polymarket",
]);

export const predictionMarketTypeEnum = pgEnum("prediction_market_type", [
	"rate",
	"election",
	"economic",
]);

export const externalEventSourceEnum = pgEnum("external_event_source", [
	"news",
	"earnings",
	"sec_filing",
	"fed",
]);

export const sentimentEnum = pgEnum("sentiment", ["positive", "negative", "neutral"]);

// System state enums
export const systemStatusEnum = pgEnum("system_status", ["stopped", "running", "paused", "error"]);

// Filing-related enums
export const filingTypeEnum = pgEnum("filing_type", ["10-K", "10-Q", "8-K", "DEF14A"]);

export const filingStatusEnum = pgEnum("filing_status", [
	"pending",
	"processing",
	"complete",
	"failed",
]);

export const syncRunStatusEnum = pgEnum("sync_run_status", ["running", "completed", "failed"]);

export const syncTriggerSourceEnum = pgEnum("sync_trigger_source", [
	"scheduled",
	"manual",
	"dashboard",
]);

// Thesis state enums
export const thesisStateEnum = pgEnum("thesis_state_value", [
	"WATCHING",
	"STAGED",
	"OPEN",
	"SCALING",
	"EXITING",
	"CLOSED",
]);

// Parity validation enums
export const parityEntityTypeEnum = pgEnum("parity_entity_type", ["indicator", "factor", "config"]);

export const parityRecommendationEnum = pgEnum("parity_recommendation", [
	"APPROVE_FOR_LIVE",
	"NEEDS_INVESTIGATION",
	"NOT_READY",
]);

// Macro watch enums
export const macroWatchSessionEnum = pgEnum("macro_watch_session", [
	"OVERNIGHT",
	"PRE_MARKET",
	"AFTER_HOURS",
]);

export const macroWatchCategoryEnum = pgEnum("macro_watch_category", [
	"NEWS",
	"PREDICTION",
	"ECONOMIC",
	"MOVER",
	"EARNINGS",
]);

// User settings enums
export const themeEnum = pgEnum("theme", ["light", "dark", "system"]);

export const chartTimeframeEnum = pgEnum("chart_timeframe", [
	"1D",
	"1W",
	"1M",
	"3M",
	"6M",
	"1Y",
	"ALL",
]);

export const portfolioViewEnum = pgEnum("portfolio_view", ["table", "cards"]);

export const dateFormatEnum = pgEnum("date_format", ["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"]);

export const timeFormatEnum = pgEnum("time_format", ["12h", "24h"]);

// Execution engine recovery enums
export const executionRecoveryStatusEnum = pgEnum("execution_recovery_status", [
	"unknown",
	"healthy",
	"error",
	"interrupted",
	"needs_attention",
]);
