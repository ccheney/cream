//! Alpaca WebSocket feed consumer.
//!
//! Provides real-time market data streaming using the `alpaca-websocket` crate.
//! Integrates with existing health tracking, gap recovery, and circuit breaker infrastructure.
//!
//! # Architecture
//!
//! **100% WebSocket streaming. No HTTP fallback. No polling.**
//!
//! ```text
//! ┌─────────────────┐     ┌──────────────────┐     ┌────────────────────┐
//! │   AlpacaFeed    │────>│ tokio::mpsc      │────>│ MicrostructureMan  │
//! │  (ws consumer)  │     │ channel          │     │ (order book state) │
//! └─────────────────┘     └──────────────────┘     └────────────────────┘
//! ```
//!
//! # WebSocket Endpoints
//!
//! - Stocks (SIP): `wss://stream.data.alpaca.markets/v2/sip`
//! - Stocks (IEX): `wss://stream.data.alpaca.markets/v2/iex`
//! - Options: `wss://stream.data.alpaca.markets/v1beta1/options`
//! - Crypto: `wss://stream.data.alpaca.markets/v1beta3/crypto/us`
//!
//! # Usage
//!
//! ```ignore
//! use execution_engine::feed::{AlpacaFeed, AlpacaMessage};
//! use tokio::sync::mpsc;
//!
//! let config = AlpacaFeedConfig::from_env();
//! let (tx, rx) = mpsc::channel(10_000);
//! let feed = AlpacaFeed::new(config, tx);
//!
//! // Spawn the feed consumer
//! tokio::spawn(async move {
//!     feed.start(vec!["AAPL".to_string(), "MSFT".to_string()]).await
//! });
//! ```

use alpaca_base::{Credentials, Environment};
use alpaca_websocket::{AlpacaWebSocketClient, MarketDataUpdate, SubscriptionBuilder};
use futures_util::StreamExt;
use rust_decimal::Decimal;
use std::sync::Arc;
use std::time::Duration;
use thiserror::Error;
use tokio::sync::mpsc;
use tracing::{debug, error, info, warn};

use super::{FeedHealthTracker, GapRecoveryManager};
use crate::config::AlpacaFeedConfig as AlpacaConfig;
use crate::resilience::CircuitBreaker;

// ============================================================================
// Constants
// ============================================================================

/// Default channel buffer size.
const DEFAULT_CHANNEL_BUFFER: usize = 10_000;

/// Default reconnection delay.
const DEFAULT_RECONNECT_DELAY: Duration = Duration::from_secs(5);

/// Maximum reconnection attempts before giving up.
const MAX_RECONNECT_ATTEMPTS: u32 = 10;

// ============================================================================
// Error Types
// ============================================================================

/// Errors from the Alpaca feed.
#[derive(Debug, Error)]
pub enum AlpacaError {
    /// Failed to build the client.
    #[error("failed to build Alpaca client: {0}")]
    ClientBuild(String),

    /// Failed to connect.
    #[error("failed to connect to Alpaca: {0}")]
    Connection(String),

    /// Failed to subscribe.
    #[error("subscription failed: {0}")]
    Subscription(String),

    /// Stream error during message processing.
    #[error("stream error: {0}")]
    Stream(String),

    /// Channel send error.
    #[error("channel send error")]
    ChannelSend,

    /// API key not configured.
    #[error("ALPACA_KEY or ALPACA_SECRET environment variable not set")]
    MissingApiKey,

    /// Reconnection failed after max attempts.
    #[error("reconnection failed after {0} attempts")]
    ReconnectionFailed(u32),
}

// ============================================================================
// Message Types
// ============================================================================

/// Messages emitted by the Alpaca feed.
///
/// These messages are compatible with the existing `FeedProcessor` which
/// expects trade and quote updates for the microstructure manager.
#[derive(Debug, Clone)]
pub enum AlpacaMessage {
    /// A trade occurred.
    Trade {
        /// Symbol.
        symbol: String,
        /// Trade price.
        price: Decimal,
        /// Trade size.
        size: Decimal,
        /// Event timestamp (milliseconds since epoch).
        ts_event: i64,
    },

    /// A quote (BBO) update.
    Quote {
        /// Symbol.
        symbol: String,
        /// Best bid price.
        bid: Decimal,
        /// Best ask price.
        ask: Decimal,
        /// Bid size.
        bid_size: Decimal,
        /// Ask size.
        ask_size: Decimal,
        /// Event timestamp (milliseconds since epoch).
        ts_event: i64,
    },

    /// OHLCV bar (aggregated).
    Bar {
        /// Symbol.
        symbol: String,
        /// Open price.
        open: Decimal,
        /// High price.
        high: Decimal,
        /// Low price.
        low: Decimal,
        /// Close price.
        close: Decimal,
        /// Volume.
        volume: u64,
        /// Event timestamp (milliseconds since epoch).
        ts_event: i64,
    },

