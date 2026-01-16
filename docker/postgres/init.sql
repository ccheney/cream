-- PostgreSQL Initialization Script for Cream
-- ===========================================
-- This script runs once when the PostgreSQL container is first created.
-- It enables required extensions, creates environment-specific databases,
-- and applies the full Drizzle schema to all databases.
--
-- Uses UUIDv7 for all primary keys (time-ordered for better index performance)
-- Generated from: packages/storage/drizzle/0000_lean_prodigy.sql

-- Enable extensions in the main cream database
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ===========================================
-- Schema for main cream database
-- ===========================================

CREATE TYPE "public"."agent_type" AS ENUM('technical', 'news_analyst', 'fundamentals_analyst', 'bullish_researcher', 'bearish_researcher', 'trader', 'risk_manager', 'critic');
CREATE TYPE "public"."agent_vote" AS ENUM('APPROVE', 'REJECT', 'ABSTAIN');
CREATE TYPE "public"."alert_severity" AS ENUM('info', 'warning', 'error', 'critical');
CREATE TYPE "public"."backtest_status" AS ENUM('pending', 'running', 'completed', 'failed');
CREATE TYPE "public"."chart_timeframe" AS ENUM('1D', '1W', '1M', '3M', '6M', '1Y', 'ALL');
CREATE TYPE "public"."config_status" AS ENUM('draft', 'testing', 'active', 'archived');
CREATE TYPE "public"."corporate_action_type" AS ENUM('split', 'dividend', 'merger', 'spinoff');
CREATE TYPE "public"."cycle_event_type" AS ENUM('phase_change', 'agent_start', 'agent_complete', 'decision', 'order', 'error');
CREATE TYPE "public"."cycle_phase" AS ENUM('observe', 'orient', 'decide', 'act', 'complete');
CREATE TYPE "public"."cycle_status" AS ENUM('running', 'completed', 'failed');
CREATE TYPE "public"."date_format" AS ENUM('MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD');
CREATE TYPE "public"."decision_action" AS ENUM('BUY', 'SELL', 'HOLD', 'CLOSE', 'INCREASE', 'REDUCE', 'NO_TRADE');
CREATE TYPE "public"."decision_direction" AS ENUM('LONG', 'SHORT', 'FLAT');
CREATE TYPE "public"."decision_status" AS ENUM('pending', 'approved', 'rejected', 'executed', 'cancelled', 'expired');
CREATE TYPE "public"."environment" AS ENUM('BACKTEST', 'PAPER', 'LIVE');
CREATE TYPE "public"."execution_recovery_status" AS ENUM('unknown', 'healthy', 'error', 'interrupted', 'needs_attention');
CREATE TYPE "public"."external_event_source" AS ENUM('news', 'earnings', 'sec_filing', 'fed');
CREATE TYPE "public"."factor_status" AS ENUM('research', 'stage1', 'stage2', 'paper', 'active', 'decaying', 'retired');
CREATE TYPE "public"."filing_status" AS ENUM('pending', 'processing', 'complete', 'failed');
CREATE TYPE "public"."filing_type" AS ENUM('10-K', '10-Q', '8-K', 'DEF14A');
CREATE TYPE "public"."hypothesis_status" AS ENUM('proposed', 'testing', 'validated', 'rejected');
CREATE TYPE "public"."index_id" AS ENUM('SP500', 'NDX100', 'DJIA');
CREATE TYPE "public"."indicator_category" AS ENUM('momentum', 'trend', 'volatility', 'volume', 'sentiment');
CREATE TYPE "public"."indicator_status" AS ENUM('staging', 'paper', 'production', 'retired');
CREATE TYPE "public"."macro_watch_category" AS ENUM('NEWS', 'PREDICTION', 'ECONOMIC', 'MOVER', 'EARNINGS');
CREATE TYPE "public"."macro_watch_session" AS ENUM('OVERNIGHT', 'PRE_MARKET', 'AFTER_HOURS');
CREATE TYPE "public"."order_side" AS ENUM('buy', 'sell');
CREATE TYPE "public"."order_status" AS ENUM('pending', 'submitted', 'accepted', 'partial_fill', 'filled', 'cancelled', 'rejected', 'expired');
CREATE TYPE "public"."order_type" AS ENUM('market', 'limit', 'stop', 'stop_limit');
CREATE TYPE "public"."parity_entity_type" AS ENUM('indicator', 'factor', 'config');
CREATE TYPE "public"."parity_recommendation" AS ENUM('APPROVE_FOR_LIVE', 'NEEDS_INVESTIGATION', 'NOT_READY');
CREATE TYPE "public"."portfolio_view" AS ENUM('table', 'cards');
CREATE TYPE "public"."position_side" AS ENUM('long', 'short');
CREATE TYPE "public"."position_status" AS ENUM('open', 'closed', 'pending');
CREATE TYPE "public"."prediction_market_platform" AS ENUM('kalshi', 'polymarket');
CREATE TYPE "public"."prediction_market_type" AS ENUM('rate', 'election', 'economic');
CREATE TYPE "public"."regime" AS ENUM('trending_up', 'trending_down', 'ranging', 'volatile');
CREATE TYPE "public"."research_phase" AS ENUM('idea', 'implementation', 'stage1', 'stage2', 'translation', 'equivalence', 'paper', 'promotion', 'completed', 'failed');
CREATE TYPE "public"."research_trigger_type" AS ENUM('scheduled', 'decay_detected', 'regime_change', 'manual', 'refinement');
CREATE TYPE "public"."sentiment" AS ENUM('positive', 'negative', 'neutral');
CREATE TYPE "public"."size_unit" AS ENUM('SHARES', 'CONTRACTS', 'DOLLARS', 'PCT_EQUITY');
CREATE TYPE "public"."sync_run_status" AS ENUM('running', 'completed', 'failed');
CREATE TYPE "public"."sync_trigger_source" AS ENUM('scheduled', 'manual', 'dashboard');
CREATE TYPE "public"."system_status" AS ENUM('stopped', 'running', 'paused', 'error');
CREATE TYPE "public"."theme" AS ENUM('light', 'dark', 'system');
CREATE TYPE "public"."thesis_state_value" AS ENUM('WATCHING', 'STAGED', 'OPEN', 'SCALING', 'EXITING', 'CLOSED');
CREATE TYPE "public"."ticker_change_type" AS ENUM('rename', 'merger', 'spinoff', 'delisted');
CREATE TYPE "public"."time_format" AS ENUM('12h', '24h');
CREATE TYPE "public"."time_in_force" AS ENUM('day', 'gtc', 'ioc', 'fok');
CREATE TYPE "public"."timeframe" AS ENUM('1m', '5m', '15m', '1h', '1d');
CREATE TYPE "public"."universe_source" AS ENUM('static', 'index', 'screener');
CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" bigint,
	"refresh_token_expires_at" bigint,
	"scope" text,
	"password" text,
	"created_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL,
	"updated_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL
);

CREATE TABLE "agent_configs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"environment" "environment" NOT NULL,
	"agent_type" "agent_type" NOT NULL,
	"system_prompt_override" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "agent_outputs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"decision_id" uuid NOT NULL,
	"agent_type" "agent_type" NOT NULL,
	"vote" "agent_vote" NOT NULL,
	"confidence" numeric(4, 3) NOT NULL,
	"reasoning_summary" text,
	"full_reasoning" text,
	"tokens_used" integer,
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "valid_confidence" CHECK ("agent_outputs"."confidence"::numeric >= 0 AND "agent_outputs"."confidence"::numeric <= 1)
);

CREATE TABLE "alert_settings" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"enable_push" boolean DEFAULT true NOT NULL,
	"enable_email" boolean DEFAULT true NOT NULL,
	"email_address" text,
	"critical_only" boolean DEFAULT false NOT NULL,
	"quiet_hours_start" text,
	"quiet_hours_end" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alert_settings_user_id_unique" UNIQUE("user_id")
);

CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"severity" "alert_severity" NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"metadata" jsonb,
	"acknowledged" boolean DEFAULT false NOT NULL,
	"acknowledged_by" text,
	"acknowledged_at" timestamp with time zone,
	"environment" "environment" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);

CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	"user_email" text NOT NULL,
	"action" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"environment" "environment" DEFAULT 'LIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "backtest_equity" (
	"id" serial PRIMARY KEY NOT NULL,
	"backtest_id" uuid NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"nav" numeric(16, 2) NOT NULL,
	"cash" numeric(16, 2) NOT NULL,
	"equity" numeric(16, 2) NOT NULL,
	"drawdown" numeric(14, 2),
	"drawdown_pct" numeric(8, 4),
	"day_return_pct" numeric(8, 4),
	"cumulative_return_pct" numeric(8, 4)
);

CREATE TABLE "backtest_trades" (
	"id" serial PRIMARY KEY NOT NULL,
	"backtest_id" uuid NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"symbol" text NOT NULL,
	"action" text NOT NULL,
	"qty" numeric(14, 4) NOT NULL,
	"price" numeric(12, 4) NOT NULL,
	"commission" numeric(10, 4) DEFAULT '0',
	"pnl" numeric(14, 2),
	"pnl_pct" numeric(8, 4),
	"decision_rationale" text
);

CREATE TABLE "backtests" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"initial_capital" numeric(16, 2) NOT NULL,
	"universe" text,
	"config_json" jsonb,
	"status" "backtest_status" DEFAULT 'pending' NOT NULL,
	"progress_pct" numeric(5, 2) DEFAULT '0',
	"total_return" numeric(8, 4),
	"cagr" numeric(8, 4),
	"sharpe_ratio" numeric(8, 4),
	"sortino_ratio" numeric(8, 4),
	"calmar_ratio" numeric(8, 4),
	"max_drawdown" numeric(8, 4),
	"win_rate" numeric(5, 4),
	"profit_factor" numeric(8, 4),
	"total_trades" integer,
	"avg_trade_pnl" numeric(14, 2),
	"metrics_json" jsonb,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_by" text
);

CREATE TABLE "candles" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"timeframe" timeframe NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"open" numeric(12, 4) NOT NULL,
	"high" numeric(12, 4) NOT NULL,
	"low" numeric(12, 4) NOT NULL,
	"close" numeric(12, 4) NOT NULL,
	"volume" numeric(18, 0) DEFAULT '0' NOT NULL,
	"vwap" numeric(12, 4),
	"trade_count" integer,
	"adjusted" boolean DEFAULT false NOT NULL,
	"split_adjusted" boolean DEFAULT false NOT NULL,
	"dividend_adjusted" boolean DEFAULT false NOT NULL,
	"quality_flags" jsonb DEFAULT '[]'::jsonb,
	"provider" text DEFAULT 'alpaca' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "valid_ohlc" CHECK ("candles"."high"::numeric >= "candles"."low"::numeric AND
          "candles"."high"::numeric >= "candles"."open"::numeric AND
          "candles"."high"::numeric >= "candles"."close"::numeric AND
          "candles"."low"::numeric <= "candles"."open"::numeric AND
          "candles"."low"::numeric <= "candles"."close"::numeric),
	CONSTRAINT "positive_volume" CHECK ("candles"."volume"::numeric >= 0)
);

CREATE TABLE "config_versions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"environment" "environment" NOT NULL,
	"config_json" jsonb NOT NULL,
	"description" text,
	"active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"activated_at" timestamp with time zone,
	"deactivated_at" timestamp with time zone
);

CREATE TABLE "constraints_config" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"environment" "environment" NOT NULL,
	"max_shares" integer DEFAULT 1000 NOT NULL,
	"max_contracts" integer DEFAULT 10 NOT NULL,
	"max_notional" numeric(14, 2) DEFAULT '50000' NOT NULL,
	"max_pct_equity" numeric(4, 3) DEFAULT '0.1' NOT NULL,
	"max_gross_exposure" numeric(4, 2) DEFAULT '2.0' NOT NULL,
	"max_net_exposure" numeric(4, 2) DEFAULT '1.0' NOT NULL,
	"max_concentration" numeric(4, 3) DEFAULT '0.25' NOT NULL,
	"max_correlation" numeric(4, 3) DEFAULT '0.7' NOT NULL,
	"max_drawdown" numeric(4, 3) DEFAULT '0.15' NOT NULL,
	"max_delta" numeric(8, 2) DEFAULT '100' NOT NULL,
	"max_gamma" numeric(8, 2) DEFAULT '50' NOT NULL,
	"max_vega" numeric(10, 2) DEFAULT '1000' NOT NULL,
	"max_theta" numeric(10, 2) DEFAULT '500' NOT NULL,
	"status" "config_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "valid_exposure" CHECK ("constraints_config"."max_gross_exposure"::numeric > 0)
);

CREATE TABLE "corporate_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"action_type" "corporate_action_type" NOT NULL,
	"ex_date" timestamp with time zone NOT NULL,
	"record_date" timestamp with time zone,
	"pay_date" timestamp with time zone,
	"ratio" numeric(10, 6),
	"amount" numeric(12, 4),
	"details" text,
	"provider" text DEFAULT 'alpaca' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "corporate_actions_indicators" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"symbol" text NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"trailing_dividend_yield" numeric(8, 4),
	"ex_dividend_days" integer,
	"upcoming_earnings_days" integer,
	"recent_split" boolean DEFAULT false,
	"split_ratio" text,
	CONSTRAINT "corp_actions_indicators_symbol_date" UNIQUE("symbol","date")
);

CREATE TABLE "cycle_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"cycle_id" uuid NOT NULL,
	"event_type" "cycle_event_type" NOT NULL,
	"phase" "cycle_phase",
	"agent_type" "agent_type",
	"symbol" text,
	"message" text,
	"data_json" jsonb,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"duration_ms" integer
);

CREATE TABLE "cycles" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"environment" "environment" NOT NULL,
	"status" "cycle_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"duration_ms" integer,
	"current_phase" "cycle_phase",
	"phase_started_at" timestamp with time zone,
	"total_symbols" integer DEFAULT 0,
	"completed_symbols" integer DEFAULT 0,
	"progress_pct" numeric(5, 2) DEFAULT '0',
	"approved" boolean,
	"iterations" integer,
	"decisions_count" integer DEFAULT 0,
	"orders_count" integer DEFAULT 0,
	"decisions_json" jsonb,
	"orders_json" jsonb,
	"error_message" text,
	"error_stack" text,
	"config_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "decisions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"cycle_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"action" "decision_action" NOT NULL,
	"direction" "decision_direction" NOT NULL,
	"size" numeric(14, 4) NOT NULL,
	"size_unit" "size_unit" DEFAULT 'SHARES' NOT NULL,
	"entry_price" numeric(12, 4),
	"stop_loss" numeric(12, 4),
	"take_profit" numeric(12, 4),
	"stop_price" numeric(12, 4),
	"target_price" numeric(12, 4),
	"strategy_family" text,
	"time_horizon" text,
	"bullish_factors" jsonb DEFAULT '[]'::jsonb,
	"bearish_factors" jsonb DEFAULT '[]'::jsonb,
	"confidence_score" numeric(4, 3),
	"risk_score" numeric(4, 3),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"status" "decision_status" DEFAULT 'pending' NOT NULL,
	"rationale" text,
	"environment" "environment" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"executed_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	CONSTRAINT "positive_size" CHECK ("decisions"."size"::numeric > 0),
	CONSTRAINT "valid_confidence" CHECK ("decisions"."confidence_score" IS NULL OR ("decisions"."confidence_score"::numeric >= 0 AND "decisions"."confidence_score"::numeric <= 1)),
	CONSTRAINT "valid_risk" CHECK ("decisions"."risk_score" IS NULL OR ("decisions"."risk_score"::numeric >= 0 AND "decisions"."risk_score"::numeric <= 1))
);

CREATE TABLE "execution_order_snapshots" (
	"order_id" text PRIMARY KEY NOT NULL,
	"broker_order_id" text NOT NULL,
	"instrument_id" text NOT NULL,
	"status" text NOT NULL,
	"side" text NOT NULL,
	"order_type" text NOT NULL,
	"time_in_force" text NOT NULL,
	"requested_quantity" numeric(14, 4) NOT NULL,
	"filled_quantity" numeric(14, 4) NOT NULL,
	"avg_fill_price" numeric(12, 4) NOT NULL,
	"limit_price" numeric(12, 4),
	"stop_price" numeric(12, 4),
	"submitted_at" text NOT NULL,
	"last_update_at" text NOT NULL,
	"status_message" text,
	"is_multi_leg" boolean DEFAULT false NOT NULL,
	"environment" "environment" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "execution_position_snapshots" (
	"symbol" text PRIMARY KEY NOT NULL,
	"quantity" numeric(14, 4) NOT NULL,
	"avg_entry_price" numeric(12, 4) NOT NULL,
	"environment" "environment" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "execution_recovery_state" (
	"environment" "environment" PRIMARY KEY NOT NULL,
	"last_snapshot_at" timestamp with time zone,
	"last_reconciliation_at" timestamp with time zone,
	"last_cycle_id" text,
	"status" "execution_recovery_status" DEFAULT 'unknown' NOT NULL,
	"error_message" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "external_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"source_type" "external_event_source" NOT NULL,
	"event_type" text NOT NULL,
	"event_time" timestamp with time zone NOT NULL,
	"processed_at" timestamp with time zone NOT NULL,
	"sentiment" "sentiment" NOT NULL,
	"confidence" numeric(4, 3) NOT NULL,
	"importance" integer NOT NULL,
	"summary" text NOT NULL,
	"key_insights" jsonb NOT NULL,
	"entities" jsonb NOT NULL,
	"data_points" jsonb NOT NULL,
	"sentiment_score" numeric(5, 4) NOT NULL,
	"importance_score" numeric(5, 4) NOT NULL,
	"surprise_score" numeric(5, 4) NOT NULL,
	"related_instruments" jsonb NOT NULL,
	"original_content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE "factor_correlations" (
	"factor_id_1" uuid NOT NULL,
	"factor_id_2" uuid NOT NULL,
	"correlation" numeric(5, 4) NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "factor_correlations_factor_id_1_factor_id_2_pk" PRIMARY KEY("factor_id_1","factor_id_2")
);

CREATE TABLE "factor_performance" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"factor_id" uuid NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"ic" numeric(6, 4) NOT NULL,
	"icir" numeric(8, 4),
	"sharpe" numeric(8, 4),
	"weight" numeric(6, 4) DEFAULT '0.0' NOT NULL,
	"signal_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "factor_performance_factor_date" UNIQUE("factor_id","date")
);

CREATE TABLE "factor_weights" (
	"factor_id" uuid PRIMARY KEY NOT NULL,
	"weight" numeric(6, 4) DEFAULT '0.0' NOT NULL,
	"last_ic" numeric(6, 4),
	"last_updated" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "factors" (
	"factor_id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"hypothesis_id" uuid,
	"name" text NOT NULL,
	"status" "factor_status" DEFAULT 'research' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"author" text DEFAULT 'claude-code' NOT NULL,
	"python_module" text,
	"typescript_module" text,
	"symbolic_length" integer,
	"parameter_count" integer,
	"feature_count" integer,
	"originality_score" numeric(5, 4),
	"hypothesis_alignment" numeric(5, 4),
	"stage1_sharpe" numeric(8, 4),
	"stage1_ic" numeric(6, 4),
	"stage1_max_drawdown" numeric(6, 4),
	"stage1_completed_at" timestamp with time zone,
	"stage2_pbo" numeric(6, 4),
	"stage2_dsr_pvalue" numeric(6, 4),
	"stage2_wfe" numeric(6, 4),
	"stage2_completed_at" timestamp with time zone,
	"paper_validation_passed" integer DEFAULT 0,
	"paper_start_date" timestamp with time zone,
	"paper_end_date" timestamp with time zone,
	"paper_realized_sharpe" numeric(8, 4),
	"paper_realized_ic" numeric(6, 4),
	"current_weight" numeric(6, 4) DEFAULT '0.0',
	"last_ic" numeric(6, 4),
	"decay_rate" numeric(6, 4),
	"target_regimes" jsonb,
	"parity_report" text,
	"parity_validated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"promoted_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"last_updated" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "factors_name_unique" UNIQUE("name")
);

CREATE TABLE "features" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"timeframe" timeframe NOT NULL,
	"indicator_name" text NOT NULL,
	"raw_value" numeric(18, 8) NOT NULL,
	"normalized_value" numeric(8, 6),
	"parameters" jsonb,
	"quality_score" numeric(4, 3),
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "filing_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"symbols_requested" jsonb NOT NULL,
	"filing_types" jsonb NOT NULL,
	"date_range_start" timestamp with time zone,
	"date_range_end" timestamp with time zone,
	"symbols_total" integer DEFAULT 0,
	"symbols_processed" integer DEFAULT 0,
	"filings_fetched" integer DEFAULT 0,
	"filings_ingested" integer DEFAULT 0,
	"chunks_created" integer DEFAULT 0,
	"status" "sync_run_status" DEFAULT 'running' NOT NULL,
	"error_message" text,
	"trigger_source" "sync_trigger_source" NOT NULL,
	"environment" "environment" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "filings" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"accession_number" text NOT NULL,
	"symbol" text NOT NULL,
	"filing_type" "filing_type" NOT NULL,
	"filed_date" timestamp with time zone NOT NULL,
	"report_date" timestamp with time zone,
	"company_name" text,
	"cik" text,
	"section_count" integer DEFAULT 0,
	"chunk_count" integer DEFAULT 0,
	"status" "filing_status" DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"ingested_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "filings_accession_number_unique" UNIQUE("accession_number")
);

CREATE TABLE "fundamental_indicators" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"symbol" text NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"pe_ratio_ttm" numeric(10, 2),
	"pe_ratio_forward" numeric(10, 2),
	"pb_ratio" numeric(10, 2),
	"ev_ebitda" numeric(10, 2),
	"earnings_yield" numeric(8, 4),
	"dividend_yield" numeric(8, 4),
	"cape_10yr" numeric(10, 2),
	"gross_profitability" numeric(8, 4),
	"roe" numeric(8, 4),
	"roa" numeric(8, 4),
	"asset_growth" numeric(8, 4),
	"accruals_ratio" numeric(8, 4),
	"cash_flow_quality" numeric(8, 4),
	"beneish_m_score" numeric(8, 4),
	"market_cap" numeric(18, 2),
	"sector" text,
	"industry" text,
	"source" text DEFAULT 'computed' NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fundamental_indicators_symbol_date" UNIQUE("symbol","date")
);

CREATE TABLE "hypotheses" (
	"hypothesis_id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"title" text NOT NULL,
	"economic_rationale" text NOT NULL,
	"market_mechanism" text NOT NULL,
	"target_regime" text,
	"falsification_criteria" text,
	"status" "hypothesis_status" DEFAULT 'proposed' NOT NULL,
	"iteration" integer DEFAULT 1 NOT NULL,
	"parent_hypothesis_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "index_constituents" (
	"id" serial PRIMARY KEY NOT NULL,
	"index_id" text NOT NULL,
	"symbol" text NOT NULL,
	"date_added" timestamp with time zone NOT NULL,
	"date_removed" timestamp with time zone,
	"reason_added" text,
	"reason_removed" text,
	"sector" text,
	"industry" text,
	"market_cap_at_add" numeric(18, 2),
	"provider" text DEFAULT 'alpaca' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "indicator_ic_history" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"indicator_id" uuid NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"ic_value" numeric(6, 4) NOT NULL,
	"ic_std" numeric(6, 4) NOT NULL,
	"decisions_used_in" integer DEFAULT 0 NOT NULL,
	"decisions_correct" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "indicator_ic_history_indicator_date" UNIQUE("indicator_id","date")
);

CREATE TABLE "indicator_paper_signals" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"indicator_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"signal_date" timestamp with time zone NOT NULL,
	"signal" numeric(5, 4) NOT NULL,
	"outcome" numeric(8, 4),
	"outcome_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "indicator_paper_signals_unique" UNIQUE("indicator_id","symbol","signal_date")
);

CREATE TABLE "indicator_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"run_type" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"symbols_processed" integer DEFAULT 0,
	"symbols_failed" integer DEFAULT 0,
	"status" "sync_run_status" DEFAULT 'running' NOT NULL,
	"error_message" text,
	"environment" "environment" NOT NULL
);

CREATE TABLE "indicator_trials" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"indicator_id" uuid NOT NULL,
	"trial_number" integer NOT NULL,
	"hypothesis" text NOT NULL,
	"parameters" jsonb NOT NULL,
	"sharpe_ratio" numeric(8, 4),
	"information_coefficient" numeric(6, 4),
	"max_drawdown" numeric(6, 4),
	"calmar_ratio" numeric(8, 4),
	"sortino_ratio" numeric(8, 4),
	"selected" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "indicator_trials_indicator_trial" UNIQUE("indicator_id","trial_number")
);

CREATE TABLE "indicators" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"category" "indicator_category" NOT NULL,
	"status" "indicator_status" DEFAULT 'staging' NOT NULL,
	"hypothesis" text NOT NULL,
	"economic_rationale" text NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"generated_by" text NOT NULL,
	"code_hash" text,
	"ast_signature" text,
	"validation_report" text,
	"paper_trading_start" timestamp with time zone,
	"paper_trading_end" timestamp with time zone,
	"paper_trading_report" text,
	"promoted_at" timestamp with time zone,
	"pr_url" text,
	"merged_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"retirement_reason" text,
	"similar_to" uuid,
	"replaces" uuid,
	"parity_report" text,
	"parity_validated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "indicators_name_unique" UNIQUE("name")
);

CREATE TABLE "macro_watch_entries" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"session" "macro_watch_session" NOT NULL,
	"category" "macro_watch_category" NOT NULL,
	"headline" text NOT NULL,
	"symbols" jsonb NOT NULL,
	"source" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE "morning_newspapers" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"date" text NOT NULL,
	"compiled_at" timestamp with time zone NOT NULL,
	"sections" jsonb NOT NULL,
	"raw_entry_ids" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "morning_newspapers_date_unique" UNIQUE("date")
);

CREATE TABLE "options_indicators_cache" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"symbol" text NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"implied_volatility" numeric(8, 4),
	"iv_percentile_30d" numeric(5, 2),
	"iv_skew" numeric(8, 4),
	"put_call_ratio" numeric(8, 4),
	"vrp" numeric(8, 4),
	"term_structure_slope" numeric(8, 4),
	"net_delta" numeric(12, 4),
	"net_gamma" numeric(12, 4),
	"net_theta" numeric(12, 4),
	"net_vega" numeric(12, 4),
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "options_indicators_cache_symbol_unique" UNIQUE("symbol")
);

CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"decision_id" uuid,
	"symbol" text NOT NULL,
	"side" "order_side" NOT NULL,
	"qty" numeric(14, 4) NOT NULL,
	"order_type" "order_type" NOT NULL,
	"limit_price" numeric(12, 4),
	"stop_price" numeric(12, 4),
	"time_in_force" time_in_force DEFAULT 'day' NOT NULL,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"broker_order_id" text,
	"filled_qty" numeric(14, 4) DEFAULT '0',
	"filled_avg_price" numeric(12, 4),
	"commission" numeric(10, 4),
	"environment" "environment" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"filled_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "positive_quantity" CHECK ("orders"."qty"::numeric > 0)
);

CREATE TABLE "paper_signals" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"factor_id" uuid NOT NULL,
	"signal_date" timestamp with time zone NOT NULL,
	"symbol" text NOT NULL,
	"signal_value" numeric(8, 4) NOT NULL,
	"direction" text NOT NULL,
	"entry_price" numeric(12, 4),
	"exit_price" numeric(12, 4),
	"actual_return" numeric(8, 4),
	"predicted_return" numeric(8, 4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "paper_signals_factor_date_symbol" UNIQUE("factor_id","signal_date","symbol")
);

CREATE TABLE "parity_validation_history" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"entity_type" "parity_entity_type" NOT NULL,
	"entity_id" text NOT NULL,
	"environment" "environment" NOT NULL,
	"passed" boolean NOT NULL,
	"recommendation" "parity_recommendation" NOT NULL,
	"blocking_issues" jsonb,
	"warnings" jsonb,
	"full_report" jsonb NOT NULL,
	"validated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "portfolio_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"environment" "environment" NOT NULL,
	"nav" numeric(16, 2) NOT NULL,
	"cash" numeric(16, 2) NOT NULL,
	"equity" numeric(16, 2) NOT NULL,
	"gross_exposure" numeric(8, 4) NOT NULL,
	"net_exposure" numeric(8, 4) NOT NULL,
	"long_exposure" numeric(8, 4),
	"short_exposure" numeric(8, 4),
	"open_positions" integer,
	"day_pnl" numeric(14, 2),
	"day_return_pct" numeric(8, 4),
	"total_return_pct" numeric(8, 4),
	"max_drawdown" numeric(8, 4),
	CONSTRAINT "portfolio_snapshots_timestamp_env" UNIQUE("timestamp","environment")
);

CREATE TABLE "position_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"position_id" uuid NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"price" numeric(12, 4) NOT NULL,
	"qty" numeric(14, 4) NOT NULL,
	"unrealized_pnl" numeric(14, 2),
	"market_value" numeric(14, 2)
);

CREATE TABLE "positions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"symbol" text NOT NULL,
	"side" "position_side" NOT NULL,
	"qty" numeric(14, 4) NOT NULL,
	"avg_entry" numeric(12, 4) NOT NULL,
	"current_price" numeric(12, 4),
	"unrealized_pnl" numeric(14, 2),
	"unrealized_pnl_pct" numeric(8, 4),
	"realized_pnl" numeric(14, 2) DEFAULT '0',
	"market_value" numeric(14, 2),
	"cost_basis" numeric(14, 2),
	"thesis_id" uuid,
	"decision_id" uuid,
	"status" "position_status" DEFAULT 'open' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"environment" "environment" NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "positive_quantity" CHECK ("positions"."qty"::numeric > 0),
	CONSTRAINT "positive_entry" CHECK ("positions"."avg_entry"::numeric > 0)
);

CREATE TABLE "prediction_market_arbitrage" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"kalshi_ticker" text NOT NULL,
	"polymarket_token" text NOT NULL,
	"kalshi_price" numeric(6, 4) NOT NULL,
	"polymarket_price" numeric(6, 4) NOT NULL,
	"divergence_pct" numeric(6, 4) NOT NULL,
	"market_type" "prediction_market_type" NOT NULL,
	"detected_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolution_price" numeric(6, 4),
	"created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE "prediction_market_signals" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"signal_type" text NOT NULL,
	"signal_value" numeric(8, 4) NOT NULL,
	"confidence" numeric(4, 3),
	"computed_at" timestamp with time zone NOT NULL,
	"inputs" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE "prediction_market_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"platform" "prediction_market_platform" NOT NULL,
	"market_ticker" text NOT NULL,
	"market_type" "prediction_market_type" NOT NULL,
	"market_question" text,
	"snapshot_time" timestamp with time zone NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE "regime_labels" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"timeframe" timeframe NOT NULL,
	"regime" "regime" NOT NULL,
	"confidence" numeric(4, 3) NOT NULL,
	"trend_strength" numeric(4, 3),
	"volatility_percentile" numeric(5, 2),
	"correlation_to_market" numeric(4, 3),
	"model_name" text DEFAULT 'hmm_regime' NOT NULL,
	"model_version" text,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "research_runs" (
	"run_id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"trigger_type" "research_trigger_type" NOT NULL,
	"trigger_reason" text NOT NULL,
	"phase" "research_phase" DEFAULT 'idea' NOT NULL,
	"current_iteration" integer DEFAULT 1 NOT NULL,
	"hypothesis_id" uuid,
	"factor_id" uuid,
	"pr_url" text,
	"error_message" text,
	"tokens_used" integer DEFAULT 0,
	"compute_hours" numeric(8, 2) DEFAULT '0.0',
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);

