-- ============================================
-- Authentication Tables (better-auth)
-- ============================================
-- Timestamps use INTEGER (milliseconds since epoch) for better-auth compatibility.
-- user, session, account, verification, two_factor

CREATE TABLE IF NOT EXISTS user (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  email_verified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  two_factor_enabled INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);

CREATE INDEX IF NOT EXISTS idx_user_email ON user(email);
CREATE INDEX IF NOT EXISTS idx_user_created_at ON user(created_at);

CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  ip_address TEXT,
  user_agent TEXT,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),

  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_session_user_id ON session(user_id);
CREATE INDEX IF NOT EXISTS idx_session_token ON session(token);
CREATE INDEX IF NOT EXISTS idx_session_expires_at ON session(expires_at);

CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at INTEGER,
  refresh_token_expires_at INTEGER,
  scope TEXT,
  password TEXT,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),

  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_account_user_id ON account(user_id);
CREATE INDEX IF NOT EXISTS idx_account_provider_id ON account(provider_id);
CREATE INDEX IF NOT EXISTS idx_account_provider_account ON account(provider_id, account_id);

CREATE TABLE IF NOT EXISTS verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);

CREATE INDEX IF NOT EXISTS idx_verification_identifier ON verification(identifier);
CREATE INDEX IF NOT EXISTS idx_verification_expires_at ON verification(expires_at);

CREATE TABLE IF NOT EXISTS two_factor (
  id TEXT PRIMARY KEY,
  secret TEXT NOT NULL,
  backup_codes TEXT NOT NULL,
  user_id TEXT NOT NULL,

  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_two_factor_user_id ON two_factor(user_id);
CREATE INDEX IF NOT EXISTS idx_two_factor_secret ON two_factor(secret);
