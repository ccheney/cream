//! State persistence configuration.

use serde::{Deserialize, Serialize};

/// State persistence configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersistenceConfig {
    /// Enable state persistence.
    #[serde(default = "default_persistence_enabled")]
    pub enabled: bool,
    /// Database URL for `PostgreSQL` connection.
    /// If not set, will be resolved from environment variables.
    #[serde(default)]
    pub database_url: Option<String>,
    /// Snapshot interval in seconds (how often to persist state).
    #[serde(default = "default_snapshot_interval")]
    pub snapshot_interval_secs: u64,
    /// Maximum connection pool size.
    #[serde(default = "default_max_connections")]
    pub max_connections: u32,
}

impl Default for PersistenceConfig {
    fn default() -> Self {
        Self {
            enabled: default_persistence_enabled(),
            database_url: None,
            snapshot_interval_secs: default_snapshot_interval(),
            max_connections: default_max_connections(),
        }
    }
}

impl PersistenceConfig {
    /// Check if persistence is enabled based on environment.
    ///
    /// Persistence is enabled by default in PAPER/LIVE modes.
    #[must_use]
    pub const fn is_enabled_for_env(&self, _env: &crate::models::Environment) -> bool {
        self.enabled
    }

    /// Resolve the database URL based on environment.
    ///
    /// Priority:
    /// 1. Config file `database_url` if set
    /// 2. Environment-specific variable (`DATABASE_URL_PAPER` for PAPER mode)
    /// 3. Generic `DATABASE_URL`
    ///
    /// # Errors
    ///
    /// Returns an error if no database URL can be resolved.
    pub fn resolve_database_url(
        &self,
        env: &crate::models::Environment,
    ) -> Result<String, PersistenceConfigError> {
        // First check config file
        if let Some(url) = &self.database_url
            && !url.is_empty()
        {
            return Ok(url.clone());
        }

        // Then check environment-specific variables
        let env_var = match env {
            crate::models::Environment::Paper => "DATABASE_URL_PAPER",
            crate::models::Environment::Live => "DATABASE_URL",
        };

        if let Ok(url) = std::env::var(env_var)
            && !url.is_empty()
        {
            return Ok(url);
        }

        // Finally fall back to generic DATABASE_URL
        if let Ok(url) = std::env::var("DATABASE_URL")
            && !url.is_empty()
        {
            return Ok(url);
        }

        Err(PersistenceConfigError::MissingDatabaseUrl(format!(
            "No database URL found. Set {env_var} or DATABASE_URL environment variable."
        )))
    }
}

const fn default_persistence_enabled() -> bool {
    true
}

const fn default_snapshot_interval() -> u64 {
    60
}

const fn default_max_connections() -> u32 {
    5
}

/// Errors from persistence configuration.
#[derive(Debug, thiserror::Error)]
pub enum PersistenceConfigError {
    /// Missing database URL.
    #[error("Missing database URL: {0}")]
    MissingDatabaseUrl(String),
}