CREATE TABLE "sentiment_indicators" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"symbol" text NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"sentiment_score" numeric(5, 4),
	"sentiment_strength" numeric(5, 4),
	"news_volume" integer,
	"sentiment_momentum" numeric(5, 4),
	"event_risk_flag" boolean DEFAULT false,
	"news_sentiment" numeric(5, 4),
	"social_sentiment" numeric(5, 4),
	"analyst_sentiment" numeric(5, 4),
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sentiment_indicators_symbol_date" UNIQUE("symbol","date")
);

CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"expires_at" bigint NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	"created_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL,
	"updated_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);

CREATE TABLE "short_interest_indicators" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"symbol" text NOT NULL,
	"settlement_date" timestamp with time zone NOT NULL,
	"short_interest" numeric(18, 0) NOT NULL,
	"short_interest_ratio" numeric(8, 2),
	"days_to_cover" numeric(8, 2),
	"short_pct_float" numeric(8, 4),
	"short_interest_change" numeric(8, 4),
	"source" text DEFAULT 'FINRA' NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "short_interest_symbol_date" UNIQUE("symbol","settlement_date")
);

CREATE TABLE "system_state" (
	"environment" "environment" PRIMARY KEY NOT NULL,
	"status" "system_status" DEFAULT 'stopped' NOT NULL,
	"last_cycle_id" uuid,
	"last_cycle_time" timestamp with time zone,
	"current_phase" text,
	"phase_started_at" timestamp with time zone,
	"next_cycle_at" timestamp with time zone,
	"error_message" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "thesis_state" (
	"thesis_id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"instrument_id" text NOT NULL,
	"state" "thesis_state_value" NOT NULL,
	"entry_price" numeric(12, 4),
	"entry_date" timestamp with time zone,
	"current_stop" numeric(12, 4),
	"current_target" numeric(12, 4),
	"conviction" numeric(4, 3),
	"entry_thesis" text,
	"invalidation_conditions" text,
	"add_count" integer DEFAULT 0 NOT NULL,
	"max_position_reached" integer DEFAULT 0 NOT NULL,
	"peak_unrealized_pnl" numeric(14, 2),
	"close_reason" text,
	"exit_price" numeric(12, 4),
	"realized_pnl" numeric(14, 2),
	"realized_pnl_pct" numeric(8, 4),
	"environment" "environment" NOT NULL,
	"notes" text,
	"last_updated" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);

CREATE TABLE "thesis_state_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"thesis_id" uuid NOT NULL,
	"from_state" "thesis_state_value" NOT NULL,
	"to_state" "thesis_state_value" NOT NULL,
	"trigger_reason" text,
	"cycle_id" uuid,
	"price_at_transition" numeric(12, 4),
	"conviction_at_transition" numeric(4, 3),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "ticker_changes" (
	"id" serial PRIMARY KEY NOT NULL,
	"old_symbol" text NOT NULL,
	"new_symbol" text NOT NULL,
	"change_date" timestamp with time zone NOT NULL,
	"change_type" "ticker_change_type" NOT NULL,
	"conversion_ratio" numeric(10, 6),
	"reason" text,
	"acquiring_company" text,
	"provider" text DEFAULT 'alpaca' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "trading_config" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"environment" "environment" NOT NULL,
	"version" integer NOT NULL,
	"max_consensus_iterations" integer DEFAULT 3,
	"agent_timeout_ms" integer DEFAULT 30000,
	"total_consensus_timeout_ms" integer DEFAULT 300000,
	"conviction_delta_hold" numeric(4, 3) DEFAULT '0.2',
	"conviction_delta_action" numeric(4, 3) DEFAULT '0.3',
	"high_conviction_pct" numeric(4, 3) DEFAULT '0.7',
	"medium_conviction_pct" numeric(4, 3) DEFAULT '0.5',
	"low_conviction_pct" numeric(4, 3) DEFAULT '0.25',
	"min_risk_reward_ratio" numeric(4, 2) DEFAULT '1.5',
	"kelly_fraction" numeric(4, 3) DEFAULT '0.5',
	"trading_cycle_interval_ms" integer DEFAULT 3600000,
	"prediction_markets_interval_ms" integer DEFAULT 900000,
	"global_model" text DEFAULT 'gemini-3-flash-preview' NOT NULL,
	"status" "config_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"promoted_from" uuid,
	CONSTRAINT "valid_kelly" CHECK ("trading_config"."kelly_fraction"::numeric > 0 AND "trading_config"."kelly_fraction"::numeric <= 1)
);

CREATE TABLE "two_factor" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" uuid NOT NULL
);

CREATE TABLE "universe_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"source_hash" text NOT NULL,
	"tickers" jsonb NOT NULL,
	"ticker_count" integer NOT NULL,
	"metadata" jsonb,
	"cached_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"provider" text
);

CREATE TABLE "universe_configs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"environment" "environment" NOT NULL,
	"source" "universe_source" NOT NULL,
	"static_symbols" jsonb,
	"index_source" text,
	"min_volume" integer,
	"min_market_cap" integer,
	"optionable_only" boolean DEFAULT false NOT NULL,
	"include_list" jsonb DEFAULT '[]'::jsonb,
	"exclude_list" jsonb DEFAULT '[]'::jsonb,
	"status" "config_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "universe_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"snapshot_date" timestamp with time zone NOT NULL,
	"index_id" text NOT NULL,
	"tickers" jsonb NOT NULL,
	"ticker_count" integer NOT NULL,
	"source_version" text,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);

CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"two_factor_enabled" boolean DEFAULT false,
	"created_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL,
	"updated_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);

CREATE TABLE "user_preferences" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"theme" "theme" DEFAULT 'system' NOT NULL,
	"chart_timeframe" chart_timeframe DEFAULT '1M' NOT NULL,
	"feed_filters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sidebar_collapsed" boolean DEFAULT false NOT NULL,
	"notification_settings" jsonb DEFAULT '{"emailAlerts":true,"pushNotifications":false,"tradeConfirmations":true,"dailySummary":true,"riskAlerts":true}'::jsonb NOT NULL,
	"default_portfolio_view" "portfolio_view" DEFAULT 'table' NOT NULL,
	"date_format" date_format DEFAULT 'MM/DD/YYYY' NOT NULL,
	"time_format" time_format DEFAULT '12h' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_user_id_unique" UNIQUE("user_id")
);

CREATE TABLE "verification" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"created_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL,
	"updated_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL
);

ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "agent_outputs" ADD CONSTRAINT "agent_outputs_decision_id_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."decisions"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "alert_settings" ADD CONSTRAINT "alert_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "backtest_equity" ADD CONSTRAINT "backtest_equity_backtest_id_backtests_id_fk" FOREIGN KEY ("backtest_id") REFERENCES "public"."backtests"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "backtest_trades" ADD CONSTRAINT "backtest_trades_backtest_id_backtests_id_fk" FOREIGN KEY ("backtest_id") REFERENCES "public"."backtests"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "cycle_events" ADD CONSTRAINT "cycle_events_cycle_id_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "factor_correlations" ADD CONSTRAINT "factor_correlations_factor_id_1_factors_factor_id_fk" FOREIGN KEY ("factor_id_1") REFERENCES "public"."factors"("factor_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "factor_correlations" ADD CONSTRAINT "factor_correlations_factor_id_2_factors_factor_id_fk" FOREIGN KEY ("factor_id_2") REFERENCES "public"."factors"("factor_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "factor_performance" ADD CONSTRAINT "factor_performance_factor_id_factors_factor_id_fk" FOREIGN KEY ("factor_id") REFERENCES "public"."factors"("factor_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "factor_weights" ADD CONSTRAINT "factor_weights_factor_id_factors_factor_id_fk" FOREIGN KEY ("factor_id") REFERENCES "public"."factors"("factor_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "factors" ADD CONSTRAINT "factors_hypothesis_id_hypotheses_hypothesis_id_fk" FOREIGN KEY ("hypothesis_id") REFERENCES "public"."hypotheses"("hypothesis_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "indicator_ic_history" ADD CONSTRAINT "indicator_ic_history_indicator_id_indicators_id_fk" FOREIGN KEY ("indicator_id") REFERENCES "public"."indicators"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "indicator_paper_signals" ADD CONSTRAINT "indicator_paper_signals_indicator_id_indicators_id_fk" FOREIGN KEY ("indicator_id") REFERENCES "public"."indicators"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "indicator_trials" ADD CONSTRAINT "indicator_trials_indicator_id_indicators_id_fk" FOREIGN KEY ("indicator_id") REFERENCES "public"."indicators"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "orders" ADD CONSTRAINT "orders_decision_id_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."decisions"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "paper_signals" ADD CONSTRAINT "paper_signals_factor_id_factors_factor_id_fk" FOREIGN KEY ("factor_id") REFERENCES "public"."factors"("factor_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "position_history" ADD CONSTRAINT "position_history_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "positions" ADD CONSTRAINT "positions_decision_id_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."decisions"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "research_runs" ADD CONSTRAINT "research_runs_hypothesis_id_hypotheses_hypothesis_id_fk" FOREIGN KEY ("hypothesis_id") REFERENCES "public"."hypotheses"("hypothesis_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "research_runs" ADD CONSTRAINT "research_runs_factor_id_factors_factor_id_fk" FOREIGN KEY ("factor_id") REFERENCES "public"."factors"("factor_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "thesis_state_history" ADD CONSTRAINT "thesis_state_history_thesis_id_thesis_state_thesis_id_fk" FOREIGN KEY ("thesis_id") REFERENCES "public"."thesis_state"("thesis_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "idx_account_user_id" ON "account" USING btree ("user_id");
CREATE INDEX "idx_account_provider_id" ON "account" USING btree ("provider_id");
CREATE INDEX "idx_account_provider_account" ON "account" USING btree ("provider_id","account_id");
CREATE INDEX "idx_agent_configs_environment" ON "agent_configs" USING btree ("environment");
CREATE INDEX "idx_agent_configs_agent_type" ON "agent_configs" USING btree ("agent_type");
CREATE UNIQUE INDEX "idx_agent_configs_env_agent" ON "agent_configs" USING btree ("environment","agent_type");
CREATE INDEX "idx_agent_outputs_decision_id" ON "agent_outputs" USING btree ("decision_id");
CREATE INDEX "idx_agent_outputs_agent_type" ON "agent_outputs" USING btree ("agent_type");
CREATE INDEX "idx_agent_outputs_decision_agent" ON "agent_outputs" USING btree ("decision_id","agent_type");
CREATE INDEX "idx_alert_settings_user_id" ON "alert_settings" USING btree ("user_id");
CREATE INDEX "idx_alerts_severity" ON "alerts" USING btree ("severity");
CREATE INDEX "idx_alerts_type" ON "alerts" USING btree ("type");
CREATE INDEX "idx_alerts_acknowledged" ON "alerts" USING btree ("acknowledged");
CREATE INDEX "idx_alerts_created_at" ON "alerts" USING btree ("created_at");
CREATE INDEX "idx_alerts_environment" ON "alerts" USING btree ("environment");
CREATE INDEX "idx_alerts_unack_env" ON "alerts" USING btree ("environment","acknowledged") WHERE "alerts"."acknowledged" = false;
CREATE INDEX "idx_audit_log_user_id" ON "audit_log" USING btree ("user_id");
CREATE INDEX "idx_audit_log_timestamp" ON "audit_log" USING btree ("timestamp");
CREATE INDEX "idx_audit_log_action" ON "audit_log" USING btree ("action");
CREATE INDEX "idx_audit_log_environment" ON "audit_log" USING btree ("environment");
CREATE INDEX "idx_backtest_equity_backtest_id" ON "backtest_equity" USING btree ("backtest_id");
CREATE INDEX "idx_backtest_equity_timestamp" ON "backtest_equity" USING btree ("timestamp");
CREATE INDEX "idx_backtest_equity_bt_ts" ON "backtest_equity" USING btree ("backtest_id","timestamp");
CREATE INDEX "idx_backtest_trades_backtest_id" ON "backtest_trades" USING btree ("backtest_id");
CREATE INDEX "idx_backtest_trades_timestamp" ON "backtest_trades" USING btree ("timestamp");
CREATE INDEX "idx_backtest_trades_symbol" ON "backtest_trades" USING btree ("symbol");
CREATE INDEX "idx_backtest_trades_bt_ts" ON "backtest_trades" USING btree ("backtest_id","timestamp");
CREATE INDEX "idx_backtests_status" ON "backtests" USING btree ("status");
CREATE INDEX "idx_backtests_start_date" ON "backtests" USING btree ("start_date");
CREATE INDEX "idx_backtests_created_at" ON "backtests" USING btree ("created_at");
CREATE UNIQUE INDEX "idx_candles_symbol_timeframe_ts" ON "candles" USING btree ("symbol","timeframe","timestamp");
CREATE INDEX "idx_candles_timestamp" ON "candles" USING btree ("timestamp");
CREATE INDEX "idx_candles_symbol" ON "candles" USING btree ("symbol");
CREATE INDEX "idx_candles_timeframe" ON "candles" USING btree ("timeframe");
CREATE INDEX "idx_config_versions_environment" ON "config_versions" USING btree ("environment");
CREATE INDEX "idx_config_versions_active" ON "config_versions" USING btree ("active");
CREATE INDEX "idx_config_versions_created_at" ON "config_versions" USING btree ("created_at");
CREATE UNIQUE INDEX "idx_config_versions_env_active" ON "config_versions" USING btree ("environment") WHERE "config_versions"."active" = true;
CREATE INDEX "idx_constraints_config_environment" ON "constraints_config" USING btree ("environment");
CREATE INDEX "idx_constraints_config_status" ON "constraints_config" USING btree ("status");
CREATE INDEX "idx_constraints_config_env_status" ON "constraints_config" USING btree ("environment","status");
CREATE UNIQUE INDEX "idx_constraints_config_env_active" ON "constraints_config" USING btree ("environment") WHERE "constraints_config"."status" = 'active';
CREATE INDEX "idx_corporate_actions_symbol_date" ON "corporate_actions" USING btree ("symbol","ex_date");
CREATE INDEX "idx_corporate_actions_ex_date" ON "corporate_actions" USING btree ("ex_date");
CREATE INDEX "idx_corporate_actions_type" ON "corporate_actions" USING btree ("action_type");
CREATE UNIQUE INDEX "idx_corporate_actions_unique" ON "corporate_actions" USING btree ("symbol","action_type","ex_date");
CREATE INDEX "idx_corp_actions_symbol" ON "corporate_actions_indicators" USING btree ("symbol","date");
CREATE INDEX "idx_corp_actions_symbol_only" ON "corporate_actions_indicators" USING btree ("symbol");
CREATE INDEX "idx_cycle_events_cycle_id" ON "cycle_events" USING btree ("cycle_id");
CREATE INDEX "idx_cycle_events_type" ON "cycle_events" USING btree ("event_type");
CREATE INDEX "idx_cycle_events_timestamp" ON "cycle_events" USING btree ("timestamp");
CREATE INDEX "idx_cycle_events_agent" ON "cycle_events" USING btree ("cycle_id","agent_type");
CREATE INDEX "idx_cycle_events_agent_event" ON "cycle_events" USING btree ("cycle_id","agent_type","event_type");
CREATE INDEX "idx_cycles_environment" ON "cycles" USING btree ("environment");
CREATE INDEX "idx_cycles_status" ON "cycles" USING btree ("status");
CREATE INDEX "idx_cycles_started_at" ON "cycles" USING btree ("started_at");
CREATE INDEX "idx_cycles_env_status" ON "cycles" USING btree ("environment","status");
CREATE INDEX "idx_cycles_env_started" ON "cycles" USING btree ("environment","started_at");
CREATE INDEX "idx_decisions_cycle_id" ON "decisions" USING btree ("cycle_id");
CREATE INDEX "idx_decisions_symbol" ON "decisions" USING btree ("symbol");
CREATE INDEX "idx_decisions_status" ON "decisions" USING btree ("status");
CREATE INDEX "idx_decisions_created_at" ON "decisions" USING btree ("created_at");
CREATE INDEX "idx_decisions_symbol_created" ON "decisions" USING btree ("symbol","created_at");
CREATE INDEX "idx_decisions_environment" ON "decisions" USING btree ("environment");
CREATE INDEX "idx_exec_order_snapshots_broker_id" ON "execution_order_snapshots" USING btree ("broker_order_id");
CREATE INDEX "idx_exec_order_snapshots_env_status" ON "execution_order_snapshots" USING btree ("environment","status");
CREATE INDEX "idx_exec_position_snapshots_env" ON "execution_position_snapshots" USING btree ("environment");
CREATE INDEX "idx_external_events_event_time" ON "external_events" USING btree ("event_time");
CREATE INDEX "idx_external_events_source_type" ON "external_events" USING btree ("source_type");
CREATE INDEX "idx_external_events_event_type" ON "external_events" USING btree ("event_type");
CREATE INDEX "idx_external_events_processed_at" ON "external_events" USING btree ("processed_at");
CREATE INDEX "idx_external_events_sentiment" ON "external_events" USING btree ("sentiment");
CREATE INDEX "idx_external_events_importance" ON "external_events" USING btree ("importance_score");
CREATE INDEX "idx_factor_perf_factor_date" ON "factor_performance" USING btree ("factor_id","date");
CREATE INDEX "idx_factors_status" ON "factors" USING btree ("status");
CREATE INDEX "idx_factors_hypothesis" ON "factors" USING btree ("hypothesis_id");
CREATE INDEX "idx_factors_active" ON "factors" USING btree ("status") WHERE "factors"."status" IN ('active', 'decaying');
CREATE UNIQUE INDEX "idx_features_symbol_ts_indicator" ON "features" USING btree ("symbol","timestamp","timeframe","indicator_name");
CREATE INDEX "idx_features_symbol_indicator_ts" ON "features" USING btree ("symbol","indicator_name","timestamp");
CREATE INDEX "idx_features_timestamp" ON "features" USING btree ("timestamp");
CREATE INDEX "idx_features_indicator" ON "features" USING btree ("indicator_name");
CREATE INDEX "idx_filing_sync_runs_started_at" ON "filing_sync_runs" USING btree ("started_at");
CREATE INDEX "idx_filing_sync_runs_status" ON "filing_sync_runs" USING btree ("status");
CREATE INDEX "idx_filing_sync_runs_environment" ON "filing_sync_runs" USING btree ("environment");
CREATE INDEX "idx_filing_sync_runs_trigger" ON "filing_sync_runs" USING btree ("trigger_source");
CREATE INDEX "idx_filings_symbol" ON "filings" USING btree ("symbol");
CREATE INDEX "idx_filings_filing_type" ON "filings" USING btree ("filing_type");
CREATE INDEX "idx_filings_filed_date" ON "filings" USING btree ("filed_date");
CREATE INDEX "idx_filings_status" ON "filings" USING btree ("status");
CREATE INDEX "idx_filings_symbol_type" ON "filings" USING btree ("symbol","filing_type");
CREATE INDEX "idx_filings_symbol_date" ON "filings" USING btree ("symbol","filed_date");
CREATE INDEX "idx_fundamental_symbol_date" ON "fundamental_indicators" USING btree ("symbol","date");
CREATE INDEX "idx_fundamental_symbol" ON "fundamental_indicators" USING btree ("symbol");
CREATE INDEX "idx_hypotheses_status" ON "hypotheses" USING btree ("status");
CREATE INDEX "idx_index_constituents_pit" ON "index_constituents" USING btree ("index_id","date_added","date_removed");
CREATE INDEX "idx_index_constituents_symbol" ON "index_constituents" USING btree ("symbol","index_id");
CREATE INDEX "idx_index_constituents_current" ON "index_constituents" USING btree ("index_id","date_removed");
CREATE UNIQUE INDEX "idx_index_constituents_unique" ON "index_constituents" USING btree ("index_id","symbol","date_added");
CREATE INDEX "idx_ic_history_indicator_date" ON "indicator_ic_history" USING btree ("indicator_id","date");
CREATE INDEX "idx_ind_paper_signals_indicator" ON "indicator_paper_signals" USING btree ("indicator_id");
CREATE INDEX "idx_ind_paper_signals_symbol" ON "indicator_paper_signals" USING btree ("symbol");
CREATE INDEX "idx_ind_paper_signals_date" ON "indicator_paper_signals" USING btree ("signal_date");
CREATE INDEX "idx_indicator_sync_runs_type" ON "indicator_sync_runs" USING btree ("run_type");
CREATE INDEX "idx_indicator_sync_runs_status" ON "indicator_sync_runs" USING btree ("status");
CREATE INDEX "idx_indicator_sync_runs_started" ON "indicator_sync_runs" USING btree ("started_at");
CREATE INDEX "idx_trials_indicator" ON "indicator_trials" USING btree ("indicator_id");
CREATE INDEX "idx_indicators_status" ON "indicators" USING btree ("status");
CREATE INDEX "idx_indicators_category" ON "indicators" USING btree ("category");
CREATE INDEX "idx_indicators_code_hash" ON "indicators" USING btree ("code_hash");
CREATE INDEX "idx_indicators_active" ON "indicators" USING btree ("status") WHERE "indicators"."status" IN ('paper', 'production');
CREATE INDEX "idx_macro_watch_timestamp" ON "macro_watch_entries" USING btree ("timestamp");
CREATE INDEX "idx_macro_watch_category" ON "macro_watch_entries" USING btree ("category");
CREATE INDEX "idx_macro_watch_session" ON "macro_watch_entries" USING btree ("session");
CREATE INDEX "idx_morning_newspapers_date" ON "morning_newspapers" USING btree ("date");
CREATE INDEX "idx_options_cache_symbol" ON "options_indicators_cache" USING btree ("symbol");
CREATE INDEX "idx_options_cache_expires" ON "options_indicators_cache" USING btree ("expires_at");
CREATE INDEX "idx_orders_decision_id" ON "orders" USING btree ("decision_id");
CREATE INDEX "idx_orders_symbol" ON "orders" USING btree ("symbol");
CREATE INDEX "idx_orders_status" ON "orders" USING btree ("status");
CREATE INDEX "idx_orders_broker_order_id" ON "orders" USING btree ("broker_order_id");
CREATE INDEX "idx_orders_created_at" ON "orders" USING btree ("created_at");
CREATE INDEX "idx_orders_environment" ON "orders" USING btree ("environment");
CREATE INDEX "idx_paper_signals_factor" ON "paper_signals" USING btree ("factor_id");
CREATE INDEX "idx_paper_signals_date" ON "paper_signals" USING btree ("signal_date");
CREATE INDEX "idx_paper_signals_factor_date" ON "paper_signals" USING btree ("factor_id","signal_date");
CREATE INDEX "idx_parity_history_entity" ON "parity_validation_history" USING btree ("entity_type","entity_id");
CREATE INDEX "idx_parity_history_environment" ON "parity_validation_history" USING btree ("environment");
CREATE INDEX "idx_parity_history_passed" ON "parity_validation_history" USING btree ("passed");
CREATE INDEX "idx_parity_history_validated_at" ON "parity_validation_history" USING btree ("validated_at");
CREATE INDEX "idx_portfolio_snapshots_timestamp" ON "portfolio_snapshots" USING btree ("timestamp");
CREATE INDEX "idx_portfolio_snapshots_environment" ON "portfolio_snapshots" USING btree ("environment");
CREATE INDEX "idx_position_history_position_id" ON "position_history" USING btree ("position_id");
CREATE INDEX "idx_position_history_timestamp" ON "position_history" USING btree ("timestamp");
CREATE INDEX "idx_position_history_position_ts" ON "position_history" USING btree ("position_id","timestamp");
CREATE INDEX "idx_positions_symbol" ON "positions" USING btree ("symbol");
CREATE INDEX "idx_positions_thesis_id" ON "positions" USING btree ("thesis_id");
CREATE INDEX "idx_positions_decision_id" ON "positions" USING btree ("decision_id");
CREATE INDEX "idx_positions_status" ON "positions" USING btree ("status");
CREATE INDEX "idx_positions_environment" ON "positions" USING btree ("environment");
CREATE UNIQUE INDEX "idx_positions_symbol_env_open" ON "positions" USING btree ("symbol","environment") WHERE "positions"."closed_at" IS NULL;
CREATE INDEX "idx_pm_arbitrage_divergence" ON "prediction_market_arbitrage" USING btree ("divergence_pct");
CREATE INDEX "idx_pm_arbitrage_detected" ON "prediction_market_arbitrage" USING btree ("detected_at");
CREATE INDEX "idx_pm_arbitrage_unresolved" ON "prediction_market_arbitrage" USING btree ("resolved_at") WHERE "prediction_market_arbitrage"."resolved_at" IS NULL;
CREATE INDEX "idx_pm_signals_type" ON "prediction_market_signals" USING btree ("signal_type");
CREATE INDEX "idx_pm_signals_time" ON "prediction_market_signals" USING btree ("computed_at");
CREATE INDEX "idx_pm_snapshots_platform" ON "prediction_market_snapshots" USING btree ("platform");
CREATE INDEX "idx_pm_snapshots_ticker" ON "prediction_market_snapshots" USING btree ("market_ticker");
CREATE INDEX "idx_pm_snapshots_type" ON "prediction_market_snapshots" USING btree ("market_type");
CREATE INDEX "idx_pm_snapshots_time" ON "prediction_market_snapshots" USING btree ("snapshot_time");
CREATE UNIQUE INDEX "idx_regime_labels_symbol_ts_tf" ON "regime_labels" USING btree ("symbol","timestamp","timeframe");
CREATE INDEX "idx_regime_labels_symbol_ts" ON "regime_labels" USING btree ("symbol","timestamp");
CREATE INDEX "idx_regime_labels_regime" ON "regime_labels" USING btree ("regime");
CREATE INDEX "idx_regime_labels_market" ON "regime_labels" USING btree ("symbol","timestamp") WHERE "regime_labels"."symbol" = '_MARKET';
CREATE INDEX "idx_research_runs_phase" ON "research_runs" USING btree ("phase");
CREATE INDEX "idx_research_runs_trigger" ON "research_runs" USING btree ("trigger_type");
CREATE INDEX "idx_research_runs_hypothesis" ON "research_runs" USING btree ("hypothesis_id");
CREATE INDEX "idx_research_runs_factor" ON "research_runs" USING btree ("factor_id");
CREATE INDEX "idx_sentiment_symbol_date" ON "sentiment_indicators" USING btree ("symbol","date");
CREATE INDEX "idx_sentiment_symbol" ON "sentiment_indicators" USING btree ("symbol");
CREATE INDEX "idx_session_user_id" ON "session" USING btree ("user_id");
CREATE INDEX "idx_session_token" ON "session" USING btree ("token");
CREATE INDEX "idx_session_expires_at" ON "session" USING btree ("expires_at");
CREATE INDEX "idx_short_interest_symbol" ON "short_interest_indicators" USING btree ("symbol","settlement_date");
CREATE INDEX "idx_short_interest_settlement" ON "short_interest_indicators" USING btree ("settlement_date");
CREATE INDEX "idx_thesis_state_instrument" ON "thesis_state" USING btree ("instrument_id");
CREATE INDEX "idx_thesis_state_state" ON "thesis_state" USING btree ("state");
CREATE INDEX "idx_thesis_state_environment" ON "thesis_state" USING btree ("environment");
CREATE INDEX "idx_thesis_state_created_at" ON "thesis_state" USING btree ("created_at");
CREATE INDEX "idx_thesis_state_closed_at" ON "thesis_state" USING btree ("closed_at");
CREATE INDEX "idx_thesis_state_active" ON "thesis_state" USING btree ("environment","state") WHERE "thesis_state"."state" != 'CLOSED';
CREATE INDEX "idx_thesis_state_instrument_active" ON "thesis_state" USING btree ("instrument_id","environment") WHERE "thesis_state"."state" != 'CLOSED';
CREATE INDEX "idx_thesis_history_thesis_id" ON "thesis_state_history" USING btree ("thesis_id");
CREATE INDEX "idx_thesis_history_created_at" ON "thesis_state_history" USING btree ("created_at");
CREATE INDEX "idx_thesis_history_thesis_created" ON "thesis_state_history" USING btree ("thesis_id","created_at");
CREATE INDEX "idx_ticker_changes_old" ON "ticker_changes" USING btree ("old_symbol","change_date");
CREATE INDEX "idx_ticker_changes_new" ON "ticker_changes" USING btree ("new_symbol","change_date");
CREATE INDEX "idx_ticker_changes_date" ON "ticker_changes" USING btree ("change_date");
CREATE UNIQUE INDEX "idx_ticker_changes_unique" ON "ticker_changes" USING btree ("old_symbol","new_symbol","change_date");
CREATE INDEX "idx_trading_config_environment" ON "trading_config" USING btree ("environment");
CREATE INDEX "idx_trading_config_status" ON "trading_config" USING btree ("status");
CREATE INDEX "idx_trading_config_env_status" ON "trading_config" USING btree ("environment","status");
CREATE INDEX "idx_trading_config_created_at" ON "trading_config" USING btree ("created_at");
CREATE UNIQUE INDEX "idx_trading_config_env_active" ON "trading_config" USING btree ("environment") WHERE "trading_config"."status" = 'active';
CREATE INDEX "idx_two_factor_user_id" ON "two_factor" USING btree ("user_id");
CREATE INDEX "idx_two_factor_secret" ON "two_factor" USING btree ("secret");
CREATE UNIQUE INDEX "idx_universe_cache_source" ON "universe_cache" USING btree ("source_type","source_id");
CREATE INDEX "idx_universe_cache_expires" ON "universe_cache" USING btree ("expires_at");
CREATE INDEX "idx_universe_cache_hash" ON "universe_cache" USING btree ("source_hash");
CREATE INDEX "idx_universe_configs_environment" ON "universe_configs" USING btree ("environment");
CREATE INDEX "idx_universe_configs_status" ON "universe_configs" USING btree ("status");
CREATE INDEX "idx_universe_configs_env_status" ON "universe_configs" USING btree ("environment","status");
CREATE UNIQUE INDEX "idx_universe_configs_env_active" ON "universe_configs" USING btree ("environment") WHERE "universe_configs"."status" = 'active';
CREATE UNIQUE INDEX "idx_universe_snapshots_pit" ON "universe_snapshots" USING btree ("index_id","snapshot_date");
CREATE INDEX "idx_universe_snapshots_date" ON "universe_snapshots" USING btree ("snapshot_date");
CREATE INDEX "idx_user_email" ON "user" USING btree ("email");
CREATE INDEX "idx_user_created_at" ON "user" USING btree ("created_at");
CREATE INDEX "idx_user_preferences_user_id" ON "user_preferences" USING btree ("user_id");
CREATE INDEX "idx_user_preferences_created_at" ON "user_preferences" USING btree ("created_at");
CREATE INDEX "idx_verification_identifier" ON "verification" USING btree ("identifier");
CREATE INDEX "idx_verification_expires_at" ON "verification" USING btree ("expires_at");
-- ===========================================
-- Create environment-specific databases
-- ===========================================

CREATE DATABASE cream_backtest;
CREATE DATABASE cream_paper;
CREATE DATABASE cream_test;

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE cream TO cream;
GRANT ALL PRIVILEGES ON DATABASE cream_backtest TO cream;
GRANT ALL PRIVILEGES ON DATABASE cream_paper TO cream;
GRANT ALL PRIVILEGES ON DATABASE cream_test TO cream;

-- ===========================================
-- Setup cream_backtest database
-- ===========================================
\c cream_backtest
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE "public"."agent_type" AS ENUM('technical', 'news_analyst', 'fundamentals_analyst', 'bullish_researcher', 'bearish_researcher', 'trader', 'risk_manager', 'critic');
CREATE TYPE "public"."agent_vote" AS ENUM('APPROVE', 'REJECT', 'ABSTAIN');
CREATE TYPE "public"."alert_severity" AS ENUM('info', 'warning', 'error', 'critical');
CREATE TYPE "public"."backtest_status" AS ENUM('pending', 'running', 'completed', 'failed');
CREATE TYPE "public"."chart_timeframe" AS ENUM('1D', '1W', '1M', '3M', '6M', '1Y', 'ALL');
CREATE TYPE "public"."config_status" AS ENUM('draft', 'testing', 'active', 'archived');
CREATE TYPE "public"."corporate_action_type" AS ENUM('split', 'dividend', 'merger', 'spinoff');
CREATE TYPE "public"."cycle_event_type" AS ENUM('phase_change', 'agent_start', 'agent_complete', 'decision', 'order', 'error');
CREATE TYPE "public"."cycle_phase" AS ENUM('observe', 'orient', 'decide', 'act', 'complete');
CREATE TYPE "public"."cycle_status" AS ENUM('running', 'completed', 'failed');
CREATE TYPE "public"."date_format" AS ENUM('MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD');
CREATE TYPE "public"."decision_action" AS ENUM('BUY', 'SELL', 'HOLD', 'CLOSE', 'INCREASE', 'REDUCE', 'NO_TRADE');
CREATE TYPE "public"."decision_direction" AS ENUM('LONG', 'SHORT', 'FLAT');
CREATE TYPE "public"."decision_status" AS ENUM('pending', 'approved', 'rejected', 'executed', 'cancelled', 'expired');
CREATE TYPE "public"."environment" AS ENUM('BACKTEST', 'PAPER', 'LIVE');
CREATE TYPE "public"."execution_recovery_status" AS ENUM('unknown', 'healthy', 'error', 'interrupted', 'needs_attention');
CREATE TYPE "public"."external_event_source" AS ENUM('news', 'earnings', 'sec_filing', 'fed');
CREATE TYPE "public"."factor_status" AS ENUM('research', 'stage1', 'stage2', 'paper', 'active', 'decaying', 'retired');
CREATE TYPE "public"."filing_status" AS ENUM('pending', 'processing', 'complete', 'failed');
CREATE TYPE "public"."filing_type" AS ENUM('10-K', '10-Q', '8-K', 'DEF14A');
CREATE TYPE "public"."hypothesis_status" AS ENUM('proposed', 'testing', 'validated', 'rejected');
CREATE TYPE "public"."index_id" AS ENUM('SP500', 'NDX100', 'DJIA');
CREATE TYPE "public"."indicator_category" AS ENUM('momentum', 'trend', 'volatility', 'volume', 'sentiment');
CREATE TYPE "public"."indicator_status" AS ENUM('staging', 'paper', 'production', 'retired');
CREATE TYPE "public"."macro_watch_category" AS ENUM('NEWS', 'PREDICTION', 'ECONOMIC', 'MOVER', 'EARNINGS');
CREATE TYPE "public"."macro_watch_session" AS ENUM('OVERNIGHT', 'PRE_MARKET', 'AFTER_HOURS');
CREATE TYPE "public"."order_side" AS ENUM('buy', 'sell');
CREATE TYPE "public"."order_status" AS ENUM('pending', 'submitted', 'accepted', 'partial_fill', 'filled', 'cancelled', 'rejected', 'expired');
CREATE TYPE "public"."order_type" AS ENUM('market', 'limit', 'stop', 'stop_limit');
CREATE TYPE "public"."parity_entity_type" AS ENUM('indicator', 'factor', 'config');
CREATE TYPE "public"."parity_recommendation" AS ENUM('APPROVE_FOR_LIVE', 'NEEDS_INVESTIGATION', 'NOT_READY');
CREATE TYPE "public"."portfolio_view" AS ENUM('table', 'cards');
CREATE TYPE "public"."position_side" AS ENUM('long', 'short');
CREATE TYPE "public"."position_status" AS ENUM('open', 'closed', 'pending');
CREATE TYPE "public"."prediction_market_platform" AS ENUM('kalshi', 'polymarket');
CREATE TYPE "public"."prediction_market_type" AS ENUM('rate', 'election', 'economic');
CREATE TYPE "public"."regime" AS ENUM('trending_up', 'trending_down', 'ranging', 'volatile');
CREATE TYPE "public"."research_phase" AS ENUM('idea', 'implementation', 'stage1', 'stage2', 'translation', 'equivalence', 'paper', 'promotion', 'completed', 'failed');
CREATE TYPE "public"."research_trigger_type" AS ENUM('scheduled', 'decay_detected', 'regime_change', 'manual', 'refinement');
CREATE TYPE "public"."sentiment" AS ENUM('positive', 'negative', 'neutral');
CREATE TYPE "public"."size_unit" AS ENUM('SHARES', 'CONTRACTS', 'DOLLARS', 'PCT_EQUITY');
CREATE TYPE "public"."sync_run_status" AS ENUM('running', 'completed', 'failed');
CREATE TYPE "public"."sync_trigger_source" AS ENUM('scheduled', 'manual', 'dashboard');
CREATE TYPE "public"."system_status" AS ENUM('stopped', 'running', 'paused', 'error');
CREATE TYPE "public"."theme" AS ENUM('light', 'dark', 'system');
CREATE TYPE "public"."thesis_state_value" AS ENUM('WATCHING', 'STAGED', 'OPEN', 'SCALING', 'EXITING', 'CLOSED');
CREATE TYPE "public"."ticker_change_type" AS ENUM('rename', 'merger', 'spinoff', 'delisted');
CREATE TYPE "public"."time_format" AS ENUM('12h', '24h');
CREATE TYPE "public"."time_in_force" AS ENUM('day', 'gtc', 'ioc', 'fok');
CREATE TYPE "public"."timeframe" AS ENUM('1m', '5m', '15m', '1h', '1d');
CREATE TYPE "public"."universe_source" AS ENUM('static', 'index', 'screener');
CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" bigint,
	"refresh_token_expires_at" bigint,
	"scope" text,
	"password" text,
	"created_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL,
	"updated_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL
);

CREATE TABLE "agent_configs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"environment" "environment" NOT NULL,
	"agent_type" "agent_type" NOT NULL,
	"system_prompt_override" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "agent_outputs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"decision_id" uuid NOT NULL,
	"agent_type" "agent_type" NOT NULL,
	"vote" "agent_vote" NOT NULL,
	"confidence" numeric(4, 3) NOT NULL,
	"reasoning_summary" text,
	"full_reasoning" text,
	"tokens_used" integer,
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "valid_confidence" CHECK ("agent_outputs"."confidence"::numeric >= 0 AND "agent_outputs"."confidence"::numeric <= 1)
);

CREATE TABLE "alert_settings" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"enable_push" boolean DEFAULT true NOT NULL,
	"enable_email" boolean DEFAULT true NOT NULL,
	"email_address" text,
	"critical_only" boolean DEFAULT false NOT NULL,
	"quiet_hours_start" text,
	"quiet_hours_end" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alert_settings_user_id_unique" UNIQUE("user_id")
);

CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"severity" "alert_severity" NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"metadata" jsonb,
	"acknowledged" boolean DEFAULT false NOT NULL,
	"acknowledged_by" text,
	"acknowledged_at" timestamp with time zone,
	"environment" "environment" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);

CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	"user_email" text NOT NULL,
	"action" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"environment" "environment" DEFAULT 'LIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "backtest_equity" (
	"id" serial PRIMARY KEY NOT NULL,
	"backtest_id" uuid NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"nav" numeric(16, 2) NOT NULL,
	"cash" numeric(16, 2) NOT NULL,
	"equity" numeric(16, 2) NOT NULL,
	"drawdown" numeric(14, 2),
	"drawdown_pct" numeric(8, 4),
	"day_return_pct" numeric(8, 4),
	"cumulative_return_pct" numeric(8, 4)
);

CREATE TABLE "backtest_trades" (
	"id" serial PRIMARY KEY NOT NULL,
	"backtest_id" uuid NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"symbol" text NOT NULL,
	"action" text NOT NULL,
	"qty" numeric(14, 4) NOT NULL,
	"price" numeric(12, 4) NOT NULL,
	"commission" numeric(10, 4) DEFAULT '0',
	"pnl" numeric(14, 2),
	"pnl_pct" numeric(8, 4),
	"decision_rationale" text
);

CREATE TABLE "backtests" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"initial_capital" numeric(16, 2) NOT NULL,
	"universe" text,
	"config_json" jsonb,
	"status" "backtest_status" DEFAULT 'pending' NOT NULL,
	"progress_pct" numeric(5, 2) DEFAULT '0',
	"total_return" numeric(8, 4),
	"cagr" numeric(8, 4),
	"sharpe_ratio" numeric(8, 4),
	"sortino_ratio" numeric(8, 4),
	"calmar_ratio" numeric(8, 4),
	"max_drawdown" numeric(8, 4),
	"win_rate" numeric(5, 4),
	"profit_factor" numeric(8, 4),
	"total_trades" integer,
	"avg_trade_pnl" numeric(14, 2),
	"metrics_json" jsonb,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_by" text
);

CREATE TABLE "candles" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"timeframe" timeframe NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"open" numeric(12, 4) NOT NULL,
	"high" numeric(12, 4) NOT NULL,
	"low" numeric(12, 4) NOT NULL,
	"close" numeric(12, 4) NOT NULL,
	"volume" numeric(18, 0) DEFAULT '0' NOT NULL,
	"vwap" numeric(12, 4),
	"trade_count" integer,
	"adjusted" boolean DEFAULT false NOT NULL,
	"split_adjusted" boolean DEFAULT false NOT NULL,
	"dividend_adjusted" boolean DEFAULT false NOT NULL,
	"quality_flags" jsonb DEFAULT '[]'::jsonb,
	"provider" text DEFAULT 'alpaca' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "valid_ohlc" CHECK ("candles"."high"::numeric >= "candles"."low"::numeric AND
          "candles"."high"::numeric >= "candles"."open"::numeric AND
          "candles"."high"::numeric >= "candles"."close"::numeric AND
          "candles"."low"::numeric <= "candles"."open"::numeric AND
          "candles"."low"::numeric <= "candles"."close"::numeric),
	CONSTRAINT "positive_volume" CHECK ("candles"."volume"::numeric >= 0)
);

CREATE TABLE "config_versions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"environment" "environment" NOT NULL,
	"config_json" jsonb NOT NULL,
	"description" text,
	"active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"activated_at" timestamp with time zone,
	"deactivated_at" timestamp with time zone
);

CREATE TABLE "constraints_config" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"environment" "environment" NOT NULL,
	"max_shares" integer DEFAULT 1000 NOT NULL,
	"max_contracts" integer DEFAULT 10 NOT NULL,
	"max_notional" numeric(14, 2) DEFAULT '50000' NOT NULL,
	"max_pct_equity" numeric(4, 3) DEFAULT '0.1' NOT NULL,
	"max_gross_exposure" numeric(4, 2) DEFAULT '2.0' NOT NULL,
	"max_net_exposure" numeric(4, 2) DEFAULT '1.0' NOT NULL,
	"max_concentration" numeric(4, 3) DEFAULT '0.25' NOT NULL,
	"max_correlation" numeric(4, 3) DEFAULT '0.7' NOT NULL,
	"max_drawdown" numeric(4, 3) DEFAULT '0.15' NOT NULL,
	"max_delta" numeric(8, 2) DEFAULT '100' NOT NULL,
	"max_gamma" numeric(8, 2) DEFAULT '50' NOT NULL,
	"max_vega" numeric(10, 2) DEFAULT '1000' NOT NULL,
	"max_theta" numeric(10, 2) DEFAULT '500' NOT NULL,
	"status" "config_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "valid_exposure" CHECK ("constraints_config"."max_gross_exposure"::numeric > 0)
);

CREATE TABLE "corporate_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"action_type" "corporate_action_type" NOT NULL,
	"ex_date" timestamp with time zone NOT NULL,
	"record_date" timestamp with time zone,
	"pay_date" timestamp with time zone,
	"ratio" numeric(10, 6),
	"amount" numeric(12, 4),
	"details" text,
	"provider" text DEFAULT 'alpaca' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "corporate_actions_indicators" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"symbol" text NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"trailing_dividend_yield" numeric(8, 4),
	"ex_dividend_days" integer,
	"upcoming_earnings_days" integer,
	"recent_split" boolean DEFAULT false,
	"split_ratio" text,
	CONSTRAINT "corp_actions_indicators_symbol_date" UNIQUE("symbol","date")
);

CREATE TABLE "cycle_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"cycle_id" uuid NOT NULL,
	"event_type" "cycle_event_type" NOT NULL,
	"phase" "cycle_phase",
	"agent_type" "agent_type",
	"symbol" text,
	"message" text,
	"data_json" jsonb,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"duration_ms" integer
);

CREATE TABLE "cycles" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"environment" "environment" NOT NULL,
	"status" "cycle_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"duration_ms" integer,
	"current_phase" "cycle_phase",
	"phase_started_at" timestamp with time zone,
	"total_symbols" integer DEFAULT 0,
	"completed_symbols" integer DEFAULT 0,
	"progress_pct" numeric(5, 2) DEFAULT '0',
	"approved" boolean,
	"iterations" integer,
	"decisions_count" integer DEFAULT 0,
	"orders_count" integer DEFAULT 0,
	"decisions_json" jsonb,
	"orders_json" jsonb,
	"error_message" text,
	"error_stack" text,
	"config_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "decisions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"cycle_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"action" "decision_action" NOT NULL,
	"direction" "decision_direction" NOT NULL,
	"size" numeric(14, 4) NOT NULL,
	"size_unit" "size_unit" DEFAULT 'SHARES' NOT NULL,
	"entry_price" numeric(12, 4),
	"stop_loss" numeric(12, 4),
	"take_profit" numeric(12, 4),
	"stop_price" numeric(12, 4),
	"target_price" numeric(12, 4),
	"strategy_family" text,
	"time_horizon" text,
	"bullish_factors" jsonb DEFAULT '[]'::jsonb,
	"bearish_factors" jsonb DEFAULT '[]'::jsonb,
	"confidence_score" numeric(4, 3),
	"risk_score" numeric(4, 3),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"status" "decision_status" DEFAULT 'pending' NOT NULL,
	"rationale" text,
	"environment" "environment" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"executed_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	CONSTRAINT "positive_size" CHECK ("decisions"."size"::numeric > 0),
	CONSTRAINT "valid_confidence" CHECK ("decisions"."confidence_score" IS NULL OR ("decisions"."confidence_score"::numeric >= 0 AND "decisions"."confidence_score"::numeric <= 1)),
	CONSTRAINT "valid_risk" CHECK ("decisions"."risk_score" IS NULL OR ("decisions"."risk_score"::numeric >= 0 AND "decisions"."risk_score"::numeric <= 1))
);

CREATE TABLE "execution_order_snapshots" (
	"order_id" text PRIMARY KEY NOT NULL,
	"broker_order_id" text NOT NULL,
	"instrument_id" text NOT NULL,
	"status" text NOT NULL,
	"side" text NOT NULL,
	"order_type" text NOT NULL,
	"time_in_force" text NOT NULL,
	"requested_quantity" numeric(14, 4) NOT NULL,
	"filled_quantity" numeric(14, 4) NOT NULL,
	"avg_fill_price" numeric(12, 4) NOT NULL,
	"limit_price" numeric(12, 4),
	"stop_price" numeric(12, 4),
	"submitted_at" text NOT NULL,
	"last_update_at" text NOT NULL,
	"status_message" text,
	"is_multi_leg" boolean DEFAULT false NOT NULL,
	"environment" "environment" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "execution_position_snapshots" (
	"symbol" text PRIMARY KEY NOT NULL,
	"quantity" numeric(14, 4) NOT NULL,
	"avg_entry_price" numeric(12, 4) NOT NULL,
	"environment" "environment" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "execution_recovery_state" (
	"environment" "environment" PRIMARY KEY NOT NULL,
	"last_snapshot_at" timestamp with time zone,
	"last_reconciliation_at" timestamp with time zone,
	"last_cycle_id" text,
	"status" "execution_recovery_status" DEFAULT 'unknown' NOT NULL,
	"error_message" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "external_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"source_type" "external_event_source" NOT NULL,
	"event_type" text NOT NULL,
	"event_time" timestamp with time zone NOT NULL,
	"processed_at" timestamp with time zone NOT NULL,
	"sentiment" "sentiment" NOT NULL,
	"confidence" numeric(4, 3) NOT NULL,
	"importance" integer NOT NULL,
	"summary" text NOT NULL,
	"key_insights" jsonb NOT NULL,
	"entities" jsonb NOT NULL,
	"data_points" jsonb NOT NULL,
	"sentiment_score" numeric(5, 4) NOT NULL,
	"importance_score" numeric(5, 4) NOT NULL,
	"surprise_score" numeric(5, 4) NOT NULL,
	"related_instruments" jsonb NOT NULL,
	"original_content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE "factor_correlations" (
	"factor_id_1" uuid NOT NULL,
	"factor_id_2" uuid NOT NULL,
	"correlation" numeric(5, 4) NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "factor_correlations_factor_id_1_factor_id_2_pk" PRIMARY KEY("factor_id_1","factor_id_2")
);

CREATE TABLE "factor_performance" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"factor_id" uuid NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"ic" numeric(6, 4) NOT NULL,
	"icir" numeric(8, 4),
	"sharpe" numeric(8, 4),
	"weight" numeric(6, 4) DEFAULT '0.0' NOT NULL,
	"signal_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "factor_performance_factor_date" UNIQUE("factor_id","date")
);

CREATE TABLE "factor_weights" (
	"factor_id" uuid PRIMARY KEY NOT NULL,
	"weight" numeric(6, 4) DEFAULT '0.0' NOT NULL,
	"last_ic" numeric(6, 4),
	"last_updated" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "factors" (
	"factor_id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"hypothesis_id" uuid,
	"name" text NOT NULL,
	"status" "factor_status" DEFAULT 'research' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"author" text DEFAULT 'claude-code' NOT NULL,
	"python_module" text,
	"typescript_module" text,
	"symbolic_length" integer,
	"parameter_count" integer,
	"feature_count" integer,
	"originality_score" numeric(5, 4),
	"hypothesis_alignment" numeric(5, 4),
	"stage1_sharpe" numeric(8, 4),
	"stage1_ic" numeric(6, 4),
	"stage1_max_drawdown" numeric(6, 4),
	"stage1_completed_at" timestamp with time zone,
	"stage2_pbo" numeric(6, 4),
	"stage2_dsr_pvalue" numeric(6, 4),
	"stage2_wfe" numeric(6, 4),
	"stage2_completed_at" timestamp with time zone,
	"paper_validation_passed" integer DEFAULT 0,
	"paper_start_date" timestamp with time zone,
	"paper_end_date" timestamp with time zone,
	"paper_realized_sharpe" numeric(8, 4),
	"paper_realized_ic" numeric(6, 4),
	"current_weight" numeric(6, 4) DEFAULT '0.0',
	"last_ic" numeric(6, 4),
	"decay_rate" numeric(6, 4),
	"target_regimes" jsonb,
	"parity_report" text,
	"parity_validated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"promoted_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"last_updated" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "factors_name_unique" UNIQUE("name")
);

CREATE TABLE "features" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"timeframe" timeframe NOT NULL,
	"indicator_name" text NOT NULL,
	"raw_value" numeric(18, 8) NOT NULL,
	"normalized_value" numeric(8, 6),
	"parameters" jsonb,
	"quality_score" numeric(4, 3),
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "filing_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"symbols_requested" jsonb NOT NULL,
	"filing_types" jsonb NOT NULL,
	"date_range_start" timestamp with time zone,
	"date_range_end" timestamp with time zone,
	"symbols_total" integer DEFAULT 0,
	"symbols_processed" integer DEFAULT 0,
	"filings_fetched" integer DEFAULT 0,
	"filings_ingested" integer DEFAULT 0,
	"chunks_created" integer DEFAULT 0,
	"status" "sync_run_status" DEFAULT 'running' NOT NULL,
	"error_message" text,
	"trigger_source" "sync_trigger_source" NOT NULL,
	"environment" "environment" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "filings" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"accession_number" text NOT NULL,
	"symbol" text NOT NULL,
	"filing_type" "filing_type" NOT NULL,
	"filed_date" timestamp with time zone NOT NULL,
	"report_date" timestamp with time zone,
	"company_name" text,
	"cik" text,
	"section_count" integer DEFAULT 0,
	"chunk_count" integer DEFAULT 0,
	"status" "filing_status" DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"ingested_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "filings_accession_number_unique" UNIQUE("accession_number")
);

CREATE TABLE "fundamental_indicators" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"symbol" text NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"pe_ratio_ttm" numeric(10, 2),
	"pe_ratio_forward" numeric(10, 2),
	"pb_ratio" numeric(10, 2),
	"ev_ebitda" numeric(10, 2),
	"earnings_yield" numeric(8, 4),
	"dividend_yield" numeric(8, 4),
	"cape_10yr" numeric(10, 2),
	"gross_profitability" numeric(8, 4),
	"roe" numeric(8, 4),
	"roa" numeric(8, 4),
	"asset_growth" numeric(8, 4),
	"accruals_ratio" numeric(8, 4),
	"cash_flow_quality" numeric(8, 4),
	"beneish_m_score" numeric(8, 4),
	"market_cap" numeric(18, 2),
	"sector" text,
	"industry" text,
	"source" text DEFAULT 'computed' NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fundamental_indicators_symbol_date" UNIQUE("symbol","date")
);

CREATE TABLE "hypotheses" (
	"hypothesis_id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"title" text NOT NULL,
	"economic_rationale" text NOT NULL,
	"market_mechanism" text NOT NULL,
	"target_regime" text,
	"falsification_criteria" text,
	"status" "hypothesis_status" DEFAULT 'proposed' NOT NULL,
	"iteration" integer DEFAULT 1 NOT NULL,
	"parent_hypothesis_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "index_constituents" (
	"id" serial PRIMARY KEY NOT NULL,
	"index_id" text NOT NULL,
	"symbol" text NOT NULL,
	"date_added" timestamp with time zone NOT NULL,
	"date_removed" timestamp with time zone,
	"reason_added" text,
	"reason_removed" text,
	"sector" text,
	"industry" text,
	"market_cap_at_add" numeric(18, 2),
	"provider" text DEFAULT 'alpaca' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "indicator_ic_history" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"indicator_id" uuid NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"ic_value" numeric(6, 4) NOT NULL,
	"ic_std" numeric(6, 4) NOT NULL,
	"decisions_used_in" integer DEFAULT 0 NOT NULL,
	"decisions_correct" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "indicator_ic_history_indicator_date" UNIQUE("indicator_id","date")
);

CREATE TABLE "indicator_paper_signals" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"indicator_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"signal_date" timestamp with time zone NOT NULL,
	"signal" numeric(5, 4) NOT NULL,
	"outcome" numeric(8, 4),
	"outcome_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "indicator_paper_signals_unique" UNIQUE("indicator_id","symbol","signal_date")
);

CREATE TABLE "indicator_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"run_type" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"symbols_processed" integer DEFAULT 0,
	"symbols_failed" integer DEFAULT 0,
	"status" "sync_run_status" DEFAULT 'running' NOT NULL,
	"error_message" text,
	"environment" "environment" NOT NULL
);

CREATE TABLE "indicator_trials" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"indicator_id" uuid NOT NULL,
	"trial_number" integer NOT NULL,
	"hypothesis" text NOT NULL,
	"parameters" jsonb NOT NULL,
	"sharpe_ratio" numeric(8, 4),
	"information_coefficient" numeric(6, 4),
	"max_drawdown" numeric(6, 4),
	"calmar_ratio" numeric(8, 4),
	"sortino_ratio" numeric(8, 4),
	"selected" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "indicator_trials_indicator_trial" UNIQUE("indicator_id","trial_number")
);

CREATE TABLE "indicators" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"category" "indicator_category" NOT NULL,
	"status" "indicator_status" DEFAULT 'staging' NOT NULL,
	"hypothesis" text NOT NULL,
	"economic_rationale" text NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"generated_by" text NOT NULL,
	"code_hash" text,
	"ast_signature" text,
	"validation_report" text,
	"paper_trading_start" timestamp with time zone,
	"paper_trading_end" timestamp with time zone,
	"paper_trading_report" text,
	"promoted_at" timestamp with time zone,
	"pr_url" text,
	"merged_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"retirement_reason" text,
	"similar_to" uuid,
	"replaces" uuid,
	"parity_report" text,
	"parity_validated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "indicators_name_unique" UNIQUE("name")
);

CREATE TABLE "macro_watch_entries" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"session" "macro_watch_session" NOT NULL,
	"category" "macro_watch_category" NOT NULL,
	"headline" text NOT NULL,
	"symbols" jsonb NOT NULL,
	"source" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE "morning_newspapers" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"date" text NOT NULL,
	"compiled_at" timestamp with time zone NOT NULL,
	"sections" jsonb NOT NULL,
	"raw_entry_ids" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "morning_newspapers_date_unique" UNIQUE("date")
);

CREATE TABLE "options_indicators_cache" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"symbol" text NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"implied_volatility" numeric(8, 4),
	"iv_percentile_30d" numeric(5, 2),
	"iv_skew" numeric(8, 4),
	"put_call_ratio" numeric(8, 4),
	"vrp" numeric(8, 4),
	"term_structure_slope" numeric(8, 4),
	"net_delta" numeric(12, 4),
	"net_gamma" numeric(12, 4),
	"net_theta" numeric(12, 4),
	"net_vega" numeric(12, 4),
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "options_indicators_cache_symbol_unique" UNIQUE("symbol")
);

CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"decision_id" uuid,
	"symbol" text NOT NULL,
	"side" "order_side" NOT NULL,
	"qty" numeric(14, 4) NOT NULL,
	"order_type" "order_type" NOT NULL,
	"limit_price" numeric(12, 4),
	"stop_price" numeric(12, 4),
	"time_in_force" time_in_force DEFAULT 'day' NOT NULL,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"broker_order_id" text,
	"filled_qty" numeric(14, 4) DEFAULT '0',
	"filled_avg_price" numeric(12, 4),
	"commission" numeric(10, 4),
	"environment" "environment" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"filled_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "positive_quantity" CHECK ("orders"."qty"::numeric > 0)
);

CREATE TABLE "paper_signals" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"factor_id" uuid NOT NULL,
	"signal_date" timestamp with time zone NOT NULL,
	"symbol" text NOT NULL,
	"signal_value" numeric(8, 4) NOT NULL,
	"direction" text NOT NULL,
	"entry_price" numeric(12, 4),
	"exit_price" numeric(12, 4),
	"actual_return" numeric(8, 4),
	"predicted_return" numeric(8, 4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "paper_signals_factor_date_symbol" UNIQUE("factor_id","signal_date","symbol")
);

CREATE TABLE "parity_validation_history" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"entity_type" "parity_entity_type" NOT NULL,
	"entity_id" text NOT NULL,
	"environment" "environment" NOT NULL,
	"passed" boolean NOT NULL,
	"recommendation" "parity_recommendation" NOT NULL,
	"blocking_issues" jsonb,
	"warnings" jsonb,
	"full_report" jsonb NOT NULL,
	"validated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "portfolio_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"environment" "environment" NOT NULL,
	"nav" numeric(16, 2) NOT NULL,
	"cash" numeric(16, 2) NOT NULL,
	"equity" numeric(16, 2) NOT NULL,
	"gross_exposure" numeric(8, 4) NOT NULL,
	"net_exposure" numeric(8, 4) NOT NULL,
	"long_exposure" numeric(8, 4),
	"short_exposure" numeric(8, 4),
	"open_positions" integer,
	"day_pnl" numeric(14, 2),
	"day_return_pct" numeric(8, 4),
	"total_return_pct" numeric(8, 4),
	"max_drawdown" numeric(8, 4),
	CONSTRAINT "portfolio_snapshots_timestamp_env" UNIQUE("timestamp","environment")
);

CREATE TABLE "position_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"position_id" uuid NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"price" numeric(12, 4) NOT NULL,
	"qty" numeric(14, 4) NOT NULL,
	"unrealized_pnl" numeric(14, 2),
	"market_value" numeric(14, 2)
);

CREATE TABLE "positions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"symbol" text NOT NULL,
	"side" "position_side" NOT NULL,
	"qty" numeric(14, 4) NOT NULL,
	"avg_entry" numeric(12, 4) NOT NULL,
	"current_price" numeric(12, 4),
	"unrealized_pnl" numeric(14, 2),
	"unrealized_pnl_pct" numeric(8, 4),
	"realized_pnl" numeric(14, 2) DEFAULT '0',
	"market_value" numeric(14, 2),
	"cost_basis" numeric(14, 2),
	"thesis_id" uuid,
	"decision_id" uuid,
	"status" "position_status" DEFAULT 'open' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"environment" "environment" NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "positive_quantity" CHECK ("positions"."qty"::numeric > 0),
	CONSTRAINT "positive_entry" CHECK ("positions"."avg_entry"::numeric > 0)
);

CREATE TABLE "prediction_market_arbitrage" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"kalshi_ticker" text NOT NULL,
	"polymarket_token" text NOT NULL,
	"kalshi_price" numeric(6, 4) NOT NULL,
	"polymarket_price" numeric(6, 4) NOT NULL,
	"divergence_pct" numeric(6, 4) NOT NULL,
	"market_type" "prediction_market_type" NOT NULL,
	"detected_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolution_price" numeric(6, 4),
	"created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE "prediction_market_signals" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"signal_type" text NOT NULL,
	"signal_value" numeric(8, 4) NOT NULL,
	"confidence" numeric(4, 3),
	"computed_at" timestamp with time zone NOT NULL,
	"inputs" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE "prediction_market_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"platform" "prediction_market_platform" NOT NULL,
	"market_ticker" text NOT NULL,
	"market_type" "prediction_market_type" NOT NULL,
	"market_question" text,
	"snapshot_time" timestamp with time zone NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE "regime_labels" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"timeframe" timeframe NOT NULL,
	"regime" "regime" NOT NULL,
	"confidence" numeric(4, 3) NOT NULL,
	"trend_strength" numeric(4, 3),
	"volatility_percentile" numeric(5, 2),
	"correlation_to_market" numeric(4, 3),
	"model_name" text DEFAULT 'hmm_regime' NOT NULL,
	"model_version" text,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "research_runs" (
	"run_id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"trigger_type" "research_trigger_type" NOT NULL,
	"trigger_reason" text NOT NULL,
	"phase" "research_phase" DEFAULT 'idea' NOT NULL,
	"current_iteration" integer DEFAULT 1 NOT NULL,
	"hypothesis_id" uuid,
	"factor_id" uuid,
	"pr_url" text,
	"error_message" text,
	"tokens_used" integer DEFAULT 0,
	"compute_hours" numeric(8, 2) DEFAULT '0.0',
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);

