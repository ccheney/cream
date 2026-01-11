//! Broker configuration for order routing.

use serde::{Deserialize, Serialize};

/// Broker configuration.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct BrokersConfig {
    /// Alpaca broker configuration.
    #[serde(default)]
    pub alpaca: AlpacaConfig,
}

/// Alpaca broker configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlpacaConfig {
    /// API key.
    #[serde(default)]
    pub api_key: String,
    /// API secret.
    #[serde(default)]
    pub api_secret: String,
    /// Base URL for API calls.
    #[serde(default = "default_alpaca_base_url")]
    pub base_url: String,
    /// Data URL for streaming.
    #[serde(default = "default_alpaca_data_url")]
    pub data_url: String,
}

impl Default for AlpacaConfig {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            api_secret: String::new(),
            base_url: default_alpaca_base_url(),
            data_url: default_alpaca_data_url(),
        }
    }
}

fn default_alpaca_base_url() -> String {
    "https://paper-api.alpaca.markets".to_string()
}

fn default_alpaca_data_url() -> String {
    "wss://stream.data.sandbox.alpaca.markets".to_string()
}
