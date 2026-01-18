-- Drop backtest tables and related objects
-- Migration: Remove all backtest infrastructure
-- NOTE: This migration is idempotent and safe for fresh installs

-- Drop foreign key constraints first (IF EXISTS handles fresh installs)
ALTER TABLE IF EXISTS "backtest_equity" DROP CONSTRAINT IF EXISTS "backtest_equity_backtest_id_backtests_id_fk";--> statement-breakpoint
ALTER TABLE IF EXISTS "backtest_trades" DROP CONSTRAINT IF EXISTS "backtest_trades_backtest_id_backtests_id_fk";--> statement-breakpoint

-- Drop indexes
DROP INDEX IF EXISTS "idx_backtest_equity_backtest_id";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_backtest_equity_timestamp";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_backtest_equity_bt_ts";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_backtest_trades_backtest_id";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_backtest_trades_timestamp";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_backtest_trades_symbol";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_backtest_trades_bt_ts";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_backtests_status";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_backtests_start_date";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_backtests_created_at";--> statement-breakpoint

-- Drop tables
DROP TABLE IF EXISTS "backtest_equity";--> statement-breakpoint
DROP TABLE IF EXISTS "backtest_trades";--> statement-breakpoint
DROP TABLE IF EXISTS "backtests";--> statement-breakpoint

-- Drop backtest_status enum
DROP TYPE IF EXISTS "public"."backtest_status";--> statement-breakpoint

-- Only migrate environment enum if BACKTEST value exists (for existing databases)
-- Fresh installs already have the correct enum from 0000_init.sql
DO $$
BEGIN
    -- Check if BACKTEST exists in the environment enum
    IF EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'BACKTEST'
        AND enumtypid = 'public.environment'::regtype
    ) THEN
        -- Create new enum without BACKTEST
        CREATE TYPE "public"."environment_new" AS ENUM('PAPER', 'LIVE');

        -- Update all columns
        ALTER TABLE "trading_cycles" ALTER COLUMN "environment" TYPE "public"."environment_new" USING "environment"::text::"public"."environment_new";
        ALTER TABLE "decisions" ALTER COLUMN "environment" TYPE "public"."environment_new" USING "environment"::text::"public"."environment_new";
        ALTER TABLE "orders" ALTER COLUMN "environment" TYPE "public"."environment_new" USING "environment"::text::"public"."environment_new";
        ALTER TABLE "fills" ALTER COLUMN "environment" TYPE "public"."environment_new" USING "environment"::text::"public"."environment_new";
        ALTER TABLE "positions" ALTER COLUMN "environment" TYPE "public"."environment_new" USING "environment"::text::"public"."environment_new";
        ALTER TABLE "portfolio_snapshots" ALTER COLUMN "environment" TYPE "public"."environment_new" USING "environment"::text::"public"."environment_new";
        ALTER TABLE "risk_snapshots" ALTER COLUMN "environment" TYPE "public"."environment_new" USING "environment"::text::"public"."environment_new";
        ALTER TABLE "risk_breach_events" ALTER COLUMN "environment" TYPE "public"."environment_new" USING "environment"::text::"public"."environment_new";
        ALTER TABLE "agent_memories" ALTER COLUMN "environment" TYPE "public"."environment_new" USING "environment"::text::"public"."environment_new";
        ALTER TABLE "runtime_configs" ALTER COLUMN "environment" TYPE "public"."environment_new" USING "environment"::text::"public"."environment_new";
        ALTER TABLE "config_changes" ALTER COLUMN "environment" TYPE "public"."environment_new" USING "environment"::text::"public"."environment_new";
        ALTER TABLE "active_configs" ALTER COLUMN "environment" TYPE "public"."environment_new" USING "environment"::text::"public"."environment_new";
        ALTER TABLE "audit_events" ALTER COLUMN "environment" TYPE "public"."environment_new" USING "environment"::text::"public"."environment_new";
        ALTER TABLE "indicators" ALTER COLUMN "environment" TYPE "public"."environment_new" USING "environment"::text::"public"."environment_new";
        ALTER TABLE "indicator_versions" ALTER COLUMN "environment" TYPE "public"."environment_new" USING "environment"::text::"public"."environment_new";
        ALTER TABLE "indicator_values" ALTER COLUMN "environment" TYPE "public"."environment_new" USING "environment"::text::"public"."environment_new";
        ALTER TABLE "factors" ALTER COLUMN "environment" TYPE "public"."environment_new" USING "environment"::text::"public"."environment_new";
        ALTER TABLE "factor_performance" ALTER COLUMN "environment" TYPE "public"."environment_new" USING "environment"::text::"public"."environment_new";

        -- Drop old and rename new
        DROP TYPE "public"."environment";
        ALTER TYPE "public"."environment_new" RENAME TO "environment";
    END IF;
END $$;--> statement-breakpoint
