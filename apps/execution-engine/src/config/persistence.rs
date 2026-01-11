//! State persistence configuration.

use serde::{Deserialize, Serialize};

/// State persistence configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersistenceConfig {
    /// Enable state persistence.
    #[serde(default = "default_persistence_enabled")]
    pub enabled: bool,
    /// Database path for state storage.
    #[serde(default = "default_db_path")]
    pub db_path: String,
    /// Snapshot interval in seconds (how often to persist state).
    #[serde(default = "default_snapshot_interval")]
    pub snapshot_interval_secs: u64,
}

impl Default for PersistenceConfig {
    fn default() -> Self {
        Self {
            enabled: default_persistence_enabled(),
            db_path: default_db_path(),
            snapshot_interval_secs: default_snapshot_interval(),
        }
    }
}

impl PersistenceConfig {
    /// Check if persistence is enabled based on environment.
    ///
    /// Persistence is enabled by default in PAPER/LIVE modes,
    /// disabled in BACKTEST mode to avoid I/O overhead.
    #[must_use]
    pub fn is_enabled_for_env(&self, env: &crate::models::Environment) -> bool {
        if !self.enabled {
            return false;
        }
        // Disable persistence for backtest unless explicitly enabled
        !env.is_backtest()
    }
}

const fn default_persistence_enabled() -> bool {
    true
}

fn default_db_path() -> String {
    "./data/orders.db".to_string()
}

const fn default_snapshot_interval() -> u64 {
    60
}