CREATE TABLE "sentiment_indicators" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"symbol" text NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"sentiment_score" numeric(5, 4),
	"sentiment_strength" numeric(5, 4),
	"news_volume" integer,
	"sentiment_momentum" numeric(5, 4),
	"event_risk_flag" boolean DEFAULT false,
	"news_sentiment" numeric(5, 4),
	"social_sentiment" numeric(5, 4),
	"analyst_sentiment" numeric(5, 4),
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sentiment_indicators_symbol_date" UNIQUE("symbol","date")
);

CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"expires_at" bigint NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	"created_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL,
	"updated_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);

CREATE TABLE "short_interest_indicators" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"symbol" text NOT NULL,
	"settlement_date" timestamp with time zone NOT NULL,
	"short_interest" numeric(18, 0) NOT NULL,
	"short_interest_ratio" numeric(8, 2),
	"days_to_cover" numeric(8, 2),
	"short_pct_float" numeric(8, 4),
	"short_interest_change" numeric(8, 4),
	"source" text DEFAULT 'FINRA' NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "short_interest_symbol_date" UNIQUE("symbol","settlement_date")
);

CREATE TABLE "system_state" (
	"environment" "environment" PRIMARY KEY NOT NULL,
	"status" "system_status" DEFAULT 'stopped' NOT NULL,
	"last_cycle_id" uuid,
	"last_cycle_time" timestamp with time zone,
	"current_phase" text,
	"phase_started_at" timestamp with time zone,
	"next_cycle_at" timestamp with time zone,
	"error_message" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "thesis_state" (
	"thesis_id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"instrument_id" text NOT NULL,
	"state" "thesis_state_value" NOT NULL,
	"entry_price" numeric(12, 4),
	"entry_date" timestamp with time zone,
	"current_stop" numeric(12, 4),
	"current_target" numeric(12, 4),
	"conviction" numeric(4, 3),
	"entry_thesis" text,
	"invalidation_conditions" text,
	"add_count" integer DEFAULT 0 NOT NULL,
	"max_position_reached" integer DEFAULT 0 NOT NULL,
	"peak_unrealized_pnl" numeric(14, 2),
	"close_reason" text,
	"exit_price" numeric(12, 4),
	"realized_pnl" numeric(14, 2),
	"realized_pnl_pct" numeric(8, 4),
	"environment" "environment" NOT NULL,
	"notes" text,
	"last_updated" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);

CREATE TABLE "thesis_state_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"thesis_id" uuid NOT NULL,
	"from_state" "thesis_state_value" NOT NULL,
	"to_state" "thesis_state_value" NOT NULL,
	"trigger_reason" text,
	"cycle_id" uuid,
	"price_at_transition" numeric(12, 4),
	"conviction_at_transition" numeric(4, 3),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "ticker_changes" (
	"id" serial PRIMARY KEY NOT NULL,
	"old_symbol" text NOT NULL,
	"new_symbol" text NOT NULL,
	"change_date" timestamp with time zone NOT NULL,
	"change_type" "ticker_change_type" NOT NULL,
	"conversion_ratio" numeric(10, 6),
	"reason" text,
	"acquiring_company" text,
	"provider" text DEFAULT 'alpaca' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "trading_config" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"environment" "environment" NOT NULL,
	"version" integer NOT NULL,
	"max_consensus_iterations" integer DEFAULT 3,
	"agent_timeout_ms" integer DEFAULT 30000,
	"total_consensus_timeout_ms" integer DEFAULT 300000,
	"conviction_delta_hold" numeric(4, 3) DEFAULT '0.2',
	"conviction_delta_action" numeric(4, 3) DEFAULT '0.3',
	"high_conviction_pct" numeric(4, 3) DEFAULT '0.7',
	"medium_conviction_pct" numeric(4, 3) DEFAULT '0.5',
	"low_conviction_pct" numeric(4, 3) DEFAULT '0.25',
	"min_risk_reward_ratio" numeric(4, 2) DEFAULT '1.5',
	"kelly_fraction" numeric(4, 3) DEFAULT '0.5',
	"trading_cycle_interval_ms" integer DEFAULT 3600000,
	"prediction_markets_interval_ms" integer DEFAULT 900000,
	"global_model" text DEFAULT 'gemini-3-flash-preview' NOT NULL,
	"status" "config_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"promoted_from" uuid,
	CONSTRAINT "valid_kelly" CHECK ("trading_config"."kelly_fraction"::numeric > 0 AND "trading_config"."kelly_fraction"::numeric <= 1)
);

CREATE TABLE "two_factor" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" uuid NOT NULL
);

CREATE TABLE "universe_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"source_hash" text NOT NULL,
	"tickers" jsonb NOT NULL,
	"ticker_count" integer NOT NULL,
	"metadata" jsonb,
	"cached_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"provider" text
);

CREATE TABLE "universe_configs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"environment" "environment" NOT NULL,
	"source" "universe_source" NOT NULL,
	"static_symbols" jsonb,
	"index_source" text,
	"min_volume" integer,
	"min_market_cap" integer,
	"optionable_only" boolean DEFAULT false NOT NULL,
	"include_list" jsonb DEFAULT '[]'::jsonb,
	"exclude_list" jsonb DEFAULT '[]'::jsonb,
	"status" "config_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "universe_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"snapshot_date" timestamp with time zone NOT NULL,
	"index_id" text NOT NULL,
	"tickers" jsonb NOT NULL,
	"ticker_count" integer NOT NULL,
	"source_version" text,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);

CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"two_factor_enabled" boolean DEFAULT false,
	"created_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL,
	"updated_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);

CREATE TABLE "user_preferences" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"theme" "theme" DEFAULT 'system' NOT NULL,
	"chart_timeframe" chart_timeframe DEFAULT '1M' NOT NULL,
	"feed_filters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sidebar_collapsed" boolean DEFAULT false NOT NULL,
	"notification_settings" jsonb DEFAULT '{"emailAlerts":true,"pushNotifications":false,"tradeConfirmations":true,"dailySummary":true,"riskAlerts":true}'::jsonb NOT NULL,
	"default_portfolio_view" "portfolio_view" DEFAULT 'table' NOT NULL,
	"date_format" date_format DEFAULT 'MM/DD/YYYY' NOT NULL,
	"time_format" time_format DEFAULT '12h' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_user_id_unique" UNIQUE("user_id")
);

CREATE TABLE "verification" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"created_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL,
	"updated_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL
);

ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "agent_outputs" ADD CONSTRAINT "agent_outputs_decision_id_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."decisions"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "alert_settings" ADD CONSTRAINT "alert_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "backtest_equity" ADD CONSTRAINT "backtest_equity_backtest_id_backtests_id_fk" FOREIGN KEY ("backtest_id") REFERENCES "public"."backtests"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "backtest_trades" ADD CONSTRAINT "backtest_trades_backtest_id_backtests_id_fk" FOREIGN KEY ("backtest_id") REFERENCES "public"."backtests"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "cycle_events" ADD CONSTRAINT "cycle_events_cycle_id_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "factor_correlations" ADD CONSTRAINT "factor_correlations_factor_id_1_factors_factor_id_fk" FOREIGN KEY ("factor_id_1") REFERENCES "public"."factors"("factor_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "factor_correlations" ADD CONSTRAINT "factor_correlations_factor_id_2_factors_factor_id_fk" FOREIGN KEY ("factor_id_2") REFERENCES "public"."factors"("factor_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "factor_performance" ADD CONSTRAINT "factor_performance_factor_id_factors_factor_id_fk" FOREIGN KEY ("factor_id") REFERENCES "public"."factors"("factor_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "factor_weights" ADD CONSTRAINT "factor_weights_factor_id_factors_factor_id_fk" FOREIGN KEY ("factor_id") REFERENCES "public"."factors"("factor_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "factors" ADD CONSTRAINT "factors_hypothesis_id_hypotheses_hypothesis_id_fk" FOREIGN KEY ("hypothesis_id") REFERENCES "public"."hypotheses"("hypothesis_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "indicator_ic_history" ADD CONSTRAINT "indicator_ic_history_indicator_id_indicators_id_fk" FOREIGN KEY ("indicator_id") REFERENCES "public"."indicators"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "indicator_paper_signals" ADD CONSTRAINT "indicator_paper_signals_indicator_id_indicators_id_fk" FOREIGN KEY ("indicator_id") REFERENCES "public"."indicators"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "indicator_trials" ADD CONSTRAINT "indicator_trials_indicator_id_indicators_id_fk" FOREIGN KEY ("indicator_id") REFERENCES "public"."indicators"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "orders" ADD CONSTRAINT "orders_decision_id_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."decisions"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "paper_signals" ADD CONSTRAINT "paper_signals_factor_id_factors_factor_id_fk" FOREIGN KEY ("factor_id") REFERENCES "public"."factors"("factor_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "position_history" ADD CONSTRAINT "position_history_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "positions" ADD CONSTRAINT "positions_decision_id_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."decisions"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "research_runs" ADD CONSTRAINT "research_runs_hypothesis_id_hypotheses_hypothesis_id_fk" FOREIGN KEY ("hypothesis_id") REFERENCES "public"."hypotheses"("hypothesis_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "research_runs" ADD CONSTRAINT "research_runs_factor_id_factors_factor_id_fk" FOREIGN KEY ("factor_id") REFERENCES "public"."factors"("factor_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "thesis_state_history" ADD CONSTRAINT "thesis_state_history_thesis_id_thesis_state_thesis_id_fk" FOREIGN KEY ("thesis_id") REFERENCES "public"."thesis_state"("thesis_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "idx_account_user_id" ON "account" USING btree ("user_id");
CREATE INDEX "idx_account_provider_id" ON "account" USING btree ("provider_id");
CREATE INDEX "idx_account_provider_account" ON "account" USING btree ("provider_id","account_id");
CREATE INDEX "idx_agent_configs_environment" ON "agent_configs" USING btree ("environment");
CREATE INDEX "idx_agent_configs_agent_type" ON "agent_configs" USING btree ("agent_type");
CREATE UNIQUE INDEX "idx_agent_configs_env_agent" ON "agent_configs" USING btree ("environment","agent_type");
CREATE INDEX "idx_agent_outputs_decision_id" ON "agent_outputs" USING btree ("decision_id");
CREATE INDEX "idx_agent_outputs_agent_type" ON "agent_outputs" USING btree ("agent_type");
CREATE INDEX "idx_agent_outputs_decision_agent" ON "agent_outputs" USING btree ("decision_id","agent_type");
CREATE INDEX "idx_alert_settings_user_id" ON "alert_settings" USING btree ("user_id");
CREATE INDEX "idx_alerts_severity" ON "alerts" USING btree ("severity");
CREATE INDEX "idx_alerts_type" ON "alerts" USING btree ("type");
CREATE INDEX "idx_alerts_acknowledged" ON "alerts" USING btree ("acknowledged");
CREATE INDEX "idx_alerts_created_at" ON "alerts" USING btree ("created_at");
CREATE INDEX "idx_alerts_environment" ON "alerts" USING btree ("environment");
CREATE INDEX "idx_alerts_unack_env" ON "alerts" USING btree ("environment","acknowledged") WHERE "alerts"."acknowledged" = false;
CREATE INDEX "idx_audit_log_user_id" ON "audit_log" USING btree ("user_id");
CREATE INDEX "idx_audit_log_timestamp" ON "audit_log" USING btree ("timestamp");
CREATE INDEX "idx_audit_log_action" ON "audit_log" USING btree ("action");
CREATE INDEX "idx_audit_log_environment" ON "audit_log" USING btree ("environment");
CREATE INDEX "idx_backtest_equity_backtest_id" ON "backtest_equity" USING btree ("backtest_id");
CREATE INDEX "idx_backtest_equity_timestamp" ON "backtest_equity" USING btree ("timestamp");
CREATE INDEX "idx_backtest_equity_bt_ts" ON "backtest_equity" USING btree ("backtest_id","timestamp");
CREATE INDEX "idx_backtest_trades_backtest_id" ON "backtest_trades" USING btree ("backtest_id");
CREATE INDEX "idx_backtest_trades_timestamp" ON "backtest_trades" USING btree ("timestamp");
CREATE INDEX "idx_backtest_trades_symbol" ON "backtest_trades" USING btree ("symbol");
CREATE INDEX "idx_backtest_trades_bt_ts" ON "backtest_trades" USING btree ("backtest_id","timestamp");
CREATE INDEX "idx_backtests_status" ON "backtests" USING btree ("status");
CREATE INDEX "idx_backtests_start_date" ON "backtests" USING btree ("start_date");
CREATE INDEX "idx_backtests_created_at" ON "backtests" USING btree ("created_at");
CREATE UNIQUE INDEX "idx_candles_symbol_timeframe_ts" ON "candles" USING btree ("symbol","timeframe","timestamp");
CREATE INDEX "idx_candles_timestamp" ON "candles" USING btree ("timestamp");
CREATE INDEX "idx_candles_symbol" ON "candles" USING btree ("symbol");
CREATE INDEX "idx_candles_timeframe" ON "candles" USING btree ("timeframe");
CREATE INDEX "idx_config_versions_environment" ON "config_versions" USING btree ("environment");
CREATE INDEX "idx_config_versions_active" ON "config_versions" USING btree ("active");
CREATE INDEX "idx_config_versions_created_at" ON "config_versions" USING btree ("created_at");
CREATE UNIQUE INDEX "idx_config_versions_env_active" ON "config_versions" USING btree ("environment") WHERE "config_versions"."active" = true;
CREATE INDEX "idx_constraints_config_environment" ON "constraints_config" USING btree ("environment");
CREATE INDEX "idx_constraints_config_status" ON "constraints_config" USING btree ("status");
CREATE INDEX "idx_constraints_config_env_status" ON "constraints_config" USING btree ("environment","status");
CREATE UNIQUE INDEX "idx_constraints_config_env_active" ON "constraints_config" USING btree ("environment") WHERE "constraints_config"."status" = 'active';
CREATE INDEX "idx_corporate_actions_symbol_date" ON "corporate_actions" USING btree ("symbol","ex_date");
CREATE INDEX "idx_corporate_actions_ex_date" ON "corporate_actions" USING btree ("ex_date");
CREATE INDEX "idx_corporate_actions_type" ON "corporate_actions" USING btree ("action_type");
CREATE UNIQUE INDEX "idx_corporate_actions_unique" ON "corporate_actions" USING btree ("symbol","action_type","ex_date");
CREATE INDEX "idx_corp_actions_symbol" ON "corporate_actions_indicators" USING btree ("symbol","date");
CREATE INDEX "idx_corp_actions_symbol_only" ON "corporate_actions_indicators" USING btree ("symbol");
CREATE INDEX "idx_cycle_events_cycle_id" ON "cycle_events" USING btree ("cycle_id");
CREATE INDEX "idx_cycle_events_type" ON "cycle_events" USING btree ("event_type");
CREATE INDEX "idx_cycle_events_timestamp" ON "cycle_events" USING btree ("timestamp");
CREATE INDEX "idx_cycle_events_agent" ON "cycle_events" USING btree ("cycle_id","agent_type");
CREATE INDEX "idx_cycle_events_agent_event" ON "cycle_events" USING btree ("cycle_id","agent_type","event_type");
CREATE INDEX "idx_cycles_environment" ON "cycles" USING btree ("environment");
CREATE INDEX "idx_cycles_status" ON "cycles" USING btree ("status");
CREATE INDEX "idx_cycles_started_at" ON "cycles" USING btree ("started_at");
CREATE INDEX "idx_cycles_env_status" ON "cycles" USING btree ("environment","status");
CREATE INDEX "idx_cycles_env_started" ON "cycles" USING btree ("environment","started_at");
CREATE INDEX "idx_decisions_cycle_id" ON "decisions" USING btree ("cycle_id");
CREATE INDEX "idx_decisions_symbol" ON "decisions" USING btree ("symbol");
CREATE INDEX "idx_decisions_status" ON "decisions" USING btree ("status");
CREATE INDEX "idx_decisions_created_at" ON "decisions" USING btree ("created_at");
CREATE INDEX "idx_decisions_symbol_created" ON "decisions" USING btree ("symbol","created_at");
CREATE INDEX "idx_decisions_environment" ON "decisions" USING btree ("environment");
CREATE INDEX "idx_exec_order_snapshots_broker_id" ON "execution_order_snapshots" USING btree ("broker_order_id");
CREATE INDEX "idx_exec_order_snapshots_env_status" ON "execution_order_snapshots" USING btree ("environment","status");
CREATE INDEX "idx_exec_position_snapshots_env" ON "execution_position_snapshots" USING btree ("environment");
CREATE INDEX "idx_external_events_event_time" ON "external_events" USING btree ("event_time");
CREATE INDEX "idx_external_events_source_type" ON "external_events" USING btree ("source_type");
CREATE INDEX "idx_external_events_event_type" ON "external_events" USING btree ("event_type");
CREATE INDEX "idx_external_events_processed_at" ON "external_events" USING btree ("processed_at");
CREATE INDEX "idx_external_events_sentiment" ON "external_events" USING btree ("sentiment");
CREATE INDEX "idx_external_events_importance" ON "external_events" USING btree ("importance_score");
CREATE INDEX "idx_factor_perf_factor_date" ON "factor_performance" USING btree ("factor_id","date");
CREATE INDEX "idx_factors_status" ON "factors" USING btree ("status");
CREATE INDEX "idx_factors_hypothesis" ON "factors" USING btree ("hypothesis_id");
CREATE INDEX "idx_factors_active" ON "factors" USING btree ("status") WHERE "factors"."status" IN ('active', 'decaying');
CREATE UNIQUE INDEX "idx_features_symbol_ts_indicator" ON "features" USING btree ("symbol","timestamp","timeframe","indicator_name");
CREATE INDEX "idx_features_symbol_indicator_ts" ON "features" USING btree ("symbol","indicator_name","timestamp");
CREATE INDEX "idx_features_timestamp" ON "features" USING btree ("timestamp");
CREATE INDEX "idx_features_indicator" ON "features" USING btree ("indicator_name");
CREATE INDEX "idx_filing_sync_runs_started_at" ON "filing_sync_runs" USING btree ("started_at");
CREATE INDEX "idx_filing_sync_runs_status" ON "filing_sync_runs" USING btree ("status");
CREATE INDEX "idx_filing_sync_runs_environment" ON "filing_sync_runs" USING btree ("environment");
CREATE INDEX "idx_filing_sync_runs_trigger" ON "filing_sync_runs" USING btree ("trigger_source");
CREATE INDEX "idx_filings_symbol" ON "filings" USING btree ("symbol");
CREATE INDEX "idx_filings_filing_type" ON "filings" USING btree ("filing_type");
CREATE INDEX "idx_filings_filed_date" ON "filings" USING btree ("filed_date");
CREATE INDEX "idx_filings_status" ON "filings" USING btree ("status");
CREATE INDEX "idx_filings_symbol_type" ON "filings" USING btree ("symbol","filing_type");
CREATE INDEX "idx_filings_symbol_date" ON "filings" USING btree ("symbol","filed_date");
CREATE INDEX "idx_fundamental_symbol_date" ON "fundamental_indicators" USING btree ("symbol","date");
CREATE INDEX "idx_fundamental_symbol" ON "fundamental_indicators" USING btree ("symbol");
CREATE INDEX "idx_hypotheses_status" ON "hypotheses" USING btree ("status");
CREATE INDEX "idx_index_constituents_pit" ON "index_constituents" USING btree ("index_id","date_added","date_removed");
CREATE INDEX "idx_index_constituents_symbol" ON "index_constituents" USING btree ("symbol","index_id");
CREATE INDEX "idx_index_constituents_current" ON "index_constituents" USING btree ("index_id","date_removed");
CREATE UNIQUE INDEX "idx_index_constituents_unique" ON "index_constituents" USING btree ("index_id","symbol","date_added");
CREATE INDEX "idx_ic_history_indicator_date" ON "indicator_ic_history" USING btree ("indicator_id","date");
CREATE INDEX "idx_ind_paper_signals_indicator" ON "indicator_paper_signals" USING btree ("indicator_id");
CREATE INDEX "idx_ind_paper_signals_symbol" ON "indicator_paper_signals" USING btree ("symbol");
CREATE INDEX "idx_ind_paper_signals_date" ON "indicator_paper_signals" USING btree ("signal_date");
CREATE INDEX "idx_indicator_sync_runs_type" ON "indicator_sync_runs" USING btree ("run_type");
CREATE INDEX "idx_indicator_sync_runs_status" ON "indicator_sync_runs" USING btree ("status");
CREATE INDEX "idx_indicator_sync_runs_started" ON "indicator_sync_runs" USING btree ("started_at");
CREATE INDEX "idx_trials_indicator" ON "indicator_trials" USING btree ("indicator_id");
CREATE INDEX "idx_indicators_status" ON "indicators" USING btree ("status");
CREATE INDEX "idx_indicators_category" ON "indicators" USING btree ("category");
CREATE INDEX "idx_indicators_code_hash" ON "indicators" USING btree ("code_hash");
CREATE INDEX "idx_indicators_active" ON "indicators" USING btree ("status") WHERE "indicators"."status" IN ('paper', 'production');
CREATE INDEX "idx_macro_watch_timestamp" ON "macro_watch_entries" USING btree ("timestamp");
CREATE INDEX "idx_macro_watch_category" ON "macro_watch_entries" USING btree ("category");
CREATE INDEX "idx_macro_watch_session" ON "macro_watch_entries" USING btree ("session");
CREATE INDEX "idx_morning_newspapers_date" ON "morning_newspapers" USING btree ("date");
CREATE INDEX "idx_options_cache_symbol" ON "options_indicators_cache" USING btree ("symbol");
CREATE INDEX "idx_options_cache_expires" ON "options_indicators_cache" USING btree ("expires_at");
CREATE INDEX "idx_orders_decision_id" ON "orders" USING btree ("decision_id");
CREATE INDEX "idx_orders_symbol" ON "orders" USING btree ("symbol");
CREATE INDEX "idx_orders_status" ON "orders" USING btree ("status");
CREATE INDEX "idx_orders_broker_order_id" ON "orders" USING btree ("broker_order_id");
CREATE INDEX "idx_orders_created_at" ON "orders" USING btree ("created_at");
CREATE INDEX "idx_orders_environment" ON "orders" USING btree ("environment");
CREATE INDEX "idx_paper_signals_factor" ON "paper_signals" USING btree ("factor_id");
CREATE INDEX "idx_paper_signals_date" ON "paper_signals" USING btree ("signal_date");
CREATE INDEX "idx_paper_signals_factor_date" ON "paper_signals" USING btree ("factor_id","signal_date");
CREATE INDEX "idx_parity_history_entity" ON "parity_validation_history" USING btree ("entity_type","entity_id");
CREATE INDEX "idx_parity_history_environment" ON "parity_validation_history" USING btree ("environment");
CREATE INDEX "idx_parity_history_passed" ON "parity_validation_history" USING btree ("passed");
CREATE INDEX "idx_parity_history_validated_at" ON "parity_validation_history" USING btree ("validated_at");
CREATE INDEX "idx_portfolio_snapshots_timestamp" ON "portfolio_snapshots" USING btree ("timestamp");
CREATE INDEX "idx_portfolio_snapshots_environment" ON "portfolio_snapshots" USING btree ("environment");
CREATE INDEX "idx_position_history_position_id" ON "position_history" USING btree ("position_id");
CREATE INDEX "idx_position_history_timestamp" ON "position_history" USING btree ("timestamp");
CREATE INDEX "idx_position_history_position_ts" ON "position_history" USING btree ("position_id","timestamp");
CREATE INDEX "idx_positions_symbol" ON "positions" USING btree ("symbol");
CREATE INDEX "idx_positions_thesis_id" ON "positions" USING btree ("thesis_id");
CREATE INDEX "idx_positions_decision_id" ON "positions" USING btree ("decision_id");
CREATE INDEX "idx_positions_status" ON "positions" USING btree ("status");
CREATE INDEX "idx_positions_environment" ON "positions" USING btree ("environment");
CREATE UNIQUE INDEX "idx_positions_symbol_env_open" ON "positions" USING btree ("symbol","environment") WHERE "positions"."closed_at" IS NULL;
CREATE INDEX "idx_pm_arbitrage_divergence" ON "prediction_market_arbitrage" USING btree ("divergence_pct");
CREATE INDEX "idx_pm_arbitrage_detected" ON "prediction_market_arbitrage" USING btree ("detected_at");
CREATE INDEX "idx_pm_arbitrage_unresolved" ON "prediction_market_arbitrage" USING btree ("resolved_at") WHERE "prediction_market_arbitrage"."resolved_at" IS NULL;
CREATE INDEX "idx_pm_signals_type" ON "prediction_market_signals" USING btree ("signal_type");
CREATE INDEX "idx_pm_signals_time" ON "prediction_market_signals" USING btree ("computed_at");
CREATE INDEX "idx_pm_snapshots_platform" ON "prediction_market_snapshots" USING btree ("platform");
CREATE INDEX "idx_pm_snapshots_ticker" ON "prediction_market_snapshots" USING btree ("market_ticker");
CREATE INDEX "idx_pm_snapshots_type" ON "prediction_market_snapshots" USING btree ("market_type");
CREATE INDEX "idx_pm_snapshots_time" ON "prediction_market_snapshots" USING btree ("snapshot_time");
CREATE UNIQUE INDEX "idx_regime_labels_symbol_ts_tf" ON "regime_labels" USING btree ("symbol","timestamp","timeframe");
CREATE INDEX "idx_regime_labels_symbol_ts" ON "regime_labels" USING btree ("symbol","timestamp");
CREATE INDEX "idx_regime_labels_regime" ON "regime_labels" USING btree ("regime");
CREATE INDEX "idx_regime_labels_market" ON "regime_labels" USING btree ("symbol","timestamp") WHERE "regime_labels"."symbol" = '_MARKET';
CREATE INDEX "idx_research_runs_phase" ON "research_runs" USING btree ("phase");
CREATE INDEX "idx_research_runs_trigger" ON "research_runs" USING btree ("trigger_type");
CREATE INDEX "idx_research_runs_hypothesis" ON "research_runs" USING btree ("hypothesis_id");
CREATE INDEX "idx_research_runs_factor" ON "research_runs" USING btree ("factor_id");
CREATE INDEX "idx_sentiment_symbol_date" ON "sentiment_indicators" USING btree ("symbol","date");
CREATE INDEX "idx_sentiment_symbol" ON "sentiment_indicators" USING btree ("symbol");
CREATE INDEX "idx_session_user_id" ON "session" USING btree ("user_id");
CREATE INDEX "idx_session_token" ON "session" USING btree ("token");
CREATE INDEX "idx_session_expires_at" ON "session" USING btree ("expires_at");
CREATE INDEX "idx_short_interest_symbol" ON "short_interest_indicators" USING btree ("symbol","settlement_date");
CREATE INDEX "idx_short_interest_settlement" ON "short_interest_indicators" USING btree ("settlement_date");
CREATE INDEX "idx_thesis_state_instrument" ON "thesis_state" USING btree ("instrument_id");
CREATE INDEX "idx_thesis_state_state" ON "thesis_state" USING btree ("state");
CREATE INDEX "idx_thesis_state_environment" ON "thesis_state" USING btree ("environment");
CREATE INDEX "idx_thesis_state_created_at" ON "thesis_state" USING btree ("created_at");
CREATE INDEX "idx_thesis_state_closed_at" ON "thesis_state" USING btree ("closed_at");
CREATE INDEX "idx_thesis_state_active" ON "thesis_state" USING btree ("environment","state") WHERE "thesis_state"."state" != 'CLOSED';
CREATE INDEX "idx_thesis_state_instrument_active" ON "thesis_state" USING btree ("instrument_id","environment") WHERE "thesis_state"."state" != 'CLOSED';
CREATE INDEX "idx_thesis_history_thesis_id" ON "thesis_state_history" USING btree ("thesis_id");
CREATE INDEX "idx_thesis_history_created_at" ON "thesis_state_history" USING btree ("created_at");
CREATE INDEX "idx_thesis_history_thesis_created" ON "thesis_state_history" USING btree ("thesis_id","created_at");
CREATE INDEX "idx_ticker_changes_old" ON "ticker_changes" USING btree ("old_symbol","change_date");
CREATE INDEX "idx_ticker_changes_new" ON "ticker_changes" USING btree ("new_symbol","change_date");
CREATE INDEX "idx_ticker_changes_date" ON "ticker_changes" USING btree ("change_date");
CREATE UNIQUE INDEX "idx_ticker_changes_unique" ON "ticker_changes" USING btree ("old_symbol","new_symbol","change_date");
CREATE INDEX "idx_trading_config_environment" ON "trading_config" USING btree ("environment");
CREATE INDEX "idx_trading_config_status" ON "trading_config" USING btree ("status");
CREATE INDEX "idx_trading_config_env_status" ON "trading_config" USING btree ("environment","status");
CREATE INDEX "idx_trading_config_created_at" ON "trading_config" USING btree ("created_at");
CREATE UNIQUE INDEX "idx_trading_config_env_active" ON "trading_config" USING btree ("environment") WHERE "trading_config"."status" = 'active';
CREATE INDEX "idx_two_factor_user_id" ON "two_factor" USING btree ("user_id");
CREATE INDEX "idx_two_factor_secret" ON "two_factor" USING btree ("secret");
CREATE UNIQUE INDEX "idx_universe_cache_source" ON "universe_cache" USING btree ("source_type","source_id");
CREATE INDEX "idx_universe_cache_expires" ON "universe_cache" USING btree ("expires_at");
CREATE INDEX "idx_universe_cache_hash" ON "universe_cache" USING btree ("source_hash");
CREATE INDEX "idx_universe_configs_environment" ON "universe_configs" USING btree ("environment");
CREATE INDEX "idx_universe_configs_status" ON "universe_configs" USING btree ("status");
CREATE INDEX "idx_universe_configs_env_status" ON "universe_configs" USING btree ("environment","status");
CREATE UNIQUE INDEX "idx_universe_configs_env_active" ON "universe_configs" USING btree ("environment") WHERE "universe_configs"."status" = 'active';
CREATE UNIQUE INDEX "idx_universe_snapshots_pit" ON "universe_snapshots" USING btree ("index_id","snapshot_date");
CREATE INDEX "idx_universe_snapshots_date" ON "universe_snapshots" USING btree ("snapshot_date");
CREATE INDEX "idx_user_email" ON "user" USING btree ("email");
CREATE INDEX "idx_user_created_at" ON "user" USING btree ("created_at");
CREATE INDEX "idx_user_preferences_user_id" ON "user_preferences" USING btree ("user_id");
CREATE INDEX "idx_user_preferences_created_at" ON "user_preferences" USING btree ("created_at");
CREATE INDEX "idx_verification_identifier" ON "verification" USING btree ("identifier");
CREATE INDEX "idx_verification_expires_at" ON "verification" USING btree ("expires_at");
-- ===========================================
-- Setup cream_paper database
-- ===========================================
\c cream_paper
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE "public"."agent_type" AS ENUM('technical', 'news_analyst', 'fundamentals_analyst', 'bullish_researcher', 'bearish_researcher', 'trader', 'risk_manager', 'critic');
CREATE TYPE "public"."agent_vote" AS ENUM('APPROVE', 'REJECT', 'ABSTAIN');
CREATE TYPE "public"."alert_severity" AS ENUM('info', 'warning', 'error', 'critical');
CREATE TYPE "public"."backtest_status" AS ENUM('pending', 'running', 'completed', 'failed');
CREATE TYPE "public"."chart_timeframe" AS ENUM('1D', '1W', '1M', '3M', '6M', '1Y', 'ALL');
CREATE TYPE "public"."config_status" AS ENUM('draft', 'testing', 'active', 'archived');
CREATE TYPE "public"."corporate_action_type" AS ENUM('split', 'dividend', 'merger', 'spinoff');
CREATE TYPE "public"."cycle_event_type" AS ENUM('phase_change', 'agent_start', 'agent_complete', 'decision', 'order', 'error');
CREATE TYPE "public"."cycle_phase" AS ENUM('observe', 'orient', 'decide', 'act', 'complete');
CREATE TYPE "public"."cycle_status" AS ENUM('running', 'completed', 'failed');
CREATE TYPE "public"."date_format" AS ENUM('MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD');
CREATE TYPE "public"."decision_action" AS ENUM('BUY', 'SELL', 'HOLD', 'CLOSE', 'INCREASE', 'REDUCE', 'NO_TRADE');
CREATE TYPE "public"."decision_direction" AS ENUM('LONG', 'SHORT', 'FLAT');
CREATE TYPE "public"."decision_status" AS ENUM('pending', 'approved', 'rejected', 'executed', 'cancelled', 'expired');
CREATE TYPE "public"."environment" AS ENUM('BACKTEST', 'PAPER', 'LIVE');
CREATE TYPE "public"."execution_recovery_status" AS ENUM('unknown', 'healthy', 'error', 'interrupted', 'needs_attention');
CREATE TYPE "public"."external_event_source" AS ENUM('news', 'earnings', 'sec_filing', 'fed');
CREATE TYPE "public"."factor_status" AS ENUM('research', 'stage1', 'stage2', 'paper', 'active', 'decaying', 'retired');
CREATE TYPE "public"."filing_status" AS ENUM('pending', 'processing', 'complete', 'failed');
CREATE TYPE "public"."filing_type" AS ENUM('10-K', '10-Q', '8-K', 'DEF14A');
CREATE TYPE "public"."hypothesis_status" AS ENUM('proposed', 'testing', 'validated', 'rejected');
CREATE TYPE "public"."index_id" AS ENUM('SP500', 'NDX100', 'DJIA');
CREATE TYPE "public"."indicator_category" AS ENUM('momentum', 'trend', 'volatility', 'volume', 'sentiment');
CREATE TYPE "public"."indicator_status" AS ENUM('staging', 'paper', 'production', 'retired');
CREATE TYPE "public"."macro_watch_category" AS ENUM('NEWS', 'PREDICTION', 'ECONOMIC', 'MOVER', 'EARNINGS');
CREATE TYPE "public"."macro_watch_session" AS ENUM('OVERNIGHT', 'PRE_MARKET', 'AFTER_HOURS');
CREATE TYPE "public"."order_side" AS ENUM('buy', 'sell');
CREATE TYPE "public"."order_status" AS ENUM('pending', 'submitted', 'accepted', 'partial_fill', 'filled', 'cancelled', 'rejected', 'expired');
CREATE TYPE "public"."order_type" AS ENUM('market', 'limit', 'stop', 'stop_limit');
CREATE TYPE "public"."parity_entity_type" AS ENUM('indicator', 'factor', 'config');
CREATE TYPE "public"."parity_recommendation" AS ENUM('APPROVE_FOR_LIVE', 'NEEDS_INVESTIGATION', 'NOT_READY');
CREATE TYPE "public"."portfolio_view" AS ENUM('table', 'cards');
CREATE TYPE "public"."position_side" AS ENUM('long', 'short');
CREATE TYPE "public"."position_status" AS ENUM('open', 'closed', 'pending');
CREATE TYPE "public"."prediction_market_platform" AS ENUM('kalshi', 'polymarket');
CREATE TYPE "public"."prediction_market_type" AS ENUM('rate', 'election', 'economic');
CREATE TYPE "public"."regime" AS ENUM('trending_up', 'trending_down', 'ranging', 'volatile');
CREATE TYPE "public"."research_phase" AS ENUM('idea', 'implementation', 'stage1', 'stage2', 'translation', 'equivalence', 'paper', 'promotion', 'completed', 'failed');
CREATE TYPE "public"."research_trigger_type" AS ENUM('scheduled', 'decay_detected', 'regime_change', 'manual', 'refinement');
CREATE TYPE "public"."sentiment" AS ENUM('positive', 'negative', 'neutral');
CREATE TYPE "public"."size_unit" AS ENUM('SHARES', 'CONTRACTS', 'DOLLARS', 'PCT_EQUITY');
CREATE TYPE "public"."sync_run_status" AS ENUM('running', 'completed', 'failed');
CREATE TYPE "public"."sync_trigger_source" AS ENUM('scheduled', 'manual', 'dashboard');
CREATE TYPE "public"."system_status" AS ENUM('stopped', 'running', 'paused', 'error');
CREATE TYPE "public"."theme" AS ENUM('light', 'dark', 'system');
CREATE TYPE "public"."thesis_state_value" AS ENUM('WATCHING', 'STAGED', 'OPEN', 'SCALING', 'EXITING', 'CLOSED');
CREATE TYPE "public"."ticker_change_type" AS ENUM('rename', 'merger', 'spinoff', 'delisted');
CREATE TYPE "public"."time_format" AS ENUM('12h', '24h');
CREATE TYPE "public"."time_in_force" AS ENUM('day', 'gtc', 'ioc', 'fok');
CREATE TYPE "public"."timeframe" AS ENUM('1m', '5m', '15m', '1h', '1d');
CREATE TYPE "public"."universe_source" AS ENUM('static', 'index', 'screener');
CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" bigint,
	"refresh_token_expires_at" bigint,
	"scope" text,
	"password" text,
	"created_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL,
	"updated_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL
);

CREATE TABLE "agent_configs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"environment" "environment" NOT NULL,
	"agent_type" "agent_type" NOT NULL,
	"system_prompt_override" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "agent_outputs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"decision_id" uuid NOT NULL,
	"agent_type" "agent_type" NOT NULL,
	"vote" "agent_vote" NOT NULL,
	"confidence" numeric(4, 3) NOT NULL,
	"reasoning_summary" text,
	"full_reasoning" text,
	"tokens_used" integer,
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "valid_confidence" CHECK ("agent_outputs"."confidence"::numeric >= 0 AND "agent_outputs"."confidence"::numeric <= 1)
);

CREATE TABLE "alert_settings" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"enable_push" boolean DEFAULT true NOT NULL,
	"enable_email" boolean DEFAULT true NOT NULL,
	"email_address" text,
	"critical_only" boolean DEFAULT false NOT NULL,
	"quiet_hours_start" text,
	"quiet_hours_end" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alert_settings_user_id_unique" UNIQUE("user_id")
);

CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"severity" "alert_severity" NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"metadata" jsonb,
	"acknowledged" boolean DEFAULT false NOT NULL,
	"acknowledged_by" text,
	"acknowledged_at" timestamp with time zone,
	"environment" "environment" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);

CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	"user_email" text NOT NULL,
	"action" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"environment" "environment" DEFAULT 'LIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "backtest_equity" (
	"id" serial PRIMARY KEY NOT NULL,
	"backtest_id" uuid NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"nav" numeric(16, 2) NOT NULL,
	"cash" numeric(16, 2) NOT NULL,
	"equity" numeric(16, 2) NOT NULL,
	"drawdown" numeric(14, 2),
	"drawdown_pct" numeric(8, 4),
	"day_return_pct" numeric(8, 4),
	"cumulative_return_pct" numeric(8, 4)
);

CREATE TABLE "backtest_trades" (
	"id" serial PRIMARY KEY NOT NULL,
	"backtest_id" uuid NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"symbol" text NOT NULL,
	"action" text NOT NULL,
	"qty" numeric(14, 4) NOT NULL,
	"price" numeric(12, 4) NOT NULL,
	"commission" numeric(10, 4) DEFAULT '0',
	"pnl" numeric(14, 2),
	"pnl_pct" numeric(8, 4),
	"decision_rationale" text
);

CREATE TABLE "backtests" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"initial_capital" numeric(16, 2) NOT NULL,
	"universe" text,
	"config_json" jsonb,
	"status" "backtest_status" DEFAULT 'pending' NOT NULL,
	"progress_pct" numeric(5, 2) DEFAULT '0',
	"total_return" numeric(8, 4),
	"cagr" numeric(8, 4),
	"sharpe_ratio" numeric(8, 4),
	"sortino_ratio" numeric(8, 4),
	"calmar_ratio" numeric(8, 4),
	"max_drawdown" numeric(8, 4),
	"win_rate" numeric(5, 4),
	"profit_factor" numeric(8, 4),
	"total_trades" integer,
	"avg_trade_pnl" numeric(14, 2),
	"metrics_json" jsonb,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_by" text
);

CREATE TABLE "candles" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"timeframe" timeframe NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"open" numeric(12, 4) NOT NULL,
	"high" numeric(12, 4) NOT NULL,
	"low" numeric(12, 4) NOT NULL,
	"close" numeric(12, 4) NOT NULL,
	"volume" numeric(18, 0) DEFAULT '0' NOT NULL,
	"vwap" numeric(12, 4),
	"trade_count" integer,
	"adjusted" boolean DEFAULT false NOT NULL,
	"split_adjusted" boolean DEFAULT false NOT NULL,
	"dividend_adjusted" boolean DEFAULT false NOT NULL,
	"quality_flags" jsonb DEFAULT '[]'::jsonb,
	"provider" text DEFAULT 'alpaca' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "valid_ohlc" CHECK ("candles"."high"::numeric >= "candles"."low"::numeric AND
          "candles"."high"::numeric >= "candles"."open"::numeric AND
          "candles"."high"::numeric >= "candles"."close"::numeric AND
          "candles"."low"::numeric <= "candles"."open"::numeric AND
          "candles"."low"::numeric <= "candles"."close"::numeric),
	CONSTRAINT "positive_volume" CHECK ("candles"."volume"::numeric >= 0)
);

CREATE TABLE "config_versions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"environment" "environment" NOT NULL,
	"config_json" jsonb NOT NULL,
	"description" text,
	"active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"activated_at" timestamp with time zone,
	"deactivated_at" timestamp with time zone
);

CREATE TABLE "constraints_config" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"environment" "environment" NOT NULL,
	"max_shares" integer DEFAULT 1000 NOT NULL,
	"max_contracts" integer DEFAULT 10 NOT NULL,
	"max_notional" numeric(14, 2) DEFAULT '50000' NOT NULL,
	"max_pct_equity" numeric(4, 3) DEFAULT '0.1' NOT NULL,
	"max_gross_exposure" numeric(4, 2) DEFAULT '2.0' NOT NULL,
	"max_net_exposure" numeric(4, 2) DEFAULT '1.0' NOT NULL,
	"max_concentration" numeric(4, 3) DEFAULT '0.25' NOT NULL,
	"max_correlation" numeric(4, 3) DEFAULT '0.7' NOT NULL,
	"max_drawdown" numeric(4, 3) DEFAULT '0.15' NOT NULL,
	"max_delta" numeric(8, 2) DEFAULT '100' NOT NULL,
	"max_gamma" numeric(8, 2) DEFAULT '50' NOT NULL,
	"max_vega" numeric(10, 2) DEFAULT '1000' NOT NULL,
	"max_theta" numeric(10, 2) DEFAULT '500' NOT NULL,
	"status" "config_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "valid_exposure" CHECK ("constraints_config"."max_gross_exposure"::numeric > 0)
);

CREATE TABLE "corporate_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"action_type" "corporate_action_type" NOT NULL,
	"ex_date" timestamp with time zone NOT NULL,
	"record_date" timestamp with time zone,
	"pay_date" timestamp with time zone,
	"ratio" numeric(10, 6),
	"amount" numeric(12, 4),
	"details" text,
	"provider" text DEFAULT 'alpaca' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "corporate_actions_indicators" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"symbol" text NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"trailing_dividend_yield" numeric(8, 4),
	"ex_dividend_days" integer,
	"upcoming_earnings_days" integer,
	"recent_split" boolean DEFAULT false,
	"split_ratio" text,
	CONSTRAINT "corp_actions_indicators_symbol_date" UNIQUE("symbol","date")
);

CREATE TABLE "cycle_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"cycle_id" uuid NOT NULL,
	"event_type" "cycle_event_type" NOT NULL,
	"phase" "cycle_phase",
	"agent_type" "agent_type",
	"symbol" text,
	"message" text,
	"data_json" jsonb,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"duration_ms" integer
);

CREATE TABLE "cycles" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"environment" "environment" NOT NULL,
	"status" "cycle_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"duration_ms" integer,
	"current_phase" "cycle_phase",
	"phase_started_at" timestamp with time zone,
	"total_symbols" integer DEFAULT 0,
	"completed_symbols" integer DEFAULT 0,
	"progress_pct" numeric(5, 2) DEFAULT '0',
	"approved" boolean,
	"iterations" integer,
	"decisions_count" integer DEFAULT 0,
	"orders_count" integer DEFAULT 0,
	"decisions_json" jsonb,
	"orders_json" jsonb,
	"error_message" text,
	"error_stack" text,
	"config_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "decisions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"cycle_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"action" "decision_action" NOT NULL,
	"direction" "decision_direction" NOT NULL,
	"size" numeric(14, 4) NOT NULL,
	"size_unit" "size_unit" DEFAULT 'SHARES' NOT NULL,
	"entry_price" numeric(12, 4),
	"stop_loss" numeric(12, 4),
	"take_profit" numeric(12, 4),
	"stop_price" numeric(12, 4),
	"target_price" numeric(12, 4),
	"strategy_family" text,
	"time_horizon" text,
	"bullish_factors" jsonb DEFAULT '[]'::jsonb,
	"bearish_factors" jsonb DEFAULT '[]'::jsonb,
	"confidence_score" numeric(4, 3),
	"risk_score" numeric(4, 3),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"status" "decision_status" DEFAULT 'pending' NOT NULL,
	"rationale" text,
	"environment" "environment" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"executed_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	CONSTRAINT "positive_size" CHECK ("decisions"."size"::numeric > 0),
	CONSTRAINT "valid_confidence" CHECK ("decisions"."confidence_score" IS NULL OR ("decisions"."confidence_score"::numeric >= 0 AND "decisions"."confidence_score"::numeric <= 1)),
	CONSTRAINT "valid_risk" CHECK ("decisions"."risk_score" IS NULL OR ("decisions"."risk_score"::numeric >= 0 AND "decisions"."risk_score"::numeric <= 1))
);

CREATE TABLE "execution_order_snapshots" (
	"order_id" text PRIMARY KEY NOT NULL,
	"broker_order_id" text NOT NULL,
	"instrument_id" text NOT NULL,
	"status" text NOT NULL,
	"side" text NOT NULL,
	"order_type" text NOT NULL,
	"time_in_force" text NOT NULL,
	"requested_quantity" numeric(14, 4) NOT NULL,
	"filled_quantity" numeric(14, 4) NOT NULL,
	"avg_fill_price" numeric(12, 4) NOT NULL,
	"limit_price" numeric(12, 4),
	"stop_price" numeric(12, 4),
	"submitted_at" text NOT NULL,
	"last_update_at" text NOT NULL,
	"status_message" text,
	"is_multi_leg" boolean DEFAULT false NOT NULL,
	"environment" "environment" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "execution_position_snapshots" (
	"symbol" text PRIMARY KEY NOT NULL,
	"quantity" numeric(14, 4) NOT NULL,
	"avg_entry_price" numeric(12, 4) NOT NULL,
	"environment" "environment" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "execution_recovery_state" (
	"environment" "environment" PRIMARY KEY NOT NULL,
	"last_snapshot_at" timestamp with time zone,
	"last_reconciliation_at" timestamp with time zone,
	"last_cycle_id" text,
	"status" "execution_recovery_status" DEFAULT 'unknown' NOT NULL,
	"error_message" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "external_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"source_type" "external_event_source" NOT NULL,
	"event_type" text NOT NULL,
	"event_time" timestamp with time zone NOT NULL,
	"processed_at" timestamp with time zone NOT NULL,
	"sentiment" "sentiment" NOT NULL,
	"confidence" numeric(4, 3) NOT NULL,
	"importance" integer NOT NULL,
	"summary" text NOT NULL,
	"key_insights" jsonb NOT NULL,
	"entities" jsonb NOT NULL,
	"data_points" jsonb NOT NULL,
	"sentiment_score" numeric(5, 4) NOT NULL,
	"importance_score" numeric(5, 4) NOT NULL,
	"surprise_score" numeric(5, 4) NOT NULL,
	"related_instruments" jsonb NOT NULL,
	"original_content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE "factor_correlations" (
	"factor_id_1" uuid NOT NULL,
	"factor_id_2" uuid NOT NULL,
	"correlation" numeric(5, 4) NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "factor_correlations_factor_id_1_factor_id_2_pk" PRIMARY KEY("factor_id_1","factor_id_2")
);

CREATE TABLE "factor_performance" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"factor_id" uuid NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"ic" numeric(6, 4) NOT NULL,
	"icir" numeric(8, 4),
	"sharpe" numeric(8, 4),
	"weight" numeric(6, 4) DEFAULT '0.0' NOT NULL,
	"signal_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "factor_performance_factor_date" UNIQUE("factor_id","date")
);

CREATE TABLE "factor_weights" (
	"factor_id" uuid PRIMARY KEY NOT NULL,
	"weight" numeric(6, 4) DEFAULT '0.0' NOT NULL,
	"last_ic" numeric(6, 4),
	"last_updated" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "factors" (
	"factor_id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"hypothesis_id" uuid,
	"name" text NOT NULL,
	"status" "factor_status" DEFAULT 'research' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"author" text DEFAULT 'claude-code' NOT NULL,
	"python_module" text,
	"typescript_module" text,
	"symbolic_length" integer,
	"parameter_count" integer,
	"feature_count" integer,
	"originality_score" numeric(5, 4),
	"hypothesis_alignment" numeric(5, 4),
	"stage1_sharpe" numeric(8, 4),
	"stage1_ic" numeric(6, 4),
	"stage1_max_drawdown" numeric(6, 4),
	"stage1_completed_at" timestamp with time zone,
	"stage2_pbo" numeric(6, 4),
	"stage2_dsr_pvalue" numeric(6, 4),
	"stage2_wfe" numeric(6, 4),
	"stage2_completed_at" timestamp with time zone,
	"paper_validation_passed" integer DEFAULT 0,
	"paper_start_date" timestamp with time zone,
	"paper_end_date" timestamp with time zone,
	"paper_realized_sharpe" numeric(8, 4),
	"paper_realized_ic" numeric(6, 4),
	"current_weight" numeric(6, 4) DEFAULT '0.0',
	"last_ic" numeric(6, 4),
	"decay_rate" numeric(6, 4),
	"target_regimes" jsonb,
	"parity_report" text,
	"parity_validated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"promoted_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"last_updated" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "factors_name_unique" UNIQUE("name")
);

CREATE TABLE "features" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"timeframe" timeframe NOT NULL,
	"indicator_name" text NOT NULL,
	"raw_value" numeric(18, 8) NOT NULL,
	"normalized_value" numeric(8, 6),
	"parameters" jsonb,
	"quality_score" numeric(4, 3),
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "filing_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"symbols_requested" jsonb NOT NULL,
	"filing_types" jsonb NOT NULL,
	"date_range_start" timestamp with time zone,
	"date_range_end" timestamp with time zone,
	"symbols_total" integer DEFAULT 0,
	"symbols_processed" integer DEFAULT 0,
	"filings_fetched" integer DEFAULT 0,
	"filings_ingested" integer DEFAULT 0,
	"chunks_created" integer DEFAULT 0,
	"status" "sync_run_status" DEFAULT 'running' NOT NULL,
	"error_message" text,
	"trigger_source" "sync_trigger_source" NOT NULL,
	"environment" "environment" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "filings" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"accession_number" text NOT NULL,
	"symbol" text NOT NULL,
	"filing_type" "filing_type" NOT NULL,
	"filed_date" timestamp with time zone NOT NULL,
	"report_date" timestamp with time zone,
	"company_name" text,
	"cik" text,
	"section_count" integer DEFAULT 0,
	"chunk_count" integer DEFAULT 0,
	"status" "filing_status" DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"ingested_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "filings_accession_number_unique" UNIQUE("accession_number")
);

CREATE TABLE "fundamental_indicators" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"symbol" text NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"pe_ratio_ttm" numeric(10, 2),
	"pe_ratio_forward" numeric(10, 2),
	"pb_ratio" numeric(10, 2),
	"ev_ebitda" numeric(10, 2),
	"earnings_yield" numeric(8, 4),
	"dividend_yield" numeric(8, 4),
	"cape_10yr" numeric(10, 2),
	"gross_profitability" numeric(8, 4),
	"roe" numeric(8, 4),
	"roa" numeric(8, 4),
	"asset_growth" numeric(8, 4),
	"accruals_ratio" numeric(8, 4),
	"cash_flow_quality" numeric(8, 4),
	"beneish_m_score" numeric(8, 4),
	"market_cap" numeric(18, 2),
	"sector" text,
	"industry" text,
	"source" text DEFAULT 'computed' NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fundamental_indicators_symbol_date" UNIQUE("symbol","date")
);

CREATE TABLE "hypotheses" (
	"hypothesis_id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"title" text NOT NULL,
	"economic_rationale" text NOT NULL,
	"market_mechanism" text NOT NULL,
	"target_regime" text,
	"falsification_criteria" text,
	"status" "hypothesis_status" DEFAULT 'proposed' NOT NULL,
	"iteration" integer DEFAULT 1 NOT NULL,
	"parent_hypothesis_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "index_constituents" (
	"id" serial PRIMARY KEY NOT NULL,
	"index_id" text NOT NULL,
	"symbol" text NOT NULL,
	"date_added" timestamp with time zone NOT NULL,
	"date_removed" timestamp with time zone,
	"reason_added" text,
	"reason_removed" text,
	"sector" text,
	"industry" text,
	"market_cap_at_add" numeric(18, 2),
	"provider" text DEFAULT 'alpaca' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "indicator_ic_history" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"indicator_id" uuid NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"ic_value" numeric(6, 4) NOT NULL,
	"ic_std" numeric(6, 4) NOT NULL,
	"decisions_used_in" integer DEFAULT 0 NOT NULL,
	"decisions_correct" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "indicator_ic_history_indicator_date" UNIQUE("indicator_id","date")
);

CREATE TABLE "indicator_paper_signals" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"indicator_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"signal_date" timestamp with time zone NOT NULL,
	"signal" numeric(5, 4) NOT NULL,
	"outcome" numeric(8, 4),
	"outcome_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "indicator_paper_signals_unique" UNIQUE("indicator_id","symbol","signal_date")
);

CREATE TABLE "indicator_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"run_type" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"symbols_processed" integer DEFAULT 0,
	"symbols_failed" integer DEFAULT 0,
	"status" "sync_run_status" DEFAULT 'running' NOT NULL,
	"error_message" text,
	"environment" "environment" NOT NULL
);

CREATE TABLE "indicator_trials" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"indicator_id" uuid NOT NULL,
	"trial_number" integer NOT NULL,
	"hypothesis" text NOT NULL,
	"parameters" jsonb NOT NULL,
	"sharpe_ratio" numeric(8, 4),
	"information_coefficient" numeric(6, 4),
	"max_drawdown" numeric(6, 4),
	"calmar_ratio" numeric(8, 4),
	"sortino_ratio" numeric(8, 4),
	"selected" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "indicator_trials_indicator_trial" UNIQUE("indicator_id","trial_number")
);

CREATE TABLE "indicators" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"category" "indicator_category" NOT NULL,
	"status" "indicator_status" DEFAULT 'staging' NOT NULL,
	"hypothesis" text NOT NULL,
	"economic_rationale" text NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"generated_by" text NOT NULL,
	"code_hash" text,
	"ast_signature" text,
	"validation_report" text,
	"paper_trading_start" timestamp with time zone,
	"paper_trading_end" timestamp with time zone,
	"paper_trading_report" text,
	"promoted_at" timestamp with time zone,
	"pr_url" text,
	"merged_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"retirement_reason" text,
	"similar_to" uuid,
	"replaces" uuid,
	"parity_report" text,
	"parity_validated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "indicators_name_unique" UNIQUE("name")
);

CREATE TABLE "macro_watch_entries" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"session" "macro_watch_session" NOT NULL,
	"category" "macro_watch_category" NOT NULL,
	"headline" text NOT NULL,
	"symbols" jsonb NOT NULL,
	"source" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE "morning_newspapers" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"date" text NOT NULL,
	"compiled_at" timestamp with time zone NOT NULL,
	"sections" jsonb NOT NULL,
	"raw_entry_ids" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "morning_newspapers_date_unique" UNIQUE("date")
);

CREATE TABLE "options_indicators_cache" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"symbol" text NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"implied_volatility" numeric(8, 4),
	"iv_percentile_30d" numeric(5, 2),
	"iv_skew" numeric(8, 4),
	"put_call_ratio" numeric(8, 4),
	"vrp" numeric(8, 4),
	"term_structure_slope" numeric(8, 4),
	"net_delta" numeric(12, 4),
	"net_gamma" numeric(12, 4),
	"net_theta" numeric(12, 4),
	"net_vega" numeric(12, 4),
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "options_indicators_cache_symbol_unique" UNIQUE("symbol")
);

CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"decision_id" uuid,
	"symbol" text NOT NULL,
	"side" "order_side" NOT NULL,
	"qty" numeric(14, 4) NOT NULL,
	"order_type" "order_type" NOT NULL,
	"limit_price" numeric(12, 4),
	"stop_price" numeric(12, 4),
	"time_in_force" time_in_force DEFAULT 'day' NOT NULL,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"broker_order_id" text,
	"filled_qty" numeric(14, 4) DEFAULT '0',
	"filled_avg_price" numeric(12, 4),
	"commission" numeric(10, 4),
	"environment" "environment" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"filled_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "positive_quantity" CHECK ("orders"."qty"::numeric > 0)
);

CREATE TABLE "paper_signals" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"factor_id" uuid NOT NULL,
	"signal_date" timestamp with time zone NOT NULL,
	"symbol" text NOT NULL,
	"signal_value" numeric(8, 4) NOT NULL,
	"direction" text NOT NULL,
	"entry_price" numeric(12, 4),
	"exit_price" numeric(12, 4),
	"actual_return" numeric(8, 4),
	"predicted_return" numeric(8, 4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "paper_signals_factor_date_symbol" UNIQUE("factor_id","signal_date","symbol")
);

CREATE TABLE "parity_validation_history" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"entity_type" "parity_entity_type" NOT NULL,
	"entity_id" text NOT NULL,
	"environment" "environment" NOT NULL,
	"passed" boolean NOT NULL,
	"recommendation" "parity_recommendation" NOT NULL,
	"blocking_issues" jsonb,
	"warnings" jsonb,
	"full_report" jsonb NOT NULL,
	"validated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "portfolio_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"environment" "environment" NOT NULL,
	"nav" numeric(16, 2) NOT NULL,
	"cash" numeric(16, 2) NOT NULL,
	"equity" numeric(16, 2) NOT NULL,
	"gross_exposure" numeric(8, 4) NOT NULL,
	"net_exposure" numeric(8, 4) NOT NULL,
	"long_exposure" numeric(8, 4),
	"short_exposure" numeric(8, 4),
	"open_positions" integer,
	"day_pnl" numeric(14, 2),
	"day_return_pct" numeric(8, 4),
	"total_return_pct" numeric(8, 4),
	"max_drawdown" numeric(8, 4),
	CONSTRAINT "portfolio_snapshots_timestamp_env" UNIQUE("timestamp","environment")
);

CREATE TABLE "position_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"position_id" uuid NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"price" numeric(12, 4) NOT NULL,
	"qty" numeric(14, 4) NOT NULL,
	"unrealized_pnl" numeric(14, 2),
	"market_value" numeric(14, 2)
);

CREATE TABLE "positions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"symbol" text NOT NULL,
	"side" "position_side" NOT NULL,
	"qty" numeric(14, 4) NOT NULL,
	"avg_entry" numeric(12, 4) NOT NULL,
	"current_price" numeric(12, 4),
	"unrealized_pnl" numeric(14, 2),
	"unrealized_pnl_pct" numeric(8, 4),
	"realized_pnl" numeric(14, 2) DEFAULT '0',
	"market_value" numeric(14, 2),
	"cost_basis" numeric(14, 2),
	"thesis_id" uuid,
	"decision_id" uuid,
	"status" "position_status" DEFAULT 'open' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"environment" "environment" NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "positive_quantity" CHECK ("positions"."qty"::numeric > 0),
	CONSTRAINT "positive_entry" CHECK ("positions"."avg_entry"::numeric > 0)
);

CREATE TABLE "prediction_market_arbitrage" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"kalshi_ticker" text NOT NULL,
	"polymarket_token" text NOT NULL,
	"kalshi_price" numeric(6, 4) NOT NULL,
	"polymarket_price" numeric(6, 4) NOT NULL,
	"divergence_pct" numeric(6, 4) NOT NULL,
	"market_type" "prediction_market_type" NOT NULL,
	"detected_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolution_price" numeric(6, 4),
	"created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE "prediction_market_signals" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"signal_type" text NOT NULL,
	"signal_value" numeric(8, 4) NOT NULL,
	"confidence" numeric(4, 3),
	"computed_at" timestamp with time zone NOT NULL,
	"inputs" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE "prediction_market_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"platform" "prediction_market_platform" NOT NULL,
	"market_ticker" text NOT NULL,
	"market_type" "prediction_market_type" NOT NULL,
	"market_question" text,
	"snapshot_time" timestamp with time zone NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE "regime_labels" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"timeframe" timeframe NOT NULL,
	"regime" "regime" NOT NULL,
	"confidence" numeric(4, 3) NOT NULL,
	"trend_strength" numeric(4, 3),
	"volatility_percentile" numeric(5, 2),
	"correlation_to_market" numeric(4, 3),
	"model_name" text DEFAULT 'hmm_regime' NOT NULL,
	"model_version" text,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "research_runs" (
	"run_id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"trigger_type" "research_trigger_type" NOT NULL,
	"trigger_reason" text NOT NULL,
	"phase" "research_phase" DEFAULT 'idea' NOT NULL,
	"current_iteration" integer DEFAULT 1 NOT NULL,
	"hypothesis_id" uuid,
	"factor_id" uuid,
	"pr_url" text,
	"error_message" text,
	"tokens_used" integer DEFAULT 0,
	"compute_hours" numeric(8, 2) DEFAULT '0.0',
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);

