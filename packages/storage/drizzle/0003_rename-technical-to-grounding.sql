-- Rename agent_type enum value: technical -> grounding_agent
-- Migration: Standardize agent naming to match codebase
-- NOTE: This migration is idempotent and safe for fresh installs

-- Only rename if 'technical' exists (for existing databases)
-- Fresh installs already have 'grounding_agent' from 0000_init.sql
DO $$
BEGIN
    -- Check if 'technical' exists in the agent_type enum
    IF EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'technical'
        AND enumtypid = 'public.agent_type'::regtype
    ) THEN
        -- Rename the enum value (PostgreSQL 10+)
        ALTER TYPE "public"."agent_type" RENAME VALUE 'technical' TO 'grounding_agent';
    END IF;
END $$;--> statement-breakpoint
