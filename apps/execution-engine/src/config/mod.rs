//! Configuration module for the execution engine.
//!
//! Provides comprehensive configuration loading, validation, and
//! environment variable interpolation for all execution engine components.
//!
//! # Usage
//!
//! ```rust,ignore
//! use execution_engine::config::{Config, load_config};
//!
//! // Load from default path (config.yaml)
//! let config = load_config(None)?;
//!
//! // Load from custom path
//! let config = load_config(Some("custom/config.yaml"))?;
//!
//! // Access configuration values
//! println!("gRPC port: {}", config.server.grpc_port);
//! ```

mod brokers;
mod circuit_breaker;
mod constraints;
mod environment;
mod feeds;
mod observability;
mod persistence;
mod pricing;
mod reconciliation;
mod recovery;
mod safety;
mod server;
mod stops;
mod validation;

use serde::{Deserialize, Serialize};
use thiserror::Error;

// Re-export all public types for backwards compatibility
pub use brokers::{AlpacaConfig, BrokersConfig};
pub use circuit_breaker::{CircuitBreakerConfig, CircuitBreakerSettings};
pub use constraints::{
    BuyingPowerConstraints, ConstraintsConfig, OptionsConstraints, PerInstrumentConstraints,
    PortfolioConstraints,
};
pub use environment::EnvironmentConfig;
pub use feeds::{AlpacaFeedConfig, FeedsConfig};
pub use observability::{LoggingConfig, ObservabilityConfig};
pub use persistence::PersistenceConfig;
pub use pricing::PricingConfig;
pub use reconciliation::ReconciliationConfig;
pub use recovery::RecoveryConfig;
pub use safety::SafetyConfig;
pub use server::ServerConfig;
pub use stops::StopsConfigExternal;
pub use validation::{
    StartupValidation, StartupValidationError, require_credentials, validate_startup_environment,
};

/// Configuration errors.
#[derive(Debug, Error)]
pub enum ConfigError {
    /// Failed to read configuration file.
    #[error("Failed to read config file '{path}': {source}")]
    ReadError {
        /// Path to the config file.
        path: String,
        /// The underlying IO error.
        source: std::io::Error,
    },

    /// Failed to parse YAML configuration.
    #[error("Failed to parse config YAML: {0}")]
    ParseError(#[from] serde_yaml_bw::Error),

    /// Configuration validation failed.
    #[error("Config validation failed: {0}")]
    ValidationError(String),

    /// Missing required environment variable.
    #[error("Missing required environment variable: {0}")]
    MissingEnvVar(String),
}

/// Root configuration structure.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    /// Server configuration.
    pub server: ServerConfig,
    /// Data feeds configuration.
    #[serde(default)]
    pub feeds: FeedsConfig,
    /// Broker configuration.
    #[serde(default)]
    pub brokers: BrokersConfig,
    /// Pricing model configuration.
    #[serde(default)]
    pub pricing: PricingConfig,
    /// Risk constraint configuration.
    #[serde(default)]
    pub constraints: ConstraintsConfig,
    /// Observability configuration.
    #[serde(default)]
    pub observability: ObservabilityConfig,
    /// Circuit breaker configuration.
    #[serde(default)]
    pub circuit_breaker: CircuitBreakerConfig,
    /// Persistence configuration.
    #[serde(default)]
    pub persistence: PersistenceConfig,
    /// Recovery configuration for crash recovery.
    #[serde(default)]
    pub recovery: RecoveryConfig,
    /// Reconciliation configuration for periodic broker sync.
    #[serde(default)]
    pub reconciliation: ReconciliationConfig,
    /// Safety configuration for mass cancel on disconnect.
    #[serde(default)]
    pub safety: SafetyConfig,
    /// Stops configuration for stop-loss and take-profit enforcement.
    #[serde(default)]
    pub stops: StopsConfigExternal,
    /// Environment configuration.
    #[serde(default)]
    pub environment: EnvironmentConfig,
}

// ============================================
// Configuration Loading
// ============================================

/// Load configuration from a YAML file with environment variable interpolation.
///
/// # Arguments
///
/// * `path` - Optional path to the config file. Defaults to "config.yaml".
///
/// # Errors
///
/// Returns a `ConfigError` if the file cannot be read, parsed, or validated.
pub fn load_config(path: Option<&str>) -> Result<Config, ConfigError> {
    let path = path.unwrap_or("config.yaml");

    // Read the config file
    let contents = std::fs::read_to_string(path).map_err(|e| ConfigError::ReadError {
        path: path.to_string(),
        source: e,
    })?;

    // Interpolate environment variables
    let interpolated = interpolate_env_vars(&contents);

    // Parse YAML
    let config: Config = serde_yaml_bw::from_str(&interpolated)?;

    // Validate configuration
    validate_config(&config)?;

    Ok(config)
}

