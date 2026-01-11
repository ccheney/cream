//! Data feeds configuration for market data providers.

use serde::{Deserialize, Serialize};

/// Data feeds configuration.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct FeedsConfig {
    /// Alpaca configuration (primary provider).
    #[serde(default)]
    pub alpaca: AlpacaFeedConfig,
}

/// Alpaca feed configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlpacaFeedConfig {
    /// API key (from environment variable).
    #[serde(default)]
    pub api_key: String,
    /// API secret (from environment variable).
    #[serde(default)]
    pub api_secret: String,
    /// Feed type: "sip" for Algo Trader Plus, "iex" for Basic.
    #[serde(default = "default_alpaca_feed")]
    pub feed: String,
    /// Reconnection delay in milliseconds.
    #[serde(default = "default_reconnect_delay")]
    pub reconnect_delay_ms: u64,
    /// Maximum reconnection attempts.
    #[serde(default = "default_max_reconnect_attempts")]
    pub max_reconnect_attempts: u32,
    /// Symbols to subscribe to.
    #[serde(default = "default_alpaca_symbols")]
    pub symbols: Vec<String>,
    /// Whether to use paper trading environment.
    #[serde(default = "default_paper")]
    pub paper: bool,
}

impl Default for AlpacaFeedConfig {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            api_secret: String::new(),
            feed: default_alpaca_feed(),
            reconnect_delay_ms: default_reconnect_delay(),
            max_reconnect_attempts: default_max_reconnect_attempts(),
            symbols: default_alpaca_symbols(),
            paper: default_paper(),
        }
    }
}

fn default_alpaca_feed() -> String {
    "sip".to_string()
}

fn default_alpaca_symbols() -> Vec<String> {
    Vec::new()
}

const fn default_paper() -> bool {
    true
}

const fn default_reconnect_delay() -> u64 {
    1000
}

const fn default_max_reconnect_attempts() -> u32 {
    5
}
