//! Observability configuration for logging.

use serde::{Deserialize, Serialize};

use super::pricing::default_true;

/// Observability configuration (logging only, OpenTelemetry removed).
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ObservabilityConfig {
    /// Logging configuration.
    #[serde(default)]
    pub logging: LoggingConfig,
}

/// Logging configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoggingConfig {
    /// Log level.
    #[serde(default = "default_log_level")]
    pub level: String,
    /// Output format.
    #[serde(default = "default_log_format")]
    pub format: String,
    /// Include span information.
    #[serde(default = "default_true")]
    pub include_spans: bool,
}

impl Default for LoggingConfig {
    fn default() -> Self {
        Self {
            level: default_log_level(),
            format: default_log_format(),
            include_spans: true,
        }
    }
}

fn default_log_level() -> String {
    "info".to_string()
}

fn default_log_format() -> String {
    "json".to_string()
}