/// Load configuration from a YAML string (useful for testing).
///
/// # Errors
///
/// Returns a `ConfigError` if the YAML cannot be parsed or validated.
pub fn load_config_from_string(yaml: &str) -> Result<Config, ConfigError> {
    let interpolated = interpolate_env_vars(yaml);
    let config: Config = serde_yaml_bw::from_str(&interpolated)?;
    validate_config(&config)?;
    Ok(config)
}

/// Interpolate environment variables in a string.
///
/// Supports both `${VAR}` and `${VAR:-default}` syntax.
#[allow(clippy::expect_used)] // Regex is compile-time constant; expect() is safe here
fn interpolate_env_vars(input: &str) -> String {
    use std::sync::OnceLock;

    static ENV_VAR_REGEX: OnceLock<regex::Regex> = OnceLock::new();

    let mut result = input.to_string();

    // Match ${VAR} or ${VAR:-default} patterns
    let re = ENV_VAR_REGEX.get_or_init(|| {
        // This regex pattern is compile-time constant and always valid
        regex::Regex::new(r"\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}")
            .expect("env var regex is valid")
    });

    for cap in re.captures_iter(input) {
        // Group 0 and group 1 are guaranteed by the regex pattern structure
        let Some(full_match) = cap.get(0) else {
            continue;
        };
        let Some(var_match) = cap.get(1) else {
            continue;
        };
        let full_match = full_match.as_str();
        let var_name = var_match.as_str();
        let default_value = cap.get(2).map(|m| m.as_str());

        let value = match std::env::var(var_name) {
            Ok(v) if !v.is_empty() => v,
            _ => default_value.map_or_else(String::new, str::to_string),
        };

        result = result.replace(full_match, &value);
    }

    result
}