CREATE TABLE "sentiment_indicators" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"symbol" text NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"sentiment_score" numeric(5, 4),
	"sentiment_strength" numeric(5, 4),
	"news_volume" integer,
	"sentiment_momentum" numeric(5, 4),
	"event_risk_flag" boolean DEFAULT false,
	"news_sentiment" numeric(5, 4),
	"social_sentiment" numeric(5, 4),
	"analyst_sentiment" numeric(5, 4),
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sentiment_indicators_symbol_date" UNIQUE("symbol","date")
);

CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"expires_at" bigint NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	"created_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL,
	"updated_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);

CREATE TABLE "short_interest_indicators" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"symbol" text NOT NULL,
	"settlement_date" timestamp with time zone NOT NULL,
	"short_interest" numeric(18, 0) NOT NULL,
	"short_interest_ratio" numeric(8, 2),
	"days_to_cover" numeric(8, 2),
	"short_pct_float" numeric(8, 4),
	"short_interest_change" numeric(8, 4),
	"source" text DEFAULT 'FINRA' NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "short_interest_symbol_date" UNIQUE("symbol","settlement_date")
);

CREATE TABLE "system_state" (
	"environment" "environment" PRIMARY KEY NOT NULL,
	"status" "system_status" DEFAULT 'stopped' NOT NULL,
	"last_cycle_id" uuid,
	"last_cycle_time" timestamp with time zone,
	"current_phase" text,
	"phase_started_at" timestamp with time zone,
	"next_cycle_at" timestamp with time zone,
	"error_message" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "thesis_state" (
	"thesis_id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"instrument_id" text NOT NULL,
	"state" "thesis_state_value" NOT NULL,
	"entry_price" numeric(12, 4),
	"entry_date" timestamp with time zone,
	"current_stop" numeric(12, 4),
	"current_target" numeric(12, 4),
	"conviction" numeric(4, 3),
	"entry_thesis" text,
	"invalidation_conditions" text,
	"add_count" integer DEFAULT 0 NOT NULL,
	"max_position_reached" integer DEFAULT 0 NOT NULL,
	"peak_unrealized_pnl" numeric(14, 2),
	"close_reason" text,
	"exit_price" numeric(12, 4),
	"realized_pnl" numeric(14, 2),
	"realized_pnl_pct" numeric(8, 4),
	"environment" "environment" NOT NULL,
	"notes" text,
	"last_updated" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);

CREATE TABLE "thesis_state_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"thesis_id" uuid NOT NULL,
	"from_state" "thesis_state_value" NOT NULL,
	"to_state" "thesis_state_value" NOT NULL,
	"trigger_reason" text,
	"cycle_id" uuid,
	"price_at_transition" numeric(12, 4),
	"conviction_at_transition" numeric(4, 3),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "ticker_changes" (
	"id" serial PRIMARY KEY NOT NULL,
	"old_symbol" text NOT NULL,
	"new_symbol" text NOT NULL,
	"change_date" timestamp with time zone NOT NULL,
	"change_type" "ticker_change_type" NOT NULL,
	"conversion_ratio" numeric(10, 6),
	"reason" text,
	"acquiring_company" text,
	"provider" text DEFAULT 'alpaca' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "trading_config" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"environment" "environment" NOT NULL,
	"version" integer NOT NULL,
	"max_consensus_iterations" integer DEFAULT 3,
	"agent_timeout_ms" integer DEFAULT 30000,
	"total_consensus_timeout_ms" integer DEFAULT 300000,
	"conviction_delta_hold" numeric(4, 3) DEFAULT '0.2',
	"conviction_delta_action" numeric(4, 3) DEFAULT '0.3',
	"high_conviction_pct" numeric(4, 3) DEFAULT '0.7',
	"medium_conviction_pct" numeric(4, 3) DEFAULT '0.5',
	"low_conviction_pct" numeric(4, 3) DEFAULT '0.25',
	"min_risk_reward_ratio" numeric(4, 2) DEFAULT '1.5',
	"kelly_fraction" numeric(4, 3) DEFAULT '0.5',
	"trading_cycle_interval_ms" integer DEFAULT 3600000,
	"prediction_markets_interval_ms" integer DEFAULT 900000,
	"global_model" text DEFAULT 'gemini-3-flash-preview' NOT NULL,
	"status" "config_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"promoted_from" uuid,
	CONSTRAINT "valid_kelly" CHECK ("trading_config"."kelly_fraction"::numeric > 0 AND "trading_config"."kelly_fraction"::numeric <= 1)
);

CREATE TABLE "two_factor" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" uuid NOT NULL
);

CREATE TABLE "universe_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"source_hash" text NOT NULL,
	"tickers" jsonb NOT NULL,
	"ticker_count" integer NOT NULL,
	"metadata" jsonb,
	"cached_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"provider" text
);

CREATE TABLE "universe_configs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"environment" "environment" NOT NULL,
	"source" "universe_source" NOT NULL,
	"static_symbols" jsonb,
	"index_source" text,
	"min_volume" integer,
	"min_market_cap" integer,
	"optionable_only" boolean DEFAULT false NOT NULL,
	"include_list" jsonb DEFAULT '[]'::jsonb,
	"exclude_list" jsonb DEFAULT '[]'::jsonb,
	"status" "config_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "universe_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"snapshot_date" timestamp with time zone NOT NULL,
	"index_id" text NOT NULL,
	"tickers" jsonb NOT NULL,
	"ticker_count" integer NOT NULL,
	"source_version" text,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);

CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"two_factor_enabled" boolean DEFAULT false,
	"created_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL,
	"updated_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);

CREATE TABLE "user_preferences" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"theme" "theme" DEFAULT 'system' NOT NULL,
	"chart_timeframe" chart_timeframe DEFAULT '1M' NOT NULL,
	"feed_filters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sidebar_collapsed" boolean DEFAULT false NOT NULL,
	"notification_settings" jsonb DEFAULT '{"emailAlerts":true,"pushNotifications":false,"tradeConfirmations":true,"dailySummary":true,"riskAlerts":true}'::jsonb NOT NULL,
	"default_portfolio_view" "portfolio_view" DEFAULT 'table' NOT NULL,
	"date_format" date_format DEFAULT 'MM/DD/YYYY' NOT NULL,
	"time_format" time_format DEFAULT '12h' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_user_id_unique" UNIQUE("user_id")
);

CREATE TABLE "verification" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"created_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL,
	"updated_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL
);

ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "agent_outputs" ADD CONSTRAINT "agent_outputs_decision_id_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."decisions"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "alert_settings" ADD CONSTRAINT "alert_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "backtest_equity" ADD CONSTRAINT "backtest_equity_backtest_id_backtests_id_fk" FOREIGN KEY ("backtest_id") REFERENCES "public"."backtests"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "backtest_trades" ADD CONSTRAINT "backtest_trades_backtest_id_backtests_id_fk" FOREIGN KEY ("backtest_id") REFERENCES "public"."backtests"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "cycle_events" ADD CONSTRAINT "cycle_events_cycle_id_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "factor_correlations" ADD CONSTRAINT "factor_correlations_factor_id_1_factors_factor_id_fk" FOREIGN KEY ("factor_id_1") REFERENCES "public"."factors"("factor_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "factor_correlations" ADD CONSTRAINT "factor_correlations_factor_id_2_factors_factor_id_fk" FOREIGN KEY ("factor_id_2") REFERENCES "public"."factors"("factor_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "factor_performance" ADD CONSTRAINT "factor_performance_factor_id_factors_factor_id_fk" FOREIGN KEY ("factor_id") REFERENCES "public"."factors"("factor_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "factor_weights" ADD CONSTRAINT "factor_weights_factor_id_factors_factor_id_fk" FOREIGN KEY ("factor_id") REFERENCES "public"."factors"("factor_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "factors" ADD CONSTRAINT "factors_hypothesis_id_hypotheses_hypothesis_id_fk" FOREIGN KEY ("hypothesis_id") REFERENCES "public"."hypotheses"("hypothesis_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "indicator_ic_history" ADD CONSTRAINT "indicator_ic_history_indicator_id_indicators_id_fk" FOREIGN KEY ("indicator_id") REFERENCES "public"."indicators"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "indicator_paper_signals" ADD CONSTRAINT "indicator_paper_signals_indicator_id_indicators_id_fk" FOREIGN KEY ("indicator_id") REFERENCES "public"."indicators"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "indicator_trials" ADD CONSTRAINT "indicator_trials_indicator_id_indicators_id_fk" FOREIGN KEY ("indicator_id") REFERENCES "public"."indicators"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "orders" ADD CONSTRAINT "orders_decision_id_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."decisions"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "paper_signals" ADD CONSTRAINT "paper_signals_factor_id_factors_factor_id_fk" FOREIGN KEY ("factor_id") REFERENCES "public"."factors"("factor_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "position_history" ADD CONSTRAINT "position_history_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "positions" ADD CONSTRAINT "positions_decision_id_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."decisions"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "research_runs" ADD CONSTRAINT "research_runs_hypothesis_id_hypotheses_hypothesis_id_fk" FOREIGN KEY ("hypothesis_id") REFERENCES "public"."hypotheses"("hypothesis_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "research_runs" ADD CONSTRAINT "research_runs_factor_id_factors_factor_id_fk" FOREIGN KEY ("factor_id") REFERENCES "public"."factors"("factor_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "thesis_state_history" ADD CONSTRAINT "thesis_state_history_thesis_id_thesis_state_thesis_id_fk" FOREIGN KEY ("thesis_id") REFERENCES "public"."thesis_state"("thesis_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "idx_account_user_id" ON "account" USING btree ("user_id");
CREATE INDEX "idx_account_provider_id" ON "account" USING btree ("provider_id");
CREATE INDEX "idx_account_provider_account" ON "account" USING btree ("provider_id","account_id");
CREATE INDEX "idx_agent_configs_environment" ON "agent_configs" USING btree ("environment");
CREATE INDEX "idx_agent_configs_agent_type" ON "agent_configs" USING btree ("agent_type");
CREATE UNIQUE INDEX "idx_agent_configs_env_agent" ON "agent_configs" USING btree ("environment","agent_type");
CREATE INDEX "idx_agent_outputs_decision_id" ON "agent_outputs" USING btree ("decision_id");
CREATE INDEX "idx_agent_outputs_agent_type" ON "agent_outputs" USING btree ("agent_type");
CREATE INDEX "idx_agent_outputs_decision_agent" ON "agent_outputs" USING btree ("decision_id","agent_type");
CREATE INDEX "idx_alert_settings_user_id" ON "alert_settings" USING btree ("user_id");
CREATE INDEX "idx_alerts_severity" ON "alerts" USING btree ("severity");
CREATE INDEX "idx_alerts_type" ON "alerts" USING btree ("type");
CREATE INDEX "idx_alerts_acknowledged" ON "alerts" USING btree ("acknowledged");
CREATE INDEX "idx_alerts_created_at" ON "alerts" USING btree ("created_at");
CREATE INDEX "idx_alerts_environment" ON "alerts" USING btree ("environment");
CREATE INDEX "idx_alerts_unack_env" ON "alerts" USING btree ("environment","acknowledged") WHERE "alerts"."acknowledged" = false;
CREATE INDEX "idx_audit_log_user_id" ON "audit_log" USING btree ("user_id");
CREATE INDEX "idx_audit_log_timestamp" ON "audit_log" USING btree ("timestamp");
CREATE INDEX "idx_audit_log_action" ON "audit_log" USING btree ("action");
CREATE INDEX "idx_audit_log_environment" ON "audit_log" USING btree ("environment");
CREATE INDEX "idx_backtest_equity_backtest_id" ON "backtest_equity" USING btree ("backtest_id");
CREATE INDEX "idx_backtest_equity_timestamp" ON "backtest_equity" USING btree ("timestamp");
CREATE INDEX "idx_backtest_equity_bt_ts" ON "backtest_equity" USING btree ("backtest_id","timestamp");
CREATE INDEX "idx_backtest_trades_backtest_id" ON "backtest_trades" USING btree ("backtest_id");
CREATE INDEX "idx_backtest_trades_timestamp" ON "backtest_trades" USING btree ("timestamp");
CREATE INDEX "idx_backtest_trades_symbol" ON "backtest_trades" USING btree ("symbol");
CREATE INDEX "idx_backtest_trades_bt_ts" ON "backtest_trades" USING btree ("backtest_id","timestamp");
CREATE INDEX "idx_backtests_status" ON "backtests" USING btree ("status");
CREATE INDEX "idx_backtests_start_date" ON "backtests" USING btree ("start_date");
CREATE INDEX "idx_backtests_created_at" ON "backtests" USING btree ("created_at");
CREATE UNIQUE INDEX "idx_candles_symbol_timeframe_ts" ON "candles" USING btree ("symbol","timeframe","timestamp");
CREATE INDEX "idx_candles_timestamp" ON "candles" USING btree ("timestamp");
CREATE INDEX "idx_candles_symbol" ON "candles" USING btree ("symbol");
CREATE INDEX "idx_candles_timeframe" ON "candles" USING btree ("timeframe");
CREATE INDEX "idx_config_versions_environment" ON "config_versions" USING btree ("environment");
CREATE INDEX "idx_config_versions_active" ON "config_versions" USING btree ("active");
CREATE INDEX "idx_config_versions_created_at" ON "config_versions" USING btree ("created_at");
CREATE UNIQUE INDEX "idx_config_versions_env_active" ON "config_versions" USING btree ("environment") WHERE "config_versions"."active" = true;
CREATE INDEX "idx_constraints_config_environment" ON "constraints_config" USING btree ("environment");
CREATE INDEX "idx_constraints_config_status" ON "constraints_config" USING btree ("status");
CREATE INDEX "idx_constraints_config_env_status" ON "constraints_config" USING btree ("environment","status");
CREATE UNIQUE INDEX "idx_constraints_config_env_active" ON "constraints_config" USING btree ("environment") WHERE "constraints_config"."status" = 'active';
CREATE INDEX "idx_corporate_actions_symbol_date" ON "corporate_actions" USING btree ("symbol","ex_date");
CREATE INDEX "idx_corporate_actions_ex_date" ON "corporate_actions" USING btree ("ex_date");
CREATE INDEX "idx_corporate_actions_type" ON "corporate_actions" USING btree ("action_type");
CREATE UNIQUE INDEX "idx_corporate_actions_unique" ON "corporate_actions" USING btree ("symbol","action_type","ex_date");
CREATE INDEX "idx_corp_actions_symbol" ON "corporate_actions_indicators" USING btree ("symbol","date");
CREATE INDEX "idx_corp_actions_symbol_only" ON "corporate_actions_indicators" USING btree ("symbol");
CREATE INDEX "idx_cycle_events_cycle_id" ON "cycle_events" USING btree ("cycle_id");
CREATE INDEX "idx_cycle_events_type" ON "cycle_events" USING btree ("event_type");
CREATE INDEX "idx_cycle_events_timestamp" ON "cycle_events" USING btree ("timestamp");
CREATE INDEX "idx_cycle_events_agent" ON "cycle_events" USING btree ("cycle_id","agent_type");
CREATE INDEX "idx_cycle_events_agent_event" ON "cycle_events" USING btree ("cycle_id","agent_type","event_type");
CREATE INDEX "idx_cycles_environment" ON "cycles" USING btree ("environment");
CREATE INDEX "idx_cycles_status" ON "cycles" USING btree ("status");
CREATE INDEX "idx_cycles_started_at" ON "cycles" USING btree ("started_at");
CREATE INDEX "idx_cycles_env_status" ON "cycles" USING btree ("environment","status");
CREATE INDEX "idx_cycles_env_started" ON "cycles" USING btree ("environment","started_at");
CREATE INDEX "idx_decisions_cycle_id" ON "decisions" USING btree ("cycle_id");
CREATE INDEX "idx_decisions_symbol" ON "decisions" USING btree ("symbol");
CREATE INDEX "idx_decisions_status" ON "decisions" USING btree ("status");
CREATE INDEX "idx_decisions_created_at" ON "decisions" USING btree ("created_at");
CREATE INDEX "idx_decisions_symbol_created" ON "decisions" USING btree ("symbol","created_at");
CREATE INDEX "idx_decisions_environment" ON "decisions" USING btree ("environment");
CREATE INDEX "idx_exec_order_snapshots_broker_id" ON "execution_order_snapshots" USING btree ("broker_order_id");
CREATE INDEX "idx_exec_order_snapshots_env_status" ON "execution_order_snapshots" USING btree ("environment","status");
CREATE INDEX "idx_exec_position_snapshots_env" ON "execution_position_snapshots" USING btree ("environment");
CREATE INDEX "idx_external_events_event_time" ON "external_events" USING btree ("event_time");
CREATE INDEX "idx_external_events_source_type" ON "external_events" USING btree ("source_type");
CREATE INDEX "idx_external_events_event_type" ON "external_events" USING btree ("event_type");
CREATE INDEX "idx_external_events_processed_at" ON "external_events" USING btree ("processed_at");
CREATE INDEX "idx_external_events_sentiment" ON "external_events" USING btree ("sentiment");
CREATE INDEX "idx_external_events_importance" ON "external_events" USING btree ("importance_score");
CREATE INDEX "idx_factor_perf_factor_date" ON "factor_performance" USING btree ("factor_id","date");
CREATE INDEX "idx_factors_status" ON "factors" USING btree ("status");
CREATE INDEX "idx_factors_hypothesis" ON "factors" USING btree ("hypothesis_id");
CREATE INDEX "idx_factors_active" ON "factors" USING btree ("status") WHERE "factors"."status" IN ('active', 'decaying');
CREATE UNIQUE INDEX "idx_features_symbol_ts_indicator" ON "features" USING btree ("symbol","timestamp","timeframe","indicator_name");
CREATE INDEX "idx_features_symbol_indicator_ts" ON "features" USING btree ("symbol","indicator_name","timestamp");
CREATE INDEX "idx_features_timestamp" ON "features" USING btree ("timestamp");
CREATE INDEX "idx_features_indicator" ON "features" USING btree ("indicator_name");
CREATE INDEX "idx_filing_sync_runs_started_at" ON "filing_sync_runs" USING btree ("started_at");
CREATE INDEX "idx_filing_sync_runs_status" ON "filing_sync_runs" USING btree ("status");
CREATE INDEX "idx_filing_sync_runs_environment" ON "filing_sync_runs" USING btree ("environment");
CREATE INDEX "idx_filing_sync_runs_trigger" ON "filing_sync_runs" USING btree ("trigger_source");
CREATE INDEX "idx_filings_symbol" ON "filings" USING btree ("symbol");
CREATE INDEX "idx_filings_filing_type" ON "filings" USING btree ("filing_type");
CREATE INDEX "idx_filings_filed_date" ON "filings" USING btree ("filed_date");
CREATE INDEX "idx_filings_status" ON "filings" USING btree ("status");
CREATE INDEX "idx_filings_symbol_type" ON "filings" USING btree ("symbol","filing_type");
CREATE INDEX "idx_filings_symbol_date" ON "filings" USING btree ("symbol","filed_date");
CREATE INDEX "idx_fundamental_symbol_date" ON "fundamental_indicators" USING btree ("symbol","date");
CREATE INDEX "idx_fundamental_symbol" ON "fundamental_indicators" USING btree ("symbol");
CREATE INDEX "idx_hypotheses_status" ON "hypotheses" USING btree ("status");
CREATE INDEX "idx_index_constituents_pit" ON "index_constituents" USING btree ("index_id","date_added","date_removed");
CREATE INDEX "idx_index_constituents_symbol" ON "index_constituents" USING btree ("symbol","index_id");
CREATE INDEX "idx_index_constituents_current" ON "index_constituents" USING btree ("index_id","date_removed");
CREATE UNIQUE INDEX "idx_index_constituents_unique" ON "index_constituents" USING btree ("index_id","symbol","date_added");
CREATE INDEX "idx_ic_history_indicator_date" ON "indicator_ic_history" USING btree ("indicator_id","date");
CREATE INDEX "idx_ind_paper_signals_indicator" ON "indicator_paper_signals" USING btree ("indicator_id");
CREATE INDEX "idx_ind_paper_signals_symbol" ON "indicator_paper_signals" USING btree ("symbol");
CREATE INDEX "idx_ind_paper_signals_date" ON "indicator_paper_signals" USING btree ("signal_date");
CREATE INDEX "idx_indicator_sync_runs_type" ON "indicator_sync_runs" USING btree ("run_type");
CREATE INDEX "idx_indicator_sync_runs_status" ON "indicator_sync_runs" USING btree ("status");
CREATE INDEX "idx_indicator_sync_runs_started" ON "indicator_sync_runs" USING btree ("started_at");
CREATE INDEX "idx_trials_indicator" ON "indicator_trials" USING btree ("indicator_id");
CREATE INDEX "idx_indicators_status" ON "indicators" USING btree ("status");
CREATE INDEX "idx_indicators_category" ON "indicators" USING btree ("category");
CREATE INDEX "idx_indicators_code_hash" ON "indicators" USING btree ("code_hash");
CREATE INDEX "idx_indicators_active" ON "indicators" USING btree ("status") WHERE "indicators"."status" IN ('paper', 'production');
CREATE INDEX "idx_macro_watch_timestamp" ON "macro_watch_entries" USING btree ("timestamp");
CREATE INDEX "idx_macro_watch_category" ON "macro_watch_entries" USING btree ("category");
CREATE INDEX "idx_macro_watch_session" ON "macro_watch_entries" USING btree ("session");
CREATE INDEX "idx_morning_newspapers_date" ON "morning_newspapers" USING btree ("date");
CREATE INDEX "idx_options_cache_symbol" ON "options_indicators_cache" USING btree ("symbol");
CREATE INDEX "idx_options_cache_expires" ON "options_indicators_cache" USING btree ("expires_at");
CREATE INDEX "idx_orders_decision_id" ON "orders" USING btree ("decision_id");
CREATE INDEX "idx_orders_symbol" ON "orders" USING btree ("symbol");
CREATE INDEX "idx_orders_status" ON "orders" USING btree ("status");
CREATE INDEX "idx_orders_broker_order_id" ON "orders" USING btree ("broker_order_id");
CREATE INDEX "idx_orders_created_at" ON "orders" USING btree ("created_at");
CREATE INDEX "idx_orders_environment" ON "orders" USING btree ("environment");
CREATE INDEX "idx_paper_signals_factor" ON "paper_signals" USING btree ("factor_id");
CREATE INDEX "idx_paper_signals_date" ON "paper_signals" USING btree ("signal_date");
CREATE INDEX "idx_paper_signals_factor_date" ON "paper_signals" USING btree ("factor_id","signal_date");
CREATE INDEX "idx_parity_history_entity" ON "parity_validation_history" USING btree ("entity_type","entity_id");
CREATE INDEX "idx_parity_history_environment" ON "parity_validation_history" USING btree ("environment");
CREATE INDEX "idx_parity_history_passed" ON "parity_validation_history" USING btree ("passed");
CREATE INDEX "idx_parity_history_validated_at" ON "parity_validation_history" USING btree ("validated_at");
CREATE INDEX "idx_portfolio_snapshots_timestamp" ON "portfolio_snapshots" USING btree ("timestamp");
CREATE INDEX "idx_portfolio_snapshots_environment" ON "portfolio_snapshots" USING btree ("environment");
CREATE INDEX "idx_position_history_position_id" ON "position_history" USING btree ("position_id");
CREATE INDEX "idx_position_history_timestamp" ON "position_history" USING btree ("timestamp");
CREATE INDEX "idx_position_history_position_ts" ON "position_history" USING btree ("position_id","timestamp");
CREATE INDEX "idx_positions_symbol" ON "positions" USING btree ("symbol");
CREATE INDEX "idx_positions_thesis_id" ON "positions" USING btree ("thesis_id");
CREATE INDEX "idx_positions_decision_id" ON "positions" USING btree ("decision_id");
CREATE INDEX "idx_positions_status" ON "positions" USING btree ("status");
CREATE INDEX "idx_positions_environment" ON "positions" USING btree ("environment");
CREATE UNIQUE INDEX "idx_positions_symbol_env_open" ON "positions" USING btree ("symbol","environment") WHERE "positions"."closed_at" IS NULL;
CREATE INDEX "idx_pm_arbitrage_divergence" ON "prediction_market_arbitrage" USING btree ("divergence_pct");
CREATE INDEX "idx_pm_arbitrage_detected" ON "prediction_market_arbitrage" USING btree ("detected_at");
CREATE INDEX "idx_pm_arbitrage_unresolved" ON "prediction_market_arbitrage" USING btree ("resolved_at") WHERE "prediction_market_arbitrage"."resolved_at" IS NULL;
CREATE INDEX "idx_pm_signals_type" ON "prediction_market_signals" USING btree ("signal_type");
CREATE INDEX "idx_pm_signals_time" ON "prediction_market_signals" USING btree ("computed_at");
CREATE INDEX "idx_pm_snapshots_platform" ON "prediction_market_snapshots" USING btree ("platform");
CREATE INDEX "idx_pm_snapshots_ticker" ON "prediction_market_snapshots" USING btree ("market_ticker");
CREATE INDEX "idx_pm_snapshots_type" ON "prediction_market_snapshots" USING btree ("market_type");
CREATE INDEX "idx_pm_snapshots_time" ON "prediction_market_snapshots" USING btree ("snapshot_time");
CREATE UNIQUE INDEX "idx_regime_labels_symbol_ts_tf" ON "regime_labels" USING btree ("symbol","timestamp","timeframe");
CREATE INDEX "idx_regime_labels_symbol_ts" ON "regime_labels" USING btree ("symbol","timestamp");
CREATE INDEX "idx_regime_labels_regime" ON "regime_labels" USING btree ("regime");
CREATE INDEX "idx_regime_labels_market" ON "regime_labels" USING btree ("symbol","timestamp") WHERE "regime_labels"."symbol" = '_MARKET';
CREATE INDEX "idx_research_runs_phase" ON "research_runs" USING btree ("phase");
CREATE INDEX "idx_research_runs_trigger" ON "research_runs" USING btree ("trigger_type");
CREATE INDEX "idx_research_runs_hypothesis" ON "research_runs" USING btree ("hypothesis_id");
CREATE INDEX "idx_research_runs_factor" ON "research_runs" USING btree ("factor_id");
CREATE INDEX "idx_sentiment_symbol_date" ON "sentiment_indicators" USING btree ("symbol","date");
CREATE INDEX "idx_sentiment_symbol" ON "sentiment_indicators" USING btree ("symbol");
CREATE INDEX "idx_session_user_id" ON "session" USING btree ("user_id");
CREATE INDEX "idx_session_token" ON "session" USING btree ("token");
CREATE INDEX "idx_session_expires_at" ON "session" USING btree ("expires_at");
CREATE INDEX "idx_short_interest_symbol" ON "short_interest_indicators" USING btree ("symbol","settlement_date");
CREATE INDEX "idx_short_interest_settlement" ON "short_interest_indicators" USING btree ("settlement_date");
CREATE INDEX "idx_thesis_state_instrument" ON "thesis_state" USING btree ("instrument_id");
CREATE INDEX "idx_thesis_state_state" ON "thesis_state" USING btree ("state");
CREATE INDEX "idx_thesis_state_environment" ON "thesis_state" USING btree ("environment");
CREATE INDEX "idx_thesis_state_created_at" ON "thesis_state" USING btree ("created_at");
CREATE INDEX "idx_thesis_state_closed_at" ON "thesis_state" USING btree ("closed_at");
CREATE INDEX "idx_thesis_state_active" ON "thesis_state" USING btree ("environment","state") WHERE "thesis_state"."state" != 'CLOSED';
CREATE INDEX "idx_thesis_state_instrument_active" ON "thesis_state" USING btree ("instrument_id","environment") WHERE "thesis_state"."state" != 'CLOSED';
CREATE INDEX "idx_thesis_history_thesis_id" ON "thesis_state_history" USING btree ("thesis_id");
CREATE INDEX "idx_thesis_history_created_at" ON "thesis_state_history" USING btree ("created_at");
CREATE INDEX "idx_thesis_history_thesis_created" ON "thesis_state_history" USING btree ("thesis_id","created_at");
CREATE INDEX "idx_ticker_changes_old" ON "ticker_changes" USING btree ("old_symbol","change_date");
CREATE INDEX "idx_ticker_changes_new" ON "ticker_changes" USING btree ("new_symbol","change_date");
CREATE INDEX "idx_ticker_changes_date" ON "ticker_changes" USING btree ("change_date");
CREATE UNIQUE INDEX "idx_ticker_changes_unique" ON "ticker_changes" USING btree ("old_symbol","new_symbol","change_date");
CREATE INDEX "idx_trading_config_environment" ON "trading_config" USING btree ("environment");
CREATE INDEX "idx_trading_config_status" ON "trading_config" USING btree ("status");
CREATE INDEX "idx_trading_config_env_status" ON "trading_config" USING btree ("environment","status");
CREATE INDEX "idx_trading_config_created_at" ON "trading_config" USING btree ("created_at");
CREATE UNIQUE INDEX "idx_trading_config_env_active" ON "trading_config" USING btree ("environment") WHERE "trading_config"."status" = 'active';
CREATE INDEX "idx_two_factor_user_id" ON "two_factor" USING btree ("user_id");
CREATE INDEX "idx_two_factor_secret" ON "two_factor" USING btree ("secret");
CREATE UNIQUE INDEX "idx_universe_cache_source" ON "universe_cache" USING btree ("source_type","source_id");
CREATE INDEX "idx_universe_cache_expires" ON "universe_cache" USING btree ("expires_at");
CREATE INDEX "idx_universe_cache_hash" ON "universe_cache" USING btree ("source_hash");
CREATE INDEX "idx_universe_configs_environment" ON "universe_configs" USING btree ("environment");
CREATE INDEX "idx_universe_configs_status" ON "universe_configs" USING btree ("status");
CREATE INDEX "idx_universe_configs_env_status" ON "universe_configs" USING btree ("environment","status");
CREATE UNIQUE INDEX "idx_universe_configs_env_active" ON "universe_configs" USING btree ("environment") WHERE "universe_configs"."status" = 'active';
CREATE UNIQUE INDEX "idx_universe_snapshots_pit" ON "universe_snapshots" USING btree ("index_id","snapshot_date");
CREATE INDEX "idx_universe_snapshots_date" ON "universe_snapshots" USING btree ("snapshot_date");
CREATE INDEX "idx_user_email" ON "user" USING btree ("email");
CREATE INDEX "idx_user_created_at" ON "user" USING btree ("created_at");
CREATE INDEX "idx_user_preferences_user_id" ON "user_preferences" USING btree ("user_id");
CREATE INDEX "idx_user_preferences_created_at" ON "user_preferences" USING btree ("created_at");
CREATE INDEX "idx_verification_identifier" ON "verification" USING btree ("identifier");
CREATE INDEX "idx_verification_expires_at" ON "verification" USING btree ("expires_at");
-- ===========================================
-- Setup cream_test database (for CI/testing)
-- ===========================================
\c cream_test
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE "public"."agent_type" AS ENUM('technical', 'news_analyst', 'fundamentals_analyst', 'bullish_researcher', 'bearish_researcher', 'trader', 'risk_manager', 'critic');
CREATE TYPE "public"."agent_vote" AS ENUM('APPROVE', 'REJECT', 'ABSTAIN');
CREATE TYPE "public"."alert_severity" AS ENUM('info', 'warning', 'error', 'critical');
CREATE TYPE "public"."backtest_status" AS ENUM('pending', 'running', 'completed', 'failed');
CREATE TYPE "public"."chart_timeframe" AS ENUM('1D', '1W', '1M', '3M', '6M', '1Y', 'ALL');
CREATE TYPE "public"."config_status" AS ENUM('draft', 'testing', 'active', 'archived');
CREATE TYPE "public"."corporate_action_type" AS ENUM('split', 'dividend', 'merger', 'spinoff');
CREATE TYPE "public"."cycle_event_type" AS ENUM('phase_change', 'agent_start', 'agent_complete', 'decision', 'order', 'error');
CREATE TYPE "public"."cycle_phase" AS ENUM('observe', 'orient', 'decide', 'act', 'complete');
CREATE TYPE "public"."cycle_status" AS ENUM('running', 'completed', 'failed');
CREATE TYPE "public"."date_format" AS ENUM('MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD');
CREATE TYPE "public"."decision_action" AS ENUM('BUY', 'SELL', 'HOLD', 'CLOSE', 'INCREASE', 'REDUCE', 'NO_TRADE');
CREATE TYPE "public"."decision_direction" AS ENUM('LONG', 'SHORT', 'FLAT');
CREATE TYPE "public"."decision_status" AS ENUM('pending', 'approved', 'rejected', 'executed', 'cancelled', 'expired');
CREATE TYPE "public"."environment" AS ENUM('BACKTEST', 'PAPER', 'LIVE');
CREATE TYPE "public"."execution_recovery_status" AS ENUM('unknown', 'healthy', 'error', 'interrupted', 'needs_attention');
CREATE TYPE "public"."external_event_source" AS ENUM('news', 'earnings', 'sec_filing', 'fed');
CREATE TYPE "public"."factor_status" AS ENUM('research', 'stage1', 'stage2', 'paper', 'active', 'decaying', 'retired');
CREATE TYPE "public"."filing_status" AS ENUM('pending', 'processing', 'complete', 'failed');
CREATE TYPE "public"."filing_type" AS ENUM('10-K', '10-Q', '8-K', 'DEF14A');
CREATE TYPE "public"."hypothesis_status" AS ENUM('proposed', 'testing', 'validated', 'rejected');
CREATE TYPE "public"."index_id" AS ENUM('SP500', 'NDX100', 'DJIA');
CREATE TYPE "public"."indicator_category" AS ENUM('momentum', 'trend', 'volatility', 'volume', 'sentiment');
CREATE TYPE "public"."indicator_status" AS ENUM('staging', 'paper', 'production', 'retired');
CREATE TYPE "public"."macro_watch_category" AS ENUM('NEWS', 'PREDICTION', 'ECONOMIC', 'MOVER', 'EARNINGS');
CREATE TYPE "public"."macro_watch_session" AS ENUM('OVERNIGHT', 'PRE_MARKET', 'AFTER_HOURS');
CREATE TYPE "public"."order_side" AS ENUM('buy', 'sell');
CREATE TYPE "public"."order_status" AS ENUM('pending', 'submitted', 'accepted', 'partial_fill', 'filled', 'cancelled', 'rejected', 'expired');
CREATE TYPE "public"."order_type" AS ENUM('market', 'limit', 'stop', 'stop_limit');
CREATE TYPE "public"."parity_entity_type" AS ENUM('indicator', 'factor', 'config');
CREATE TYPE "public"."parity_recommendation" AS ENUM('APPROVE_FOR_LIVE', 'NEEDS_INVESTIGATION', 'NOT_READY');
CREATE TYPE "public"."portfolio_view" AS ENUM('table', 'cards');
CREATE TYPE "public"."position_side" AS ENUM('long', 'short');
CREATE TYPE "public"."position_status" AS ENUM('open', 'closed', 'pending');
CREATE TYPE "public"."prediction_market_platform" AS ENUM('kalshi', 'polymarket');
CREATE TYPE "public"."prediction_market_type" AS ENUM('rate', 'election', 'economic');
CREATE TYPE "public"."regime" AS ENUM('trending_up', 'trending_down', 'ranging', 'volatile');
CREATE TYPE "public"."research_phase" AS ENUM('idea', 'implementation', 'stage1', 'stage2', 'translation', 'equivalence', 'paper', 'promotion', 'completed', 'failed');
CREATE TYPE "public"."research_trigger_type" AS ENUM('scheduled', 'decay_detected', 'regime_change', 'manual', 'refinement');
CREATE TYPE "public"."sentiment" AS ENUM('positive', 'negative', 'neutral');
CREATE TYPE "public"."size_unit" AS ENUM('SHARES', 'CONTRACTS', 'DOLLARS', 'PCT_EQUITY');
CREATE TYPE "public"."sync_run_status" AS ENUM('running', 'completed', 'failed');
CREATE TYPE "public"."sync_trigger_source" AS ENUM('scheduled', 'manual', 'dashboard');
CREATE TYPE "public"."system_status" AS ENUM('stopped', 'running', 'paused', 'error');
CREATE TYPE "public"."theme" AS ENUM('light', 'dark', 'system');
CREATE TYPE "public"."thesis_state_value" AS ENUM('WATCHING', 'STAGED', 'OPEN', 'SCALING', 'EXITING', 'CLOSED');
CREATE TYPE "public"."ticker_change_type" AS ENUM('rename', 'merger', 'spinoff', 'delisted');
CREATE TYPE "public"."time_format" AS ENUM('12h', '24h');
CREATE TYPE "public"."time_in_force" AS ENUM('day', 'gtc', 'ioc', 'fok');
CREATE TYPE "public"."timeframe" AS ENUM('1m', '5m', '15m', '1h', '1d');
CREATE TYPE "public"."universe_source" AS ENUM('static', 'index', 'screener');
CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" bigint,
	"refresh_token_expires_at" bigint,
	"scope" text,
	"password" text,
	"created_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL,
	"updated_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL
);

CREATE TABLE "agent_configs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"environment" "environment" NOT NULL,
	"agent_type" "agent_type" NOT NULL,
	"system_prompt_override" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "agent_outputs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"decision_id" uuid NOT NULL,
	"agent_type" "agent_type" NOT NULL,
	"vote" "agent_vote" NOT NULL,
	"confidence" numeric(4, 3) NOT NULL,
	"reasoning_summary" text,
	"full_reasoning" text,
	"tokens_used" integer,
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "valid_confidence" CHECK ("agent_outputs"."confidence"::numeric >= 0 AND "agent_outputs"."confidence"::numeric <= 1)
);

CREATE TABLE "alert_settings" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"enable_push" boolean DEFAULT true NOT NULL,
	"enable_email" boolean DEFAULT true NOT NULL,
	"email_address" text,
	"critical_only" boolean DEFAULT false NOT NULL,
	"quiet_hours_start" text,
	"quiet_hours_end" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alert_settings_user_id_unique" UNIQUE("user_id")
);

CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"severity" "alert_severity" NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"metadata" jsonb,
	"acknowledged" boolean DEFAULT false NOT NULL,
	"acknowledged_by" text,
	"acknowledged_at" timestamp with time zone,
	"environment" "environment" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);

CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	"user_email" text NOT NULL,
	"action" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"environment" "environment" DEFAULT 'LIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "backtest_equity" (
	"id" serial PRIMARY KEY NOT NULL,
	"backtest_id" uuid NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"nav" numeric(16, 2) NOT NULL,
	"cash" numeric(16, 2) NOT NULL,
	"equity" numeric(16, 2) NOT NULL,
	"drawdown" numeric(14, 2),
	"drawdown_pct" numeric(8, 4),
	"day_return_pct" numeric(8, 4),
	"cumulative_return_pct" numeric(8, 4)
);

CREATE TABLE "backtest_trades" (
	"id" serial PRIMARY KEY NOT NULL,
	"backtest_id" uuid NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"symbol" text NOT NULL,
	"action" text NOT NULL,
	"qty" numeric(14, 4) NOT NULL,
	"price" numeric(12, 4) NOT NULL,
	"commission" numeric(10, 4) DEFAULT '0',
	"pnl" numeric(14, 2),
	"pnl_pct" numeric(8, 4),
	"decision_rationale" text
);

CREATE TABLE "backtests" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"initial_capital" numeric(16, 2) NOT NULL,
	"universe" text,
	"config_json" jsonb,
	"status" "backtest_status" DEFAULT 'pending' NOT NULL,
	"progress_pct" numeric(5, 2) DEFAULT '0',
	"total_return" numeric(8, 4),
	"cagr" numeric(8, 4),
	"sharpe_ratio" numeric(8, 4),
	"sortino_ratio" numeric(8, 4),
	"calmar_ratio" numeric(8, 4),
	"max_drawdown" numeric(8, 4),
	"win_rate" numeric(5, 4),
	"profit_factor" numeric(8, 4),
	"total_trades" integer,
	"avg_trade_pnl" numeric(14, 2),
	"metrics_json" jsonb,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_by" text
);

CREATE TABLE "candles" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"timeframe" timeframe NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"open" numeric(12, 4) NOT NULL,
	"high" numeric(12, 4) NOT NULL,
	"low" numeric(12, 4) NOT NULL,
	"close" numeric(12, 4) NOT NULL,
	"volume" numeric(18, 0) DEFAULT '0' NOT NULL,
	"vwap" numeric(12, 4),
	"trade_count" integer,
	"adjusted" boolean DEFAULT false NOT NULL,
	"split_adjusted" boolean DEFAULT false NOT NULL,
	"dividend_adjusted" boolean DEFAULT false NOT NULL,
	"quality_flags" jsonb DEFAULT '[]'::jsonb,
	"provider" text DEFAULT 'alpaca' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "valid_ohlc" CHECK ("candles"."high"::numeric >= "candles"."low"::numeric AND
          "candles"."high"::numeric >= "candles"."open"::numeric AND
          "candles"."high"::numeric >= "candles"."close"::numeric AND
          "candles"."low"::numeric <= "candles"."open"::numeric AND
          "candles"."low"::numeric <= "candles"."close"::numeric),
	CONSTRAINT "positive_volume" CHECK ("candles"."volume"::numeric >= 0)
);

CREATE TABLE "config_versions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"environment" "environment" NOT NULL,
	"config_json" jsonb NOT NULL,
	"description" text,
	"active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"activated_at" timestamp with time zone,
	"deactivated_at" timestamp with time zone
);

CREATE TABLE "constraints_config" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"environment" "environment" NOT NULL,
	"max_shares" integer DEFAULT 1000 NOT NULL,
	"max_contracts" integer DEFAULT 10 NOT NULL,
	"max_notional" numeric(14, 2) DEFAULT '50000' NOT NULL,
	"max_pct_equity" numeric(4, 3) DEFAULT '0.1' NOT NULL,
	"max_gross_exposure" numeric(4, 2) DEFAULT '2.0' NOT NULL,
	"max_net_exposure" numeric(4, 2) DEFAULT '1.0' NOT NULL,
	"max_concentration" numeric(4, 3) DEFAULT '0.25' NOT NULL,
	"max_correlation" numeric(4, 3) DEFAULT '0.7' NOT NULL,
	"max_drawdown" numeric(4, 3) DEFAULT '0.15' NOT NULL,
	"max_delta" numeric(8, 2) DEFAULT '100' NOT NULL,
	"max_gamma" numeric(8, 2) DEFAULT '50' NOT NULL,
	"max_vega" numeric(10, 2) DEFAULT '1000' NOT NULL,
	"max_theta" numeric(10, 2) DEFAULT '500' NOT NULL,
	"status" "config_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "valid_exposure" CHECK ("constraints_config"."max_gross_exposure"::numeric > 0)
);

CREATE TABLE "corporate_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"action_type" "corporate_action_type" NOT NULL,
	"ex_date" timestamp with time zone NOT NULL,
	"record_date" timestamp with time zone,
	"pay_date" timestamp with time zone,
	"ratio" numeric(10, 6),
	"amount" numeric(12, 4),
	"details" text,
	"provider" text DEFAULT 'alpaca' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "corporate_actions_indicators" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"symbol" text NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"trailing_dividend_yield" numeric(8, 4),
	"ex_dividend_days" integer,
	"upcoming_earnings_days" integer,
	"recent_split" boolean DEFAULT false,
	"split_ratio" text,
	CONSTRAINT "corp_actions_indicators_symbol_date" UNIQUE("symbol","date")
);

CREATE TABLE "cycle_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"cycle_id" uuid NOT NULL,
	"event_type" "cycle_event_type" NOT NULL,
	"phase" "cycle_phase",
	"agent_type" "agent_type",
	"symbol" text,
	"message" text,
	"data_json" jsonb,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"duration_ms" integer
);

CREATE TABLE "cycles" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"environment" "environment" NOT NULL,
	"status" "cycle_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"duration_ms" integer,
	"current_phase" "cycle_phase",
	"phase_started_at" timestamp with time zone,
	"total_symbols" integer DEFAULT 0,
	"completed_symbols" integer DEFAULT 0,
	"progress_pct" numeric(5, 2) DEFAULT '0',
	"approved" boolean,
	"iterations" integer,
	"decisions_count" integer DEFAULT 0,
	"orders_count" integer DEFAULT 0,
	"decisions_json" jsonb,
	"orders_json" jsonb,
	"error_message" text,
	"error_stack" text,
	"config_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "decisions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"cycle_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"action" "decision_action" NOT NULL,
	"direction" "decision_direction" NOT NULL,
	"size" numeric(14, 4) NOT NULL,
	"size_unit" "size_unit" DEFAULT 'SHARES' NOT NULL,
	"entry_price" numeric(12, 4),
	"stop_loss" numeric(12, 4),
	"take_profit" numeric(12, 4),
	"stop_price" numeric(12, 4),
	"target_price" numeric(12, 4),
	"strategy_family" text,
	"time_horizon" text,
	"bullish_factors" jsonb DEFAULT '[]'::jsonb,
	"bearish_factors" jsonb DEFAULT '[]'::jsonb,
	"confidence_score" numeric(4, 3),
	"risk_score" numeric(4, 3),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"status" "decision_status" DEFAULT 'pending' NOT NULL,
	"rationale" text,
	"environment" "environment" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"executed_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	CONSTRAINT "positive_size" CHECK ("decisions"."size"::numeric > 0),
	CONSTRAINT "valid_confidence" CHECK ("decisions"."confidence_score" IS NULL OR ("decisions"."confidence_score"::numeric >= 0 AND "decisions"."confidence_score"::numeric <= 1)),
	CONSTRAINT "valid_risk" CHECK ("decisions"."risk_score" IS NULL OR ("decisions"."risk_score"::numeric >= 0 AND "decisions"."risk_score"::numeric <= 1))
);

CREATE TABLE "execution_order_snapshots" (
	"order_id" text PRIMARY KEY NOT NULL,
	"broker_order_id" text NOT NULL,
	"instrument_id" text NOT NULL,
	"status" text NOT NULL,
	"side" text NOT NULL,
	"order_type" text NOT NULL,
	"time_in_force" text NOT NULL,
	"requested_quantity" numeric(14, 4) NOT NULL,
	"filled_quantity" numeric(14, 4) NOT NULL,
	"avg_fill_price" numeric(12, 4) NOT NULL,
	"limit_price" numeric(12, 4),
	"stop_price" numeric(12, 4),
	"submitted_at" text NOT NULL,
	"last_update_at" text NOT NULL,
	"status_message" text,
	"is_multi_leg" boolean DEFAULT false NOT NULL,
	"environment" "environment" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "execution_position_snapshots" (
	"symbol" text PRIMARY KEY NOT NULL,
	"quantity" numeric(14, 4) NOT NULL,
	"avg_entry_price" numeric(12, 4) NOT NULL,
	"environment" "environment" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "execution_recovery_state" (
	"environment" "environment" PRIMARY KEY NOT NULL,
	"last_snapshot_at" timestamp with time zone,
	"last_reconciliation_at" timestamp with time zone,
	"last_cycle_id" text,
	"status" "execution_recovery_status" DEFAULT 'unknown' NOT NULL,
	"error_message" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "external_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"source_type" "external_event_source" NOT NULL,
	"event_type" text NOT NULL,
	"event_time" timestamp with time zone NOT NULL,
	"processed_at" timestamp with time zone NOT NULL,
	"sentiment" "sentiment" NOT NULL,
	"confidence" numeric(4, 3) NOT NULL,
	"importance" integer NOT NULL,
	"summary" text NOT NULL,
	"key_insights" jsonb NOT NULL,
	"entities" jsonb NOT NULL,
	"data_points" jsonb NOT NULL,
	"sentiment_score" numeric(5, 4) NOT NULL,
	"importance_score" numeric(5, 4) NOT NULL,
	"surprise_score" numeric(5, 4) NOT NULL,
	"related_instruments" jsonb NOT NULL,
	"original_content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE "factor_correlations" (
	"factor_id_1" uuid NOT NULL,
	"factor_id_2" uuid NOT NULL,
	"correlation" numeric(5, 4) NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "factor_correlations_factor_id_1_factor_id_2_pk" PRIMARY KEY("factor_id_1","factor_id_2")
);

CREATE TABLE "factor_performance" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"factor_id" uuid NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"ic" numeric(6, 4) NOT NULL,
	"icir" numeric(8, 4),
	"sharpe" numeric(8, 4),
	"weight" numeric(6, 4) DEFAULT '0.0' NOT NULL,
	"signal_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "factor_performance_factor_date" UNIQUE("factor_id","date")
);

CREATE TABLE "factor_weights" (
	"factor_id" uuid PRIMARY KEY NOT NULL,
	"weight" numeric(6, 4) DEFAULT '0.0' NOT NULL,
	"last_ic" numeric(6, 4),
	"last_updated" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "factors" (
	"factor_id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"hypothesis_id" uuid,
	"name" text NOT NULL,
	"status" "factor_status" DEFAULT 'research' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"author" text DEFAULT 'claude-code' NOT NULL,
	"python_module" text,
	"typescript_module" text,
	"symbolic_length" integer,
	"parameter_count" integer,
	"feature_count" integer,
	"originality_score" numeric(5, 4),
	"hypothesis_alignment" numeric(5, 4),
	"stage1_sharpe" numeric(8, 4),
	"stage1_ic" numeric(6, 4),
	"stage1_max_drawdown" numeric(6, 4),
	"stage1_completed_at" timestamp with time zone,
	"stage2_pbo" numeric(6, 4),
	"stage2_dsr_pvalue" numeric(6, 4),
	"stage2_wfe" numeric(6, 4),
	"stage2_completed_at" timestamp with time zone,
	"paper_validation_passed" integer DEFAULT 0,
	"paper_start_date" timestamp with time zone,
	"paper_end_date" timestamp with time zone,
	"paper_realized_sharpe" numeric(8, 4),
	"paper_realized_ic" numeric(6, 4),
	"current_weight" numeric(6, 4) DEFAULT '0.0',
	"last_ic" numeric(6, 4),
	"decay_rate" numeric(6, 4),
	"target_regimes" jsonb,
	"parity_report" text,
	"parity_validated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"promoted_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"last_updated" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "factors_name_unique" UNIQUE("name")
);

CREATE TABLE "features" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"timeframe" timeframe NOT NULL,
	"indicator_name" text NOT NULL,
	"raw_value" numeric(18, 8) NOT NULL,
	"normalized_value" numeric(8, 6),
	"parameters" jsonb,
	"quality_score" numeric(4, 3),
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "filing_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"symbols_requested" jsonb NOT NULL,
	"filing_types" jsonb NOT NULL,
	"date_range_start" timestamp with time zone,
	"date_range_end" timestamp with time zone,
	"symbols_total" integer DEFAULT 0,
	"symbols_processed" integer DEFAULT 0,
	"filings_fetched" integer DEFAULT 0,
	"filings_ingested" integer DEFAULT 0,
	"chunks_created" integer DEFAULT 0,
	"status" "sync_run_status" DEFAULT 'running' NOT NULL,
	"error_message" text,
	"trigger_source" "sync_trigger_source" NOT NULL,
	"environment" "environment" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "filings" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"accession_number" text NOT NULL,
	"symbol" text NOT NULL,
	"filing_type" "filing_type" NOT NULL,
	"filed_date" timestamp with time zone NOT NULL,
	"report_date" timestamp with time zone,
	"company_name" text,
	"cik" text,
	"section_count" integer DEFAULT 0,
	"chunk_count" integer DEFAULT 0,
	"status" "filing_status" DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"ingested_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "filings_accession_number_unique" UNIQUE("accession_number")
);

CREATE TABLE "fundamental_indicators" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"symbol" text NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"pe_ratio_ttm" numeric(10, 2),
	"pe_ratio_forward" numeric(10, 2),
	"pb_ratio" numeric(10, 2),
	"ev_ebitda" numeric(10, 2),
	"earnings_yield" numeric(8, 4),
	"dividend_yield" numeric(8, 4),
	"cape_10yr" numeric(10, 2),
	"gross_profitability" numeric(8, 4),
	"roe" numeric(8, 4),
	"roa" numeric(8, 4),
	"asset_growth" numeric(8, 4),
	"accruals_ratio" numeric(8, 4),
	"cash_flow_quality" numeric(8, 4),
	"beneish_m_score" numeric(8, 4),
	"market_cap" numeric(18, 2),
	"sector" text,
	"industry" text,
	"source" text DEFAULT 'computed' NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fundamental_indicators_symbol_date" UNIQUE("symbol","date")
);

CREATE TABLE "hypotheses" (
	"hypothesis_id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"title" text NOT NULL,
	"economic_rationale" text NOT NULL,
	"market_mechanism" text NOT NULL,
	"target_regime" text,
	"falsification_criteria" text,
	"status" "hypothesis_status" DEFAULT 'proposed' NOT NULL,
	"iteration" integer DEFAULT 1 NOT NULL,
	"parent_hypothesis_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "index_constituents" (
	"id" serial PRIMARY KEY NOT NULL,
	"index_id" text NOT NULL,
	"symbol" text NOT NULL,
	"date_added" timestamp with time zone NOT NULL,
	"date_removed" timestamp with time zone,
	"reason_added" text,
	"reason_removed" text,
	"sector" text,
	"industry" text,
	"market_cap_at_add" numeric(18, 2),
	"provider" text DEFAULT 'alpaca' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "indicator_ic_history" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"indicator_id" uuid NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"ic_value" numeric(6, 4) NOT NULL,
	"ic_std" numeric(6, 4) NOT NULL,
	"decisions_used_in" integer DEFAULT 0 NOT NULL,
	"decisions_correct" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "indicator_ic_history_indicator_date" UNIQUE("indicator_id","date")
);

CREATE TABLE "indicator_paper_signals" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"indicator_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"signal_date" timestamp with time zone NOT NULL,
	"signal" numeric(5, 4) NOT NULL,
	"outcome" numeric(8, 4),
	"outcome_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "indicator_paper_signals_unique" UNIQUE("indicator_id","symbol","signal_date")
);

CREATE TABLE "indicator_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"run_type" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"symbols_processed" integer DEFAULT 0,
	"symbols_failed" integer DEFAULT 0,
	"status" "sync_run_status" DEFAULT 'running' NOT NULL,
	"error_message" text,
	"environment" "environment" NOT NULL
);

CREATE TABLE "indicator_trials" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"indicator_id" uuid NOT NULL,
	"trial_number" integer NOT NULL,
	"hypothesis" text NOT NULL,
	"parameters" jsonb NOT NULL,
	"sharpe_ratio" numeric(8, 4),
	"information_coefficient" numeric(6, 4),
	"max_drawdown" numeric(6, 4),
	"calmar_ratio" numeric(8, 4),
	"sortino_ratio" numeric(8, 4),
	"selected" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "indicator_trials_indicator_trial" UNIQUE("indicator_id","trial_number")
);

CREATE TABLE "indicators" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"category" "indicator_category" NOT NULL,
	"status" "indicator_status" DEFAULT 'staging' NOT NULL,
	"hypothesis" text NOT NULL,
	"economic_rationale" text NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"generated_by" text NOT NULL,
	"code_hash" text,
	"ast_signature" text,
	"validation_report" text,
	"paper_trading_start" timestamp with time zone,
	"paper_trading_end" timestamp with time zone,
	"paper_trading_report" text,
	"promoted_at" timestamp with time zone,
	"pr_url" text,
	"merged_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"retirement_reason" text,
	"similar_to" uuid,
	"replaces" uuid,
	"parity_report" text,
	"parity_validated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "indicators_name_unique" UNIQUE("name")
);

CREATE TABLE "macro_watch_entries" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"session" "macro_watch_session" NOT NULL,
	"category" "macro_watch_category" NOT NULL,
	"headline" text NOT NULL,
	"symbols" jsonb NOT NULL,
	"source" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE "morning_newspapers" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"date" text NOT NULL,
	"compiled_at" timestamp with time zone NOT NULL,
	"sections" jsonb NOT NULL,
	"raw_entry_ids" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "morning_newspapers_date_unique" UNIQUE("date")
);

CREATE TABLE "options_indicators_cache" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"symbol" text NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"implied_volatility" numeric(8, 4),
	"iv_percentile_30d" numeric(5, 2),
	"iv_skew" numeric(8, 4),
	"put_call_ratio" numeric(8, 4),
	"vrp" numeric(8, 4),
	"term_structure_slope" numeric(8, 4),
	"net_delta" numeric(12, 4),
	"net_gamma" numeric(12, 4),
	"net_theta" numeric(12, 4),
	"net_vega" numeric(12, 4),
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "options_indicators_cache_symbol_unique" UNIQUE("symbol")
);

CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"decision_id" uuid,
	"symbol" text NOT NULL,
	"side" "order_side" NOT NULL,
	"qty" numeric(14, 4) NOT NULL,
	"order_type" "order_type" NOT NULL,
	"limit_price" numeric(12, 4),
	"stop_price" numeric(12, 4),
	"time_in_force" time_in_force DEFAULT 'day' NOT NULL,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"broker_order_id" text,
	"filled_qty" numeric(14, 4) DEFAULT '0',
	"filled_avg_price" numeric(12, 4),
	"commission" numeric(10, 4),
	"environment" "environment" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"filled_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "positive_quantity" CHECK ("orders"."qty"::numeric > 0)
);

CREATE TABLE "paper_signals" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"factor_id" uuid NOT NULL,
	"signal_date" timestamp with time zone NOT NULL,
	"symbol" text NOT NULL,
	"signal_value" numeric(8, 4) NOT NULL,
	"direction" text NOT NULL,
	"entry_price" numeric(12, 4),
	"exit_price" numeric(12, 4),
	"actual_return" numeric(8, 4),
	"predicted_return" numeric(8, 4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "paper_signals_factor_date_symbol" UNIQUE("factor_id","signal_date","symbol")
);

CREATE TABLE "parity_validation_history" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"entity_type" "parity_entity_type" NOT NULL,
	"entity_id" text NOT NULL,
	"environment" "environment" NOT NULL,
	"passed" boolean NOT NULL,
	"recommendation" "parity_recommendation" NOT NULL,
	"blocking_issues" jsonb,
	"warnings" jsonb,
	"full_report" jsonb NOT NULL,
	"validated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "portfolio_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"environment" "environment" NOT NULL,
	"nav" numeric(16, 2) NOT NULL,
	"cash" numeric(16, 2) NOT NULL,
	"equity" numeric(16, 2) NOT NULL,
	"gross_exposure" numeric(8, 4) NOT NULL,
	"net_exposure" numeric(8, 4) NOT NULL,
	"long_exposure" numeric(8, 4),
	"short_exposure" numeric(8, 4),
	"open_positions" integer,
	"day_pnl" numeric(14, 2),
	"day_return_pct" numeric(8, 4),
	"total_return_pct" numeric(8, 4),
	"max_drawdown" numeric(8, 4),
	CONSTRAINT "portfolio_snapshots_timestamp_env" UNIQUE("timestamp","environment")
);

CREATE TABLE "position_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"position_id" uuid NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"price" numeric(12, 4) NOT NULL,
	"qty" numeric(14, 4) NOT NULL,
	"unrealized_pnl" numeric(14, 2),
	"market_value" numeric(14, 2)
);

CREATE TABLE "positions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"symbol" text NOT NULL,
	"side" "position_side" NOT NULL,
	"qty" numeric(14, 4) NOT NULL,
	"avg_entry" numeric(12, 4) NOT NULL,
	"current_price" numeric(12, 4),
	"unrealized_pnl" numeric(14, 2),
	"unrealized_pnl_pct" numeric(8, 4),
	"realized_pnl" numeric(14, 2) DEFAULT '0',
	"market_value" numeric(14, 2),
	"cost_basis" numeric(14, 2),
	"thesis_id" uuid,
	"decision_id" uuid,
	"status" "position_status" DEFAULT 'open' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"environment" "environment" NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "positive_quantity" CHECK ("positions"."qty"::numeric > 0),
	CONSTRAINT "positive_entry" CHECK ("positions"."avg_entry"::numeric > 0)
);

CREATE TABLE "prediction_market_arbitrage" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"kalshi_ticker" text NOT NULL,
	"polymarket_token" text NOT NULL,
	"kalshi_price" numeric(6, 4) NOT NULL,
	"polymarket_price" numeric(6, 4) NOT NULL,
	"divergence_pct" numeric(6, 4) NOT NULL,
	"market_type" "prediction_market_type" NOT NULL,
	"detected_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolution_price" numeric(6, 4),
	"created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE "prediction_market_signals" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"signal_type" text NOT NULL,
	"signal_value" numeric(8, 4) NOT NULL,
	"confidence" numeric(4, 3),
	"computed_at" timestamp with time zone NOT NULL,
	"inputs" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE "prediction_market_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"platform" "prediction_market_platform" NOT NULL,
	"market_ticker" text NOT NULL,
	"market_type" "prediction_market_type" NOT NULL,
	"market_question" text,
	"snapshot_time" timestamp with time zone NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE "regime_labels" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"timeframe" timeframe NOT NULL,
	"regime" "regime" NOT NULL,
	"confidence" numeric(4, 3) NOT NULL,
	"trend_strength" numeric(4, 3),
	"volatility_percentile" numeric(5, 2),
	"correlation_to_market" numeric(4, 3),
	"model_name" text DEFAULT 'hmm_regime' NOT NULL,
	"model_version" text,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "research_runs" (
	"run_id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"trigger_type" "research_trigger_type" NOT NULL,
	"trigger_reason" text NOT NULL,
	"phase" "research_phase" DEFAULT 'idea' NOT NULL,
	"current_iteration" integer DEFAULT 1 NOT NULL,
	"hypothesis_id" uuid,
	"factor_id" uuid,
	"pr_url" text,
	"error_message" text,
	"tokens_used" integer DEFAULT 0,
	"compute_hours" numeric(8, 2) DEFAULT '0.0',
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);

