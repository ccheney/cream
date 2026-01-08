-- Rollback Migration 012: Better Auth Tables

-- Drop two_factor indexes and table
DROP INDEX IF EXISTS idx_two_factor_secret;
DROP INDEX IF EXISTS idx_two_factor_user_id;
DROP TABLE IF EXISTS two_factor;

-- Drop verification indexes and table
DROP INDEX IF EXISTS idx_verification_expires_at;
DROP INDEX IF EXISTS idx_verification_identifier;
DROP TABLE IF EXISTS verification;

-- Drop account indexes and table
DROP INDEX IF EXISTS idx_account_provider_account;
DROP INDEX IF EXISTS idx_account_provider_id;
DROP INDEX IF EXISTS idx_account_user_id;
DROP TABLE IF EXISTS account;

-- Drop session indexes and table
DROP INDEX IF EXISTS idx_session_expires_at;
DROP INDEX IF EXISTS idx_session_token;
DROP INDEX IF EXISTS idx_session_user_id;
DROP TABLE IF EXISTS session;

-- Drop user indexes and table
DROP INDEX IF EXISTS idx_user_created_at;
DROP INDEX IF EXISTS idx_user_email;
DROP TABLE IF EXISTS user;

DELETE FROM schema_migrations WHERE version = 12;