/// Validate configuration values.
fn validate_config(config: &Config) -> Result<(), ConfigError> {
    // Validate server ports (must be different)
    let http = config.server.http_port;
    let grpc = config.server.grpc_port;

    if http == grpc {
        return Err(ConfigError::ValidationError(
            "http_port and grpc_port must be different".to_string(),
        ));
    }

    // Validate pricing parameters
    if config.pricing.risk_free_rate < 0.0 || config.pricing.risk_free_rate > 1.0 {
        return Err(ConfigError::ValidationError(
            "risk_free_rate must be between 0.0 and 1.0".to_string(),
        ));
    }

    if config.pricing.default_dividend_yield < 0.0 || config.pricing.default_dividend_yield > 1.0 {
        return Err(ConfigError::ValidationError(
            "default_dividend_yield must be between 0.0 and 1.0".to_string(),
        ));
    }

    // Validate constraint limits
    if config.constraints.per_instrument.max_notional <= 0.0 {
        return Err(ConfigError::ValidationError(
            "per_instrument.max_notional must be positive".to_string(),
        ));
    }

    if config.constraints.portfolio.max_gross_notional <= 0.0 {
        return Err(ConfigError::ValidationError(
            "portfolio.max_gross_notional must be positive".to_string(),
        ));
    }

    if config.constraints.portfolio.max_leverage <= 0.0 {
        return Err(ConfigError::ValidationError(
            "portfolio.max_leverage must be positive".to_string(),
        ));
    }

    // Validate circuit breaker settings
    let cb = &config.circuit_breaker.default;
    if cb.failure_rate_threshold < 0.0 || cb.failure_rate_threshold > 1.0 {
        return Err(ConfigError::ValidationError(
            "circuit_breaker.failure_rate_threshold must be between 0.0 and 1.0".to_string(),
        ));
    }

    // Validate environment mode
    let valid_modes = ["PAPER", "LIVE"];
    if !valid_modes.contains(&config.environment.mode.as_str()) {
        return Err(ConfigError::ValidationError(format!(
            "environment.mode must be one of: {valid_modes:?}"
        )));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = Config {
            server: ServerConfig::default(),
            feeds: FeedsConfig::default(),
            brokers: BrokersConfig::default(),
            pricing: PricingConfig::default(),
            constraints: ConstraintsConfig::default(),
            observability: ObservabilityConfig::default(),
            circuit_breaker: CircuitBreakerConfig::default(),
            persistence: PersistenceConfig::default(),
            recovery: RecoveryConfig::default(),
            reconciliation: ReconciliationConfig::default(),
            safety: SafetyConfig::default(),
            stops: StopsConfigExternal::default(),
            environment: EnvironmentConfig::default(),
        };

        assert_eq!(config.server.http_port, 50051);
        assert_eq!(config.server.grpc_port, 50053);
        assert!((config.pricing.risk_free_rate - 0.05).abs() < f64::EPSILON);
        assert_eq!(config.environment.mode, "PAPER");
        assert!(config.persistence.enabled);
        assert!(config.recovery.enabled);
        assert!(config.reconciliation.enabled);
    }

    #[test]
    fn test_load_minimal_config() {
        let yaml = r"
server:
  http_port: 50051
  grpc_port: 50053
";

        let config = match load_config_from_string(yaml) {
            Ok(c) => c,
            Err(e) => panic!("should load minimal config: {e}"),
        };
        assert_eq!(config.server.http_port, 50051);
        assert!((config.pricing.risk_free_rate - 0.05).abs() < f64::EPSILON); // Default value
    }

    #[test]
    fn test_env_var_with_default_when_missing() {
        // Use a variable name unlikely to exist
        let input = "mode: ${CREAM_CONFIG_TEST_NONEXISTENT_VAR:-PAPER}";
        let result = interpolate_env_vars(input);

        // When env var doesn't exist, should use default value
        assert_eq!(result, "mode: PAPER");
    }

    #[test]
    #[expect(clippy::literal_string_with_formatting_args)] // ${...} is env var syntax, not format args
    fn test_env_var_with_default_uses_existing() {
        // PATH should always exist
        // Note: The ${...} syntax is for env var interpolation, not format strings
        let input = "path: ${PATH:-default}";
        let result = interpolate_env_vars(input);

        // Should not be the default value
        assert_ne!(result, "path: default");
        // Should contain actual PATH value
        assert!(result.starts_with("path: "));
    }

    #[test]
    fn test_env_var_without_default_becomes_empty() {
        // Use a variable name unlikely to exist
        let input = "api_key: ${CREAM_CONFIG_TEST_UNLIKELY_TO_EXIST}";
        let result = interpolate_env_vars(input);

        // Without default, missing env var becomes empty string
        assert_eq!(result, "api_key: ");
    }

    #[test]
    fn test_validation_same_ports() {
        let yaml = r"
server:
  http_port: 50051
  grpc_port: 50051
";

        let result = load_config_from_string(yaml);
        let Err(err) = result else {
            panic!("expected error for duplicate ports");
        };
        assert!(err.to_string().contains("must be different"));
    }

    #[test]
    fn test_validation_invalid_risk_free_rate() {
        let yaml = r"
server:
  http_port: 50051
  grpc_port: 50053
pricing:
  risk_free_rate: 1.5
";

        let result = load_config_from_string(yaml);
        let Err(err) = result else {
            panic!("expected error for invalid risk_free_rate");
        };
        assert!(err.to_string().contains("risk_free_rate"));
    }

    #[test]
    fn test_validation_invalid_environment_mode() {
        let yaml = r"
server:
  http_port: 50051
  grpc_port: 50053
environment:
  mode: INVALID
";

        let result = load_config_from_string(yaml);
        let Err(err) = result else {
            panic!("expected error for invalid mode");
        };
        assert!(err.to_string().contains("mode"));
    }

    #[test]
    fn test_full_config_parse() {
        let yaml = r#"
server:
  http_port: 50051
  grpc_port: 50053
  bind_address: "127.0.0.1"

feeds:
  alpaca:
    feed: "sip"
    reconnect_delay_ms: 2000

brokers:
  alpaca:
    base_url: "https://api.alpaca.markets"

pricing:
  risk_free_rate: 0.04
  default_dividend_yield: 0.02

constraints:
  per_instrument:
    max_notional: 100000
    max_units: 2000
  portfolio:
    max_gross_notional: 1000000
    max_leverage: 3.0
  options:
    max_portfolio_delta: 1000

observability:
  logging:
    level: "debug"
    format: "pretty"

circuit_breaker:
  default:
    failure_rate_threshold: 0.3
    wait_duration_secs: 60

environment:
  mode: LIVE
"#;

        let config = match load_config_from_string(yaml) {
            Ok(c) => c,
            Err(e) => panic!("should load full config: {e}"),
        };

        assert_eq!(config.server.bind_address, "127.0.0.1");
        assert_eq!(config.feeds.alpaca.reconnect_delay_ms, 2000);
        assert_eq!(config.brokers.alpaca.base_url, "https://api.alpaca.markets");
        assert!((config.pricing.risk_free_rate - 0.04).abs() < f64::EPSILON);
        assert!((config.constraints.per_instrument.max_notional - 100_000.0).abs() < 1e-10);
        assert!((config.constraints.portfolio.max_leverage - 3.0).abs() < f64::EPSILON);
        assert!((config.constraints.options.max_portfolio_delta - 1000.0).abs() < 1e-10);
        assert_eq!(config.observability.logging.level, "debug");
        assert!((config.circuit_breaker.default.failure_rate_threshold - 0.3).abs() < f64::EPSILON);
        assert_eq!(config.environment.mode, "LIVE");
    }
}
