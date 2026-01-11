//! Data feeds configuration for market data providers.

use serde::{Deserialize, Serialize};

/// Data feeds configuration.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct FeedsConfig {
    /// Databento configuration.
    #[serde(default)]
    pub databento: DatabentoConfig,
}

/// Databento feed configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabentoConfig {
    /// API key (from environment variable).
    #[serde(default)]
    pub api_key: String,
    /// Dataset name.
    #[serde(default = "default_databento_dataset")]
    pub dataset: String,
    /// Reconnection delay in milliseconds.
    #[serde(default = "default_reconnect_delay")]
    pub reconnect_delay_ms: u64,
    /// Maximum reconnection attempts.
    #[serde(default = "default_max_reconnect_attempts")]
    pub max_reconnect_attempts: u32,
    /// Symbols to subscribe to.
    #[serde(default = "default_databento_symbols")]
    pub symbols: Vec<String>,
}

impl Default for DatabentoConfig {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            dataset: default_databento_dataset(),
            reconnect_delay_ms: default_reconnect_delay(),
            max_reconnect_attempts: default_max_reconnect_attempts(),
            symbols: default_databento_symbols(),
        }
    }
}

fn default_databento_dataset() -> String {
    "XNAS.ITCH".to_string()
}

const fn default_reconnect_delay() -> u64 {
    1000
}

const fn default_max_reconnect_attempts() -> u32 {
    5
}

fn default_databento_symbols() -> Vec<String> {
    // No default symbols - must be configured via config.yaml or runtime config.
    // In production, symbols come from the runtime config system (@cream/config)
    // which supports static lists, index constituents, ETF holdings, and screeners.
    // See: packages/config/src/schemas/universe.ts
    Vec::new()
}