    /// Feed connected.
    Connected,

    /// Feed disconnected.
    Disconnected {
        /// Reason for disconnection.
        reason: String,
    },

    /// Feed error.
    Error {
        /// Error message.
        message: String,
    },
}

// ============================================================================
// Feed Configuration
// ============================================================================

/// Configuration for the Alpaca feed.
#[derive(Debug, Clone)]
pub struct AlpacaFeedConfig {
    /// API key.
    pub api_key: String,
    /// API secret.
    pub api_secret: String,
    /// Feed type: "sip" for Algo Trader Plus, "iex" for Basic.
    pub feed: String,
    /// Reconnection delay.
    pub reconnect_delay: Duration,
    /// Maximum reconnection attempts.
    pub max_reconnect_attempts: u32,
    /// Channel buffer size.
    pub channel_buffer: usize,
    /// Whether to use paper trading environment.
    pub paper: bool,
}

impl From<&AlpacaConfig> for AlpacaFeedConfig {
    fn from(config: &AlpacaConfig) -> Self {
        Self {
            api_key: config.api_key.clone(),
            api_secret: config.api_secret.clone(),
            feed: config.feed.clone(),
            reconnect_delay: Duration::from_millis(config.reconnect_delay_ms),
            max_reconnect_attempts: config.max_reconnect_attempts,
            channel_buffer: DEFAULT_CHANNEL_BUFFER,
            paper: config.paper,
        }
    }
}

impl Default for AlpacaFeedConfig {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            api_secret: String::new(),
            feed: "sip".to_string(),
            reconnect_delay: DEFAULT_RECONNECT_DELAY,
            max_reconnect_attempts: MAX_RECONNECT_ATTEMPTS,
            channel_buffer: DEFAULT_CHANNEL_BUFFER,
            paper: true,
        }
    }
}

impl AlpacaFeedConfig {
    /// Create configuration from environment variables.
    #[must_use]
    pub fn from_env() -> Self {
        let cream_env = std::env::var("CREAM_ENV").unwrap_or_else(|_| "PAPER".to_string());
        let paper = cream_env != "LIVE";

        Self {
            api_key: std::env::var("ALPACA_KEY").unwrap_or_default(),
            api_secret: std::env::var("ALPACA_SECRET").unwrap_or_default(),
            feed: std::env::var("ALPACA_FEED").unwrap_or_else(|_| "sip".to_string()),
            paper,
            ..Default::default()
        }
    }
}

// ============================================================================
// Alpaca Feed
// ============================================================================

/// Alpaca real-time market data feed consumer.
///
/// Connects to Alpaca's WebSocket API and streams market data (trades, quotes, bars)
/// to a channel for processing by the microstructure manager.
///
/// **Architecture:** 100% WebSocket. No HTTP fallback. No polling.
pub struct AlpacaFeed {
    /// Configuration.
    config: AlpacaFeedConfig,
    /// Message sender channel.
    tx: mpsc::Sender<AlpacaMessage>,
    /// Health tracker for monitoring feed quality.
    health_tracker: FeedHealthTracker,
    /// Gap recovery manager for detecting missed messages.
    gap_manager: GapRecoveryManager,
    /// Circuit breaker for connection resilience.
    circuit_breaker: Option<Arc<CircuitBreaker>>,
}

impl AlpacaFeed {
    /// Create a new Alpaca feed.
    ///
    /// # Arguments
    ///
    /// * `config` - Feed configuration
    /// * `tx` - Channel sender for outgoing messages
    #[must_use]
    pub fn new(config: AlpacaFeedConfig, tx: mpsc::Sender<AlpacaMessage>) -> Self {
        let health_tracker = FeedHealthTracker::new("alpaca");
        let gap_manager = GapRecoveryManager::new("alpaca");

        Self {
            config,
            tx,
            health_tracker,
            gap_manager,
            circuit_breaker: None,
        }
    }

    /// Create from environment configuration.
    ///
    /// # Arguments
    ///
    /// * `config` - Alpaca configuration from YAML
    /// * `tx` - Channel sender
    #[must_use]
    pub fn from_config(config: &AlpacaConfig, tx: mpsc::Sender<AlpacaMessage>) -> Self {
        Self::new(AlpacaFeedConfig::from(config), tx)
    }

    /// Set the circuit breaker for connection resilience.
    #[must_use]
    pub fn with_circuit_breaker(mut self, breaker: Arc<CircuitBreaker>) -> Self {
        self.circuit_breaker = Some(breaker);
        self
    }

    /// Get the health tracker for monitoring.
    #[must_use]
    pub const fn health_tracker(&self) -> &FeedHealthTracker {
        &self.health_tracker
    }

