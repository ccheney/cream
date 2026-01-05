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

use serde::{Deserialize, Serialize};
use thiserror::Error;

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
    ParseError(#[from] serde_yaml::Error),

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
    /// Environment configuration.
    #[serde(default)]
    pub environment: EnvironmentConfig,
}

/// Server configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    /// gRPC server port.
    #[serde(default = "default_grpc_port")]
    pub grpc_port: u16,
    /// Arrow Flight server port.
    #[serde(default = "default_flight_port")]
    pub flight_port: u16,
    /// Bind address.
    #[serde(default = "default_bind_address")]
    pub bind_address: String,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            grpc_port: default_grpc_port(),
            flight_port: default_flight_port(),
            bind_address: default_bind_address(),
        }
    }
}

fn default_grpc_port() -> u16 {
    50051
}
fn default_flight_port() -> u16 {
    50052
}
fn default_bind_address() -> String {
    "0.0.0.0".to_string()
}

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
}

impl Default for DatabentoConfig {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            dataset: default_databento_dataset(),
            reconnect_delay_ms: default_reconnect_delay(),
            max_reconnect_attempts: default_max_reconnect_attempts(),
        }
    }
}

fn default_databento_dataset() -> String {
    "XNAS.ITCH".to_string()
}
fn default_reconnect_delay() -> u64 {
    1000
}
fn default_max_reconnect_attempts() -> u32 {
    5
}

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

/// Pricing model configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PricingConfig {
    /// Risk-free rate (annualized).
    #[serde(default = "default_risk_free_rate")]
    pub risk_free_rate: f64,
    /// Default dividend yield.
    #[serde(default)]
    pub default_dividend_yield: f64,
    /// Volatility calculation window in days.
    #[serde(default = "default_volatility_window")]
    pub volatility_window_days: u32,
    /// Use implied volatility when available.
    #[serde(default = "default_true")]
    pub use_implied_volatility: bool,
}

impl Default for PricingConfig {
    fn default() -> Self {
        Self {
            risk_free_rate: default_risk_free_rate(),
            default_dividend_yield: 0.0,
            volatility_window_days: default_volatility_window(),
            use_implied_volatility: true,
        }
    }
}

fn default_risk_free_rate() -> f64 {
    0.05
}
fn default_volatility_window() -> u32 {
    30
}
fn default_true() -> bool {
    true
}

/// Risk constraint configuration.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ConstraintsConfig {
    /// Per-instrument limits.
    #[serde(default)]
    pub per_instrument: PerInstrumentConstraints,
    /// Portfolio-level limits.
    #[serde(default)]
    pub portfolio: PortfolioConstraints,
    /// Options-specific limits.
    #[serde(default)]
    pub options: OptionsConstraints,
    /// Buying power requirements.
    #[serde(default)]
    pub buying_power: BuyingPowerConstraints,
}

/// Per-instrument constraint limits.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerInstrumentConstraints {
    /// Maximum notional value.
    #[serde(default = "default_max_notional")]
    pub max_notional: f64,
    /// Maximum units (shares/contracts).
    #[serde(default = "default_max_units")]
    pub max_units: u32,
    /// Maximum equity percentage.
    #[serde(default = "default_max_equity_pct")]
    pub max_equity_pct: f64,
}

impl Default for PerInstrumentConstraints {
    fn default() -> Self {
        Self {
            max_notional: default_max_notional(),
            max_units: default_max_units(),
            max_equity_pct: default_max_equity_pct(),
        }
    }
}

fn default_max_notional() -> f64 {
    50000.0
}
fn default_max_units() -> u32 {
    1000
}
fn default_max_equity_pct() -> f64 {
    0.10
}

/// Portfolio-level constraint limits.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortfolioConstraints {
    /// Maximum gross notional.
    #[serde(default = "default_max_gross_notional")]
    pub max_gross_notional: f64,
    /// Maximum net notional.
    #[serde(default = "default_max_net_notional")]
    pub max_net_notional: f64,
    /// Maximum leverage ratio.
    #[serde(default = "default_max_leverage")]
    pub max_leverage: f64,
}

impl Default for PortfolioConstraints {
    fn default() -> Self {
        Self {
            max_gross_notional: default_max_gross_notional(),
            max_net_notional: default_max_net_notional(),
            max_leverage: default_max_leverage(),
        }
    }
}

fn default_max_gross_notional() -> f64 {
    500000.0
}
fn default_max_net_notional() -> f64 {
    200000.0
}
fn default_max_leverage() -> f64 {
    2.0
}

