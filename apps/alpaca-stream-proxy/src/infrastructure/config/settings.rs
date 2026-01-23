//! Proxy Configuration Settings
//!
//! Configuration types for the stream proxy, loaded from environment variables.

use std::time::Duration;

/// Market data feed type for Alpaca streams.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum DataFeed {
    /// SIP (Securities Information Processor) - Full market data.
    #[default]
    Sip,
    /// IEX (Investors Exchange) - Free tier with limited data.
    Iex,
}

impl DataFeed {
    /// Parse feed type from string.
    #[must_use]
    pub fn from_str_case_insensitive(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "iex" => Self::Iex,
            _ => Self::Sip,
        }
    }

    /// Get the feed name for WebSocket URLs.
    #[must_use]
    pub const fn as_str(&self) -> &'static str {
        match self {
            Self::Sip => "sip",
            Self::Iex => "iex",
        }
    }
}

/// Trading environment (paper vs live).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Environment {
    /// Paper trading environment (simulated).
    #[default]
    Paper,
    /// Live trading environment (real money).
    Live,
}

impl Environment {
    /// Parse environment from string.
    #[must_use]
    pub fn from_str_case_insensitive(s: &str) -> Self {
        match s.to_uppercase().as_str() {
            "LIVE" => Self::Live,
            _ => Self::Paper,
        }
    }

    /// Check if this is the live environment.
    #[must_use]
    pub const fn is_live(&self) -> bool {
        matches!(self, Self::Live)
    }

    /// Get the environment name.
    #[must_use]
    pub const fn as_str(&self) -> &'static str {
        match self {
            Self::Paper => "paper",
            Self::Live => "live",
        }
    }
}

/// Alpaca API credentials.
#[derive(Clone)]
pub struct Credentials {
    api_key: String,
    api_secret: String,
}

impl Credentials {
    /// Create new credentials.
    #[must_use]
    pub const fn new(api_key: String, api_secret: String) -> Self {
        Self {
            api_key,
            api_secret,
        }
    }

    /// Get the API key.
    #[must_use]
    pub fn api_key(&self) -> &str {
        &self.api_key
    }

    /// Get the API secret.
    #[must_use]
    pub fn api_secret(&self) -> &str {
        &self.api_secret
    }
}

impl std::fmt::Debug for Credentials {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Credentials")
            .field("api_key", &"[REDACTED]")
            .field("api_secret", &"[REDACTED]")
            .finish()
    }
}

/// WebSocket connection settings.
#[derive(Debug, Clone)]
pub struct WebSocketSettings {
    /// Heartbeat ping interval.
    pub heartbeat_interval: Duration,
    /// Heartbeat timeout before considering connection dead.
    pub heartbeat_timeout: Duration,
    /// Initial reconnection delay.
    pub reconnect_delay_initial: Duration,
    /// Maximum reconnection delay.
    pub reconnect_delay_max: Duration,
    /// Reconnection delay multiplier for exponential backoff.
    pub reconnect_delay_multiplier: f64,
    /// Maximum reconnection attempts before giving up (0 = unlimited).
    pub max_reconnect_attempts: u32,
}

impl Default for WebSocketSettings {
    fn default() -> Self {
        Self {
            heartbeat_interval: Duration::from_secs(30),
            heartbeat_timeout: Duration::from_secs(60),
            reconnect_delay_initial: Duration::from_millis(500),
            reconnect_delay_max: Duration::from_secs(30),
            reconnect_delay_multiplier: 2.0,
            max_reconnect_attempts: 0, // Unlimited
        }
    }
}

/// Broadcast channel settings.
#[derive(Debug, Clone)]
pub struct BroadcastSettings {
    /// Capacity of stock quote broadcast channel.
    pub stock_quotes_capacity: usize,
    /// Capacity of stock trade broadcast channel.
    pub stock_trades_capacity: usize,
    /// Capacity of stock bar broadcast channel.
    pub stock_bars_capacity: usize,
    /// Capacity of options quote broadcast channel.
    pub options_quotes_capacity: usize,
    /// Capacity of options trade broadcast channel.
    pub options_trades_capacity: usize,
    /// Capacity of order update broadcast channel.
    pub order_updates_capacity: usize,
}

impl Default for BroadcastSettings {
    fn default() -> Self {
        Self {
            stock_quotes_capacity: 10_000,
            stock_trades_capacity: 10_000,
            stock_bars_capacity: 1_000,
            options_quotes_capacity: 50_000,
            options_trades_capacity: 10_000,
            order_updates_capacity: 1_000,
        }
    }
}

/// Server port settings.
#[derive(Debug, Clone)]
pub struct ServerSettings {
    /// gRPC server port.
    pub grpc_port: u16,
    /// Health check HTTP port.
    pub health_port: u16,
    /// Prometheus metrics port (0 = disabled).
    pub metrics_port: u16,
}