    /// Get the gap manager for recovery statistics.
    #[must_use]
    pub const fn gap_manager(&self) -> &GapRecoveryManager {
        &self.gap_manager
    }

    /// Start the feed and begin streaming data.
    ///
    /// This method runs until the feed is disconnected or an unrecoverable
    /// error occurs. It handles automatic reconnection with exponential backoff.
    ///
    /// # Arguments
    ///
    /// * `symbols` - Symbols to subscribe to
    ///
    /// # Errors
    ///
    /// Returns an error if:
    /// - API key is not configured
    /// - Maximum reconnection attempts exceeded
    pub async fn start(mut self, symbols: Vec<String>) -> Result<(), AlpacaError> {
        if self.config.api_key.is_empty() || self.config.api_secret.is_empty() {
            return Err(AlpacaError::MissingApiKey);
        }

        info!(
            feed = %self.config.feed,
            symbols = ?symbols,
            paper = %self.config.paper,
            "Starting Alpaca feed"
        );

        let mut reconnect_attempts = 0;

        loop {
            match self.run_connection(&symbols).await {
                Ok(()) => {
                    info!("Alpaca feed ended normally");
                    break;
                }
                Err(e) => {
                    reconnect_attempts += 1;
                    error!(
                        error = %e,
                        attempt = reconnect_attempts,
                        max_attempts = self.config.max_reconnect_attempts,
                        "Alpaca feed error"
                    );

                    // Send disconnected message
                    let _ = self
                        .tx
                        .send(AlpacaMessage::Disconnected {
                            reason: e.to_string(),
                        })
                        .await;

                    // Record failure in circuit breaker
                    if let Some(ref breaker) = self.circuit_breaker {
                        breaker.record_failure();
                    }

                    if reconnect_attempts >= self.config.max_reconnect_attempts {
                        return Err(AlpacaError::ReconnectionFailed(reconnect_attempts));
                    }

                    // Exponential backoff
                    let delay = self.config.reconnect_delay * 2u32.pow(reconnect_attempts - 1);
                    warn!(delay_secs = delay.as_secs(), "Reconnecting after delay");
                    tokio::time::sleep(delay).await;
                }
            }
        }

        Ok(())
    }

    /// Run a single connection attempt.
    async fn run_connection(&mut self, symbols: &[String]) -> Result<(), AlpacaError> {
        // Check circuit breaker
        if let Some(ref breaker) = self.circuit_breaker {
            if !breaker.is_call_permitted() {
                return Err(AlpacaError::Connection("circuit breaker open".to_string()));
            }
        }

        // Build credentials
        let credentials =
            Credentials::new(self.config.api_key.clone(), self.config.api_secret.clone());

        // Determine environment
        let environment = if self.config.paper {
            Environment::Paper
        } else {
            Environment::Live
        };

        // Build client
        let client = AlpacaWebSocketClient::new(credentials, environment);

        info!("Connecting to Alpaca WebSocket");

        // Subscribe to market data using the builder
        let subscription = SubscriptionBuilder::new()
            .quotes(symbols.iter().map(String::as_str))
            .trades(symbols.iter().map(String::as_str))
            .bars(symbols.iter().map(String::as_str))
            .build();

        let mut stream = client
            .subscribe_market_data(subscription)
            .await
            .map_err(|e| AlpacaError::Subscription(e.to_string()))?;

        info!(symbols = ?symbols, "Subscribed to Alpaca market data");

        // Send connected message
        self.tx
            .send(AlpacaMessage::Connected)
            .await
            .map_err(|_| AlpacaError::ChannelSend)?;

        // Record success in circuit breaker
        if let Some(ref breaker) = self.circuit_breaker {
            breaker.record_success();
        }

        // Process messages - stream forever via WebSocket
        while let Some(update) = stream.next().await {
            match update {
                MarketDataUpdate::Trade { symbol, trade } => {
                    let ts_event = trade.timestamp.timestamp_millis();

                    let msg = AlpacaMessage::Trade {
                        symbol,
                        price: Self::convert_price(trade.price),
                        size: Decimal::from(trade.size),
                        ts_event,
                    };

                    let latency = Self::calculate_latency(ts_event);
                    self.health_tracker.record_message(latency);

                    self.tx
                        .send(msg)
                        .await
                        .map_err(|_| AlpacaError::ChannelSend)?;
                }

                MarketDataUpdate::Quote { symbol, quote } => {
                    let ts_event = quote.timestamp.timestamp_millis();

                    let msg = AlpacaMessage::Quote {
                        symbol,
                        bid: Self::convert_price(quote.bid_price),
                        ask: Self::convert_price(quote.ask_price),
                        bid_size: Decimal::from(quote.bid_size),
                        ask_size: Decimal::from(quote.ask_size),
                        ts_event,
                    };

                    let latency = Self::calculate_latency(ts_event);
                    self.health_tracker.record_message(latency);

                    self.tx
                        .send(msg)
                        .await
                        .map_err(|_| AlpacaError::ChannelSend)?;
                }

                MarketDataUpdate::Bar { symbol, bar } => {
                    let ts_event = bar.timestamp.timestamp_millis();

                    let msg = AlpacaMessage::Bar {
                        symbol,
                        open: Self::convert_price(bar.open),
                        high: Self::convert_price(bar.high),
                        low: Self::convert_price(bar.low),
                        close: Self::convert_price(bar.close),
                        volume: bar.volume,
                        ts_event,
                    };

                    let latency = Self::calculate_latency(ts_event);
                    self.health_tracker.record_message(latency);

                    self.tx
                        .send(msg)
                        .await
                        .map_err(|_| AlpacaError::ChannelSend)?;
                }
            }

            debug!("Processed Alpaca message");
        }

        Ok(())
    }