/// Options-specific constraint limits.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptionsConstraints {
    /// Maximum delta per underlying.
    #[serde(default = "default_max_delta_per_underlying")]
    pub max_delta_per_underlying: f64,
    /// Maximum portfolio delta.
    #[serde(default = "default_max_portfolio_delta")]
    pub max_portfolio_delta: f64,
    /// Maximum portfolio gamma.
    #[serde(default = "default_max_portfolio_gamma")]
    pub max_portfolio_gamma: f64,
    /// Maximum portfolio vega.
    #[serde(default = "default_max_portfolio_vega")]
    pub max_portfolio_vega: f64,
    /// Maximum portfolio theta.
    #[serde(default = "default_max_portfolio_theta")]
    pub max_portfolio_theta: f64,
    /// Maximum contracts per underlying.
    #[serde(default = "default_max_contracts_per_underlying")]
    pub max_contracts_per_underlying: u32,
}

impl Default for OptionsConstraints {
    fn default() -> Self {
        Self {
            max_delta_per_underlying: default_max_delta_per_underlying(),
            max_portfolio_delta: default_max_portfolio_delta(),
            max_portfolio_gamma: default_max_portfolio_gamma(),
            max_portfolio_vega: default_max_portfolio_vega(),
            max_portfolio_theta: default_max_portfolio_theta(),
            max_contracts_per_underlying: default_max_contracts_per_underlying(),
        }
    }
}

fn default_max_delta_per_underlying() -> f64 {
    100.0
}
fn default_max_portfolio_delta() -> f64 {
    500.0
}
fn default_max_portfolio_gamma() -> f64 {
    50.0
}
fn default_max_portfolio_vega() -> f64 {
    1000.0
}
fn default_max_portfolio_theta() -> f64 {
    -500.0
}
fn default_max_contracts_per_underlying() -> u32 {
    100
}

/// Buying power constraint requirements.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuyingPowerConstraints {
    /// Minimum buying power ratio to maintain.
    #[serde(default = "default_min_buying_power_ratio")]
    pub min_buying_power_ratio: f64,
    /// Margin safety buffer.
    #[serde(default = "default_margin_buffer")]
    pub margin_buffer: f64,
}

impl Default for BuyingPowerConstraints {
    fn default() -> Self {
        Self {
            min_buying_power_ratio: default_min_buying_power_ratio(),
            margin_buffer: default_margin_buffer(),
        }
    }
}

fn default_min_buying_power_ratio() -> f64 {
    0.20
}
fn default_margin_buffer() -> f64 {
    0.10
}

/// Observability configuration.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ObservabilityConfig {
    /// Metrics configuration.
    #[serde(default)]
    pub metrics: MetricsConfig,
    /// Tracing configuration.
    #[serde(default)]
    pub tracing: TracingConfig,
    /// Logging configuration.
    #[serde(default)]
    pub logging: LoggingConfig,
}

/// Prometheus metrics configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricsConfig {
    /// Enable metrics collection.
    #[serde(default = "default_true")]
    pub enabled: bool,
    /// Metrics endpoint.
    #[serde(default = "default_metrics_endpoint")]
    pub endpoint: String,
    /// Optional push gateway URL.
    #[serde(default)]
    pub push_gateway: Option<String>,
}

impl Default for MetricsConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            endpoint: default_metrics_endpoint(),
            push_gateway: None,
        }
    }
}

fn default_metrics_endpoint() -> String {
    "0.0.0.0:9090".to_string()
}

/// OpenTelemetry tracing configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TracingConfig {
    /// Enable distributed tracing.
    #[serde(default = "default_true")]
    pub enabled: bool,
    /// OTLP endpoint for trace export.
    #[serde(default = "default_otlp_endpoint")]
    pub otlp_endpoint: String,
    /// Sampling ratio (0.0 - 1.0).
    #[serde(default = "default_sampling_ratio")]
    pub sampling_ratio: f64,
    /// Batch export size.
    #[serde(default = "default_batch_size")]
    pub batch_size: usize,
    /// Batch export timeout in milliseconds.
    #[serde(default = "default_batch_timeout")]
    pub batch_timeout_ms: u64,
}

impl Default for TracingConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            otlp_endpoint: default_otlp_endpoint(),
            sampling_ratio: default_sampling_ratio(),
            batch_size: default_batch_size(),
            batch_timeout_ms: default_batch_timeout(),
        }
    }
}