impl Default for ServerSettings {
    fn default() -> Self {
        Self {
            grpc_port: 50052,
            health_port: 8082,
            metrics_port: 9090,
        }
    }
}

/// Complete proxy configuration.
#[derive(Debug, Clone)]
pub struct ProxyConfig {
    /// Trading environment.
    pub environment: Environment,
    /// Market data feed type.
    pub feed: DataFeed,
    /// API credentials.
    pub credentials: Credentials,
    /// Server port settings.
    pub server: ServerSettings,
    /// WebSocket connection settings.
    pub websocket: WebSocketSettings,
    /// Broadcast channel settings.
    pub broadcast: BroadcastSettings,
}

impl ProxyConfig {
    /// Create configuration from environment variables.
    ///
    /// # Errors
    ///
    /// Returns an error if required environment variables are missing.
    pub fn from_env() -> Result<Self, ConfigError> {
        let api_key = std::env::var("ALPACA_KEY")
            .map_err(|_| ConfigError::MissingEnvVar("ALPACA_KEY".to_string()))?;

        let api_secret = std::env::var("ALPACA_SECRET")
            .map_err(|_| ConfigError::MissingEnvVar("ALPACA_SECRET".to_string()))?;

        if api_key.is_empty() {
            return Err(ConfigError::EmptyValue("ALPACA_KEY".to_string()));
        }

        if api_secret.is_empty() {
            return Err(ConfigError::EmptyValue("ALPACA_SECRET".to_string()));
        }

        let environment = std::env::var("CREAM_ENV")
            .map(|s| Environment::from_str_case_insensitive(&s))
            .unwrap_or_default();

        let feed = std::env::var("ALPACA_FEED")
            .map(|s| DataFeed::from_str_case_insensitive(&s))
            .unwrap_or_default();

        let server = ServerSettings {
            grpc_port: parse_env_u16(
                "STREAM_PROXY_GRPC_PORT",
                ServerSettings::default().grpc_port,
            ),
            health_port: parse_env_u16(
                "STREAM_PROXY_HEALTH_PORT",
                ServerSettings::default().health_port,
            ),
            metrics_port: parse_env_u16(
                "STREAM_PROXY_METRICS_PORT",
                ServerSettings::default().metrics_port,
            ),
        };

        let websocket = WebSocketSettings {
            heartbeat_interval: parse_env_duration_secs(
                "STREAM_PROXY_HEARTBEAT_INTERVAL_SECS",
                WebSocketSettings::default().heartbeat_interval,
            ),
            heartbeat_timeout: parse_env_duration_secs(
                "STREAM_PROXY_HEARTBEAT_TIMEOUT_SECS",
                WebSocketSettings::default().heartbeat_timeout,
            ),
            reconnect_delay_initial: parse_env_duration_millis(
                "STREAM_PROXY_RECONNECT_DELAY_INITIAL_MS",
                WebSocketSettings::default().reconnect_delay_initial,
            ),
            reconnect_delay_max: parse_env_duration_secs(
                "STREAM_PROXY_RECONNECT_DELAY_MAX_SECS",
                WebSocketSettings::default().reconnect_delay_max,
            ),
            reconnect_delay_multiplier: parse_env_f64(
                "STREAM_PROXY_RECONNECT_DELAY_MULTIPLIER",
                WebSocketSettings::default().reconnect_delay_multiplier,
            ),
            max_reconnect_attempts: parse_env_u32(
                "STREAM_PROXY_MAX_RECONNECT_ATTEMPTS",
                WebSocketSettings::default().max_reconnect_attempts,
            ),
        };

        let broadcast = BroadcastSettings {
            stock_quotes_capacity: parse_env_usize(
                "STREAM_PROXY_STOCK_QUOTES_CAPACITY",
                BroadcastSettings::default().stock_quotes_capacity,
            ),
            stock_trades_capacity: parse_env_usize(
                "STREAM_PROXY_STOCK_TRADES_CAPACITY",
                BroadcastSettings::default().stock_trades_capacity,
            ),
            stock_bars_capacity: parse_env_usize(
                "STREAM_PROXY_STOCK_BARS_CAPACITY",
                BroadcastSettings::default().stock_bars_capacity,
            ),
            options_quotes_capacity: parse_env_usize(
                "STREAM_PROXY_OPTIONS_QUOTES_CAPACITY",
                BroadcastSettings::default().options_quotes_capacity,
            ),
            options_trades_capacity: parse_env_usize(
                "STREAM_PROXY_OPTIONS_TRADES_CAPACITY",
                BroadcastSettings::default().options_trades_capacity,
            ),
            order_updates_capacity: parse_env_usize(
                "STREAM_PROXY_ORDER_UPDATES_CAPACITY",
                BroadcastSettings::default().order_updates_capacity,
            ),
        };

        Ok(Self {
            environment,
            feed,
            credentials: Credentials::new(api_key, api_secret),
            server,
            websocket,
            broadcast,
        })
    }

