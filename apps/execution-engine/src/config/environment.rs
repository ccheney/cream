//! Environment configuration for trading mode.

use serde::{Deserialize, Serialize};

/// Environment configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnvironmentConfig {
    /// Trading mode.
    #[serde(default = "default_environment_mode")]
    pub mode: String,
}

impl Default for EnvironmentConfig {
    fn default() -> Self {
        Self {
            mode: default_environment_mode(),
        }
    }
}

fn default_environment_mode() -> String {
    "PAPER".to_string()
}