    /// Convert f64 price to Decimal with appropriate precision.
    fn convert_price(price: f64) -> Decimal {
        // Use from_f64_retain for better precision
        Decimal::try_from(price).unwrap_or_else(|_| Decimal::ZERO)
    }

    /// Calculate latency from event timestamp.
    fn calculate_latency(ts_event_millis: i64) -> Duration {
        let now_millis = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);

        let latency_millis = now_millis.saturating_sub(ts_event_millis);

        // Clamp to reasonable range (0 to 10 seconds)
        #[allow(clippy::cast_sign_loss)]
        Duration::from_millis(latency_millis.clamp(0, 10_000) as u64)
    }
}

// ============================================================================
// Channel Creation Helper
// ============================================================================

/// Create a channel pair for Alpaca feed messages.
///
/// # Arguments
///
/// * `buffer_size` - Size of the channel buffer (default: 10,000)
///
/// # Returns
///
/// A tuple of (sender, receiver) for the message channel.
#[must_use]
pub fn create_alpaca_feed_channel(
    buffer_size: Option<usize>,
) -> (mpsc::Sender<AlpacaMessage>, mpsc::Receiver<AlpacaMessage>) {
    mpsc::channel(buffer_size.unwrap_or(DEFAULT_CHANNEL_BUFFER))
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_convert_price() {
        let price = AlpacaFeed::convert_price(150.50);
        assert_eq!(price.to_string(), "150.5");

        let zero = AlpacaFeed::convert_price(0.0);
        assert_eq!(zero, Decimal::ZERO);
    }

    #[test]
    fn test_config_from_alpaca_config() {
        let config = AlpacaConfig {
            api_key: "test-key".to_string(),
            api_secret: "test-secret".to_string(),
            feed: "sip".to_string(),
            reconnect_delay_ms: 2000,
            max_reconnect_attempts: 3,
            symbols: vec!["AAPL".to_string(), "MSFT".to_string()],
            paper: true,
        };

        let feed_config = AlpacaFeedConfig::from(&config);
        assert_eq!(feed_config.api_key, "test-key");
        assert_eq!(feed_config.api_secret, "test-secret");
        assert_eq!(feed_config.feed, "sip");
        assert_eq!(feed_config.reconnect_delay, Duration::from_millis(2000));
        assert_eq!(feed_config.max_reconnect_attempts, 3);
        assert!(feed_config.paper);
    }

    #[test]
    fn test_default_config() {
        let config = AlpacaFeedConfig::default();
        assert!(config.api_key.is_empty());
        assert!(config.api_secret.is_empty());
        assert_eq!(config.feed, "sip");
        assert_eq!(config.reconnect_delay, DEFAULT_RECONNECT_DELAY);
        assert_eq!(config.max_reconnect_attempts, MAX_RECONNECT_ATTEMPTS);
        assert!(config.paper);
    }

    #[tokio::test]
    async fn test_feed_requires_api_key() {
        let config = AlpacaFeedConfig::default();
        let (tx, _rx) = mpsc::channel(100);
        let feed = AlpacaFeed::new(config, tx);

        let result = feed.start(vec!["AAPL".to_string()]).await;
        assert!(matches!(result, Err(AlpacaError::MissingApiKey)));
    }

    #[test]
    fn test_create_feed_channel() {
        let (tx, _rx) = create_alpaca_feed_channel(Some(100));
        assert!(!tx.is_closed());
    }

    #[test]
    fn test_latency_calculation() {
        let now_millis = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("time")
            .as_millis() as i64;

        // Event 100ms ago
        let event_ts = now_millis - 100;
        let latency = AlpacaFeed::calculate_latency(event_ts);

        // Should be approximately 100ms (allow for test execution time)
        assert!(latency.as_millis() >= 90);
        assert!(latency.as_millis() < 1000);
    }
}