    /// Get the stock stream WebSocket URL.
    ///
    /// Note: Market data streams always use production URLs regardless of
    /// trading environment. Only trade updates use paper vs live endpoints.
    #[must_use]
    pub fn stock_stream_url(&self) -> String {
        format!("wss://stream.data.alpaca.markets/v2/{}", self.feed.as_str())
    }

    /// Get the options stream WebSocket URL.
    ///
    /// Paper uses `indicative` feed (basic plan), live uses `opra` (Algo Trader Plus).
    /// Both use production URLs - market data is the same for paper/live trading.
    #[must_use]
    pub fn options_stream_url(&self) -> String {
        if self.environment.is_live() {
            "wss://stream.data.alpaca.markets/v1beta1/opra".to_string()
        } else {
            "wss://stream.data.alpaca.markets/v1beta1/indicative".to_string()
        }
    }

    /// Get the trade updates WebSocket URL.
    #[must_use]
    pub fn trade_updates_url(&self) -> String {
        if self.environment.is_live() {
            "wss://api.alpaca.markets/stream".to_string()
        } else {
            "wss://paper-api.alpaca.markets/stream".to_string()
        }
    }
}

/// Configuration error.
#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    /// Required environment variable is missing.
    #[error("missing required environment variable: {0}")]
    MissingEnvVar(String),
    /// Environment variable has empty value.
    #[error("environment variable {0} cannot be empty")]
    EmptyValue(String),
}

fn parse_env_u16(key: &str, default: u16) -> u16 {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

fn parse_env_u32(key: &str, default: u32) -> u32 {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

fn parse_env_usize(key: &str, default: usize) -> usize {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

fn parse_env_f64(key: &str, default: f64) -> f64 {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

fn parse_env_duration_secs(key: &str, default: Duration) -> Duration {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .map_or(default, Duration::from_secs)
}

fn parse_env_duration_millis(key: &str, default: Duration) -> Duration {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .map_or(default, Duration::from_millis)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn data_feed_parsing() {
        assert_eq!(DataFeed::from_str_case_insensitive("sip"), DataFeed::Sip);
        assert_eq!(DataFeed::from_str_case_insensitive("SIP"), DataFeed::Sip);
        assert_eq!(DataFeed::from_str_case_insensitive("iex"), DataFeed::Iex);
        assert_eq!(DataFeed::from_str_case_insensitive("IEX"), DataFeed::Iex);
        assert_eq!(
            DataFeed::from_str_case_insensitive("unknown"),
            DataFeed::Sip
        );
    }

    #[test]
    fn environment_parsing() {
        assert_eq!(
            Environment::from_str_case_insensitive("live"),
            Environment::Live
        );
        assert_eq!(
            Environment::from_str_case_insensitive("LIVE"),
            Environment::Live
        );
        assert_eq!(
            Environment::from_str_case_insensitive("paper"),
            Environment::Paper
        );
        assert_eq!(
            Environment::from_str_case_insensitive("PAPER"),
            Environment::Paper
        );
        assert_eq!(
            Environment::from_str_case_insensitive("unknown"),
            Environment::Paper
        );
    }

    #[test]
    fn environment_is_live() {
        assert!(Environment::Live.is_live());
        assert!(!Environment::Paper.is_live());
    }

    #[test]
    fn credentials_redacted_debug() {
        let creds = Credentials::new("key123".to_string(), "secret456".to_string());
        let debug = format!("{creds:?}");
        assert!(!debug.contains("key123"));
        assert!(!debug.contains("secret456"));
        assert!(debug.contains("[REDACTED]"));
    }

    #[test]
    fn websocket_settings_defaults() {
        let settings = WebSocketSettings::default();
        assert_eq!(settings.heartbeat_interval, Duration::from_secs(30));
        assert_eq!(settings.heartbeat_timeout, Duration::from_secs(60));
        assert_eq!(settings.reconnect_delay_initial, Duration::from_millis(500));
        assert_eq!(settings.reconnect_delay_max, Duration::from_secs(30));
        assert!((settings.reconnect_delay_multiplier - 2.0).abs() < f64::EPSILON);
    }

    #[test]
    fn broadcast_settings_defaults() {
        let settings = BroadcastSettings::default();
        assert_eq!(settings.stock_quotes_capacity, 10_000);
        assert_eq!(settings.options_quotes_capacity, 50_000);
    }

    #[test]
    fn server_settings_defaults() {
        let settings = ServerSettings::default();
        assert_eq!(settings.grpc_port, 50052);
        assert_eq!(settings.health_port, 8082);
        assert_eq!(settings.metrics_port, 9090);
    }
}
