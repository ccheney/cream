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

use std::time::Duration;

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

/// Server configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    /// HTTP server port for REST endpoints (/health, /v1/*).
    #[serde(default = "default_http_port")]
    pub http_port: u16,
    /// gRPC server port for MarketDataService and ExecutionService.
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
            http_port: default_http_port(),
            grpc_port: default_grpc_port(),
            flight_port: default_flight_port(),
            bind_address: default_bind_address(),
        }
    }
}

const fn default_http_port() -> u16 {
    50051
}
const fn default_grpc_port() -> u16 {
    50053
}
const fn default_flight_port() -> u16 {
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

const fn default_risk_free_rate() -> f64 {
    0.05
}
const fn default_volatility_window() -> u32 {
    30
}
const fn default_true() -> bool {
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

const fn default_max_notional() -> f64 {
    50000.0
}
const fn default_max_units() -> u32 {
    1000
}
const fn default_max_equity_pct() -> f64 {
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

const fn default_max_gross_notional() -> f64 {
    500_000.0
}
const fn default_max_net_notional() -> f64 {
    200_000.0
}
const fn default_max_leverage() -> f64 {
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

const fn default_max_delta_per_underlying() -> f64 {
    100.0
}
const fn default_max_portfolio_delta() -> f64 {
    500.0
}
const fn default_max_portfolio_gamma() -> f64 {
    50.0
}
const fn default_max_portfolio_vega() -> f64 {
    1000.0
}
const fn default_max_portfolio_theta() -> f64 {
    -500.0
}
const fn default_max_contracts_per_underlying() -> u32 {
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

const fn default_min_buying_power_ratio() -> f64 {
    0.20
}
const fn default_margin_buffer() -> f64 {
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
const fn default_sampling_ratio() -> f64 {
    1.0
}
const fn default_batch_size() -> usize {
    512
}
const fn default_batch_timeout() -> u64 {
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

impl CircuitBreakerSettings {
    /// Convert config settings to resilience module's `CircuitBreakerConfig`.
    #[must_use]
    pub fn to_resilience_config(&self) -> crate::resilience::CircuitBreakerConfig {
        crate::resilience::CircuitBreakerConfig {
            failure_rate_threshold: self.failure_rate_threshold,
            sliding_window_size: self.sliding_window_size,
            minimum_calls: self.minimum_calls,
            wait_duration_in_open: Duration::from_secs(self.wait_duration_secs),
            permitted_calls_in_half_open: self.permitted_calls_in_half_open,
            call_timeout: Duration::from_secs(5), // Default timeout
        }
    }
}

impl CircuitBreakerConfig {
    /// Get the circuit breaker config for Alpaca, falling back to defaults.
    #[must_use]
    pub fn alpaca_config(&self) -> crate::resilience::CircuitBreakerConfig {
        self.alpaca.as_ref().map_or_else(
            || self.default.to_resilience_config(),
            CircuitBreakerSettings::to_resilience_config,
        )
    }

    /// Get the circuit breaker config for Databento, falling back to defaults.
    #[must_use]
    pub fn databento_config(&self) -> crate::resilience::CircuitBreakerConfig {
        self.databento.as_ref().map_or_else(
            || self.default.to_resilience_config(),
            CircuitBreakerSettings::to_resilience_config,
        )
    }
}

const fn default_failure_rate_threshold() -> f64 {
    0.5
}
const fn default_minimum_calls() -> u32 {
    5
}
const fn default_wait_duration() -> u64 {
    30
}
const fn default_permitted_calls() -> u32 {
    3
}
fn default_sliding_window_type() -> String {
    "count".to_string()
}
const fn default_sliding_window_size() -> u32 {
    10
}

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

/// Recovery configuration for crash recovery on startup.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecoveryConfig {
    /// Enable recovery on startup.
    #[serde(default = "default_recovery_enabled")]
    pub enabled: bool,
    /// Automatically resolve orphaned orders (orders in broker but not local).
    #[serde(default = "default_auto_resolve_orphans")]
    pub auto_resolve_orphans: bool,
    /// Sync positions from broker on startup.
    #[serde(default = "default_sync_positions")]
    pub sync_positions: bool,
    /// Abort startup if critical discrepancies are detected (recommended for LIVE).
    #[serde(default = "default_abort_on_critical")]
    pub abort_on_critical: bool,
    /// Position quantity tolerance for reconciliation (e.g., 0.01 = 1 share tolerance).
    #[serde(default = "default_position_qty_tolerance")]
    pub position_qty_tolerance: f64,
    /// Position price variance tolerance as percentage (e.g., 0.01 = 1%).
    #[serde(default = "default_position_price_tolerance_pct")]
    pub position_price_tolerance_pct: f64,
}

impl Default for RecoveryConfig {
    fn default() -> Self {
        Self {
            enabled: default_recovery_enabled(),
            auto_resolve_orphans: default_auto_resolve_orphans(),
            sync_positions: default_sync_positions(),
            abort_on_critical: default_abort_on_critical(),
            position_qty_tolerance: default_position_qty_tolerance(),
            position_price_tolerance_pct: default_position_price_tolerance_pct(),
        }
    }
}

impl RecoveryConfig {
    /// Check if recovery is enabled based on environment.
    ///
    /// Recovery is enabled by default in PAPER/LIVE modes,
    /// disabled in BACKTEST mode since there's no state to recover.
    #[must_use]
    pub fn is_enabled_for_env(&self, env: &crate::models::Environment) -> bool {
        if !self.enabled {
            return false;
        }
        // Disable recovery for backtest mode
        !env.is_backtest()
    }

    /// Convert to the internal RecoveryConfig type used by the recovery module.
    #[must_use]
    pub fn to_recovery_config(&self) -> crate::execution::RecoveryConfig {
        use rust_decimal::Decimal;

        crate::execution::RecoveryConfig {
            enabled: self.enabled,
            auto_resolve_orphans: self.auto_resolve_orphans,
            sync_positions: self.sync_positions,
            abort_on_critical: self.abort_on_critical,
            max_attempts: 3,
            position_qty_tolerance: Decimal::try_from(self.position_qty_tolerance)
                .unwrap_or_default(),
            position_price_tolerance_pct: Decimal::try_from(self.position_price_tolerance_pct)
                .unwrap_or_else(|_| Decimal::new(1, 2)),
        }
    }
}

const fn default_recovery_enabled() -> bool {
    true
}

const fn default_auto_resolve_orphans() -> bool {
    true
}

const fn default_sync_positions() -> bool {
    true
}

const fn default_abort_on_critical() -> bool {
    true
}

const fn default_position_qty_tolerance() -> f64 {
    0.0
}

const fn default_position_price_tolerance_pct() -> f64 {
    0.01 // 1%
}

/// Reconciliation configuration for periodic broker state sync.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReconciliationConfig {
    /// Enable periodic reconciliation.
    #[serde(default = "default_reconciliation_enabled")]
    pub enabled: bool,
    /// Reconciliation interval in seconds.
    #[serde(default = "default_reconciliation_interval")]
    pub interval_secs: u64,
    /// Protection window for recent orders (don't mark as orphaned).
    #[serde(default = "default_protection_window")]
    pub protection_window_secs: u64,
    /// Maximum order age for cleanup eligibility.
    #[serde(default = "default_max_order_age")]
    pub max_order_age_secs: u64,
    /// Automatically resolve orphaned orders.
    #[serde(default = "default_auto_resolve_orphans")]
    pub auto_resolve_orphans: bool,
    /// Action on critical discrepancy: "halt", "log_and_continue", or "alert".
    #[serde(default = "default_critical_action")]
    pub on_critical_discrepancy: String,
}

impl Default for ReconciliationConfig {
    fn default() -> Self {
        Self {
            enabled: default_reconciliation_enabled(),
            interval_secs: default_reconciliation_interval(),
            protection_window_secs: default_protection_window(),
            max_order_age_secs: default_max_order_age(),
            auto_resolve_orphans: default_auto_resolve_orphans(),
            on_critical_discrepancy: default_critical_action(),
        }
    }
}

impl ReconciliationConfig {
    /// Check if reconciliation is enabled based on environment.
    ///
    /// Reconciliation is enabled by default in PAPER/LIVE modes,
    /// disabled in BACKTEST mode since there's no broker to reconcile with.
    #[must_use]
    pub fn is_enabled_for_env(&self, env: &crate::models::Environment) -> bool {
        if !self.enabled {
            return false;
        }
        // Disable reconciliation for backtest mode
        !env.is_backtest()
    }

    /// Convert to the internal ReconciliationConfig type used by the reconciliation module.
    #[must_use]
    pub fn to_reconciliation_config(
        &self,
    ) -> crate::execution::reconciliation::ReconciliationConfig {
        use crate::execution::reconciliation::CriticalDiscrepancyAction;
        use rust_decimal::Decimal;

        let critical_action = match self.on_critical_discrepancy.to_lowercase().as_str() {
            "halt" => CriticalDiscrepancyAction::Halt,
            "log_and_continue" => CriticalDiscrepancyAction::LogAndContinue,
            "alert" => CriticalDiscrepancyAction::Alert,
            _ => CriticalDiscrepancyAction::Halt, // Default to safest option
        };

        crate::execution::reconciliation::ReconciliationConfig {
            on_startup: true,
            on_reconnect: true,
            periodic_interval_secs: self.interval_secs,
            protection_window_secs: self.protection_window_secs,
            max_order_age_secs: self.max_order_age_secs,
            position_qty_tolerance: Decimal::ZERO,
            position_price_tolerance_pct: Decimal::new(1, 2), // 1%
            on_critical_discrepancy: critical_action,
            auto_resolve_orphans: self.auto_resolve_orphans,
        }
    }
}

const fn default_reconciliation_enabled() -> bool {
    true
}

const fn default_reconciliation_interval() -> u64 {
    300 // 5 minutes
}

const fn default_protection_window() -> u64 {
    1800 // 30 minutes
}

const fn default_max_order_age() -> u64 {
    86400 // 24 hours
}

fn default_critical_action() -> String {
    "halt".to_string()
}

/// Safety configuration for mass cancel on broker disconnect.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SafetyConfig {
    /// Enable mass cancel on disconnect.
    #[serde(default = "default_safety_enabled")]
    pub enabled: bool,
    /// Grace period in seconds before triggering mass cancel.
    #[serde(default = "default_grace_period")]
    pub grace_period_seconds: u64,
    /// Heartbeat interval in milliseconds.
    #[serde(default = "default_heartbeat_interval")]
    pub heartbeat_interval_ms: u64,
    /// Heartbeat timeout in seconds.
    #[serde(default = "default_heartbeat_timeout")]
    pub heartbeat_timeout_seconds: u64,
    /// Policy for GTC order handling: "include" or "exclude".
    #[serde(default = "default_gtc_policy")]
    pub gtc_policy: String,
}

impl Default for SafetyConfig {
    fn default() -> Self {
        Self {
            enabled: default_safety_enabled(),
            grace_period_seconds: default_grace_period(),
            heartbeat_interval_ms: default_heartbeat_interval(),
            heartbeat_timeout_seconds: default_heartbeat_timeout(),
            gtc_policy: default_gtc_policy(),
        }
    }
}

impl SafetyConfig {
    /// Check if safety features are enabled based on environment.
    ///
    /// Safety features are enabled by default in PAPER/LIVE modes,
    /// disabled in BACKTEST mode since there's no real broker.
    #[must_use]
    pub fn is_enabled_for_env(&self, env: &crate::models::Environment) -> bool {
        if !self.enabled {
            return false;
        }
        // Disable safety for backtest mode
        !env.is_backtest()
    }

    /// Convert to the internal MassCancelConfig type used by the safety module.
    #[must_use]
    pub fn to_mass_cancel_config(&self) -> crate::safety::MassCancelConfig {
        use crate::safety::GtcOrderPolicy;

        let gtc_policy = match self.gtc_policy.to_lowercase().as_str() {
            "exclude" => GtcOrderPolicy::Exclude,
            _ => GtcOrderPolicy::Include, // Default to include for safety
        };

        crate::safety::MassCancelConfig {
            enabled: self.enabled,
            grace_period_seconds: self.grace_period_seconds,
            gtc_policy,
            heartbeat_interval_ms: self.heartbeat_interval_ms,
            heartbeat_timeout_seconds: self.heartbeat_timeout_seconds,
        }
    }
}

const fn default_safety_enabled() -> bool {
    true
}

const fn default_grace_period() -> u64 {
    30 // 30 seconds
}

const fn default_heartbeat_interval() -> u64 {
    30_000 // 30 seconds
}

const fn default_heartbeat_timeout() -> u64 {
    10 // 10 seconds
}

fn default_gtc_policy() -> String {
    "include".to_string()
}

/// Stops configuration for stop-loss and take-profit enforcement.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StopsConfigExternal {
    /// Enable stops enforcement.
    #[serde(default = "default_stops_enabled")]
    pub enabled: bool,
    /// Priority when both stop and target trigger in same bar: "stop_first", "target_first", "high_low_order".
    #[serde(default = "default_same_bar_priority")]
    pub same_bar_priority: String,
    /// Monitoring interval in milliseconds for price checks.
    #[serde(default = "default_monitoring_interval")]
    pub monitoring_interval_ms: u64,
    /// Whether to use bracket orders when available (for stocks).
    #[serde(default = "default_use_bracket_orders")]
    pub use_bracket_orders: bool,
}

impl Default for StopsConfigExternal {
    fn default() -> Self {
        Self {
            enabled: default_stops_enabled(),
            same_bar_priority: default_same_bar_priority(),
            monitoring_interval_ms: default_monitoring_interval(),
            use_bracket_orders: default_use_bracket_orders(),
        }
    }
}

impl StopsConfigExternal {
    /// Check if stops enforcement is enabled based on environment.
    ///
    /// Stops are enabled by default in all environments.
    /// In BACKTEST, uses simulation; in PAPER/LIVE, uses bracket orders or price monitoring.
    #[must_use]
    pub fn is_enabled_for_env(&self, _env: &crate::models::Environment) -> bool {
        self.enabled
    }

    /// Convert to the internal StopsConfig type used by the stops module.
    #[must_use]
    pub fn to_stops_config(&self) -> crate::execution::stops::StopsConfig {
        use crate::execution::stops::SameBarPriority;

        let same_bar_priority = match self.same_bar_priority.to_lowercase().as_str() {
            "target_first" => SameBarPriority::TargetFirst,
            "high_low_order" => SameBarPriority::HighLowOrder,
            _ => SameBarPriority::StopFirst, // Default to stop first (pessimistic)
        };

        crate::execution::stops::StopsConfig {
            same_bar_priority,
            monitoring_interval_ms: self.monitoring_interval_ms,
            min_risk_reward_ratio: None,
            use_bracket_orders: self.use_bracket_orders,
        }
    }
}

const fn default_stops_enabled() -> bool {
    true
}

fn default_same_bar_priority() -> String {
    "stop_first".to_string()
}

const fn default_monitoring_interval() -> u64 {
    100 // 100ms
}

const fn default_use_bracket_orders() -> bool {
    true
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
    // Validate server ports (all three must be different)
    let http = config.server.http_port;
    let grpc = config.server.grpc_port;
    let flight = config.server.flight_port;

    if http == grpc || http == flight || grpc == flight {
        return Err(ConfigError::ValidationError(
            "http_port, grpc_port, and flight_port must all be different".to_string(),
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
        assert_eq!(config.server.flight_port, 50052);
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
  flight_port: 50052
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
  flight_port: 50052
";

        let result = load_config_from_string(yaml);
        let Err(err) = result else {
            panic!("expected error for duplicate ports");
        };
        assert!(err.to_string().contains("must all be different"));
    }

    #[test]
    fn test_validation_invalid_risk_free_rate() {
        let yaml = r"
server:
  http_port: 50051
  grpc_port: 50053
  flight_port: 50052
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
  flight_port: 50052
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

        let config = match load_config_from_string(yaml) {
            Ok(c) => c,
            Err(e) => panic!("should load full config: {e}"),
        };

        assert_eq!(config.server.bind_address, "127.0.0.1");
        assert_eq!(config.feeds.databento.reconnect_delay_ms, 2000);
        assert_eq!(config.brokers.alpaca.base_url, "https://api.alpaca.markets");
        assert!((config.pricing.risk_free_rate - 0.04).abs() < f64::EPSILON);
        assert!((config.constraints.per_instrument.max_notional - 100_000.0).abs() < 1e-10);
        assert!((config.constraints.portfolio.max_leverage - 3.0).abs() < f64::EPSILON);
        assert!((config.constraints.options.max_portfolio_delta - 1000.0).abs() < 1e-10);
        assert_eq!(config.observability.metrics.endpoint, "0.0.0.0:9091");
        assert!((config.observability.tracing.sampling_ratio - 0.5).abs() < f64::EPSILON);
        assert_eq!(config.observability.logging.level, "debug");
        assert!((config.circuit_breaker.default.failure_rate_threshold - 0.3).abs() < f64::EPSILON);
        assert_eq!(config.environment.mode, "LIVE");
    }

    #[test]
    fn test_constraint_limits() {
        let config = ConstraintsConfig::default();

        assert!((config.per_instrument.max_notional - 50000.0).abs() < 1e-10);
        assert_eq!(config.per_instrument.max_units, 1000);
        assert!((config.portfolio.max_gross_notional - 500_000.0).abs() < 1e-10);
        assert!((config.options.max_portfolio_delta - 500.0).abs() < 1e-10);
        assert!((config.buying_power.min_buying_power_ratio - 0.20).abs() < f64::EPSILON);
    }

    #[test]
    fn test_recovery_config_defaults() {
        let config = RecoveryConfig::default();
        assert!(config.enabled);
        assert!(config.auto_resolve_orphans);
        assert!(config.sync_positions);
        assert!(config.abort_on_critical);
        assert!((config.position_qty_tolerance - 0.0).abs() < f64::EPSILON);
        assert!((config.position_price_tolerance_pct - 0.01).abs() < f64::EPSILON);
    }

    #[test]
    fn test_recovery_config_to_internal() {
        let config = RecoveryConfig::default();
        let internal = config.to_recovery_config();

        assert!(internal.enabled);
        assert!(internal.auto_resolve_orphans);
        assert!(internal.sync_positions);
        assert!(internal.abort_on_critical);
        assert_eq!(internal.max_attempts, 3);
    }

    #[test]
    fn test_recovery_config_is_enabled_for_env() {
        use crate::models::Environment;

        let config = RecoveryConfig::default();

        // Recovery should be enabled for PAPER and LIVE
        assert!(config.is_enabled_for_env(&Environment::Paper));
        assert!(config.is_enabled_for_env(&Environment::Live));

        // Recovery should be disabled for BACKTEST
        assert!(!config.is_enabled_for_env(&Environment::Backtest));

        // Explicitly disabled config
        let disabled_config = RecoveryConfig {
            enabled: false,
            ..Default::default()
        };
        assert!(!disabled_config.is_enabled_for_env(&Environment::Paper));
        assert!(!disabled_config.is_enabled_for_env(&Environment::Live));
    }

    #[test]
    fn test_reconciliation_config_defaults() {
        let config = ReconciliationConfig::default();
        assert!(config.enabled);
        assert_eq!(config.interval_secs, 300);
        assert_eq!(config.protection_window_secs, 1800);
        assert_eq!(config.max_order_age_secs, 86400);
        assert!(config.auto_resolve_orphans);
        assert_eq!(config.on_critical_discrepancy, "halt");
    }

    #[test]
    fn test_reconciliation_config_to_internal() {
        let config = ReconciliationConfig::default();
        let internal = config.to_reconciliation_config();

        assert!(internal.on_startup);
        assert!(internal.on_reconnect);
        assert_eq!(internal.periodic_interval_secs, 300);
        assert_eq!(internal.protection_window_secs, 1800);
        assert_eq!(internal.max_order_age_secs, 86400);
        assert!(internal.auto_resolve_orphans);
    }

    #[test]
    fn test_reconciliation_config_critical_action_parsing() {
        // Test halt
        let config = ReconciliationConfig {
            on_critical_discrepancy: "halt".to_string(),
            ..Default::default()
        };
        let internal = config.to_reconciliation_config();
        assert_eq!(
            internal.on_critical_discrepancy,
            crate::execution::reconciliation::CriticalDiscrepancyAction::Halt
        );

        // Test log_and_continue
        let config = ReconciliationConfig {
            on_critical_discrepancy: "log_and_continue".to_string(),
            ..Default::default()
        };
        let internal = config.to_reconciliation_config();
        assert_eq!(
            internal.on_critical_discrepancy,
            crate::execution::reconciliation::CriticalDiscrepancyAction::LogAndContinue
        );

        // Test alert
        let config = ReconciliationConfig {
            on_critical_discrepancy: "alert".to_string(),
            ..Default::default()
        };
        let internal = config.to_reconciliation_config();
        assert_eq!(
            internal.on_critical_discrepancy,
            crate::execution::reconciliation::CriticalDiscrepancyAction::Alert
        );

        // Test default on unknown
        let config = ReconciliationConfig {
            on_critical_discrepancy: "unknown".to_string(),
            ..Default::default()
        };
        let internal = config.to_reconciliation_config();
        assert_eq!(
            internal.on_critical_discrepancy,
            crate::execution::reconciliation::CriticalDiscrepancyAction::Halt
        );
    }

    #[test]
    fn test_reconciliation_config_is_enabled_for_env() {
        use crate::models::Environment;

        let config = ReconciliationConfig::default();

        // Reconciliation should be enabled for PAPER and LIVE
        assert!(config.is_enabled_for_env(&Environment::Paper));
        assert!(config.is_enabled_for_env(&Environment::Live));

        // Reconciliation should be disabled for BACKTEST
        assert!(!config.is_enabled_for_env(&Environment::Backtest));

        // Explicitly disabled config
        let disabled_config = ReconciliationConfig {
            enabled: false,
            ..Default::default()
        };
        assert!(!disabled_config.is_enabled_for_env(&Environment::Paper));
        assert!(!disabled_config.is_enabled_for_env(&Environment::Live));
    }

    #[test]
    fn test_safety_config_defaults() {
        let config = SafetyConfig::default();
        assert!(config.enabled);
        assert_eq!(config.grace_period_seconds, 30);
        assert_eq!(config.heartbeat_interval_ms, 30_000);
        assert_eq!(config.heartbeat_timeout_seconds, 10);
        assert_eq!(config.gtc_policy, "include");
    }

    #[test]
    fn test_safety_config_to_mass_cancel_config() {
        use crate::safety::GtcOrderPolicy;

        let config = SafetyConfig::default();
        let mass_cancel_config = config.to_mass_cancel_config();

        assert!(mass_cancel_config.enabled);
        assert_eq!(mass_cancel_config.grace_period_seconds, 30);
        assert_eq!(mass_cancel_config.gtc_policy, GtcOrderPolicy::Include);
    }

    #[test]
    fn test_safety_config_gtc_policy_parsing() {
        use crate::safety::GtcOrderPolicy;

        // Test include
        let config = SafetyConfig {
            gtc_policy: "include".to_string(),
            ..Default::default()
        };
        let mass_cancel_config = config.to_mass_cancel_config();
        assert_eq!(mass_cancel_config.gtc_policy, GtcOrderPolicy::Include);

        // Test exclude
        let config = SafetyConfig {
            gtc_policy: "exclude".to_string(),
            ..Default::default()
        };
        let mass_cancel_config = config.to_mass_cancel_config();
        assert_eq!(mass_cancel_config.gtc_policy, GtcOrderPolicy::Exclude);

        // Test default on unknown
        let config = SafetyConfig {
            gtc_policy: "unknown".to_string(),
            ..Default::default()
        };
        let mass_cancel_config = config.to_mass_cancel_config();
        assert_eq!(mass_cancel_config.gtc_policy, GtcOrderPolicy::Include);
    }

    #[test]
    fn test_safety_config_is_enabled_for_env() {
        use crate::models::Environment;

        let config = SafetyConfig::default();

        // Safety should be enabled for PAPER and LIVE
        assert!(config.is_enabled_for_env(&Environment::Paper));
        assert!(config.is_enabled_for_env(&Environment::Live));

        // Safety should be disabled for BACKTEST
        assert!(!config.is_enabled_for_env(&Environment::Backtest));

        // Explicitly disabled config
        let disabled_config = SafetyConfig {
            enabled: false,
            ..Default::default()
        };
        assert!(!disabled_config.is_enabled_for_env(&Environment::Paper));
        assert!(!disabled_config.is_enabled_for_env(&Environment::Live));
    }

    #[test]
    fn test_stops_config_defaults() {
        let config = StopsConfigExternal::default();
        assert!(config.enabled);
        assert_eq!(config.same_bar_priority, "stop_first");
        assert_eq!(config.monitoring_interval_ms, 100);
        assert!(config.use_bracket_orders);
    }

    #[test]
    fn test_stops_config_to_internal() {
        use crate::execution::stops::SameBarPriority;

        let config = StopsConfigExternal::default();
        let internal = config.to_stops_config();

        assert_eq!(internal.same_bar_priority, SameBarPriority::StopFirst);
        assert_eq!(internal.monitoring_interval_ms, 100);
        assert!(internal.use_bracket_orders);
    }

    #[test]
    fn test_stops_config_same_bar_priority_parsing() {
        use crate::execution::stops::SameBarPriority;

        // Test stop_first
        let config = StopsConfigExternal {
            same_bar_priority: "stop_first".to_string(),
            ..Default::default()
        };
        let internal = config.to_stops_config();
        assert_eq!(internal.same_bar_priority, SameBarPriority::StopFirst);

        // Test target_first
        let config = StopsConfigExternal {
            same_bar_priority: "target_first".to_string(),
            ..Default::default()
        };
        let internal = config.to_stops_config();
        assert_eq!(internal.same_bar_priority, SameBarPriority::TargetFirst);

        // Test high_low_order
        let config = StopsConfigExternal {
            same_bar_priority: "high_low_order".to_string(),
            ..Default::default()
        };
        let internal = config.to_stops_config();
        assert_eq!(internal.same_bar_priority, SameBarPriority::HighLowOrder);

        // Test default on unknown
        let config = StopsConfigExternal {
            same_bar_priority: "unknown".to_string(),
            ..Default::default()
        };
        let internal = config.to_stops_config();
        assert_eq!(internal.same_bar_priority, SameBarPriority::StopFirst);
    }

    #[test]
    fn test_stops_config_is_enabled_for_env() {
        use crate::models::Environment;

        let config = StopsConfigExternal::default();

        // Stops should be enabled for all environments
        assert!(config.is_enabled_for_env(&Environment::Paper));
        assert!(config.is_enabled_for_env(&Environment::Live));
        assert!(config.is_enabled_for_env(&Environment::Backtest));

        // Explicitly disabled config
        let disabled_config = StopsConfigExternal {
            enabled: false,
            ..Default::default()
        };
        assert!(!disabled_config.is_enabled_for_env(&Environment::Paper));
        assert!(!disabled_config.is_enabled_for_env(&Environment::Live));
        assert!(!disabled_config.is_enabled_for_env(&Environment::Backtest));
    }
}

// ============================================
// Environment Validation
// ============================================

use crate::models::Environment;

/// Errors from environment validation at startup.
#[derive(Debug, thiserror::Error)]
pub enum StartupValidationError {
    /// Missing required credentials for the environment.
    #[error("Missing required credentials for {environment} mode: {details}")]
    MissingCredentials {
        /// The trading environment.
        environment: String,
        /// Details about which credentials are missing.
        details: String,
    },

    /// Invalid environment configuration.
    #[error("Invalid environment configuration: {0}")]
    InvalidConfiguration(String),
}

/// Result of startup environment validation.
#[derive(Debug)]
pub struct StartupValidation {
    /// Whether validation passed.
    pub valid: bool,
    /// Warning messages (non-fatal).
    pub warnings: Vec<String>,
}

impl StartupValidation {
    /// Create a successful validation result.
    #[must_use]
    pub const fn ok() -> Self {
        Self {
            valid: true,
            warnings: Vec::new(),
        }
    }

    /// Create a successful validation with warnings.
    #[must_use]
    pub const fn ok_with_warnings(warnings: Vec<String>) -> Self {
        Self {
            valid: true,
            warnings,
        }
    }
}

/// Validate environment configuration at startup.
///
/// This function performs environment-aware validation of credentials and
/// configuration. It ensures that:
///
/// - PAPER and LIVE modes have required broker credentials
/// - BACKTEST mode can run without credentials
/// - Clear error messages are provided for missing configuration
///
/// # Arguments
///
/// * `config` - The loaded configuration
/// * `environment` - The trading environment
///
/// # Errors
///
/// Returns `StartupValidationError` if required credentials are missing
/// for the given environment.
///
/// # Example
///
/// ```rust,ignore
/// use execution_engine::config::{Config, validate_startup_environment};
/// use execution_engine::models::Environment;
///
/// let config = load_config(None)?;
/// let env = Environment::Paper;
///
/// validate_startup_environment(&config, env)?;
/// ```
pub fn validate_startup_environment(
    config: &Config,
    environment: Environment,
) -> Result<StartupValidation, StartupValidationError> {
    match environment {
        Environment::Backtest => {
            // Backtest mode requires no credentials
            let mut warnings = Vec::new();

            if !config.brokers.alpaca.api_key.is_empty() {
                warnings.push(
                    "Alpaca credentials configured but not used in BACKTEST mode".to_string(),
                );
            }

            Ok(StartupValidation::ok_with_warnings(warnings))
        }

        Environment::Paper | Environment::Live => {
            // Paper and Live modes require Alpaca credentials
            let mut missing = Vec::new();

            if config.brokers.alpaca.api_key.is_empty() {
                missing.push("ALPACA_KEY");
            }

            if config.brokers.alpaca.api_secret.is_empty() {
                missing.push("ALPACA_SECRET");
            }

            if !missing.is_empty() {
                let env_name = if environment.is_live() {
                    "LIVE"
                } else {
                    "PAPER"
                };
                return Err(StartupValidationError::MissingCredentials {
                    environment: env_name.to_string(),
                    details: format!(
                        "Required environment variables not set: {}. \
                         Set these in your environment or config.yaml.",
                        missing.join(", ")
                    ),
                });
            }

            // Additional validation for LIVE mode
            if environment.is_live() {
                let mut warnings = Vec::new();

                // Warn if using paper API URL in live mode
                if config.brokers.alpaca.base_url.contains("paper") {
                    warnings.push(
                        "LIVE mode configured but using paper API URL. \
                         This may indicate misconfiguration."
                            .to_string(),
                    );
                }

                return Ok(StartupValidation::ok_with_warnings(warnings));
            }

            Ok(StartupValidation::ok())
        }
    }
}

/// Validate that required credentials are present, returning a detailed error message.
///
/// This is a convenience function for quick credential checks.
///
/// # Arguments
///
/// * `api_key` - The Alpaca API key
/// * `api_secret` - The Alpaca API secret
/// * `environment` - The trading environment
///
/// # Errors
///
/// Returns an error string if credentials are missing and required.
pub fn require_credentials(
    api_key: &str,
    api_secret: &str,
    environment: Environment,
) -> Result<(), String> {
    if environment.is_backtest() {
        return Ok(());
    }

    if api_key.is_empty() || api_secret.is_empty() {
        let env_name = if environment.is_live() {
            "LIVE"
        } else {
            "PAPER"
        };
        return Err(format!(
            "Alpaca credentials required for {env_name} mode.\n\n\
             Missing:\n\
             {}{}
             \n\
             To fix:\n\
             1. Set ALPACA_KEY and ALPACA_SECRET environment variables, or\n\
             2. Configure credentials in config.yaml under brokers.alpaca",
            if api_key.is_empty() {
                "  - ALPACA_KEY\n"
            } else {
                ""
            },
            if api_secret.is_empty() {
                "  - ALPACA_SECRET\n"
            } else {
                ""
            }
        ));
    }

    Ok(())
}

#[cfg(test)]
mod validation_tests {
    use super::*;

    fn make_config_with_credentials(key: &str, secret: &str) -> Config {
        Config {
            server: ServerConfig::default(),
            feeds: FeedsConfig::default(),
            brokers: BrokersConfig {
                alpaca: AlpacaConfig {
                    api_key: key.to_string(),
                    api_secret: secret.to_string(),
                    ..Default::default()
                },
            },
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
        }
    }

    #[test]
    fn test_backtest_no_credentials_required() {
        let config = make_config_with_credentials("", "");
        let result = validate_startup_environment(&config, Environment::Backtest);

        assert!(result.is_ok());
        let validation = match result {
            Ok(v) => v,
            Err(e) => panic!("backtest should validate without credentials: {e}"),
        };
        assert!(validation.valid);
    }

    #[test]
    fn test_backtest_with_credentials_warns() {
        let config = make_config_with_credentials("key", "secret");
        let result = validate_startup_environment(&config, Environment::Backtest);

        assert!(result.is_ok());
        let validation = match result {
            Ok(v) => v,
            Err(e) => panic!("backtest with credentials should validate: {e}"),
        };
        assert!(validation.valid);
        assert!(!validation.warnings.is_empty());
    }

    #[test]
    fn test_paper_requires_credentials() {
        let config = make_config_with_credentials("", "");
        let result = validate_startup_environment(&config, Environment::Paper);

        let Err(err) = result else {
            panic!("expected error for paper without credentials");
        };
        assert!(err.to_string().contains("PAPER"));
        assert!(err.to_string().contains("ALPACA_KEY"));
    }

    #[test]
    fn test_paper_with_credentials_ok() {
        let config = make_config_with_credentials("key", "secret");
        let result = validate_startup_environment(&config, Environment::Paper);

        assert!(result.is_ok());
    }

    #[test]
    fn test_live_requires_credentials() {
        let config = make_config_with_credentials("", "");
        let result = validate_startup_environment(&config, Environment::Live);

        let Err(err) = result else {
            panic!("expected error for live without credentials");
        };
        assert!(err.to_string().contains("LIVE"));
    }

    #[test]
    fn test_live_with_paper_url_warns() {
        let config = Config {
            brokers: BrokersConfig {
                alpaca: AlpacaConfig {
                    api_key: "key".to_string(),
                    api_secret: "secret".to_string(),
                    base_url: "https://paper-api.alpaca.markets".to_string(),
                    ..Default::default()
                },
            },
            ..make_config_with_credentials("key", "secret")
        };

        let result = validate_startup_environment(&config, Environment::Live);

        assert!(result.is_ok());
        let validation = match result {
            Ok(v) => v,
            Err(e) => panic!("live with paper URL should validate with warning: {e}"),
        };
        assert!(!validation.warnings.is_empty());
        assert!(validation.warnings[0].contains("paper"));
    }

    #[test]
    fn test_require_credentials_backtest_ok() {
        let result = require_credentials("", "", Environment::Backtest);
        assert!(result.is_ok());
    }

    #[test]
    fn test_require_credentials_paper_missing() {
        let result = require_credentials("", "", Environment::Paper);
        let Err(err) = result else {
            panic!("expected error for paper missing credentials");
        };
        assert!(err.contains("PAPER"));
        assert!(err.contains("ALPACA_KEY"));
        assert!(err.contains("ALPACA_SECRET"));
    }

    #[test]
    fn test_require_credentials_paper_partial() {
        let result = require_credentials("key", "", Environment::Paper);
        let Err(err) = result else {
            panic!("expected error for paper with partial credentials");
        };
        assert!(err.contains("ALPACA_SECRET"));
        assert!(!err.contains("ALPACA_KEY\n")); // Key should not be listed as missing
    }

    #[test]
    fn test_require_credentials_live_ok() {
        let result = require_credentials("key", "secret", Environment::Live);
        assert!(result.is_ok());
    }
}