CREATE TABLE "sentiment_indicators" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"symbol" text NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"sentiment_score" numeric(5, 4),
	"sentiment_strength" numeric(5, 4),
	"news_volume" integer,
	"sentiment_momentum" numeric(5, 4),
	"event_risk_flag" boolean DEFAULT false,
	"news_sentiment" numeric(5, 4),
	"social_sentiment" numeric(5, 4),
	"analyst_sentiment" numeric(5, 4),
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sentiment_indicators_symbol_date" UNIQUE("symbol","date")
);

CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"expires_at" bigint NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	"created_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL,
	"updated_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);

CREATE TABLE "short_interest_indicators" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"symbol" text NOT NULL,
	"settlement_date" timestamp with time zone NOT NULL,
	"short_interest" numeric(18, 0) NOT NULL,
	"short_interest_ratio" numeric(8, 2),
	"days_to_cover" numeric(8, 2),
	"short_pct_float" numeric(8, 4),
	"short_interest_change" numeric(8, 4),
	"source" text DEFAULT 'FINRA' NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "short_interest_symbol_date" UNIQUE("symbol","settlement_date")
);

CREATE TABLE "system_state" (
	"environment" "environment" PRIMARY KEY NOT NULL,
	"status" "system_status" DEFAULT 'stopped' NOT NULL,
	"last_cycle_id" uuid,
	"last_cycle_time" timestamp with time zone,
	"current_phase" text,
	"phase_started_at" timestamp with time zone,
	"next_cycle_at" timestamp with time zone,
	"error_message" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "thesis_state" (
	"thesis_id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"instrument_id" text NOT NULL,
	"state" "thesis_state_value" NOT NULL,
	"entry_price" numeric(12, 4),
	"entry_date" timestamp with time zone,
	"current_stop" numeric(12, 4),
	"current_target" numeric(12, 4),
	"conviction" numeric(4, 3),
	"entry_thesis" text,
	"invalidation_conditions" text,
	"add_count" integer DEFAULT 0 NOT NULL,
	"max_position_reached" integer DEFAULT 0 NOT NULL,
	"peak_unrealized_pnl" numeric(14, 2),
	"close_reason" text,
	"exit_price" numeric(12, 4),
	"realized_pnl" numeric(14, 2),
	"realized_pnl_pct" numeric(8, 4),
	"environment" "environment" NOT NULL,
	"notes" text,
	"last_updated" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);

CREATE TABLE "thesis_state_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"thesis_id" uuid NOT NULL,
	"from_state" "thesis_state_value" NOT NULL,
	"to_state" "thesis_state_value" NOT NULL,
	"trigger_reason" text,
	"cycle_id" uuid,
	"price_at_transition" numeric(12, 4),
	"conviction_at_transition" numeric(4, 3),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "ticker_changes" (
	"id" serial PRIMARY KEY NOT NULL,
	"old_symbol" text NOT NULL,
	"new_symbol" text NOT NULL,
	"change_date" timestamp with time zone NOT NULL,
	"change_type" "ticker_change_type" NOT NULL,
	"conversion_ratio" numeric(10, 6),
	"reason" text,
	"acquiring_company" text,
	"provider" text DEFAULT 'alpaca' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "trading_config" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"environment" "environment" NOT NULL,
	"version" integer NOT NULL,
	"max_consensus_iterations" integer DEFAULT 3,
	"agent_timeout_ms" integer DEFAULT 30000,
	"total_consensus_timeout_ms" integer DEFAULT 300000,
	"conviction_delta_hold" numeric(4, 3) DEFAULT '0.2',
	"conviction_delta_action" numeric(4, 3) DEFAULT '0.3',
	"high_conviction_pct" numeric(4, 3) DEFAULT '0.7',
	"medium_conviction_pct" numeric(4, 3) DEFAULT '0.5',
	"low_conviction_pct" numeric(4, 3) DEFAULT '0.25',
	"min_risk_reward_ratio" numeric(4, 2) DEFAULT '1.5',
	"kelly_fraction" numeric(4, 3) DEFAULT '0.5',
	"trading_cycle_interval_ms" integer DEFAULT 3600000,
	"prediction_markets_interval_ms" integer DEFAULT 900000,
	"global_model" text DEFAULT 'gemini-3-flash-preview' NOT NULL,
	"status" "config_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"promoted_from" uuid,
	CONSTRAINT "valid_kelly" CHECK ("trading_config"."kelly_fraction"::numeric > 0 AND "trading_config"."kelly_fraction"::numeric <= 1)
);

CREATE TABLE "two_factor" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" uuid NOT NULL
);

CREATE TABLE "universe_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"source_hash" text NOT NULL,
	"tickers" jsonb NOT NULL,
	"ticker_count" integer NOT NULL,
	"metadata" jsonb,
	"cached_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"provider" text
);

CREATE TABLE "universe_configs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"environment" "environment" NOT NULL,
	"source" "universe_source" NOT NULL,
	"static_symbols" jsonb,
	"index_source" text,
	"min_volume" integer,
	"min_market_cap" integer,
	"optionable_only" boolean DEFAULT false NOT NULL,
	"include_list" jsonb DEFAULT '[]'::jsonb,
	"exclude_list" jsonb DEFAULT '[]'::jsonb,
	"status" "config_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "universe_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"snapshot_date" timestamp with time zone NOT NULL,
	"index_id" text NOT NULL,
	"tickers" jsonb NOT NULL,
	"ticker_count" integer NOT NULL,
	"source_version" text,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);

CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"two_factor_enabled" boolean DEFAULT false,
	"created_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL,
	"updated_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);

CREATE TABLE "user_preferences" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"theme" "theme" DEFAULT 'system' NOT NULL,
	"chart_timeframe" chart_timeframe DEFAULT '1M' NOT NULL,
	"feed_filters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sidebar_collapsed" boolean DEFAULT false NOT NULL,
	"notification_settings" jsonb DEFAULT '{"emailAlerts":true,"pushNotifications":false,"tradeConfirmations":true,"dailySummary":true,"riskAlerts":true}'::jsonb NOT NULL,
	"default_portfolio_view" "portfolio_view" DEFAULT 'table' NOT NULL,
	"date_format" date_format DEFAULT 'MM/DD/YYYY' NOT NULL,
	"time_format" time_format DEFAULT '12h' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_user_id_unique" UNIQUE("user_id")
);

CREATE TABLE "verification" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"created_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL,
	"updated_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL
);

ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "agent_outputs" ADD CONSTRAINT "agent_outputs_decision_id_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."decisions"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "alert_settings" ADD CONSTRAINT "alert_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "backtest_equity" ADD CONSTRAINT "backtest_equity_backtest_id_backtests_id_fk" FOREIGN KEY ("backtest_id") REFERENCES "public"."backtests"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "backtest_trades" ADD CONSTRAINT "backtest_trades_backtest_id_backtests_id_fk" FOREIGN KEY ("backtest_id") REFERENCES "public"."backtests"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "cycle_events" ADD CONSTRAINT "cycle_events_cycle_id_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "factor_correlations" ADD CONSTRAINT "factor_correlations_factor_id_1_factors_factor_id_fk" FOREIGN KEY ("factor_id_1") REFERENCES "public"."factors"("factor_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "factor_correlations" ADD CONSTRAINT "factor_correlations_factor_id_2_factors_factor_id_fk" FOREIGN KEY ("factor_id_2") REFERENCES "public"."factors"("factor_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "factor_performance" ADD CONSTRAINT "factor_performance_factor_id_factors_factor_id_fk" FOREIGN KEY ("factor_id") REFERENCES "public"."factors"("factor_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "factor_weights" ADD CONSTRAINT "factor_weights_factor_id_factors_factor_id_fk" FOREIGN KEY ("factor_id") REFERENCES "public"."factors"("factor_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "factors" ADD CONSTRAINT "factors_hypothesis_id_hypotheses_hypothesis_id_fk" FOREIGN KEY ("hypothesis_id") REFERENCES "public"."hypotheses"("hypothesis_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "indicator_ic_history" ADD CONSTRAINT "indicator_ic_history_indicator_id_indicators_id_fk" FOREIGN KEY ("indicator_id") REFERENCES "public"."indicators"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "indicator_paper_signals" ADD CONSTRAINT "indicator_paper_signals_indicator_id_indicators_id_fk" FOREIGN KEY ("indicator_id") REFERENCES "public"."indicators"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "indicator_trials" ADD CONSTRAINT "indicator_trials_indicator_id_indicators_id_fk" FOREIGN KEY ("indicator_id") REFERENCES "public"."indicators"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "orders" ADD CONSTRAINT "orders_decision_id_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."decisions"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "paper_signals" ADD CONSTRAINT "paper_signals_factor_id_factors_factor_id_fk" FOREIGN KEY ("factor_id") REFERENCES "public"."factors"("factor_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "position_history" ADD CONSTRAINT "position_history_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "positions" ADD CONSTRAINT "positions_decision_id_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."decisions"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "research_runs" ADD CONSTRAINT "research_runs_hypothesis_id_hypotheses_hypothesis_id_fk" FOREIGN KEY ("hypothesis_id") REFERENCES "public"."hypotheses"("hypothesis_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "research_runs" ADD CONSTRAINT "research_runs_factor_id_factors_factor_id_fk" FOREIGN KEY ("factor_id") REFERENCES "public"."factors"("factor_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "thesis_state_history" ADD CONSTRAINT "thesis_state_history_thesis_id_thesis_state_thesis_id_fk" FOREIGN KEY ("thesis_id") REFERENCES "public"."thesis_state"("thesis_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "idx_account_user_id" ON "account" USING btree ("user_id");
CREATE INDEX "idx_account_provider_id" ON "account" USING btree ("provider_id");
CREATE INDEX "idx_account_provider_account" ON "account" USING btree ("provider_id","account_id");
CREATE INDEX "idx_agent_configs_environment" ON "agent_configs" USING btree ("environment");
CREATE INDEX "idx_agent_configs_agent_type" ON "agent_configs" USING btree ("agent_type");
CREATE UNIQUE INDEX "idx_agent_configs_env_agent" ON "agent_configs" USING btree ("environment","agent_type");
CREATE INDEX "idx_agent_outputs_decision_id" ON "agent_outputs" USING btree ("decision_id");
CREATE INDEX "idx_agent_outputs_agent_type" ON "agent_outputs" USING btree ("agent_type");
CREATE INDEX "idx_agent_outputs_decision_agent" ON "agent_outputs" USING btree ("decision_id","agent_type");
CREATE INDEX "idx_alert_settings_user_id" ON "alert_settings" USING btree ("user_id");
CREATE INDEX "idx_alerts_severity" ON "alerts" USING btree ("severity");
CREATE INDEX "idx_alerts_type" ON "alerts" USING btree ("type");
CREATE INDEX "idx_alerts_acknowledged" ON "alerts" USING btree ("acknowledged");
CREATE INDEX "idx_alerts_created_at" ON "alerts" USING btree ("created_at");
CREATE INDEX "idx_alerts_environment" ON "alerts" USING btree ("environment");
CREATE INDEX "idx_alerts_unack_env" ON "alerts" USING btree ("environment","acknowledged") WHERE "alerts"."acknowledged" = false;
CREATE INDEX "idx_audit_log_user_id" ON "audit_log" USING btree ("user_id");
CREATE INDEX "idx_audit_log_timestamp" ON "audit_log" USING btree ("timestamp");
CREATE INDEX "idx_audit_log_action" ON "audit_log" USING btree ("action");
CREATE INDEX "idx_audit_log_environment" ON "audit_log" USING btree ("environment");
CREATE INDEX "idx_backtest_equity_backtest_id" ON "backtest_equity" USING btree ("backtest_id");
CREATE INDEX "idx_backtest_equity_timestamp" ON "backtest_equity" USING btree ("timestamp");
CREATE INDEX "idx_backtest_equity_bt_ts" ON "backtest_equity" USING btree ("backtest_id","timestamp");
CREATE INDEX "idx_backtest_trades_backtest_id" ON "backtest_trades" USING btree ("backtest_id");
CREATE INDEX "idx_backtest_trades_timestamp" ON "backtest_trades" USING btree ("timestamp");
CREATE INDEX "idx_backtest_trades_symbol" ON "backtest_trades" USING btree ("symbol");
CREATE INDEX "idx_backtest_trades_bt_ts" ON "backtest_trades" USING btree ("backtest_id","timestamp");
CREATE INDEX "idx_backtests_status" ON "backtests" USING btree ("status");
CREATE INDEX "idx_backtests_start_date" ON "backtests" USING btree ("start_date");
CREATE INDEX "idx_backtests_created_at" ON "backtests" USING btree ("created_at");
CREATE UNIQUE INDEX "idx_candles_symbol_timeframe_ts" ON "candles" USING btree ("symbol","timeframe","timestamp");
CREATE INDEX "idx_candles_timestamp" ON "candles" USING btree ("timestamp");
CREATE INDEX "idx_candles_symbol" ON "candles" USING btree ("symbol");
CREATE INDEX "idx_candles_timeframe" ON "candles" USING btree ("timeframe");
CREATE INDEX "idx_config_versions_environment" ON "config_versions" USING btree ("environment");
CREATE INDEX "idx_config_versions_active" ON "config_versions" USING btree ("active");
CREATE INDEX "idx_config_versions_created_at" ON "config_versions" USING btree ("created_at");
CREATE UNIQUE INDEX "idx_config_versions_env_active" ON "config_versions" USING btree ("environment") WHERE "config_versions"."active" = true;
CREATE INDEX "idx_constraints_config_environment" ON "constraints_config" USING btree ("environment");
CREATE INDEX "idx_constraints_config_status" ON "constraints_config" USING btree ("status");
CREATE INDEX "idx_constraints_config_env_status" ON "constraints_config" USING btree ("environment","status");
CREATE UNIQUE INDEX "idx_constraints_config_env_active" ON "constraints_config" USING btree ("environment") WHERE "constraints_config"."status" = 'active';
CREATE INDEX "idx_corporate_actions_symbol_date" ON "corporate_actions" USING btree ("symbol","ex_date");
CREATE INDEX "idx_corporate_actions_ex_date" ON "corporate_actions" USING btree ("ex_date");
CREATE INDEX "idx_corporate_actions_type" ON "corporate_actions" USING btree ("action_type");
CREATE UNIQUE INDEX "idx_corporate_actions_unique" ON "corporate_actions" USING btree ("symbol","action_type","ex_date");
CREATE INDEX "idx_corp_actions_symbol" ON "corporate_actions_indicators" USING btree ("symbol","date");
CREATE INDEX "idx_corp_actions_symbol_only" ON "corporate_actions_indicators" USING btree ("symbol");
CREATE INDEX "idx_cycle_events_cycle_id" ON "cycle_events" USING btree ("cycle_id");
CREATE INDEX "idx_cycle_events_type" ON "cycle_events" USING btree ("event_type");
CREATE INDEX "idx_cycle_events_timestamp" ON "cycle_events" USING btree ("timestamp");
CREATE INDEX "idx_cycle_events_agent" ON "cycle_events" USING btree ("cycle_id","agent_type");
CREATE INDEX "idx_cycle_events_agent_event" ON "cycle_events" USING btree ("cycle_id","agent_type","event_type");
CREATE INDEX "idx_cycles_environment" ON "cycles" USING btree ("environment");
CREATE INDEX "idx_cycles_status" ON "cycles" USING btree ("status");
CREATE INDEX "idx_cycles_started_at" ON "cycles" USING btree ("started_at");
CREATE INDEX "idx_cycles_env_status" ON "cycles" USING btree ("environment","status");
CREATE INDEX "idx_cycles_env_started" ON "cycles" USING btree ("environment","started_at");
CREATE INDEX "idx_decisions_cycle_id" ON "decisions" USING btree ("cycle_id");
CREATE INDEX "idx_decisions_symbol" ON "decisions" USING btree ("symbol");
CREATE INDEX "idx_decisions_status" ON "decisions" USING btree ("status");
CREATE INDEX "idx_decisions_created_at" ON "decisions" USING btree ("created_at");
CREATE INDEX "idx_decisions_symbol_created" ON "decisions" USING btree ("symbol","created_at");
CREATE INDEX "idx_decisions_environment" ON "decisions" USING btree ("environment");
CREATE INDEX "idx_exec_order_snapshots_broker_id" ON "execution_order_snapshots" USING btree ("broker_order_id");
CREATE INDEX "idx_exec_order_snapshots_env_status" ON "execution_order_snapshots" USING btree ("environment","status");
CREATE INDEX "idx_exec_position_snapshots_env" ON "execution_position_snapshots" USING btree ("environment");
CREATE INDEX "idx_external_events_event_time" ON "external_events" USING btree ("event_time");
CREATE INDEX "idx_external_events_source_type" ON "external_events" USING btree ("source_type");
CREATE INDEX "idx_external_events_event_type" ON "external_events" USING btree ("event_type");
CREATE INDEX "idx_external_events_processed_at" ON "external_events" USING btree ("processed_at");
CREATE INDEX "idx_external_events_sentiment" ON "external_events" USING btree ("sentiment");
CREATE INDEX "idx_external_events_importance" ON "external_events" USING btree ("importance_score");
CREATE INDEX "idx_factor_perf_factor_date" ON "factor_performance" USING btree ("factor_id","date");
CREATE INDEX "idx_factors_status" ON "factors" USING btree ("status");
CREATE INDEX "idx_factors_hypothesis" ON "factors" USING btree ("hypothesis_id");
CREATE INDEX "idx_factors_active" ON "factors" USING btree ("status") WHERE "factors"."status" IN ('active', 'decaying');
CREATE UNIQUE INDEX "idx_features_symbol_ts_indicator" ON "features" USING btree ("symbol","timestamp","timeframe","indicator_name");
CREATE INDEX "idx_features_symbol_indicator_ts" ON "features" USING btree ("symbol","indicator_name","timestamp");
CREATE INDEX "idx_features_timestamp" ON "features" USING btree ("timestamp");
CREATE INDEX "idx_features_indicator" ON "features" USING btree ("indicator_name");
CREATE INDEX "idx_filing_sync_runs_started_at" ON "filing_sync_runs" USING btree ("started_at");
CREATE INDEX "idx_filing_sync_runs_status" ON "filing_sync_runs" USING btree ("status");
CREATE INDEX "idx_filing_sync_runs_environment" ON "filing_sync_runs" USING btree ("environment");
CREATE INDEX "idx_filing_sync_runs_trigger" ON "filing_sync_runs" USING btree ("trigger_source");
CREATE INDEX "idx_filings_symbol" ON "filings" USING btree ("symbol");
CREATE INDEX "idx_filings_filing_type" ON "filings" USING btree ("filing_type");
CREATE INDEX "idx_filings_filed_date" ON "filings" USING btree ("filed_date");
CREATE INDEX "idx_filings_status" ON "filings" USING btree ("status");
CREATE INDEX "idx_filings_symbol_type" ON "filings" USING btree ("symbol","filing_type");
CREATE INDEX "idx_filings_symbol_date" ON "filings" USING btree ("symbol","filed_date");
CREATE INDEX "idx_fundamental_symbol_date" ON "fundamental_indicators" USING btree ("symbol","date");
CREATE INDEX "idx_fundamental_symbol" ON "fundamental_indicators" USING btree ("symbol");
CREATE INDEX "idx_hypotheses_status" ON "hypotheses" USING btree ("status");
CREATE INDEX "idx_index_constituents_pit" ON "index_constituents" USING btree ("index_id","date_added","date_removed");
CREATE INDEX "idx_index_constituents_symbol" ON "index_constituents" USING btree ("symbol","index_id");
CREATE INDEX "idx_index_constituents_current" ON "index_constituents" USING btree ("index_id","date_removed");
CREATE UNIQUE INDEX "idx_index_constituents_unique" ON "index_constituents" USING btree ("index_id","symbol","date_added");
CREATE INDEX "idx_ic_history_indicator_date" ON "indicator_ic_history" USING btree ("indicator_id","date");
CREATE INDEX "idx_ind_paper_signals_indicator" ON "indicator_paper_signals" USING btree ("indicator_id");
CREATE INDEX "idx_ind_paper_signals_symbol" ON "indicator_paper_signals" USING btree ("symbol");
CREATE INDEX "idx_ind_paper_signals_date" ON "indicator_paper_signals" USING btree ("signal_date");
CREATE INDEX "idx_indicator_sync_runs_type" ON "indicator_sync_runs" USING btree ("run_type");
CREATE INDEX "idx_indicator_sync_runs_status" ON "indicator_sync_runs" USING btree ("status");
CREATE INDEX "idx_indicator_sync_runs_started" ON "indicator_sync_runs" USING btree ("started_at");
CREATE INDEX "idx_trials_indicator" ON "indicator_trials" USING btree ("indicator_id");
CREATE INDEX "idx_indicators_status" ON "indicators" USING btree ("status");
CREATE INDEX "idx_indicators_category" ON "indicators" USING btree ("category");
CREATE INDEX "idx_indicators_code_hash" ON "indicators" USING btree ("code_hash");
CREATE INDEX "idx_indicators_active" ON "indicators" USING btree ("status") WHERE "indicators"."status" IN ('paper', 'production');
CREATE INDEX "idx_macro_watch_timestamp" ON "macro_watch_entries" USING btree ("timestamp");
CREATE INDEX "idx_macro_watch_category" ON "macro_watch_entries" USING btree ("category");
CREATE INDEX "idx_macro_watch_session" ON "macro_watch_entries" USING btree ("session");
CREATE INDEX "idx_morning_newspapers_date" ON "morning_newspapers" USING btree ("date");
CREATE INDEX "idx_options_cache_symbol" ON "options_indicators_cache" USING btree ("symbol");
CREATE INDEX "idx_options_cache_expires" ON "options_indicators_cache" USING btree ("expires_at");
CREATE INDEX "idx_orders_decision_id" ON "orders" USING btree ("decision_id");
CREATE INDEX "idx_orders_symbol" ON "orders" USING btree ("symbol");
CREATE INDEX "idx_orders_status" ON "orders" USING btree ("status");
CREATE INDEX "idx_orders_broker_order_id" ON "orders" USING btree ("broker_order_id");
CREATE INDEX "idx_orders_created_at" ON "orders" USING btree ("created_at");
CREATE INDEX "idx_orders_environment" ON "orders" USING btree ("environment");
CREATE INDEX "idx_paper_signals_factor" ON "paper_signals" USING btree ("factor_id");
CREATE INDEX "idx_paper_signals_date" ON "paper_signals" USING btree ("signal_date");
CREATE INDEX "idx_paper_signals_factor_date" ON "paper_signals" USING btree ("factor_id","signal_date");
CREATE INDEX "idx_parity_history_entity" ON "parity_validation_history" USING btree ("entity_type","entity_id");
CREATE INDEX "idx_parity_history_environment" ON "parity_validation_history" USING btree ("environment");
CREATE INDEX "idx_parity_history_passed" ON "parity_validation_history" USING btree ("passed");
CREATE INDEX "idx_parity_history_validated_at" ON "parity_validation_history" USING btree ("validated_at");
CREATE INDEX "idx_portfolio_snapshots_timestamp" ON "portfolio_snapshots" USING btree ("timestamp");
CREATE INDEX "idx_portfolio_snapshots_environment" ON "portfolio_snapshots" USING btree ("environment");
CREATE INDEX "idx_position_history_position_id" ON "position_history" USING btree ("position_id");
CREATE INDEX "idx_position_history_timestamp" ON "position_history" USING btree ("timestamp");
CREATE INDEX "idx_position_history_position_ts" ON "position_history" USING btree ("position_id","timestamp");
CREATE INDEX "idx_positions_symbol" ON "positions" USING btree ("symbol");
CREATE INDEX "idx_positions_thesis_id" ON "positions" USING btree ("thesis_id");
CREATE INDEX "idx_positions_decision_id" ON "positions" USING btree ("decision_id");
CREATE INDEX "idx_positions_status" ON "positions" USING btree ("status");
CREATE INDEX "idx_positions_environment" ON "positions" USING btree ("environment");
CREATE UNIQUE INDEX "idx_positions_symbol_env_open" ON "positions" USING btree ("symbol","environment") WHERE "positions"."closed_at" IS NULL;
CREATE INDEX "idx_pm_arbitrage_divergence" ON "prediction_market_arbitrage" USING btree ("divergence_pct");
CREATE INDEX "idx_pm_arbitrage_detected" ON "prediction_market_arbitrage" USING btree ("detected_at");
CREATE INDEX "idx_pm_arbitrage_unresolved" ON "prediction_market_arbitrage" USING btree ("resolved_at") WHERE "prediction_market_arbitrage"."resolved_at" IS NULL;
CREATE INDEX "idx_pm_signals_type" ON "prediction_market_signals" USING btree ("signal_type");
CREATE INDEX "idx_pm_signals_time" ON "prediction_market_signals" USING btree ("computed_at");
CREATE INDEX "idx_pm_snapshots_platform" ON "prediction_market_snapshots" USING btree ("platform");
CREATE INDEX "idx_pm_snapshots_ticker" ON "prediction_market_snapshots" USING btree ("market_ticker");
CREATE INDEX "idx_pm_snapshots_type" ON "prediction_market_snapshots" USING btree ("market_type");
CREATE INDEX "idx_pm_snapshots_time" ON "prediction_market_snapshots" USING btree ("snapshot_time");
CREATE UNIQUE INDEX "idx_regime_labels_symbol_ts_tf" ON "regime_labels" USING btree ("symbol","timestamp","timeframe");
CREATE INDEX "idx_regime_labels_symbol_ts" ON "regime_labels" USING btree ("symbol","timestamp");
CREATE INDEX "idx_regime_labels_regime" ON "regime_labels" USING btree ("regime");
CREATE INDEX "idx_regime_labels_market" ON "regime_labels" USING btree ("symbol","timestamp") WHERE "regime_labels"."symbol" = '_MARKET';
CREATE INDEX "idx_research_runs_phase" ON "research_runs" USING btree ("phase");
CREATE INDEX "idx_research_runs_trigger" ON "research_runs" USING btree ("trigger_type");
CREATE INDEX "idx_research_runs_hypothesis" ON "research_runs" USING btree ("hypothesis_id");
CREATE INDEX "idx_research_runs_factor" ON "research_runs" USING btree ("factor_id");
CREATE INDEX "idx_sentiment_symbol_date" ON "sentiment_indicators" USING btree ("symbol","date");
CREATE INDEX "idx_sentiment_symbol" ON "sentiment_indicators" USING btree ("symbol");
CREATE INDEX "idx_session_user_id" ON "session" USING btree ("user_id");
CREATE INDEX "idx_session_token" ON "session" USING btree ("token");
CREATE INDEX "idx_session_expires_at" ON "session" USING btree ("expires_at");
CREATE INDEX "idx_short_interest_symbol" ON "short_interest_indicators" USING btree ("symbol","settlement_date");
CREATE INDEX "idx_short_interest_settlement" ON "short_interest_indicators" USING btree ("settlement_date");
CREATE INDEX "idx_thesis_state_instrument" ON "thesis_state" USING btree ("instrument_id");
CREATE INDEX "idx_thesis_state_state" ON "thesis_state" USING btree ("state");
CREATE INDEX "idx_thesis_state_environment" ON "thesis_state" USING btree ("environment");
CREATE INDEX "idx_thesis_state_created_at" ON "thesis_state" USING btree ("created_at");
CREATE INDEX "idx_thesis_state_closed_at" ON "thesis_state" USING btree ("closed_at");
CREATE INDEX "idx_thesis_state_active" ON "thesis_state" USING btree ("environment","state") WHERE "thesis_state"."state" != 'CLOSED';
CREATE INDEX "idx_thesis_state_instrument_active" ON "thesis_state" USING btree ("instrument_id","environment") WHERE "thesis_state"."state" != 'CLOSED';
CREATE INDEX "idx_thesis_history_thesis_id" ON "thesis_state_history" USING btree ("thesis_id");
CREATE INDEX "idx_thesis_history_created_at" ON "thesis_state_history" USING btree ("created_at");
CREATE INDEX "idx_thesis_history_thesis_created" ON "thesis_state_history" USING btree ("thesis_id","created_at");
CREATE INDEX "idx_ticker_changes_old" ON "ticker_changes" USING btree ("old_symbol","change_date");
CREATE INDEX "idx_ticker_changes_new" ON "ticker_changes" USING btree ("new_symbol","change_date");
CREATE INDEX "idx_ticker_changes_date" ON "ticker_changes" USING btree ("change_date");
CREATE UNIQUE INDEX "idx_ticker_changes_unique" ON "ticker_changes" USING btree ("old_symbol","new_symbol","change_date");
CREATE INDEX "idx_trading_config_environment" ON "trading_config" USING btree ("environment");
CREATE INDEX "idx_trading_config_status" ON "trading_config" USING btree ("status");
CREATE INDEX "idx_trading_config_env_status" ON "trading_config" USING btree ("environment","status");
CREATE INDEX "idx_trading_config_created_at" ON "trading_config" USING btree ("created_at");
CREATE UNIQUE INDEX "idx_trading_config_env_active" ON "trading_config" USING btree ("environment") WHERE "trading_config"."status" = 'active';
CREATE INDEX "idx_two_factor_user_id" ON "two_factor" USING btree ("user_id");
CREATE INDEX "idx_two_factor_secret" ON "two_factor" USING btree ("secret");
CREATE UNIQUE INDEX "idx_universe_cache_source" ON "universe_cache" USING btree ("source_type","source_id");
CREATE INDEX "idx_universe_cache_expires" ON "universe_cache" USING btree ("expires_at");
CREATE INDEX "idx_universe_cache_hash" ON "universe_cache" USING btree ("source_hash");
CREATE INDEX "idx_universe_configs_environment" ON "universe_configs" USING btree ("environment");
CREATE INDEX "idx_universe_configs_status" ON "universe_configs" USING btree ("status");
CREATE INDEX "idx_universe_configs_env_status" ON "universe_configs" USING btree ("environment","status");
CREATE UNIQUE INDEX "idx_universe_configs_env_active" ON "universe_configs" USING btree ("environment") WHERE "universe_configs"."status" = 'active';
CREATE UNIQUE INDEX "idx_universe_snapshots_pit" ON "universe_snapshots" USING btree ("index_id","snapshot_date");
CREATE INDEX "idx_universe_snapshots_date" ON "universe_snapshots" USING btree ("snapshot_date");
CREATE INDEX "idx_user_email" ON "user" USING btree ("email");
CREATE INDEX "idx_user_created_at" ON "user" USING btree ("created_at");
CREATE INDEX "idx_user_preferences_user_id" ON "user_preferences" USING btree ("user_id");
CREATE INDEX "idx_user_preferences_created_at" ON "user_preferences" USING btree ("created_at");
CREATE INDEX "idx_verification_identifier" ON "verification" USING btree ("identifier");
CREATE INDEX "idx_verification_expires_at" ON "verification" USING btree ("expires_at");