fn default_otlp_endpoint() -> String {
    "http://otel-collector:4317".to_string()
}
fn default_sampling_ratio() -> f64 {
    1.0
}
fn default_batch_size() -> usize {
    512
}
fn default_batch_timeout() -> u64 {
    5000
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

/// Circuit breaker configuration.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CircuitBreakerConfig {
    /// Default circuit breaker settings.
    #[serde(default)]
    pub default: CircuitBreakerSettings,
    /// Alpaca-specific settings.
    #[serde(default)]
    pub alpaca: Option<CircuitBreakerSettings>,
    /// Databento-specific settings.
    #[serde(default)]
    pub databento: Option<CircuitBreakerSettings>,
}

/// Circuit breaker settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CircuitBreakerSettings {
    /// Failure rate threshold to open circuit.
    #[serde(default = "default_failure_rate_threshold")]
    pub failure_rate_threshold: f64,
    /// Minimum calls before evaluating.
    #[serde(default = "default_minimum_calls")]
    pub minimum_calls: u32,
    /// Duration in open state (seconds).
    #[serde(default = "default_wait_duration")]
    pub wait_duration_secs: u64,
    /// Calls permitted in half-open state.
    #[serde(default = "default_permitted_calls")]
    pub permitted_calls_in_half_open: u32,
    /// Sliding window type.
    #[serde(default = "default_sliding_window_type")]
    pub sliding_window_type: String,
    /// Sliding window size.
    #[serde(default = "default_sliding_window_size")]
    pub sliding_window_size: u32,
}

impl Default for CircuitBreakerSettings {
    fn default() -> Self {
        Self {
            failure_rate_threshold: default_failure_rate_threshold(),
            minimum_calls: default_minimum_calls(),
            wait_duration_secs: default_wait_duration(),
            permitted_calls_in_half_open: default_permitted_calls(),
            sliding_window_type: default_sliding_window_type(),
            sliding_window_size: default_sliding_window_size(),
        }
    }
}

fn default_failure_rate_threshold() -> f64 {
    0.5
}
fn default_minimum_calls() -> u32 {
    5
}
fn default_wait_duration() -> u64 {
    30
}
fn default_permitted_calls() -> u32 {
    3
}
fn default_sliding_window_type() -> String {
    "count".to_string()
}
fn default_sliding_window_size() -> u32 {
    10
}

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
    let interpolated = interpolate_env_vars(&contents)?;

    // Parse YAML
    let config: Config = serde_yaml::from_str(&interpolated)?;

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
    let interpolated = interpolate_env_vars(yaml)?;
    let config: Config = serde_yaml::from_str(&interpolated)?;
    validate_config(&config)?;
    Ok(config)
}

/// Interpolate environment variables in a string.
///
/// Supports both `${VAR}` and `${VAR:-default}` syntax.
fn interpolate_env_vars(input: &str) -> Result<String, ConfigError> {
    let mut result = input.to_string();

    // Match ${VAR} or ${VAR:-default} patterns
    let re = regex::Regex::new(r"\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}").unwrap();

    for cap in re.captures_iter(input) {
        let full_match = cap.get(0).unwrap().as_str();
        let var_name = cap.get(1).unwrap().as_str();
        let default_value = cap.get(2).map(|m| m.as_str());

        let value = match std::env::var(var_name) {
            Ok(v) if !v.is_empty() => v,
            _ => {
                if let Some(default) = default_value {
                    default.to_string()
                } else {
                    // Leave as empty string for optional values
                    String::new()
                }
            }
        };

        result = result.replace(full_match, &value);
    }

    Ok(result)
}

