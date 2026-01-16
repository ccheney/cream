-- PostgreSQL Initialization Script for Cream
-- ===========================================
-- This script runs once when the PostgreSQL container is first created.
-- It enables required extensions and creates environment-specific databases.

-- Enable extensions in the main cream database
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pgaudit;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create environment-specific databases
CREATE DATABASE cream_backtest;
CREATE DATABASE cream_paper;
CREATE DATABASE cream_test;

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE cream TO cream;
GRANT ALL PRIVILEGES ON DATABASE cream_backtest TO cream;
GRANT ALL PRIVILEGES ON DATABASE cream_paper TO cream;
GRANT ALL PRIVILEGES ON DATABASE cream_test TO cream;

-- Enable extensions in cream_backtest database
\c cream_backtest
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Enable extensions in cream_paper database
\c cream_paper
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pgaudit;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Enable extensions in cream_test database (for CI/testing)
\c cream_test
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
