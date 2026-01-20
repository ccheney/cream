//! Alpaca adapter configuration.

use std::time::Duration;

/// Environment for Alpaca API.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AlpacaEnvironment {
    /// Paper trading (simulated).
    Paper,
    /// Live trading (real money).
    Live,
}

impl AlpacaEnvironment {
    /// Get the base URL for the trading API.
    #[must_use]
    pub const fn trading_base_url(&self) -> &'static str {
        match self {
            Self::Paper => "https://paper-api.alpaca.markets",
            Self::Live => "https://api.alpaca.markets",
        }
    }

    /// Get the base URL for the market data API.
    #[must_use]
    pub const fn data_base_url(&self) -> &'static str {
        "https://data.alpaca.markets"
    }

    /// Check if this is live trading.
    #[must_use]
    pub const fn is_live(&self) -> bool {
        matches!(self, Self::Live)
    }
}

impl std::fmt::Display for AlpacaEnvironment {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Paper => write!(f, "PAPER"),
            Self::Live => write!(f, "LIVE"),
        }
    }
}

/// Configuration for the Alpaca broker adapter.
#[derive(Debug, Clone)]
pub struct AlpacaConfig {
    /// API key.
    pub api_key: String,
    /// API secret.
    pub api_secret: String,
    /// Trading environment.
    pub environment: AlpacaEnvironment,
    /// HTTP request timeout.
    pub timeout: Duration,
    /// Retry policy configuration.
    pub retry: RetryConfig,
}

impl AlpacaConfig {
    /// Create a new configuration.
    #[must_use]
    pub fn new(api_key: String, api_secret: String, environment: AlpacaEnvironment) -> Self {
        Self {
            api_key,
            api_secret,
            environment,
            timeout: Duration::from_secs(30),
            retry: RetryConfig::default(),
        }
    }

    /// Set the HTTP timeout.
    #[must_use]
    pub const fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    /// Set the retry configuration.
    #[must_use]
    pub const fn with_retry(mut self, retry: RetryConfig) -> Self {
        self.retry = retry;
        self
    }

    /// Get the trading API base URL.
    #[must_use]
    pub const fn trading_base_url(&self) -> &'static str {
        self.environment.trading_base_url()
    }

    /// Get the data API base URL.
    #[must_use]
    pub const fn data_base_url(&self) -> &'static str {
        self.environment.data_base_url()
    }
}

/// Retry configuration.
#[derive(Debug, Clone)]
pub struct RetryConfig {
    /// Maximum number of retry attempts.
    pub max_attempts: u32,
    /// Initial backoff duration.
    pub initial_backoff: Duration,
    /// Maximum backoff duration.
    pub max_backoff: Duration,
    /// Backoff multiplier.
    pub multiplier: f64,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_attempts: 3,
            initial_backoff: Duration::from_millis(100),
            max_backoff: Duration::from_secs(10),
            multiplier: 2.0,
        }
    }
}

#[cfg(test)]
mod tests {
    #![allow(clippy::float_cmp)]
    use super::*;

    #[test]
    fn paper_environment_urls() {
        let env = AlpacaEnvironment::Paper;
        assert!(env.trading_base_url().contains("paper"));
        assert!(!env.is_live());
    }

    #[test]
    fn live_environment_urls() {
        let env = AlpacaEnvironment::Live;
        assert!(!env.trading_base_url().contains("paper"));
        assert!(env.is_live());
    }

    #[test]
    fn config_creation() {
        let config = AlpacaConfig::new(
            "key".to_string(),
            "secret".to_string(),
            AlpacaEnvironment::Paper,
        );
        assert_eq!(config.api_key, "key");
        assert_eq!(config.api_secret, "secret");
        assert!(!config.environment.is_live());
    }

    #[test]
    fn config_with_timeout() {
        let config = AlpacaConfig::new(
            "key".to_string(),
            "secret".to_string(),
            AlpacaEnvironment::Paper,
        )
        .with_timeout(Duration::from_secs(60));
        assert_eq!(config.timeout, Duration::from_secs(60));
    }

    #[test]
    fn config_with_retry() {
        let retry = RetryConfig {
            max_attempts: 5,
            initial_backoff: Duration::from_millis(200),
            max_backoff: Duration::from_secs(30),
            multiplier: 3.0,
        };
        let config = AlpacaConfig::new(
            "key".to_string(),
            "secret".to_string(),
            AlpacaEnvironment::Paper,
        )
        .with_retry(retry);
        assert_eq!(config.retry.max_attempts, 5);
    }

    #[test]
    fn config_trading_base_url() {
        let config = AlpacaConfig::new(
            "key".to_string(),
            "secret".to_string(),
            AlpacaEnvironment::Paper,
        );
        assert!(config.trading_base_url().contains("paper"));
    }

    #[test]
    fn config_data_base_url() {
        let config = AlpacaConfig::new(
            "key".to_string(),
            "secret".to_string(),
            AlpacaEnvironment::Paper,
        );
        assert!(config.data_base_url().contains("data.alpaca"));
    }

    #[test]
    fn environment_display() {
        assert_eq!(format!("{}", AlpacaEnvironment::Paper), "PAPER");
        assert_eq!(format!("{}", AlpacaEnvironment::Live), "LIVE");
    }

    #[test]
    fn retry_config_default() {
        let retry = RetryConfig::default();
        assert_eq!(retry.max_attempts, 3);
        assert_eq!(retry.initial_backoff, Duration::from_millis(100));
        assert_eq!(retry.max_backoff, Duration::from_secs(10));
        assert_eq!(retry.multiplier, 2.0);
    }
}