/// Validate configuration values.
fn validate_config(config: &Config) -> Result<(), ConfigError> {
    // Validate server ports
    if config.server.grpc_port == config.server.flight_port {
        return Err(ConfigError::ValidationError(
            "grpc_port and flight_port must be different".to_string(),
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

    // Validate observability settings
    if config.observability.tracing.sampling_ratio < 0.0
        || config.observability.tracing.sampling_ratio > 1.0
    {
        return Err(ConfigError::ValidationError(
            "tracing.sampling_ratio must be between 0.0 and 1.0".to_string(),
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
    let valid_modes = ["BACKTEST", "PAPER", "LIVE"];
    if !valid_modes.contains(&config.environment.mode.as_str()) {
        return Err(ConfigError::ValidationError(format!(
            "environment.mode must be one of: {:?}",
            valid_modes
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
            environment: EnvironmentConfig::default(),
        };

        assert_eq!(config.server.grpc_port, 50051);
        assert_eq!(config.server.flight_port, 50052);
        assert_eq!(config.pricing.risk_free_rate, 0.05);
        assert_eq!(config.environment.mode, "PAPER");
    }

    #[test]
    fn test_load_minimal_config() {
        let yaml = r#"
server:
  grpc_port: 50051
  flight_port: 50052
"#;

        let config = load_config_from_string(yaml).unwrap();
        assert_eq!(config.server.grpc_port, 50051);
        assert_eq!(config.pricing.risk_free_rate, 0.05); // Default value
    }

    #[test]
    fn test_env_var_with_default_when_missing() {
        // Use a variable name unlikely to exist
        let input = "mode: ${CREAM_CONFIG_TEST_NONEXISTENT_VAR:-PAPER}";
        let result = interpolate_env_vars(input).unwrap();

        // When env var doesn't exist, should use default value
        assert_eq!(result, "mode: PAPER");
    }

    #[test]
    fn test_env_var_with_default_uses_existing() {
        // PATH should always exist
        let input = "path: ${PATH:-default}";
        let result = interpolate_env_vars(input).unwrap();

        // Should not be the default value
        assert_ne!(result, "path: default");
        // Should contain actual PATH value
        assert!(result.starts_with("path: "));
    }

    #[test]
    fn test_env_var_without_default_becomes_empty() {
        // Use a variable name unlikely to exist
        let input = "api_key: ${CREAM_CONFIG_TEST_UNLIKELY_TO_EXIST}";
        let result = interpolate_env_vars(input).unwrap();

        // Without default, missing env var becomes empty string
        assert_eq!(result, "api_key: ");
    }

    #[test]
    fn test_validation_same_ports() {
        let yaml = r#"
server:
  grpc_port: 50051
  flight_port: 50051
"#;

        let result = load_config_from_string(yaml);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("must be different"));
    }

    #[test]
    fn test_validation_invalid_risk_free_rate() {
        let yaml = r#"
server:
  grpc_port: 50051
  flight_port: 50052
pricing:
  risk_free_rate: 1.5
"#;

        let result = load_config_from_string(yaml);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("risk_free_rate"));
    }

    #[test]
    fn test_validation_invalid_environment_mode() {
        let yaml = r#"
server:
  grpc_port: 50051
  flight_port: 50052
environment:
  mode: INVALID
"#;

        let result = load_config_from_string(yaml);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("mode"));
    }

    #[test]
    fn test_full_config_parse() {
        let yaml = r#"
server:
  grpc_port: 50051
  flight_port: 50052
  bind_address: "127.0.0.1"

feeds:
  databento:
    dataset: "XNAS.ITCH"
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
  metrics:
    enabled: true
    endpoint: "0.0.0.0:9091"
  tracing:
    sampling_ratio: 0.5
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

        let config = load_config_from_string(yaml).unwrap();

        assert_eq!(config.server.bind_address, "127.0.0.1");
        assert_eq!(config.feeds.databento.reconnect_delay_ms, 2000);
        assert_eq!(config.brokers.alpaca.base_url, "https://api.alpaca.markets");
        assert_eq!(config.pricing.risk_free_rate, 0.04);
        assert_eq!(config.constraints.per_instrument.max_notional, 100000.0);
        assert_eq!(config.constraints.portfolio.max_leverage, 3.0);
        assert_eq!(config.constraints.options.max_portfolio_delta, 1000.0);
        assert_eq!(config.observability.metrics.endpoint, "0.0.0.0:9091");
        assert_eq!(config.observability.tracing.sampling_ratio, 0.5);
        assert_eq!(config.observability.logging.level, "debug");
        assert_eq!(
            config.circuit_breaker.default.failure_rate_threshold,
            0.3
        );
        assert_eq!(config.environment.mode, "LIVE");
    }

    #[test]
    fn test_constraint_limits() {
        let config = ConstraintsConfig::default();

        assert_eq!(config.per_instrument.max_notional, 50000.0);
        assert_eq!(config.per_instrument.max_units, 1000);
        assert_eq!(config.portfolio.max_gross_notional, 500000.0);
        assert_eq!(config.options.max_portfolio_delta, 500.0);
        assert_eq!(config.buying_power.min_buying_power_ratio, 0.20);
    }
}
