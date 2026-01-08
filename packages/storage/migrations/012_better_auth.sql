-- ============================================
-- Migration 012: Better Auth Tables
-- ============================================
-- Creates tables for better-auth authentication system.
-- Tables: user, session, account, verification, two_factor
--
-- Note: CHECK constraints NOT used - Turso/libSQL does not support them.
-- Timestamps use INTEGER (milliseconds since epoch) for better-auth compatibility.
--
-- Reference: docs/plans/30-better-auth-migration.md (Phase 1.2)
-- Schema from: Context7 /better-auth/better-auth documentation

-- ============================================
-- 1. user
-- ============================================
-- Core user profile table for authentication.

CREATE TABLE IF NOT EXISTS user (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  email_verified INTEGER NOT NULL DEFAULT 0,  -- boolean: 0 or 1
  image TEXT,
  two_factor_enabled INTEGER DEFAULT 0,       -- boolean: 0 or 1
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);

-- Indexes for user
CREATE INDEX IF NOT EXISTS idx_user_email ON user(email);
CREATE INDEX IF NOT EXISTS idx_user_created_at ON user(created_at);

-- ============================================
-- 2. session
-- ============================================
-- Stores active user sessions with token-based lookup.

CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,  -- timestamp_ms
  token TEXT NOT NULL UNIQUE,
  ip_address TEXT,
  user_agent TEXT,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),

  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);

-- Indexes for session
CREATE INDEX IF NOT EXISTS idx_session_user_id ON session(user_id);
CREATE INDEX IF NOT EXISTS idx_session_token ON session(token);
CREATE INDEX IF NOT EXISTS idx_session_expires_at ON session(expires_at);

-- ============================================
-- 3. account
-- ============================================
-- OAuth provider accounts linked to users.
-- Stores access tokens, refresh tokens, and provider metadata.

CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,     -- Provider's user ID
  provider_id TEXT NOT NULL,    -- e.g., 'google', 'github'
  user_id TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at INTEGER,  -- timestamp_ms
  refresh_token_expires_at INTEGER, -- timestamp_ms
  scope TEXT,
  password TEXT,                    -- For email/password auth (hashed)
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),

  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);

-- Indexes for account
CREATE INDEX IF NOT EXISTS idx_account_user_id ON account(user_id);
CREATE INDEX IF NOT EXISTS idx_account_provider_id ON account(provider_id);
CREATE INDEX IF NOT EXISTS idx_account_provider_account ON account(provider_id, account_id);

-- ============================================
-- 4. verification
-- ============================================
-- Email verification and password reset tokens.

CREATE TABLE IF NOT EXISTS verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,     -- Email or other identifier
  value TEXT NOT NULL,          -- Verification token/code
  expires_at INTEGER NOT NULL,  -- timestamp_ms
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);

-- Indexes for verification
CREATE INDEX IF NOT EXISTS idx_verification_identifier ON verification(identifier);
CREATE INDEX IF NOT EXISTS idx_verification_expires_at ON verification(expires_at);

-- ============================================
-- 5. two_factor
-- ============================================
-- TOTP secrets and backup codes for two-factor authentication.

CREATE TABLE IF NOT EXISTS two_factor (
  id TEXT PRIMARY KEY,
  secret TEXT NOT NULL,         -- Encrypted TOTP secret
  backup_codes TEXT NOT NULL,   -- JSON array of backup codes
  user_id TEXT NOT NULL,

  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);

-- Indexes for two_factor
CREATE INDEX IF NOT EXISTS idx_two_factor_user_id ON two_factor(user_id);
CREATE INDEX IF NOT EXISTS idx_two_factor_secret ON two_factor(secret);

-- ============================================
-- Record this migration
-- ============================================
INSERT INTO schema_migrations (version, name) VALUES (12, 'better_auth');
